import { Fragment, type ReactNode } from "react";

// Content uses *asterisks* for book titles. Turn them into <em>; everything
// else stays plain text (no HTML from the database is ever rendered).
export function inline(text: string | null | undefined): ReactNode {
  if (!text) return null;
  return text.split(/\*([^*]+)\*/g).map((part, i) =>
    i % 2 === 1 ? <em key={i}>{part}</em> : <Fragment key={i}>{part}</Fragment>,
  );
}
