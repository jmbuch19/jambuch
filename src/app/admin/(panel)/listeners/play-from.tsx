"use client";

import { useRef } from "react";
import { clock } from "@/lib/admin-stats";
import a from "../../admin.module.css";

// The chapter's audio play with a "play from here" button for each rewind
// hotspot, so Jaydeep can hear what listeners went back for.
export default function PlayFrom({ url, spots }: { url: string; spots: { at: number; count: number }[] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playFrom = (at: number) => {
    const el = audio.current;
    if (!el) return;
    // Start a little before the spot, so the line is heard from its beginning.
    el.currentTime = Math.max(0, at - 5);
    el.play().catch(() => {});
  };
  return (
    <>
      <ol className={a.spotList}>
        {spots.map((s) => (
          <li key={s.at}>
            <strong>{clock(s.at)}</strong> · {s.count} {s.count === 1 ? "rewind" : "rewinds"} ·{" "}
            <button type="button" className={a.linkButton} onClick={() => playFrom(s.at)}>
              Play from here
            </button>
          </li>
        ))}
      </ol>
      <audio ref={audio} controls preload="none" src={url} className={a.gapTop} />
    </>
  );
}
