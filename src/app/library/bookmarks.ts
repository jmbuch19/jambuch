// Places in the books, kept in this browser (no sign-in needed):
// - bookmarks: saved on purpose with ☆ "સાચવો" in the reading bar, one per chapter;
// - positions: where the reader last was, saved every few seconds while
//   reading, one per book. The newest one is what /continue opens.
// A signed-in member's positions are also kept on their account
// (/api/position), so they follow them to any device.

export type Bookmark = {
  path: string; // /library/<work>/<chapter>
  work: string; // work slug, so the book page can find its own
  title: string; // chapter title as shown in the reader
  book?: string; // the book's title, for the homepage button
  para: number; // paragraph index within the chapter text
  at: number; // when it was saved (ms)
};

const KEY = "reader-bookmarks";
const POSITIONS_KEY = "reader-positions";

function read(key: string): Bookmark[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list)
      ? list.filter((b) => b && typeof b.path === "string" && b.path.startsWith("/library/"))
      : [];
  } catch {
    return [];
  }
}

function write(key: string, list: Bookmark[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

export const readBookmarks = () => read(KEY);

export function findBookmark(path: string) {
  return readBookmarks().find((b) => b.path === path) ?? null;
}

export function saveBookmark(b: Bookmark) {
  write(KEY, [b, ...readBookmarks().filter((x) => x.path !== b.path)]);
}

export function removeBookmark(path: string) {
  write(
    KEY,
    readBookmarks().filter((x) => x.path !== path),
  );
}

// Newest first.
export const readPositions = () => read(POSITIONS_KEY).sort((a, b) => b.at - a.at);

export function lastPosition(work?: string) {
  return readPositions().find((p) => !work || p.work === work) ?? null;
}

export function savePosition(p: Bookmark) {
  write(POSITIONS_KEY, [p, ...readPositions().filter((x) => x.work !== p.work)]);
}

// Positions from the member's account join the local ones; newer wins.
export function mergePositions(remote: Bookmark[]) {
  const byWork = new Map(readPositions().map((p) => [p.work, p]));
  for (const r of remote) {
    const mine = byWork.get(r.work);
    if (!mine || r.at > mine.at) byWork.set(r.work, r);
  }
  write(
    POSITIONS_KEY,
    [...byWork.values()].sort((a, b) => b.at - a.at),
  );
}

// Address that opens the chapter at the saved paragraph.
export const bookmarkHref = (b: Bookmark) => (b.para > 0 ? `${b.path}#p-${b.para + 1}` : b.path);

// Only a signed-in visitor carries a Supabase session cookie, so anonymous
// readers never call the account API.
export const signedIn = () => /(?:^|;\s*)sb-[^=]*auth-token/.test(document.cookie);

export async function syncPositions() {
  if (!signedIn()) return;
  try {
    const res = await fetch("/api/position", { cache: "no-store" });
    if (res.ok) mergePositions((await res.json()) as Bookmark[]);
  } catch {}
}

export function sendPosition(p: Bookmark, leaving = false) {
  if (!signedIn()) return;
  const body = JSON.stringify(p);
  if (leaving && navigator.sendBeacon) {
    navigator.sendBeacon("/api/position", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/position", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
    () => {},
  );
}
