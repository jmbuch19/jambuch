import type { Metadata } from "next";
import { Fragment } from "react";
import { gatheringDay } from "@/lib/gathering";
import { CATEGORY_TINT, DOOR_HASH, EDUCATION_NOTE, REPLY_HASH, categoryLabel, initials } from "@/lib/courtyard";
import { inline } from "@/lib/inline";
import { publicClient } from "@/lib/supabase";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../library/header";
import ContributeForm from "./contribute-form";
import y from "./courtyard.module.css";

// Following design/Courtyard.dc.html.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "The Courtyard · jambuch.in",
  description:
    "Friends, family, colleagues and visitors share poems, photographs, lessons, tools and family heirlooms, with credit always theirs.",
};

type Piece = {
  id: string;
  name: string;
  city: string | null;
  category: string;
  title: string;
  body: string | null;
  file_url: string | null;
  file_type: string | null;
  links: string[];
  thread_from: string | null;
  published_at: string;
  gathering_at: string;
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
      .select(
        "id, name, city, category, title, body, file_url, file_type, links, thread_from, published_at, gathering_at",
      )
      .eq("kind", "single_piece")
      .eq("status", "published")
      .eq("family_only", false)
      .lte("gathering_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("gathering_at", { ascending: true })
      .order("published_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as Piece[];
  } catch (err) {
    console.error("courtyard thread:", err instanceof Error ? err.message : err);
    return [];
  }
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

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

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

export default async function CourtyardPage() {
  const [pieces, whatsapp] = await Promise.all([thread(), whatsappNumber()]);
  const byId = new Map(pieces.map((p) => [p.id, p]));
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
            {pieces.length === 0 && <p className={y.empty}>Nobody has begun the story yet.</p>}
            <ol className={y.thread}>
              {pieces.map((p, i) => {
                // A heading where each weekly gathering begins.
                const gatheringLabel = gatheringDay(p.gathering_at);
                const startsGathering = i === 0 || gatheringDay(pieces[i - 1].gathering_at) !== gatheringLabel;
                const parent = p.thread_from ? byId.get(p.thread_from) : undefined;
                const image = p.file_url && p.file_type?.startsWith("image/");
                const audio = p.file_url && p.file_type?.startsWith("audio/");
                const pdf = p.file_url && p.file_type === "application/pdf";
                const long = (p.body?.length ?? 0) > 420;
                return (
                  <Fragment key={p.id}>
                    {startsGathering && (
                      <li className={y.gatheringHead}>
                        <span>The gathering of {gatheringLabel}</span>
                      </li>
                    )}
                    <li id={`piece-${p.id}`} className={y.turn}>
                      <div className={y.turnRail} aria-hidden="true">
                        <span
                          className={y.avatar}
                          style={{
                            background: CATEGORY_TINT[p.category] ?? CATEGORY_TINT.other,
                          }}
                        >
                          {initials(p.name)}
                        </span>
                        <span className={y.rail} />
                      </div>
                      <article className={y.turnCard}>
                        {parent && (
                          <p className={y.from}>
                            ↳ picked up the thread from <a href={`#piece-${parent.id}`}>{threadLabel(parent)}</a>
                          </p>
                        )}
                        <p className={y.eyebrow}>{categoryLabel(p.category)}</p>
                        <h3>{p.title}</h3>
                        {image && (
                          // Uploaded photos: shown whole, served from media.jambuch.in.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.file_url!} alt={p.title} loading="lazy" className={y.pieceImg} />
                        )}
                        {p.body &&
                          (long ? (
                            <details className={y.more}>
                              <summary>
                                <span className={y.excerpt}>{inline(p.body.slice(0, 380))}…</span>
                                <span className={y.readMore}>Read in full</span>
                              </summary>
                              <div className={y.full}>{inline(p.body)}</div>
                            </details>
                          ) : (
                            <div className={y.full}>{inline(p.body)}</div>
                          ))}
                        {audio && <audio controls preload="none" src={p.file_url!} className={y.audio} />}
                        {pdf && (
                          <a href={p.file_url!} target="_blank" rel="noopener noreferrer" className={y.pieceLink}>
                            Open the PDF →
                          </a>
                        )}
                        {p.links.map((l) => (
                          <a
                            key={l}
                            href={l}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className={y.pieceLink}
                          >
                            {host(l)} →
                          </a>
                        ))}
                        {p.category === "education" && <p className={y.note}>{EDUCATION_NOTE}</p>}
                        <div className={y.turnFoot}>
                          <span>
                            {p.name}
                            {p.city ? `, ${p.city}` : ""} · {day(p.published_at)}
                          </span>
                          <a href={`#${REPLY_HASH}${p.id}`} className={y.pickUp}>
                            Pick up this thread
                          </a>
                        </div>
                      </article>
                    </li>
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
