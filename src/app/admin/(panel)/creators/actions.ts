"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { deleteRequestFiles } from "@/lib/creators/files";
import { deleteSample, sampleSettings } from "@/lib/creators/sample";
import { STUDIO_FROM, STUDIO_SIGNATURE, studioReplyTo } from "@/lib/creators/team";

const now = () => new Date().toISOString();

// Close a request once the studio has answered it, or refuse a borderline one after reading it.
// Closed and refused requests stop counting toward the writer's 3 open requests, and their
// files are deleted at once (brief §6B: cancelled or refused = deleted immediately).
export async function setRequestState(form: FormData) {
  await requireAdmin();
  const state = String(form.get("state") ?? "");
  const id = String(form.get("id") ?? "");
  console.log("admin: set request", id, "to", state || "(no state sent)");
  if (!["closed", "refused"].includes(state)) return;
  const db = adminClient();
  const { data: row } = await db.from("creator_requests").select("id, story_key, sample_key, sample_state").eq("id", id).maybeSingle();
  if (!row) {
    console.error("admin: request not found", id);
    return;
  }
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
  const { error } = await db
    .from("creator_requests")
    .update({ state, updated_at: now(), ...(keepForWriter ? {} : { story_key: null, sample_key: null, files_delete_at: now(), files_purged_at: now() }) })
    .eq("id", id);
  if (error) console.error("admin: request not updated", id, error.message);
  revalidatePath("/admin/creators");
  revalidatePath(`/admin/creators/${id}`);
}

// A request that waited for the reviewer (question flow: big screen, screening, Claude budget,
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
      ...STUDIO_SIGNATURE,
    ].join("\n"),
    replyTo: studioReplyTo(),
      from: STUDIO_FROM,
  });
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// The 50% advance arrived outside Razorpay (bank transfer, or before payments are switched
// on): the order pack is built and the request becomes an order, as after a Razorpay payment.
export async function advanceReceived(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { buildOrder } = await import("@/lib/creators/orders");
  await buildOrder(id);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// Pricing and flow settings, edited as JSON (every number of the pricing engine, brief §5).
export async function saveJsonSetting(form: FormData) {
  await requireAdmin();
  const key = String(form.get("key") ?? "");
  if (!["creators.pricing", "creators.flow", "creators.legal"].includes(key)) return;
  let value: unknown;
  try {
    value = JSON.parse(String(form.get("value") ?? ""));
  } catch {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  // Pricing: retired fixed-rupee keys (inr_per_usd etc.) are dropped on save.
  if (key === "creators.pricing") {
    const { storedPricing } = await import("@/lib/creators/pricing");
    value = storedPricing(value);
  }
  await adminClient().from("settings").upsert({ key, value, updated_at: now() });
  revalidatePath("/admin/creators", "layout");
}

export type MakeState = { status: "idle" | "error" | "done"; message?: string };

// Make (or remake) the sample by hand. The reviewer listens, then sends. (After a sample-fee payment
// the same thing runs by itself and sends on a pass: src/lib/creators/sample-job.ts.)
export async function makeSampleAction(_prev: MakeState, form: FormData): Promise<MakeState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { runSampleJob } = await import("@/lib/creators/sample-job");
  const r = await runSampleJob(id, "manual");
  revalidatePath(`/admin/creators/${id}`);
  return r.status === "review" ? { status: "done", message: r.message } : { status: "error", message: r.message };
}

// Approve: the writer is told the sample is ready; the 7-day clock starts.
export async function sendSampleAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { sendSample } = await import("@/lib/creators/sample-job");
  await sendSample(id);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// The sample fee arrived outside Razorpay (bank transfer, or before online payment is switched on):
// the sample is made, checked and sent automatically, as after an online payment.
export async function sampleFeeReceivedAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { sampleFeeReceived } = await import("@/lib/creators/orders");
  await sampleFeeReceived(id);
  revalidatePath(`/admin/creators/${id}`);
  revalidatePath("/admin/creators");
}

