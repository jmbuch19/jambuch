"use client";

import { useEffect } from "react";

const BLOCKED_KEYS = new Set(["c", "x", "a", "s", "p"]);

// Makes copying, saving and printing a chapter take deliberate effort. This
// is a courtesy, not real protection: no web page can stop screenshots or a
// determined person with developer tools. Members' downloads come later
// through their own signed links.
export default function ReadingGuard({ targetId }: { targetId: string }) {
  useEffect(() => {
    const area = document.getElementById(targetId);
    if (!area) return;
    const inArea = (e: Event) => e.target instanceof Node && area.contains(e.target);

    const stop = (e: Event) => {
      if (inArea(e)) e.preventDefault();
    };
    // Copy, cut, select all, save and print shortcuts, anywhere on the page.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && BLOCKED_KEYS.has(e.key.toLowerCase())) e.preventDefault();
    };
    const onCopy = (e: ClipboardEvent) => e.preventDefault();

    area.addEventListener("contextmenu", stop);
    area.addEventListener("dragstart", stop);
    area.addEventListener("selectstart", stop);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("keydown", onKey);
    return () => {
      area.removeEventListener("contextmenu", stop);
      area.removeEventListener("dragstart", stop);
      area.removeEventListener("selectstart", stop);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("keydown", onKey);
    };
  }, [targetId]);

  return null;
}
