import "server-only";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { adminClient } from "@/lib/supabase-admin";
import { deleteForever, readPrivate, uploadPrivate } from "@/lib/r2";
import { logUsage, pickEffect, pickMusic } from "./library";
import { soundPlan, type SoundPlan } from "./claude";
import { creditsKey, readStory, sampleKey } from "./files";

// Phase 2a: the paid (₹499) 30–60 second AUDIO sample (docs/CREATORS_SPACE_BRIEF.md §6H).
//   1. passage   the story's opening, word for word, cut at a sentence end (code, not AI)
//   2. plan      Claude picks mood, music words and up to 3 sound cues from the vocabulary
//   3. voice     ElevenLabs reads the passage (voice and model from settings)
//   4. sounds    Freesound, Creative Commons 0 only, searched with fixed words per tag
//   5. mix       FFmpeg: a spoken "sample" tag, music ducked under the voice, cues,
//                loudness -16 LUFS
//   6. store     private R2: creators/<id>/sample/sample-N.mp3 and credits-N.json
// Runs inside an admin action (Vercel Pro, up to 300 s). Jaydeep listens before it is sent.

const run = promisify(execFile);

// Native voice for native stories (Jaydeep, 25 Nov 2026): one narrator voice and model per
// story language. A story is only ever read by its own language's voice; with none chosen,
// the sample waits for Jaydeep rather than borrow another language's voice.
// (voice_id / model_id are the old single-voice setting, kept only as the English voice.)
export type SampleLang = "gu" | "hi" | "en";
export type LangVoice = { voice_id: string; model_id: string };
export type SampleSettings = {
  enabled: boolean;
  daily_cap: number;
  voice_id: string;
  model_id: string;
  max_chars: number;
  voices?: Partial<Record<SampleLang, LangVoice>>;
};
export const SAMPLE_DEFAULTS: SampleSettings = { enabled: true, daily_cap: 5, voice_id: "", model_id: "eleven_v3", max_chars: 900 };
// The engine narrates Gujarati and Hindi with ElevenLabs v4 (the Ramayana chapters).
export const DEFAULT_MODEL: Record<SampleLang, string> = { gu: "eleven_v4", hi: "eleven_v4", en: "eleven_v3" };
export const SAMPLE_LANGS: Record<SampleLang, string> = { gu: "Gujarati", hi: "Hindi", en: "English" };

export function voiceFor(s: SampleSettings, lang: string): LangVoice | null {
  const l = (["gu", "hi", "en"].includes(lang) ? lang : "en") as SampleLang;
  const v = s.voices?.[l];
  if (v?.voice_id) return { voice_id: v.voice_id, model_id: v.model_id || DEFAULT_MODEL[l] };
  if (l === "en" && s.voice_id) return { voice_id: s.voice_id, model_id: s.model_id || DEFAULT_MODEL.en };
  return null;
}

export async function sampleSettings(): Promise<SampleSettings> {
  const { data } = await adminClient().from("settings").select("value").eq("key", "creators.sample").maybeSingle();
  return { ...SAMPLE_DEFAULTS, ...((data?.value as Partial<SampleSettings>) ?? {}) };
}

// The spoken watermark at the start and end (brief §6: samples are watermarked).
const TAG_TEXT: Record<string, string> = {
  gu: "Creator's Space નમૂનો. jambuch.in",
  hi: "Creator's Space नमूना. jambuch.in",
  en: "Creator's Space sample. jambuch.in",
};

