import type { Metadata } from "next";
import Link from "next/link";
import { WORK_SLUG, loadShow } from "@/lib/podcast";
import { adminClient } from "@/lib/supabase-admin";
import { youtubeId } from "@/lib/youtube";
import LibraryHeader from "../library/header";
import YouTubePlayer from "../youtube-player";
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
// way into the question flow. A paid service, kept apart from the free Courtyard. The team voice
// throughout: "we / our / us", never a person's name (owner's decision, 26 Nov 2026).
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
      <LibraryHeader cta={{ href: "/creators/start", label: "Start your story" }} />
      <main className={c.page}>
        <section className={c.hero}>
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 className={c.title}>Your story, heard and seen.</h1>
          <p className={`gu ${c.titleGu}`} lang="gu">
            તમારી વાર્તા — સંભળાય અને દેખાય.
          </p>
          <p className={c.lede}>
            Send us your story in Gujarati, Hindi or English. We turn it into a narrated audio story or an illustrated
            video, with character voices, music, sound and pauses, made with the same care as the Ramayana audio plays and
            videos on this site.
          </p>
          <div className={h.buttons}>
            <Link href="/creators/start" className={h.btnAccent}>
              Start your story
            </Link>
            <a href="#examples" className={h.btnOutline}>
              Hear and see our work
            </a>
          </div>
        </section>

        <section className={c.block} aria-labelledby="make">
          <h2 id="make" className={c.h2}>
            What we make
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
          <p className={c.small}>
            <b>Where you may use it:</b> online and offline publishing: YouTube, Spotify, websites, social media and
            personal use. Not for film, TV broadcast, cinema or games: for those, a music replacement add-on is needed
            before release.
          </p>
        </section>

        <section className={c.block} aria-labelledby="ways">
          <h2 id="ways" className={c.h2}>
            Two ways to make it
          </h2>
          <div className={c.cards}>
            <article className={c.card}>
              <h3>Studio-made</h3>
              <p>
                Our automatic studio makes your story from your plan, and our team checks it. The fastest way, and the
                sample is ₹499.
              </p>
            </article>
            <article className={c.card}>
              <h3>Varta Vishva Directors</h3>
              <p lang="gu" className="gu">
                વાર્તા વિશ્વ દિગ્દર્શકો દ્વારા
              </p>
              <p>
                One of our directors calls you within 2 days, then directs your story scene by scene: every voice, sound,
                pause and picture. The sample is ₹999. Our directors take a few new stories each week; Premium is always
                made this way.
              </p>
            </article>
          </div>
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
              <b>Sign in with your email and send your story.</b> It is checked against our content guidelines, then you answer a few questions about it. Nothing is paid yet.
            </li>
            <li>
              <b>You get a one-page plan and a fixed price</b>: voices, music, pictures, length. Change it until it is right.
            </li>
            <li>
              <b>A 30–60 second sample (₹499; ₹999 with Varta Vishva Directors)</b> of your own story, so you can hear
              and see the style before you order the full piece. If you go ahead, the sample fee is taken off the full
              price.
            </li>
            <li>
              <b>The full piece:</b> you listen or watch, and flag anything to correct. Our mistakes are always fixed free.
            </li>
            <li>
              <b>You download your files</b> and share them wherever you like.
            </li>
          </ol>
          <p className={c.small}>Prices and terms are confirmed in your quote before you pay anything.</p>
        </section>

        <section id="guidelines" className={c.block} aria-labelledby="dont">
          <h2 id="dont" className={c.h2}>
            What we don’t make
          </h2>
          <ul className={`${c.text} ${c.guidelines}`}>
            <li>Song lyrics or long passages from someone else’s published work, without written permission.</li>
            <li>Hate or contempt against any religion, caste, community or group, or mockery of anyone’s faith.</li>
            <li>Real people shown in a harmful way: defamed, mocked, or saying what they never said.</li>
            <li>Sexual content, anything that harms children, or violence beyond what the story needs.</li>
            <li>Political propaganda, or medical, legal or money claims presented as fact.</li>
          </ul>
          <p className={c.small}>
            Every story is checked against this list when it is sent, before anything is paid. If something needs to
            change, we suggest how.
          </p>
        </section>

        <section id="request" className={`${c.block} ${c.requestBlock}`} aria-labelledby="ask">
          <h2 id="ask" className={c.h2}>
            Start your story
          </h2>
          <p className={c.text}>
            Sign in with your email (we send a short code, no password), paste your story, and answer a few questions
            about it. You see your plan and fixed price before paying anything; the sample comes next.
          </p>
          <div className={h.buttons}>
            <Link href="/creators/start" className={h.btnAccent}>
              Start your story
            </Link>
          </div>
        </section>

        <p className={c.apart}>
          Creator’s Space is a paid service. It is separate from the <Link href="/courtyard">Courtyard</Link>, where sharing
          is free and no money is made from your work.
        </p>
      </main>
    </>
  );
}
