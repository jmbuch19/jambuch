import { requireAdmin } from "@/lib/admin";
import { DEFAULT_VOICE, audioHash, azureForReaders, azureReady, chapterScript, loadLexicon, loadVoiceChoices, productionHash } from "@/lib/audio";
import { VOICE_KEYS, type VoiceKey } from "@/lib/audio-voices";
import { bookOrder, entryLabel } from "@/lib/book-sections";
import { guNumber } from "@/lib/library";
import AudioAdmin, { type AudioBook } from "./audio-admin";

// /admin/audio: every readable chapter, whether it has audio in each voice,
// and whether that audio still matches the text and pronunciation list.
export default async function AudioPage() {
  const { db } = await requireAdmin();
  const [worksRes, chaptersRes, audioRes, lexiconRes, lexicon, choices, azureOn] = await Promise.all([
    db.from("works").select("id, slug, title, title_gu, readable").is("deleted_at", null).order("sort_order"),
    db
      .from("chapters")
      .select("id, work_id, number, section, title, body, status, audio_url")
      .eq("status", "ready")
      .eq("published", true)
      .is("deleted_at", null),
    db.from("chapter_audio").select("chapter_id, voice, text_hash, duration_ms, characters, url, paused"),
    db.from("settings").select("value").eq("key", "audio.lexicon").maybeSingle(),
    loadLexicon(db),
    loadVoiceChoices(db),
    azureForReaders(db),
  ]);
  const made = new Map((audioRes.data ?? []).map((r) => [`${r.chapter_id}:${r.voice}`, r]));

  const books: AudioBook[] = (worksRes.data ?? [])
    .filter((w) => w.readable)
    .map((w) => ({
      id: w.id as string,
      title: (w.title_gu ?? w.title) as string,
      voice: choices.books[w.id] ?? DEFAULT_VOICE,
      chapters: bookOrder((chaptersRes.data ?? []).filter((c) => c.work_id === w.id && c.body?.trim())).map((c) => {
        const script = chapterScript(c, lexicon);
        const voices = Object.fromEntries(
          VOICE_KEYS.map((v) => {
            const row = made.get(`${c.id}:${v}`);
            const state = !row ? "none" : row.text_hash === audioHash(v, script) ? "current" : "outdated";
            return [v, { state, durationMs: row?.duration_ms ?? null, url: row?.url ?? null }];
          }),
        ) as AudioBook["chapters"][number]["voices"];
        // The uploaded audio play, if any (and its voice-only version).
        const play = made.get(`${c.id}:play`);
        const spoken = made.get(`${c.id}:spoken`);
        const playHash = productionHash(c.body);
        return {
          id: c.id as string,
          label: c.section ? entryLabel(c) : `${guNumber(c.number ?? 0)}.`,
          title: c.title as string,
          characters: script.characters,
          ownRecording: !!c.audio_url,
          voiceOverride: choices.chapters[c.id] ?? null,
          voices,
          play: play
            ? {
                state: play.text_hash === playHash ? ("current" as const) : ("outdated" as const),
                durationMs: play.duration_ms,
                url: play.url,
                spokenUrl: spoken?.url ?? null,
                paused: !!play.paused,
              }
            : null,
        };
      }),
    }))
    .filter((b) => b.chapters.length > 0);

  return (
    <AudioAdmin
      books={books}
      azureReady={azureReady()}
      azureForReaders={azureOn}
      lexicon={typeof lexiconRes.data?.value === "string" ? lexiconRes.data.value : ""}
      voices={VOICE_KEYS as VoiceKey[]}
      error={worksRes.error?.message ?? chaptersRes.error?.message ?? audioRes.error?.message ?? null}
    />
  );
}
