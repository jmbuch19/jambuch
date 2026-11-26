import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { SAMPLE_LANGS, SampleStopped, clearStop, deleteSample, makeSample, sampleSettings, voiceFor, type SampleLang } from "./sample";
import { flowSettings } from "./flow";
import { STUDIO_FROM, STUDIO_SIGNATURE, studioReplyTo, alertTo } from "./team";

// The paid sample, end to end without a person (owner's decision, 25 Nov 2026):
//   ₹499 paid → make → automatic quality check → sent to the writer.
// A failed check makes it once more; a second failure (or no voice chosen, samples off,
// the daily cap) waits for the reviewer, and the writer is told it is taking a little longer.

const now = () => new Date().toISOString();
const DAY = 86400_000;
const MAX_ATTEMPTS = 2;
// Paid voice generations allowed per request (first make, one retry after a real voice fault,
// one free remake). Saved results make most retries free; past this, a person decides.
const MAX_PAID_VOICES = 3;

export type JobResult = { status: "sent" | "review" | "waiting" | "skipped" | "failed"; message: string };

// mode "auto": after payment, sends on a pass. mode "manual": the admin's button, leaves it
// for him to listen and send.
export async function runSampleJob(id: string, mode: "auto" | "manual", opts: { fresh?: boolean } = {}): Promise<JobResult> {
  const db = adminClient();
  const s = await sampleSettings();
  const { data: row } = await db
    .from("creator_requests")
    .select("id, state, name, email, language, style_tags, story_key, sample_key, sample_state, sample_cost")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { status: "skipped", message: "Request not found." };
  if (row.state !== "submitted") return { status: "skipped", message: `The request is “${row.state}”; a sample is made only after the ₹499 is paid.` };
  if (!row.story_key) return { status: "skipped", message: "This request has no stored story." };
  if (row.sample_state === "making") return { status: "skipped", message: "A sample is already being made." };
  if (mode === "auto" && (row.sample_state === "sent" || row.sample_state === "review")) return { status: "skipped", message: "Already made." };

  const wait = async (why: string, message: string): Promise<JobResult> => {
    if (mode === "manual") return { status: "failed", message };
    await db.from("creator_requests").update({ needs_human_why: why, updated_at: now() }).eq("id", id);
    await mailStudio(`Creator's Space: sample for ${row.name || row.email} waits for you (${why.replace(/_/g, " ")})`, [message, "", `https://jambuch.in/admin/creators/${id}`]);
    return { status: "waiting", message };
  };
  if (!s.enabled) return wait("samples_off", "Samples are switched off in the settings.");
  if (!voiceFor(s, row.language)) {
    return wait("no_voice", `No ${SAMPLE_LANGS[row.language as SampleLang] ?? row.language} narrator voice is chosen in the sample settings. A story is only read by a voice of its own language.`);
  }

  const { count } = await db
    .from("creator_requests")
    .select("id", { count: "exact", head: true })
    .gte("sample_made_at", new Date(Date.now() - DAY).toISOString());
  if ((count ?? 0) >= s.daily_cap) {
    // Not an error: the daily job tries again tomorrow.
    return { status: "waiting", message: `The daily cap of ${s.daily_cap} samples is reached; it will be made tomorrow.` };
  }

  const prevCost = (row.sample_cost as Record<string, unknown> | null) ?? {};
  let paidVoices = Number(prevCost.voice_paid_total ?? 0);
  if (paidVoices >= MAX_PAID_VOICES) return wait("cost_cap", `This sample has already paid for ${paidVoices} voice recordings; check it before spending more.`);

  const prevState = row.sample_state as string | null;
  const hadSent = prevState === "sent" && !!row.sample_key;
  await clearStop(id);
  await db.from("creator_requests").update({ sample_state: "making", sample_error: null, updated_at: now() }).eq("id", id);
  let attempt = Number(prevCost.attempt ?? 0);
  let lastKey = row.sample_key as string | null;
  let forceNext = false; // a new voice only after a words-heard failure; a crash retry reuses the saved one

  for (let tries = 0; tries < (mode === "auto" ? MAX_ATTEMPTS : 1); tries++) {
    attempt++;
    try {
      const made = await makeSample({ id, language: row.language, style_tags: row.style_tags ?? [] }, attempt, { fresh: !!opts.fresh && tries === 0, forceVoice: forceNext });
      paidVoices += Number(made.cost.voice_paid ?? 0);
      // A sent sample's file stays until the request's files are deleted (the writer may still have it open).
      if (lastKey && lastKey !== made.key && !hadSent) await deleteSample(lastKey).catch(() => {});
      lastKey = made.key;
      await db
        .from("creator_requests")
        .update({
          sample_state: "review",
          sample_key: made.key,
          sample_credits: made.credits,
          sample_cost: { ...made.cost, attempt, mood: made.plan.mood, voice_paid_total: paidVoices },
          sample_qc: made.qc,
          sample_made_at: now(),
          sample_error: made.qc.pass ? null : `Quality check: ${made.qc.problems.join("; ")}`,
          updated_at: now(),
        })
        .eq("id", id);
      if (mode === "manual") return { status: "review", message: made.qc.pass ? "Made and passed the check. Listen below." : `Made, but the check found: ${made.qc.problems.join("; ")}.` };
      if (made.qc.pass) {
        const sent = await sendSample(id);
        return sent ? { status: "sent", message: "Made, checked and sent." } : { status: "review", message: "Made and checked, but the email to the writer failed." };
      }
      // Only a voice fault (words not heard) is worth a second try, with a new recording;
      // length or loudness would come out the same, so a person looks instead.
      if (!made.qc.problems.some((p) => /of the words heard/.test(p))) break;
      forceNext = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const stopped = e instanceof SampleStopped;
      console.error("creators: sample attempt", stopped ? "stopped" : "failed", "for", id, message);
      // A remake that stops or fails gives the writer's sent sample back; a first sample that is
      // stopped goes back to "not made".
      await db
        .from("creator_requests")
        .update({
          sample_state: hadSent ? "sent" : stopped ? (prevState === "making" ? null : prevState) : "failed",
          sample_error: message.slice(0, 500),
          sample_cost: { ...((row.sample_cost as Record<string, unknown> | null) ?? {}), attempt, voice_paid_total: paidVoices },
          updated_at: now(),
        })
        .eq("id", id);
      await clearStop(id);
      if (stopped || mode === "manual") return { status: "failed", message };
    }
  }
  // Two automatic attempts did not pass.
  await sendEmail({
    to: row.email,
    subject: "Creator's Space: your sample is taking a little longer",
    text: [`Dear ${row.name || "writer"},`, "", "Your sample needs a little more care before it reaches you. We'll email you as soon as it is ready, usually within two working days.", "", ...STUDIO_SIGNATURE].join("\n"),
    replyTo: studioReplyTo(),
      from: STUDIO_FROM,
  });
  return wait("sample_qc", "The sample did not pass the automatic check after two attempts. Listen, then make it again or send it.");
}

