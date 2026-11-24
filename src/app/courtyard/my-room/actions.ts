"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";
import { DRAFT_STAGES, hasRoom, roomForUser, type OwnRoom } from "@/lib/rooms";
import { adminClient } from "@/lib/supabase-admin";
import { sessionClient } from "@/lib/supabase-server";

export type RoomResult = { ok: true; message?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteUrl() {
  const origin = (await headers()).get("origin");
  return origin && /^https?:\/\//.test(origin) ? origin : "https://jambuch.in";
}

// The signed-in owner's room, or why there isn't one.
async function ownRoom(): Promise<{ room: OwnRoom } | { error: string }> {
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const room = await roomForUser(user.id);
  return room ? { room } : { error: "There’s no room for this account." };
}

function tellJaydeep(subject: string, lines: string[]) {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return Promise.resolve(false);
  return sendEmail({
    from: "jambuch.in <courtyard@jambuch.in>",
    to: admin,
    subject,
    text: [...lines, "", "Courtyard admin: https://jambuch.in/admin/courtyard"].join("\n"),
  });
}

export async function signOutOfRoom() {
  await (await sessionClient()).auth.signOut();
  redirect("/courtyard/my-room");
}

// A sign-in link for My room, sent only to addresses that have a room. The
// answer is the same either way, so the form never reveals who has one.
export async function sendRoomSignIn(email: string): Promise<RoomResult> {
  const address = email.trim().toLowerCase().slice(0, 320);
  if (!EMAIL_RE.test(address)) return { ok: false, error: "Please give a valid email address." };
  if (await hasRoom(address)) {
    const { error } = await (await sessionClient()).auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: `${await siteUrl()}/auth/callback?next=/courtyard/my-room` },
    });
    if (error) console.error("room sign-in email failed:", error.message);
  }
  return { ok: true, message: "If this address has a room, a sign-in link is on its way. Please check your inbox." };
}

export async function saveRoomAbout(about: string): Promise<RoomResult> {
  const found = await ownRoom();
  if ("error" in found) return { ok: false, error: found.error };
  const { error } = await adminClient()
    .from("courtyard_invites")
    .update({ room_about: about.trim().slice(0, 2000) || null })
    .eq("id", found.room.id);
  if (error) return { ok: false, error: "That didn’t save. Please try again." };
  if (found.room.room_slug) revalidatePath(`/courtyard/${found.room.room_slug}`);
  revalidatePath("/courtyard/my-room");
  return { ok: true, message: "Saved." };
}

// "Ask Jaydeep to open my room": from draft to his review.
export async function askToOpenRoom(): Promise<RoomResult> {
  const found = await ownRoom();
  if ("error" in found) return { ok: false, error: found.error };
  const { data } = await adminClient()
    .from("courtyard_invites")
    .update({ stage: "needs_review" })
    .eq("id", found.room.id)
    .in("stage", DRAFT_STAGES)
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, error: "Your room has already moved on. Refresh the page." };
  await tellJaydeep(`Courtyard: ${found.room.name} asks you to open their room`, [
    `${found.room.name} <${found.room.email}> says their room is ready for your review.`,
    found.room.room_slug ? `Address: /courtyard/${found.room.room_slug}` : "No room address set yet: add one before opening it.",
  ]);
  revalidatePath("/courtyard/my-room");
  return { ok: true };
}

// Leaving: the room page closes at once, and the owner gets an email listing
// every piece of theirs with its text and file links (term 4: "I can leave
// whenever I like and get all my files back"). Pieces already on the thread
// stay there until Jaydeep takes them down, which the email says.
export async function leaveRoom(): Promise<RoomResult> {
  const found = await ownRoom();
  if ("error" in found) return { ok: false, error: found.error };
  const { room } = found;
  const db = adminClient();
  const { data } = await db.from("courtyard_invites").update({ stage: "left" }).eq("id", room.id).neq("stage", "left").select("id").maybeSingle();
  if (!data) return { ok: false, error: "Your room has already changed. Refresh the page." };

  const { data: pieces } = await db
    .from("courtyard_submissions")
    .select("title, body, file_url, links, published_at")
    .eq("email", room.email.toLowerCase())
    .eq("kind", "single_piece")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: true });
  const list = (pieces ?? []).flatMap((p) => [
    `— ${p.title}`,
    ...(p.file_url && !String(p.file_url).startsWith("r2-private:") ? [`  File: ${p.file_url}`] : []),
    ...((p.links as string[]) ?? []).map((l) => `  Link: ${l}`),
    ...(p.body ? ["", String(p.body), ""] : []),
    "",
  ]);
  await sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: room.email,
    replyTo: process.env.ADMIN_EMAIL,
    subject: "Your work from the Courtyard",
    text: [
      `Dear ${room.name.split(" ")[0]},`,
      "",
      "Your room is closed, as you asked. Thank you for everything you shared.",
      "",
      list.length ? "Here is every piece of yours, with its text and file links:" : "There were no published pieces to send.",
      "",
      ...list,
      "Pieces already in the Courtyard thread stay there with your name on them. If you’d like any taken down, just reply and I’ll do it.",
      "",
      "Warmly,",
      "Jaydeep",
    ].join("\n"),
  });
  await tellJaydeep(`Courtyard: ${room.name} has left their room`, [
    `${room.name} <${room.email}> closed their room. Their work list has been emailed to them.`,
  ]);
  if (room.room_slug) revalidatePath(`/courtyard/${room.room_slug}`);
  revalidatePath("/courtyard");
  return { ok: true };
}
