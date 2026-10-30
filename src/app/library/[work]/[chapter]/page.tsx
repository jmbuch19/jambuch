import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inline } from "@/lib/inline";
import { guNumber, loadChapter, paragraphs, readingSeconds } from "@/lib/library";
import LibraryHeader from "../../header";
import ReadTracker from "../../read-tracker";
import { READER_BOOT_SCRIPT } from "../../reader-settings";
import ReaderText from "../../reader-text";
import l from "../../library.module.css";

export const revalidate = 60;

type Props = { params: Promise<{ work: string; chapter: string }> };

async function load(params: Props["params"]) {
  const { work, chapter } = await params;
  const n = Number(chapter);
  if (!Number.isInteger(n) || n < 1) return null;
  return loadChapter(work, n);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  return { title: `${found.chapter.title} · ${found.work.title_gu ?? found.work.title} · jambuch.in` };
}

export default async function ChapterPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { work, chapter, prev, next, upcoming } = found;
  const base = `/library/${work.slug}`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: READER_BOOT_SCRIPT }} />
      <LibraryHeader />
      <div className={l.readerBar}>
        <Link href={base} className={l.backLink}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="gu">{work.title_gu ?? work.title}</span>
          <span className={l.muted}>· All chapters</span>
        </Link>
      </div>

      <main className={l.reader}>
        <p className={l.eyebrow}>
          Chapter {chapter.number} · <span className="gu">પ્રકરણ {guNumber(chapter.number)}</span>
        </p>
        <h1 className={`gu ${l.chapterTitle}`} lang="gu">
          {chapter.title}
        </h1>
        {chapter.title_original && <p className={l.original}>{chapter.title_original}</p>}

        {chapter.opening_image_url && (
          // The chapter picture always opens the chapter, right under its title.
          <figure className={`${l.figure} ${l.opening}`}>
            {/* Tapping opens the full picture, where phones can zoom. */}
            <a href={chapter.opening_image_url} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chapter.opening_image_url} alt={chapter.opening_caption ?? ""} fetchPriority="high" decoding="async" />
            </a>
            {chapter.opening_caption && <figcaption className="gu">{inline(chapter.opening_caption)}</figcaption>}
          </figure>
        )}

        {chapter.audio_url && (
          <div className={l.audio}>
            <p>Read aloud by Jaydeep</p>
            <audio controls preload="none" src={chapter.audio_url}>
              <a href={chapter.audio_url}>Listen</a>
            </audio>
          </div>
        )}

        <ReaderText>
          {paragraphs(chapter.body).map((b, i) =>
            b.kind === "quote" ? <blockquote key={i}>{inline(b.text)}</blockquote> : <p key={i}>{inline(b.text)}</p>,
          )}
        </ReaderText>
        {/* Sits at the end of the text: reaching it after real reading counts as finished. */}
        <ReadTracker chapterId={chapter.id} minSeconds={Math.max(20, Math.round(readingSeconds(chapter.body) / 3))} />

        {chapter.translator_note && (
          <aside className={l.note}>
            <p className={l.eyebrowPlain}>Translator’s note</p>
            <p>{inline(chapter.translator_note)}</p>
          </aside>
        )}

        <nav className={l.pager} aria-label="Chapters">
          {prev ? (
            <Link href={`${base}/${prev.number}`} className={l.pageCard} rel="prev">
              <span>← Previous</span>
              <strong className="gu">
                {guNumber(prev.number)}. {prev.title}
              </strong>
            </Link>
          ) : (
            <Link href={base} className={l.pageCard}>
              <span>← Back to</span>
              <strong>All chapters</strong>
            </Link>
          )}
          {next ? (
            <Link href={`${base}/${next.number}`} className={`${l.pageCard} ${l.pageNext}`} rel="next">
              <span>Next →</span>
              <strong className="gu">
                {guNumber(next.number)}. {next.title}
              </strong>
            </Link>
          ) : (
            <div className={`${l.pageCard} ${l.pageWaiting}`}>
              <span>{upcoming ? `Chapter ${upcoming.number} is on my desk` : "You’ve reached the latest chapter"}</span>
              <strong>{upcoming?.expected ?? "More soon"}</strong>
            </div>
          )}
        </nav>
        <p className={l.privacy}>
          This library counts reading anonymously (chapters opened and finished) to learn what readers enjoy. No names,
          emails or locations are collected.
        </p>
      </main>
    </>
  );
}
