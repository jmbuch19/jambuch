import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VOICES, isVoice, type ProductionKey, type VoiceKey } from "./audio-voices";
import { entrySlug } from "./book-sections";
import { guNumber, paragraphs } from "./library";
import { deleteForever, fileRef, uploadPublic } from "./r2";

// Chapters read aloud by Azure's Gujarati voices. Each chapter is made once
// per voice (admin → Listening), saved as an MP3 on media.jambuch.in, and
// every listener plays that file: listeners never call Azure.
//
// The text goes to Azure one paragraph at a time, so the player knows where
// each paragraph starts (to highlight it and follow along) without guessing.

// Bump to mark every recording out of date (e.g. a change in how text is read).
const RECIPE = 1;
const FORMAT = "audio-24khz-48kbitrate-mono-mp3"; // clear speech, about 21 MB an hour
const BYTES_PER_MS = 48_000 / 8 / 1000; // constant bitrate: 6 bytes per millisecond
const PARAGRAPH_PAUSE = "700ms";
const TITLE_PAUSE = "1000ms";
const MAX_PIECE = 3000; // characters per request; long paragraphs are split at sentences
const PARALLEL = 4;

// Which voice reads what: a voice per book, and per chapter where Jaydeep
// wants a different one. Kept in settings ("audio.voices").
export type VoiceChoices = { books: Record<string, VoiceKey>; chapters: Record<string, VoiceKey> };
export const DEFAULT_VOICE: VoiceKey = "niranjan";

export async function loadVoiceChoices(db: SupabaseClient): Promise<VoiceChoices> {
  const { data } = await db.from("settings").select("value").eq("key", "audio.voices").maybeSingle();
  const v = (data?.value ?? {}) as Partial<VoiceChoices>;
  const clean = (o: unknown) =>
    Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter(([, x]) => isVoice(x))) as Record<string, VoiceKey>;
  return { books: clean(v.books), chapters: clean(v.chapters) };
}

export function voiceFor(choices: VoiceChoices, workId: string, chapterId: string): VoiceKey {
  return choices.chapters[chapterId] ?? choices.books[workId] ?? DEFAULT_VOICE;
}

// Whether readers hear the Azure voices at all ("audio.azure_readers"). When
// off, only audio plays are offered; the Azure recordings stay saved for the
// admin and come back when it is turned on again.
export async function azureForReaders(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("settings").select("value").eq("key", "audio.azure_readers").maybeSingle();
  return data?.value !== false;
}

export type LexiconEntry = { word: string; say: string };

// Pronunciation fixes, kept in settings as lines "word = say as".
export async function loadLexicon(db: SupabaseClient): Promise<LexiconEntry[]> {
  const { data } = await db.from("settings").select("value").eq("key", "audio.lexicon").maybeSingle();
  return parseLexicon(typeof data?.value === "string" ? data.value : "");
}

export function parseLexicon(text: string): LexiconEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("="))
    .filter((parts) => parts.length === 2)
    .map(([word, say]) => ({ word: word.trim(), say: say.trim() }))
    .filter((e) => e.word && e.say && e.word !== e.say)
    // Longest first, so "દશરથરાજા" is fixed before "દશરથ".
    .sort((a, b) => b.word.length - a.word.length);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Plain text → SSML, with pronunciation fixes as <sub alias="…">.
