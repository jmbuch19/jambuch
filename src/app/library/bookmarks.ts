// Saved places ("સાચવો" in the reading bar), kept in this browser only.
// One per chapter: the chapter's address and the paragraph the reader was on.
// Reader accounts don't exist yet; when they do, these can sync to them.

export type Bookmark = {
  path: string; // /library/<work>/<chapter>
  work: string; // work slug, so the book page can find its own
  title: string; // chapter title as shown in the reader
  para: number; // paragraph index within the chapter text
  at: number; // when it was saved (ms)
};

const KEY = "reader-bookmarks";

export function readBookmarks(): Bookmark[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((b) => b && typeof b.path === "string") : [];
  } catch {
    return [];
  }
}

function write(list: Bookmark[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

export function findBookmark(path: string) {
  return readBookmarks().find((b) => b.path === path) ?? null;
}

export function saveBookmark(b: Bookmark) {
  write([b, ...readBookmarks().filter((x) => x.path !== b.path)]);
}

export function removeBookmark(path: string) {
  write(readBookmarks().filter((x) => x.path !== path));
}

// Address that opens the chapter at the saved paragraph.
export const bookmarkHref = (b: Bookmark) => `${b.path}#p-${b.para + 1}`;
