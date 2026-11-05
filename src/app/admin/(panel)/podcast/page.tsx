import { requireAdmin } from "@/lib/admin";
import { FEED_KEY, episodeTitle, loadEpisodes, loadShow } from "@/lib/podcast";
import { publicUrlFor } from "@/lib/r2";
import PodcastPanel from "./podcast-panel";
import a from "../../admin.module.css";

// The Ramayana podcast: the show's details, which chapters are episodes, and
// the feed Spotify and Apple read (docs/…-AV-Pipeline-System-Prompt.md §9.5).
export const dynamic = "force-dynamic";

export default async function PodcastPage() {
  const { db } = await requireAdmin();
  let show, episodes;
  try {
    [show, episodes] = await Promise.all([loadShow(db), loadEpisodes(db)]);
  } catch (err) {
    return (
      <>
        <h1 className={a.title}>Podcast</h1>
        <p className={a.error}>{err instanceof Error ? err.message : "Couldn't load the podcast."}</p>
      </>
    );
  }
  return (
    <>
      <h1 className={a.title}>Podcast</h1>
      <p className={a.intro}>
        The Ramayana audio plays as a podcast. Spotify and Apple read the feed at{" "}
        <code>{publicUrlFor(FEED_KEY) ?? "(media address not set)"}</code>. Each publish rebuilds the whole feed, checks it, and keeps the
        previous one as feed.xml.bak. An episode, once published, stays in the feed with the same ID and date.
      </p>
      <PodcastPanel
        show={show}
        episodes={episodes.map((e) => ({
          chapterId: e.chapterId,
          guid: e.guid,
          title: episodeTitle(e),
          included: e.included,
          description: e.description,
          firstPublishedAt: e.firstPublishedAt,
          hasAudio: !!e.audio,
          audioIssue: !e.audio ? "no audio" : !e.audio.current ? "out of date" : e.audio.paused ? "paused" : null,
          minutes: e.audio ? Math.round(e.audio.durationMs / 60000) : null,
        }))}
      />
    </>
  );
}
