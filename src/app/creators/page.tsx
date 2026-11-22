import type { Metadata } from "next";
import Link from "next/link";
import { WORK_SLUG, loadShow } from "@/lib/podcast";
import { adminClient } from "@/lib/supabase-admin";
import { youtubeId } from "@/lib/youtube";
import LibraryHeader from "../library/header";
import YouTubePlayer from "../youtube-player";
import RequestForm from "./request-form";
import h from "../home.module.css";
import c from "./creators.module.css";

export const metadata: Metadata = {
  title: "Creator's Space · Your story, heard and seen · jambuch.in",
  description:
    "A paid studio service: writers turn their stories into narrated audio stories or illustrated videos, in Gujarati, Hindi or English. Start with a short sample.",
};

// Refresh the links (Spotify, YouTube, example video) from Supabase every few minutes.
export const revalidate = 300;

// Creator's Space, first step (21 Nov 2026): what we make, examples, how it works, and a
// "Request a sample" form that emails Jaydeep. A paid service, kept apart from the free Courtyard.
// The configurator, quotes and payments come later (docs/CREATORS_SPACE_BRIEF.md).
export default async function CreatorsPage() {
  const db = adminClient();
  const [show, text] = await Promise.all([
    loadShow(db).catch(() => null),
    db.from("site_text").select("key, en").like("key", "creators.%").then((r) => Object.fromEntries((r.data ?? []).map((x) => [x.key, x.en ?? ""]))),
  ]);
  // An example video can be set in admin (site_text "creators.example_video": a YouTube link).
  const video = youtubeId(text["creators.example_video"] ?? null);

  return (
    <>
      <LibraryHeader cta={{ href: "#request", label: "Request a sample" }} />
      <main className={c.page}>
        <section className={c.hero}>
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 className={c.title}>Your story, heard and seen.</h1>
          <p className={`gu ${c.titleGu}`} lang="gu">
            તમારી વાર્તા — સંભળાય અને દેખાય.
          </p>
          <p className={c.lede}>
            Send me your story in Gujarati, Hindi or English. I turn it into a narrated audio story or an illustrated
            video, with character voices, music, sound and pauses, made with the same care as the Ramayana audio plays and
            videos on this site.
          </p>
          <div className={h.buttons}>
            <a href="#request" className={h.btnAccent}>
              Request a sample
            </a>
            <a href="#examples" className={h.btnOutline}>
              Hear and see our work
            </a>
          </div>
        </section>

        <section className={c.block} aria-labelledby="make">
          <h2 id="make" className={c.h2}>
            What I make
          </h2>
          <div className={c.cards}>
            <article className={c.card}>
              <h3>Audio story</h3>
              <p>
                Your story read aloud like a radio play: a narrator, a separate voice for each character, background music,
                sound effects and pauses where the story needs them. Delivered as an MP3.
              </p>
            </article>
            <article className={c.card}>
              <h3>Illustrated video</h3>
              <p>
                The audio story with paintings made for each moment, in a style you choose, with slow camera movement and
                captions. Ready for YouTube.
              </p>
            </article>
            <article className={c.card}>
              <h3>Shorts</h3>
              <p>A few 45–60 second vertical clips from your video, each with a hook, for Shorts, Reels and WhatsApp.</p>
            </article>
          </div>
          <p className={c.small}>
            Any of these can also be made in a second language. Long stories become a series of episodes.
          </p>
        </section>

        <section id="examples" className={c.block} aria-labelledby="work">
          <h2 id="work" className={c.h2}>
            Hear and see our work
          </h2>
          <p className={c.text}>
            The Ramayana in Gujarati, made here chapter by chapter: dramatised audio plays and illustrated videos.
          </p>
          {video && (
            <div className={c.video}>
              <YouTubePlayer id={video} title="An example video" />
            </div>
          )}
          <div className={c.links}>
            <Link href={`/library/${WORK_SLUG}`} className={h.btnOutline}>
              Listen in the reader 🎧
            </Link>
            {show?.spotifyUrl && (
              <a href={show.spotifyUrl} target="_blank" rel="noopener noreferrer" className={h.btnOutline}>
                Listen on Spotify
              </a>
            )}
            {show?.youtubeUrl && (
              <a href={show.youtubeUrl} target="_blank" rel="noopener noreferrer" className={h.btnOutline}>
                Watch on YouTube
              </a>
            )}
          </div>
        </section>

        <section className={c.block} aria-labelledby="how">
          <h2 id="how" className={c.h2}>
            How it works
          </h2>
          <ol className={c.steps}>
            <li>
              <b>Tell me about your story</b> with the form below. Nothing is paid now.
            </li>
            <li>
              <b>I reply with a plan and a fixed quote</b>: voices, music, pictures, length.
            </li>
            <li>
              <b>A free sample first:</b> 30–60 seconds of your story, so you can hear and see the style before you
              order. Everything after the sample is paid.
            </li>
            <li>
              <b>The full piece:</b> you listen or watch, and flag anything to correct. My mistakes are always fixed free.
            </li>
            <li>
              <b>You download your files</b> and share them wherever you like.
            </li>
          </ol>
          <p className={c.small}>Prices and terms are confirmed in your quote before you pay anything.</p>
        </section>

        <section id="request" className={`${c.block} ${c.requestBlock}`} aria-labelledby="ask">
          <h2 id="ask" className={c.h2}>
            Request a sample
          </h2>
          <p className={c.text}>A few lines are enough. I read every request myself.</p>
          <RequestForm />
        </section>

        <p className={c.apart}>
          Creator’s Space is a paid service. It is separate from the <Link href="/courtyard">Courtyard</Link>, where sharing
          is free and no money is made from your work.
        </p>
      </main>
    </>
  );
}