function speakable(text: string, lexicon: LexiconEntry[]) {
  const plain = text.replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
  if (!lexicon.length) return esc(plain);
  const pattern = new RegExp(lexicon.map((e) => e.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const say = new Map(lexicon.map((e) => [e.word, e.say]));
  let out = "";
  let last = 0;
  for (const m of plain.matchAll(pattern)) {
    out += esc(plain.slice(last, m.index)) + `<sub alias="${esc(say.get(m[0])!)}">${esc(m[0])}</sub>`;
    last = m.index! + m[0].length;
  }
  return out + esc(plain.slice(last));
}

// Splits a long paragraph at sentence ends so each request stays small.
function split(text: string) {
  if (text.length <= MAX_PIECE) return [text];
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  const pieces: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > MAX_PIECE) {
      pieces.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) pieces.push(cur);
  return pieces;
}

type ChapterText = { number: number | null; section: string | null; title: string; body: string | null };

// What gets read: the heading, then each paragraph (as one or more requests).
export function chapterScript(c: ChapterText, lexicon: LexiconEntry[]) {
  const heading = c.section || c.number == null ? c.title : `પ્રકરણ ${guNumber(c.number)}. ${c.title}`;
  const paras = paragraphs(c.body).map((b) => split(b.text).map((piece) => speakable(piece, lexicon)));
  const characters = heading.length + paragraphs(c.body).reduce((n, b) => n + b.text.length, 0);
  return { heading: speakable(heading, lexicon), paras, characters };
}

// Changes whenever anything that is read changes: text, fixes, voice, recipe.
export function audioHash(voice: VoiceKey, script: ReturnType<typeof chapterScript>) {
  return createHash("sha256")
    .update(JSON.stringify([RECIPE, FORMAT, voice, script.heading, script.paras]))
    .digest("hex")
    .slice(0, 16);
}

export function azureReady() {
  return !!process.env.AZURE_SPEECH_KEY?.trim() && !!process.env.AZURE_SPEECH_REGION?.trim();
}

async function synthesize(voice: VoiceKey, ssmlInner: string): Promise<Uint8Array> {
  const region = process.env.AZURE_SPEECH_REGION!.trim();
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="gu-IN"><voice name="${VOICES[voice].azure}">${ssmlInner}</voice></speak>`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!.trim(),
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": FORMAT,
        "User-Agent": "jambuch.in",
      },
      body: ssml,
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    // Busy: wait a little and try again (a few times).
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const why = res.status === 401 ? "the Azure key was refused (check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION)" : await res.text();
    throw new Error(`Azure couldn't read the text (${res.status}): ${why.slice(0, 200)}`);
  }
}

// Runs jobs a few at a time, keeping their order.
async function inOrder<T>(jobs: (() => Promise<T>)[], parallel: number) {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]();
      }
    }),
  );
  return results;
}

