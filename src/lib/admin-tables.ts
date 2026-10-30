// What the admin can edit, table by table. The editor pages and save action
// only ever touch the columns listed here.

export type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "url" | "int" | "bool" | "select" | "ref";
  options?: { value: string; label: string }[];
  ref?: { table: string; label: string }; // for "ref": pick a row of another table
  rows?: number; // textarea height
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
  checkText?: boolean; // textarea: warn about PDF-pasted Gujarati and missing blank lines
};

export type TableConfig = {
  table: string;
  label: string;
  key: string; // primary key column
  fields: Field[];
  list: string[]; // columns shown in the list
  order: { column: string; ascending: boolean }[];
  canCreate: boolean;
  canDelete: boolean;
  intro?: string;
};

const published: Field = {
  name: "published",
  label: "Published",
  type: "bool",
  hint: "Unticked rows stay hidden from visitors.",
};
const sortOrder: Field = { name: "sort_order", label: "Sort order", type: "int", hint: "Lower numbers come first." };
const byOrder = [{ column: "sort_order", ascending: true }];
const emHint = "Wrap book titles in *asterisks* to show them in italics.";

export const TABLES: TableConfig[] = [
  {
    table: "desk_now",
    label: "On my desk now",
    key: "id",
    fields: [
      { name: "text", label: "Text", type: "textarea", required: true, hint: emHint },
      { name: "link", label: "Link", type: "url" },
      published,
      sortOrder,
    ],
    list: ["text", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "projects",
    label: "Web projects",
    key: "id",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "name_gu", label: "Name in Gujarati", type: "text" },
      { name: "domain", label: "Domain", type: "text", hint: "Shown on the link, e.g. fixmysite.in" },
      { name: "url", label: "URL", type: "url" },
      { name: "status", label: "Status", type: "text", hint: "Short badge, e.g. Live, Phase 1" },
      {
        name: "logo_url",
        label: "Logo",
        type: "text",
        hint: "A file in /logos (e.g. /logos/fixmysite.png) or a full image URL. Empty shows the first letter.",
      },
      { name: "color", label: "Brand colour", type: "text", hint: "Hex, e.g. #0F6E56. Shown as a band on the card." },
      { name: "description", label: "Description", type: "textarea", hint: emHint },
      {
        name: "project_group",
        label: "Group",
        type: "select",
        options: [
          { value: "mine", label: "My platforms" },
          { value: "built_for_others", label: "Built for others" },
        ],
      },
      published,
      sortOrder,
    ],
    list: ["name", "project_group", "status", "published"],
    order: [{ column: "project_group", ascending: true }, ...byOrder],
    canCreate: true,
    canDelete: true,
  },
  {
    table: "reading",
    label: "Reading",
    key: "id",
    intro: "Tick “Currently reading” on one item; the rest show as recommendations.",
    fields: [
      {
        name: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "book", label: "Book" },
          { value: "article", label: "Article" },
        ],
      },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "author", label: "Author or publication", type: "text" },
      { name: "why", label: "Why it matters to me", type: "textarea", hint: emHint },
      { name: "cover_url", label: "Cover image URL", type: "url" },
      { name: "link", label: "Link", type: "url" },
      { name: "is_current", label: "Currently reading", type: "bool" },
      published,
      sortOrder,
    ],
    list: ["title", "type", "is_current", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "works",
    label: "Translations",
    key: "id",
    intro: "The read link only appears once rights are granted or the work is in the public domain.",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "title_gu", label: "Title in Gujarati", type: "text", hint: "Shown instead of the English title when set." },
      { name: "slug", label: "Slug", type: "text", hint: "For its own page later, e.g. chasing-the-monsoon" },
      { name: "author", label: "Original author", type: "text" },
      { name: "description", label: "Description", type: "textarea", hint: emHint },
      { name: "status_label", label: "Status line", type: "text", hint: "Shown when there is no read link." },
      { name: "link", label: "Read link", type: "text" },
      { name: "link_label", label: "Read link text", type: "text" },
      {
        name: "rights_status",
        label: "Rights",
        type: "select",
        options: [
          { value: "permission_pending", label: "Permission pending" },
          { value: "granted", label: "Granted" },
          { value: "public_domain", label: "Public domain" },
        ],
      },
      { name: "upcoming", label: "Next on the shelf", type: "bool", hint: "Shows as a dashed card." },
      published,
      sortOrder,
    ],
    list: ["title", "rights_status", "upcoming", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "chapters",
    label: "Chapters",
    key: "id",
    intro:
      "Visitors can read a chapter only when it’s Ready and its translation’s rights are Granted or Public domain. Leave the text empty while a chapter is still being translated.",
    fields: [
      { name: "work_id", label: "Translation", type: "ref", ref: { table: "works", label: "title" }, required: true },
      { name: "number", label: "Chapter number", type: "int", required: true },
      { name: "title", label: "Title (Gujarati)", type: "text", required: true },
      { name: "title_original", label: "Original title", type: "text" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "ready", label: "Ready to read" },
          { value: "drafting", label: "On the translator’s desk" },
          { value: "later", label: "Still ahead" },
        ],
      },
      { name: "expected", label: "Expected", type: "text", hint: "Shown while drafting, e.g. Expected June" },
      {
        name: "body",
        label: "Chapter text",
        type: "textarea",
        rows: 20,
        hint: "Leave a blank line between paragraphs. Start a paragraph with “> ” to set it as a pulled quote.",
        checkText: true,
      },
      { name: "translator_note", label: "Translator’s note", type: "textarea", checkText: true },
      { name: "audio_url", label: "Read-aloud audio URL", type: "url" },
      published,
    ],
    list: ["number", "title", "work_id", "status", "published"],
    order: [
      { column: "work_id", ascending: true },
      { column: "number", ascending: true },
    ],
    canCreate: true,
    canDelete: true,
  },
  {
    table: "workshop",
    label: "The workshop",
    key: "id",
    fields: [
      { name: "kind", label: "Kind", type: "text", required: true, hint: "Book, Film, Video, Platform…" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "stage", label: "Stage", type: "text" },
      published,
      sortOrder,
    ],
    list: ["title", "kind", "stage", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "recordings",
    label: "Music recordings",
    key: "id",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "details", label: "Details", type: "text", hint: "Raag / genre · where recorded" },
      { name: "duration", label: "Duration", type: "text", hint: "As you want it shown, e.g. 4:32" },
      { name: "link", label: "Link", type: "url", hint: "YouTube, SoundCloud…" },
      published,
      sortOrder,
    ],
    list: ["title", "duration", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "notebook",
    label: "Notebook",
    key: "id",
    fields: [
      {
        name: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "note", label: "Note" },
          { value: "poem", label: "Poem" },
          { value: "photo", label: "Photo" },
        ],
      },
      { name: "title", label: "Title / caption", type: "text" },
      { name: "body", label: "Text", type: "textarea" },
      { name: "image_url", label: "Image URL", type: "url", hint: "For photos." },
      { name: "link", label: "Link", type: "url" },
      published,
      sortOrder,
    ],
    list: ["title", "type", "published"],
    order: byOrder,
    canCreate: true,
    canDelete: true,
  },
  {
    table: "books",
    label: "Library",
    key: "id",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "author", label: "Author", type: "text" },
      { name: "shelf", label: "Shelf", type: "text", hint: "Classics, Philosophy, Gujarati…" },
      { name: "language", label: "Language", type: "text" },
      { name: "year", label: "Year", type: "int" },
      { name: "isbn", label: "ISBN", type: "text" },
      { name: "starred", label: "Starred", type: "bool" },
      { name: "note", label: "Why it stays", type: "textarea", hint: "Shown under starred books." },
      published,
    ],
    list: ["title", "author", "shelf", "starred"],
    order: [{ column: "title", ascending: true }],
    canCreate: true,
    canDelete: true,
  },
  {
    table: "site_text",
    label: "Site text",
    key: "key",
    intro: "Headings, intros and links used across the homepage.",
    fields: [
      { name: "key", label: "Key", type: "text", readOnly: true },
      { name: "en", label: "English", type: "textarea" },
      { name: "gu", label: "Gujarati", type: "textarea" },
    ],
    list: ["key", "en"],
    order: [{ column: "key", ascending: true }],
    canCreate: false,
    canDelete: false,
  },
  {
    table: "ideas",
    label: "Ideas inbox",
    key: "id",
    fields: [
      { name: "created_at", label: "Received", type: "text", readOnly: true },
      { name: "name", label: "Name", type: "text", readOnly: true },
      { name: "email", label: "Email", type: "text", readOnly: true },
      { name: "category", label: "Kind", type: "text", readOnly: true },
      { name: "message", label: "Idea", type: "textarea", readOnly: true },
      { name: "is_read", label: "Read", type: "bool" },
    ],
    list: ["message", "category", "created_at", "is_read"],
    order: [{ column: "created_at", ascending: false }],
    canCreate: false,
    canDelete: true,
  },
];

