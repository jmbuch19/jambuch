import "server-only";
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

export type SampleSettings = { enabled: boolean; daily_cap: number; voice_id: string; model_id: string; max_chars: number };
export const SAMPLE_DEFAULTS: SampleSettings = { enabled: true, daily_cap: 5, voice_id: "", model_id: "eleven_v3", max_chars: 900 };

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
export type QualityCheck = { pass: boolean; seconds: number; lufs: number | null; words_matched: number | null; problems: string[] };
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

export type Voice = { voice_id: string; name: string; category?: string; labels?: Record<string, string> };

// The account's voices, for the admin's voice picker.
export async function listVoices(): Promise<Voice[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`);
  const data = (await res.json()) as { voices?: Voice[] };
  return (data.voices ?? []).map((v) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels }));
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

export async function makeSample(req: { id: string; language: string; style_tags: string[] }, n: number): Promise<SampleResult> {
  const s = await sampleSettings();
  const story = await readStory(req.id);
  const sentences = openingSentences(story, s.max_chars);
  if (!sentences.length) throw new Error("The story has no text to read.");
  const passage = sentences.join(" ");

  const planned = await optional(req.id, "sound plan (Claude)", () => soundPlan(sentences, req.style_tags));
  const plan: SoundPlan = planned?.plan ?? { mood: "calm", music: [], cues: [] };

  const dir = await mkdtemp(join(tmpdir(), "sample-"));
  try {
    // Voice: the passage and the spoken tag.
    const lang = req.language in TAG_TEXT ? req.language : "en";
    const [voiceAudio, tagAudio] = await step(req.id, "voice (ElevenLabs)", () => Promise.all([speak(passage, s), spokenTag(lang, s)]));
    const voicePath = join(dir, "voice.mp3");
    const tagPath = join(dir, "tag.mp3");
    await writeFile(voicePath, voiceAudio);
    await writeFile(tagPath, tagAudio);
    const [voiceSec, tagSec] = await Promise.all([duration(voicePath), duration(tagPath)]);

    const voiceStart = tagSec + 0.6;
    const tagEndAt = voiceStart + voiceSec + 1.2;
    const total = tagEndAt + tagSec + 1.5;

    const credits: Credit[] = [];
    const used: { order_id: string; asset_id: string; asset_kind: "music" | "sfx"; role: string }[] = [];
    const usedIds = new Set<string>();
    // Music: the first music word, else the mood. None if the plan says "none".
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

    // Effects: placed after their sentence, in proportion to the characters read so far.
    const effects: { path: string; at: number }[] = [];
    const ends: number[] = [];
    let acc = 0;
    for (const t of sentences) {
      acc += t.length + 1;
      ends.push(acc / (passage.length + 1));
    }
    for (const [i, cue] of plan.cues.entries()) {
      const q = SOUND_QUERY[cue.sound];
      if (!q) continue;
      const path = join(dir, `fx${i}.mp3`);
      const card = await optional(req.id, `effect ${cue.sound} from library`, () => pickEffect(cue.sound, `${req.id}-${i}`, usedIds));
      if (card && (await optional(req.id, `effect ${card.id} (library)`, async () => writeFile(path, await readPrivate(card.file)))) !== null) {
        usedIds.add(card.id);
        effects.push({ path, at: voiceStart + ends[cue.after - 1] * voiceSec + 0.1 });
        credits.push({ kind: "effect", source: "library", id: card.id, name: card.id, author: card.source, licence: card.licence, url: "", attribution: card.attribution });
        used.push({ order_id: req.id, asset_id: card.id, asset_kind: "sfx", role: "sample-cue" });
        continue;
      }
      const hit = await optional(req.id, `effect search ${cue.sound} (Freesound)`, () => freesound(q, 0.5, 8));
      const url = hit?.previews["preview-hq-mp3"];
      if (!hit || !url) continue;
      if ((await optional(req.id, `effect download ${cue.sound} (Freesound)`, () => download(url, path))) === null) continue;
      effects.push({ path, at: voiceStart + ends[cue.after - 1] * voiceSec + 0.1 });
      credits.push(freesoundCredit("effect", hit));
      used.push({ order_id: req.id, asset_id: `freesound-${hit.id}`, asset_kind: "sfx", role: "sample-cue" });
    }

    const out = await step(req.id, "mix (FFmpeg)", () => mix({ dir, tag: tagPath, voice: voicePath, music: musicPath, effects, voiceStart, total, tagEndAt }));
    const qc = await step(req.id, "quality check", () => qualityCheck(out, voicePath, passage, lang));
    const bytes = await readFile(out);

    const key = sampleKey(req.id, n);
    await uploadPrivate(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "audio/mpeg");
    await logUsage(used);
    const creditsJson = new TextEncoder().encode(JSON.stringify({ credits, plan }, null, 2));
    await uploadPrivate(creditsKey(req.id, n), creditsJson.buffer as ArrayBuffer, "application/json");

    return {
      key,
      credits,
      plan,
      qc,
      cost: {
        elevenlabs_chars: passage.length + TAG_TEXT[lang].length,
        claude_input_tokens: planned?.usage.input ?? 0,
        claude_output_tokens: planned?.usage.output ?? 0,
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
async function wordsMatched(voicePath: string, passage: string, lang: string): Promise<number | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", lang === "gu" ? "guj" : lang === "hi" ? "hin" : "eng");
  form.append("file", new Blob([new Uint8Array(await readFile(voicePath))], { type: "audio/mpeg" }), "voice.mp3");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Speech-to-text check failed (${res.status})`);
  const heard = String(((await res.json()) as { text?: string }).text ?? "");
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const want = words(passage);
  if (!want.length) return null;
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
  return Math.round((found / want.length) * 100) / 100;
}

// Limits for an automatic pass. Below them the sample is made again once, then a person looks.
export const QC_LIMITS = { minSeconds: 20, maxSeconds: 90, minLufs: -19, maxLufs: -13, minWords: 0.6 };

export async function qualityCheck(mixPath: string, voicePath: string, passage: string, lang: string): Promise<QualityCheck> {
  const problems: string[] = [];
  const seconds = await duration(mixPath);
  if (seconds < QC_LIMITS.minSeconds || seconds > QC_LIMITS.maxSeconds) problems.push(`length ${Math.round(seconds)} s`);
  const lufs = await loudness(mixPath);
  if (lufs === null) problems.push("loudness not measured");
  else if (lufs < QC_LIMITS.minLufs || lufs > QC_LIMITS.maxLufs) problems.push(`loudness ${lufs} LUFS`);
  let matched: number | null = null;
  try {
    matched = await wordsMatched(voicePath, passage, lang);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "speech-to-text check failed");
  }
  if (matched === null) problems.push("words not checked");
  else if (matched < QC_LIMITS.minWords) problems.push(`only ${Math.round(matched * 100)}% of the words heard`);
  return { pass: !problems.length, seconds: Math.round(seconds * 10) / 10, lufs, words_matched: matched, problems };
}

// Removes an older sample and its credits (when a new one replaces it).
export async function deleteSample(key: string) {
  await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
  const credits = key.replace(/sample-(\d+)\.mp3$/, "credits-$1.json");
  if (credits !== key) await deleteForever({ url: `r2-private:${credits}`, bucket: "private", key: credits });
}
