"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { nextChapterNumber } from "@/lib/chapter-numbers";
import a from "../../../admin.module.css";

export type ChapterSlot = { id: string; work_id: string; number: number; title: string; trashed: boolean };

// Warns, while you type, when the chosen translation already has a chapter
// with this number (the database allows only one), including chapters in the
// Trash, which still hold their number; and when the number leaves earlier
// chapters missing (typing 9 when only 1–7 exist). Offers the right number.
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
    const workSelect = form.elements.namedItem("work_id") as HTMLSelectElement | null;
    const numberInput = form.elements.namedItem("number") as HTMLInputElement | null;
    // On a new chapter the number follows the chosen book until you type one yourself.
    let typedNumber = false;

    const read = (e?: Event) => {
      if (e?.target === numberInput && e.isTrusted) typedNumber = true;
      if (e?.target === workSelect && currentId === null && !typedNumber && numberInput && workSelect) {
        numberInput.value = String(
          nextChapterNumber(chapters.filter((c) => c.work_id === workSelect.value).map((c) => c.number)),
        );
      }
      const n = Number.parseInt(numberInput?.value ?? "", 10);
      setChoice({ work: workSelect?.value ?? "", number: Number.isNaN(n) ? null : n });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, [chapters, currentId]);

  const others = chapters.filter((c) => c.work_id === choice.work && c.id !== currentId);
  const used = new Set(others.map((c) => c.number));
  const clash = choice.number == null ? null : others.find((c) => c.number === choice.number);
  const nextFree = nextChapterNumber(used);
  // Numbers left out before the one typed (e.g. typing 9 when only 1–7 exist leaves out 8).
  const skipped =
    clash || choice.number == null || choice.number < 1
      ? []
      : Array.from({ length: choice.number - 1 }, (_, i) => i + 1).filter((n) => !used.has(n));

  function applyNextFree() {
    const input = ref.current?.closest("form")?.elements.namedItem("number") as HTMLInputElement | null;
    if (!input) return;
    input.value = String(nextFree);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const useButton = (
    <button type="button" className={a.linkButton} onClick={applyNextFree}>
      Use {nextFree}
    </button>
  );

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
            The next free number is {nextFree}. {useButton}
          </span>
        </span>
      )}
      {skipped.length > 0 && (
        <span className={a.warn} role="alert">
          <span>
            {skipped.length === 1 ? "Chapter" : "Chapters"} {ranges(skipped)} {skipped.length === 1 ? "is" : "are"} missing
            before chapter {choice.number} in {works[choice.work] ?? "this translation"}.
          </span>
          <span>
            The next chapter in order is {nextFree}. {useButton}
          </span>
        </span>
      )}
    </span>
  );
}

// [3, 5, 6, 7] → "3 and 5–7"
function ranges(numbers: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const start = numbers[i];
    while (numbers[i + 1] === numbers[i] + 1) i++;
    parts.push(numbers[i] === start ? String(start) : `${start}–${numbers[i]}`);
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}
