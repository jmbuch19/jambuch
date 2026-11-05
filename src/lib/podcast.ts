import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productionHash } from "@/lib/audio";
import { guNumber } from "@/lib/library";
import { publicUrlFor, readPublic } from "@/lib/r2";

// The Ramayana podcast feed (docs/00-Claude-Code-AV-Pipeline-System-Prompt.md
// §9.5). Spotify, Apple and the rest poll feed.xml; this builds it from the
// uploaded audio plays and checks every rule before it may be published.

export const WORK_SLUG = "ramayana";
export const FEED_KEY = "podcast/ramayan/feed.xml";
export const FEED_BAK_KEY = "podcast/ramayan/feed.xml.bak";

export type Show = {
  title: string;
  author: string;
  description: string;
  email: string;
  coverUrl: string;
  link: string;
};
export const DEFAULT_SHOW: Show = {
  title: "રામાયણ — ચક્રવર્તી રાજગોપાલાચારી (અનુ. નલિનકાંત છાયા)",
  author: "Jaydeep Buch · jambuch.in",
  description:
    "ચક્રવર્તી રાજગોપાલાચારીનું રામાયણ, નલિનકાંત છાયાના ગુજરાતી અનુવાદમાં — પ્રકરણે પ્રકરણે, પાત્રોના અવાજ, સંગીત અને ધ્વનિ સાથેના શ્રાવ્ય નાટક રૂપે.",
  email: "",
  coverUrl: "",
  link: "https://jambuch.in/library/ramayana",
};

// A GUID is permanent: written once from the chapter number, never derived from a URL, a hash or a time.
export const guidFor = (c: { number: number | null; section: string | null }) =>
  c.section === "preface" ? "ramayan-preface" : c.number != null && !c.section ? `ramayan-ch${String(c.number).padStart(2, "0")}` : null;

export type EpisodeRow = {
  chapterId: string;
  number: number | null;
  section: string | null;
  title: string;
  guid: string;
  stored: boolean; // has a podcast_episodes row
  included: boolean;
  description: string;
  firstPublishedAt: string | null;
  audio: { url: string; durationMs: number; current: boolean; paused: boolean } | null;
};

export async function loadShow(db: SupabaseClient): Promise<Show> {
  const { data } = await db.from("settings").select("value").eq("key", "podcast.show").maybeSingle();
  return { ...DEFAULT_SHOW, ...((data?.value as Partial<Show>) ?? {}) };
}

// Every chapter that can be an episode (the preface, and the numbered chapters), in book order.
export async function loadEpisodes(db: SupabaseClient): Promise<EpisodeRow[]> {
  const { data: work, error } = await db.from("works").select("id").eq("slug", WORK_SLUG).maybeSingle();
  if (error || !work) throw new Error(error?.message ?? "The Ramayana is not in the library.");
  const [chaptersRes, audioRes, rowsRes] = await Promise.all([
    db.from("chapters").select("id, number, section, title, body").eq("work_id", work.id).is("deleted_at", null),
    db.from("chapter_audio").select("chapter_id, url, duration_ms, text_hash, paused").eq("voice", "play"),
    db.from("podcast_episodes").select("chapter_id, guid, included, description, first_published_at"),
  ]);
  if (chaptersRes.error) throw new Error(chaptersRes.error.message);
  if (rowsRes.error) throw new Error(rowsRes.error.message);
  const plays = new Map((audioRes.data ?? []).map((a) => [a.chapter_id as string, a]));
  const rows = new Map((rowsRes.data ?? []).map((r) => [r.chapter_id as string, r]));
  return (chaptersRes.data ?? [])
    .filter((c) => guidFor(c))
    .sort((a, b) => (a.section === "preface" ? -1 : b.section === "preface" ? 1 : (a.number ?? 0) - (b.number ?? 0)))
    .map((c) => {
      const p = plays.get(c.id);
      const r = rows.get(c.id);
      return {
        chapterId: c.id,
        number: c.number,
        section: c.section,
        title: c.title,
        guid: r?.guid ?? guidFor(c)!,
        stored: !!r,
        included: r?.included ?? !!p,
        description: r?.description ?? "",
        firstPublishedAt: r?.first_published_at ?? null,
        audio: p
          ? { url: p.url, durationMs: p.duration_ms, current: p.text_hash === productionHash(c.body), paused: !!p.paused }
          : null,
      };
    });
}

// "પ્રકરણ ૪૭ — પવનપુત્ર"; the preface keeps its own title.
export const episodeTitle = (e: Pick<EpisodeRow, "number" | "section" | "title">) =>
  e.section === "preface" ? e.title : `પ્રકરણ ${guNumber(e.number ?? 0)} — ${e.title}`;

