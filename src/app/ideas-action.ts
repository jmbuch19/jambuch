"use server";

import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase-admin";

export type IdeaState = { status: "idle" | "sent" | "error"; message?: string };

const CATEGORIES = ["book_to_translate", "app", "civic", "other"] as const;
type Category = (typeof CATEGORIES)[number];

async function passesTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0];
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip.trim());
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

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

  if (!(await passesTurnstile(str("cf-turnstile-response")))) {
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
  return { status: "sent" };
}
