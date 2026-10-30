// Courtyard contributions: categories, kinds and fixed wording, shared by the
// public form, the "Shared by visitors" shelf and the admin.

// label: on the shelf and in the admin; formLabel: in the contribute form.
export const CATEGORIES = [
  { value: "writing", label: "Writing & poetry", formLabel: "Writing & poetry" },
  { value: "photography", label: "Photography", formLabel: "Photography" },
  { value: "music", label: "Music", formLabel: "Music" },
  { value: "art", label: "Art & craft", formLabel: "Art & craft" },
  { value: "tech", label: "Tech", formLabel: "Tech — tools, code, how-tos" },
  { value: "education", label: "Education", formLabel: "Education — lessons, notes, guides" },
  { value: "heirlooms", label: "Heirlooms", formLabel: "Heirlooms — family letters, recipes, songs, photographs" },
  { value: "other", label: "Other", formLabel: "Something else" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(value: string | null | undefined) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
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

// Avatar colours in the thread, by category (from the design's tints).
export const CATEGORY_TINT: Record<string, string> = {
  writing: "#F6E7D6",
  photography: "#DCE6E4",
  music: "#E1DFE6",
  art: "#E6E1D3",
  tech: "#D8E2EE",
  education: "#E4ECD8",
  heirlooms: "#EFE3D0",
  other: "#ECE9E1",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "•";
}

export const EDUCATION_NOTE = "Shared by a contributor; not advice from Jaydeep or IAES.";

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
