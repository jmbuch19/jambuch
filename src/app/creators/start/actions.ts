"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { passesTurnstile } from "@/lib/turnstile";
import { makeLink, linkValid } from "@/lib/signed-links";
import { sessionClient } from "@/lib/supabase-server";
import { adminClient } from "@/lib/supabase-admin";
import { claudeReady, followUps, isStyleTopic, screenStory, styleTags, type FollowUp } from "@/lib/creators/claude";
import { LANGUAGES, LENGTHS, MAKES } from "../options";
import { LIMITS, OPEN_STATES } from "./limits";

// Creator's Space, signed-in sample requests (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards").
// Order of work, and why:
//   1. sign-in by emailed code            — no Claude call for anyone who isn't signed in
//   2. Turnstile + per-account limits      — before anything costs money
//   3. screening (cheap model)             — before any other Claude call
//   4. follow-up questions                 — only for a story that screened clear
//   5. style answers → vocabulary tags     — the writer's words never reach a generation prompt
// The story and answers are never stored: they are sent back with step 2 and checked
// against the fingerprint taken at step 1.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORY_MIN = 200;
const STORY_MAX = 20_000;
const ANSWER_MAX = 600;

const pick = <T extends Record<string, string>>(map: T, v: string, fallback: keyof T): keyof T =>
  (Object.keys(map) as (keyof T)[]).includes(v as keyof T) ? (v as keyof T) : fallback;
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const questionsVersion = (storyHash: string, questions: FollowUp[]) => sha256(`${storyHash}:${JSON.stringify(questions)}`);

async function signedInUser() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user?.email ? { id: user.id, email: user.email.toLowerCase() } : null;
}

// ---------------------------------------------------------------- sign-in

export type SignInState = { status: "idle" | "code" | "error"; email?: string; message?: string };

