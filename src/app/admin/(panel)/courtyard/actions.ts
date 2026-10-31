"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { INVITE_DAYS, newInviteLink, ROOM_TERMS, type InviteStage } from "@/lib/invites";
import { DEFAULT_GATHERING, nextGathering, parseGathering } from "@/lib/gathering";
import { sendGatheringLetter } from "@/lib/letter";
import { fileRef, publishPrivate, signedPrivateUrl } from "@/lib/r2";
import { contributorUrl, seriesAddUrl } from "@/lib/series";

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
// Approving a single piece. By default it waits for the next weekly gathering
// (it joins the thread when that time comes); "now" makes it join at once.
export async function publishSubmission(
  id: string,
  edits: { title: string; city: string },
  when: "gathering" | "now" = "gathering",
): Promise<{ ok: true; gatheringAt: string } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { data: s, error } = await db
      .from("courtyard_submissions")
      .select("id, kind, status, file_url, series_id, series_part")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s || s.kind !== "single_piece" || s.status === "unconfirmed") throw new Error("Only a confirmed single piece can be published.");
    const title = edits.title.trim();
    if (!title) throw new Error("A published piece needs a title.");

    // A series part gets the next number when approved, so a declined part
    // never leaves a gap.
    let seriesPart: number | null = s.series_part;
    if (s.series_id && !seriesPart) {
      const { data: last } = await db
        .from("courtyard_submissions")
        .select("series_part")
        .eq("series_id", s.series_id)
        .not("series_part", "is", null)
        .is("deleted_at", null)
        .order("series_part", { ascending: false })
        .limit(1)
        .maybeSingle();
      seriesPart = (last?.series_part ?? 0) + 1;
    }

    const now = new Date();
    const gatheringAt =
      when === "now" ? now : nextGathering(parseGathering((await gatheringSetting(db)) ?? DEFAULT_GATHERING), now);

    const ref = fileRef(s.file_url);
    const fileUrl = ref ? await publishPrivate(ref) : s.file_url;
    const { error: upd } = await db
      .from("courtyard_submissions")
      .update({
        status: "published",
        published_at: now.toISOString(),
        gathering_at: gatheringAt.toISOString(),
        gathering_notified_at: null,
        file_url: fileUrl,
        title,
        city: edits.city.trim() || null,
        series_part: seriesPart,
      })
      .eq("id", id);
    if (upd) throw new Error(upd.message);

    // A first approved piece (outside a series) makes its sender a contributor,
    // with a personal link to share more without the form's confirmation step.
    if (!s.series_id) await welcomeContributor(db, id);

    // Approving a series' first part opens the series and sends the
    // contributor their personal "add the next part" link.
    if (s.series_id) {
      const { data: opened } = await db
        .from("courtyard_series")
        .update({ status: "active" })
        .eq("id", s.series_id)
        .eq("status", "pending")
        .select("id, title, name, email, add_link_version, slug")
        .maybeSingle();
      if (opened) await emailSeriesLink(opened, await siteUrl(), true);
    }

    revalidatePath("/courtyard");
    revalidatePath("/courtyard/series/[slug]", "page");
    revalidatePath("/admin/courtyard");
    return { ok: true, gatheringAt: gatheringAt.toISOString() };
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
      // A declined suggestion no longer needs the creator's contact: forget it.
      .update({ status: "declined", reply_text: send ? text : null, creator_contact: null })
      .eq("id", id);
    if (upd) throw new Error(upd.message);
    revalidatePath("/admin/courtyard");
    return { ok: true, emailed };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- the weekly letter