// Fixed search words per vocabulary tag. Only these words reach Freesound; the writer's
// own text never does (brief §6A, Safeguards 3).
const MUSIC_QUERY: Record<string, string> = {
  sparse: "ambient pad soft",
  flute: "flute melody",
  bansuri: "bansuri flute",
  sitar: "sitar",
  santoor: "santoor",
  sarangi: "sarangi",
  shehnai: "shehnai",
  tabla: "tabla loop",
  dholak: "dholak",
  harmonium: "harmonium",
  "tanpura-drone": "tanpura drone",
  strings: "strings ambient",
  piano: "piano soft",
  "folk-gujarati": "indian folk music",
  "devotional-bhajan": "indian devotional music",
  lullaby: "lullaby music box",
  "no-music-in-sad-parts": "ambient pad soft",
};
const MOOD_QUERY: Record<string, string> = {
  warm: "ambient warm",
  devotional: "tanpura drone",
  suspenseful: "suspense ambient",
  funny: "playful music",
  sad: "sad ambient",
  inspiring: "inspiring ambient",
  nostalgic: "nostalgic ambient",
  mysterious: "mysterious ambient",
  calm: "calm ambient pad",
  dramatic: "dramatic ambient",
};
const SOUND_QUERY: Record<string, string> = {
  rain: "rain",
  "monsoon-storm": "heavy rain storm",
  thunder: "thunder",
  wind: "wind",
  river: "river stream",
  sea: "sea waves",
  "birds-morning": "birds morning",
  "crickets-night": "crickets night",
  "temple-bells": "temple bell",
  conch: "conch shell",
  footsteps: "footsteps",
  door: "door open",
  "bullock-cart": "cart wheels",
  horse: "horse gallop",
  "village-crowd": "crowd murmur",
  market: "market crowd",
  train: "train",
  fire: "fire crackling",
  cooking: "cooking kitchen",
  "children-playing": "children playing",
};

export type Credit = {
  kind: "music" | "effect";
  source: "library" | "freesound";
  id: number | string;
  name: string;
  author: string;
  licence: string;
  url: string;
  attribution?: string | null; // CC BY: shown wherever the sound is credited
};
export type QualityCheck = {
  pass: boolean;
  seconds: number;
  lufs: number | null;
  words_matched: number | null;
  heard_language?: string | null;
  language_probability?: number | null;
  problems: string[];
};
export type SampleResult = { key: string; credits: Credit[]; cost: Record<string, number | string>; plan: SoundPlan; qc: QualityCheck };

// ---------------------------------------------------------------- 1. passage

// Sentences of the story's opening, word for word, up to maxChars (never cut mid-sentence;
// if the first sentence alone is longer, it is cut at a word boundary).
export function openingSentences(story: string, maxChars: number): string[] {
  const parts = story
    .replace(/\r/g, "")
    .split(/(?<=[.!?।॥])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let total = 0;
  for (const p of parts) {
    if (total + p.length > maxChars && out.length) break;
    if (p.length > maxChars) {
      out.push(p.slice(0, p.lastIndexOf(" ", maxChars) > 0 ? p.lastIndexOf(" ", maxChars) : maxChars) + "…");
      break;
    }
    out.push(p);
    total += p.length + 1;
  }
  return out;
}

// ---------------------------------------------------------------- 3. voice

async function speak(text: string, s: SampleSettings): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  if (!s.voice_id) throw new Error("No voice chosen: pick one in admin (Creator's Space → Sample settings).");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(s.voice_id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: s.model_id }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

export type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  verified_languages?: { language: string; accent?: string; locale?: string }[];
};

// Does ElevenLabs list this voice for the language? (Designed voices may not list any.)
export function speaksLanguage(v: Voice, lang: string) {
  const codes = lang === "gu" ? ["gu", "guj"] : lang === "hi" ? ["hi", "hin"] : ["en", "eng"];
  return (
    (v.verified_languages ?? []).some((x) => codes.includes(String(x.language).toLowerCase())) ||
    codes.includes(String(v.labels?.language ?? "").toLowerCase())
  );
}

