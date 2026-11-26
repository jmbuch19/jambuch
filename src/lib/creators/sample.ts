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
import { narrationRules } from "./rules";
import { buildScript, stripTitle } from "./script";
import { soundPlan, type SoundPlan } from "./claude";
import { creditsKey, readDraft, readStory, sampleKey } from "./files";

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
  voice_clear_db?: number | null; // how far the music and sounds sit below the voice while it speaks
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

async function speak(text: string, s: SampleSettings, ctx: { previous?: string; next?: string } = {}): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  if (!s.voice_id) throw new Error("No voice chosen: pick one in admin (Creator's Space → Sample settings).");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(s.voice_id)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: s.model_id,
      ...(ctx.previous ? { previous_text: ctx.previous.slice(-400) } : {}),
      ...(ctx.next ? { next_text: ctx.next.slice(0, 400) } : {}),
    }),
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

// The music bed sits at 0.22; in the silence after the opening it swells softly to 0.5 and
// settles back (0.6 s ramps), before the story starts.
function musicVolume(swell: { from: number; to: number } | null) {
  if (!swell || swell.to - swell.from < 0.5) return "volume=0.22";
  const a = swell.from.toFixed(2);
  const b = swell.to.toFixed(2);
  return `volume='0.22+0.28*min(1,max(0,(t-${a})/0.6))*min(1,max(0,(${b}-t)/0.6))':eval=frame`;
}

