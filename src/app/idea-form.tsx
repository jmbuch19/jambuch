"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { submitIdea, type IdeaState } from "./ideas-action";
import s from "./home.module.css";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string }) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function IdeaForm() {
  const [state, action, pending] = useActionState<IdeaState, FormData>(submitIdea, { status: "idle" });
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  // The widget adds a hidden "cf-turnstile-response" input to the form.
  function renderWidget() {
    if (!window.turnstile || !widgetEl.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetEl.current, { sitekey: SITE_KEY });
  }

  useEffect(renderWidget, []);

  // Submitted by hand rather than <form action>, because React clears a form
  // after an action and the visitor would lose their text if a check failed.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  // A token works only once, so get a fresh one after a failed attempt.
  useEffect(() => {
    if (state.status === "error" && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className={s.ideaSent} role="status">
        <p>Thank you — it’s in the notebook.</p>
        <span>I read every idea myself.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={s.ideaForm}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div className={s.fieldRow}>
        <label className={s.field}>
          Your name
          <input type="text" name="name" maxLength={200} autoComplete="name" />
        </label>
        <label className={s.field}>
          Email (optional)
          <input type="email" name="email" maxLength={320} autoComplete="email" />
        </label>
      </div>
      <label className={s.field}>
        What kind of idea?
        <select name="category" defaultValue="book_to_translate">
          <option value="book_to_translate">A book to translate</option>
          <option value="app">An app or website</option>
          <option value="civic">A civic or social idea</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label className={s.field}>
        Your idea
        <textarea name="message" rows={4} required maxLength={5000} />
      </label>
      <label className={s.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div ref={widgetEl} />
      {state.status === "error" && (
        <p className={s.ideaError} role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={s.ideaSend}>
        {pending ? "Sending…" : "Send idea"}
      </button>
    </form>
  );
}
