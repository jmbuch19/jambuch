"use server";

import { headers } from "next/headers";
import { hashToken, sameEmail, TERMS_VERSION, ROOM_TERMS } from "@/lib/invites";
import { adminClient } from "@/lib/supabase-admin";
import { sessionClient } from "@/lib/supabase-server";

export type InviteResult = { ok: true } | { ok: false; error: string };

// The invite behind a link, if the link can still be used.
export async function liveInvite(token: string) {
  if (!token || token.length > 200) return null;
  const { data } = await adminClient()
    .from("courtyard_invites")
    .select("id, name, email, note, craft, room_slug, stage, expires_at")
    .eq("token_hash", hashToken(token))
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.stage !== "invited") return null;
  if (!data.expires_at || new Date(data.expires_at).getTime() < Date.now()) return { ...data, expired: true as const };
  return { ...data, expired: false as const };
}

// Sends a sign-in link, but only ever to the invited address: the link alone
// can't be used to sign in as someone else.
export async function sendInviteSignIn(token: string): Promise<InviteResult> {
  const invite = await liveInvite(token);
  if (!invite || invite.expired) return { ok: false, error: "This invitation can no longer be used." };
  const origin = (await headers()).get("origin") ?? "https://jambuch.in";
  const db = await sessionClient();
  const { error } = await db.auth.signInWithOtp({
    email: invite.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(`/courtyard/invite/${token}`)}` },
  });
  if (error) {
    console.error("invite sign-in email failed:", error.message);
    return { ok: false, error: "The sign-in email couldn’t be sent. Please wait a minute and try again." };
  }
  return { ok: true };
}

// Accepting = agreeing to the four room terms. Checked again here: signed in,
// with the invited email, on a link that is still live. The link then dies.
export async function acceptInvite(token: string, ticked: number): Promise<InviteResult> {
  if (ticked !== ROOM_TERMS.length) return { ok: false, error: "Please tick all four terms." };
  const invite = await liveInvite(token);
  if (!invite || invite.expired) return { ok: false, error: "This invitation can no longer be used." };

  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };
  if (!sameEmail(user.email, invite.email)) return { ok: false, error: "You’re signed in with a different email from the one invited." };

  const db = adminClient();
  const { data, error } = await db
    .from("courtyard_invites")
    .update({
      stage: "agreement_accepted",
      accepted_at: new Date().toISOString(),
      accepted_user_id: user.id,
      terms_version: TERMS_VERSION,
      token_hash: null,
    })
    .eq("id", invite.id)
    .eq("stage", "invited")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "This invitation has just been used or changed. Please ask Jaydeep for a new link." };

  // Guests get the guest role; an admin keeps theirs.
  await db.from("members").update({ role: "guest" }).eq("user_id", user.id).eq("role", "member");
  return { ok: true };
}
