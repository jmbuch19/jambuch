"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { resendMyLink, type ContributeState } from "./actions";
import y from "./courtyard.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// "Shared here before? Get your link again." Folded away until opened.
export default function GetLinkForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ContributeState, FormData>(resendMyLink, { status: "idle" });
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  function renderWidget() {
    if (!window.turnstile || !widgetEl.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetEl.current, {
      sitekey: SITE_KEY,
      action: "getlink",
      appearance: "interaction-only",
    });
  }
  useEffect(() => {
    if (open) renderWidget();
  }, [open]);
  useEffect(() => {
    if (state.status === "error" && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <div className={y.getLink}>
      {!open ? (
        <button type="button" className={y.getLinkToggle} onClick={() => setOpen(true)}>
          Shared here before? Get your personal link again →
        </button>
      ) : state.status === "sent" ? (
        <p className={y.followDone} role="status">
          If that address has shared here before, your personal link is on its way. Check your inbox (and Spam).
        </p>
      ) : (
        <form onSubmit={onSubmit} className={y.followForm}>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={renderWidget}
          />
          <label className={y.honeypot} aria-hidden="true">
            Leave this empty
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <input type="email" name="email" required autoComplete="email" placeholder="The email you shared with" aria-label="Your email" />
          <button type="submit" className={y.send} disabled={pending}>
            {pending ? "Sending…" : "Email my link"}
          </button>
          <div ref={widgetEl} />
          {state.status === "error" && (
            <p className={y.error} role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
