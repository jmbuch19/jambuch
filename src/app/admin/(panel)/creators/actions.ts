"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { deleteRequestFiles } from "@/lib/creators/files";
import { deleteSample, makeSample, sampleSettings } from "@/lib/creators/sample";

const now = () => new Date().toISOString();
const DAY = 86400_000;

// Close a request once the studio has answered it, or refuse a borderline one after reading it.
// Closed and refused requests stop counting toward the writer's 3 open requests, and their
// files are deleted at once (brief §6B: cancelled or refused = deleted immediately).
export async function setRequestState(form: FormData) {
  await requireAdmin();
  const state = String(form.get("state") ?? "");
  const id = String(form.get("id") ?? "");
  if (!["closed", "refused"].includes(state)) return;
  const db = adminClient();
  const { data: row } = await db.from("creator_requests").select("id, story_key, sample_key, sample_state").eq("id", id).maybeSingle();
  if (!row) return;
  // A sample already sent stays for the writer until its 7 days are up (the daily job).
  const keepForWriter = row.sample_state === "sent";
  if (!keepForWriter && (row.story_key || row.sample_key)) {
    try {
      await deleteRequestFiles(id);
      if (row.sample_key) await deleteSample(row.sample_key);
    } catch (e) {
      console.error("creators: files not deleted for", id, e instanceof Error ? e.message : e);
    }
  }
  await db
    .from("creator_requests")
    .update({ state, updated_at: now(), ...(keepForWriter ? {} : { story_key: null, sample_key: null, files_delete_at: now(), files_purged_at: now() }) })
    .eq("id", id);
  revalidatePath("/admin/creators");
  revalidatePath(`/admin/creators/${id}`);
}