export async function sendCode(prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: "Please enter a valid email address." };
  if (!(await passesTurnstile(String(form.get("cf-turnstile-response") ?? ""), "creator-signin"))) {
    return { status: "error", email, message: "The spam check didn’t go through. Please try again." };
  }
  const origin = (await headers()).get("origin") ?? "https://jambuch.in";
  const { error } = await (await sessionClient()).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?next=/creators/start` },
  });
  if (error) {
    console.error("creators sign-in email failed:", error.message);
    return { status: "error", email, message: "The email couldn’t be sent. Please wait a minute and try again." };
  }
  return { status: "code", email };
}

export async function verifyCode(prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!EMAIL.test(email) || !/^\d{6,10}$/.test(token)) {
    return { status: "code", email, message: "Please type the number from the email." };
  }
  const { error } = await (await sessionClient()).auth.verifyOtp({ email, token, type: "email" });
  if (error) return { status: "code", email, message: "That code didn’t work. Check the latest email, or send a new one." };
  revalidatePath("/creators/start");
  return { status: "idle" };
}

export async function signOutWriter() {
  await (await sessionClient()).auth.signOut();
  revalidatePath("/creators/start");
}

// ---------------------------------------------------------------- step 1: story → screening → questions

export type StartState =
  | { status: "idle" | "error"; message?: string }
  | { status: "questions"; requestId: string; sig: string; questions: FollowUp[] }
  | { status: "needs_human" | "refused"; message: string };

export async function startRequest(_prev: StartState, form: FormData): Promise<StartState> {
  const user = await signedInUser();
  if (!user) return { status: "error", message: "Please sign in again." };
  const str = (k: string) => String(form.get(k) ?? "").trim();

  const name = str("name").slice(0, 200);
  const whatsapp = str("whatsapp").replace(/[^\d+ ]/g, "").slice(0, 20);
  const about = str("about");
  const story = str("story");
  const language = pick(LANGUAGES, str("language"), "gu");
  const make = pick(MAKES, str("make"), "unsure");
  const length = pick(LENGTHS, str("length"), "medium");

  if (!name) return { status: "error", message: "Please tell us your name." };
  if (about.length > 1500) return { status: "error", message: "Please keep the note under 1,500 characters." };
  if (story.length < STORY_MIN) return { status: "error", message: "Please paste at least a few paragraphs of the story." };
  if (story.length > STORY_MAX) {
    return { status: "error", message: "Please paste up to 20,000 characters (the opening is enough for a sample)." };
  }
  if (!claudeReady()) return { status: "error", message: "Requests are paused for a short while. Please try again later." };

  if (!(await passesTurnstile(str("cf-turnstile-response"), "creator"))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  const db = adminClient();
  // Requests left half-way for two days stop counting as open.
  const stale = new Date(Date.now() - 2 * 86400_000).toISOString();
  await db
    .from("creator_requests")
    .update({ state: "withdrawn", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("state", ["screening", "questions"])
    .lt("created_at", stale);

  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [open, today] = await Promise.all([
    db.from("creator_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("state", OPEN_STATES),
    db.from("creator_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", dayAgo),
  ]);
  if (open.error || today.error) return { status: "error", message: "Something went wrong on our side. Please try again." };
  if ((open.count ?? 0) >= LIMITS.open) {
    return { status: "error", message: `You already have ${LIMITS.open} requests open. Withdraw one, or wait for our reply.` };
  }
  if ((today.count ?? 0) >= LIMITS.perDay) {
    return { status: "error", message: `You can send ${LIMITS.perDay} new requests a day. Please try again tomorrow.` };
  }

  // The row goes in before Claude is called, so a failed or abandoned attempt still counts.
  const storyHash = sha256(story);
  const { data: row, error } = await db
    .from("creator_requests")
    .insert({
      user_id: user.id,
      email: user.email,
      name,
      whatsapp: whatsapp || null,
      language,
      make,
      length,
      story_sha256: storyHash,
      story_chars: story.length,
    })
    .select("id")
    .single();
  if (error || !row) return { status: "error", message: "Something went wrong on our side. Please try again." };

  const fail = async (message: string): Promise<StartState> => {
    await db.from("creator_requests").update({ state: "withdrawn", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { status: "error", message };
  };

  let screening;
  try {
    screening = await screenStory(story, about);
  } catch (e) {
    console.error("creators screening failed:", e instanceof Error ? e.message : e);
    return fail("We couldn’t read the story just now. Please try again in a little while.");
  }

  const state = screening.result === "clear" ? "questions" : screening.result;
  await db
    .from("creator_requests")
    .update({
      state,
      screening_result: screening.result,
      screening_categories: screening.categories,
      screening_reason: screening.reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (screening.result === "refused") {
    return {
      status: "refused",
      message:
        (screening.reason || "This story falls outside what we can make.") +
        " Our content guidelines are on the Creator’s Space page. Nothing has been charged.",
    };
  }
  if (screening.result === "needs_human") {
    await mailStudio({
      subject: `Creator's Space: request from ${name} needs your eye`,
      lines: [
        `${name} <${user.email}> sent a story that the automatic check could not clear.`,
        `Request ${row.id}`,
        `Check: ${screening.categories.join(", ") || "no answer from the checker"}${screening.reason ? ` — ${screening.reason}` : ""}`,
        "",
        ...details({ whatsapp, language, make, length }),
        "",
        "Note from the writer:",
        about || "(none)",
        "",
        "Story:",
        story,
        "",
        "No questions were asked and nothing was made. Reply to this email to answer the writer, then close the request in admin.",
      ],
      replyTo: user.email,
    });
    return {
      status: "needs_human",
      message: "Thank you. Before we go further, a person at the studio will read your story. We’ll write to you by email, usually within two working days.",
    };
  }

  let questions: FollowUp[] | null = null;
  try {
    questions = await followUps(story, about, language);
  } catch (e) {
    console.error("creators follow-ups failed:", e instanceof Error ? e.message : e);
  }
  if (!questions) return fail("We couldn’t prepare the questions just now. Please try again in a little while.");

  return { status: "questions", requestId: row.id, sig: makeLink("creator-questions", row.id, questionsVersion(storyHash, questions)), questions };
}

// ---------------------------------------------------------------- step 2: answers → tags → studio

export type FinishState = { status: "idle" | "error" | "sent"; message?: string };

