"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { joinLetter, type LetterState } from "./courtyard/letter/actions";
import li from "./letter-invite.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const STATE_KEY = "letter.state"; // "joined", or { until: ms } after "Not now"
const VISITS_KEY = "letter.visits";
const QUIET_DAYS = 30;

function readState(): { joined: boolean; until: number } {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw === "joined") return { joined: true, until: 0 };
    const parsed = raw ? (JSON.parse(raw) as { until?: number }) : {};
    return { joined: false, until: parsed.until ?? 0 };
  } catch {
    return { joined: false, until: 0 };
  }
}
function writeState(v: "joined" | { until: number }) {
  try {
    localStorage.setItem(STATE_KEY, v === "joined" ? v : JSON.stringify(v));
  } catch {}
}

// The weekly letter: two fields, Name and Email, confirmed by one email click.
// "inline" sits at the end of a thread, series or chapter. "bar" is the one
// gentle reminder, by the policy: never on a first visit; only after real
// reading (a second visit, or reaching the end of the page after 30 seconds);
// "Not now" quiets it for 30 days; joining quiets it for good.
// "title" and "lede" change the inline wording (e.g. "Tell me when it's
// ready" under an unfinished book); "joinedNote" is shown instead of nothing
// to a reader who already gets the letter.
export default function LetterInvite({
  variant,
  source,
  title,
  lede,
  joinedNote,
}: {
  variant: "inline" | "bar";
  source: string;
  title?: string;
  lede?: string;
  joinedNote?: string;
}) {
  const [show, setShow] = useState(variant === "inline");
  const [hidden, setHidden] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const s = readState();
    if (s.joined) {
      setHidden(true);
      setJoined(true);
      return;
    }
    if (variant === "inline") return;
    if (s.until > Date.now()) return;

    // Count visits once per browser session.
    let visits = 1;
    try {
      if (!sessionStorage.getItem("letter.counted")) {
        visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
        localStorage.setItem(VISITS_KEY, String(visits));
        sessionStorage.setItem("letter.counted", "1");
      } else {
        visits = Number(localStorage.getItem(VISITS_KEY) ?? "1");
      }
    } catch {}

    const started = Date.now();
    const atEnd = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight * 0.9;
    const check = () => {
      const seconds = (Date.now() - started) / 1000;
      if ((visits >= 2 && seconds >= 20) || (seconds >= 30 && atEnd())) {
        setShow(true);
        cleanup();
      }
    };
    const timer = setInterval(check, 5000);
    window.addEventListener("scroll", check, { passive: true });
    function cleanup() {
      clearInterval(timer);
      window.removeEventListener("scroll", check);
    }
    return cleanup;
  }, [variant]);

  if (joined && joinedNote && variant === "inline") {
    return (
      <div className={li.inline}>
        <p className={li.done}>{joinedNote}</p>
      </div>
    );
  }
  if (hidden || !show) return null;

  function notNow() {
    writeState({ until: Date.now() + QUIET_DAYS * 24 * 60 * 60 * 1000 });
    setHidden(true);
  }

  if (variant === "bar") {
    return (
      <div className={li.barWrap} role="complementary" aria-label="The weekly letter">
        <div className={li.bar}>
          <button type="button" className={li.close} onClick={notNow} aria-label="Not now">
            ×
          </button>
          <LetterForm source={source} compact onJoined={() => writeState("joined")} onNotNow={notNow} />
        </div>
      </div>
    );
  }
  return (
    <div className={li.inline}>
      <LetterForm source={source} title={title} lede={lede} onJoined={() => writeState("joined")} />
    </div>
  );
}

function LetterForm({
  source,
  title,
  lede,
  compact = false,
  onJoined,
  onNotNow,
}: {
  source: string;
  title?: string;
  lede?: string;
  compact?: boolean;
  onJoined: () => void;
  onNotNow?: () => void;
}) {
  const [state, action, pending] = useActionState<LetterState, FormData>(joinLetter, { status: "idle" });
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  function renderWidget() {
    if (!window.turnstile || !widgetEl.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetEl.current, {
      sitekey: SITE_KEY,
      action: "letter",
      appearance: "interaction-only",
    });
  }
  useEffect(renderWidget, []);
  useEffect(() => {
    if (state.status === "error" && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    if (state.status === "sent") onJoined();
  }, [state, onJoined]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  if (state.status === "sent") {
    return (
      <p className={li.done} role="status">
        Thank you. Check your email and open the link to confirm. Then the letter comes after each gathering.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={li.form}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <p className={li.title}>{title ?? (compact ? "Enjoying the Courtyard?" : "The weekly letter")}</p>
      <p className={li.lede}>
        {lede ??
          "One email after each gathering, with the pieces that joined that week. No account, nothing else, and one tap to stop."}
      </p>
      <input type="hidden" name="source" value={source} />
      <label className={li.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className={li.fields}>
        <input name="name" required maxLength={200} autoComplete="name" placeholder="Your name" aria-label="Your name" />
        <input
          name="email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          placeholder="Your email"
          aria-label="Your email"
        />
        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send me the letter"}
        </button>
      </div>
      <div ref={widgetEl} />
      {state.status === "error" && (
        <p className={li.error} role="alert">
          {state.message}
        </p>
      )}
      <p className={li.small}>
        Your email is used only for this letter: never shared, never sold.
        {onNotNow && (
          <>
            {" "}
            <button type="button" className={li.notNow} onClick={onNotNow}>
              Not now
            </button>
          </>
        )}
      </p>
    </form>
  );
}
