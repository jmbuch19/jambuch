"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import a from "../../../admin.module.css";

export type ChapterSlot = { id: string; work_id: string; number: number; title: string; trashed: boolean };

// Warns, while you type, when the chosen translation already has a chapter
// with this number (the database allows only one), including chapters in the
// Trash, which still hold their number. Offers the next free number.
export default function ChapterNumberCheck({
  chapters,
  works,
  currentId,
}: {
  chapters: ChapterSlot[];
  works: Record<string, string>;
  currentId: string | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [choice, setChoice] = useState<{ work: string; number: number | null }>({ work: "", number: null });

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const work = (form.elements.namedItem("work_id") as HTMLSelectElement | null)?.value ?? "";
      const raw = (form.elements.namedItem("number") as HTMLInputElement | null)?.value ?? "";
      const n = Number.parseInt(raw, 10);
      setChoice({ work, number: Number.isNaN(n) ? null : n });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, []);

  const others = chapters.filter((c) => c.work_id === choice.work && c.id !== currentId);
  const clash = choice.number == null ? null : others.find((c) => c.number === choice.number);
  const nextFree = Math.max(0, ...others.map((c) => c.number)) + 1;

  function applyNextFree() {
    const input = ref.current?.closest("form")?.elements.namedItem("number") as HTMLInputElement | null;
    if (!input) return;
    input.value = String(nextFree);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <span ref={ref} className={a.slot}>
      {clash && (
        <span className={a.warn} role="alert">
          <span>
            {works[choice.work] ?? "This translation"} already has chapter {clash.number}:{" "}
            <Link href={`/admin/chapters/${clash.id}`} className="gu">
              {clash.title}
            </Link>
            {clash.trashed ? " (in the Trash)." : "."}
          </span>
          <span>
            {clash.trashed
              ? "A chapter in the Trash still holds its number. Restore it, or delete it for good from the Trash, to reuse the number. "
              : "Two chapters can’t share a number. "}
            The next free number is {nextFree}.{" "}
            <button type="button" className={a.linkButton} onClick={applyNextFree}>
              Use {nextFree}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
