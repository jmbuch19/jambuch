"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { followSeries, type FollowState } from "../actions";
import y from "../../courtyard.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function FollowForm({ seriesId }: { seriesId: string }) {
  const [state, action, pending] = useActionState<FollowState, FormData>(followSeries, { status: "idle" });
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  function renderWidget() {
    if (!window.turnstile || !widgetEl.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetEl.current, {
      sitekey: SITE_KEY,
      action: "follow",
      appearance: "interaction-only",
    });
  }
  useEffect(renderWidget, []);
  useEffect(() => {
    if (state.status === "error" && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  if (state.status === "sent") {
    return (
      <p className={y.followDone} role="status">
        Almost there: check your email and open the link to confirm. (Not there? Look in Spam or Promotions.)
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={y.followForm}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <input type="hidden" name="series_id" value={seriesId} />
      <label className={y.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <input type="email" name="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" />
      <button type="submit" className={y.send} disabled={pending}>
        {pending ? "Sending…" : "Follow"}
      </button>
      <div ref={widgetEl} />
      {state.status === "error" && (
        <p className={y.error} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
