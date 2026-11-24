"use client";

import { useState, useTransition } from "react";
import { listenToSample } from "./actions";
import c from "../creators.module.css";

// The writer's sample: a fresh 15-minute link each time, played on the page, with a
// download link (the sample is watermarked; the full work comes later, paid).
export default function ListenButton({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (url) {
    return (
      <span className={c.sample}>
        <audio controls autoPlay src={url} />
        <a href={url} download="creators-space-sample.mp3">
          Download
        </a>
      </span>
    );
  }
  return (
    <span>
      <button
        type="button"
        className={c.linkButton}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await listenToSample(id);
            if (r.url) setUrl(r.url);
            else setError(r.error ?? "Please try again.");
          })
        }
      >
        {pending ? "Opening…" : "▶ Listen to your sample"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
