"use client";

import { useEffect, useRef, useState } from "react";
import { findBookmark, removeBookmark, saveBookmark } from "./bookmarks";
import {
  READER_DEFAULT_SIZE,
  READER_LARGE_FROM,
  READER_SIZES,
  READER_SPACINGS,
  READER_THEMES,
  type ReaderSpacing,
  type ReaderTheme,
} from "./reader-settings";
import ShareButton from "./share-button";
import l from "./library.module.css";

const SIZE_KEY = "reader-font-size";
const THEME_KEY = "reader-theme";
const SPACING_KEY = "reader-spacing";
const BOLD_KEY = "reader-bold";

const THEME_LABELS: Record<ReaderTheme, string> = {
  paper: "Paper",
  white: "White",
  sepia: "Sepia",
  night: "Night",
};

const SPACING_LABELS: Record<ReaderSpacing, string> = {
  compact: "Compact",
  normal: "Normal",
  wide: "Wide",
};

type Settings = { size: number; bold: boolean; theme: ReaderTheme; spacing: ReaderSpacing };

function apply({ size, bold, theme, spacing }: Settings) {
  const root = document.documentElement;
  root.style.setProperty("--reader-size", `${size}px`);
  root.style.setProperty("--reader-leading", String(READER_SPACINGS[spacing]));
  if (size >= READER_LARGE_FROM) root.dataset.readerLarge = "";
  else delete root.dataset.readerLarge;
  if (bold) root.dataset.readerBold = "";
  else delete root.dataset.readerBold;
  if (theme === "paper") delete root.dataset.readerTheme;
  else root.dataset.readerTheme = theme;
}

// Sizes from before the 2026 steps (16, 22, 24, 28) move to the nearest new one.
function nearestSize(n: number) {
  if (!n) return READER_DEFAULT_SIZE;
  return READER_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best));
}

// Three lines drawn with the gap the option gives.
function SpacingIcon({ gap }: { gap: number }) {
  const top = 12 - gap;
  return (
    <svg width="28" height="24" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d={`M4 ${top}h20M4 12h20M4 ${12 + gap}h20`} />
    </svg>
  );
}
const SPACING_GAPS: Record<ReaderSpacing, number> = { compact: 4, normal: 6, wide: 9 };

type Props = {
  textId: string; // the <article> holding the chapter's paragraphs
  work: string;
  path: string;
  title: string;
};