const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hms = (ms: number) => {
  const s = Math.round(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

type FeedItem = { e: EpisodeRow; length: number; pubDate: Date };

function feedXml(show: Show, items: FeedItem[], feedUrl: string) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${cdata(show.title)}</title>`,
    `<link>${attr(show.link)}</link>`,
    `<atom:link href="${attr(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    "<language>gu</language>",
    `<description>${cdata(show.description)}</description>`,
    `<itunes:author>${cdata(show.author)}</itunes:author>`,
    `<itunes:owner><itunes:name>${cdata(show.author)}</itunes:name><itunes:email>${attr(show.email)}</itunes:email></itunes:owner>`,
    `<itunes:image href="${attr(show.coverUrl)}"/>`,
    '<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Hinduism"/></itunes:category>',
    "<itunes:explicit>false</itunes:explicit>",
    "<itunes:type>serial</itunes:type>",
  ];
  for (const { e, length, pubDate } of items) {
    const trailer = e.section === "preface";
    out.push(
      "<item>",
      `<title>${cdata(episodeTitle(e))}</title>`,
      `<itunes:title>${cdata(episodeTitle(e))}</itunes:title>`,
      trailer ? "<itunes:episodeType>trailer</itunes:episodeType>" : `<itunes:episodeType>full</itunes:episodeType><itunes:episode>${e.number}</itunes:episode>`,
      `<description>${cdata(e.description)}</description>`,
      `<enclosure url="${attr(e.audio!.url)}" length="${length}" type="audio/mpeg"/>`,
      `<guid isPermaLink="false">${e.guid}</guid>`,
      `<pubDate>${pubDate.toUTCString()}</pubDate>`,
      `<itunes:duration>${hms(e.audio!.durationMs)}</itunes:duration>`,
      // Square episode art does not exist yet: the show cover stands in (never a stretched 16:9 picture).
      `<itunes:image href="${attr(show.coverUrl)}"/>`,
      "</item>",
    );
  }
  out.push("</channel>", "</rss>");
  return out.join("\n");
}

// A small well-formedness check: every element closes, in order (CDATA skipped).
function wellFormed(xml: string) {
  const body = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (!close) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

// The previous published feed's episodes: GUID → episode number (null for the trailer).
function previousEpisodes(xml: string) {
  const out = new Map<string, number | null>();
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const guid = item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim();
    const ep = item.match(/<itunes:episode>(\d+)<\/itunes:episode>/)?.[1];
    if (guid) out.set(guid, ep ? Number(ep) : null);
  }
  return out;
}

export type FeedCheck = {
  xml: string | null;
  problems: string[]; // any one of these stops publishing
  notes: string[];
  episodes: { chapterId: string; guid: string; title: string; length: number; pubDate: string; pubDateIso: string; isNew: boolean }[];
  feedUrl: string | null;
};

// Builds the whole feed from scratch and checks every rule. Nothing is written.
export async function checkFeed(db: SupabaseClient, now = new Date()): Promise<FeedCheck> {
  const problems: string[] = [];
  const notes: string[] = [];
  const show = await loadShow(db);
  const feedUrl = publicUrlFor(FEED_KEY);
  if (!feedUrl) problems.push("The public media address (NEXT_PUBLIC_R2_PUBLIC_URL) is not set.");
  for (const [k, label] of [["title", "Show title"], ["author", "Author"], ["description", "Show description"], ["email", "Owner email"], ["coverUrl", "Show cover"], ["link", "Website link"]] as const) {
    if (!show[k].trim()) problems.push(`${label} is missing.`);
  }

  const all = await loadEpisodes(db);
  const chosen = all.filter((e) => e.included);
  if (!chosen.length) problems.push("No episodes are chosen.");

  // New episodes going out together get dates one second apart, in book
  // order and ending at `now`, so apps that sort by date keep the order.
  const fresh = chosen.filter((e) => !e.firstPublishedAt);
  const dateFor = (e: EpisodeRow) =>
    e.firstPublishedAt ? new Date(e.firstPublishedAt) : new Date(now.getTime() - (fresh.length - 1 - fresh.indexOf(e)) * 1000);

  const items: FeedItem[] = [];
  for (const e of chosen) {
    const name = episodeTitle(e);
    if (!e.audio) {
      problems.push(`${name}: no audio play uploaded.`);
      continue;
    }
    if (!e.audio.current) problems.push(`${name}: the audio play is out of date with the text.`);
    if (e.audio.paused) problems.push(`${name}: the audio play is paused on the site.`);
    if (!e.description.trim()) problems.push(`${name}: no episode description.`);
    // The exact byte count, read from storage — never estimated.
    let length = 0;
    try {
      const res = await fetch(e.audio.url, { method: "HEAD", cache: "no-store" });
      length = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || !length) problems.push(`${name}: the audio file did not answer properly (${res.status}).`);
    } catch {
      problems.push(`${name}: the audio file could not be reached.`);
    }
    items.push({ e, length, pubDate: dateFor(e) });
  }

  // GUIDs must match the last published feed, and no published episode may drop out.
  const prevBytes = feedUrl ? await readPublic(FEED_KEY).catch(() => null) : null;
  if (prevBytes) {
    const prev = previousEpisodes(new TextDecoder().decode(prevBytes));
    const ours = new Map(items.map((i) => [i.e.guid, i.e.section === "preface" ? null : i.e.number]));
    for (const [guid, ep] of prev) {
      if (!ours.has(guid)) problems.push(`${guid} is in the published feed but would be dropped. Published episodes must stay.`);
      else if (ours.get(guid) !== ep) problems.push(`${guid} has changed its episode number. A GUID's episode never changes.`);
    }
    notes.push(`Checked against the published feed (${prev.size} episodes).`);
  } else {
    notes.push("No feed has been published yet: this will be the first.");
  }

  const xml = problems.length && !items.length ? null : feedXml(show, items, feedUrl ?? "");
  if (xml && !wellFormed(xml)) problems.push("The feed is not well-formed XML.");
  return {
    xml,
    problems,
    notes,
    feedUrl,
    episodes: items.map((i) => ({
      chapterId: i.e.chapterId,
      guid: i.e.guid,
      title: episodeTitle(i.e),
      length: i.length,
      pubDate: i.pubDate.toUTCString(),
      pubDateIso: i.pubDate.toISOString(),
      isNew: !i.e.firstPublishedAt,
    })),
  };
}
