"use server";

import { sendEmail } from "@/lib/email";
import { adminClient } from "@/lib/supabase-admin";
import { passesTurnstile } from "@/lib/turnstile";

export type IdeaState = { status: "idle" | "sent" | "error"; message?: string };

const CATEGORIES = ["book_to_translate", "app", "civic", "other"] as const;
type Category = (typeof CATEGORIES)[number];

// Must match the action passed to turnstile.render in idea-form.tsx.
const TURNSTILE_ACTION = "idea";

export async function submitIdea(_prev: IdeaState, form: FormData): Promise<IdeaState> {
  const str = (key: string) => String(form.get(key) ?? "").trim();

  // Hidden field that people never see; bots that fill every input land here.
  if (str("website")) return { status: "sent" };

  const name = str("name").slice(0, 200);
  const email = str("email").slice(0, 320);
  const message = str("message");
  const rawCategory = str("category");
  const category: Category = (CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as Category)
    : "other";

  if (!message) return { status: "error", message: "Please write your idea before sending." };
  if (message.length > 5000) return { status: "error", message: "Please keep it under 5,000 characters." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email address doesn’t look right. You can also leave it empty." };
  }

  if (!(await passesTurnstile(str("cf-turnstile-response"), TURNSTILE_ACTION))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  try {
    const { error } = await adminClient()
      .from("ideas")
      .insert({ name: name || null, email: email || null, category, message });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("ideas insert failed:", err instanceof Error ? err.message : err);
    return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
  }

  // The idea is already saved, so a failed email never fails the visitor.
  await notifyByEmail({ name, email, category, message });
  return { status: "sent" };
}

const CATEGORY_LABELS: Record<Category, string> = {
  book_to_translate: "A book to translate",
  app: "An app or website",
  civic: "A civic or social idea",
  other: "Something else",
};

// Emails each new idea to ADMIN_EMAIL. Replying goes to the visitor.
async function notifyByEmail(idea: { name: string; email: string; category: Category; message: string }) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  const who = idea.name || "Someone";
  await sendEmail({
    to,
    subject: `New idea from ${who}`,
    text: [
      `${who}${idea.email ? ` <${idea.email}>` : ""} shared an idea on jambuch.in.`,
      `Kind: ${CATEGORY_LABELS[idea.category]}`,
      "",
      idea.message,
      "",
      "Inbox: https://jambuch.in/admin/ideas",
    ].join("\n"),
    replyTo: idea.email || undefined,
  });
}