// The reading bar, always on screen while reading (written for older readers):
// smaller / bigger letters, bold, save my place, and "more" (page colour, line
// spacing, share). Changing the size re-wraps the text to the screen and keeps
// the paragraph being read where it was. Choices are remembered in this
// browser; the inline script in the chapter page applies them before first
// paint, so the page never jumps.
export default function ReaderBar({ textId, work, path, title }: Props) {
  const [settings, setSettings] = useState<Settings>({
    size: READER_DEFAULT_SIZE,
    bold: false,
    theme: "paper",
    spacing: "normal",
  });
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>(undefined);

  useEffect(() => {
    const s: Settings = { size: READER_DEFAULT_SIZE, bold: false, theme: "paper", spacing: "normal" };
    try {
      const savedSize = localStorage.getItem(SIZE_KEY);
      if (savedSize) s.size = nearestSize(Number(savedSize));
      s.bold = localStorage.getItem(BOLD_KEY) === "1";
      const savedTheme = localStorage.getItem(THEME_KEY) as ReaderTheme | null;
      if (savedTheme && READER_THEMES.includes(savedTheme)) s.theme = savedTheme;
      const savedSpacing = localStorage.getItem(SPACING_KEY) as ReaderSpacing | null;
      if (savedSpacing && savedSpacing in READER_SPACINGS) s.spacing = savedSpacing;
    } catch {}
    setSettings(s);
    apply(s);
    setSaved(!!findBookmark(path));

    // Opened from "Continue where you left off": go to the saved paragraph.
    const m = /^#p-(\d+)$/.exec(window.location.hash);
    const target = m ? document.getElementById(textId)?.children[Number(m[1]) - 1] : null;
    if (target) {
      const bar = barRef.current?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - bar - 8 });
    }

    // Leaving the reader restores the site's normal look.
    return () => {
      const root = document.documentElement;
      delete root.dataset.readerTheme;
      delete root.dataset.readerBold;
      delete root.dataset.readerLarge;
      root.style.removeProperty("--reader-size");
      root.style.removeProperty("--reader-leading");
      window.clearTimeout(toastTimer.current);
    };
  }, [path, textId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // The paragraph at the top of the screen, just under the bar.
  function paragraphAtTop() {
    const text = document.getElementById(textId);
    const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;
    if (!text) return null;
    const items = Array.from(text.children) as HTMLElement[];
    const index = items.findIndex((p) => p.getBoundingClientRect().bottom > barBottom + 1);
    return index < 0 ? null : { el: items[index], index, barBottom };
  }

  function show(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  function save(change: Partial<Settings>) {
    const next = { ...settings, ...change };
    // Remember how far into the top paragraph the reader is, re-wrap, then
    // scroll so that same spot sits under the bar again.
    const text = document.getElementById(textId);
    const reading = text && text.getBoundingClientRect().top < (barRef.current?.getBoundingClientRect().bottom ?? 0);
    const top = reading ? paragraphAtTop() : null;
    let into = 0;
    if (top) {
      const r = top.el.getBoundingClientRect();
      into = (top.barBottom - r.top) / r.height;
    }
    setSettings(next);
    apply(next);
    if (top) {
      const r = top.el.getBoundingClientRect();
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? top.barBottom;
      window.scrollBy(0, r.top + into * r.height - barBottom);
    }
    try {
      localStorage.setItem(SIZE_KEY, String(next.size));
      localStorage.setItem(BOLD_KEY, next.bold ? "1" : "0");
      localStorage.setItem(THEME_KEY, next.theme);
      localStorage.setItem(SPACING_KEY, next.spacing);
    } catch {}
  }

  function toggleSaved() {
    if (saved) {
      removeBookmark(path);
      setSaved(false);
      show("દૂર કર્યું");
    } else {
      saveBookmark({ path, work, title, para: paragraphAtTop()?.index ?? 0, at: Date.now() });
      setSaved(true);
      show("સાચવ્યું");
    }
  }

  const step = READER_SIZES.indexOf(settings.size);

  return (
    <div className={l.readingBar} ref={barRef}>
      <div className={l.barGroup}>
        <button
          type="button"
          className={l.barButton}
          onClick={() => save({ size: READER_SIZES[step - 1] })}
          disabled={step <= 0}
          aria-label="Smaller text · અક્ષર નાના"
        >
          <span className={`gu ${l.barIcon}`} aria-hidden="true">
            અ<small>−</small>
          </span>
          <span className={`gu ${l.barCaption}`} aria-hidden="true">
            નાના
          </span>
        </button>
        <button
          type="button"
          className={l.barButton}
          onClick={() => save({ size: READER_SIZES[step + 1] })}
          disabled={step >= READER_SIZES.length - 1}
          aria-label="Bigger text · અક્ષર મોટા"
        >
          <span className={`gu ${l.barIcon} ${l.barIconBig}`} aria-hidden="true">
            અ<small>+</small>
          </span>
          <span className={`gu ${l.barCaption}`} aria-hidden="true">
            મોટા
          </span>
        </button>
        <button
          type="button"
          className={l.barButton}
          aria-pressed={settings.bold}
          onClick={() => save({ bold: !settings.bold })}
          aria-label="Bold text · ઘાટા અક્ષર"
        >
          <span className={`gu ${l.barIcon} ${l.barIconBold}`} aria-hidden="true">
            અ
          </span>
          <span className={`gu ${l.barCaption}`} aria-hidden="true">
            ઘાટા
          </span>
        </button>
        <span className={l.srOnly} aria-live="polite">
          {`Text size ${step + 1} of ${READER_SIZES.length}${settings.bold ? ", bold" : ""}`}
        </span>
      </div>

      <div className={l.barGroup}>
        <button
          type="button"
          className={`${l.barButton} ${l.saveButton}`}
          aria-pressed={saved}
          onClick={toggleSaved}
          aria-label={saved ? "Saved · સાચવ્યું (tap to remove)" : "Save my place · સાચવો"}
        >
          <span className={l.barIcon} aria-hidden="true">
            {saved ? "★" : "☆"}
          </span>
          <span className={`gu ${l.barCaption}`} aria-hidden="true">
            {saved ? "સાચવ્યું" : "સાચવો"}
          </span>
        </button>
        <button
          type="button"
          className={l.barButton}
          aria-expanded={open}
          aria-controls="reader-settings"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close · બંધ કરો" : "More reading settings · વધુ"}
        >
          <span className={l.barIcon} aria-hidden="true">
            {open ? (
              "✕"
            ) : (
              <>
                <small>A</small>A
              </>
            )}
          </span>
          <span className={`gu ${l.barCaption}`} aria-hidden="true">
            {open ? "બંધ કરો" : "વધુ"}
          </span>
        </button>
      </div>

      {open && (
        <div id="reader-settings" className={l.panel} role="group" aria-label="Reading settings">
          <div className={l.panelShare}>
            <ShareButton />
          </div>

          <p className={l.panelLabel}>
            Line spacing · <span className="gu">લીટી વચ્ચે અંતર</span>
          </p>
          <div className={l.spacings} role="radiogroup" aria-label="Line spacing">
            {(Object.keys(READER_SPACINGS) as ReaderSpacing[]).map((sp) => (
              <button
                key={sp}
                type="button"
                role="radio"
                aria-checked={settings.spacing === sp}
                className={l.spacingOption}
                onClick={() => save({ spacing: sp })}
              >
                <SpacingIcon gap={SPACING_GAPS[sp]} />
                <span className={l.swatchName}>{SPACING_LABELS[sp]}</span>
              </button>
            ))}
          </div>

          <p className={l.panelLabel}>
            Page colour · <span className="gu">પાનાનો રંગ</span>
          </p>
          <div className={l.themes} role="radiogroup" aria-label="Page colour">
            {READER_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={settings.theme === t}
                className={`${l.swatch} ${l[`swatch_${t}`]}`}
                onClick={() => save({ theme: t })}
              >
                <span className={l.swatchSample}>Aa</span>
                <span className={l.swatchName}>{THEME_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={l.barToastWrap} aria-live="polite">
        {toast && <p className={`gu ${l.barToast}`}>{toast}</p>}
      </div>
    </div>
  );
}
