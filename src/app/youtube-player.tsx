"use client";

import { useState } from "react";
import { youtubeThumb } from "@/lib/youtube";
import s from "./home.module.css";

// A YouTube video that plays on the page. Until it's clicked, only the
// thumbnail loads (no YouTube scripts or cookies); then the privacy-enhanced
// player replaces it and starts playing.
export default function YouTubePlayer({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className={s.video}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button type="button" className={`${s.video} ${s.videoCover}`} onClick={() => setPlaying(true)} aria-label={`Play: ${title}`}>
      {/* YouTube's own thumbnail for the video. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={youtubeThumb(id)} alt="" loading="lazy" />
      <span className={s.playBadge} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}