// Sample settings: the voice, the model, the daily cap, on/off.
export async function saveSampleSettings(form: FormData) {
  await requireAdmin();
  const s = await sampleSettings();
  const cap = Number(form.get("daily_cap"));
  const { DEFAULT_MODEL } = await import("@/lib/creators/sample");
  const voices: Record<string, { voice_id: string; model_id: string }> = { ...(s.voices ?? {}) };
  for (const l of ["gu", "hi", "en"] as const) {
    const v = String(form.get(`voice_${l}`) ?? "").trim();
    const m = String(form.get(`model_${l}`) ?? "").trim();
    if (v === "") delete voices[l];
    else if (/^[A-Za-z0-9]{10,40}$/.test(v)) voices[l] = { voice_id: v, model_id: /^[a-z0-9_]{3,60}$/.test(m) ? m : DEFAULT_MODEL[l] };
  }
  const value = {
    ...s,
    voices,
    // The old single voice was used for every language; from now on it is English only.
    voice_id: voices.en?.voice_id ?? "",
    model_id: voices.en?.model_id ?? s.model_id,
    daily_cap: Number.isInteger(cap) && cap >= 0 && cap <= 50 ? cap : s.daily_cap,
    enabled: form.get("enabled") === "on",
  };
  await adminClient().from("settings").upsert({ key: "creators.sample", value, updated_at: now() });
  revalidatePath("/admin/creators", "layout");
}

// One-click refund (owner's decision, 25 Nov 2026). The amount is checked against what is left on the
// payment; one refund at a time per payment; the writer is emailed.
export type RefundState = { status: "idle" | "error" | "done"; message?: string };
export async function refundAction(_prev: RefundState, form: FormData): Promise<RefundState> {
  await requireAdmin();
  const paymentRowId = Number(form.get("payment_id"));
  const requestId = String(form.get("request_id") ?? "");
  const rupees = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  const reason = String(form.get("reason") ?? "") as import("@/lib/creators/refunds").RefundReason;
  const REASONS = ["sample_not_delivered", "duplicate_payment", "our_mistake", "goodwill", "dispute_settled", "other"];
  if (form.get("confirm") !== "yes") return { status: "error", message: "Tick the box to confirm the amount." };
  if (!REASONS.includes(reason)) return { status: "error", message: "Choose a reason." };
  const { refund } = await import("@/lib/creators/refunds");
  const out = await refund({ paymentRowId, amountPaise: Math.round(rupees * 100), reason, note: String(form.get("note") ?? ""), by: "admin" });
  revalidatePath(`/admin/creators/${requestId}`);
  return { status: out.ok ? "done" : "error", message: out.message };
}

// Stop a sample being made: it halts before its next step (nothing more is spent after it).
export async function stopSampleAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { requestStop } = await import("@/lib/creators/sample");
  await requestStop(id);
}

// One free remake when the sample missed the approved plan (max one per request).
export async function freeRemakeAction(_prev: MakeState, form: FormData): Promise<MakeState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const { data: r } = await db.from("creator_requests").select("sample_remakes").eq("id", id).maybeSingle();
  if (!r) return { status: "error", message: "Request not found." };
  if (r.sample_remakes >= 1) return { status: "error", message: "The free remake has already been given." };
  const { runSampleJob } = await import("@/lib/creators/sample-job");
  const out = await runSampleJob(id, "manual", { fresh: true });
  // Counted as used only when a new sample was actually made.
  if (out.status === "review") await db.from("creator_requests").update({ sample_remakes: r.sample_remakes + 1 }).eq("id", id);
  revalidatePath(`/admin/creators/${id}`);
  return out.status === "review" ? { status: "done", message: `Remade from scratch (free remake used). ${out.message} Listen, then send it.` } : { status: "error", message: out.message };
}