export async function setLetterAuto(auto: boolean): Promise<{ ok: true } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db.from("settings").upsert({ key: "courtyard.letter", value: { auto } });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// Sends this gathering's letter now (e.g. when auto-send is off).
export async function sendLetterNow(): Promise<{ ok: true; message: string } | Failed> {
  try {
    const { db } = await requireAdmin();
    const r = await sendGatheringLetter(db, await siteUrl(), { force: true });
    revalidatePath("/admin/courtyard");
    if (r.status === "sent") return { ok: true, message: `Sent to ${r.recipients} readers, with ${r.pieces} pieces.` };
    if (r.status === "nothing") throw new Error("Nothing new has joined the thread since the last letter.");
    if (r.status === "already") throw new Error("This gathering’s letter has already gone out.");
    throw new Error("The letter couldn’t be sent just now.");
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- contributors

async function welcomeContributor(db: Awaited<ReturnType<typeof requireAdmin>>["db"], submissionId: string) {
  const { data: sub } = await db.from("courtyard_submissions").select("name, email, city").eq("id", submissionId).single();
  if (!sub) return;
  const email = String(sub.email).toLowerCase();
  const { data: existing } = await db
    .from("courtyard_contributors")
    .select("id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return; // they already have their link
  const { data: c, error } = await db
    .from("courtyard_contributors")
    .insert({ email, name: sub.name, city: sub.city, link_sent_at: new Date().toISOString() })
    .select("id, name, link_version")
    .single();
  if (error || !c) {
    console.error("contributor insert failed:", error?.message);
    return;
  }
  await sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: email,
    replyTo: process.env.ADMIN_EMAIL,
    subject: "Your personal link to share more in the Courtyard",
    text: [
      `Dear ${c.name.split(" ")[0]},`,
      "",
      "I’ve approved your piece. It joins the Courtyard at the next gathering, and you’ll get a note that evening.",
      "",
      "Whenever you have something new to share, use your personal link. It already knows your name and email, so there’s no form to fill again and nothing to confirm:",
      contributorUrl(await siteUrl(), c),
      "",
      "Keep it to yourself: it sends work under your name. If you ever lose it, the Courtyard page has “Get your link again”.",
      "",
      "Warmly,",
      "Jaydeep",
    ].join("\n"),
  });
}

// A fresh personal link for a contributor (the old one stops working).
export async function newContributorLink(email: string): Promise<{ ok: true } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { data: cur } = await db
      .from("courtyard_contributors")
      .select("id, name, link_version")
      .eq("email", email.toLowerCase())
      .is("deleted_at", null)
      .maybeSingle();
    if (!cur) throw new Error("They aren’t a contributor yet: approve one of their pieces first.");
    const version = cur.link_version + 1;
    const { error } = await db
      .from("courtyard_contributors")
      .update({ link_version: version, link_sent_at: new Date().toISOString() })
      .eq("id", cur.id);
    if (error) throw new Error(error.message);
    const ok = await sendEmail({
      from: "Jaydeep Buch <courtyard@jambuch.in>",
      to: email,
      replyTo: process.env.ADMIN_EMAIL,
      subject: "A fresh personal link for the Courtyard",
      text: [
        `Dear ${cur.name.split(" ")[0]},`,
        "",
        "Here is a fresh personal link for sharing in the Courtyard. Your old link no longer works.",
        contributorUrl(await siteUrl(), { id: cur.id, link_version: version }),
        "",
        "Jaydeep",
      ].join("\n"),
    });
    if (!ok) throw new Error("The new link was made, but the email didn’t send. Try again.");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- series

type SeriesRow = { id: string; title: string; name: string; email: string; add_link_version: number; slug: string };

async function emailSeriesLink(s: SeriesRow, site: string, first: boolean) {
  return sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: s.email,
    replyTo: process.env.ADMIN_EMAIL,
    subject: first ? `Your series “${s.title}” is open` : `A fresh link for “${s.title}”`,
    text: [
      `Dear ${s.name.split(" ")[0]},`,
      "",
      first
        ? `I’ve approved the first part of “${s.title}”. It joins the Courtyard at the next gathering, and your series now has its own page:`
        : `Here is a fresh personal link for “${s.title}”. Your old link no longer works.`,
      ...(first ? [`${site}/courtyard/series/${s.slug}`, ""] : [""]),
      "Whenever the next part is ready, send it with your personal link (keep it to yourself: it adds parts under your name):",
      seriesAddUrl(site, s),
      "",
      "Each part waits for my reading, then joins the thread at a weekly gathering.",
      "",
      "Warmly,",
      "Jaydeep",
    ].join("\n"),
  });
}

// Pause / resume / end a series, rename it, or send a fresh personal link
// (which kills the old one).
export async function updateSeries(
  id: string,
  change:
    | { action: "pause" | "resume" | "end" }
    | { action: "rename"; title: string; description: string }
    | { action: "new_link" },
): Promise<{ ok: true; emailed?: boolean } | Failed> {
  try {
    const { db } = await requireAdmin();
    if (change.action === "rename") {
      const title = change.title.trim().slice(0, 120);
      if (!title) throw new Error("A series needs a name.");
      const { error } = await db
        .from("courtyard_series")
        .update({ title, description: change.description.trim().slice(0, 1000) || null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else if (change.action === "new_link") {
      const { data: cur } = await db.from("courtyard_series").select("add_link_version").eq("id", id).single();
      const { data, error } = await db
        .from("courtyard_series")
        .update({ add_link_version: (cur?.add_link_version ?? 1) + 1 })
        .eq("id", id)
        .eq("status", "active")
        .select("id, title, name, email, add_link_version, slug")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Only an open series can get a new link.");
      const emailed = await emailSeriesLink(data, await siteUrl(), false);
      revalidatePath("/admin/courtyard");
      return { ok: true, emailed };
    } else {
      const to = { pause: "paused", resume: "active", end: "ended" }[change.action];
      const from = { pause: ["active"], resume: ["paused"], end: ["active", "paused"] }[change.action];
      const { data, error } = await db
        .from("courtyard_series")
        .update({ status: to })
        .eq("id", id)
        .in("status", from)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("This series has changed since the page loaded. Refresh and try again.");
    }
    revalidatePath("/courtyard/series/[slug]", "page");
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

async function gatheringSetting(db: Awaited<ReturnType<typeof requireAdmin>>["db"]) {
  const { data } = await db.from("settings").select("value").eq("key", "courtyard.gathering").maybeSingle();
  return data?.value ?? null;
}

// The weekly gathering's day and time (IST). Pieces already queued keep their time.
export async function setGathering(weekday: number, time: string): Promise<{ ok: true } | Failed> {
  try {
    const s = parseGathering({ weekday, time });
    if (s.weekday !== weekday || s.time !== time) throw new Error("Pick a day and a time like 19:00.");
    const { db } = await requireAdmin();
    const { error } = await db.from("settings").upsert({ key: "courtyard.gathering", value: s });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/courtyard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// Moves a queued piece into the thread straight away.
export async function joinThreadNow(id: string): Promise<{ ok: true } | Failed> {
  try {
    const { db } = await requireAdmin();
    const { error } = await db
      .from("courtyard_submissions")
      .update({ gathering_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "published");
    if (error) throw new Error(error.message);
    revalidatePath("/courtyard");
    revalidatePath("/admin/courtyard");
    return { ok: true };
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
