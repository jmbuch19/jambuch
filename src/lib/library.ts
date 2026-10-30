import { bookOrder, entryPath, entrySlug } from "./book-sections";
import { publicClient } from "./supabase";

export type WorkPage = {
  id: string;
  slug: string;
  title: string;
  title_gu: string | null;
  author: string | null;
  description: string | null;
  status_label: string | null;
  readable: boolean;
  cover_url: string | null;
  translator_credit: string | null;
  total_chapters: number | null;
};

// One entry of a book: a numbered chapter, or a section such as the preface
// (section set, number null). See book-sections.ts.
export type Chapter = {
  id: string;
  number: number | null;
  section: string | null;
  legacy_number: number | null;
  title: string;
  title_original: string | null;
  status: "ready" | "drafting" | "later";
  expected: string | null;
};

export type ChapterFull = Chapter & {
  body: string | null;
  translator_note: string | null;
  audio_url: string | null;
  opening_image_url: string | null;
  opening_caption: string | null;
};

const CHAPTER_COLS = "id, number, section, legacy_number, title, title_original, status, expected";

// A work and all its entries, in reading order (before-sections, chapters, after-sections).
export async function loadWork(slug: string): Promise<{ work: WorkPage; chapters: Chapter[] } | null> {
  const db = publicClient();
  const { data: work, error } = await db
    .from("works")
    .select("id, slug, title, title_gu, author, description, status_label, readable, cover_url, translator_credit, total_chapters")
    .eq("slug", slug)
    .maybeSingle<WorkPage>();
  if (error) throw new Error(`Could not load work: ${error.message}`);
  if (!work) return null;

  // Row-level security returns no chapters while the work's rights are pending.
  const { data: chapters, error: chError } = await db
    .from("chapters")
    .select(CHAPTER_COLS)
    .eq("work_id", work.id)
    .returns<Chapter[]>();
  if (chError) throw new Error(`Could not load chapters: ${chError.message}`);
  return { work, chapters: bookOrder(chapters ?? []) };
}

// What a chapter address points to: "chapter-3", "preface", "other-1a2b3c4d",
// or an old number-only address ("3") from before the preface left the numbering.
export type EntryLookup = { found: Awaited<ReturnType<typeof loadEntry>> } | { redirectTo: string } | null;

export async function lookupEntry(workSlug: string, key: string): Promise<EntryLookup> {
  if (/^\d+$/.test(key)) {
    const found = await loadWork(workSlug);
    if (!found) return null;
    const n = Number(key);
    const entry =
      found.chapters.find((c) => c.legacy_number === n) ?? found.chapters.find((c) => c.number === n && !c.section);
    return entry ? { redirectTo: entryPath(workSlug, entry) } : null;
  }
  const found = await loadEntry(workSlug, key);
  return found ? { found } : null;
}

async function loadEntry(workSlug: string, key: string) {
  const found = await loadWork(workSlug);
  if (!found) return null;
  const entry = found.chapters.find((c) => entrySlug(c) === key);
  if (!entry || entry.status !== "ready") return null;

  const { data: chapter, error } = await publicClient()
    .from("chapters")
    .select(`${CHAPTER_COLS}, body, translator_note, audio_url, opening_image_url, opening_caption`)
    .eq("id", entry.id)
    .maybeSingle<ChapterFull>();
  if (error) throw new Error(`Could not load chapter: ${error.message}`);
  if (!chapter) return null;

  const ready = found.chapters.filter((c) => c.status === "ready");
  const i = ready.findIndex((c) => c.id === entry.id);
  const at = found.chapters.findIndex((c) => c.id === entry.id);
  return {
    ...found,
    chapter,
    prev: i > 0 ? ready[i - 1] : null,
    next: i >= 0 && i < ready.length - 1 ? ready[i + 1] : null,
    // The first entry after this one that is still being worked on.
    upcoming: found.chapters.slice(at + 1).find((c) => c.status !== "ready") ?? null,
  };
}

const GU_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
export function guNumber(n: number) {
  return String(n).replace(/\d/g, (d) => GU_DIGITS[Number(d)]);
}

export type Block = { kind: "text" | "quote"; text: string };

// An old-style picture line inside the text. Pictures now have their own
// field and always open the chapter, so these lines are never shown.
const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)$/;

// Chapter text: paragraphs are separated by a blank line; a paragraph that
// starts with "> " is a pulled quote.
export function paragraphs(body: string | null): Block[] {
  return (body ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !IMAGE_LINE.test(p))
    .map((p) => (p.startsWith("> ") ? { kind: "quote", text: p.replace(/^>\s?/gm, "") } : { kind: "text", text: p }));
}

// Rough reading time for a chapter, used to decide when a reader has really
// read it rather than scrolled past (about 120 Gujarati words a minute).
export function readingSeconds(body: string | null) {
  const words = (body ?? "").split(/\s+/).filter(Boolean).length;
  return Math.round((words / 120) * 60);
}