export function tableConfig(name: string) {
  return TABLES.find((t) => t.table === name);
}

// For deletes and the Trash: which column names an item, which holds its
// thumbnail, and which rows belong to it (they go to the Trash with it).
// Every table with canDelete has deleted_at / deleted_by columns.
export const ITEM_META: Record<
  string,
  { title: string; thumb?: string; children?: { table: string; fk: string }[] }
> = {
  desk_now: { title: "text" },
  projects: { title: "name", thumb: "logo_url" },
  reading: { title: "title", thumb: "cover_url" },
  works: { title: "title", children: [{ table: "chapters", fk: "work_id" }] },
  chapters: { title: "title" },
  workshop: { title: "title" },
  recordings: { title: "title" },
  notebook: { title: "title", thumb: "image_url" },
  books: { title: "title" },
  ideas: { title: "message" },
};

export function hasPublished(cfg: TableConfig) {
  return cfg.fields.some((f) => f.name === "published");
}

// How a value reads in a list cell or a read-only field.
export function formatCell(cfg: TableConfig, column: string, value: unknown, full = false) {
  const field = cfg.fields.find((f) => f.name === column);
  if (field?.type === "bool") return value ? "✓" : "";
  if (field?.type === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value ?? "");
  if (column === "created_at" && typeof value === "string") {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  }
  const text = String(value ?? "");
  return !full && text.length > 90 ? `${text.slice(0, 90)}…` : text;
}
