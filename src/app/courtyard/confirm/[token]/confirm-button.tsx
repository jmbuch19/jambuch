"use client";

import { useState, useTransition } from "react";
import { confirmSubmission } from "../../actions";
import y from "../../courtyard.module.css";

export default function ConfirmButton({ token }: { token: string }) {
  const [result, setResult] = useState<"idle" | "ok" | "bad">("idle");
  const [pending, start] = useTransition();

  if (result === "ok") {
    return (
      <div className={y.done} role="status">
        <p>Thank you, it’s reached me.</p>
        <span>Nothing is published until I’ve read it. I’ll write to you either way.</span>
      </div>
    );
  }
  if (result === "bad") {
    return (
      <p className={y.error} role="alert">
        This link has already been used or has expired (links work for 7 days). If you still want to send it, please send
        it again from the Courtyard page.
      </p>
    );
  }
  return (
    <button
      type="button"
      className={y.send}
      disabled={pending}
      onClick={() => start(async () => setResult((await confirmSubmission(token)).ok ? "ok" : "bad"))}
    >
      {pending ? "Confirming…" : "Yes, I sent it"}
    </button>
  );
}
