"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { READER_SIZES, READER_THEMES, type ReaderTheme } from "./reader-settings";
import l from "./library.module.css";

const SIZE_KEY = "reader-font-size";
const THEME_KEY = "reader-theme";
const DEFAULT_SIZE = 20;

const THEME_LABELS: Record<ReaderTheme, string> = {
  paper: "Paper",
  white: "White",
  sepia: "Sepia",
  night: "Night",
};

function apply(size: number, theme: ReaderTheme) {
  const root = document.documentElement;
  root.style.setProperty("--reader-size", `${size}px`);
  if (theme === "paper") delete root.dataset.readerTheme;
  else root.dataset.readerTheme = theme;
}

// Chapter text with a Kindle-style "Aa" panel: text size and page colour.
// Choices are remembered in this browser for every chapter. The inline script
// in the chapter page applies them before first paint, so there is no flash.
export default function ReaderText({ children }: { children: ReactNode }) {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [theme, setTheme] = useState<ReaderTheme>("paper");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Phones start one step smaller so justified lines hold more words.
    let s = window.matchMedia("(max-width: 600px)").matches ? DEFAULT_SIZE - 2 : DEFAULT_SIZE;
    let t: ReaderTheme = "paper";
    try {
      const savedSize = Number(localStorage.getItem(SIZE_KEY));
      if (READER_SIZES.includes(savedSize)) s = savedSize;
      const savedTheme = localStorage.getItem(THEME_KEY) as ReaderTheme | null;
      if (savedTheme && READER_THEMES.includes(savedTheme)) t = savedTheme;
    } catch {}
    setSize(s);
    setTheme(t);
    apply(s, t);

    // Leaving the reader restores the site's normal colours.
    return () => {
      const root = document.documentElement;
      delete root.dataset.readerTheme;
      root.style.removeProperty("--reader-size");
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

  function save(nextSize: number, nextTheme: ReaderTheme) {
    setSize(nextSize);
    setTheme(nextTheme);
    apply(nextSize, nextTheme);
    try {
      localStorage.setItem(SIZE_KEY, String(nextSize));
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {}
  }

  const step = READER_SIZES.indexOf(size);

  return (
    <>
      <div className={l.toolbar} ref={panelRef}>
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
                onClick={() => save(READER_SIZES[step - 1], theme)}
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
                onClick={() => save(READER_SIZES[step + 1], theme)}
                disabled={step >= READER_SIZES.length - 1}
                aria-label="Larger text"
                className={l.bigA}
              >
                A+
              </button>
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
                  aria-checked={theme === t}
                  className={`${l.swatch} ${l[`swatch_${t}`]}`}
                  onClick={() => save(size, t)}
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
