// The number a book's next chapter should get: the first gap in its
// numbering, else one after the last. ([1,2,4] → 3, [1..7] → 8, [] → 1)
export function nextChapterNumber(used: Iterable<number>) {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}
