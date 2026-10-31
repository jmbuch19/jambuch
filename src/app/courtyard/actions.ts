"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { CATEGORIES, FILE_TYPES, KIND_LABELS, MAX_FILE_BYTES, categoryLabel, type SubmissionKind } from "@/lib/courtyard";
import { sendEmail } from "@/lib/email";
import { deleteForever, fileRef, r2Problem, uploadPrivate } from "@/lib/r2";
import { adminClient } from "@/lib/supabase-admin";
import { passesTurnstile } from "@/lib/turnstile";

export type ContributeState = { status: "idle" | "sent" | "error"; message?: string };

// Must match the action passed to turnstile.render in contribute-form.tsx.
const TURNSTILE_ACTION = "courtyard";
const PER_EMAIL_PER_DAY = 3;
const PER_IP_PER_DAY = 6;
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

export async function submitContribution(_prev: ContributeState, form: FormData): Promise<ContributeState> {
  const str = (key: string, max = 300) => String(form.get(key) ?? "").trim().slice(0, max);

  // Hidden field that people never see; bots that fill every input land here.
  if (str("website")) return { status: "sent" };

  const kind = str("kind") as SubmissionKind;
  if (!KINDS.includes(kind)) return { status: "error", message: "Please choose what you’d like to send." };
  const name = str("name", 200);
  const email = str("email", 320).toLowerCase();
  const category = str("category");
  if (!name) return { status: "error", message: "Please give your name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please give a valid email: I send a link to confirm it’s you." };
  if (!CATEGORIES.some((c) => c.value === category)) return { status: "error", message: "Please choose a category." };

  const row: Record<string, unknown> = { kind, name, email, category, city: str("city", 120) || null };
  let links: string[] = [];
  try {
    links = cleanLinks(form.getAll("links").map(String));
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }
  row.links = links;

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (kind === "single_piece") {
    row.title = str("title", 200) || null;
    row.body = str("body", 20000) || null;
    if (!row.title) return { status: "error", message: "Please give your piece a title." };
    if (!row.body && !hasFile && links.length === 0) {
      return { status: "error", message: "Please add the text, a file, or a link to your piece." };
    }
  } else if (kind === "room_request") {
    row.about = str("about", 3000) || null;
    if (!row.about) return { status: "error", message: "Please tell me a little about your work." };
  } else {
    row.creator_name = str("creator_name", 200) || null;
    row.relation = str("relation", 120) || null;
    row.why = str("why", 3000) || null;
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

  const db = adminClient();

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

  const token = randomBytes(32).toString("base64url");
  row.confirm_token_hash = sha256(token);
  const { data: saved, error } = await db.from("courtyard_submissions").insert(row).select("id").single();
  if (error) {
    console.error("courtyard submission insert failed:", error.message);
    const ref = fileRef(row.file_url);
    if (ref) await deleteForever(ref).catch(() => {});
    return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
  }

  const link = `${await siteUrl()}/courtyard/confirm/${token}`;
  const what =
    kind === "single_piece" ? `your piece “${row.title}”` : kind === "room_request" ? "your request for a room" : `your suggestion of ${row.creator_name}`;
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
    // remove it (and its file) so the attempt doesn't count against the
    // sender's daily limit.
    await db.from("courtyard_submissions").delete().eq("id", saved.id);
    const ref = fileRef(row.file_url);
    if (ref) await deleteForever(ref).catch((err) => console.error("courtyard: orphan file cleanup failed:", err));
    return { status: "error", message: "I couldn’t send the confirmation email. Please check the address and try again." };
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
    .select("kind, name, email, category, title, creator_name")
    .maybeSingle();
  if (error || !data) return { ok: false };

  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendEmail({
      from: "jambuch.in <courtyard@jambuch.in>",
      to: admin,
      replyTo: data.email,
      subject: `Courtyard: ${KIND_LABELS[data.kind as SubmissionKind].toLowerCase()} from ${data.name}`,
      text: [
        `${data.name} <${data.email}> sent a ${KIND_LABELS[data.kind as SubmissionKind].toLowerCase()} (${categoryLabel(data.category)}).`,
        data.title ? `Title: ${data.title}` : data.creator_name ? `Suggested creator: ${data.creator_name}` : "",
        "",
        "Review it: https://jambuch.in/admin/courtyard?tab=requests",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    });
  }
  return { ok: true, kind: data.kind as SubmissionKind };
}