// The account's voices, for the admin's voice picker.
export async function listVoices(): Promise<Voice[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`);
  const data = (await res.json()) as { voices?: Voice[] };
  return (data.voices ?? []).map((v) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels, verified_languages: v.verified_languages }));
}

// ---------------------------------------------------------------- 4. sounds (Freesound, CC0 only)

type FreesoundHit = { id: number; name: string; username: string; license: string; duration: number; url: string; previews: Record<string, string> };

// The licence of a Freesound result: CC0, or CC BY with its version; null for anything else
// (NonCommercial, Sampling+, unknown).
function freesoundLicence(url: string): { cc0: boolean; label: string } | null {
  if (/by-nc|noncommercial|sampling/i.test(url)) return null;
  if (/publicdomain\/zero|Creative Commons 0/i.test(url)) return { cc0: true, label: "CC0 1.0" };
  const by = /licenses\/by\/(\d\.\d)/i.exec(url);
  return by ? { cc0: false, label: `CC BY ${by[1]}` } : null;
}

function freesoundCredit(kind: Credit["kind"], hit: FreesoundHit): Credit {
  const lic = freesoundLicence(hit.license)!;
  return {
    kind,
    source: "freesound",
    id: hit.id,
    name: hit.name,
    author: hit.username,
    licence: lic.label,
    url: hit.url,
    attribution: lic.cc0 ? null : `“${hit.name}” by ${hit.username} (${hit.url}), licensed under ${lic.label}`,
  };
}

async function freesound(query: string, minSec: number, maxSec: number): Promise<FreesoundHit | null> {
  const token = process.env.FREESOUND_API_KEY;
  if (!token) return null;
  const params = new URLSearchParams({
    query,
    filter: `license:("Creative Commons 0" OR "Attribution") duration:[${minSec} TO ${maxSec}]`,
    fields: "id,name,username,license,duration,url,previews",
    sort: "rating_desc",
    page_size: "5",
    token,
  });
  const res = await fetch(`https://freesound.org/apiv2/search/text/?${params}`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) {
    console.warn("freesound search failed:", res.status, query);
    return null;
  }
  const data = (await res.json()) as { results?: FreesoundHit[] };
  // Double-check the licence on our side too: CC0 first, then CC BY; NonCommercial never.
  const ok = (data.results ?? []).filter((r) => freesoundLicence(r.license) !== null);
  return ok.find((r) => freesoundLicence(r.license)?.cc0) ?? ok[0] ?? null;
}

