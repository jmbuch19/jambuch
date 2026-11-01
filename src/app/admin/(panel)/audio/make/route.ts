import { requireAdmin } from "@/lib/admin";
import { makeChapterAudio } from "@/lib/audio";
import { isVoice } from "@/lib/audio-voices";

// POST /admin/audio/make {chapterId, voice}: one chapter in one voice. The
// Listening page calls it chapter by chapter, so "make all" never runs into a
// time limit and shows its progress.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { db } = await requireAdmin();
  const { chapterId, voice } = (await request.json().catch(() => ({}))) as { chapterId?: unknown; voice?: unknown };
  if (typeof chapterId !== "string" || !isVoice(voice)) {
    return Response.json({ error: "Which chapter and voice?" }, { status: 400 });
  }
  try {
    const made = await makeChapterAudio(db, chapterId, voice);
    return Response.json(made);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
