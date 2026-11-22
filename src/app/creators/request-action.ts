"use server";

import { sendEmail } from "@/lib/email";
import { passesTurnstile } from "@/lib/turnstile";
import { LANGUAGES, LENGTHS, MAKES } from "./options";

export type RequestState = { status: "idle" | "sent" | "error"; message?: string };

// Must match the action passed to useSpamCheck in request-form.tsx.
const TURNSTILE_ACTION = "creator";

const pick = <T extends Record<string, string>>(map: T, v: string, fallback: keyof T): keyof T =>
  (Object.keys(map) as (keyof T)[]).includes(v as keyof T) ? (v as keyof T) : fallback;

// Creator's Space, first step (21 Nov 2026): a writer asks for a sample. Nothing is stored and no
// story text is asked for here; the request is emailed to ADMIN_EMAIL, and replying goes to the writer.
// Payments, quotes and uploads come later (docs/CREATORS_SPACE_BRIEF.md, Phase 1–2).
export async function requestSample(_prev: RequestState, form: FormData): Promise<RequestState> {
  const str = (key: string) => String(form.get(key) ?? "").trim();

  // Hidden field that people never see; bots that fill every input land here.
  if (str("website")) return { status: "sent" };

  const name = str("name").slice(0, 200);
  const email = str("email").slice(0, 320);
  const whatsapp = str("whatsapp").replace(/[^\d+ ]/g, "").slice(0, 20);
  const about = str("about");
  const language = pick(LANGUAGES, str("language"), "gu");
  const make = pick(MAKES, str("make"), "unsure");
  const length = pick(LENGTHS, str("length"), "medium");

  if (!name) return { status: "error", message: "Please tell me your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Please give an email address I can reply to." };
  if (!about) return { status: "error", message: "Please write a few lines about your story." };
  if (about.length > 1500) return { status: "error", message: "Please keep it under 1,500 characters. The full story comes later." };

  if (!(await passesTurnstile(str("cf-turnstile-response"), TURNSTILE_ACTION))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  const to = process.env.ADMIN_EMAIL;
  const sent =
    !!to &&
    (await sendEmail({
      to,
      subject: `Creator's Space: sample request from ${name}`,
      text: [
        `${name} <${email}> asked for a sample on jambuch.in/creators.`,
        whatsapp ? `WhatsApp: ${whatsapp}` : "WhatsApp: not given",
        `Language: ${LANGUAGES[language]}`,
        `Would like: ${MAKES[make]}`,
        `Length: ${LENGTHS[length]}`,
        "",
        "About the story:",
        about,
        "",
        "Reply to this email to answer the writer.",
      ].join("\n"),
      replyTo: email,
    }));
  // Nothing is saved, so a failed email must not look like success.
  if (!sent) return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
  return { status: "sent" };
}
