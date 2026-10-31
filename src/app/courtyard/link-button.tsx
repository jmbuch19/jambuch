"use client";

import { useState, useTransition } from "react";
import y from "./courtyard.module.css";

// The one button on pages reached from an email link (follow, unfollow): the
// action runs only on a click, never just by opening the link.
export default function LinkButton({
  token,
  run,
  label,
  done,
  failed,
}: {
  token: string;
  run: (token: string) => Promise<{ ok: boolean }>;
  label: string;
  done: string;
  failed: string;
}) {
  const [result, setResult] = useState<"idle" | "ok" | "bad">("idle");
  const [pending, start] = useTransition();

  if (result !== "idle") {
    return (
      <p className={result === "ok" ? y.followDone : y.error} role="status">
        {result === "ok" ? done : failed}
      </p>
    );
  }
  return (
    <button
      type="button"
      className={y.send}
      disabled={pending}
      onClick={() => start(async () => setResult((await run(token)).ok ? "ok" : "bad"))}
    >
      {pending ? "One moment…" : label}
    </button>
  );
}
