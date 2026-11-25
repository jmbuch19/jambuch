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

// One-click refund (Jaydeep, 25 Nov 2026). The amount is checked against what is left on the
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

// One free remake when the sample missed the approved plan (max one per request).
export async function freeRemakeAction(_prev: MakeState, form: FormData): Promise<MakeState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const db = adminClient();
  const { data: r } = await db.from("creator_requests").select("sample_remakes").eq("id", id).maybeSingle();
  if (!r) return { status: "error", message: "Request not found." };
  if (r.sample_remakes >= 1) return { status: "error", message: "The free remake has already been given." };
  await db.from("creator_requests").update({ sample_remakes: r.sample_remakes + 1, sample_state: "review", updated_at: now() }).eq("id", id);
  const { runSampleJob } = await import("@/lib/creators/sample-job");
  const out = await runSampleJob(id, "manual", { fresh: true });
  revalidatePath(`/admin/creators/${id}`);
  return out.status === "review" ? { status: "done", message: `Remade from scratch (free remake used). ${out.message} Listen, then send it.` } : { status: "error", message: out.message };
}
