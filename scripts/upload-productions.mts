// Uploads audio plays (and their voice-only versions) from the production
// folder, exactly as the admin Listening page does, with the same checks.
//   npx tsx --conditions=react-server scripts/upload-productions.mts 13-75 preface      dry run: what would change
//   npx tsx --conditions=react-server scripts/upload-productions.mts 13-75 --go         upload
// Each chapter needs D:/jambuch-audio-pilot/chNN/{chNN-audio-play.mp3, chNN-voice-only.mp3, timings.json}.
// Skipped: chapters uploaded after their local files were last built (nothing new), unless --force.
// Stops at the first problem. Keys come from .env.local (Supabase service role, R2).
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PILOT = "D:/jambuch-audio-pilot";
const WORK = "ramayana";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
const { saveProduction } = await import("../src/lib/audio.ts");

const args = process.argv.slice(2);
const go = args.includes("--go"), force = args.includes("--force");
const wanted = args.filter((a) => !a.startsWith("--")).flatMap((a) => {
  const r = /^(\d+)-(\d+)$/.exec(a);
  return r ? Array.from({ length: +r[2] - +r[1] + 1 }, (_, i) => String(+r[1] + i)) : [a];
});
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const mp3Ms = (f: string) => 1000 * Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

const { data: work } = await db.from("works").select("id").eq("slug", WORK).single();
let changed = 0, same = 0;
for (const w of wanted) {
  const section = /^\d+$/.test(w) ? null : w;
  const dir = section ?? `ch${w.padStart(2, "0")}`;
  const name = (s: string) => `${PILOT}/${dir}/${dir}-${s}.mp3`;
  const files = { play: name("audio-play"), spoken: name("voice-only"), timings: `${PILOT}/${dir}/timings.json` };
  for (const f of Object.values(files)) if (!existsSync(f)) throw new Error(`${dir}: missing ${f}`);
  const t = JSON.parse(readFileSync(files.timings, "utf8"));
  if (section ? t.section !== section : t.chapter !== +w) throw new Error(`${dir}: timings.json is for ${t.section ?? `chapter ${t.chapter}`}`);
  for (const k of ["play", "spoken"] as const) {
    const ms = mp3Ms(files[k]);
    if (Math.abs(ms - t[k].durationMs) > 2000) throw new Error(`${dir}: ${k} MP3 is ${clock(ms)}, timings.json says ${clock(t[k].durationMs)} — files from different builds`);
  }
  let q = db.from("chapters").select("id, number, section").eq("work_id", work!.id).is("deleted_at", null);
  q = section ? q.eq("section", section) : q.eq("number", +w).is("section", null);
  const { data: rows } = await q;
  if (rows?.length !== 1) throw new Error(`${dir}: ${rows?.length ?? 0} chapter rows found`);
  const id = rows[0].id;
  const { data: live } = await db.from("chapter_audio").select("voice, duration_ms, created_at").eq("chapter_id", id).in("voice", ["play", "spoken"]);
  const liveMs = Object.fromEntries((live ?? []).map((r) => [r.voice, r.duration_ms]));
  // Same length is no proof (a word can change and keep the length): what's live
  // is current only if it went up after the local files were last built.
  const built = Math.max(...(["play", "spoken", "timings"] as const).map((k) => statSync(files[k]).mtimeMs));
  const up = (live ?? []).map((r) => Date.parse(r.created_at));
  const isSame = up.length === 2 && Math.min(...up) > built;
  const when = live?.find((r) => r.voice === "play")?.created_at?.slice(0, 16).replace("T", " ") ?? "never";
  if (isSame && !force) {
    same++;
    console.log(`${dir}: live is current (uploaded ${when} UTC, after the last build) — skipped`);
    continue;
  }
  changed++;
  if (!go) {
    console.log(`${dir}: would replace ${liveMs.play ? clock(liveMs.play) : "nothing"} (uploaded ${when}) with ${clock(t.play.durationMs)}`);
    continue;
  }
  for (const k of ["play", "spoken"] as const) await saveProduction(db, id, k, new Uint8Array(readFileSync(files[k])), t[k]);
  console.log(`${dir}: uploaded ${clock(t.play.durationMs)} (was ${liveMs.play ? clock(liveMs.play) : "nothing"}, ${when})`);
}
console.log(`\n${go ? "uploaded" : "would upload"} ${changed}, already live ${same}${go ? "" : " — dry run; add --go to upload"}`);
