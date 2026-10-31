import type { Metadata } from "next";
import { Fragment } from "react";
import { gatheringDay } from "@/lib/gathering";
import { DOOR_HASH, FORMS, REPLY_HASH, THEMES, kindLine } from "@/lib/courtyard";
import { publicClient } from "@/lib/supabase";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../library/header";
import ContributeForm from "./contribute-form";
import PieceTurn, { PIECE_COLUMNS, type Piece } from "./piece-turn";
import y from "./courtyard.module.css";

// Following design/Courtyard.dc.html. (Reads ?theme=, so it renders per request.)

export const metadata: Metadata = {
  title: "The Courtyard · jambuch.in",
  description:
    "Friends, family, colleagues and visitors share poems, photographs, lessons, tools and family heirlooms, with credit always theirs.",
};

// The public thread: approved single pieces whose weekly gathering has come,
// gathering by gathering, oldest first (and in order of approval within each).
// Read on the server with only the columns that may be shown (never email),
// and never pieces kept for a family circle. If it can't be read, the page
// still shows, with an empty thread. (The page refreshes every minute, so a
// gathering's pieces appear within a minute of its time.)
async function thread(): Promise<Piece[]> {
  try {
    const { data, error } = await adminClient()
      .from("courtyard_submissions")
      .select(PIECE_COLUMNS)
      .eq("kind", "single_piece")
      .eq("status", "published")
      .eq("family_only", false)
      .lte("gathering_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("gathering_at", { ascending: true })
      .order("published_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Piece[];
  } catch (err) {
    console.error("courtyard thread:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Series names and addresses for the pieces that belong to one.
async function seriesOf(pieces: Piece[]) {
  const ids = [...new Set(pieces.map((p) => p.series_id).filter((x): x is string => !!x))];
  const map = new Map<string, { href: string; title: string }>();
  if (ids.length === 0) return map;
  const { data } = await adminClient()
    .from("courtyard_series")
    .select("id, slug, title")
    .in("id", ids)
    .neq("status", "pending")
    .is("deleted_at", null);
  for (const s of data ?? []) map.set(s.id, { href: `/courtyard/series/${s.slug}`, title: s.title });
  return map;
}

// Every series with at least one part on the thread, latest activity first.
async function seriesList(pieces: Piece[]) {
  const parts = new Map<string, Piece[]>();
  for (const p of pieces) if (p.series_id) parts.set(p.series_id, [...(parts.get(p.series_id) ?? []), p]);
  if (parts.size === 0) return [];
  const { data } = await adminClient()
    .from("courtyard_series")
    .select("id, slug, title, name, form, themes, status")
    .in("id", [...parts.keys()])
    .in("status", ["active", "paused", "ended"])
    .is("deleted_at", null);
  return (data ?? [])
    .map((s) => {
      const own = parts.get(s.id) ?? [];
      const last = own.reduce((a, b) => (a.gathering_at > b.gathering_at ? a : b));
      return { ...s, parts: own.length, latest: last.title, latestAt: last.gathering_at };
    })
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
}

// The number for "Just send it on WhatsApp", set in Admin → Site text.
async function whatsappNumber() {
  try {
    const { data } = await publicClient().from("site_text").select("en").eq("key", "courtyard.whatsapp").maybeSingle();
    const digits = (data?.en ?? "").replace(/\D/g, "");
    return digits.length >= 8 ? { digits, shown: data!.en.trim() } : null;
  } catch {
    return null;
  }
}

const DOOR_CARDS = [
  {
    hash: DOOR_HASH.single_piece,
    eyebrow: "For anyone",
    title: "Share one piece",
    text: "A single poem, photo, recording, lesson, guide or tool. No commitment, no account needed to start.",
    go: "Share something →",
  },
  {
    hash: DOOR_HASH.room_request,
    eyebrow: "For regular makers",
    title: "Ask for your own room",
    text: "A page of your own at jambuch.in/courtyard/your-name, for a growing body of work.",
    go: "Ask for a room →",
  },
  {
    hash: DOOR_HASH.suggestion,
    eyebrow: "Know someone?",
    title: "Suggest a creator",
    text: "A grandmother’s recipes, a colleague’s photographs, a teacher’s notes that deserve readers.",
    go: "Suggest someone →",
  },
];

const WHY = [
  {
    title: "A home, not a feed",
    text: "A post disappears in two days. Here your piece gets its own page with your name on it, still there years from now.",
  },
  {
    title: "A real reader",
    text: "I read every word you send and write back myself, whether or not it goes up.",
  },
  {
    title: "Something to point to",
    text: "For students and teachers: a published, credited link for your CV, portfolio or application.",
  },
  {
    title: "Kept for the next generation",
    text: "Letters, recipes, songs an elder sang: safe from a broken phone, credited to the person who made them.",
  },
];

type Filters = { theme: string | null; form: string | null; q: string };

// A thread address with these filters (any left out are cleared).
function filterHref(f: Filters) {
  const params = new URLSearchParams();
  if (f.form) params.set("form", f.form);
  if (f.theme) params.set("theme", f.theme);
  if (f.q) params.set("q", f.q);
  const qs = params.toString();
  return `/courtyard${qs ? `?${qs}` : ""}#thread`;
}

// Case- and accent-insensitive words, so "nostalgia" finds "Nostalgia" and
// Gujarati text is matched as typed.
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function CourtyardPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; form?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const filters: Filters = {
    theme: THEMES.find((t) => t.value === sp.theme)?.value ?? null,
    form: FORMS.find((f) => f.value === sp.form)?.value ?? null,
    q: (sp.q ?? "").trim().slice(0, 80),
  };
  const [allPieces, whatsapp] = await Promise.all([thread(), whatsappNumber()]);
  const [series, seriesShelf] = await Promise.all([seriesOf(allPieces), seriesList(allPieces)]);

  // Filters narrow the thread but keep its order: no rankings.
  const words = fold(filters.q).split(/\s+/).filter(Boolean);
  const pieces = allPieces.filter((p) => {
    if (filters.theme && !p.themes.includes(filters.theme)) return false;
    if (filters.form && p.form !== filters.form) return false;
    if (words.length) {
      const hay = fold([p.title, p.name, p.city, p.body, p.series_id ? series.get(p.series_id)?.title : ""].join(" "));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const filtering = !!(filters.theme || filters.form || filters.q);
  const usedThemes = THEMES.filter((t) => allPieces.some((p) => p.themes.includes(t.value)));
  const usedForms = FORMS.filter((f) => allPieces.some((p) => p.form === f.value));
  const byId = new Map(allPieces.map((p) => [p.id, p]));
  const threadLabel = (p: Piece) => `${p.name}’s “${p.title}”`;

  return (
    <>
      <LibraryHeader cta={{ href: "#contribute", label: "Contribute" }} current="courtyard" />
      <main>
        <section className={y.hero}>
          <p className={`gu ${y.kicker}`}>આંગણું</p>
          <h1 className={y.h1}>The Courtyard</h1>
          <p className={y.lede}>
            Friends, family, colleagues — and you. A poem, a photograph, a lesson that helped a student, a small tool
            that saved someone an hour, a song an elder sang: if you made it, or are keeping it for your family, there’s
            a place for it here. Credit always goes to the person who made it.
          </p>
          <p className={y.quote}>
            In the old courtyard, nobody competes. Someone begins a story and the others listen. When it ends, someone
            else picks up the thread. Just closeness, laughter and sharing.
          </p>
        </section>

        <section className={y.doorsWrap} aria-label="Ways to contribute">
          <div className={y.doorCards}>
            {DOOR_CARDS.map((d) => (
              <a key={d.hash} href={`#${d.hash}`} className={y.doorCard}>
                <span className={y.eyebrow}>{d.eyebrow}</span>
                <span className={y.doorTitle}>{d.title}</span>
                <span className={y.doorText}>{d.text}</span>
                <span className={y.doorGo}>{d.go}</span>
              </a>
            ))}
          </div>
        </section>

        <section className={`${y.band} ${y.bandWarm}`}>
          <div className={y.bandInner}>
            <h2 className={y.whyTitle}>Your work deserves a better home than a WhatsApp forward.</h2>
            <p className={y.whyLede}>Why share it here rather than anywhere else?</p>
            <div className={y.whyGrid}>
              {WHY.map((w) => (
                <div key={w.title} className={y.whyCard}>
                  <p className={y.whyCardTitle}>{w.title}</p>
                  <p>{w.text}</p>
                </div>
              ))}
            </div>
            <p className={y.whyFoot}>
              <strong>What I won’t promise:</strong> big numbers. <strong>What I will:</strong> care, credit, and
              permanence.
            </p>
          </div>
        </section>

        <section className={y.band}>
          <div className={y.bandInner}>
            <h2 className={y.h2}>Rooms</h2>
            <p className={y.sectionIntro}>Creators with a page of their own.</p>
            <p className={y.empty}>No rooms yet. Yours could be the first.</p>
          </div>
        </section>

        {seriesShelf.length > 0 && (
          <section className={y.band} aria-labelledby="series">
            <div className={y.bandInner}>
              <h2 id="series" className={y.h2}>
                Series
              </h2>
              <p className={y.sectionIntro}>One subject, part by part, from contributors who keep coming back.</p>
              <div className={y.seriesShelf}>
                {seriesShelf.map((s) => (
                  <a key={s.slug} href={`/courtyard/series/${s.slug}`} className={y.seriesCard}>
                    <span className={y.eyebrow}>{kindLine(s.form, s.themes)}</span>
                    <span className={y.seriesCardTitle}>{s.title}</span>
                    <span className={y.seriesCardBy}>
                      by {s.name} · {s.parts} {s.parts === 1 ? "part" : "parts"}
                      {s.status === "ended" ? " · complete" : ""}
                    </span>
                    {s.latest && <span className={y.seriesCardLatest}>Latest: {s.latest}</span>}
                    <span className={y.doorGo}>Read the series →</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={`${y.band} ${y.bandAlt}`} aria-labelledby="thread">
          <div className={y.threadWrap}>
            <p className={`gu ${y.threadKicker}`}>વાતનો દોર</p>
            <h2 id="thread" className={y.h2}>
              The thread
            </h2>
            <p className={y.sectionIntro}>
              Pieces in the order they were shared, like turns around the courtyard. Each one can answer the one before.
              No likes, no counts, no rankings.
            </p>
            {allPieces.length > 0 && (
              <div className={y.finder}>
                {/* A plain GET form: the search works without scripts and can be shared. */}
                <form action="/courtyard" method="get" className={y.search} role="search">
                  {filters.form && <input type="hidden" name="form" value={filters.form} />}
                  {filters.theme && <input type="hidden" name="theme" value={filters.theme} />}
                  <input
                    type="search"
                    name="q"
                    defaultValue={filters.q}
                    placeholder="Search titles, names, words…"
                    aria-label="Search the thread"
                    maxLength={80}
                  />
                  <button type="submit">Search</button>
                </form>
                {usedForms.length > 1 && (
                  <nav className={y.themeFilter} aria-label="Show pieces of form">
                    <span className={y.filterLabel}>Form</span>
                    <a href={filterHref({ ...filters, form: null })} aria-current={filters.form ? undefined : "true"}>
                      All
                    </a>
                    {usedForms.map((f) => (
                      <a
                        key={f.value}
                        href={filterHref({ ...filters, form: f.value })}
                        aria-current={filters.form === f.value ? "true" : undefined}
                      >
                        {f.label}
                      </a>
                    ))}
                  </nav>
                )}
                {usedThemes.length > 0 && (
                  <nav className={y.themeFilter} aria-label="Show pieces about">
                    <span className={y.filterLabel}>About</span>
                    <a href={filterHref({ ...filters, theme: null })} aria-current={filters.theme ? undefined : "true"}>
                      All
                    </a>
                    {usedThemes.map((t) => (
                      <a
                        key={t.value}
                        href={filterHref({ ...filters, theme: t.value })}
                        aria-current={filters.theme === t.value ? "true" : undefined}
                      >
                        {t.label}
                      </a>
                    ))}
                  </nav>
                )}
                {filtering && (
                  <p className={y.filterSummary}>
                    {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
                    {filters.q && <> matching “{filters.q}”</>} ·{" "}
                    <a href="/courtyard#thread">Show the whole thread</a>
                  </p>
                )}
              </div>
            )}
            {pieces.length === 0 && (
              <p className={y.empty}>
                {filtering ? "Nothing matches that yet. Try another word, or show the whole thread." : "Nobody has begun the story yet."}
              </p>
            )}
            <ol className={y.thread}>
              {pieces.map((p, i) => {
                // A heading where each weekly gathering begins.
                const gatheringLabel = gatheringDay(p.gathering_at);
                const startsGathering = i === 0 || gatheringDay(pieces[i - 1].gathering_at) !== gatheringLabel;
                const parent = p.thread_from ? byId.get(p.thread_from) : undefined;
                return (
                  <Fragment key={p.id}>
                    {startsGathering && (
                      <li className={y.gatheringHead}>
                        <span>The gathering of {gatheringLabel}</span>
                      </li>
                    )}
                    <PieceTurn
                      p={p}
                      from={parent ? { href: `/courtyard#piece-${parent.id}`, label: threadLabel(parent) } : undefined}
                      series={p.series_id ? series.get(p.series_id) : null}
                      pickUpHref={`#${REPLY_HASH}${p.id}`}
                    />
                  </Fragment>
                );
              })}
            </ol>
            <a href={`#${DOOR_HASH.single_piece}`} className={y.yourTurn}>
              Your turn — add to the thread →
            </a>
          </div>
        </section>

        <section className={y.band}>
          <div className={`${y.bandInner} ${y.howInner}`}>
            <div className={y.steps}>
              <h2 className={y.h2}>How it works</h2>
              <ol>
                <li>
                  <strong>Send it, or get invited</strong>
                  <span>Share a piece or ask for a room below — or I may write to you first. Either way works.</span>
                </li>
                <li>
                  <strong>I read every word</strong>
                  <span>Nothing appears without my review. If it’s not a fit, I’ll tell you kindly and why.</span>
                </li>
                <li>
                  <strong>It goes up under your name</strong>
                  <span>Regular contributors can grow a single piece into a room of their own.</span>
                </li>
              </ol>
            </div>
            <div className={y.promise}>
              <p className={y.eyebrow}>My promise to every contributor</p>
              <p>Your name is on every piece. Credit always goes to you.</p>
              <p>Your work stays yours. You choose how others may use it.</p>
              <p>No ads, and no money is made from your work here.</p>
              <p>No likes, no rankings, no competition. Every turn is welcome.</p>
              <p>Ask, and it comes down — with every file returned.</p>
            </div>
          </div>
        </section>

        <section id="contribute" className={y.contribute}>
          <div className={y.contributeWrap}>
            <h2 className={y.contributeTitle}>Contribute</h2>
            <p className={y.contributeLede}>
              Pick a door. Every submission is read by Jaydeep before anything appears.
            </p>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.digits}?text=${encodeURIComponent("Hello Jaydeep, I’d like to share something for the Courtyard. My name is ")}`}
                target="_blank"
                rel="noopener noreferrer"
                className={y.whatsapp}
              >
                <span>
                  <strong>Forms not your thing? Just send it on WhatsApp.</strong>
                  <span>A voice note, a photo of a notebook page, a file. Tell me your name and I’ll do the rest.</span>
                </span>
                <span className={y.whatsappGo}>WhatsApp {whatsapp.shown} →</span>
              </a>
            )}
            <ContributeForm threads={pieces.map((p) => ({ id: p.id, label: threadLabel(p) }))} />
          </div>
        </section>
      </main>
    </>
  );
}
