"use client";

import { useEffect, useRef, type RefObject } from "react";
import { readerId } from "./reader-id";

// Counts anonymous listening of one chapter, like read-tracker.tsx does for
// reading: a heartbeat every 15 s while the audio plays, and one on pause,
// end and leaving the page. It reports time actually heard (skipping ahead
// doesn't count), which minutes were heard, jumps back (rewinds) and forward
// (skips), and the speeds used. The server ignores the admin's own listening.

const SEND_EVERY_MS = 15_000;
const JUMP_S = 5;

function device() {
  const w = window.innerWidth;
  return w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

export function useListenTracker(
  audio: RefObject<HTMLAudioElement | null>,
  options: { chapterId: string; track: string; durationMs: number },
) {
  const current = useRef(options);
  current.current = options;
  const ignoreJumpsUntil = useRef(0);

  useEffect(() => {
    const a = audio.current;
    // Automated browsers (search bots, test tools) are not listeners.
    if (!a || navigator.webdriver) return;
    const reader = readerId();

    let last = a.currentTime;
    let open = false; // the next heartbeat starts a listening session
    let listened = 0;
    let minutes = new Set<number>();
    let rewinds: number[] = [];
    let skips = 0;
    let speed: Record<string, number> = {};

    const onTime = () => {
      const pos = a.currentTime;
      const moved = pos - last;
      last = pos;
      if (Date.now() < ignoreJumpsUntil.current) return; // switching voice, not the listener jumping
      const rate = a.playbackRate || 1;
      if (moved > 0 && moved <= 2 * rate) {
        // Playing on: count real time heard, at this speed.
        const heard = moved / rate;
        listened += heard;
        minutes.add(Math.floor(pos / 60));
        speed[String(rate)] = (speed[String(rate)] ?? 0) + heard;
      } else if (moved < -JUMP_S) {
        rewinds.push(Math.round(pos));
      } else if (moved > JUMP_S) {
        skips += 1;
      }
    };

    function send(useBeacon = false) {
      const empty = !open && listened < 1 && rewinds.length === 0 && skips === 0;
      if (empty) return;
      const { chapterId, track, durationMs } = current.current;
      const body = JSON.stringify({
        chapterId,
        readerId: reader,
        track,
        open,
        listened: Math.round(listened),
        position: Math.round(a!.currentTime),
        duration: Math.round(durationMs / 1000),
        minutes: [...minutes],
        rewinds,
        skips,
        speed: Object.fromEntries(Object.entries(speed).map(([k, v]) => [k, Math.round(v)])),
        device: device(),
      });
      open = false;
      listened = 0;
      minutes = new Set();
      rewinds = [];
      skips = 0;
      speed = {};
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/listen", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/listen", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
          () => {},
        );
      }
    }

    const onPlay = () => {
      open = true;
      last = a.currentTime;
      send(); // counts the play even if it lasts only a moment
    };
    const onStop = () => send();
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    const onLeave = () => send(true);
    const tick = setInterval(() => {
      if (!a.paused) send();
    }, SEND_EVERY_MS);

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onStop);
    a.addEventListener("ended", onStop);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      send(true);
      clearInterval(tick);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onStop);
      a.removeEventListener("ended", onStop);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [audio]);

  // Call before changing the audio's source, so the jump isn't counted.
  return { ignoreJumps: () => (ignoreJumpsUntil.current = Date.now() + 2500) };
}
