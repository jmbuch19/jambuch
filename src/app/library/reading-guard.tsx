"use client";

import { useEffect } from "react";
import { readerId } from "./reader-id";

type Kind = "copy" | "select_all" | "save" | "print" | "right_click" | "drag" | "screenshot_key";

const SHORTCUTS: Record<string, Kind> = { c: "copy", x: "copy", a: "select_all", s: "save", p: "print" };
const SEND_AFTER_MS = 3_000; // gather a burst of attempts into one note

// Makes copying, saving and printing a chapter take deliberate effort, and
// counts each blocked attempt anonymously for /admin/readers. This is a
// courtesy, not real protection: no web page can stop screenshots or a
// determined person with developer tools. Members' downloads come later
// through their own signed, watermarked links.
export default function ReadingGuard({ targetId, chapterId }: { targetId: string; chapterId: string }) {
  useEffect(() => {
    const area = document.getElementById(targetId);
    if (!area) return;
    // Automated browsers (search bots, test tools) are not counted.
    const counting = !navigator.webdriver;
    const pending = new Map<Kind, number>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function send(useBeacon = false) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending.size === 0) return;
      const body = JSON.stringify({ chapterId, readerId: readerId(), attempts: Object.fromEntries(pending) });
      pending.clear();
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/read", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/read", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
          () => {},
        );
      }
    }
    function note(kind: Kind) {
      if (!counting) return;
      pending.set(kind, (pending.get(kind) ?? 0) + 1);
      timer ??= setTimeout(() => send(), SEND_AFTER_MS);
    }

    const inArea = (e: Event) => e.target instanceof Node && area.contains(e.target);
    const onContextMenu = (e: MouseEvent) => {
      if (!inArea(e)) return;
      e.preventDefault();
      note("right_click");
    };
    const onDrag = (e: DragEvent) => {
      if (!inArea(e)) return;
      e.preventDefault();
      note("drag");
    };
    const onSelectStart = (e: Event) => {
      if (inArea(e)) e.preventDefault();
    };
    // Shortcuts are blocked anywhere on the page; a copy shortcut is counted
    // once here, so the copy event that may follow isn't counted again.
    let shortcutCopy = false;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && SHORTCUTS[key]) {
        e.preventDefault();
        note(SHORTCUTS[key]);
        if (SHORTCUTS[key] === "copy") {
          shortcutCopy = true;
          setTimeout(() => (shortcutCopy = false), 0);
        }
      }
      // Mac screenshot keys (the system usually takes these before the page sees them).
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(key)) note("screenshot_key");
    };
    // Windows' Print Screen key reaches the page only when released.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") note("screenshot_key");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (!shortcutCopy) note("copy");
    };
    // Printing from the browser menu (the shortcut is caught above).
    const onBeforePrint = () => note("print");
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };

    area.addEventListener("contextmenu", onContextMenu);
    area.addEventListener("dragstart", onDrag);
    area.addEventListener("selectstart", onSelectStart);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("beforeprint", onBeforePrint);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      send(true);
      area.removeEventListener("contextmenu", onContextMenu);
      area.removeEventListener("dragstart", onDrag);
      area.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("beforeprint", onBeforePrint);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [targetId, chapterId]);

  return null;
}
