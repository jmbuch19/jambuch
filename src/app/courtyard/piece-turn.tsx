import { FORM_TINT, initials, kindLine, themeNotes } from "@/lib/courtyard";
import { inline } from "@/lib/inline";
import { youtubeId } from "@/lib/youtube";
import YouTubePlayer from "../youtube-player";
import y from "./courtyard.module.css";

// One approved piece, as it appears on the thread and on series pages.
// Only these columns are ever read for the public: never email or IP.
export const PIECE_COLUMNS =
  "id, name, city, form, themes, title, body, file_url, file_type, links, thread_from, published_at, gathering_at, series_id, series_part";

export type Piece = {
  id: string;
  name: string;
  city: string | null;
  form: string;
  themes: string[];
  title: string;
  body: string | null;
  file_url: string | null;
  file_type: string | null;
  links: string[];
  thread_from: string | null;
  published_at: string;
  gathering_at: string;
  series_id: string | null;
  series_part: number | null;
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export default function PieceTurn({
  p,
  from,
  series,
  pickUpHref,
  open = false,
}: {
  p: Piece;
  from?: { href: string; label: string };
  series?: { href: string; title: string } | null;
  pickUpHref?: string | null;
  open?: boolean; // show long text in full (series pages)
}) {
  const image = p.file_url && p.file_type?.startsWith("image/");
  const audio = p.file_url && p.file_type?.startsWith("audio/");
  const pdf = p.file_url && p.file_type === "application/pdf";
  const video = p.links.map(youtubeId).find((id): id is string => !!id);
  const otherLinks = p.links.filter((l) => !youtubeId(l));
  const long = !open && (p.body?.length ?? 0) > 420;

  return (
    <li id={`piece-${p.id}`} className={y.turn}>
      <div className={y.turnRail} aria-hidden="true">
        <span className={y.avatar} style={{ background: FORM_TINT[p.form] ?? FORM_TINT.other }}>
          {initials(p.name)}
        </span>
        <span className={y.rail} />
      </div>
      <article className={y.turnCard}>
        {from && (
          <p className={y.from}>
            ↳ picked up the thread from <a href={from.href}>{from.label}</a>
          </p>
        )}
        {series && (
          <p className={y.seriesLine}>
            <a href={series.href}>
              {series.title} · Part {p.series_part}
            </a>
          </p>
        )}
        <p className={y.eyebrow}>{kindLine(p.form, p.themes)}</p>
        <h3>{p.title}</h3>
        {image && (
          // Uploaded photos: shown whole, served from media.jambuch.in.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.file_url!} alt={p.title} loading="lazy" className={y.pieceImg} />
        )}
        {video && <YouTubePlayer id={video} title={p.title} />}
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
        {otherLinks.map((l) => (
          <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className={y.pieceLink}>
            {host(l)} →
          </a>
        ))}
        {themeNotes(p.themes).map((n) => (
          <p key={n} className={y.note}>
            {n}
          </p>
        ))}
        <div className={y.turnFoot}>
          <span>
            {p.name}
            {p.city ? `, ${p.city}` : ""} · {day(p.gathering_at ?? p.published_at)}
          </span>
          {pickUpHref && (
            <a href={pickUpHref} className={y.pickUp}>
              Pick up this thread
            </a>
          )}
        </div>
      </article>
    </li>
  );
}
