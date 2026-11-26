import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { adminClient } from "@/lib/supabase-admin";
import { loadShow } from "@/lib/podcast";
import { youtubeId, youtubeThumb } from "@/lib/youtube";
import { CHANNEL_URL, SUBSCRIBE_URL, latestVideos } from "@/lib/vartavishva";
import YouTubePlayer from "../youtube-player";
import v from "./vartavishva.module.css";

const NAME_GU = "વાર્તા વિશ્વ";
const TAGLINE_GU = "વાર્તા નું વિશ્વ – વિશ્વની વાર્તાઓ";
const WELCOME_GU =
  "‘વાર્તા વિશ્વ – Story Tube’ ચેનલમાં આપનું સ્વાગત છે. આ ચેનલમાં વિશ્વ સાહિત્યની ઉચ્ચતમ રચનાઓ, કવિતાઓ, અનુભવો, વાર્તાઓ વગેરેની રજૂઆત કરવાનો પ્રયત્ન છે. આશા છે કે આપને ગમશે!";
const WELCOME_EN =
  "The finest works of world literature, poems, experiences and stories, told in Gujarati. We hope you enjoy them.";

export const metadata: Metadata = {
  title: "વાર્તા વિશ્વ – Story Tube · Vartavishva",
  description: "Stories, poems and the finest works of world literature, told in Gujarati. વિશ્વની વાર્તાઓ, ગુજરાતીમાં.",
  icons: { icon: "/vartavishva/logo.png", apple: "/vartavishva/logo.png" },
  openGraph: {
    title: "વાર્તા વિશ્વ – Story Tube",
    description: "Stories, poems and the finest works of world literature, told in Gujarati.",
    images: [{ url: "/vartavishva/logo.png", width: 500, height: 500, alt: "Story Tube logo" }],
  },
};

export const viewport: Viewport = { themeColor: "#000000" };

// Refresh links (site_text) and the video list every hour at most; admin edits show
// within five minutes.
export const revalidate = 300;