// Mean level (dB) from FFmpeg's volumedetect; about -91 for silence.
async function meanVolume(path: string): Promise<number | null> {
  const out = await run(ffmpeg(), ["-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"], {
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(String(out.stderr));
  return m ? Number(m[1]) : null;
}

// One effect as it goes into the mix: where it starts, how long it plays, its fades, its gain.
export type PlacedEffect = { path: string; at: number; len: number; fin: number; fout: number; gainDb: number; under: boolean };

// Effects that keep a sharp attack (the engine's SHARP_CUES idea); every other sound swells in
// and dies away (engine: in 0.6 s, out 1.2 s), so nothing pops in or cuts off.
const SHARP_SOUNDS = new Set(["door"]);

// Joins voiced segments with real silences between them (the engine's rule: pauses go in at
// the joins, never inside the voice). Returns the joined file and each segment's start time.
async function joinSegments(dir: string, files: string[], gaps: number[]) {
  const durs = await Promise.all(files.map((f) => duration(f)));
  const starts: number[] = [];
  let t = 0;
  durs.forEach((d, i) => {
    starts.push(t);
    t += d + (gaps[i] ?? 0);
  });
  const args = ["-hide_banner", "-y", ...files.flatMap((f) => ["-i", f])];
  const f = files.map((_, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=${(gaps[i] ?? 0).toFixed(2)}[s${i}]`);
  f.push(`${files.map((_, i) => `[s${i}]`).join("")}concat=n=${files.length}:v=0:a=1[out]`);
  const out = join(dir, "voice.mp3");
  args.push("-filter_complex", f.join(";"), "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", out);
  await run(ffmpeg(), args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return { path: out, starts, durs };
}

export async function mix(o: {
  dir: string;
  tag: string;
  voice: string;
  music: string | null;
  voiceStart: number;
  total: number;
  tagEndAt: number;
  swell?: { from: number; to: number } | null;
  lufs?: number;
  effects: PlacedEffect[];
  speech: [number, number][]; // when the narration is speaking (seconds in the mix)
  bgDb?: number; // extra gain on all music and effects (lowered when the voice isn't clear enough)
}): Promise<{ path: string; voiceClear: number | null }> {
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
  f.push(`[vo]asplit=3[vmix][vkey][vmeas]`);
  const bgIn: string[] = [];
  let idx = 3;
  if (o.music) {
    f.push(
      `[${idx}:a]aresample=44100,aloop=loop=-1:size=2000000000,atrim=0:${o.total.toFixed(2)},${musicVolume(o.swell ?? null)},` +
        `afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, o.total - 2.5).toFixed(2)}:d=2.5[mbed]`,
    );
    f.push(`[mbed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=500[mduck]`);
    bgIn.push("[mduck]");
    idx++;
  } else {
    f.push(`[vkey]anullsink`);
  }
  // Effects: each faded in and out and set to its own level (gain from its measured mean). They
  // are not ducked: a cue after a line ends before the next line starts; a simile ("under") is
  // meant to be heard with the words, softly.
  o.effects.forEach((e, n) => {
    const st = Math.max(0, e.len - e.fout).toFixed(2);
    f.push(
      `[${idx + n}:a]aresample=44100,atrim=0:${e.len.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=${e.fin.toFixed(2)},` +
        `afade=t=out:st=${st}:d=${e.fout.toFixed(2)},volume=${e.gainDb.toFixed(1)}dB,adelay=${ms(e.at)}|${ms(e.at)}[fx${n}]`,
    );
    bgIn.push(`[fx${n}]`);
  });
  const T = o.total.toFixed(2);
  // The voice is measured only while it speaks: the pauses may rise (engine sound guide §0.7).
  const mask = o.speech.length
    ? `volume='${o.speech.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+")}':eval=frame`
    : "volume=0";
  const outs: string[] = [];
  if (bgIn.length) {
    f.push(
      `${bgIn.join("")}amix=inputs=${bgIn.length}:duration=longest:normalize=0,volume=${(o.bgDb ?? 0).toFixed(1)}dB,` +
        `apad=whole_dur=${T},atrim=0:${T},asplit=2[bgmix][bgmeas]`,
    );
    f.push(`[vmix][bgmix]amix=inputs=2:duration=first:normalize=0,loudnorm=I=${o.lufs ?? -16}:TP=-1.5:LRA=11[out]`);
    f.push(`[vmeas]aformat=channel_layouts=mono,${mask}[vm]`, `[bgmeas]aformat=channel_layouts=mono,${mask}[bm]`);
    outs.push("vm", "bm");
  } else {
    f.push(`[vmix]loudnorm=I=${o.lufs ?? -16}:TP=-1.5:LRA=11[out]`, `[vmeas]anullsink`);
  }

  const out = join(o.dir, "sample.mp3");
  args.push("-filter_complex", f.join(";"), "-map", "[out]", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", out);
  // Two measuring stems (before the final normalising, which moves voice and background alike).
  for (const name of outs) args.push("-map", `[${name}]`, "-c:a", "pcm_s16le", join(o.dir, `${name}.wav`));
  await run(ffmpeg(), args, { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
  if (!outs.length) return { path: out, voiceClear: null };
  const [v, b] = await Promise.all([meanVolume(join(o.dir, "vm.wav")), meanVolume(join(o.dir, "bm.wav"))]);
  // Nothing under the words at all: nothing to be clear of.
  if (v === null || b === null || b <= -90) return { path: out, voiceClear: null };
  return { path: out, voiceClear: Math.round((v - b) * 10) / 10 };
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
async function savedVoice(
  id: string,
  text: string,
  s: SampleSettings,
  force: boolean,
  ctx: { previous?: string; next?: string } = {},
): Promise<{ audio: Buffer; paid: boolean }> {
  const key = workKey(id, `voice-${hashOf(`${s.voice_id}|${s.model_id}|${text}`)}.mp3`);
  if (!force) {
    const saved = await readSaved(key);
    if (saved) return { audio: saved, paid: false };
  }
  const since = Date.now();
  let audio: Buffer;
  try {
    audio = await speak(text, s, ctx);
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
  const [base, story, draft, rules] = await Promise.all([sampleSettings(), readStory(req.id), readDraft(req.id), narrationRules()]);
  const lang = req.language in TAG_TEXT ? req.language : "en";
  // Title and author are separate fields; a first line that repeats the title is not read twice.
  const title = (draft.text.title ?? "").trim();
  const author = (draft.text.author ?? draft.text.credit_name ?? "").trim();
  const script = buildScript(stripTitle(story, title), base.max_chars, { title, author, lang }, rules.pauses);
  const sentences = script.sentences;
  if (!sentences.length) throw new Error("The story has no text to read.");
  const passage = script.spoken;
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
    const cueFiles: { path: string; after: number; sound: string; under: boolean; word: string }[] = [];
    for (const [i, cue] of plan.cues.entries()) {
      const q = SOUND_QUERY[cue.sound];
      if (!q) continue;
      const path = join(dir, `fx${i}.mp3`);
      const card = await optional(req.id, `effect ${cue.sound} from library`, () => pickEffect(cue.sound, `${req.id}-${i}`, usedIds));
      if (card && (await optional(req.id, `effect ${card.id} (library)`, async () => writeFile(path, await readPrivate(card.file)))) !== null) {
        usedIds.add(card.id);
        cueFiles.push({ path, after: cue.after, sound: cue.sound, under: cue.place === "under", word: cue.word ?? "" });
        credits.push({ kind: "effect", source: "library", id: card.id, name: card.id, author: card.source, licence: card.licence, url: "", attribution: card.attribution });
        used.push({ order_id: req.id, asset_id: card.id, asset_kind: "sfx", role: "sample-cue" });
        continue;
      }
      const hit = await optional(req.id, `effect search ${cue.sound} (Freesound)`, () => freesound(q, 0.5, 8));
      const url = hit?.previews["preview-hq-mp3"];
      if (!hit || !url) continue;
      if ((await optional(req.id, `effect download ${cue.sound} (Freesound)`, () => download(url, path))) === null) continue;
      cueFiles.push({ path, after: cue.after, sound: cue.sound, under: cue.place === "under", word: cue.word ?? "" });
      credits.push(freesoundCredit("effect", hit));
      used.push({ order_id: req.id, asset_id: `freesound-${hit.id}`, asset_kind: "sfx", role: "sample-cue" });
    }

    await checkStop(req.id);
    // 3. The paid voice, once: stored as soon as it arrives (or recovered after a timeout).
    // Each segment separately, three at a time, with its neighbours as context for intonation.
    const segs = script.segments;
    const segOf = (n: number) => segs.findIndex((x) => x.sentences.includes(n));
    // A sound after a line: the next line waits for it (engine: the words wait about 1 s).
    for (const c of cueFiles) {
      const k = segOf(c.after);
      if (!c.under && k >= 0 && k < segs.length - 1 && segs[k].gapAfter < rules.pauses.cue_hold) segs[k].gapAfter = rules.pauses.cue_hold;
    }
    const force = !!(opts.forceVoice || opts.fresh);
    const voiced: { audio: Buffer; paid: boolean }[] = new Array(segs.length);
    const tagAudio = await step(req.id, "voice (ElevenLabs)", async () => {
      for (let i = 0; i < segs.length; i += 3) {
        await Promise.all(
          segs.slice(i, i + 3).map(async (seg, j) => {
            const k = i + j;
            voiced[k] = await savedVoice(req.id, seg.text, s, force, { previous: segs[k - 1]?.text, next: segs[k + 1]?.text });
          }),
        );
        await checkStop(req.id);
      }
      return spokenTag(lang, s);
    });
    const files = await Promise.all(
      voiced.map(async (v, i) => {
        const path = join(dir, `seg${i}.mp3`);
        await writeFile(path, v.audio);
        return path;
      }),
    );
    const joined = await step(req.id, "join with pauses (FFmpeg)", () => joinSegments(dir, files, segs.map((x) => x.gapAfter)));
    const voicePath = joined.path;
    const tagPath = join(dir, "tag.mp3");
    await writeFile(tagPath, tagAudio);
    const [voiceSec, tagSec] = await Promise.all([duration(voicePath), duration(tagPath)]);
    const voiceStart = tagSec + 0.6;
    const tagEndAt = voiceStart + voiceSec + rules.pauses.end;
    const total = tagEndAt + tagSec + 1.5;

    // The music swell: the silence after the opening (title and author), before the story.
    const lastOpening = segs.map((x) => x.kind).lastIndexOf("author") >= 0 ? segs.map((x) => x.kind).lastIndexOf("author") : segs.map((x) => x.kind).lastIndexOf("title");
    const swell =
      lastOpening >= 0
        ? { from: voiceStart + joined.starts[lastOpening] + joined.durs[lastOpening], to: voiceStart + joined.starts[lastOpening] + joined.durs[lastOpening] + segs[lastOpening].gapAfter }
        : null;

    // Effects (engine sound guide §0): every one faded, set to its level from its own measured
    // mean, and timed to the words.
    //  - after a line: starts 0.1 s after it and fades out 0.25 s before the next line begins;
    //  - a simile ("under"): rises from its word (in 0.5 s), runs under the rest of the line, and
    //    fades out over 2 s after it.
    const segStart = (k: number) => voiceStart + joined.starts[k];
    const segEnd = (k: number) => segStart(k) + joined.durs[k];
    const effects: PlacedEffect[] = [];
    for (const c of cueFiles) {
      const k = segOf(c.after);
      if (k < 0) continue;
      const [fileSec, mean] = await Promise.all([duration(c.path).catch(() => 0), meanVolume(c.path)]);
      if (fileSec < 0.2 || mean === null || mean < -80) continue;
      const target = c.under ? rules.levels.simile_under : rules.levels.cue_present;
      const gainDb = Math.max(-30, Math.min(20, target - mean));
      if (c.under) {
        const pos = Math.max(0, segs[k].text.indexOf(c.word));
        const at = segStart(k) + (pos / Math.max(1, segs[k].text.length)) * joined.durs[k];
        const len = Math.min(fileSec, segEnd(k) - at + 2, 8);
        if (len < 0.5) continue;
        effects.push({ path: c.path, at, len, fin: Math.min(0.5, len / 3), fout: Math.min(2, len / 2), gainDb, under: true });
      } else {
        const at = segEnd(k) + 0.1;
        const nextLine = k < segs.length - 1 ? segStart(k + 1) : tagEndAt;
        const room = nextLine - 0.25 - at;
        if (room < 0.3) continue;
        const len = Math.min(fileSec, 5, room);
        const sharp = SHARP_SOUNDS.has(c.sound);
        const base = sharp ? 0.3 : 1.2;
        const fout = Math.min(len / 2, len < fileSec ? Math.max(base, 0.6) : base);
        effects.push({ path: c.path, at, len, fin: sharp ? 0.05 : Math.min(0.6, len / 3), fout, gainDb, under: false });
      }
    }
    const speech = segs.map((_, k): [number, number] => [segStart(k), segEnd(k)]);
    const paidChars = voiced.reduce((sum, v, i) => sum + (v.paid ? segs[i].text.length : 0), 0);
    const voice = { paid: voiced.some((v) => v.paid) };

    await checkStop(req.id);
    // 4. Mix (free), then the check (its speech-to-text result is kept per voice too).
    const mixWith = (bgDb: number) =>
      step(req.id, bgDb ? `mix again, background ${bgDb.toFixed(1)} dB (FFmpeg)` : "mix (FFmpeg)", () =>
        mix({ dir, tag: tagPath, voice: voicePath, music: musicPath, effects, voiceStart, total, tagEndAt, swell: musicPath ? swell : null, lufs: rules.videoLufs, speech, bgDb }),
      );
    // The voice always clear of the background (engine §0.7): at least voice_clear dB while it
    // speaks. If the first mix falls short, the music and sounds come down by the shortfall and
    // 1 dB more, and it is mixed once more (free).
    const need = rules.levels.voice_clear;
    let mixed = await mixWith(0);
    let bgDb = 0;
    if (mixed.voiceClear !== null && mixed.voiceClear < need) {
      bgDb = -(need - mixed.voiceClear + 1);
      mixed = await mixWith(bgDb);
    }
    const out = mixed.path;
    const qc = await step(req.id, "quality check", () =>
      qualityCheck(out, voicePath, passage, lang, workKey(req.id, `stt-${hashOf(`${s.voice_id}|${s.model_id}|${passage}`)}.json`), !!(opts.forceVoice || opts.fresh), {
        voiceClear: mixed.voiceClear,
        need,
      }),
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
        elevenlabs_chars: paidChars,
        segments: segs.length,
        effects_after: effects.filter((e) => !e.under).length,
        effects_under: effects.filter((e) => e.under).length,
        background_lowered_db: bgDb,
        pauses_from_engine: rules.fromEngine.join(",") || "none",
        pauses_stand_in: rules.standIn.join(",") || "none",
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

export async function qualityCheck(
  mixPath: string,
  voicePath: string,
  passage: string,
  lang: string,
  sttKey?: string,
  fresh = false,
  clear: { voiceClear: number | null; need: number } = { voiceClear: null, need: 10 },
): Promise<QualityCheck> {
  const problems: string[] = [];
  if (clear.voiceClear !== null && clear.voiceClear < clear.need) problems.push(`voice only ${clear.voiceClear} dB above the music and sounds (needs ${clear.need})`);
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
  return { pass: !problems.length, seconds: Math.round(seconds * 10) / 10, lufs, words_matched: matched, heard_language: heardLang, language_probability: langProb, voice_clear_db: clear.voiceClear, problems };
}

// Removes an older sample and its credits (when a new one replaces it).
export async function deleteSample(key: string) {
  await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
  const credits = key.replace(/sample-(\d+)\.mp3$/, "credits-$1.json");
  if (credits !== key) await deleteForever({ url: `r2-private:${credits}`, bucket: "private", key: credits });
}
