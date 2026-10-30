"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { REPEATABLE_SECTIONS, sectionType } from "@/lib/book-sections";
import { nextChapterNumber } from "@/lib/chapter-numbers";
import a from "../../../admin.module.css";

export type ChapterSlot = {
  id: string;
  work_id: string;
  number: number | null;
  section: string | null;
  title: string;
  trashed: boolean;
};

// Warns, while you type, when the chosen translation already has a chapter
// with this number (the database allows only one), including chapters in the
// Trash, which still hold their number; and when the number leaves earlier
// chapters missing (typing 9 when only 1–7 exist). Offers the right number.
// For a section (preface, glossary...) the number box is switched off and the
// warning is about the book already having that section.
export default function ChapterNumberCheck({
  chapters,
  works,
  currentId,
  currentSection,
}: {
  chapters: ChapterSlot[];
  works: Record<string, string>;
  currentId: string | null;
  currentSection: string | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [choice, setChoice] = useState<{ work: string; number: number | null; section: string }>({
    work: "",
    number: null,
    section: currentSection ?? "",
  });

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const workSelect = form.elements.namedItem("work_id") as HTMLSelectElement | null;
    const sectionSelect = form.elements.namedItem("section") as HTMLSelectElement | null; // only when adding
    const numberInput = form.elements.namedItem("number") as HTMLInputElement | null;
    const titleInput = form.elements.namedItem("title") as HTMLInputElement | null;
    const numbersOf = (work: string) =>
      chapters.filter((c) => c.work_id === work && c.number != null && !c.section).map((c) => c.number as number);
    // On a new chapter the number follows the chosen book until you type one yourself.
    let typedNumber = false;

    const read = (e?: Event) => {
      const section = sectionSelect?.value ?? currentSection ?? "";
      const work = workSelect?.value ?? "";
      if (e?.target === numberInput && e.isTrusted) typedNumber = true;

      if (numberInput) {
        // Sections have no number.
        numberInput.disabled = !!section;
        if (section) numberInput.value = "";
        else if (currentId === null && !typedNumber && (e?.target === workSelect || e?.target === sectionSelect || !numberInput.value)) {
          numberInput.value = String(nextChapterNumber(numbersOf(work)));
        }
      }
      // Choosing a section fills in its usual Gujarati name if no title is typed yet.
      if (e?.target === sectionSelect && titleInput && !titleInput.value.trim()) {
        const type = sectionType(section);
        if (type && !REPEATABLE_SECTIONS.includes(type.key)) titleInput.value = type.gu || type.en;
      }
      const n = Number.parseInt(numberInput?.value ?? "", 10);
      setChoice({ work, number: Number.isNaN(n) ? null : n, section });
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, [chapters, currentId, currentSection]);

  const book = works[choice.work] ?? "This translation";
  const others = chapters.filter((c) => c.work_id === choice.work && c.id !== currentId);

  // A section: warn if the book already has one (except the repeatable "Other" types).
  if (choice.section) {
    const type = sectionType(choice.section);
    const twin = REPEATABLE_SECTIONS.includes(choice.section) ? null : others.find((c) => c.section === choice.section);
    return (
      <span ref={ref} className={a.slot}>
        <small>Sections like this have no chapter number.</small>
        {twin && type && (
          <span className={a.warn} role="alert">
            <span>
              {book} already has a {type.en}:{" "}
              <Link href={`/admin/chapters/${twin.id}`} className="gu">
                {twin.title}
              </Link>
              {twin.trashed ? " (in the Trash)." : "."}
            </span>
            <span>
              A book has only one.
              {twin.trashed ? " Restore it, or delete it for good from the Trash, to add it again." : " Open it to edit it instead."}
            </span>
          </span>
        )}
      </span>
    );
  }

  const numbered = others.filter((c) => c.number != null && !c.section);
  const used = new Set(numbered.map((c) => c.number as number));
  const clash = choice.number == null ? null : numbered.find((c) => c.number === choice.number);
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
            {book} already has chapter {clash.number}:{" "}
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
            before chapter {choice.number} in {book.replace(/^This/, "this")}.
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
