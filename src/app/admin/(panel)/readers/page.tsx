import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin";
import a from "../../admin.module.css";

// Anonymous reading activity (chapter_reads), book by book. Your own reading
// while signed in as admin is never recorded, so it doesn't appear here.
export const dynamic = "force-dynamic";

type Read = {
  chapter_id: string;
  reader_id: string;
  work_id: string;
  first_seen: string;
  last_seen: string;
  visits: number;
  seconds: number;
  finished_at: string | null;
  device: string | null;
  theme: string | null;
  text_size: number | null;
  spacing: string | null;
};
type Work = { id: string; title: string; title_gu: string | null };
type Chapter = { id: string; work_id: string; number: number; title: string };

const DAY = 24 * 60 * 60 * 1000;

// Supabase returns at most 1,000 rows per request, so read in pages.
async function allReads(db: SupabaseClient) {
  const rows: Read[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("chapter_reads")
      .select("chapter_id, reader_id, work_id, first_seen, last_seen, visits, seconds, finished_at, device, theme, text_size, spacing")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Read[]));
    if (!data || data.length < 1000) return rows;
  }
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function minutes(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return "under 1 min";
  return `${Math.round(seconds / 60)} min`;
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

// "phone 62% · desktop 30% · tablet 8%" from each reader's latest choice.
function split(rows: Read[], key: "device" | "theme" | "text_size" | "spacing") {
  const latest = new Map<string, Read>();
  for (const r of rows) {
    const prev = latest.get(r.reader_id);
    if (!prev || r.last_seen > prev.last_seen) latest.set(r.reader_id, r);
  }
  const counts = new Map<string, number>();
  for (const r of latest.values()) {
    const v = r[key];
    if (v == null) continue;
    const label = key === "text_size" ? `${v}px` : String(v);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  if (!total) return "—";
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([label, n]) => `${label} ${pct(n, total)}`)
    .join(" · ");
}

export default async function ReadersPage() {
  const { db } = await requireAdmin();
  const [reads, worksRes, chaptersRes] = await Promise.all([
    allReads(db),
    db.from("works").select("id, title, title_gu").is("deleted_at", null).order("sort_order"),
    db.from("chapters").select("id, work_id, number, title").is("deleted_at", null).order("number"),
  ]);
  const works = (worksRes.data ?? []) as Work[];
  const chapters = (chaptersRes.data ?? []) as Chapter[];

  const now = Date.now();
  const readersSince = (days: number) =>
    new Set(reads.filter((r) => now - Date.parse(r.last_seen) < days * DAY).map((r) => r.reader_id)).size;
  const allReaders = new Set(reads.map((r) => r.reader_id)).size;
  const finishedCount = reads.filter((r) => r.finished_at).length;
  const hours = reads.reduce((s, r) => s + r.seconds, 0) / 3600;

  return (
    <>
      <h1 className={a.title}>Readers</h1>
      <p className={a.intro}>
        Anonymous reading of the moving library: each browser counts once per chapter. A chapter counts as finished
        when the reader reaches its end after reading for at least a third of its expected reading time. Your own
        reading while signed in is not counted.
      </p>

      <div className={a.tiles}>
        <div className={a.tile}>
          <span className={a.tileCount}>{readersSince(7)}</span>
          <span>Readers this week</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{readersSince(30)}</span>
          <span>Readers this month</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{allReaders}</span>
          <span>Readers so far</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{finishedCount}</span>
          <span>Chapters finished</span>
        </div>
        <div className={a.tile}>
          <span className={a.tileCount}>{hours < 1 ? Math.round(hours * 60) + " min" : hours.toFixed(1) + " h"}</span>
          <span>Total reading time</span>
        </div>
      </div>

      {reads.length === 0 && (
        <p className={a.notice}>
          No reading recorded yet. When visitors open a chapter, it appears here within a minute.
        </p>
      )}

      {works.map((work) => {
        const workChapters = chapters.filter((c) => c.work_id === work.id);
        const workReads = reads.filter((r) => r.work_id === work.id);
        if (workReads.length === 0) return null;
        const readersOf = (chapterId: string) => new Set(workReads.filter((r) => r.chapter_id === chapterId).map((r) => r.reader_id));
        const peak = Math.max(1, ...workChapters.map((c) => readersOf(c.id).size));
        const bookReaders = new Set(workReads.map((r) => r.reader_id)).size;
        const finishers = new Set(workReads.filter((r) => r.finished_at).map((r) => r.reader_id)).size;

        return (
          <section key={work.id} className={a.readersBook}>
            <h2 className={a.readersTitle}>
              <span className="gu">{work.title_gu ?? work.title}</span>
              <small>
                {bookReaders} {bookReaders === 1 ? "reader" : "readers"} · {finishers} finished at least one chapter
              </small>
            </h2>
            <div className={a.tableWrap}>
              <table className={a.table}>
                <thead>
                  <tr>
                    <th>Chapter</th>
                    <th>Readers</th>
                    <th>Finished</th>
                    <th>Typical time</th>
                    <th>Went on to next</th>
                    <th>Came back</th>
                  </tr>
                </thead>
                <tbody>
                  {workChapters.map((c, i) => {
                    const rows = workReads.filter((r) => r.chapter_id === c.id);
                    const readers = readersOf(c.id);
                    const finished = rows.filter((r) => r.finished_at).length;
                    const next = workChapters[i + 1];
                    const wentOn = next ? [...readersOf(next.id)].filter((id) => readers.has(id)).length : null;
                    const returning = rows.filter((r) => r.visits > 1).length;
                    return (
                      <tr key={c.id}>
                        <td>
                          {c.number}. <span className="gu">{c.title}</span>
                        </td>
                        <td>
                          <div className={a.barCell}>
                            <span className={a.barFill} style={{ width: `${(readers.size / peak) * 100}%` }} />
                            <span>{readers.size}</span>
                          </div>
                        </td>
                        <td>
                          {finished} <small className={a.mutedSmall}>{pct(finished, readers.size)}</small>
                        </td>
                        <td>{minutes(median(rows.filter((r) => r.seconds > 0).map((r) => r.seconds)))}</td>
                        <td>{wentOn == null ? "—" : <>{wentOn} <small className={a.mutedSmall}>{pct(wentOn, readers.size)}</small></>}</td>
                        <td>{returning}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {reads.length > 0 && (
        <section className={a.readersBook}>
          <h2 className={a.readersTitle}>How people read</h2>
          <dl className={a.readersHow}>
            <dt>Device</dt>
            <dd>{split(reads, "device")}</dd>
            <dt>Page colour</dt>
            <dd>{split(reads, "theme")}</dd>
            <dt>Text size</dt>
            <dd>{split(reads, "text_size")}</dd>
            <dt>Line spacing</dt>
            <dd>{split(reads, "spacing")}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
