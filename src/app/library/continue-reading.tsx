"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookmarkHref, lastPosition, readBookmarks, syncPositions, type Bookmark } from "./bookmarks";
import l from "./library.module.css";

// "વાંચન ચાલુ રાખો · Continue reading": at the top of the homepage (newest
// place in any book) and of a book's page (that book only), whenever this
// device or the member's account has one. On a book page, a ☆-saved place
// somewhere else in the book is offered too.
export default function ContinueReading({ work }: { work?: string }) {
  const [place, setPlace] = useState<Bookmark | null>(null);
  const [mark, setMark] = useState<Bookmark | null>(null);

  useEffect(() => {
    const load = () => {
      const p = lastPosition(work);
      setPlace(p);
      const m = work ? (readBookmarks().find((b) => b.work === work) ?? null) : null;
      setMark(m && !(p && m.path === p.path && m.para === p.para) ? m : null);
    };
    load();
    syncPositions().then(load);
  }, [work]);

  if (!place && !mark) return null;
  return (
    <div className={l.continueWrap}>
      {place && (
        <Link href={bookmarkHref(place)} className={l.continueButton}>
          <span className={l.continueLabel}>
            <span className="gu">વાંચન ચાલુ રાખો</span> · Continue reading →
          </span>
          <strong className="gu">
            {place.title}
            {!work && place.book ? <span className={l.continueBook}> · {place.book}</span> : null}
          </strong>
        </Link>
      )}
      {mark && (
        <Link href={bookmarkHref(mark)} className={l.savedPlace}>
          <span className={l.savedStar} aria-hidden="true">
            ★
          </span>
          <span>
            <span className={l.savedLabel}>
              Your saved place · <span className="gu">સાચવેલું સ્થાન</span>
            </span>
            <strong className="gu">{mark.title}</strong>
          </span>
        </Link>
      )}
    </div>
  );
}
