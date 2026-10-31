"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import {
  FILE_TYPES,
  FORMS,
  KIND_LABELS,
  MAX_FILE_BYTES,
  MAX_THEMES,
  THEMES,
  kindLine,
  type SubmissionKind,
} from "@/lib/courtyard";
import { sendEmail } from "@/lib/email";
import { deleteForever, fileRef, r2Problem, uploadPrivate } from "@/lib/r2";
import { contributorForLink, contributorUrl, seriesAddUrl, seriesForLink, seriesSlug } from "@/lib/series";
import { adminClient } from "@/lib/supabase-admin";
import { passesTurnstile } from "@/lib/turnstile";

export type ContributeState = { status: "idle" | "sent" | "error"; message?: string; direct?: boolean };

// Must match the action passed to turnstile.render in contribute-form.tsx.
const TURNSTILE_ACTION = "courtyard";
const PER_EMAIL_PER_DAY = 3;
const PER_IP_PER_DAY = 6;
const PER_SERIES_PER_DAY = 3;
const CONFIRM_DAYS = 7; // unconfirmed submissions are removed by the daily job after this

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS: SubmissionKind[] = ["single_piece", "room_request", "suggestion"];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function siteUrl() {
  const origin = (await headers()).get("origin");
  return origin && /^https?:\/\//.test(origin) ? origin : "https://jambuch.in";
}

