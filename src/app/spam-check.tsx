"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile for every public form. It usually passes people
// silently, but sometimes (a VPN, strict privacy settings, a new device) it
// asks for a tick on "Verify you are human". The form must wait for it:
// sending before there is a token always fails. So the send button waits,
// the form asks for the tick when Cloudflare wants one, and says plainly when
// a browser blocks the check altogether.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileOptions) => string;
      reset: (id?: string) => void;
    };
  }
}

type TurnstileOptions = {
  sitekey: string;
  action?: string;
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "before-interactive-callback"?: () => void;
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const GIVE_UP_MS = 20000; // no answer at all by then: the browser is blocking Cloudflare

// waiting: checking in the background · tick: Cloudflare wants the box ticked
// ready: a token is in the form · blocked: the check can't run in this browser
export type SpamCheckStatus = "waiting" | "tick" | "ready" | "blocked";

export function useSpamCheck(action: string) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [status, setStatus] = useState<SpamCheckStatus>("waiting");

  // The widget adds a hidden "cf-turnstile-response" input to the form; the
  // server checks the token was issued for this action.
  const render = useCallback(() => {
    if (!window.turnstile || !el.current || id.current !== null) return;
    id.current = window.turnstile.render(el.current, {
      sitekey: SITE_KEY,
      action,
      appearance: "interaction-only",
      callback: () => setStatus("ready"),
      "before-interactive-callback": () => setStatus("tick"),
      "expired-callback": () => setStatus("waiting"),
      "error-callback": () => setStatus("blocked"),
    });
  }, [action]);
  useEffect(render, [render]);

  useEffect(() => {
    if (status !== "waiting") return;
    const t = setTimeout(() => setStatus((s) => (s === "waiting" ? "blocked" : s)), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [status]);

  return {
    el,
    status,
    render,
    blocked: () => setStatus("blocked"),
    // A failed send uses up the token: ask Cloudflare for a new one.
    reset: () => {
      if (id.current === null) return;
      setStatus("waiting");
      window.turnstile?.reset(id.current);
    },
    // The form (and its widget) left the page and will come back: render afresh.
    forget: () => {
      id.current = null;
      setStatus("waiting");
    },
  };
}

export type SpamCheck = ReturnType<typeof useSpamCheck>;

// What the send button says while the check isn't done yet.
export function sendLabel(check: SpamCheck, pending: boolean, label: string) {
  if (pending) return "Sending…";
  if (check.status === "waiting") return "Checking…";
  return label;
}

// The widget itself (Cloudflare's box appears here only when it wants a tick)
// and a word to the visitor when something is needed from them.
export function SpamCheckBox({ check, noteClass }: { check: SpamCheck; noteClass?: string }) {
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={check.render}
        onError={check.blocked}
      />
      <div ref={check.el} />
      {check.status === "tick" && (
        <p className={noteClass} role="status">
          Please tick “Verify you are human”, then send.
        </p>
      )}
      {check.status === "blocked" && (
        <p className={noteClass} role="alert">
          The spam check couldn’t run in this browser. An ad blocker or a strict privacy setting usually causes it:
          allow jambuch.in, or open this page in Chrome or Safari, then reload.
        </p>
      )}
    </>
  );
}
