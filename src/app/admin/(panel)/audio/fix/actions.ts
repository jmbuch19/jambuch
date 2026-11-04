"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

// Problem points marked on an audio play, and "Rebuild episode". The rebuild
// itself runs on Jaydeep's PC (the audio engine reads these settings).
const FIXES = ["fade_in", "fade_out", "pause", "crossfade"] as const;
export type Fix = (typeof FIXES)[number];
const UUID = /^[0-9a-f-]{36}$/;

const done = (chapterId: string) => revalidatePath(`/admin/audio/fix/${chapterId}`);

export async function addMark(chapterId: string, atSeconds: number, note: string) {
  const { db } = await requireAdmin();
  if (!UUID.test(chapterId) || !Number.isFinite(atSeconds) || atSeconds < 0 || atSeconds > 4 * 3600) {
    return { error: "Bad mark." };
  }
  const { error } = await db
    .from("audio_marks")
    .insert({ chapter_id: chapterId, at_seconds: Math.round(atSeconds * 100) / 100, note: note.trim().slice(0, 500) });
  if (error) return { error: error.message };
  done(chapterId);
  return { ok: true };
}

export async function updateMark(
  chapterId: string,
  id: string,
  change: { fix?: Fix | null; length?: number | null; note?: string; active?: boolean },
) {
  const { db } = await requireAdmin();
  if (!UUID.test(id)) return { error: "Bad mark." };
  const row: Record<string, unknown> = {};
  if (change.fix !== undefined) {
    if (change.fix !== null && !FIXES.includes(change.fix)) return { error: "Unknown fix." };
    row.fix = change.fix;
  }
  if (change.length !== undefined) {
    if (change.length !== null && !(change.length > 0 && change.length <= 20)) return { error: "Length must be 0–20 seconds." };
    row.length = change.length;
  }
  if (change.note !== undefined) row.note = change.note.trim().slice(0, 500);
  if (change.active !== undefined) row.active = change.active;
  const { error } = await db.from("audio_marks").update(row).eq("id", id);
  if (error) return { error: error.message };
  done(chapterId);
  return { ok: true };
}

export async function deleteMark(chapterId: string, id: string) {
  const { db } = await requireAdmin();
  if (!UUID.test(id)) return { error: "Bad mark." };
  const { error } = await db.from("audio_marks").delete().eq("id", id);
  if (error) return { error: error.message };
  done(chapterId);
  return { ok: true };
}

export async function requestRebuild(chapterId: string) {
  const { db } = await requireAdmin();
  if (!UUID.test(chapterId)) return { error: "Bad chapter." };
  const { error } = await db
    .from("audio_rebuilds")
    .upsert({ chapter_id: chapterId, requested_at: new Date().toISOString(), built_at: null }, { onConflict: "chapter_id" });
  if (error) return { error: error.message };
  done(chapterId);
  return { ok: true };
}
