import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { readPrivate } from "@/lib/r2";

// The shared sound library (the engine's asset cards; owner's decision, 25 Nov 2026).
//
// The engine repo (private, owned by the home PC) keeps one card per sound. Its export
// writes ONLY the client-safe cards to the private R2 bucket as one file:
//   media/assets/catalog.json  { exported_at, cards: Card[] }
// with each card's audio at card.file (media/assets/<kind>/<id>.mp3). Nothing from the
// engine repo is copied into this public repo.
//
// Selection (the engine's rule 7): only status "client-ready" with client_use "yes", or
// "yes-online" for online-only delivery; prefer a high asset_scores score; rotate so the same
// sound isn't reused for recent writers; a seed from the request breaks ties. Every pick is
// logged in asset_usage. When the library has nothing for a tag, Freesound is the fallback
// (CC0, or CC BY with an automatic credit line; NonCommercial never).

export type Card = {
  id: string;
  kind: "music" | "sfx";
  file: string;
  source: string;
  licence: string;
  client_use: "yes" | "yes-online" | "pending" | "no";
  attribution: string | null;
  status: "todo" | "trial" | "client-ready" | "retired";
  mood_tags?: string[];
  instruments?: string[];
  energy?: number;
  type?: string;
  setting?: string[];
  use?: "bed" | "one-shot";
  length_s?: number;
  prompt?: string;
};

const CATALOG_KEY = "media/assets/catalog.json";
const ROTATE_RECENT = 20; // the uniqueness rule's 20-order window

let cache: { at: number; cards: Card[] } | null = null;