async function download(url: string, path: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

// ---------------------------------------------------------------- 5. mix

function ffmpeg() {
  if (!ffmpegPath) throw new Error("FFmpeg is not available on this server.");
  return ffmpegPath;
}

async function duration(path: string): Promise<number> {
  // ffmpeg prints "Duration: 00:00:41.23" and exits non-zero without an output file.
  const out = await run(ffmpeg(), ["-hide_banner", "-i", path], { timeout: 30_000 }).catch((e: { stderr?: string }) => ({
    stderr: e.stderr ?? "",
  }));
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(out.stderr));
  if (!m) throw new Error("Couldn't read the audio length.");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function mix(o: {
  dir: string;
  tag: string;
  voice: string;
  music: string | null;
  effects: { path: string; at: number }[];
  voiceStart: number;
  total: number;
  tagEndAt: number;
}) {
  const inputs = [o.tag, o.voice, o.tag, ...(o.music ? [o.music] : []), ...o.effects.map((e) => e.path)];
  const args: string[] = ["-hide_banner", "-y"];
  for (const i of inputs) args.push("-i", i);

  const ms = (s: number) => Math.max(0, Math.round(s * 1000));
  const f: string[] = [];
  // Voice track: tag at 0, narration at voiceStart, tag again at the end.
  f.push(`[0:a]aresample=44100,volume=0.9[t1]`);
  f.push(`[1:a]aresample=44100,adelay=${ms(o.voiceStart)}|${ms(o.voiceStart)}[nv]`);
  f.push(`[2:a]aresample=44100,volume=0.9,adelay=${ms(o.tagEndAt)}|${ms(o.tagEndAt)}[t2]`);
  f.push(`[t1][nv][t2]amix=inputs=3:duration=longest:normalize=0,apad=whole_dur=${o.total.toFixed(2)}[vo]`);
  f.push(`[vo]asplit=2[vmix][vkey]`);
  const mixIn = ["[vmix]"];
  let idx = 3;
  if (o.music) {
    f.push(
      `[${idx}:a]aresample=44100,aloop=loop=-1:size=2000000000,atrim=0:${o.total.toFixed(2)},volume=0.22,` +
        `afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, o.total - 2.5).toFixed(2)}:d=2.5[mbed]`,
    );
    f.push(`[mbed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=500[mduck]`);
    mixIn.push("[mduck]");
    idx++;
  } else {
    f.push(`[vkey]anullsink`);
  }
  o.effects.forEach((e, n) => {
    f.push(`[${idx + n}:a]aresample=44100,atrim=0:5,afade=t=out:st=4:d=1,volume=0.5,adelay=${ms(e.at)}|${ms(e.at)}[fx${n}]`);
    mixIn.push(`[fx${n}]`);
  });
  f.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

  const out = join(o.dir, "sample.mp3");
  args.push("-filter_complex", f.join(";"), "-map", "[out]", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", out);
  await run(ffmpeg(), args, { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  return out;
}

// ---------------------------------------------------------------- the whole sample

// Runs one named step, logs how long it took, and names the step in any error, so a failure
// says which service was slow or refused ("voice (ElevenLabs): …").
async function step<T>(id: string, name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`sample ${id}: ${name} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`sample ${id}: ${name} failed after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${msg}`);
    throw new Error(`${name}: ${msg}`);
  }
}

// Music and effects are a nice-to-have: a slow or failed Freesound search or download is
// logged and skipped, and the sample is made without that sound.
async function optional<T>(id: string, name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await step(id, name, fn);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- paid results are kept (no double cost)

// Jaydeep, 25 Nov 2026: a timeout must not cost us twice. Every paid result is stored the
// moment it arrives, under the request's own folder (deleted with the request), and a retry
// reuses it:  creators/<id>/work/plan.json · voice-<hash>.mp3 · stt-<hash>.json
const workKey = (id: string, name: string) => `creators/${id}/work/${name}`;
const hashOf = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 20);
const asBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function readSaved(key: string): Promise<Buffer | null> {
  try {
    return Buffer.from(await readPrivate(key));
  } catch {
    return null;
  }
}

// ElevenLabs may finish (and charge) a request we stopped waiting for. Its history keeps the
// audio, so a timed-out voice is fetched from there instead of being made and paid for again.
async function fromHistory(text: string, s: SampleSettings, since: number): Promise<Buffer | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 15_000));
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/history?page_size=20&voice_id=${encodeURIComponent(s.voice_id)}`, {
        headers: { "xi-api-key": key },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const items = ((await res.json()) as { history?: { history_item_id: string; text: string; date_unix: number }[] }).history ?? [];
      const hit = items.find((h) => h.text === text && h.date_unix * 1000 >= since - 60_000);
      if (!hit) continue;
      const audio = await fetch(`https://api.elevenlabs.io/v1/history/${encodeURIComponent(hit.history_item_id)}/audio`, {
        headers: { "xi-api-key": key },
        signal: AbortSignal.timeout(30_000),
      });
      if (audio.ok) return Buffer.from(await audio.arrayBuffer());
    } catch {
      /* try again */
    }
  }
  return null;
}

// The narration: from storage if already made for this exact text, voice and model; else made
// once, recovered from ElevenLabs' history if our wait timed out, and stored at once.
async function savedVoice(id: string, text: string, s: SampleSettings, force: boolean): Promise<{ audio: Buffer; paid: boolean }> {
  const key = workKey(id, `voice-${hashOf(`${s.voice_id}|${s.model_id}|${text}`)}.mp3`);
  if (!force) {
    const saved = await readSaved(key);
    if (saved) return { audio: saved, paid: false };
  }
  const since = Date.now();
  let audio: Buffer;
  try {
    audio = await speak(text, s);
  } catch (e) {
    // A refusal (4xx) costs nothing; a timeout, network error or 5xx may have been charged.
    const msg = e instanceof Error ? e.message : String(e);
    if (/answered 4\d\d/.test(msg)) throw e;
    const recovered = await fromHistory(text, s, since);
    if (!recovered) throw e;
    console.log(`sample ${id}: voice recovered from ElevenLabs history after: ${msg}`);
    audio = recovered;
  }
  await uploadPrivate(key, asBuffer(audio), "audio/mpeg");
  return { audio, paid: true };
}

// ---------------------------------------------------------------- stop (Jaydeep, 25 Nov 2026)

// A running sample can't be killed from the browser; the Stop button leaves a flag in the
// request's work folder and the maker checks it before each step (above all before the paid
// voice), so a stop in time spends nothing more.
export class SampleStopped extends Error {
  constructor() {
    super("Stopped by you.");
  }
}
const stopKey = (id: string) => workKey(id, "stop");
export async function requestStop(id: string) {
  await uploadPrivate(stopKey(id), asBuffer(Buffer.from(new Date().toISOString())), "text/plain");
}
export async function clearStop(id: string) {
  await deleteForever({ url: `r2-private:${stopKey(id)}`, bucket: "private", key: stopKey(id) }).catch(() => {});
}
async function checkStop(id: string) {
  if (await readSaved(stopKey(id))) throw new SampleStopped();
}

export async function makeSample(
  req: { id: string; language: string; style_tags: string[] },
  n: number,
  opts: { forceVoice?: boolean; fresh?: boolean } = {},
): Promise<SampleResult> {
  const base = await sampleSettings();
  const story = await readStory(req.id);
  const sentences = openingSentences(story, base.max_chars);
  if (!sentences.length) throw new Error("The story has no text to read.");
  const passage = sentences.join(" ");
  const lang = req.language in TAG_TEXT ? req.language : "en";
  const native = voiceFor(base, lang);
  if (!native) throw new Error(`No ${SAMPLE_LANGS[lang as SampleLang] ?? lang} narrator voice is chosen in the sample settings.`);
  const s: SampleSettings = { ...base, voice_id: native.voice_id, model_id: native.model_id };

  await checkStop(req.id);
  // 1. Sound plan (Claude): kept, so a retry doesn't pay for it again.
  const planKey = workKey(req.id, "plan.json");
  const savedPlan = opts.fresh ? null : await readSaved(planKey);
  let plan: SoundPlan = savedPlan ? (JSON.parse(savedPlan.toString("utf8")) as SoundPlan) : { mood: "calm", music: [], cues: [] };
  let planUsage = { input: 0, output: 0 };
  if (!savedPlan) {
    const planned = await optional(req.id, "sound plan (Claude)", () => soundPlan(sentences, req.style_tags, lang));
    if (planned) {
      plan = planned.plan;
      planUsage = planned.usage;
      await uploadPrivate(planKey, asBuffer(Buffer.from(JSON.stringify(plan))), "application/json").catch(() => {});
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "sample-"));
  try {
    const credits: Credit[] = [];
    const used: { order_id: string; asset_id: string; asset_kind: "music" | "sfx"; role: string }[] = [];
    const usedIds = new Set<string>();

    // 2. Free steps first: music and effects (library, then Freesound). Placed after the voice.
    let musicPath: string | null = null;
    if (!plan.music.includes("none")) {
      const q = MUSIC_QUERY[plan.music[0] ?? ""] ?? MOOD_QUERY[plan.mood] ?? "calm ambient pad";
      const card = await optional(req.id, "music from library", () => pickMusic(plan.music, plan.mood, req.id));
      if (card) {
        const path = join(dir, "music.mp3");
        if ((await optional(req.id, `music ${card.id} (library)`, async () => writeFile(path, await readPrivate(card.file)))) !== null) {
          musicPath = path;
          credits.push({ kind: "music", source: "library", id: card.id, name: card.id, author: card.source, licence: card.licence, url: "", attribution: card.attribution });
          used.push({ order_id: req.id, asset_id: card.id, asset_kind: "music", role: "sample-bed" });
        }
      }
      if (!musicPath) {
        const hit = await optional(req.id, "music search (Freesound)", () => freesound(q, 30, 600));
        const url = hit?.previews["preview-hq-mp3"];
        if (hit && url) {
          const path = join(dir, "music.mp3");
          if ((await optional(req.id, "music download (Freesound)", () => download(url, path))) !== null) {
            musicPath = path;
            credits.push(freesoundCredit("music", hit));
            used.push({ order_id: req.id, asset_id: `freesound-${hit.id}`, asset_kind: "music", role: "sample-bed" });
          }
        }
      }
    }
    const cueFiles: { path: string; after: number }[] = [];
    for (const [i, cue] of plan.cues.entries()) {
      const q = SOUND_QUERY[cue.sound];
      if (!q) continue;
      const path = join(dir, `fx${i}.mp3`);
      const card = await optional(req.id, `effect ${cue.sound} from library`, () => pickEffect(cue.sound, `${req.id}-${i}`, usedIds));
      if (card && (await optional(req.id, `effect ${card.id} (library)`, async () => writeFile(path, await readPrivate(card.file)))) !== null) {
        usedIds.add(card.id);
        cueFiles.push({ path, after: cue.after });
        credits.push({ kind: "effect", source: "library", id: card.id, name: card.id, author: card.source, licence: card.licence, url: "", attribution: card.attribution });
        used.push({ order_id: req.id, asset_id: card.id, asset_kind: "sfx", role: "sample-cue" });
        continue;
      }
      const hit = await optional(req.id, `effect search ${cue.sound} (Freesound)`, () => freesound(q, 0.5, 8));
      const url = hit?.previews["preview-hq-mp3"];
      if (!hit || !url) continue;
      if ((await optional(req.id, `effect download ${cue.sound} (Freesound)`, () => download(url, path))) === null) continue;
      cueFiles.push({ path, after: cue.after });
      credits.push(freesoundCredit("effect", hit));
      used.push({ order_id: req.id, asset_id: `freesound-${hit.id}`, asset_kind: "sfx", role: "sample-cue" });
    }

    await checkStop(req.id);
    // 3. The paid voice, once: stored as soon as it arrives (or recovered after a timeout).
    const [voice, tagAudio] = await step(req.id, "voice (ElevenLabs)", () =>
      Promise.all([savedVoice(req.id, passage, s, !!(opts.forceVoice || opts.fresh)), spokenTag(lang, s)]),
    );
    const voicePath = join(dir, "voice.mp3");
    const tagPath = join(dir, "tag.mp3");
    await writeFile(voicePath, voice.audio);
    await writeFile(tagPath, tagAudio);
    const [voiceSec, tagSec] = await Promise.all([duration(voicePath), duration(tagPath)]);
    const voiceStart = tagSec + 0.6;
    const tagEndAt = voiceStart + voiceSec + 1.2;
    const total = tagEndAt + tagSec + 1.5;

    // Effects placed after their sentence, in proportion to the characters read so far.
    const ends: number[] = [];
    let acc = 0;
    for (const t of sentences) {
      acc += t.length + 1;
      ends.push(acc / (passage.length + 1));
    }
    const effects = cueFiles.map((c) => ({ path: c.path, at: voiceStart + ends[c.after - 1] * voiceSec + 0.1 }));

    await checkStop(req.id);
    // 4. Mix (free), then the check (its speech-to-text result is kept per voice too).
    const out = await step(req.id, "mix (FFmpeg)", () => mix({ dir, tag: tagPath, voice: voicePath, music: musicPath, effects, voiceStart, total, tagEndAt }));
    const qc = await step(req.id, "quality check", () =>
      qualityCheck(out, voicePath, passage, lang, workKey(req.id, `stt-${hashOf(`${s.voice_id}|${s.model_id}|${passage}`)}.json`), !!(opts.forceVoice || opts.fresh)),
    );
    const bytes = await readFile(out);

    const key = sampleKey(req.id, n);
    await uploadPrivate(key, asBuffer(bytes), "audio/mpeg");
    await logUsage(used);
    const creditsJson = new TextEncoder().encode(JSON.stringify({ credits, plan }, null, 2));
    await uploadPrivate(creditsKey(req.id, n), creditsJson.buffer as ArrayBuffer, "application/json");

    return {
      key,
      credits,
      plan,
      qc,
      cost: {
        // Only what this attempt actually paid for.
        elevenlabs_chars: voice.paid ? passage.length : 0,
        voice_paid: voice.paid ? 1 : 0,
        claude_input_tokens: planUsage.input,
        claude_output_tokens: planUsage.output,
        seconds: Math.round(total),
        voice_id: s.voice_id,
        model_id: s.model_id,
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- the spoken sample tag (cached)

// "Creator's Space sample. jambuch.in" in the chosen voice: made once per voice, model and
// language, kept in private storage, and reused for every sample after that.
const tagKey = (s: SampleSettings, lang: string) => `creators-shared/sample-tags/${s.voice_id}/${s.model_id}/${lang}.mp3`;

async function spokenTag(lang: string, s: SampleSettings): Promise<Buffer> {
  const key = tagKey(s, lang);
  try {
    return Buffer.from(await readPrivate(key));
  } catch {
    const audio = await speak(TAG_TEXT[lang], s);
    await uploadPrivate(key, audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer, "audio/mpeg").catch(() => {});
    return audio;
  }
}

// ---------------------------------------------------------------- automatic quality check

// Integrated loudness (LUFS) from FFmpeg's EBU R128 meter.
async function loudness(path: string): Promise<number | null> {
  const out = await run(ffmpeg(), ["-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], {
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = /Integrated loudness:\s*I:\s*(-?\d+(?:\.\d+)?) LUFS/.exec(String(out.stderr));
  return m ? Number(m[1]) : null;
}

// Speech to text on the narration alone (ElevenLabs Scribe), then: how many of the passage's
// words were heard? Catches a wrong voice language, garbled speech and dropped lines.
type Heard = { matched: number | null; language: string | null; probability: number | null };
async function wordsMatched(voicePath: string, passage: string): Promise<Heard | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  // No language given: speech-to-text says which language it heard (the native check).
  form.append("file", new Blob([new Uint8Array(await readFile(voicePath))], { type: "audio/mpeg" }), "voice.mp3");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Speech-to-text check failed (${res.status})`);
  const stt = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
  const heard = String(stt.text ?? "");
  const lang = { language: stt.language_code ?? null, probability: typeof stt.language_probability === "number" ? stt.language_probability : null };
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const want = words(passage);
  if (!want.length) return { matched: null, ...lang };
  const bag = new Map<string, number>();
  for (const w of words(heard)) bag.set(w, (bag.get(w) ?? 0) + 1);
  let found = 0;
  for (const w of want) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      found++;
      bag.set(w, n - 1);
    }
  }
  return { matched: Math.round((found / want.length) * 100) / 100, ...lang };
}

const LANG_CODES: Record<string, string[]> = { gu: ["gu", "guj"], hi: ["hi", "hin"], en: ["en", "eng"] };

// Limits for an automatic pass. Below them the sample is made again once, then a person looks.
export const QC_LIMITS = { minSeconds: 20, maxSeconds: 90, minLufs: -19, maxLufs: -13, minWords: 0.6 };

export async function qualityCheck(mixPath: string, voicePath: string, passage: string, lang: string, sttKey?: string, fresh = false): Promise<QualityCheck> {
  const problems: string[] = [];
  const seconds = await duration(mixPath);
  if (seconds < QC_LIMITS.minSeconds || seconds > QC_LIMITS.maxSeconds) problems.push(`length ${Math.round(seconds)} s`);
  const lufs = await loudness(mixPath);
  if (lufs === null) problems.push("loudness not measured");
  else if (lufs < QC_LIMITS.minLufs || lufs > QC_LIMITS.maxLufs) problems.push(`loudness ${lufs} LUFS`);
  let matched: number | null = null;
  let heardLang: string | null = null;
  let langProb: number | null = null;
  try {
    const saved = sttKey && !fresh ? await readSaved(sttKey) : null;
    let h: Heard | null = saved ? (JSON.parse(saved.toString("utf8")) as Heard) : null;
    if (h && !("language" in h)) h = null; // saved before the language check: measure again
    if (!h) {
      h = await wordsMatched(voicePath, passage);
      if (sttKey && h) await uploadPrivate(sttKey, asBuffer(Buffer.from(JSON.stringify(h))), "application/json").catch(() => {});
    }
    matched = h?.matched ?? null;
    heardLang = h?.language ?? null;
    langProb = h?.probability ?? null;
    // Native voice for native stories: the narration must be heard as the story's language.
    const want = LANG_CODES[lang] ?? [lang];
    if (heardLang && !want.includes(heardLang.toLowerCase())) problems.push(`heard as ${heardLang}, not ${SAMPLE_LANGS[lang as SampleLang] ?? lang}`);
    else if (langProb !== null && langProb < 0.6) problems.push(`language unclear (${Math.round(langProb * 100)}% sure)`);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "speech-to-text check failed");
  }
  if (matched === null) problems.push("words not checked");
  else if (matched < QC_LIMITS.minWords) problems.push(`only ${Math.round(matched * 100)}% of the words heard`);
  return { pass: !problems.length, seconds: Math.round(seconds * 10) / 10, lufs, words_matched: matched, heard_language: heardLang, language_probability: langProb, problems };
}

// Removes an older sample and its credits (when a new one replaces it).
export async function deleteSample(key: string) {
  await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
  const credits = key.replace(/sample-(\d+)\.mp3$/, "credits-$1.json");
  if (credits !== key) await deleteForever({ url: `r2-private:${credits}`, bucket: "private", key: credits });
}
