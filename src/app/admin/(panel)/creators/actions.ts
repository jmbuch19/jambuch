"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { deleteRequestFiles } from "@/lib/creators/files";
import { deleteSample, sampleSettings } from "@/lib/creators/sample";

const now = () => new Date().toISOString();

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
  if (!["creators.pricing", "creators.flow"].includes(key)) return;
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

// Make (or remake) the sample by hand. Jaydeep listens, then sends. (After a ₹499 payment
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

// The ₹499 arrived outside Razorpay (bank transfer, or before online payment is switched on):
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