// Client-safe cards only (checked again here, whatever the export contains).
export async function catalog(): Promise<Card[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.cards;
  let cards: Card[] = [];
  try {
    const raw = JSON.parse(new TextDecoder().decode(await readPrivate(CATALOG_KEY))) as { cards?: Card[] };
    cards = (raw.cards ?? []).filter(
      (c) =>
        (c.kind === "music" || c.kind === "sfx") &&
        c.status === "client-ready" &&
        (c.client_use === "yes" || c.client_use === "yes-online") &&
        typeof c.file === "string" &&
        c.file.startsWith("media/assets/") &&
        !/non-?commercial|by-nc/i.test(c.licence ?? "") &&
        // CC BY needs its credit line; a card without one is not used.
        (!/\bCC BY\b|creativecommons\.org\/licenses\/by\//i.test(c.licence ?? "") || !!c.attribution),
    );
  } catch {
    cards = []; // no export yet: everything falls back to Freesound
  }
  cache = { at: Date.now(), cards };
  return cards;
}

// The site's style words (vocabulary.ts) → what a card must show. Words of the cards come
// from the engine's measurements (mood_tags, instruments, type, setting) and its prompt.
const MOOD_TO_CARD: Record<string, string[]> = {
  warm: ["calm", "romantic", "devotional"],
  devotional: ["devotional"],
  suspenseful: ["tension", "mysterious"],
  funny: ["festive"],
  sad: ["sorrow"],
  inspiring: ["triumph", "heroic", "majestic"],
  nostalgic: ["calm", "sorrow"],
  mysterious: ["mysterious", "dark"],
  calm: ["calm"],
  dramatic: ["tension", "majestic", "war"],
};
const INSTRUMENT_TO_CARD: Record<string, string[]> = {
  flute: ["flute", "bansuri"],
  bansuri: ["bansuri", "flute"],
  sitar: ["sitar"],
  santoor: ["santoor"],
  sarangi: ["sarangi"],
  shehnai: ["shehnai"],
  tabla: ["tabla"],
  dholak: ["dhol", "drums"],
  "tanpura-drone": ["tanpura"],
  strings: ["strings"],
  "folk-gujarati": ["dhol", "shehnai"],
};
// Effects: words searched in the card's id, type, setting and prompt.
const SOUND_WORDS: Record<string, RegExp> = {
  rain: /\brain/i,
  "monsoon-storm": /storm|heavy rain|monsoon/i,
  thunder: /thunder/i,
  wind: /\bwind/i,
  river: /river|stream|water flow/i,
  sea: /\bsea\b|ocean|waves/i,
  "birds-morning": /bird|dawn chorus/i,
  "crickets-night": /cricket|night insects/i,
  "temple-bells": /temple bell|\bbells?\b/i,
  conch: /conch/i,
  footsteps: /footstep|running|walking|jogging/i,
  door: /\bdoor/i,
  "bullock-cart": /cart|wheels/i,
  horse: /horse|gallop/i,
  "village-crowd": /crowd|village|people murmur/i,
  market: /market|bazaar|city crowd/i,
  train: /\btrain\b/i,
  fire: /fire|flame|bonfire|campfire/i,
  cooking: /cooking|kitchen|sizzl/i,
  "children-playing": /children|kids play/i,
};

const words = (c: Card) => [c.id, c.type, ...(c.setting ?? []), c.prompt ?? ""].join(" ");

export function musicMatches(c: Card, music: string[], mood: string | null) {
  if (c.kind !== "music") return 0;
  let score = 0;
  for (const m of music) for (const inst of INSTRUMENT_TO_CARD[m] ?? []) if (c.instruments?.includes(inst)) score += 2;
  if (mood) for (const t of MOOD_TO_CARD[mood] ?? []) if (c.mood_tags?.includes(t)) score += 1;
  if (music.includes("sparse") && (c.energy ?? 5) <= 3) score += 1;
  return score;
}

export function soundMatches(c: Card, sound: string) {
  if (c.kind !== "sfx") return false;
  const re = SOUND_WORDS[sound];
  return !!re && re.test(words(c));
}

// Scores and recent use from Supabase (asset_scores view, asset_usage table).
async function history(ids: string[]) {
  if (!ids.length) return { score: new Map<string, number>(), recent: new Set<string>() };
  const db = adminClient();
  const [{ data: scores }, { data: recentRows }] = await Promise.all([
    db.from("asset_scores").select("asset_id, score").in("asset_id", ids),
    db.from("asset_usage").select("asset_id, order_id").eq("source", "order").order("used_at", { ascending: false }).limit(400),
  ]);
  const score = new Map<string, number>((scores ?? []).map((s) => [s.asset_id as string, Number(s.score) || 0]));
  // Assets used by the last ROTATE_RECENT different orders.
  const orders: string[] = [];
  const recent = new Set<string>();
  for (const r of recentRows ?? []) {
    if (!orders.includes(r.order_id)) orders.push(r.order_id);
    if (orders.length > ROTATE_RECENT) break;
    recent.add(r.asset_id);
  }
  return { score, recent };
}

// A small seeded random number (same request → same order of ties).
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Best candidates first: match strength, then score, then not used recently, then the seed.
async function rank(cands: { card: Card; match: number }[], seed: string) {
  const { score, recent } = await history(cands.map((c) => c.card.id));
  const rnd = seeded(seed);
  return cands
    .map((c) => ({ ...c, s: score.get(c.card.id) ?? 0, fresh: recent.has(c.card.id) ? 0 : 1, r: rnd() }))
    .sort((a, b) => b.match - a.match || b.fresh - a.fresh || b.s - a.s || b.r - a.r)
    .map((c) => c.card);
}

export async function pickMusic(music: string[], mood: string | null, seed: string): Promise<Card | null> {
  const cards = await catalog();
  const cands = cards.map((card) => ({ card, match: musicMatches(card, music, mood) })).filter((c) => c.match > 0 && (c.card.use ?? "bed") !== "one-shot");
  return (await rank(cands, seed))[0] ?? null;
}

export async function pickEffect(sound: string, seed: string, avoid: Set<string>): Promise<Card | null> {
  const cards = await catalog();
  const cands = cards.filter((card) => !avoid.has(card.id) && soundMatches(card, sound)).map((card) => ({ card, match: 1 }));
  return (await rank(cands, seed))[0] ?? null;
}

// Logged for every library or Freesound sound placed in an order or sample.
export async function logUsage(rows: { order_id: string; asset_id: string; asset_kind: "music" | "sfx"; role: string }[]) {
  if (!rows.length) return;
  const { error } = await adminClient()
    .from("asset_usage")
    .insert(rows.map((r) => ({ ...r, source: "order", reaction: "none" })));
  if (error) console.error("asset_usage not logged:", error.message);
}

// Which of the site's sound and music words have no client-safe card yet (for step 2: two
// CC0 Freesound sounds per empty tag, for the admin's approval).
export async function emptyTags() {
  const cards = await catalog();
  const music = Object.keys(INSTRUMENT_TO_CARD).filter((m) => !cards.some((c) => musicMatches(c, [m], null) > 0));
  const moods = Object.keys(MOOD_TO_CARD).filter((m) => !cards.some((c) => musicMatches(c, [], m) > 0));
  const sounds = Object.keys(SOUND_WORDS).filter((s) => !cards.some((c) => soundMatches(c, s)));
  return { cards: cards.length, music, moods, sounds };
}