// Links come one per field, or several in one box (one per line, or separated
// by spaces or commas).
function cleanLinks(raw: string[]) {
  const out: string[] = [];
  for (const l of raw.flatMap((x) => x.split(/[\s,]+/)).filter(Boolean)) {
    try {
      const u = new URL(/^https?:\/\//i.test(l) ? l : `https://${l}`);
      if (u.protocol === "http:" || u.protocol === "https:") out.push(u.toString());
    } catch {
      throw new Error(`“${l.slice(0, 60)}” doesn’t look like a web link.`);
    }
  }
  return out.slice(0, 5);
}

async function notifyAdmin(s: {
  kind: SubmissionKind;
  name: string;
  email: string;
  form: string | null;
  themes: string[] | null;
  title: string | null;
  creator_name: string | null;
  seriesTitle?: string | null;
  seriesFirst?: boolean;
}) {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return;
  const what = s.seriesTitle
    ? s.seriesFirst
      ? `first part of a new series, “${s.seriesTitle}”,`
      : `new part of “${s.seriesTitle}”`
    : KIND_LABELS[s.kind].toLowerCase();
  await sendEmail({
    from: "jambuch.in <courtyard@jambuch.in>",
    to: admin,
    replyTo: s.email,
    subject: `Courtyard: ${what} from ${s.name}`,
    text: [
      `${s.name} <${s.email}> sent a ${what} (${kindLine(s.form, s.themes)}).`,
      s.title ? `Title: ${s.title}` : s.creator_name ? `Suggested creator: ${s.creator_name}` : "",
      "",
      "Review it: https://jambuch.in/admin/courtyard?tab=requests",
    ].join("\n"),
  });
}

export async function submitContribution(_prev: ContributeState, form: FormData): Promise<ContributeState> {
  const str = (key: string, max = 300) => String(form.get(key) ?? "").trim().slice(0, max);

  // Hidden field that people never see; bots that fill every input land here.
  if (str("website")) return { status: "sent" };

  const db = adminClient();

  // A part sent through a contributor's personal series link: their name and
  // email come from the series, and no confirmation email is needed (the link
  // itself went only to their inbox).
  const seriesToken = str("series_token", 200);
  const series = seriesToken ? await seriesForLink(seriesToken) : null;
  if (seriesToken && (!series || series.status !== "active")) {
    return { status: "error", message: "This series link no longer works. Please ask Jaydeep for a fresh one." };
  }

  // A returning contributor's personal "share more" link: same idea.
  const contributorToken = series ? "" : str("contributor_token", 200);
  const contributor = contributorToken ? await contributorForLink(contributorToken) : null;
  if (contributorToken && !contributor) {
    return { status: "error", message: "This link no longer works. Use “Get your link again” on the Courtyard page." };
  }
  const known = series ?? contributor; // name and email come from the link, and no confirmation is needed

  const kind = series || contributor ? "single_piece" : (str("kind") as SubmissionKind);
  if (!KINDS.includes(kind)) return { status: "error", message: "Please choose what you’d like to send." };
  const name = known ? known.name : str("name", 200);
  const email = known ? known.email : str("email", 320).toLowerCase();
  const pieceForm = str("form");
  const themes = [...new Set(form.getAll("themes").map(String))];
  if (!name) return { status: "error", message: "Please give your name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please give a valid email: I send a link to confirm it’s you." };
  if (!FORMS.some((f) => f.value === pieceForm)) return { status: "error", message: "Please choose what form it takes." };
  if (themes.length > MAX_THEMES || !themes.every((t) => THEMES.some((x) => x.value === t))) {
    return { status: "error", message: `Please tick at most ${MAX_THEMES} themes.` };
  }

  const row: Record<string, unknown> = {
    kind,
    name,
    email,
    form: pieceForm,
    themes,
    city: series ? series.city : str("city", 120) || contributor?.city || null,
  };
  let links: string[] = [];
  try {
    links = cleanLinks(form.getAll("links").map(String));
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }
  row.links = links;

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  // Starting a series with this piece.
  const startSeries = !series && kind === "single_piece" && form.get("series_start") === "on";
  const seriesTitle = str("series_title", 120);
  const seriesDescription = str("series_description", 1000);

  if (kind === "single_piece") {
    row.title = str("title", 200) || null;
    row.body = str("body", 20000) || null;
    if (!row.title) return { status: "error", message: "Please give your piece a title." };
    if (!row.body && !hasFile && links.length === 0) {
      return { status: "error", message: "Please add the text, a file, or a link to your piece." };
    }
    if (startSeries && !seriesTitle) return { status: "error", message: "Please give your series a name." };
  } else if (kind === "room_request") {
    row.about = str("about", 3000) || null;
    if (!row.about) return { status: "error", message: "Please tell me a little about your work." };
  } else {
    row.creator_name = str("creator_name", 200) || null;
    row.relation = str("relation", 120) || null;
    row.why = str("why", 3000) || null;
    // Optional; only Jaydeep sees it, and nothing is ever sent to it automatically.
    const contact = str("creator_contact", 320);
    if (contact && !EMAIL_RE.test(contact) && contact.replace(/\D/g, "").length < 8) {
      return { status: "error", message: "Their contact should be an email address or a phone number, or leave it empty." };
    }
    row.creator_contact = contact || null;
    row.creator_aware = form.get("creator_aware") === "on";
    if (!row.creator_name) return { status: "error", message: "Please give the creator’s name." };
    if (!row.why) return { status: "error", message: "Please say why they deserve a room, with a sample if you can." };
  }

  if (kind !== "suggestion") {
    row.own_work = form.get("own_work") === "on";
    row.permission = form.get("permission") === "on";
    row.family_only = form.get("family_only") === "on";
    if (!row.own_work || !row.permission) {
      return { status: "error", message: "Please tick both boxes: that it’s your own work, and that I may publish it." };
    }
  }

  if (hasFile) {
    if (kind !== "single_piece") return { status: "error", message: "Files can only be attached to a single piece." };
    if (!FILE_TYPES[file.type]) return { status: "error", message: "Please attach a photo (JPG, PNG, WebP), audio (MP3, M4A, WAV) or a PDF." };
    if (file.size > MAX_FILE_BYTES) {
      return { status: "error", message: "That file is over 4 MB. For longer audio or video, please share a link instead." };
    }
  }

  if (!(await passesTurnstile(str("cf-turnstile-response", 4096), TURNSTILE_ACTION))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  // "Pick up this thread": only from a piece that is on the public thread.
  const threadFrom = str("thread_from", 64);
  if (kind === "single_piece" && /^[0-9a-f-]{36}$/i.test(threadFrom)) {
    const { data: parent } = await db
      .from("courtyard_submissions")
      .select("id")
      .eq("id", threadFrom)
      .eq("kind", "single_piece")
      .eq("status", "published")
      .eq("family_only", false)
      .is("deleted_at", null)
      .maybeSingle();
    if (parent) row.thread_from = parent.id;
  }

  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? sha256(`${process.env.CRON_SECRET ?? ""}:${ip}`) : null;
  row.ip_hash = ipHash;

  // Rate limits count everything sent in the last day, confirmed or not.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (series) {
    const { count } = await db
      .from("courtyard_submissions")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id)
      .gte("created_at", since);
    if ((count ?? 0) >= PER_SERIES_PER_DAY) {
      return { status: "error", message: "You’ve sent several parts today. Please send the next one tomorrow." };
    }
  } else {
    const { count: byEmail } = await db
      .from("courtyard_submissions")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    const { count: byIp } = ipHash
      ? await db.from("courtyard_submissions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since)
      : { count: 0 };
    if ((byEmail ?? 0) >= PER_EMAIL_PER_DAY || (byIp ?? 0) >= PER_IP_PER_DAY) {
      return { status: "error", message: "You’ve sent several things today. Please try again tomorrow." };
    }
  }

  // One open series per contributor.
  let newSeriesId: string | null = null;
  if (startSeries) {
    const { data: open } = await db
      .from("courtyard_series")
      .select("title")
      .eq("email", email)
      .in("status", ["pending", "active", "paused"])
      .is("deleted_at", null)
      .maybeSingle();
    if (open) {
      return {
        status: "error",
        message: `You already have a series, “${open.title}”. Please add to it with your personal link, or untick “first part of a series”.`,
      };
    }
  }

  // The file goes to the private bucket: nothing is public until approved.
  if (hasFile) {
    const problem = r2Problem();
    if (problem) {
      console.error("courtyard upload unavailable:", problem);
      return { status: "error", message: "Files can’t be received just now. Please share a link instead." };
    }
    const key = `submissions/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${FILE_TYPES[file.type]}`;
    try {
      row.file_url = await uploadPrivate(key, await file.arrayBuffer(), file.type);
      row.file_type = file.type;
      row.file_name = file.name.slice(0, 200);
    } catch (err) {
      console.error("courtyard upload failed:", err);
      return { status: "error", message: "The file didn’t upload. Please try again, or share a link instead." };
    }
  }

  async function undo(submissionId: string | null) {
    if (submissionId) await db.from("courtyard_submissions").delete().eq("id", submissionId);
    if (newSeriesId) await db.from("courtyard_series").delete().eq("id", newSeriesId).eq("status", "pending");
    const ref = fileRef(row.file_url);
    if (ref) await deleteForever(ref).catch((err) => console.error("courtyard: orphan file cleanup failed:", err));
  }

  if (startSeries) {
    const { data: created, error: seriesErr } = await db
      .from("courtyard_series")
      .insert({
        slug: seriesSlug(seriesTitle),
        title: seriesTitle,
        description: seriesDescription || null,
        name,
        email,
        city: row.city,
        form: pieceForm,
        themes,
      })
      .select("id")
      .single();
    if (seriesErr) {
      console.error("courtyard series insert failed:", seriesErr.message);
      await undo(null);
      return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
    }
    newSeriesId = created.id;
    row.series_id = created.id;
  }

  // Through a personal link (series or contributor) it arrives confirmed.
  let token: string | null = null;
  if (series) row.series_id = series.id;
  if (known) {
    row.status = "new";
    row.confirmed_at = new Date().toISOString();
  } else {
    token = randomBytes(32).toString("base64url");
    row.confirm_token_hash = sha256(token);
  }

  const { data: saved, error } = await db.from("courtyard_submissions").insert(row).select("id").single();
  if (error) {
    console.error("courtyard submission insert failed:", error.message);
    await undo(null);
    return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
  }

  if (known) {
    await notifyAdmin({
      kind,
      name,
      email,
      form: pieceForm,
      themes,
      title: row.title as string,
      creator_name: null,
      seriesTitle: series?.title ?? (startSeries ? seriesTitle : null),
      seriesFirst: !series && startSeries,
    });
    return { status: "sent", direct: true };
  }

  const link = `${await siteUrl()}/courtyard/confirm/${token}`;
  const what =
    kind === "single_piece"
      ? startSeries
        ? `your piece “${row.title}”, the first part of your series “${seriesTitle}”`
        : `your piece “${row.title}”`
      : kind === "room_request"
        ? "your request for a room"
        : `your suggestion of ${row.creator_name}`;
  const emailed = await sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: email,
    subject: "Please confirm what you sent to the Courtyard",
    text: [
      `Dear ${name.split(" ")[0]},`,
      "",
      `Thank you for sending ${what} to the Courtyard at jambuch.in.`,
      "",
      `Please confirm it was you by opening this link within ${CONFIRM_DAYS} days:`,
      link,
      "",
      "Until you confirm, it doesn’t reach me. If you didn’t send anything, ignore this email and it will be removed.",
      "",
      "Jaydeep",
    ].join("\n"),
  });
  if (!emailed) {
    // Without its confirmation email the submission can never be confirmed:
    // remove it (and its file and new series) so the attempt doesn't count
    // against the sender's daily limit.
    await undo(saved.id);
    return { status: "error", message: "I couldn’t send the confirmation email. Please check the address and try again." };
  }
  return { status: "sent" };
}

