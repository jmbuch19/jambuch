"use server";

import { headers } from "next/headers";
import { sendEmail } from "@/lib/email";
import { readerConfirmUrl } from "@/lib/series";
import { linkId, linkValid } from "@/lib/signed-links";
import { adminClient } from "@/lib/supabase-admin";
import { passesTurnstile } from "@/lib/turnstile";

export type LetterState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteUrl() {
  const origin = (await headers()).get("origin");
  return origin && /^https?:\/\//.test(origin) ? origin : "https://jambuch.in";
}

// Joining the weekly letter: name + email, then one confirmation click.
export async function joinLetter(_prev: LetterState, form: FormData): Promise<LetterState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 200);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const source = String(form.get("source") ?? "").trim().slice(0, 60) || null;
  if (String(form.get("website") ?? "")) return { status: "sent" };
  if (!name) return { status: "error", message: "Please give your name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please give a valid email address." };
  if (!(await passesTurnstile(String(form.get("cf-turnstile-response") ?? ""), "letter"))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  const db = adminClient();
  const { data: existing } = await db.from("courtyard_readers").select("id, confirmed_at").eq("email", email).maybeSingle();
  if (existing?.confirmed_at) return { status: "sent" }; // already reading; say nothing more
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await db.from("courtyard_readers").insert({ name, email, source }).select("id").single();
    if (error) {
      console.error("reader insert failed:", error.message);
      return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
    }
    id = data.id;
  }
  const ok = await sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: email,
    subject: "Confirm your weekly letter from the Courtyard",
    text: [
      `Dear ${name.split(" ")[0]},`,
      "",
      "You asked for the weekly letter from the Courtyard at jambuch.in: one email after each gathering, with the pieces that joined that week. Nothing else.",
      "",
      "Please confirm by opening this link:",
      readerConfirmUrl(await siteUrl(), id!),
      "",
      "If it wasn’t you, ignore this email and nothing will be sent.",
      "",
      "Jaydeep",
    ].join("\n"),
  });
  if (!ok) return { status: "error", message: "I couldn’t send the confirmation email. Please check the address." };
  return { status: "sent" };
}

export async function confirmReader(token: string): Promise<{ ok: boolean }> {
  if (!linkValid("reader-confirm", token)) return { ok: false };
  const { data } = await adminClient()
    .from("courtyard_readers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", linkId(token)!.id)
    .select("id")
    .maybeSingle();
  return { ok: !!data };
}

// Unsubscribing deletes the reader: nothing about them is kept.
export async function stopReader(token: string): Promise<{ ok: boolean }> {
  if (!linkValid("reader-stop", token)) return { ok: false };
  const { error } = await adminClient().from("courtyard_readers").delete().eq("id", linkId(token)!.id);
  return { ok: !error };
}
