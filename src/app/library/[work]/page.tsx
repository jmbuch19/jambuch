import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { entryLabel, entryPath, sectionType } from "@/lib/book-sections";
import { inline } from "@/lib/inline";
import { guNumber, loadWork, type Chapter } from "@/lib/library";
import LibraryHeader from "../header";
import SavedPlace from "../saved-place";
import l from "../library.module.css";

export const revalidate = 60;

const MAX_SEGMENTS = 40; // above this the progress bar is one continuous strip

type Props = { params: Promise<{ work: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadWork((await params).work);
  if (!found) return {};
  const { work } = found;
  return { title: `${work.title_gu ?? work.title} · jambuch.in`, description: work.description?.replace(/\*/g, "") };
}

export default async function WorkPage({ params }: Props) {
  const slug = (await params).work;
  const found = await loadWork(slug);
  if (!found) notFound();
  const { work, chapters: entries } = found;
  // Progress counts numbered chapters only; sections (preface, glossary...) are listed apart.
  const chapters = entries.filter((c) => !c.section);
  const before = entries.filter((c) => c.section && sectionType(c.section)?.part === "before");
  const after = entries.filter((c) => c.section && sectionType(c.section)?.part === "after");
  const ready = chapters.filter((c) => c.status === "ready");
  // "Start reading" opens the first readable part of the book, preface included.
  const first = entries.find((c) => c.status === "ready");
  // Every planned chapter, in order; ones not added yet count as still ahead.
  const total = Math.max(work.total_chapters ?? 0, chapters.length, ...chapters.map((c) => c.number ?? 0));
  const byNumber = new Map(chapters.map((c) => [c.number, c.status]));
  const plan = Array.from({ length: total }, (_, i) => byNumber.get(i + 1) ?? "later");

  const row = (c: Chapter) => (
    <li key={c.id}>
      <span className={`gu ${l.chNum}`}>{c.section ? "" : guNumber(c.number ?? 0)}</span>
      <div className={l.chText}>
        <div className="gu">{c.title}</div>
        {c.section ? (
          <div className={l.chNote}>{entryLabel(c)}</div>
        ) : (
          c.title_original && <div className={l.chNote}>{c.title_original}</div>
        )}
      </div>
      {c.status === "ready" ? (
        <Link href={entryPath(slug, c)} className={l.readBtn}>
          Read
        </Link>
      ) : c.status === "drafting" ? (
        <span className={l.draftTag}>Being translated{c.expected ? ` · ${c.expected}` : ""}</span>
      ) : (
        <span className={l.laterTag}>Still ahead</span>
      )}
    </li>
  );

  return (
    <>
      <LibraryHeader />
      <main>
        <section className={l.hero}>
          {work.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={work.cover_url} alt="" className={l.coverImage} />
          ) : (
            <div className={l.cover} aria-hidden="true">
              <p className="gu">{work.title_gu ?? work.title}</p>
              <p className={l.coverBy}>
                {work.author}
                {work.author && work.translator_credit && <br />}
                {work.translator_credit && <span className="gu">{work.translator_credit}</span>}
              </p>
            </div>
          )}
          <div className={l.heroText}>
            <p className={l.eyebrow}>
              Moving library · <span className="gu">ચાલતું પુસ્તકાલય</span>
            </p>
            {work.title_gu ? (
              <h1 className={`gu ${l.titleGu}`} lang="gu">
                {work.title_gu}
              </h1>
            ) : (
              <h1 className={l.title}>{work.title}</h1>
            )}
            {work.description && <p className={l.lede}>{inline(work.description)}</p>}

            {!work.readable ? (
              <p className={l.pending}>
                {work.status_label ? `${work.status_label}. ` : ""}Chapters will open here to read once publication
                rights are confirmed.
              </p>
            ) : entries.length === 0 ? (
              <p className={l.pending}>The first chapter is on my desk. It will appear here soon.</p>
            ) : (
              <>
                <div className={l.progress}>
                  <div className={l.progressHead}>
                    <strong>
                      {ready.length} {ready.length === 1 ? "chapter" : "chapters"} ready
                    </strong>
                    <span>of {total}</span>
                  </div>
                  {total <= MAX_SEGMENTS ? (
                    <div className={l.bar}>
                      {plan.map((status, i) => (
                        <span key={i} className={l[status]} />
                      ))}
                    </div>
                  ) : (
                    // Too many chapters for one block each: a single bar in proportion.
                    <div className={`${l.bar} ${l.barSolid}`}>
                      {(["ready", "drafting", "later"] as const).map((s) => {
                        const n = plan.filter((x) => x === s).length;
                        return n ? <span key={s} className={l[s]} style={{ flexGrow: n }} /> : null;
                      })}
                    </div>
                  )}
                  <div className={l.legend}>
                    <span>
                      <i className={l.ready} />
                      Ready to read
                    </span>
                    <span>
                      <i className={l.drafting} />
                      On the translator’s desk
                    </span>
                    <span>
                      <i className={l.later} />
                      Still ahead
                    </span>
                  </div>
                </div>
                <SavedPlace work={slug} />
                {first && (
                  <div className={l.buttons}>
                    <Link href={entryPath(slug, first)} className={l.btnAccent}>
                      Start reading — {entryLabel(first)}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {before.length > 0 && (
          <section className={l.chapters}>
            <h2>Before the chapters</h2>
            <ul className={l.chapterList}>{before.map(row)}</ul>
          </section>
        )}
        {chapters.length > 0 && (
          <section className={l.chapters}>
            <h2>Chapters</h2>
            <ol className={l.chapterList}>{chapters.map(row)}</ol>
          </section>
        )}
        {after.length > 0 && (
          <section className={l.chapters}>
            <h2>After the chapters</h2>
            <ul className={l.chapterList}>{after.map(row)}</ul>
          </section>
        )}
      </main>
    </>
  );
}
