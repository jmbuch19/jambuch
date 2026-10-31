// Courtyard contributions: forms, themes, kinds and fixed wording, shared by
// the public form, the thread, series pages and the admin.

// Form: what a piece is (one). label: on cards and in the admin; formLabel:
// in the contribute form.
export const FORMS = [
  { value: "prose", label: "Writing", formLabel: "Writing (prose)" },
  { value: "poetry", label: "Poetry", formLabel: "Poetry" },
  { value: "photography", label: "Photography", formLabel: "Photography" },
  { value: "music", label: "Music", formLabel: "Music & recordings" },
  { value: "video", label: "Video", formLabel: "Video" },
  { value: "art", label: "Art & craft", formLabel: "Art & craft" },
  { value: "tech", label: "Tech", formLabel: "Tech — tools, code, how-tos" },
  { value: "other", label: "Other", formLabel: "Something else" },
] as const;
export type Form = (typeof FORMS)[number]["value"];

// Themes: what a piece is about (up to two).
export const THEMES = [
  { value: "humour", label: "Humour", gu: "હાસ્ય" },
  { value: "nostalgia", label: "Nostalgia & memories", gu: "સંભારણાં" },
  { value: "spirituality", label: "Philosophy & spirituality", gu: "અધ્યાત્મ" },
  { value: "family", label: "Family & heirlooms", gu: "પરિવાર અને વારસો" },
  { value: "childhood", label: "Childhood", gu: "બાળપણ" },
  { value: "nature", label: "Nature, seasons & travel", gu: "પ્રકૃતિ અને પ્રવાસ" },
  { value: "food", label: "Food & recipes", gu: "રસોઈ" },
  { value: "learning", label: "Learning & education", gu: "શિક્ષણ" },
  { value: "society", label: "Society & civic life", gu: "સમાજ" },
  { value: "love", label: "Love & relationships", gu: "પ્રેમ" },
] as const;
export type Theme = (typeof THEMES)[number]["value"];
export const MAX_THEMES = 2;

export function formLabel(value: string | null | undefined) {
  return FORMS.find((f) => f.value === value)?.label ?? "Other";
}
export function themeLabel(value: string) {
  return THEMES.find((t) => t.value === value)?.label ?? value;
}
// "Poetry · Humour · Childhood"
export function kindLine(form: string | null | undefined, themes: string[] | null | undefined) {
  return [formLabel(form), ...(themes ?? []).map(themeLabel)].join(" · ");
}

// Lines shown under pieces on some themes, so readers know whose voice it is.
export const THEME_NOTES: Partial<Record<Theme, string>> = {
  learning: "Shared by a contributor; not advice from Jaydeep or IAES.",
  spirituality: "A contributor’s own reading and reflection.",
};
export function themeNotes(themes: string[] | null | undefined) {
  return (themes ?? []).map((t) => THEME_NOTES[t as Theme]).filter((n): n is string => !!n);
}

export type SubmissionKind = "single_piece" | "room_request" | "suggestion";
export type SubmissionStatus = "unconfirmed" | "new" | "published" | "invited" | "reached_out" | "declined";

export const KIND_LABELS: Record<SubmissionKind, string> = {
  single_piece: "Single piece",
  room_request: "Room request",
  suggestion: "Suggestion",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  unconfirmed: "Email not confirmed",
  new: "New",
  published: "Published",
  invited: "Invited",
  reached_out: "Reached out",
  declined: "Declined",
};

// /courtyard#share-piece etc. open the matching door of the contribute form.
export const DOOR_HASH: Record<SubmissionKind, string> = {
  single_piece: "share-piece",
  room_request: "ask-room",
  suggestion: "suggest-creator",
};

// "Pick up this thread" links: /courtyard#reply-<piece id>.
export const REPLY_HASH = "reply-";

// Avatar colours in the thread, by form (from the design's tints).
export const FORM_TINT: Record<string, string> = {
  prose: "#F6E7D6",
  poetry: "#EFE3D0",
  photography: "#DCE6E4",
  music: "#E1DFE6",
  video: "#E4ECD8",
  art: "#E6E1D3",
  tech: "#D8E2EE",
  other: "#ECE9E1",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "•";
}

// Visitor files: what may be sent, and how big (the request itself is capped
// at 4.5 MB by Vercel; photos are shrunk in the browser first).
export const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Kind words for declining, edited before sending.
export function declineTemplate(s: {
  kind: SubmissionKind;
  name: string;
  title: string | null;
  creator_name: string | null;
}) {
  const first = s.name.split(" ")[0];
  const body =
    s.kind === "single_piece"
      ? `Thank you for sharing “${s.title ?? "your piece"}” with me. I read it with care. It isn’t quite right for the Courtyard just now, but please keep making, and do send me something again.`
      : s.kind === "room_request"
        ? "Thank you for asking for a room in the Courtyard, and for the samples of your work. I can only host a few rooms each year, and I can’t offer one right now. Please keep making, and do send me a single piece any time."
        : `Thank you for telling me about ${s.creator_name ?? "them"}. I’m grateful you thought of the Courtyard. I can’t take this further just now, but I’ve kept your note.`;
  return `Dear ${first},\n\n${body}\n\nWarmly,\nJaydeep`;
}
