import { publicClient } from "./supabase";

export type SiteText = Record<string, { en: string; gu: string }>;

export type DeskItem = { id: string; text: string; link: string | null };

export type Project = {
  id: string;
  name: string;
  domain: string | null;
  url: string | null;
  status: string | null;
  description: string | null;
  project_group: "mine" | "built_for_others";
};

export type ReadingItem = {
  id: string;
  type: "book" | "article";
  title: string;
  author: string | null;
  why: string | null;
  cover_url: string | null;
  link: string | null;
  is_current: boolean;
};

export type Work = {
  id: string;
  title: string;
  title_gu: string | null;
  description: string | null;
  status_label: string | null;
  link: string | null;
  link_label: string | null;
  upcoming: boolean;
  readable: boolean;
};

export type WorkshopItem = { id: string; kind: string; title: string; stage: string | null };

export type Recording = {
  id: string;
  title: string;
  details: string | null;
  duration: string | null;
  link: string | null;
};

export type NotebookItem = {
  id: string;
  type: "poem" | "photo" | "note";
  title: string | null;
  body: string | null;
  image_url: string | null;
  link: string | null;
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  shelf: string | null;
  language: string | null;
  starred: boolean;
  note: string | null;
};

export type HomeContent = {
  text: SiteText;
  desk: DeskItem[];
  projects: Project[];
  reading: ReadingItem[];
  works: Work[];
  workshop: WorkshopItem[];
  recordings: Recording[];
  notebook: NotebookItem[];
  books: Book[];
};

function unwrap<T>(table: string, res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(`Could not load ${table}: ${res.error.message}`);
  return res.data ?? [];
}

// Supabase returns at most 1,000 rows per request, and the library is about
// that size, so books are read page by page.
async function loadBooks(db: ReturnType<typeof publicClient>): Promise<Book[]> {
  const pageSize = 1000;
  const all: Book[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await db
      .from("books")
      .select("id, title, author, shelf, language, starred, note")
      .order("title")
      .range(from, from + pageSize - 1);
    const rows = unwrap<Book>("books", res);
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}

export async function loadHome(): Promise<HomeContent> {
  const db = publicClient();
  const [text, desk, projects, reading, works, workshop, recordings, notebook, books] = await Promise.all([
    db.from("site_text").select("key, en, gu"),
    db.from("desk_now").select("id, text, link").order("sort_order"),
    db.from("projects").select("id, name, domain, url, status, description, project_group").order("sort_order"),
    db
      .from("reading")
      .select("id, type, title, author, why, cover_url, link, is_current")
      .order("sort_order"),
    db
      .from("works")
      .select("id, title, title_gu, description, status_label, link, link_label, upcoming, readable")
      .order("sort_order"),
    db.from("workshop").select("id, kind, title, stage").order("sort_order"),
    db.from("recordings").select("id, title, details, duration, link").order("sort_order"),
    db.from("notebook").select("id, type, title, body, image_url, link").order("sort_order"),
    loadBooks(db),
  ]);

  const textMap: SiteText = {};
  for (const row of unwrap<{ key: string; en: string; gu: string }>("site_text", text)) {
    textMap[row.key] = { en: row.en, gu: row.gu };
  }

  return {
    text: textMap,
    desk: unwrap("desk_now", desk),
    projects: unwrap("projects", projects),
    reading: unwrap("reading", reading),
    works: unwrap("works", works),
    workshop: unwrap("workshop", workshop),
    recordings: unwrap("recordings", recordings),
    notebook: unwrap("notebook", notebook),
    books,
  };
}
