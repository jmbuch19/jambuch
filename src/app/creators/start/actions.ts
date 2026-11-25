"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { passesTurnstile } from "@/lib/turnstile";
import { sessionClient } from "@/lib/supabase-server";
import { adminClient } from "@/lib/supabase-admin";
import { sampleLink } from "@/lib/creators/delivery";
import { OPEN_STATES } from "./limits";

// Creator's Space: sign-in by emailed code (no Claude call for anyone who isn't signed in),
// the writer's link to their sample, and withdrawing a request. The question flow itself
// is in flow-actions.ts (docs/CREATORS_QUESTION_FLOW.md).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// ---------------------------------------------------------------- the writer's requests

// A fresh 15-minute link to the writer's own sample (only after the studio sent it, and
// only while its files exist).
export async function listenToSample(id: string): Promise<{ url?: string; error?: string }> {
  const user = await signedInUser();
  if (!user) return { error: "Please sign in again." };
  const { data: row } = await adminClient()
    .from("creator_requests")
    .select("id, user_id, sample_state, sample_key")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.user_id !== user.id || row.sample_state !== "sent" || !row.sample_key) {
    return { error: "This sample isn’t available any more." };
  }
  // The first time the writer opens their sample (evidence if a payment is ever disputed).
  await adminClient().from("creator_requests").update({ sample_listened_at: new Date().toISOString() }).eq("id", id).is("sample_listened_at", null);
  try {
    return { url: await sampleLink(id, row.sample_key) };
  } catch {
    return { error: "The sample couldn’t be opened. Please try again." };
  }
}

// Withdrawn requests keep nothing: their stored story is deleted by the daily job
// within a day (brief §6B), and marked for deletion now.
export async function withdrawRequest(form: FormData) {
  const user = await signedInUser();
  if (!user) return;
  await adminClient()
    .from("creator_requests")
    .update({ state: "withdrawn", files_delete_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", String(form.get("id") ?? ""))
    .eq("user_id", user.id)
    .in("state", OPEN_STATES);
  revalidatePath("/creators/start");
}

