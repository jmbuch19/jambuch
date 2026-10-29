"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { sessionClient } from "@/lib/supabase-server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  // Only the admin address is ever sent a link. Everyone else sees the same
  // reply, so the page doesn't reveal which address is allowed.
  if (isAdminEmail(email)) {
    const origin = (await headers()).get("origin") ?? "https://jambuch.in";
    const db = await sessionClient();
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/admin` },
    });
    if (error) {
      console.error("sign-in email failed:", error.message);
      return { status: "error", message: "The sign-in email couldn’t be sent. Please wait a minute and try again." };
    }
  }
  return { status: "sent" };
}

export async function signOut() {
  const db = await sessionClient();
  await db.auth.signOut();
  redirect("/admin/login");
}