// The brand page of the YouTube channel વાર્તા વિશ્વ – Story Tube. Its own look (the
// channel's black and the logo's colours), separate from jambuch.in's. Links are
// site_text rows "vartavishva.*"; an empty row hides that link.
export default async function VartavishvaPage() {
  const db = adminClient();
  const [text, videos, show] = await Promise.all([
    db
      .from("site_text")
      .select("key, en")
      .like("key", "vartavishva.%")
      .then(
        (r) => Object.fromEntries((r.data ?? []).map((x) => [x.key, (x.en ?? "").trim()])),
        () => ({}) as Record<string, string>,
      ),
    latestVideos(6),
    loadShow(db).catch(() => null),
  ]);
  const t = (k: string) => (text as Record<string, string>)[`vartavishva.${k}`] || "";

  const featured = youtubeId(t("featured_video")) ?? videos[0]?.id ?? null;
  const featuredTitle = videos.find((x) => x.id === featured)?.title ?? "Story Tube";
  const rest = videos.filter((x) => x.id !== featured).slice(0, 6);

  const follow = [
    { label: "YouTube", href: CHANNEL_URL },
    { label: "Spotify", href: t("spotify") || show?.spotifyUrl || "" },
    { label: "Instagram", href: t("instagram") },
    { label: "Facebook", href: t("facebook") },
    { label: "WhatsApp", href: t("whatsapp") },
  ].filter((l) => /^https:\/\//.test(l.href));

  return (
    <div className={v.page}>
      <header className={v.top}>
        <a href={CHANNEL_URL} className={v.brand} target="_blank" rel="noopener noreferrer">
          <Image src="/vartavishva/logo.png" alt="" width={44} height={44} className={v.mark} priority />
          <span>
            <span className={`gu ${v.brandGu}`} lang="gu">
              {NAME_GU}
            </span>{" "}
            <span className={v.brandEn}>Story Tube</span>
          </span>
        </a>
        <a href={SUBSCRIBE_URL} className={v.subscribe} target="_blank" rel="noopener noreferrer">
          Subscribe
        </a>
      </header>

      <main className={v.main}>
        <section className={v.hero}>
          <Image
            src="/vartavishva/logo.png"
            alt="Story Tube: વાર્તા નું વિશ્વ – વિશ્વની વાર્તાઓ"
            width={260}
            height={260}
            className={v.heroLogo}
            priority
          />
          <div className={v.heroText}>
            <h1 className={v.title}>
              <span className="gu" lang="gu">
                {NAME_GU}
              </span>
              <span className={v.titleEn}>Story Tube</span>
            </h1>
            <p className={`gu ${v.tagline}`} lang="gu">
              {TAGLINE_GU}
            </p>
            <p className={`gu ${v.welcome}`} lang="gu">
              {t("welcome_gu") || WELCOME_GU}
            </p>
            <p className={v.welcomeEn}>{t("welcome_en") || WELCOME_EN}</p>
            <div className={v.buttons}>
              <a href={SUBSCRIBE_URL} className={v.primary} target="_blank" rel="noopener noreferrer">
                Subscribe on YouTube
              </a>
              <a href={CHANNEL_URL + "/videos"} className={v.secondary} target="_blank" rel="noopener noreferrer">
                All videos
              </a>
            </div>
          </div>
        </section>

        {featured && (
          <section className={v.block} aria-labelledby="watch">
            <h2 id="watch" className={v.h2}>
              Watch now
            </h2>
            <div className={v.player}>
              <YouTubePlayer id={featured} title={featuredTitle} />
            </div>
            <p className={`gu ${v.caption}`} lang="gu">
              {featuredTitle}
            </p>
          </section>
        )}

        {!!rest.length && (
          <section className={v.block} aria-labelledby="latest">
            <h2 id="latest" className={v.h2}>
              Latest on the channel
            </h2>
            <ul className={v.grid}>
              {rest.map((x) => (
                <li key={x.id}>
                  <a href={`https://www.youtube.com/watch?v=${x.id}`} target="_blank" rel="noopener noreferrer" className={v.card}>
                    {/* YouTube's own thumbnail. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeThumb(x.id)} alt="" loading="lazy" />
                    <span className={`gu ${v.cardTitle}`} lang="gu">
                      {x.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(show?.youtubeUrl || show?.spotifyUrl) && (
          <section className={v.block} aria-labelledby="series">
            <h2 id="series" className={v.h2}>
              The Ramayana in Gujarati
            </h2>
            <p className={v.text}>
              C. Rajagopalachari’s Ramayana, in Nalinkant Chhaya’s Gujarati translation: dramatised audio plays and
              illustrated videos, chapter by chapter.
            </p>
            <div className={v.buttons}>
              {show?.youtubeUrl && (
                <a href={show.youtubeUrl} className={v.secondary} target="_blank" rel="noopener noreferrer">
                  Watch the playlist
                </a>
              )}
              {show?.spotifyUrl && (
                <a href={show.spotifyUrl} className={v.secondary} target="_blank" rel="noopener noreferrer">
                  Listen on Spotify
                </a>
              )}
              <a href="https://jambuch.in/library/ramayana" className={v.secondary}>
                Read and listen on jambuch.in
              </a>
            </div>
          </section>
        )}

        <section className={`${v.block} ${v.studio}`} aria-labelledby="yours">
          <h2 id="yours" className={v.h2}>
            Have a story of your own?
          </h2>
          <p className={v.text}>
            Creator’s Space, our studio, turns writers’ stories into narrated audio stories and illustrated videos in
            Gujarati, Hindi or English. Start with a 30–60 second sample of your own story.
          </p>
          <a href="https://jambuch.in/creators" className={v.primary}>
            Get your story made
          </a>
        </section>

        {!!follow.length && (
          <section className={v.block} aria-labelledby="follow">
            <h2 id="follow" className={v.h2}>
              Follow
            </h2>
            <ul className={v.follow}>
              {follow.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className={v.foot}>
        A <a href="https://jambuch.in">jambuch.in</a> project
      </footer>
    </div>
  );
}
