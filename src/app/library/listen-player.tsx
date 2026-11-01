"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICES, type Track, type VoiceKey } from "@/lib/audio-voices";
import l from "./library.module.css";

const VOICE_KEY = "listen-voice";
const RATE_KEY = "listen-rate";
const PLACES_KEY = "listen-places"; // { [path]: seconds }, newest 30
const RATES = [1, 1.25, 0.75];
const FOLLOW_PAUSE_MS = 6000; // after the reader scrolls by hand, stop following for a while

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {}
}

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Which paragraph is playing at `ms`.
function paragraphAt(track: Track, ms: number) {
  let i = -1;
  for (let p = 0; p < track.paragraphMs.length && track.paragraphMs[p] <= ms; p++) i = p;
  return i;
}

type Props = { tracks: Track[]; textId: string; path: string; title: string; book: string };

// "સાંભળો · Listen": the chapter read aloud, in the voice the reader picks.
// While it plays, the paragraph being read is highlighted and the page
// follows it; tapping a paragraph plays from there. Voice, speed and the
// place in each chapter are remembered on this device. Lock-screen controls
// come from the Media Session API.
export default function ListenPlayer({ tracks, textId, path, title, book }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState<VoiceKey>(tracks[0].voice);
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(tracks[0].durationMs / 1000);
  const current = useRef(-2);
  const lastHandScroll = useRef(0);
  const pendingSeek = useRef<number | null>(null);

  const track = tracks.find((t) => t.voice === voice) ?? tracks[0];

  useEffect(() => {
    const v = localStorage.getItem(VOICE_KEY);
    if (tracks.some((t) => t.voice === v)) setVoice(v as VoiceKey);
    const r = Number(localStorage.getItem(RATE_KEY));
    if (RATES.includes(r)) setRate(r);
  }, [tracks]);

  // Highlight the paragraph being read and keep it on screen.
  const follow = useCallback(
    (seconds: number) => {
      const i = paragraphAt(track, seconds * 1000);
      if (i === current.current) return;
      const items = document.getElementById(textId)?.children;
      if (!items) return;
      items[current.current]?.classList.remove(l.reading);
      current.current = i;
      const el = items[i] as HTMLElement | undefined;
      if (!el) return;
      el.classList.add(l.reading);
      if (Date.now() - lastHandScroll.current < FOLLOW_PAUSE_MS) return;
      const bar = document.querySelector<HTMLElement>(`#reader > div`)?.getBoundingClientRect().bottom ?? 0;
      const player = document.getElementById("listen-player")?.getBoundingClientRect().top ?? window.innerHeight;
      const r = el.getBoundingClientRect();
      if (r.top < bar || r.top > player - 80) {
        window.scrollTo({ top: r.top + window.scrollY - bar - 12, behavior: "smooth" });
      }
    },
    [track, textId],
  );

  function savePlace(seconds: number) {
    const places = readJson<Record<string, number>>(PLACES_KEY, {});
    delete places[path];
    const kept = Object.entries(places).slice(-29);
    store(PLACES_KEY, Object.fromEntries([...kept, [path, Math.floor(seconds)]]));
  }

  // Start: from where this chapter was left, else from the paragraph on screen.
  function start() {
    const a = audio.current;
    if (!a) return;
    setOpen(true);
    if (!a.currentSrc || a.currentTime === 0) {
      const saved = readJson<Record<string, number>>(PLACES_KEY, {})[path];
      let from = saved && saved < track.durationMs / 1000 - 5 ? saved : 0;
      if (!saved) {
        // Reading half-way down? Start at the paragraph at the top of the screen.
        const bar = document.querySelector<HTMLElement>(`#reader > div`)?.getBoundingClientRect().bottom ?? 0;
        const items = Array.from(document.getElementById(textId)?.children ?? []);
        const top = items.findIndex((p) => p.getBoundingClientRect().bottom > bar + 1);
        const textTop = document.getElementById(textId)?.getBoundingClientRect().top ?? 0;
        if (top > 0 && textTop < bar) from = track.paragraphMs[top] / 1000;
      }
      if (from > 0) {
        if (a.readyState >= 1) a.currentTime = from;
        else a.addEventListener("loadedmetadata", () => (a.currentTime = from), { once: true });
      }
    }
    a.playbackRate = rate;
    a.play().catch(() => setPlaying(false));
  }

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) start();
    else a.pause();
  }

  function skip(seconds: number) {
    const a = audio.current;
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + seconds));
  }

  function nextRate() {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(r);
    store(RATE_KEY, String(r));
    if (audio.current) audio.current.playbackRate = r;
  }

  // Same place in the other voice: same paragraph, same share of it.
  function switchVoice(v: VoiceKey) {
    const a = audio.current;
    const to = tracks.find((t) => t.voice === v);
    if (!to || v === voice) return;
    const ms = (a?.currentTime ?? 0) * 1000;
    const i = paragraphAt(track, ms);
    let target = 0;
    if (i >= 0) {
      const from0 = track.paragraphMs[i];
      const from1 = track.paragraphMs[i + 1] ?? track.durationMs;
      const share = (ms - from0) / Math.max(1, from1 - from0);
      const to0 = to.paragraphMs[i] ?? 0;
      const to1 = to.paragraphMs[i + 1] ?? to.durationMs;
      target = (to0 + share * (to1 - to0)) / 1000;
    }
    pendingSeek.current = target;
    setVoice(v);
    store(VOICE_KEY, v);
  }

  // New voice loaded: jump to the matching place and carry on if it was playing.
  useEffect(() => {
    const a = audio.current;
    if (!a || pendingSeek.current === null) return;
    const wasPlaying = playing;
    const seek = pendingSeek.current;
    pendingSeek.current = null;
    const onReady = () => {
      a.currentTime = seek;
      a.playbackRate = rate;
      if (wasPlaying) a.play().catch(() => {});
    };
    a.addEventListener("loadedmetadata", onReady, { once: true });
    a.load();
    return () => a.removeEventListener("loadedmetadata", onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the voice changes
  }, [voice]);

  // Audio events → state, highlight, saved place, lock screen.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    let lastSave = 0;
    const onTime = () => {
      setTime(a.currentTime);
      follow(a.currentTime);
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        savePlace(a.currentTime);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      savePlace(a.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      savePlace(0);
      document.querySelector('[class*="nextBig"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    const onMeta = () => setDuration(a.duration || track.durationMs / 1000);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("loadedmetadata", onMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savePlace only reads `path`
  }, [follow, track]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: `${book} · ${VOICES[voice].gu}`,
      album: "jambuch",
      artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {}
    };
    set("play", () => start());
    set("pause", () => audio.current?.pause());
    set("seekbackward", () => skip(-15));
    set("seekforward", () => skip(15));
    return () => {
      for (const a of ["play", "pause", "seekbackward", "seekforward"] as MediaSessionAction[]) set(a, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs and current state
  }, [voice, title, book]);

  // While the player is open: tap a paragraph to listen from there; scrolling
  // by hand pauses the page following the voice for a few seconds; the
  // letter's bottom bar steps aside.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset.listening = "";
    const text = document.getElementById(textId);
    const onTap = (e: MouseEvent) => {
      const items = Array.from(text?.children ?? []);
      const i = items.findIndex((p) => p.contains(e.target as Node));
      if (i < 0 || !audio.current) return;
      lastHandScroll.current = 0;
      audio.current.currentTime = track.paragraphMs[i] / 1000;
      if (audio.current.paused) start();
    };
    const onHand = () => (lastHandScroll.current = Date.now());
    text?.addEventListener("click", onTap);
    window.addEventListener("wheel", onHand, { passive: true });
    window.addEventListener("touchmove", onHand, { passive: true });
    return () => {
      delete root.dataset.listening;
      text?.removeEventListener("click", onTap);
      window.removeEventListener("wheel", onHand);
      window.removeEventListener("touchmove", onHand);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start() reads refs and current state
  }, [open, textId, track]);

  // The 🎧 button in the reading bar (reader-bar.tsx) talks to the player
  // through two window events.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onToggle = () => toggleRef.current();
    window.addEventListener("jambuch:listen-toggle", onToggle);
    return () => window.removeEventListener("jambuch:listen-toggle", onToggle);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("jambuch:listen-state", { detail: { playing } }));
  }, [playing]);

  function close() {
    audio.current?.pause();
    setOpen(false);
    const items = document.getElementById(textId)?.children;
    items?.[current.current]?.classList.remove(l.reading);
    current.current = -2;
  }

  const minutes = Math.max(1, Math.round(track.durationMs / 60000));

  return (
    <>
      <button type="button" className={l.listenStart} onClick={toggle} aria-controls="listen-player">
        <span className={l.listenIcon} aria-hidden="true">
          {playing ? "❚❚" : "▶"}
        </span>
        <span>
          <span className="gu">{playing ? "સાંભળો છો" : "સાંભળો"}</span> · {playing ? "Playing" : "Listen to this chapter"}
          <small>
            {minutes} min · <span className="gu">{VOICES[voice].gu}</span>
          </small>
        </span>
      </button>

      <audio ref={audio} src={track.url} preload="none" />

      {open && (
        <div id="listen-player" className={l.player} role="region" aria-label="Listening">
          <div className={l.playerTrack}>
            <span className={l.playerTime}>{clock(time)}</span>
            <label htmlFor="listen-seek" className={l.srOnly}>
              Place in the chapter
            </label>
            <input
              id="listen-seek"
              type="range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              step={1}
              value={Math.floor(time)}
              onChange={(e) => {
                if (audio.current) audio.current.currentTime = Number(e.target.value);
                lastHandScroll.current = 0;
              }}
            />
            <span className={l.playerTime}>{clock(duration)}</span>
          </div>
          <div className={l.playerControls}>
            <button type="button" className={l.playerButton} onClick={() => skip(-15)} aria-label="Back 15 seconds">
              ↺<small>15</small>
            </button>
            <button
              type="button"
              className={`${l.playerButton} ${l.playerMain}`}
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button type="button" className={l.playerButton} onClick={nextRate} aria-label={`Speed ${rate}×, tap to change`}>
              {rate}×
            </button>
            {tracks.length > 1 && (
              <div className={l.voicePick} role="radiogroup" aria-label="Voice · અવાજ">
                {tracks.map((t) => (
                  <button
                    key={t.voice}
                    type="button"
                    role="radio"
                    aria-checked={t.voice === voice}
                    className="gu"
                    onClick={() => switchVoice(t.voice)}
                  >
                    {VOICES[t.voice].gu}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={l.playerButton} onClick={close} aria-label="Close the player">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