// A request that waited for Jaydeep (question flow: big screen, screening, Claude budget,
// "let's discuss") goes back to the writer, who continues where they stopped.
export async function letContinue(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const { data: r } = await db
    .from("creator_requests")
    .select("id, state, needs_human_why, answers, plan_version, screening_result, email, name, language")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.state !== "needs_human") return;
  const why = r.needs_human_why ?? "";
  const answers = { ...(r.answers ?? {}) } as Record<string, unknown>;
  const patch: Record<string, unknown> = { needs_human_why: null, updated_at: now() };
  if (why === "big_screen") answers.big_screen_cleared = "yes"; // the stop in questions.ts lets them past
  if (why === "screening") patch.screening_result = "clear";
  if (why === "plan_discuss") patch.plan_rounds = 0;
  patch.answers = answers;
  patch.state = r.plan_version > 0 ? "plan" : "draft";
  // An old-form request (before the question flow) can't continue in the flow.
  if (!why) return;
  await db.from("creator_requests").update(patch).eq("id", id);
  await sendEmail({
    to: r.email,
    subject: r.language === "gu" ? "તમારી વિનંતી આગળ વધી શકે છે · You can continue" : "Creator's Space: you can continue your request",
    text: [
      `Dear ${r.name || "writer"},`,
      "",
      "Thank you for waiting. You can now continue your request where you left off:",
      "https://jambuch.in/creators/start",
      "",
      "Jaydeep Buch",
      "Creator's Space · jambuch.in/creators",
    ].join("\n"),
    replyTo: process.env.ADMIN_EMAIL,
  });
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// The 50% advance has arrived (by hand until Razorpay is set up, brief §2 item 5): the
// order pack is built and stored privately, and the request becomes an order.
export async function advanceReceived(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const { data: r } = await db.from("creator_requests").select("id, state, language, answers, style_tags, quote, plan_version, sample_state").eq("id", id).maybeSingle();
  if (!r || r.state !== "submitted" || r.sample_state !== "sent" || !r.plan_version) return;
  const { data: consents } = await db.from("creator_consents").select("kind, terms_version").eq("request_id", id);
  const version = (k: string) => consents?.find((c) => c.kind === k)?.terms_version ?? "";
  const { readDraft, savePack } = await import("@/lib/creators/files");
  const { orderPack } = await import("@/lib/creators/flow");
  const pack = orderPack(r, await readDraft(id), {
    terms_version: version("terms_refund"),
    data_consent_version: version("data_processing"),
    own_voice: !!consents?.some((c) => c.kind === "own_voice"),
  });
  const key = await savePack(id, pack);
  // The 7-day sample clock stops: the files are now needed for production.
  await db.from("creator_requests").update({ state: "ordered", order_pack_key: key, files_delete_at: null, updated_at: now() }).eq("id", id);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// Pricing and flow settings, edited as JSON (every number of the pricing engine, brief §5).
export async function saveJsonSetting(form: FormData) {
  await requireAdmin();
  const key = String(form.get("key") ?? "");
  if (!["creators.pricing", "creators.flow"].includes(key)) return;
  let value: unknown;
  try {
    value = JSON.parse(String(form.get("value") ?? ""));
  } catch {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  await adminClient().from("settings").upsert({ key, value, updated_at: now() });
  revalidatePath("/admin/creators", "layout");
}

export type MakeState = { status: "idle" | "error" | "done"; message?: string };

// Make (or remake) the free audio sample. Jaydeep listens before it goes to the writer.
export async function makeSampleAction(_prev: MakeState, form: FormData): Promise<MakeState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const s = await sampleSettings();
  if (!s.enabled) return { status: "error", message: "Samples are switched off in the settings." };
  if (!s.voice_id) return { status: "error", message: "Choose a voice first (Sample settings, below)." };

  const { count } = await db
    .from("creator_requests")
    .select("id", { count: "exact", head: true })
    .gte("sample_made_at", new Date(Date.now() - DAY).toISOString());
  if ((count ?? 0) >= s.daily_cap) {
    return { status: "error", message: `The daily cap of ${s.daily_cap} samples is reached. Try again tomorrow, or raise it in the settings.` };
  }

  const { data: row } = await db
    .from("creator_requests")
    .select("id, state, language, style_tags, story_key, sample_key, sample_state, sample_cost")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { status: "error", message: "Request not found." };
  if (!row.story_key) return { status: "error", message: "This request has no stored story (sent before stories were stored, or already deleted)." };
  if (row.state !== "submitted") return { status: "error", message: `The request is “${row.state}”; only submitted requests get a sample.` };
  if (row.sample_state === "making") return { status: "error", message: "A sample is already being made. Wait a minute and reload." };

  await db.from("creator_requests").update({ sample_state: "making", sample_error: null, updated_at: now() }).eq("id", id);
  const n = Number((row.sample_cost as Record<string, unknown>)?.attempt ?? 0) + 1;
  try {
    const made = await makeSample({ id, language: row.language, style_tags: row.style_tags ?? [] }, n);
    if (row.sample_key && row.sample_key !== made.key) await deleteSample(row.sample_key).catch(() => {});
    await db
      .from("creator_requests")
      .update({
        sample_state: "review",
        sample_key: made.key,
        sample_credits: made.credits,
        sample_cost: { ...made.cost, attempt: n, mood: made.plan.mood },
        sample_made_at: now(),
        updated_at: now(),
      })
      .eq("id", id);
    revalidatePath(`/admin/creators/${id}`);
    return { status: "done", message: "The sample is ready. Listen below." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("creators: sample failed for", id, message);
    await db
      .from("creator_requests")
      .update({ sample_state: "failed", sample_error: message.slice(0, 500), sample_made_at: now(), sample_cost: { attempt: n }, updated_at: now() })
      .eq("id", id);
    revalidatePath(`/admin/creators/${id}`);
    return { status: "error", message };
  }
}

// Approve: the writer is told the sample is ready (they listen signed in; no file in email).
// The 7-day clock for the request's files starts now (brief §6B).
export async function sendSampleAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const { data: row } = await db.from("creator_requests").select("id, name, email, language, sample_state").eq("id", id).maybeSingle();
  if (!row || row.sample_state !== "review") return;

  const deleteAt = new Date(Date.now() + 7 * DAY);
  const when = deleteAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const gu = row.language === "gu";
  const sent = await sendEmail({
    to: row.email,
    subject: gu ? "તમારી વાર્તાનો નમૂનો તૈયાર છે · Your sample is ready" : "Your Creator's Space sample is ready",
    text: [
      `Dear ${row.name},`,
      "",
      gu ? "તમારી વાર્તાનો 30–60 સેકન્ડનો મફત નમૂનો તૈયાર છે." : "",
      "Your free 30–60 second sample is ready.",
      "",
      "Listen here (sign in with the same email; we send a short code):",
      "https://jambuch.in/creators/start",
      "",
      `The sample and your story are deleted on ${when}, 7 days from today. Please download a copy if you want to keep it.`,
      "",
      "If you'd like the full story made, reply to this email.",
      "",
      "Jaydeep Buch",
      "Creator's Space · jambuch.in/creators",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n"),
    replyTo: process.env.ADMIN_EMAIL,
  });
  if (!sent) {
    console.error("creators: sample email not sent for", id);
    return;
  }
  await db
    .from("creator_requests")
    .update({ sample_state: "sent", sample_sent_at: now(), files_delete_at: deleteAt.toISOString(), updated_at: now() })
    .eq("id", id);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// Sample settings: the voice, the model, the daily cap, on/off.
export async function saveSampleSettings(form: FormData) {
  await requireAdmin();
  const s = await sampleSettings();
  const voice = String(form.get("voice_id") ?? "").trim();
  const model = String(form.get("model_id") ?? "").trim();
  const cap = Number(form.get("daily_cap"));
  const value = {
    ...s,
    voice_id: /^[A-Za-z0-9]{10,40}$/.test(voice) ? voice : s.voice_id,
    model_id: /^[a-z0-9_]{3,60}$/.test(model) ? model : s.model_id,
    daily_cap: Number.isInteger(cap) && cap >= 0 && cap <= 50 ? cap : s.daily_cap,
    enabled: form.get("enabled") === "on",
  };
  await adminClient().from("settings").upsert({ key: "creators.sample", value, updated_at: now() });
  revalidatePath("/admin/creators", "layout");
}
