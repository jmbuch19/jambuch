import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { entryLabel } from "@/lib/book-sections";
import FixPanel, { type Mark } from "./fix-panel";
import a from "../../../../admin.module.css";

// /admin/audio/fix/<chapter>: listen to the audio play, mark problem points,
// choose a fix for each, and ask for the episode to be rebuilt.
export const dynamic = "force-dynamic";

export default async function FixPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: chapterId } = await params;
  const { db } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(chapterId)) notFound();
  const [chapterRes, playRes, marksRes, rebuildRes] = await Promise.all([
    db.from("chapters").select("id, number, section, title").eq("id", chapterId).maybeSingle(),
    db.from("chapter_audio").select("url, duration_ms, created_at").eq("chapter_id", chapterId).eq("voice", "play").maybeSingle(),
    db.from("audio_marks").select("id, at_seconds, note, fix, length, active, anchor, built_at, created_at").eq("chapter_id", chapterId).order("at_seconds"),
    db.from("audio_rebuilds").select("requested_at, built_at").eq("chapter_id", chapterId).maybeSingle(),
  ]);
  const chapter = chapterRes.data;
  if (!chapter) notFound();
  const marks = (marksRes.data ?? []).map((m) => ({
    ...m,
    at_seconds: Number(m.at_seconds),
    length: m.length == null ? null : Number(m.length),
    built_at: m.built_at == null ? null : Number(m.built_at),
  })) as Mark[];

  return (
    <>
      <p>
        <Link href="/admin/audio">← Listening</Link>
      </p>
      <h1 className={a.title}>
        {chapter.section ? entryLabel(chapter) : `Chapter ${chapter.number}`} · <span className="gu">{chapter.title}</span>
      </h1>
      <p className={a.intro}>
        Listen, and press <strong>Mark a problem here</strong> wherever something sounds wrong (a sudden stop, a click, a
        rushed pause). Choose a fix for each point, then <strong>Rebuild episode</strong>. Fixes are settings: the original
        voice lines are never changed, and turning a fix off undoes it at the next rebuild.
      </p>
      {marksRes.error && <p className={a.notice}>{marksRes.error.message}</p>}
      {playRes.data ? (
        <FixPanel
          chapterId={chapter.id}
          url={playRes.data.url}
          marks={marks}
          rebuild={rebuildRes.data ?? null}
          uploadedAt={playRes.data.created_at}
        />
      ) : (
        <p className={a.notice}>This chapter has no audio play uploaded yet.</p>
      )}
    </>
  );
}
