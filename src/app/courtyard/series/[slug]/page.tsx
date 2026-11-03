import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kindLine, unit } from "@/lib/courtyard";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../../library/header";
import PieceTurn, { PIECE_COLUMNS, type Piece } from "../../piece-turn";
import LetterInvite from "../../../letter-invite";
import ReadingGuard from "../../../library/reading-guard";
import FollowForm from "./follow-form";
import l from "../../../library/library.module.css";
import y from "../../courtyard.module.css";

export const revalidate = 60;

type Series = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  name: string;
  city: string | null;
  form: string | null;
  themes: string[];
  status: "active" | "paused" | "ended";
  shape: "series" | "book"; // chosen by the contributor; a book's chapters are copy-protected
  // Set by Jaydeep in admin when the series serialises a printed book.
  book_title: string | null;
  book_credit: string | null;
  book_url: string | null;
};

// A series is public once Jaydeep has approved its first part. Only these
// columns are read: never the contributor's email.
async function load(slug: string) {
  const db = adminClient();
  const { data: series } = await db
    .from("courtyard_series")
    .select("id, slug, title, shape, description, name, city, form, themes, status, book_title, book_credit, book_url")
    .eq("slug", slug)
    .in("status", ["active", "paused", "ended"])
    .is("deleted_at", null)
    .maybeSingle();
  if (!series) return null;
  const { data: parts } = await db
    .from("courtyard_submissions")
    .select(PIECE_COLUMNS)
    .eq("series_id", series.id)
    .eq("status", "published")
    .eq("family_only", false)
    .lte("gathering_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("series_part", { ascending: true });
  return { series: series as Series, parts: (parts ?? []) as unknown as Piece[] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return {};
  const { series } = found;
  return {
    title: `${series.title} · a ${unit(series.shape).whole} by ${series.name} · The Courtyard`,
    description: series.description ?? `A ${unit(series.shape).whole} by ${series.name} in the Courtyard at jambuch.in.`,
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { series, parts } = found;
  const base = `/courtyard/series/${series.slug}`;
  const book = series.shape === "book" || !!series.book_title;
  const u = unit(book ? "book" : "series");
  const buy = series.book_url && (
    <a href={series.book_url} target="_blank" rel="noopener noreferrer" className={y.bookBuy}>
      Buy the printed book →
    </a>
  );

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard#contribute", label: "Contribute" }} current="courtyard" />
      {/* A book's chapters get the same copy protection as the translations. */}
      <main id="series" className={book ? l.guarded : undefined}>
        {book && (
          <>
            <ReadingGuard targetId="series" work="book" />
            <p className={l.printNote}>This book can be read online at jambuch.in{base}</p>
          </>
        )}
        <section className={y.hero}>
          <p className={`gu ${y.kicker}`}>
            <a href="/courtyard">આંગણું · The Courtyard</a>
          </p>
          <p className={y.eyebrow}>
            {book ? "A book" : "A series"} · {kindLine(series.form, series.themes)}
          </p>
          <h1 className={y.h1}>{series.title}</h1>
          <p className={y.seriesBy}>
            by {series.name}
            {series.city ? `, ${series.city}` : ""} · {parts.length} {parts.length === 1 ? u.one : u.many} so far
            {series.status === "ended" ? " · complete" : series.status === "paused" ? " · resting for now" : ""}
          </p>
          {series.description && <p className={y.lede}>{series.description}</p>}
          {series.book_title && (
            <div className={y.bookBox}>
              <p className={y.eyebrow}>From the printed book</p>
              <p className={y.bookTitle}>{series.book_title}</p>
              <p className={y.small}>
                by {series.name}
                {series.book_credit ? ` · ${series.book_credit}` : ""}
              </p>
              {buy}
            </div>
          )}
        </section>

        <section className={`${y.band} ${y.bandAlt}`} aria-label={u.One + "s"}>
          <div className={y.threadWrap}>
            {parts.length === 0 && <p className={y.empty}>The first {u.one} joins at the next gathering.</p>}
            <ol className={y.thread}>
              {parts.map((p) => (
                <PieceTurn key={p.id} p={p} open={!book} book={book} pickUpHref={`/courtyard#reply-${p.id}`} />
              ))}
            </ol>
            {series.book_title && parts.length > 0 && (
              <div className={y.bookBox}>
                <p className={y.bookTitle}>Enjoying it?</p>
                <p className={y.small}>“{series.book_title}” is also a printed book, to keep and to give.</p>
                {buy}
              </div>
            )}
            {series.status !== "ended" && (
              <div className={y.followBox}>
                <p className={y.followTitle}>Follow along</p>
                <p className={y.small}>
                  Get an email when a new {u.one} of “{series.title}” joins the Courtyard. Nothing else, and one tap to stop.
                </p>
                <FollowForm seriesId={series.id} />
              </div>
            )}
            <p className={y.small}>
              <a href={`${base}#`}>Link to this {u.whole}</a> · <a href="/courtyard#thread">Back to the thread</a>
            </p>
          </div>
        </section>
        <LetterInvite variant="bar" source="series page" />
      </main>
    </>
  );
}