// Makes one chapter in one voice, saves it and replaces any older recording.
export async function makeChapterAudio(db: SupabaseClient, chapterId: string, voice: VoiceKey) {
  if (!azureReady()) throw new Error("Azure isn't set up: add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.");
  const { data: c, error } = await db
    .from("chapters")
    .select("id, number, section, legacy_number, title, body, works!inner(slug)")
    .eq("id", chapterId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Chapter not found.");
  const work = (Array.isArray(c.works) ? c.works[0] : c.works) as { slug: string };

  const lexicon = await loadLexicon(db);
  const script = chapterScript(c, lexicon);
  if (!script.paras.length) throw new Error("This chapter has no text yet.");
  const hash = audioHash(voice, script);

  // Heading first, then every piece of every paragraph; pauses ride at the end
  // of each piece so the timings include them.
  const pieces: { para: number; ssml: string }[] = [
    { para: -1, ssml: `<p>${script.heading}</p><break time="${TITLE_PAUSE}"/>` },
    ...script.paras.flatMap((parts, para) =>
      parts.map((p, i) => ({ para, ssml: `<p>${p}</p>${i === parts.length - 1 ? `<break time="${PARAGRAPH_PAUSE}"/>` : ""}` })),
    ),
  ];
  const audio = await inOrder(
    pieces.map((p) => () => synthesize(voice, p.ssml)),
    PARALLEL,
  );

  const paragraphMs: number[] = [];
  let at = 0;
  pieces.forEach((p, i) => {
    if (p.para >= 0 && paragraphMs[p.para] === undefined) paragraphMs[p.para] = Math.round(at);
    at += audio[i].length / BYTES_PER_MS;
  });
  const whole = new Uint8Array(audio.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of audio) {
    whole.set(a, offset);
    offset += a.length;
  }

  const key = `audio/${work.slug}/${entrySlug(c)}-${voice}-${hash}.mp3`;
  const url = await uploadPublic(key, whole.buffer, "audio/mpeg");

  const { data: old } = await db.from("chapter_audio").select("url").eq("chapter_id", chapterId).eq("voice", voice).maybeSingle();
  const { error: saveError } = await db.from("chapter_audio").upsert(
    {
      chapter_id: chapterId,
      voice,
      url,
      paragraph_ms: paragraphMs,
      duration_ms: Math.round(at),
      text_hash: hash,
      characters: script.characters,
      created_at: new Date().toISOString(),
    },
    { onConflict: "chapter_id,voice" },
  );
  if (saveError) throw new Error(saveError.message);
  if (old?.url && old.url !== url) {
    const ref = fileRef(old.url);
    if (ref) await deleteForever(ref).catch(() => {});
  }
  return { url, durationMs: Math.round(at), characters: script.characters, hash };
}

// Audio plays are made outside the site (on Jaydeep's PC) and uploaded. They
// follow the text itself, not a voice or the pronunciation list, so a change
// to any paragraph marks them out of date.
export function productionHash(body: string | null) {
  return createHash("sha256")
    .update(JSON.stringify(["production", paragraphs(body).map((b) => b.text)]))
    .digest("hex")
    .slice(0, 16);
}

export type ProductionTimings = { durationMs: number; paragraphMs: number[] };

// Why these timings can't go with a chapter of `count` paragraphs, or null.
export function timingsProblem(t: ProductionTimings, count: number): string | null {
  const ms = t.paragraphMs;
  if (!Number.isFinite(t.durationMs) || t.durationMs < 1000 || t.durationMs > 4 * 3600_000) {
    return "The length in the timings file looks wrong.";
  }
  if (!Array.isArray(ms) || ms.length !== count) {
    return `The timings are for ${Array.isArray(ms) ? ms.length : 0} paragraphs, but this chapter has ${count}. Was the text changed since the audio was made?`;
  }
  if (ms.some((x, i) => !Number.isInteger(x) || x < 0 || x >= t.durationMs || (i > 0 && x <= ms[i - 1]))) {
    return "The paragraph times in the timings file are out of order.";
  }
  return null;
}

// Saves an uploaded production (the MP3 and where each paragraph starts) and
// replaces any earlier one of the same kind. A new upload is never paused.
export async function saveProduction(
  db: SupabaseClient,
  chapterId: string,
  kind: ProductionKey,
  mp3: Uint8Array,
  t: ProductionTimings,
) {
  const { data: c, error } = await db
    .from("chapters")
    .select("id, number, section, legacy_number, title, body, works!inner(slug)")
    .eq("id", chapterId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Chapter not found.");
  const work = (Array.isArray(c.works) ? c.works[0] : c.works) as { slug: string };
  const body = paragraphs(c.body);
  const problem = timingsProblem(t, body.length);
  if (problem) throw new Error(problem);

  const hash = productionHash(c.body);
  // A new name for every upload: media.jambuch.in caches files for a year.
  const key = `audio/${work.slug}/${entrySlug(c)}-${kind}-${hash}-${Date.now().toString(36)}.mp3`;
  const url = await uploadPublic(key, mp3.buffer as ArrayBuffer, "audio/mpeg");

  const { data: old } = await db.from("chapter_audio").select("url").eq("chapter_id", chapterId).eq("voice", kind).maybeSingle();
  const { error: saveError } = await db.from("chapter_audio").upsert(
    {
      chapter_id: chapterId,
      voice: kind,
      url,
      paragraph_ms: t.paragraphMs,
      duration_ms: Math.round(t.durationMs),
      text_hash: hash,
      characters: body.reduce((n, b) => n + b.text.length, 0),
      paused: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: "chapter_id,voice" },
  );
  if (saveError) throw new Error(saveError.message);
  if (old?.url && old.url !== url) {
    const ref = fileRef(old.url);
    if (ref) await deleteForever(ref).catch(() => {});
  }
  return { url, durationMs: Math.round(t.durationMs) };
}
