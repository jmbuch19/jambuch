"use client";

import { useEffect, useState, type ReactNode } from "react";
import l from "./library.module.css";

const MIN = 16;
const MAX = 28;
const KEY = "reader-font-size";

// Chapter text with A− / A+ controls. The chosen size is remembered in this
// browser for every chapter.
export default function ReaderText({ children }: { children: ReactNode }) {
  const [size, setSize] = useState(20);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (saved >= MIN && saved <= MAX) setSize(saved);
    } catch {}
  }, []);

  function change(delta: number) {
    const next = Math.min(MAX, Math.max(MIN, size + delta));
    setSize(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {}
  }

  return (
    <>
      <div className={l.sizeControls}>
        <button type="button" onClick={() => change(-2)} disabled={size <= MIN} aria-label="Smaller text">
          A−
        </button>
        <button type="button" onClick={() => change(2)} disabled={size >= MAX} aria-label="Larger text" className={l.bigA}>
          A+
        </button>
      </div>
      <article className={`gu ${l.text}`} lang="gu" style={{ fontSize: size }}>
        {children}
      </article>
    </>
  );
}
