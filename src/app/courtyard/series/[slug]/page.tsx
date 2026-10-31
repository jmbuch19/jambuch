import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kindLine } from "@/lib/courtyard";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../../library/header";
import PieceTurn, { PIECE_COLUMNS, type Piece } from "../../piece-turn";
import FollowForm from "./follow-form";
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
};

// A series is public once Jaydeep has approved its first part. Only these
// columns are read: never the contributor's email.
async function load(slug: string) {
  const db = adminClient();
  const { data: series } = await db
    .from("courtyard_series")
    .select("id, slug, title, description, name, city, form, themes, status")
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
    title: `${series.title} · a series by ${series.name} · The Courtyard`,
    description: series.description ?? `A series by ${series.name} in the Courtyard at jambuch.in.`,
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { series, parts } = found;
  const base = `/courtyard/series/${series.slug}`;

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard#contribute", label: "Contribute" }} current="courtyard" />
      <main>
        <section className={y.hero}>
          <p className={`gu ${y.kicker}`}>
            <a href="/courtyard">આંગણું · The Courtyard</a>
          </p>
          <p className={y.eyebrow}>A series · {kindLine(series.form, series.themes)}</p>
          <h1 className={y.h1}>{series.title}</h1>
          <p className={y.seriesBy}>
            by {series.name}
            {series.city ? `, ${series.city}` : ""} · {parts.length} {parts.length === 1 ? "part" : "parts"} so far
            {series.status === "ended" ? " · complete" : series.status === "paused" ? " · resting for now" : ""}
          </p>
          {series.description && <p className={y.lede}>{series.description}</p>}
        </section>

        <section className={`${y.band} ${y.bandAlt}`} aria-label="Parts">
          <div className={y.threadWrap}>
            {parts.length === 0 && <p className={y.empty}>The first part joins at the next gathering.</p>}
            <ol className={y.thread}>
              {parts.map((p) => (
                <PieceTurn key={p.id} p={p} open pickUpHref={`/courtyard#reply-${p.id}`} />
              ))}
            </ol>
            {series.status !== "ended" && (
              <div className={y.followBox}>
                <p className={y.followTitle}>Follow along</p>
                <p className={y.small}>
                  Get an email when a new part of “{series.title}” joins the Courtyard. Nothing else, and one tap to stop.
                </p>
                <FollowForm seriesId={series.id} />
              </div>
            )}
            <p className={y.small}>
              <a href={`${base}#`}>Link to this series</a> · <a href="/courtyard#thread">Back to the thread</a>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
