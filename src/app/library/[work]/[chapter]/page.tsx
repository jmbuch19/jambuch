import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { entryLabel, entryPath, sectionType } from "@/lib/book-sections";
import { inline } from "@/lib/inline";
import { guNumber, lookupEntry, paragraphs, readingSeconds, type Chapter } from "@/lib/library";
import LibraryHeader from "../../header";
import ReadTracker from "../../read-tracker";
import ReadingGuard from "../../reading-guard";
import { READER_BOOT_SCRIPT } from "../../reader-settings";
import ReaderBar from "../../reader-bar";
import ShareButton from "../../share-button";
import InstallCard from "../../../install/install-card";
import LetterInvite from "../../../letter-invite";
import l from "../../library.module.css";

export const revalidate = 60;

type Props = { params: Promise<{ work: string; chapter: string }> };

// The address part is "chapter-3", "preface", "glossary"... Old number-only
// addresses ("/ramayana/2") forward to the entry that had that number.
async function load(params: Props["params"]) {
  const { work, chapter } = await params;
  const result = await lookupEntry(work, decodeURIComponent(chapter));
  if (!result) return null;
  if ("redirectTo" in result) permanentRedirect(result.redirectTo);
  return result.found;
}

// Pager and list title: "૩. વિશ્વામિત્ર ઋષિ" for a chapter, just the title for a section.
function entryTitle(e: Chapter) {
  return e.number != null && !e.section ? `${guNumber(e.number)}. ${e.title}` : e.title;
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
  const section = sectionType(chapter.section);

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

      <main id="reader" className={`${l.reader} ${l.guarded}`}>
        <ReaderBar
          textId="chapter-text"
          work={work.slug}
          book={work.title_gu ?? work.title}
          path={entryPath(work.slug, chapter)}
          title={entryTitle(chapter)}
        />
        <ReadingGuard targetId="reader" chapterId={chapter.id} />
        <p className={l.printNote}>This chapter can be read online at jambuch.in{entryPath(work.slug, chapter)}</p>
        <p className={l.eyebrow}>
          {chapter.section ? (
            <>
              {entryLabel(chapter)}
              {section?.gu && (
                <>
                  {" "}
                  · <span className="gu">{section.gu}</span>
                </>
              )}
            </>
          ) : (
            <>
              Chapter {chapter.number} · <span className="gu">પ્રકરણ {guNumber(chapter.number ?? 0)}</span>
            </>
          )}
        </p>
        <h1 className={`gu ${l.chapterTitle}`} lang="gu">
          {chapter.title}
        </h1>
        {chapter.title_original && <p className={l.original}>{chapter.title_original}</p>}

        {chapter.opening_image_url && (
          // The chapter picture always opens the chapter, right under its title.
          <figure className={`${l.figure} ${l.opening}`}>
            {/* Not a link to the file, so the picture isn't one tap from being saved. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chapter.opening_image_url}
              alt={chapter.opening_caption ?? ""}
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
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

        <article id="chapter-text" className={`gu ${l.text}`} lang="gu">
          {paragraphs(chapter.body).map((b, i) =>
            b.kind === "quote" ? (
              <blockquote key={i} id={`p-${i + 1}`}>
                {inline(b.text)}
              </blockquote>
            ) : (
              <p key={i} id={`p-${i + 1}`}>
                {inline(b.text)}
              </p>
            ),
          )}
        </article>
        {/* Sits at the end of the text: reaching it after real reading counts as finished. */}
        <ReadTracker chapterId={chapter.id} minSeconds={Math.max(20, Math.round(readingSeconds(chapter.body) / 3))} />

        {chapter.translator_note && (
          <aside className={l.note}>
            <p className={l.eyebrowPlain}>Translator’s note</p>
            <p>{inline(chapter.translator_note)}</p>
          </aside>
        )}

        {/* No dead end: one big step to the next chapter, or a way to hear when it's ready. */}
        {next ? (
          <Link href={entryPath(work.slug, next)} className={l.nextBig} rel="next">
            <span className={l.nextLabel}>
              <span className="gu">{next.section ? "આગળ વાંચો" : "આગળનું પ્રકરણ"}</span> ·{" "}
              {next.section ? "Read on" : "Next chapter"} →
            </span>
            <strong className="gu">{entryTitle(next)}</strong>
          </Link>
        ) : (
          <section className={l.waiting}>
            <p className={l.waitingHead}>
              {upcoming ? `${entryLabel(upcoming)} is on my desk` : "You’ve reached the latest chapter"}
              {upcoming?.expected ? ` · ${upcoming.expected}` : ""}
            </p>
            <LetterInvite
              variant="inline"
              source="chapter waiting"
              title="Tell me when it’s ready"
              lede="New chapters come in the weekly letter: one email after each Sunday gathering, with what’s new in the library and the Courtyard. No account, and one tap to stop."
              joinedNote="You get the weekly letter, so the next chapter will be in it as soon as it’s ready."
            />
          </section>
        )}
        <nav className={l.pager} aria-label="Chapters">
          {prev && (
            <Link href={entryPath(work.slug, prev)} className={l.pageCard} rel="prev">
              <span>← Previous</span>
              <strong className="gu">{entryTitle(prev)}</strong>
            </Link>
          )}
          <Link href={base} className={l.pageCard}>
            <span>{prev ? "Or see" : "← Back to"}</span>
            <strong>All chapters</strong>
          </Link>
        </nav>
        <div className={l.endShare}>
          <ShareButton />
        </div>
        <InstallCard />
        {/* The weekly letter, offered only once the chapter is finished. */}
        {next && <LetterInvite variant="inline" source="book chapter" />}
        <p className={l.privacy}>
          This library counts reading anonymously (chapters opened and finished) to learn what readers enjoy. No names,
          emails or locations are collected.
        </p>
        <LetterInvite variant="bar" source="book chapter" />
      </main>
    </>
  );
}
