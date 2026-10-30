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

export type Chapter = {
  id: string;
  number: number;
  title: string;
  title_original: string | null;
  status: "ready" | "drafting" | "later";
  expected: string | null;
};

export type ChapterFull = Chapter & {
  body: string | null;
  translator_note: string | null;
  audio_url: string | null;
};

const CHAPTER_COLS = "id, number, title, title_original, status, expected";

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
    .order("number")
    .returns<Chapter[]>();
  if (chError) throw new Error(`Could not load chapters: ${chError.message}`);
  return { work, chapters: chapters ?? [] };
}

export async function loadChapter(slug: string, number: number) {
  const found = await loadWork(slug);
  if (!found) return null;
  const { data: chapter, error } = await publicClient()
    .from("chapters")
    .select(`${CHAPTER_COLS}, body, translator_note, audio_url`)
    .eq("work_id", found.work.id)
    .eq("number", number)
    .eq("status", "ready")
    .maybeSingle<ChapterFull>();
  if (error) throw new Error(`Could not load chapter: ${error.message}`);
  if (!chapter) return null;

  const ready = found.chapters.filter((c) => c.status === "ready");
  const i = ready.findIndex((c) => c.number === number);
  return {
    ...found,
    chapter,
    prev: i > 0 ? ready[i - 1] : null,
    next: i >= 0 && i < ready.length - 1 ? ready[i + 1] : null,
    // The first chapter after the last ready one, if it's being worked on.
    upcoming: found.chapters.find((c) => c.status !== "ready" && c.number > number) ?? null,
  };
}

const GU_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
export function guNumber(n: number) {
  return String(n).replace(/\d/g, (d) => GU_DIGITS[Number(d)]);
}

export type Block =
  | { kind: "text"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "image"; src: string; caption: string };

const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)$/;

// Only pictures in our own media bucket are shown; any other link is dropped.
function isMediaUrl(src: string) {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return !!base && src.startsWith(`${base}/`);
}

// Chapter text: paragraphs are separated by a blank line; a paragraph that
// starts with "> " is a pulled quote; a paragraph that is only
// ![caption](link) is an image.
export function paragraphs(body: string | null): Block[] {
  return (body ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p): Block[] => {
      const img = p.match(IMAGE_LINE);
      if (img) {
        const caption = img[1].trim() === "Caption" ? "" : img[1].trim();
        return isMediaUrl(img[2]) ? [{ kind: "image", src: img[2], caption }] : [];
      }
      if (p.startsWith("> ")) return [{ kind: "quote", text: p.replace(/^>\s?/gm, "") }];
      return [{ kind: "text", text: p }];
    });
}