// The writer is told the sample is ready (they listen signed in; no file in email). The
// 7-day clock for the request's files starts now (brief §6B).
export async function sendSample(id: string) {
  const db = adminClient();
  const { data: row } = await db.from("creator_requests").select("id, name, email, language, sample_state, quote").eq("id", id).maybeSingle();
  if (!row || row.sample_state !== "review") return false;
  const deleteAt = new Date(Date.now() + 7 * DAY);
  const when = deleteAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const gu = row.language === "gu";
  const payOnline = (await flowSettings()).payments_enabled && !!process.env.RAZORPAY_KEY_ID;
  const advance = (row.quote as { advance?: number } | null)?.advance;
  const fee = (row.quote as { sample?: number } | null)?.sample ?? 499;
  const sent = await sendEmail({
    to: row.email,
    subject: gu ? "તમારી વાર્તાનો નમૂનો તૈયાર છે · Your sample is ready" : "Your Creator's Space sample is ready",
    text: [
      `Dear ${row.name},`,
      "",
      gu ? "તમારી વાર્તાનો 30–60 સેકન્ડનો નમૂનો તૈયાર છે." : "",
      "Your 30–60 second sample is ready.",
      "",
      "Listen here (sign in with the same email; we send a short code):",
      "https://jambuch.in/creators/start",
      "",
      `The sample and your story are deleted on ${when}, 7 days from today. Please download a copy if you want to keep it.`,
      "",
      payOnline
        ? `To go ahead, sign in at the same page and pay the advance${advance ? ` (₹${advance.toLocaleString("en-IN")}; your ₹${fee} is already counted)` : ""}. If you have questions first, reply to this email.`
        : "If you'd like the full story made, reply to this email.",
      "",
      ...STUDIO_SIGNATURE,
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n"),
    replyTo: studioReplyTo(),
      from: STUDIO_FROM,
  });
  if (!sent) {
    console.error("creators: sample email not sent for", id);
    return false;
  }
  await db
    .from("creator_requests")
    .update({ sample_state: "sent", sample_sent_at: now(), files_delete_at: deleteAt.toISOString(), needs_human_why: null, updated_at: now() })
    .eq("id", id);
  return true;
}

async function mailStudio(subject: string, lines: string[]) {
  const to = await alertTo("reviewer");
  if (to) await sendEmail({ to, subject, text: lines.join("\n") });
}

// Starts the sample in its own long-running function (FFmpeg ships only with that route),
// returning at once. Used after payment and by the daily job.
export async function triggerSampleJob(id: string) {
  const secret = process.env.CRON_SECRET;
  // Production calls its own public address; previews call themselves.
  const base = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_URL ? "https://jambuch.in" : `https://${process.env.VERCEL_URL}`;
  if (!secret) {
    console.error("creators: CRON_SECRET missing; sample job not started for", id);
    return false;
  }
  try {
    const res = await fetch(`${base}/api/creators/sample-job`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch (e) {
    console.error("creators: sample job trigger failed for", id, e instanceof Error ? e.message : e);
    return false;
  }
}