// "Shared here before? Get your link again." Always the same answer, so the
// form never reveals who has contributed; the email goes only to the address
// on record, at most once every 10 minutes.
export async function resendMyLink(_prev: ContributeState, form: FormData): Promise<ContributeState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  if (String(form.get("website") ?? "")) return { status: "sent" };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please give a valid email address." };
  if (!(await passesTurnstile(String(form.get("cf-turnstile-response") ?? ""), "getlink"))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }
  const db = adminClient();
  const [{ data: c }, { data: s }] = await Promise.all([
    db.from("courtyard_contributors").select("id, name, link_version, link_sent_at").eq("email", email).is("deleted_at", null).maybeSingle(),
    db
      .from("courtyard_series")
      .select("id, title, name, add_link_version")
      .eq("email", email)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  const recent = c?.link_sent_at && Date.now() - new Date(c.link_sent_at).getTime() < 10 * 60 * 1000;
  if ((c || s) && !recent) {
    const site = await siteUrl();
    const lines = [`Dear ${(c?.name ?? s!.name).split(" ")[0]},`, "", "Here are your personal links for the Courtyard at jambuch.in:", ""];
    if (c) lines.push("To share another piece:", contributorUrl(site, c), "");
    if (s) lines.push(`To add the next part of “${s.title}”:`, seriesAddUrl(site, { id: s.id, add_link_version: s.add_link_version }), "");
    lines.push("Keep them to yourself: they send work under your name.", "", "Jaydeep");
    await sendEmail({
      from: "Jaydeep Buch <courtyard@jambuch.in>",
      to: email,
      subject: "Your personal links for the Courtyard",
      text: lines.join("\n"),
    });
    if (c) await db.from("courtyard_contributors").update({ link_sent_at: new Date().toISOString() }).eq("id", c.id);
  }
  return { status: "sent" };
}

// Clicked from the confirmation email: the submission reaches the admin.
export async function confirmSubmission(token: string): Promise<{ ok: boolean; kind?: SubmissionKind }> {
  if (!token || token.length > 200) return { ok: false };
  const db = adminClient();
  const cutoff = new Date(Date.now() - CONFIRM_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("courtyard_submissions")
    .update({ status: "new", confirmed_at: new Date().toISOString(), confirm_token_hash: null })
    .eq("confirm_token_hash", sha256(token))
    .eq("status", "unconfirmed")
    .gte("created_at", cutoff)
    .is("deleted_at", null)
    .select("kind, name, email, form, themes, title, creator_name, series_id")
    .maybeSingle();
  if (error || !data) return { ok: false };

  // A confirmed submission with a series is always that series' first part
  // (later parts come through the personal link, already confirmed).
  let seriesTitle: string | null = null;
  if (data.series_id) {
    const { data: s } = await db.from("courtyard_series").select("title").eq("id", data.series_id).maybeSingle();
    seriesTitle = s?.title ?? null;
  }
  await notifyAdmin({ ...(data as Parameters<typeof notifyAdmin>[0]), seriesTitle, seriesFirst: !!seriesTitle });
  return { ok: true, kind: data.kind as SubmissionKind };
}
