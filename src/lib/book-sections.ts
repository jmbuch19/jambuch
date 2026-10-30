// The parts of a book outside the numbered chapters (preface, glossary...).
// Their order is fixed here, in standard book order, so it never has to be
// arranged by hand. Keys are stored in chapters.section; the list must match
// the check constraint in the database.

export type SectionPart = "before" | "after";
export type SectionType = { key: string; part: SectionPart; en: string; gu: string };

export const SECTION_TYPES: SectionType[] = [
  { key: "dedication", part: "before", en: "Dedication", gu: "અર્પણ" },
  { key: "foreword", part: "before", en: "Foreword", gu: "આમુખ" },
  { key: "preface", part: "before", en: "Preface", gu: "પ્રસ્તાવના" },
  { key: "acknowledgements", part: "before", en: "Acknowledgements", gu: "ઋણસ્વીકાર" },
  { key: "introduction", part: "before", en: "Introduction", gu: "ભૂમિકા" },
  { key: "translators_note", part: "before", en: "Translator’s note", gu: "અનુવાદકની નોંધ" },
  { key: "prologue", part: "before", en: "Prologue", gu: "પૂર્વકથા" },
  { key: "other_before", part: "before", en: "Other (before the chapters)", gu: "" },
  { key: "afterword", part: "after", en: "Afterword", gu: "ઉપસંહાર" },
  { key: "notes", part: "after", en: "Notes", gu: "ટિપ્પણી" },
  { key: "glossary", part: "after", en: "Glossary", gu: "શબ્દસૂચિ" },
  { key: "appendix", part: "after", en: "Appendix", gu: "પરિશિષ્ટ" },
  { key: "bibliography", part: "after", en: "Bibliography", gu: "સંદર્ભસૂચિ" },
  { key: "about_author", part: "after", en: "About the author", gu: "લેખક પરિચય" },
  { key: "about_translator", part: "after", en: "About the translator", gu: "અનુવાદક પરિચય" },
  { key: "other_after", part: "after", en: "Other (after the chapters)", gu: "" },
];

// "Other" sections may appear more than once; every other type once per book.
export const REPEATABLE_SECTIONS = ["other_before", "other_after"];

export const sectionType = (key: string | null | undefined) => SECTION_TYPES.find((t) => t.key === key) ?? null;

type Entry = { id: string; number: number | null; section: string | null };

// Whole-book reading order: before-sections, chapters 1…n, after-sections.
export function bookOrder<T extends Entry>(entries: T[]): T[] {
  const rank = (e: T) => {
    if (e.section) {
      const i = SECTION_TYPES.findIndex((t) => t.key === e.section);
      const part = SECTION_TYPES[i]?.part;
      return [part === "after" ? 2 : 0, i];
    }
    return [1, e.number ?? 0];
  };
  return [...entries].sort((x, y) => {
    const [a1, a2] = rank(x);
    const [b1, b2] = rank(y);
    return a1 - b1 || a2 - b2 || x.id.localeCompare(y.id);
  });
}

// The last part of an entry's web address: chapter-3, preface, other-1a2b3c4d.
export function entrySlug(e: Entry) {
  if (!e.section) return `chapter-${e.number}`;
  return REPEATABLE_SECTIONS.includes(e.section) ? `other-${e.id.slice(0, 8)}` : e.section.replace(/_/g, "-");
}

export function entryPath(workSlug: string, e: Entry) {
  return `/library/${workSlug}/${entrySlug(e)}`;
}

// Short label: "Chapter 3" or "Preface".
export function entryLabel(e: Entry) {
  return e.section ? (sectionType(e.section)?.en.replace(/ \((before|after) the chapters\)$/, "") ?? "Section") : `Chapter ${e.number}`;
}
