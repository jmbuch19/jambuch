import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { allRows, clock, hoursOrMinutes, median, minutes, pct } from "@/lib/admin-stats";
import { bookOrder, entryLabel } from "@/lib/book-sections";
import PlayFrom from "./play-from";
import a from "../../admin.module.css";

// Anonymous listening of the audio plays (chapter_listens), book by book.
// Counted apart from reading (admin → Readers); the two are never added up.
// Your own listening while signed in as admin is never recorded.
export const dynamic = "force-dynamic";

type Listen = {
  chapter_id: string;
  reader_id: string;
  work_id: string;
  last_seen: string;
  sessions: number;
  listened_seconds: number;
  duration: number;
  heard_minutes: number[];
  rewinds: number[];
  skips: number;
  speed_seconds: Record<string, number>;
  finished_at: string | null;
};
type Work = { id: string; title: string; title_gu: string | null };
type Chapter = { id: string; work_id: string; number: number | null; section: string | null; title: string };
type Audio = { chapter_id: string; voice: string; url: string; duration_ms: number };

const DAY = 24 * 60 * 60 * 1000;
const SPOT_S = 10; // rewinds within the same 10 seconds are one hotspot
const SPEEDS = ["1", "1.25", "1.5", "0.75", "2"];

// Where listeners jumped back to, busiest first.
function hotspots(rows: Listen[], top: number) {
  const counts = new Map<number, number>();
  for (const r of rows)
    for (const at of r.rewinds) {
      const spot = Math.floor(at / SPOT_S) * SPOT_S;
      counts.set(spot, (counts.get(spot) ?? 0) + 1);
    }
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, top)
    .map(([at, count]) => ({ at, count }));
}

// Share of all listening time heard at each speed.
function speeds(rows: Listen[]) {
  const totals = new Map<string, number>();
  for (const r of rows)
    for (const [k, v] of Object.entries(r.speed_seconds ?? {})) totals.set(String(Number(k)), (totals.get(String(Number(k))) ?? 0) + v);
  const all = [...totals.values()].reduce((s, v) => s + v, 0);
  // 2x appears only once someone has used it.
  return SPEEDS.filter((k) => k !== "2" || totals.has(k)).map((k) => ({
    speed: `${k}x`,
    share: all ? (totals.get(k) ?? 0) / all : 0,
  }));
}

