"use client";

import { useMemo, useState } from "react";
import type { Book } from "@/lib/content";
import s from "./home.module.css";

export default function LibraryTable({ books }: { books: Book[] }) {
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState("All");

  const shelves = useMemo(() => {
    const set = new Set(books.map((b) => b.shelf).filter((x): x is string => !!x));
    return ["All", ...[...set].sort()];
  }, [books]);

  const needle = q.trim().toLowerCase();
  const shown = books.filter(
    (b) =>
      (shelf === "All" || b.shelf === shelf) &&
      (!needle ||
        b.title.toLowerCase().includes(needle) ||
        (b.author ?? "").toLowerCase().includes(needle)),
  );

  return (
    <>
      <div className={s.libraryControls}>
        <label className={s.searchLabel}>
          Search title or author
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Dostoevsky"
            className={s.searchInput}
          />
        </label>
        {shelves.length > 2 && (
          <div className={s.chips}>
            {shelves.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setShelf(label)}
                aria-pressed={shelf === label}
                className={shelf === label ? `${s.chip} ${s.chipOn}` : s.chip}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Shelf</th>
              <th>Language</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.id}>
                <td className={s.bookTitle}>
                  {b.title}
                  {b.starred && (
                    <span className={s.star} title={b.note ?? undefined}>
                      {" "}★
                    </span>
                  )}
                  {b.starred && b.note && <span className={s.bookNote}>{b.note}</span>}
                </td>
                <td>{b.author}</td>
                <td>{b.shelf}</td>
                <td>{b.language}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.libraryCount}>
        Showing {shown.length} of {books.length} books
      </p>
    </>
  );
}