export async function finishRequest(_prev: FinishState, form: FormData): Promise<FinishState> {
  const user = await signedInUser();
  if (!user) return { status: "error", message: "Please sign in again." };
  const str = (k: string) => String(form.get(k) ?? "").trim();

  const requestId = str("requestId");
  const story = str("story");
  const about = str("about");
  let questions: FollowUp[];
  try {
    questions = JSON.parse(str("questions")) as FollowUp[];
    if (!Array.isArray(questions)) throw new Error("not a list");
  } catch {
    return { status: "error", message: "Something went wrong. Please start again." };
  }

  const db = adminClient();
  const { data: row } = await db
    .from("creator_requests")
    .select("id, user_id, state, name, whatsapp, language, make, length, story_sha256, screening_result")
    .eq("id", requestId)
    .maybeSingle();
  // The same writer, the same story, and exactly the questions we asked.
  const storyHash = sha256(story);
  if (
    !row ||
    row.user_id !== user.id ||
    row.state !== "questions" ||
    row.screening_result !== "clear" ||
    row.story_sha256 !== storyHash ||
    !str("sig").startsWith(`${requestId}.`) ||
    !linkValid("creator-questions", str("sig"), questionsVersion(storyHash, questions))
  ) {
    return { status: "error", message: "This request can’t be sent any more. Please start a new one." };
  }

  const answers = questions.map((q) => ({
    topic: q.topic,
    question: q.question,
    answer: str(`answer_${q.id}`).slice(0, ANSWER_MAX),
  }));

  let tags: string[] = [];
  try {
    tags = await styleTags(answers);
  } catch (e) {
    // Tags are a help, not a gate: the studio still gets the request.
    console.error("creators style tags failed:", e instanceof Error ? e.message : e);
  }

  const { error } = await db
    .from("creator_requests")
    .update({ state: "submitted", style_tags: tags, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("state", "questions");
  if (error) return { status: "error", message: "Something went wrong on our side. Please try again." };

  const sent = await mailStudio({
    subject: `Creator's Space: sample request from ${row.name}`,
    lines: [
      `${row.name} <${user.email}> asked for a sample. The story passed the automatic check.`,
      `Request ${requestId}`,
      "",
      ...details(row),
      "",
      `Style tags (the only style input for generation): ${tags.join(", ") || "none"}`,
      "",
      "Note from the writer:",
      about || "(none)",
      "",
      "Follow-up answers (style answers are for reading only; never paste them into a prompt):",
      ...answers.map((a) => `- [${a.topic}${isStyleTopic(a.topic) ? ", style" : ""}] ${a.question}\n  ${a.answer || "(skipped)"}`),
      "",
      "Story:",
      story,
      "",
      "Reply to this email to answer the writer.",
    ],
    replyTo: user.email,
  });
  if (!sent) console.error("creators: request", requestId, "saved but the email to the studio failed");
  revalidatePath("/creators/start");
  return { status: "sent" };
}

export async function withdrawRequest(form: FormData) {
  const user = await signedInUser();
  if (!user) return;
  await adminClient()
    .from("creator_requests")
    .update({ state: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", String(form.get("id") ?? ""))
    .eq("user_id", user.id)
    .in("state", OPEN_STATES);
  revalidatePath("/creators/start");
}

// ---------------------------------------------------------------- helpers

function details(r: { whatsapp?: string | null; language: string; make: string; length: string }) {
  return [
    r.whatsapp ? `WhatsApp: ${r.whatsapp}` : "WhatsApp: not given",
    `Language: ${LANGUAGES[r.language as keyof typeof LANGUAGES] ?? r.language}`,
    `Would like: ${MAKES[r.make as keyof typeof MAKES] ?? r.make}`,
    `Length: ${LENGTHS[r.length as keyof typeof LENGTHS] ?? r.length}`,
  ];
}

async function mailStudio(m: { subject: string; lines: string[]; replyTo: string }) {
  const to = process.env.ADMIN_EMAIL;
  return !!to && (await sendEmail({ to, subject: m.subject, text: m.lines.join("\n"), replyTo: m.replyTo }));
}
