// A random code for this browser, so one reader is counted once per chapter.
// It identifies nothing about the person. Shared by the reading counter and
// the copy/save guard.
const READER_KEY = "reader-id";

export function readerId() {
  try {
    let id = localStorage.getItem(READER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(READER_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
