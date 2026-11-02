"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { loadVoiceChoices, parseLexicon, saveProduction, type ProductionTimings } from "@/lib/audio";
import { PIECE_BYTES, PRODUCTION_KEYS, isProduction, isVoice, type ProductionKey } from "@/lib/audio-voices";
import { deleteForever, fileRef, r2Problem, readPrivate, uploadPrivate } from "@/lib/r2";

// Large audio files go up in pieces (PIECE_BYTES each). Pieces wait in the
// private bucket until the upload is finished, then are joined and removed.
const MAX_PIECES = 60; // about 200 MB
const UPLOAD_ID = /^[0-9a-f-]{36}$/;
const pieceKey = (id: string, index: number) => `uploads/audio/${id}/${index}`;

export async function uploadAudioPiece(form: FormData): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const problem = r2Problem();
  if (problem) return { error: `Uploads aren't set up yet (${problem}).` };
  const id = String(form.get("id") ?? "");
  const index = Number(form.get("index"));
  const piece = form.get("piece");
  if (!UPLOAD_ID.test(id) || !Number.isInteger(index) || index < 0 || index >= MAX_PIECES) return { error: "Bad upload." };
  if (!(piece instanceof Blob) || piece.size === 0 || piece.size > PIECE_BYTES) return { error: "Bad upload piece." };
  try {
    await uploadPrivate(pieceKey(id, index), await piece.arrayBuffer(), "application/octet-stream");
    return { ok: true };
  } catch (e) {
    console.error("audio piece upload failed:", e);
    return { error: "A piece of the upload didn’t go through. Please try again." };
  }
}

type Uploaded = { kind: ProductionKey; id: string; pieces: number };
type TimingsFile = { chapter?: unknown } & Partial<Record<ProductionKey, ProductionTimings>>;

// Joins the uploaded pieces of each file and saves them for the chapter,
// with the paragraph timings from the timings file made alongside the audio.
export async function finishAudioPlay(
  chapterId: string,
  timings: TimingsFile,
  files: Uploaded[],
): Promise<{ ok: true; saved: { kind: ProductionKey; url: string; durationMs: number }[] } | { error: string }> {
  const { db } = await requireAdmin();
  const { data: c } = await db.from("chapters").select("number, section").eq("id", chapterId).maybeSingle();
  if (!c) return { error: "Chapter not found." };
  if (typeof timings?.chapter === "number" && !c.section && timings.chapter !== c.number) {
    return { error: `These files are for chapter ${timings.chapter}, but this row is chapter ${c.number}.` };
  }
  if (!files.some((f) => f.kind === "play")) return { error: "The audio play MP3 is missing." };

  const saved: { kind: ProductionKey; url: string; durationMs: number }[] = [];
  try {
    for (const f of files) {
      if (!isProduction(f.kind) || !UPLOAD_ID.test(f.id) || !Number.isInteger(f.pieces) || f.pieces < 1 || f.pieces > MAX_PIECES) {
        return { error: "Bad upload." };
      }
      const t = timings[f.kind];
      if (!t) return { error: `The timings file has nothing for the ${f.kind === "play" ? "audio play" : "voice-only"} file.` };
      const parts: Uint8Array[] = [];
      for (let i = 0; i < f.pieces; i++) parts.push(await readPrivate(pieceKey(f.id, i)));
      const mp3 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        mp3.set(p, at);
        at += p.length;
      }
      // An MP3 starts with an ID3 tag or an MPEG frame.
      const isMp3 = (mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33) || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0);
      if (!isMp3) return { error: "That file doesn’t look like an MP3." };
      saved.push({ kind: f.kind, ...(await saveProduction(db, chapterId, f.kind, mp3, t)) });
    }
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    for (const f of files) {
      for (let i = 0; i < Math.min(Number(f.pieces) || 0, MAX_PIECES); i++) {
        const ref = UPLOAD_ID.test(f.id) ? fileRef(`r2-private:${pieceKey(f.id, i)}`) : null;
        if (ref) await deleteForever(ref).catch(() => {});
      }
    }
  }
  revalidatePath("/admin/audio");
  revalidatePath("/library/[work]/[chapter]", "page");
  return { ok: true, saved };
}

// Turns the Azure voices on or off for readers (the recordings stay saved).
export async function setAzureForReaders(on: boolean): Promise<{ ok: true } | { error: string }> {
  const { db } = await requireAdmin();
  const { error } = await db.from("settings").upsert({ key: "audio.azure_readers", value: on });
  if (error) return { error: error.message };
  revalidatePath("/admin/audio");
  revalidatePath("/library/[work]/[chapter]", "page");
  return { ok: true };
}

// "Use Azure instead": readers hear the Azure voice while the audio play is
// paused; it stays saved and comes back with one tap.
export async function setProductionPaused(chapterId: string, paused: boolean): Promise<{ ok: true } | { error: string }> {
  const { db } = await requireAdmin();
  const { error } = await db.from("chapter_audio").update({ paused }).eq("chapter_id", chapterId).in("voice", PRODUCTION_KEYS);
  if (error) return { error: error.message };
  revalidatePath("/admin/audio");
  revalidatePath("/library/[work]/[chapter]", "page");
  return { ok: true };
}

// Saves the pronunciation list ("word = say as", one per line). Chapters that
// contain a changed word show as out of date until they are made again.
export async function saveLexicon(text: string): Promise<{ ok: true; count: number } | { error: string }> {
  const { db } = await requireAdmin();
  const clean = text.replace(/\r\n/g, "\n").slice(0, 20000);
  const { error } = await db.from("settings").upsert({ key: "audio.lexicon", value: clean });
  if (error) return { error: error.message };
  revalidatePath("/admin/audio");
  return { ok: true, count: parseLexicon(clean).length };
}

// Sets the voice for a book, or for one chapter (null: use the book's voice).
export async function saveVoiceChoice(
  kind: "book" | "chapter",
  id: string,
  voice: string | null,
): Promise<{ ok: true } | { error: string }> {
  const { db } = await requireAdmin();
  if (voice !== null && !isVoice(voice)) return { error: "Unknown voice." };
  const choices = await loadVoiceChoices(db);
  const map = kind === "book" ? choices.books : choices.chapters;
  if (voice) map[id] = voice;
  else delete map[id];
  const { error } = await db.from("settings").upsert({ key: "audio.voices", value: choices });
  if (error) return { error: error.message };
  revalidatePath("/admin/audio");
  return { ok: true };
}
