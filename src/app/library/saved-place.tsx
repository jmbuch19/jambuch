"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookmarkHref, readBookmarks, type Bookmark } from "./bookmarks";
import l from "./library.module.css";

// On a book's page: the place the reader last saved with ☆ in this book.
export default function SavedPlace({ work }: { work: string }) {
  const [mark, setMark] = useState<Bookmark | null>(null);

  useEffect(() => {
    // Newest first, so the first one for this book is the latest.
    setMark(readBookmarks().find((b) => b.work === work) ?? null);
  }, [work]);

  if (!mark) return null;
  return (
    <Link href={bookmarkHref(mark)} className={l.savedPlace}>
      <span className={l.savedStar} aria-hidden="true">
        ★
      </span>
      <span>
        <span className={l.savedLabel}>
          Continue where you left off · <span className="gu">જ્યાં અટક્યા ત્યાંથી આગળ</span>
        </span>
        <strong className="gu">{mark.title}</strong>
      </span>
    </Link>
  );
}
