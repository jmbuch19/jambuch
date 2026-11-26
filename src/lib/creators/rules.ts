import "server-only";
import { readPrivate } from "@/lib/r2";

// Narration rules come from the ENGINE's rule files, not from this site (Jaydeep, 25 Nov 2026).
// The engine repo is private (home PC), so it exports them to the private R2 bucket as
//   media/rules/narration.json
//   { "source": "docs/narration.md + docs/sound-guide.md @ <commit>", "exported_at": "...",
//     "pauses": { "<name>": seconds | [min, max] }, "loudness": { "video_lufs": -16 },
//     "levels": { "<name>": dB } }
// The sample reads that file every time. Values the export doesn't have yet come from STANDIN
// below, which is NOT a rule copy: it is the stand-in Jaydeep set on 25 Nov until the engine's
// narration.md has them; admin shows which values are stand-ins.

export type PauseName = "join" | "paragraph" | "scene_break" | "dialogue_change" | "title" | "author" | "title_swell" | "end" | "cue_hold";

// Levels (dB), from the engine's sound guide §0 (26 Nov 2026: "Sounds are the Souls of the Story"):
//   cue_present   an effect in a pause, as each sound's mean level before the final normalising
//   simile_under  a sound that plays under the words it is likened to ("a voice like thunder")
//   voice_clear   how far every background sound must sit below the voice while it speaks
export type LevelName = "cue_present" | "simile_under" | "voice_clear";

// Stand-ins until media/rules/narration.json has each value. "join" and "paragraph" match the
// engine's docs today (narration.md 0.3 s; sound-guide.md 0.6–0.8 s); the rest were missing
// from them on 25 Nov 2026 and are Jaydeep's starting values.
const STANDIN: Record<PauseName, number | [number, number]> = {
  join: 0.3,
  paragraph: [0.6, 0.8],
  scene_break: [1.5, 2],
  dialogue_change: [0.3, 0.5],
  title: 1.5,
  author: 1.0,
  title_swell: 2.0,
  end: 2.0,
  cue_hold: 1.5, // the words wait for an effect placed after a line (engine: gap 0.8–1.2 s plus the fade)
};

// Stand-ins on 26 Nov 2026, read from the engine's sound guide §0 by hand (present −31 to −34 dB;
// a simile heard at about −33 dB; music and beds at least 10 dB below the voice). The export
// replaces them.
const LEVEL_STANDIN: Record<LevelName, number> = { cue_present: -32, simile_under: -33, voice_clear: 10 };

export type NarrationRules = {
  pauses: Record<PauseName, number>; // seconds (a range's middle)
  levels: Record<LevelName, number>; // dB
  fromEngine: (PauseName | LevelName)[];
  standIn: (PauseName | LevelName)[];
  source: string | null;
  videoLufs: number;
};

let cache: { at: number; rules: NarrationRules } | null = null;
const mid = (v: number | [number, number]) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
const valid = (v: unknown): v is number | [number, number] =>
  (typeof v === "number" && v >= 0 && v <= 10) ||
  (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && x >= 0 && x <= 10));

export async function narrationRules(): Promise<NarrationRules> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rules;
  let exported: { source?: string; pauses?: Record<string, unknown>; levels?: Record<string, unknown>; loudness?: { video_lufs?: number } } | null = null;
  try {
    exported = JSON.parse(new TextDecoder().decode(await readPrivate("media/rules/narration.json")));
  } catch {
    exported = null; // not exported yet
  }
  const pauses = {} as Record<PauseName, number>;
  const fromEngine: (PauseName | LevelName)[] = [];
  const standIn: (PauseName | LevelName)[] = [];
  for (const name of Object.keys(STANDIN) as PauseName[]) {
    const v = exported?.pauses?.[name];
    if (valid(v)) {
      pauses[name] = mid(v);
      fromEngine.push(name);
    } else {
      pauses[name] = mid(STANDIN[name]);
      standIn.push(name);
    }
  }
  const levels = {} as Record<LevelName, number>;
  for (const name of Object.keys(LEVEL_STANDIN) as LevelName[]) {
    const v = exported?.levels?.[name];
    const ok = typeof v === "number" && (name === "voice_clear" ? v >= 3 && v <= 30 : v <= -10 && v >= -60);
    levels[name] = ok ? v : LEVEL_STANDIN[name];
    (ok ? fromEngine : standIn).push(name);
  }
  const lufs = exported?.loudness?.video_lufs;
  const rules: NarrationRules = {
    pauses,
    levels,
    fromEngine,
    standIn,
    source: exported?.source ?? null,
    videoLufs: typeof lufs === "number" && lufs < -6 && lufs > -30 ? lufs : -16,
  };
  cache = { at: Date.now(), rules };
  return rules;
}
