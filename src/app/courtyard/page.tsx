import type { Metadata } from "next";
import { DOOR_HASH, EDUCATION_NOTE, categoryLabel } from "@/lib/courtyard";
import { inline } from "@/lib/inline";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../library/header";
import ContributeForm from "./contribute-form";
import y from "./courtyard.module.css";

// Following design/Courtyard.dc.html.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "The Courtyard · jambuch.in",
  description:
    "Friends, family, colleagues and visitors share poems, photographs, lessons and small tools here, with credit always theirs.",
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
  published_at: string;
};

// Approved single pieces, read on the server with only the columns that may
// be shown (never the sender's email). If the shelf can't be read, the page
// still shows, with an empty shelf.
async function sharedPieces(): Promise<Piece[]> {
  try {
    const { data, error } = await adminClient()
      .from("courtyard_submissions")
      .select("id, name, city, category, title, body, file_url, file_type, links, published_at")
      .eq("kind", "single_piece")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data ?? []) as Piece[];
  } catch (err) {
    console.error("courtyard shelf:", err instanceof Error ? err.message : err);
    return [];
  }
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
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

export default async function CourtyardPage() {
  const pieces = await sharedPieces();

  return (
    <>
      <LibraryHeader cta={{ href: "#contribute", label: "Contribute" }} current="courtyard" />
      <main>
        <section className={y.hero}>
          <p className={`gu ${y.kicker}`}>આંગણું</p>
          <h1 className={y.h1}>The Courtyard</h1>
          <p className={y.lede}>
            Friends, family, colleagues — and you. A poem, a photograph, a lesson that helped a student, a small tool
            that saved someone an hour: if you made it and it’s worth sharing, there’s a place for it here. Credit always
            goes to the person who made it.
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

        <section className={y.band}>
          <div className={y.bandInner}>
            <h2 className={y.h2}>Rooms</h2>
            <p className={y.sectionIntro}>Creators with a page of their own.</p>
            <p className={y.empty}>No rooms yet. Yours could be the first.</p>
          </div>
        </section>

        <section className={`${y.band} ${y.bandAlt}`} aria-labelledby="shared">
          <div className={y.bandInner}>
            <h2 id="shared" className={y.h2}>
              Shared by visitors
            </h2>
            <p className={y.sectionIntro}>
              Single pieces from people who stopped by. Each one read and approved before it appears.
            </p>
            {pieces.length === 0 ? (
              <p className={y.empty}>
                Nothing here yet. <a href={`#${DOOR_HASH.single_piece}`}>Share the first piece →</a>
              </p>
            ) : (
              <div className={y.shelf}>
                {pieces.map((p) => {
                  const image = p.file_url && p.file_type?.startsWith("image/");
                  const audio = p.file_url && p.file_type?.startsWith("audio/");
                  const pdf = p.file_url && p.file_type === "application/pdf";
                  const long = (p.body?.length ?? 0) > 420;
                  return (
                    <article key={p.id} className={y.piece}>
                      {image && (
                        // Uploaded photos: shown whole, served from media.jambuch.in.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.file_url!} alt={p.title} loading="lazy" className={y.pieceImg} />
                      )}
                      <span className={y.eyebrow}>{categoryLabel(p.category)}</span>
                      <h3>{p.title}</h3>
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
                        <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className={y.pieceLink}>
                          {host(l)} →
                        </a>
                      ))}
                      <p className={y.byline}>
                        by {p.name}
                        {p.city ? `, ${p.city}` : ""}
                      </p>
                      {p.category === "education" && <p className={y.note}>{EDUCATION_NOTE}</p>}
                    </article>
                  );
                })}
              </div>
            )}
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
              <p>Ask, and it comes down — with every file returned.</p>
            </div>
          </div>
        </section>

        <section id="contribute" className={y.contribute}>
          <div className={y.contributeWrap}>
            <h2 className={y.contributeTitle}>Contribute</h2>
            <p className={y.contributeLede}>Pick a door. Every submission is read by Jaydeep before anything appears.</p>
            <ContributeForm />
          </div>
        </section>
      </main>
    </>
  );
}