export default async function ListenersPage({ searchParams }: { searchParams: Promise<{ chapter?: string }> }) {
  const { chapter: openId } = await searchParams;
  const { db } = await requireAdmin();
  const [listens, worksRes, chaptersRes, audioRes] = await Promise.all([
    allRows<Listen>(
      db,
      "chapter_listens",
      "chapter_id, reader_id, work_id, last_seen, sessions, listened_seconds, duration, heard_minutes, rewinds, skips, speed_seconds, finished_at",
    ),
    db.from("works").select("id, title, title_gu").is("deleted_at", null).order("sort_order"),
    db.from("chapters").select("id, work_id, number, section, title").is("deleted_at", null),
    db.from("chapter_audio").select("chapter_id, voice, url, duration_ms").eq("voice", "play"),
  ]);
  const works = (worksRes.data ?? []) as Work[];
  const chapters = (chaptersRes.data ?? []) as Chapter[];
  const plays = new Map(((audioRes.data ?? []) as Audio[]).map((p) => [p.chapter_id, p]));

  const now = Date.now();
  const listenersSince = (days: number) =>
    new Set(listens.filter((r) => now - Date.parse(r.last_seen) < days * DAY).map((r) => r.reader_id)).size;
  const allListeners = new Set(listens.map((r) => r.reader_id)).size;
  const finishedCount = listens.filter((r) => r.finished_at).length;
  const totalSeconds = listens.reduce((s, r) => s + r.listened_seconds, 0);
  const shares = listens.filter((r) => r.duration > 0).map((r) => Math.min(1, r.listened_seconds / r.duration));
  const averageShare = shares.length ? shares.reduce((s, v) => s + v, 0) / shares.length : null;

  return (
    <>
      <h1 className={a.title}>Listeners</h1>
      <p className={a.intro}>
        Anonymous listening of the audio plays: each browser counts once per chapter. Only time actually heard counts
        (skipping ahead doesn’t). An episode counts as finished when the listener reaches 90% of it and has heard at
        least half. Your own listening while signed in is not counted. Reading is counted separately on the Readers
        page; the two are never added together.
      </p>
      <p className={a.notice}>YouTube episodes are measured in YouTube Studio, not here.</p>

      <div className={a.tiles}>
        <div className={a.tile}>
          <span className={a.tileCount}>{listenersSince(7)}</span>
          <span>Listeners this week</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{listenersSince(30)}</span>
          <span>Listeners this month</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{allListeners}</span>
          <span>Listeners so far</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{finishedCount}</span>
          <span>Episodes finished</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{hoursOrMinutes(totalSeconds)}</span>
          <span>Total listening time</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{averageShare == null ? "—" : `${Math.round(averageShare * 100)}%`}</span>
          <span>Average share of an episode heard</span>
        </div>
      </div>

      {listens.length === 0 && (
        <p className={a.notice}>
          No listening recorded yet. When visitors play a chapter’s audio, it appears here within a minute.
        </p>
      )}

      {works.map((work) => {
        const workChapters = bookOrder(chapters.filter((c) => c.work_id === work.id));
        const workListens = listens.filter((r) => r.work_id === work.id);
        if (workListens.length === 0) return null;
        const rowsOf = (chapterId: string) => workListens.filter((r) => r.chapter_id === chapterId);
        const listenersOf = (chapterId: string) => new Set(rowsOf(chapterId).map((r) => r.reader_id));
        const peak = Math.max(1, ...workChapters.map((c) => rowsOf(c.id).length));
        const bookListeners = new Set(workListens.map((r) => r.reader_id)).size;
        const finishers = new Set(workListens.filter((r) => r.finished_at).map((r) => r.reader_id)).size;
        const open = workChapters.find((c) => c.id === openId);

        return (
          <section key={work.id} className={a.readersBook}>
            <h2 className={a.readersTitle}>
              <span className="gu">{work.title_gu ?? work.title}</span>
              <small>
                {bookListeners} {bookListeners === 1 ? "listener" : "listeners"} · {finishers} finished at least one
                episode
              </small>
            </h2>
            <div className={a.tableWrap}>
              <table className={a.table}>
                <thead>
                  <tr>
                    <th>Chapter</th>
                    <th>Listeners</th>
                    <th>Finished</th>
                    <th>Typical time heard</th>
                    <th>Episode length</th>
                    <th>Went on to next</th>
                    <th>Came back</th>
                    <th>Rewind hotspots</th>
                  </tr>
                </thead>
                <tbody>
                  {workChapters.map((c, i) => {
                    const rows = rowsOf(c.id);
                    if (rows.length === 0 && !plays.has(c.id)) return null;
                    const listeners = listenersOf(c.id);
                    const finished = rows.filter((r) => r.finished_at).length;
                    const next = workChapters[i + 1];
                    const wentOn = next ? [...listenersOf(next.id)].filter((id) => listeners.has(id)).length : null;
                    const returning = rows.filter((r) => r.sessions > 1).length;
                    const length = plays.get(c.id)?.duration_ms
                      ? plays.get(c.id)!.duration_ms / 1000
                      : Math.max(0, ...rows.map((r) => r.duration));
                    const spots = hotspots(rows, 2);
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link
                            href={c.id === openId ? "/admin/listeners" : `/admin/listeners?chapter=${c.id}#detail`}
                            className={a.rowLink}
                            scroll={false}
                          >
                            {c.section ? entryLabel(c) : `${c.number}.`} <span className="gu">{c.title}</span>
                          </Link>
                        </td>
                        <td>
                          <div className={a.barCell}>
                            <span className={a.barFill} style={{ width: `${(rows.length / peak) * 100}%` }} />
                            <span>{rows.length}</span>
                          </div>
                        </td>
                        <td>
                          {finished} <small className={a.mutedSmall}>{pct(finished, rows.length)}</small>
                        </td>
                        <td>{minutes(median(rows.filter((r) => r.listened_seconds > 0).map((r) => r.listened_seconds)))}</td>
                        <td>{length ? clock(length) : "—"}</td>
                        <td>{wentOn == null ? "—" : <>{wentOn} <small className={a.mutedSmall}>{pct(wentOn, rows.length)}</small></>}</td>
                        <td>{returning}</td>
                        <td>{spots.length ? spots.map((s) => `${clock(s.at)} (${s.count})`).join(" · ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {open && <ChapterDetail chapter={open} rows={rowsOf(open.id)} play={plays.get(open.id)} />}
          </section>
        );
      })}
    </>
  );
}

// One chapter opened from the table: where listeners stopped, what they went
// back for, and how fast they listened.
function ChapterDetail({ chapter, rows, play }: { chapter: Chapter; rows: Listen[]; play: Audio | undefined }) {
  const length = play?.duration_ms ? play.duration_ms / 1000 : Math.max(0, ...rows.map((r) => r.duration));
  const minuteCount = Math.max(1, Math.ceil(length / 60));
  // % of this chapter's listeners who heard each minute.
  const curve = Array.from({ length: minuteCount }, (_, m) =>
    rows.length ? rows.filter((r) => r.heard_minutes.includes(m)).length / rows.length : 0,
  );
  const spots = hotspots(rows, 3);
  const speedRows = speeds(rows);
  const skips = rows.reduce((s, r) => s + r.skips, 0);

  return (
    <div id="detail" className={a.listenDetail}>
      <h3>
        {chapter.section ? entryLabel(chapter) : `Chapter ${chapter.number}`} · <span className="gu">{chapter.title}</span>
      </h3>
      <p className={a.mutedSmall}>
        {rows.length} {rows.length === 1 ? "listener" : "listeners"} · {skips} {skips === 1 ? "skip" : "skips"} forward
      </p>

      <h4>Still listening, minute by minute</h4>
      {rows.length === 0 ? (
        <p className={a.mutedSmall}>No listening yet.</p>
      ) : (
        <>
          <div className={a.curve} role="img" aria-label="Share of listeners who heard each minute">
            {curve.map((share, m) => (
              <span key={m} style={{ height: `${Math.max(1, share * 100)}%` }} title={`Minute ${m + 1}: ${Math.round(share * 100)}%`} />
            ))}
          </div>
          <div className={a.curveAxis}>
            <span>0:00 · {Math.round(curve[0] * 100)}%</span>
            <span>
              {clock(length)} · {Math.round(curve[curve.length - 1] * 100)}%
            </span>
          </div>
        </>
      )}

      <h4>Rewind hotspots</h4>
      {spots.length === 0 ? (
        <p className={a.mutedSmall}>No one has gone back yet.</p>
      ) : play ? (
        <PlayFrom url={play.url} spots={spots} />
      ) : (
        <p>{spots.map((s) => `${clock(s.at)} (${s.count})`).join(" · ")}</p>
      )}

      <h4>Speed used</h4>
      <div className={a.speedRows}>
        {speedRows.map((s) => (
          <div key={s.speed} style={{ display: "contents" }}>
            <span>{s.speed}</span>
            <div className={a.barCell}>
              <span className={a.barFill} style={{ width: `${s.share * 100}%` }} />
              <span>{Math.round(s.share * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
