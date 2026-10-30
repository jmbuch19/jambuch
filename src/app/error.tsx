"use client";

import { useEffect } from "react";

// Shown instead of Next.js's bare "Application error" screen. The usual cause
// is a page left open across a deploy: its form then calls a server action
// the new deployment no longer has, and a reload fixes it.
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container" style={{ paddingBlock: "96px", maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 36 }}>This page needs a refresh</h1>
      <p style={{ margin: "0 0 24px", color: "var(--ink-soft)" }}>
        The site was probably updated while you had it open. Reload the page and try again. Anything you typed may need
        to be entered once more.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "var(--ink)",
          color: "#fff",
          border: "none",
          padding: "13px 22px",
          borderRadius: "var(--radius-sm)",
          fontSize: 15,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Reload the page
      </button>
    </main>
  );
}
