"use client";

import { useEffect, useRef } from "react";

const READER_KEY = "reader-id";
const IDLE_MS = 90_000; // no scroll, tap or key for this long: the reader has stepped away
const SEND_EVERY_MS = 30_000;

// A random code for this browser, so one reader is counted once per chapter.
// It identifies nothing about the person.
function readerId() {
  try {
    let id = localStorage.getItem(READER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(READER_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function device() {
  const w = window.innerWidth;
  return w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

function preferences() {
  const root = document.documentElement;
  let spacing: string | null = null;
  try {
    spacing = localStorage.getItem("reader-spacing");
  } catch {}
  return {
    theme: root.dataset.readerTheme ?? "paper",
    size: Number.parseInt(getComputedStyle(root).getPropertyValue("--reader-size")) || null,
    spacing: spacing ?? "normal",
  };
}

// Counts anonymous reading of one chapter: opened, active reading time, and
// finished (reached this marker at the end of the text after reading for at
// least `minSeconds`). The server ignores the admin's own visits.
export default function ReadTracker({ chapterId, minSeconds }: { chapterId: string; minSeconds: number }) {
  const marker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Automated browsers (search bots, test tools) are not readers.
    if (navigator.webdriver) return;

    const reader = readerId();
    let active = 0; // seconds read so far on this visit
    let unsent = 0; // seconds not yet reported
    let finished = false;
    let finishSent = false;
    let atEnd = false;
    let lastActivity = Date.now();

    function send(open: boolean, useBeacon = false) {
      const body = JSON.stringify({
        chapterId,
        readerId: reader,
        open,
        seconds: unsent,
        finished: finished && !finishSent,
        device: device(),
        ...preferences(),
      });
      unsent = 0;
      if (finished) finishSent = true;
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/read", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/read", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
          () => {},
        );
      }
    }

    function checkFinished() {
      if (!finished && atEnd && active >= minSeconds) {
        finished = true;
        send(false);
      }
    }

    const onActivity = () => (lastActivity = Date.now());
    const events = ["scroll", "touchstart", "keydown", "mousemove", "wheel"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });

    const tick = setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - lastActivity > IDLE_MS) return;
      active += 1;
      unsent += 1;
      checkFinished();
    }, 1000);
    const flush = setInterval(() => unsent > 0 && send(false), SEND_EVERY_MS);

    const observer = new IntersectionObserver(([entry]) => {
      atEnd = entry.isIntersecting || atEnd;
      checkFinished();
    });
    if (marker.current) observer.observe(marker.current);

    const onHide = () => {
      if (document.visibilityState === "hidden" && unsent > 0) send(false, true);
    };
    document.addEventListener("visibilitychange", onHide);

    send(true);

    return () => {
      if (unsent > 0) send(false, true);
      clearInterval(tick);
      clearInterval(flush);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [chapterId, minSeconds]);

  return <div ref={marker} aria-hidden="true" style={{ height: 1 }} />;
}
