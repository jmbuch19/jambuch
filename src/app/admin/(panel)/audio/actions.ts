"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { parseLexicon } from "@/lib/audio";

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
