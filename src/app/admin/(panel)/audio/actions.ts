"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { loadVoiceChoices, parseLexicon } from "@/lib/audio";
import { isVoice } from "@/lib/audio-voices";

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