// Title and author for the sample's opening (kept in the private draft). Requests made before
// these fields existed get them here.
export async function saveTitleAuthorAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const { readDraft, saveDraft } = await import("@/lib/creators/files");
  const { cleanText } = await import("@/lib/creators/firewall");
  const d = await readDraft(id);
  const title = cleanText(form.get("title"), 200).text;
  const author = cleanText(form.get("author"), 200).text;
  if (title) d.text.title = title;
  else delete d.text.title;
  if (author) d.text.author = author;
  else delete d.text.author;
  await saveDraft(id, d);
  revalidatePath(`/admin/creators/${id}`);
}

// ---------------------------------------------------------------- the team and directed orders
// Roles, not names (owner's decision, 26 Nov 2026): src/lib/creators/team.ts.

const ROLES = ["admin", "director", "reviewer"] as const;

// Add or change a team member. Nobody can be assigned work before the confidentiality
// agreement date is set. One reviewer is on duty at a time.
export async function saveTeamMember(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const roles = ROLES.filter((r) => form.get(`role_${r}`) === "on");
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(form.get(k) ?? "")) ? String(form.get(k)) : null);
  const row = {
    name,
    email,
    roles,
    on_duty: form.get("on_duty") === "on" && roles.includes("reviewer"),
    hourly_inr: Math.max(0, Math.min(100000, Math.round(Number(form.get("hourly_inr")) || 1000))),
    directing_since: date("directing_since"),
    confidentiality_signed: date("confidentiality_signed"),
    active: form.get("active") === "on",
    updated_at: now(),
  };
  const db = adminClient();
  if (row.on_duty) await db.from("creator_team").update({ on_duty: false }).neq("id", id || "00000000-0000-0000-0000-000000000000");
  const { error } = id ? await db.from("creator_team").update(row).eq("id", id) : await db.from("creator_team").insert(row);
  if (error) console.error("admin: team member not saved:", error.message);
  revalidatePath("/admin/creators/team");
}

// Assign (or change) the director of a directed order; only cleared directors.
export async function assignDirectorAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const director = String(form.get("director_id") ?? "");
  const { teamMembers, cleared } = await import("@/lib/creators/team");
  const m = (await teamMembers()).find((x) => x.id === director);
  const db = adminClient();
  if (!director) await db.from("creator_requests").update({ director_id: null, director_assigned_at: null, updated_at: now() }).eq("id", id);
  else if (m && cleared(m) && m.roles.includes("director"))
    await db.from("creator_requests").update({ director_id: m.id, director_assigned_at: now(), updated_at: now() }).eq("id", id);
  revalidatePath(`/admin/creators/${id}`);
}

// The director's actual hours on an order (compared with the hours in the price).
export async function logDirectorHours(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const hours = Number(form.get("hours"));
  if (!Number.isFinite(hours) || hours < 0 || hours > 500) return;
  await adminClient().from("creator_requests").update({ director_hours: Math.round(hours * 100) / 100, updated_at: now() }).eq("id", id);
  revalidatePath(`/admin/creators/${id}`);
}

// The director's sample, exported from their PC to creators/<id>/directed/, becomes the
// request's sample, ready to check and send (the same "Approve and send" as the studio's).
export async function useDirectedSample(form: FormData) {
  const { user } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const key = String(form.get("key") ?? "");
  if (!key.startsWith(`creators/${id}/directed/`) || !key.endsWith(".mp3")) return;
  const db = adminClient();
  const { data: r } = await db.from("creator_requests").select("sample_state").eq("id", id).maybeSingle();
  if (!r || r.sample_state === "sent" || r.sample_state === "making") return;
  await db
    .from("creator_requests")
    .update({ sample_key: key, sample_state: "review", sample_made_at: now(), sample_error: null, sample_qc: null, updated_at: now() })
    .eq("id", id);
  const { logStoryAccess } = await import("@/lib/creators/team");
  await logStoryAccess(id, user.email, "director", "directed sample registered");
  revalidatePath(`/admin/creators/${id}`);
}
