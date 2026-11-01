import { requireAdmin } from "@/lib/admin";
import { audioHash, azureReady, chapterScript, loadLexicon } from "@/lib/audio";
import { VOICE_KEYS, type VoiceKey } from "@/lib/audio-voices";
import { bookOrder, entryLabel } from "@/lib/book-sections";
import { guNumber } from "@/lib/library";
import AudioAdmin, { type AudioBook } from "./audio-admin";

// /admin/audio: every readable chapter, whether it has audio in each voice,
// and whether that audio still matches the text and pronunciation list.
export default async function AudioPage() {
  const { db } = await requireAdmin();
  const [worksRes, chaptersRes, audioRes, lexiconRes, lexicon] = await Promise.all([
    db.from("works").select("id, slug, title, title_gu, readable").is("deleted_at", null).order("sort_order"),
    db
      .from("chapters")
      .select("id, work_id, number, section, title, body, status, audio_url")
      .eq("status", "ready")
      .eq("published", true)
      .is("deleted_at", null),
    db.from("chapter_audio").select("chapter_id, voice, text_hash, duration_ms, characters, url"),
    db.from("settings").select("value").eq("key", "audio.lexicon").maybeSingle(),
    loadLexicon(db),
  ]);
  const made = new Map((audioRes.data ?? []).map((r) => [`${r.chapter_id}:${r.voice}`, r]));

  const books: AudioBook[] = (worksRes.data ?? [])
    .filter((w) => w.readable)
    .map((w) => ({
      id: w.id as string,
      title: (w.title_gu ?? w.title) as string,
      chapters: bookOrder((chaptersRes.data ?? []).filter((c) => c.work_id === w.id && c.body?.trim())).map((c) => {
        const script = chapterScript(c, lexicon);
        const voices = Object.fromEntries(
          VOICE_KEYS.map((v) => {
            const row = made.get(`${c.id}:${v}`);
            const state = !row ? "none" : row.text_hash === audioHash(v, script) ? "current" : "outdated";
            return [v, { state, durationMs: row?.duration_ms ?? null, url: row?.url ?? null }];
          }),
        ) as AudioBook["chapters"][number]["voices"];
        return {
          id: c.id as string,
          label: c.section ? entryLabel(c) : `${guNumber(c.number ?? 0)}.`,
          title: c.title as string,
          characters: script.characters,
          ownRecording: !!c.audio_url,
          voices,
        };
      }),
    }))
    .filter((b) => b.chapters.length > 0);

  return (
    <AudioAdmin
      books={books}
      azureReady={azureReady()}
      lexicon={typeof lexiconRes.data?.value === "string" ? lexiconRes.data.value : ""}
      voices={VOICE_KEYS as VoiceKey[]}
      error={worksRes.error?.message ?? chaptersRes.error?.message ?? audioRes.error?.message ?? null}
    />
  );
}
