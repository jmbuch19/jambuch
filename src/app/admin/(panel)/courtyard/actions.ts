"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { INVITE_DAYS, newInviteLink, ROOM_TERMS, type InviteStage } from "@/lib/invites";
import { fileRef, publishPrivate, signedPrivateUrl } from "@/lib/r2";

// Courtyard admin: create, resend and revoke invites, move them between
// stages, and handle requests. Every action checks the admin role, and row-
// level security checks it again in the database.

export type InviteSent = {
  ok: true;
  link: string;
  emailed: boolean;
  whatsappUrl: string | null;
};
export type Failed = { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function siteUrl() {
  const origin = (await headers()).get("origin");
  return origin && /^https?:\/\//.test(origin) ? origin : "https://jambuch.in";
}

function fail(err: unknown): Failed {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

function whatsappLink(number: string | null, name: string, link: string) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const text = `Hello ${name.split(" ")[0]}, I’d love to give you a room in the Courtyard at jambuch.in. Your invitation (valid for ${INVITE_DAYS} days): ${link}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

async function emailInvite(invite: { name: string; email: string; note: string | null }, link: string, expiresAt: string) {
  const until = new Date(expiresAt).toLocaleDateString("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" });
  return sendEmail({
    from: "Jaydeep Buch <invites@jambuch.in>",
    to: invite.email,
    replyTo: process.env.ADMIN_EMAIL,
    subject: "A room for you in the Courtyard at jambuch.in",
    text: [
      `Dear ${invite.name.split(" ")[0]},`,
      "",
      ...(invite.note ? [invite.note, ""] : []),
      "I’d like to give you a room of your own in the Courtyard (આંગણું) at jambuch.in: a place for your work, with your name on every piece.",
      "",
      "Before your room is made, I ask you to agree to four simple terms:",
      ...ROOM_TERMS.map((t, i) => `${i + 1}. ${t}`),
      "",
      `Open your invitation (it works once, until ${until}):`,
      link,
      "",
      `You’ll sign in with this email address (${invite.email}).`,
      "",
      "Warmly,",
      "Jaydeep",
    ].join("\n"),
  });
}

export async function createInvite(input: {
  name: string;
  email: string;
  whatsapp: string;
  relation: string;
  craft: string;
  roomSlug: string;
  note: string;
  submissionId: string | null;
}): Promise<InviteSent | Failed> {
  try {
    const { db } = await requireAdmin();
    const name = input.name.trim().slice(0, 200);
    const email = input.email.trim().toLowerCase();
    const slug = input.roomSlug.trim().toLowerCase();
    if (!name) throw new Error("Please give their name.");
    if (!EMAIL_RE.test(email)) throw new Error("Please give a valid email address: they sign in with it.");
    if (slug && !SLUG_RE.test(slug)) throw new Error("Room address: small letters, numbers and single dashes only.");

    const linkParts = newInviteLink();
    const { data, error } = await db
      .from("courtyard_invites")
      .insert({
        name,
        email,
        whatsapp: input.whatsapp.trim() || null,
        relation: input.relation.trim() || null,
        craft: input.craft.trim() || null,
        room_slug: slug || null,
        note: input.note.trim() || null,
        submission_id: input.submissionId,
        stage: "invited",
        token_hash: linkParts.token_hash,
        sent_at: linkParts.sent_at,
        expires_at: linkParts.expires_at,
      })
      .select("id, name, email, whatsapp, note")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That room address is already taken.");
      throw new Error(error.message);
    }
    // A room request or suggestion becomes a normal invite.
    if (input.submissionId) {
      await db.from("courtyard_submissions").update({ status: "invited", invite_id: data.id }).eq("id", input.submissionId);
    }

    const link = `${await siteUrl()}/courtyard/invite/${linkParts.token}`;
    const emailed = await emailInvite(data, link, linkParts.expires_at);
    revalidatePath("/admin/courtyard");
    return { ok: true, link, emailed, whatsappUrl: whatsappLink(data.whatsapp, data.name, link) };
  } catch (err) {
    return fail(err);
  }
}

// A new link replaces the old one, which stops working at once.
export async function resendInvite(id: string): Promise<InviteSent | Failed> {
  try {
    const { db } = await requireAdmin();
    const linkParts = newInviteLink();
    const { data, error } = await db
      .from("courtyard_invites")
      .update({
        token_hash: linkParts.token_hash,
        sent_at: linkParts.sent_at,
        expires_at: linkParts.expires_at,
        stage: "invited",
      })
      .eq("id", id)
      .in("stage", ["invited", "expired", "revoked"])
      .is("deleted_at", null)
      .select("id, name, email, whatsapp, note")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Only an invite that hasn’t been accepted can be resent.");

    const link = `${await siteUrl()}/courtyard/invite/${linkParts.token}`;
    const emailed = await emailInvite(data, link, linkParts.expires_at);
    revalidatePath("/admin/courtyard");
    return { ok: true, link, emailed, whatsappUrl: whatsappLink(data.whatsapp, data.name, link) };
  } catch (err) {
    return fail(err);
  }
}

// Which stage each button may move an invite to, and from where.
const MOVES: Record<string, { to: InviteStage; from: InviteStage[] }> = {
  revoke: { to: "revoked", from: ["invited", "expired", "agreement_accepted"] },
  start_room: { to: "room_draft", from: ["agreement_accepted"] },
  ready_for_review: { to: "needs_review", from: ["room_draft"] },
  approve: { to: "live", from: ["needs_review"] },
  pause: { to: "paused", from: ["needs_review", "live"] },
  resume: { to: "live", from: ["paused"] },
  remove: { to: "left", from: ["room_draft", "needs_review", "live", "paused"] },
};

export async function moveInvite(id: string, move: keyof typeof MOVES): Promise<{ ok: true } | Failed> {
  try {
    const rule = MOVES[move];
    if (!rule) throw new Error("Unknown step.");
    const { db } = await requireAdmin();
    // Revoking also kills the link immediately.
    const patch = move === "revoke" ? { stage: rule.to, token_hash: null } : { stage: rule.to };
    const { data, error } = await db
      .from("courtyard_invites")
      .update(patch)
      .eq("id", id)
      .in("stage", rule.from)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("This invite has moved on since the page loaded. Refresh and try again.");
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- submissions

// For "Review & publish": a 10-minute link to the private file, so it can be
// seen before anyone else can.
export async function previewFile(id: string): Promise<{ ok: true; url: string | null } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { data, error } = await db.from("courtyard_submissions").select("file_url").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const ref = fileRef(data?.file_url);
    return { ok: true, url: ref ? await signedPrivateUrl(ref) : null };
  } catch (err) {
    return fail(err);
  }
}

// Publishing a single piece: its file moves to the public bucket, and it
// appears on the "Shared by visitors" shelf.
export async function publishSubmission(id: string, edits: { title: string; city: string }): Promise<{ ok: true } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { data: s, error } = await db
      .from("courtyard_submissions")
      .select("id, kind, status, file_url")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s || s.kind !== "single_piece" || s.status === "unconfirmed") throw new Error("Only a confirmed single piece can be published.");
    const title = edits.title.trim();
    if (!title) throw new Error("A published piece needs a title.");

    const ref = fileRef(s.file_url);
    const fileUrl = ref ? await publishPrivate(ref) : s.file_url;
    const { error: upd } = await db
      .from("courtyard_submissions")
      .update({ status: "published", published_at: new Date().toISOString(), file_url: fileUrl, title, city: edits.city.trim() || null })
      .eq("id", id);
    if (upd) throw new Error(upd.message);
    revalidatePath("/courtyard");
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// "Reach out": a note to self that Jaydeep is handling it personally. Nothing
// is sent from the site; suggested creators are never contacted automatically.
export async function markReachedOut(id: string): Promise<{ ok: true } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.from("courtyard_submissions").update({ status: "reached_out" }).eq("id", id).neq("status", "unconfirmed");
    if (error) throw new Error(error.message);
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// Decline, with the (edited) kind reply emailed to the sender: the
// contributor, or the suggester for a suggestion.
export async function declineSubmission(id: string, reply: string, send: boolean): Promise<{ ok: true; emailed: boolean } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { data: s, error } = await db
      .from("courtyard_submissions")
      .select("id, name, email, status")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s || s.status === "unconfirmed") throw new Error("This submission can’t be declined.");
    const text = reply.trim().slice(0, 5000);
    if (send && !text) throw new Error("Write a reply, or untick “Send this reply”.");

    const emailed = send
      ? await sendEmail({
          from: "Jaydeep Buch <courtyard@jambuch.in>",
          to: s.email,
          replyTo: process.env.ADMIN_EMAIL,
          subject: "About what you sent to the Courtyard",
          text,
        })
      : false;
    if (send && !emailed) throw new Error("The reply didn’t send, so nothing was changed. Please try again.");

    const { error: upd } = await db
      .from("courtyard_submissions")
      .update({ status: "declined", reply_text: send ? text : null })
      .eq("id", id);
    if (upd) throw new Error(upd.message);
    revalidatePath("/admin/courtyard");
    return { ok: true, emailed };
  } catch (err) {
    return fail(err);
  }
}

export async function setRoomLimit(limit: number): Promise<{ ok: true } | Failed> {
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Pick a number from 1 to 100.");
    const { db } = await requireAdmin();
    const { error } = await db
      .from("settings")
      .upsert({ key: "courtyard.room_limit_per_year", value: limit });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
