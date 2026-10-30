"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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
const DEFAULT_SIZE = 20;

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

type Settings = { size: number; theme: ReaderTheme; spacing: ReaderSpacing };

function apply({ size, theme, spacing }: Settings) {
  const root = document.documentElement;
  root.style.setProperty("--reader-size", `${size}px`);
  root.style.setProperty("--reader-leading", String(READER_SPACINGS[spacing]));
  if (theme === "paper") delete root.dataset.readerTheme;
  else root.dataset.readerTheme = theme;
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

// Chapter text with a Kindle-style "Aa" panel: text size, line spacing and
// page colour. Choices are remembered in this browser for every chapter. The
// inline script in the chapter page applies them before first paint, so
// there is no flash.
export default function ReaderText({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ size: DEFAULT_SIZE, theme: "paper", spacing: "normal" });
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Phones start one step smaller so justified lines hold more words.
    const s: Settings = {
      size: window.matchMedia("(max-width: 600px)").matches ? DEFAULT_SIZE - 2 : DEFAULT_SIZE,
      theme: "paper",
      spacing: "normal",
    };
    try {
      const savedSize = Number(localStorage.getItem(SIZE_KEY));
      if (READER_SIZES.includes(savedSize)) s.size = savedSize;
      const savedTheme = localStorage.getItem(THEME_KEY) as ReaderTheme | null;
      if (savedTheme && READER_THEMES.includes(savedTheme)) s.theme = savedTheme;
      const savedSpacing = localStorage.getItem(SPACING_KEY) as ReaderSpacing | null;
      if (savedSpacing && savedSpacing in READER_SPACINGS) s.spacing = savedSpacing;
    } catch {}
    setSettings(s);
    apply(s);

    // Leaving the reader restores the site's normal colours.
    return () => {
      const root = document.documentElement;
      delete root.dataset.readerTheme;
      root.style.removeProperty("--reader-size");
      root.style.removeProperty("--reader-leading");
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function save(change: Partial<Settings>) {
    const next = { ...settings, ...change };
    setSettings(next);
    apply(next);
    try {
      localStorage.setItem(SIZE_KEY, String(next.size));
      localStorage.setItem(THEME_KEY, next.theme);
      localStorage.setItem(SPACING_KEY, next.spacing);
    } catch {}
  }

  const step = READER_SIZES.indexOf(settings.size);

  return (
    <>
      <div className={l.toolbar} ref={panelRef}>
        <ShareButton />
        <button
          type="button"
          className={l.aaButton}
          aria-expanded={open}
          aria-controls="reader-settings"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">
            <small>A</small>A
          </span>
          <span className={l.srOnly}>Reading settings</span>
        </button>

        {open && (
          <div id="reader-settings" className={l.panel} role="group" aria-label="Reading settings">
            <p className={l.panelLabel}>
              Text size · <span className="gu">અક્ષરનું કદ</span>
            </p>
            <div className={l.sizer}>
              <button
                type="button"
                onClick={() => save({ size: READER_SIZES[step - 1] })}
                disabled={step <= 0}
                aria-label="Smaller text"
              >
                A−
              </button>
              <span className={l.steps} aria-live="polite" aria-label={`Size ${step + 1} of ${READER_SIZES.length}`}>
                {READER_SIZES.map((s, i) => (
                  <i key={s} className={i <= step ? l.stepOn : undefined} />
                ))}
              </span>
              <button
                type="button"
                onClick={() => save({ size: READER_SIZES[step + 1] })}
                disabled={step >= READER_SIZES.length - 1}
                aria-label="Larger text"
                className={l.bigA}
              >
                A+
              </button>
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
      </div>

      <article className={`gu ${l.text}`} lang="gu">
        {children}
      </article>
    </>
  );
}
