import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entryLabel, entryPath } from "./book-sections";
import { kindLine } from "./courtyard";
import { sendEmailBatch } from "./email";
import { DEFAULT_GATHERING, WEEKDAYS, gatheringDay, nextGathering, parseGathering } from "./gathering";
import { readerStopUrl } from "./series";

// The Sunday letter: one email per weekly gathering, to confirmed readers,
// listing the pieces that joined the thread and the chapters that opened in
// the moving library since the last letter. Sent by
// the 15-minute job within a few hours of the gathering, or by Jaydeep from
// the admin. Never empty, never twice for the same gathering.

const SEND_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function letterSettings(db: SupabaseClient) {
  const [{ data: g }, { data: l }] = await Promise.all([
    db.from("settings").select("value").eq("key", "courtyard.gathering").maybeSingle(),
    db.from("settings").select("value").eq("key", "courtyard.letter").maybeSingle(),
  ]);
  return {
    gathering: parseGathering(g?.value ?? DEFAULT_GATHERING),
    auto: (l?.value as { auto?: boolean } | null)?.auto !== false,
  };
}

// The most recent scheduled gathering at or before now.
export function lastGathering(setting: ReturnType<typeof parseGathering>, now = new Date()) {
  return nextGathering(setting, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
}

// Pieces that have joined the thread but not yet been in a letter.
export async function letterPieces(db: SupabaseClient) {
  const { data, error } = await db
    .from("courtyard_submissions")
    .select("id, name, city, title, form, themes, series_id, series_part, gathering_at")
    .eq("kind", "single_piece")
    .eq("status", "published")
    .eq("family_only", false)
    .lte("gathering_at", new Date().toISOString())
    .is("letter_sent_at", null)
    .is("deleted_at", null)
    .order("gathering_at", { ascending: true })
    .order("published_at", { ascending: true })
    .limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Chapters that opened for reading but haven't been in a letter yet.
export async function letterChapters(db: SupabaseClient) {
  const { data, error } = await db
    .from("chapters")
    .select("id, number, section, title, works!inner(slug, title, title_gu)")
    .eq("status", "ready")
    .eq("published", true)
    .not("body", "is", null)
    .is("letter_sent_at", null)
    .is("deleted_at", null)
    .eq("works.published", true)
    .eq("works.readable", true)
    .is("works.deleted_at", null)
    .order("number", { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => {
    const work = (Array.isArray(c.works) ? c.works[0] : c.works) as { slug: string; title: string; title_gu: string | null };
    return { ...c, work };
  });
}

type Result = { status: "sent" | "skipped" | "not_due" | "already" | "nothing" | "off"; recipients?: number; pieces?: number };

export async function sendGatheringLetter(db: SupabaseClient, site: string, opts: { force?: boolean } = {}): Promise<Result> {
  const { gathering, auto } = await letterSettings(db);
  if (!auto && !opts.force) return { status: "off" };
  const at = lastGathering(gathering);
  if (!opts.force && Date.now() - at.getTime() > SEND_WINDOW_MS) return { status: "not_due" };

  const { data: existing } = await db.from("courtyard_letters").select("id, status").eq("gathering_at", at.toISOString()).maybeSingle();
  if (existing && (existing.status === "sent" || existing.status === "sending")) return { status: "already" };
  if (existing && !opts.force) return { status: "already" }; // skipped automatically; only a manual send retries

  const [pieces, chapters] = await Promise.all([letterPieces(db), letterChapters(db)]);
  if (pieces.length === 0 && chapters.length === 0) {
    if (!existing) await db.from("courtyard_letters").insert({ gathering_at: at.toISOString(), status: "skipped" });
    return { status: opts.force ? "nothing" : "skipped" };
  }

  // Claim this gathering's letter (the unique gathering_at stops a double send).
  if (existing) {
    const { data: claimed } = await db
      .from("courtyard_letters")
      .update({ status: "sending" })
      .eq("id", existing.id)
      .eq("status", "skipped")
      .select("id")
      .maybeSingle();
    if (!claimed) return { status: "already" };
  } else {
    const { error } = await db.from("courtyard_letters").insert({ gathering_at: at.toISOString(), status: "sending" });
    if (error) return { status: "already" };
  }

  const seriesIds = [...new Set(pieces.map((p) => p.series_id).filter((x): x is string => !!x))];
  const seriesTitles = new Map<string, string>();
  if (seriesIds.length) {
    const { data } = await db.from("courtyard_series").select("id, title").in("id", seriesIds);
    for (const s of data ?? []) seriesTitles.set(s.id, s.title);
  }
  const lines = pieces.flatMap((p) => {
    const series = p.series_id ? seriesTitles.get(p.series_id) : null;
    return [
      `• ${series ? `${series} · Part ${p.series_part}: ` : ""}${p.title}`,
      `  by ${p.name}${p.city ? `, ${p.city}` : ""} · ${kindLine(p.form, p.themes)}`,
      `  ${site}/courtyard#piece-${p.id}`,
      "",
    ];
  });

  const chapterLines = chapters.flatMap((c) => [
    `• ${c.work.title_gu ?? c.work.title} · ${c.section ? entryLabel(c) : `પ્રકરણ ${c.number}`}: ${c.title}`,
    `  ${site}${entryPath(c.work.slug, c)}`,
    "",
  ]);

  const { data: readers } = await db.from("courtyard_readers").select("id, name, email").not("confirmed_at", "is", null);
  const day = gatheringDay(at).replace(/,? \d{4}$/, "");
  const sent = await sendEmailBatch(
    (readers ?? []).map((r) => ({
      from: "The Courtyard at jambuch.in <courtyard@jambuch.in>",
      to: r.email,
      replyTo: process.env.ADMIN_EMAIL,
      subject: `The ${WEEKDAYS[gathering.weekday]} gathering · ${day}`,
      unsubscribeUrl: readerStopUrl(site, r.id),
      text: [
        `Dear ${r.name.split(" ")[0]},`,
        "",
        ...(pieces.length
          ? [
              `This week, ${pieces.length === 1 ? "one piece joined" : `${pieces.length} pieces joined`} the Courtyard at jambuch.in:`,
              "",
              ...lines,
              `Read the whole thread: ${site}/courtyard#thread`,
              "",
            ]
          : []),
        ...(chapters.length
          ? [
              chapters.length === 1
                ? "A new chapter opened in the moving library:"
                : `${chapters.length} new chapters opened in the moving library:`,
              "",
              ...chapterLines,
            ]
          : []),
        "Warmly,",
        "Jaydeep",
        "",
        "—",
        "You get this because you asked for the Sunday letter.",
        `Stop the letter: ${readerStopUrl(site, r.id)}`,
      ].join("\n"),
    })),
  );

  const now = new Date().toISOString();
  if (pieces.length) {
    await db
      .from("courtyard_submissions")
      .update({ letter_sent_at: now })
      .in(
        "id",
        pieces.map((p) => p.id),
      );
  }
  if (chapters.length) {
    await db
      .from("chapters")
      .update({ letter_sent_at: now })
      .in(
        "id",
        chapters.map((c) => c.id),
      );
  }
  await db
    .from("courtyard_letters")
    .update({ status: "sent", sent_at: now, recipients: sent, piece_ids: pieces.map((p) => p.id) })
    .eq("gathering_at", at.toISOString());
  return { status: "sent", recipients: sent, pieces: pieces.length };
}
