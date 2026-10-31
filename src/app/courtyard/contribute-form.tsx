"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { shrinkImage } from "@/app/admin/(panel)/[table]/[id]/shrink-image";
import { DOOR_HASH, FORMS, MAX_FILE_BYTES, MAX_THEMES, REPLY_HASH, THEMES, type SubmissionKind } from "@/lib/courtyard";
import { submitContribution, type ContributeState } from "./actions";
import y from "./courtyard.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const DOORS: { kind: SubmissionKind; label: string; send: string; thanks: string }[] = [
  { kind: "single_piece", label: "Share one piece", send: "Send my piece", thanks: "Thank you — your piece is with me." },
  { kind: "room_request", label: "Ask for a room", send: "Ask for a room", thanks: "Thank you — I’ll look at your work and write back." },
  { kind: "suggestion", label: "Suggest a creator", send: "Send suggestion", thanks: "Thank you for thinking of them." },
];

// A contributor's personal link: the form adds the next part to their series.
export type SeriesMode = {
  token: string;
  title: string;
  name: string;
  form: string | null;
  themes: string[];
  nextPart: number;
};

// One form, three doors: a single piece (optionally the first part of a
// series), a room request, or a suggestion. With `series`, it only takes the
// next part of that series.
// threads: the pieces on the public thread, so "Pick up this thread" can name them.
export default function ContributeForm({
  threads = [],
  series,
  contributor,
}: {
  threads?: { id: string; label: string }[];
  series?: SeriesMode;
  contributor?: { token: string; name: string; city: string | null }; // personal "share more" link
}) {
  const [state, action, pending] = useActionState<ContributeState, FormData>(submitContribution, { status: "idle" });
  const [kind, setKind] = useState<SubmissionKind>("single_piece");
  const [threadFrom, setThreadFrom] = useState<string | null>(null);
  const threadLabel = threads.find((t) => t.id === threadFrom)?.label;
  const [sentKind, setSentKind] = useState<SubmissionKind>("single_piece");
  const [sentTo, setSentTo] = useState("");
  const [themes, setThemes] = useState<string[]>(series?.themes ?? []);
  const [startSeries, setStartSeries] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  function renderWidget() {
    if (!window.turnstile || !widgetEl.current || widgetId.current !== null) return;
    widgetId.current = window.turnstile.render(widgetEl.current, {
      sitekey: SITE_KEY,
      action: "courtyard",
      appearance: "interaction-only",
    });
  }
  useEffect(renderWidget, []);

  // A token works only once, so get a fresh one after a failed attempt.
  useEffect(() => {
    if (state.status === "error" && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, [state]);

  // The door cards and links like /courtyard#ask-room open the matching door.
  useEffect(() => {
    if (series) return;
    function fromHash() {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith(REPLY_HASH)) {
        // "Pick up this thread": a single piece that answers an earlier one.
        setKind("single_piece");
        setThreadFrom(hash.slice(REPLY_HASH.length));
      } else {
        const match = (Object.keys(DOOR_HASH) as SubmissionKind[]).find((k) => DOOR_HASH[k] === hash);
        if (!match) return;
        setKind(match);
      }
      formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [series]);

  function toggleTheme(value: string) {
    setThemes((t) => (t.includes(value) ? t.filter((x) => x !== value) : t.length < MAX_THEMES ? [...t, value] : t));
  }

  // Sent by hand so the fields survive an error, and so a photo can be shrunk first.
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFileError(null);
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    if (file instanceof File && file.size > 0) {
      let toSend = file;
      if (file.type.startsWith("image/")) {
        setPreparing(true);
        try {
          toSend = await shrinkImage(file, 2000);
        } catch (err) {
          setFileError((err as Error).message);
          setPreparing(false);
          return;
        }
        setPreparing(false);
      }
      if (toSend.size > MAX_FILE_BYTES) {
        setFileError("That file is over 4 MB. For longer audio or video, please share a link instead.");
        return;
      }
      data.set("file", toSend);
    } else {
      data.delete("file");
    }
    setSentKind(kind);
    setSentTo(String(data.get("email") ?? "").trim());
    startTransition(() => action(data));
  }

  const door = DOORS.find((d) => d.kind === kind)!;
  const piece = kind === "single_piece";
  const room = kind === "room_request";
  const suggestion = kind === "suggestion";

  // Through a personal link it goes straight to Jaydeep.
  if (state.status === "sent" && state.direct && contributor) {
    return (
      <div className={y.formCard}>
        <div className={y.done} role="status">
          <p>Thank you — it’s with me.</p>
          <span>I’ll read it, and once approved it joins the thread at the next gathering.</span>
        </div>
      </div>
    );
  }
  if (state.status === "sent" && state.direct && series) {
    return (
      <div className={y.formCard}>
        <div className={y.done} role="status">
          <p>Thank you — your next part is with me.</p>
          <span>
            I’ll read it, and once approved it joins the thread at the next gathering as part of “{series.title}”.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={formTop} className={y.contributeInner}>
      {!series && !contributor && (
        <div className={y.doorPills} role="tablist" aria-label="What would you like to send?">
          {DOORS.map((d) => (
            <button
              key={d.kind}
              type="button"
              role="tab"
              aria-selected={kind === d.kind}
              onClick={() => setKind(d.kind)}
              disabled={state.status === "sent"}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      <div className={y.formCard}>
        {state.status === "sent" ? (
          // Not done yet: it reaches Jaydeep only after the email link is clicked.
          <div className={y.oneMore} role="status">
            <p className={y.oneMoreKicker}>{DOORS.find((d) => d.kind === sentKind)!.thanks}</p>
            <p className={y.oneMoreTitle}>One more step: check your email</p>
            <ol>
              <li>
                I’ve sent a message to <strong>{sentTo || "your email"}</strong> titled{" "}
                <em>“Please confirm what you sent to the Courtyard”</em>.
              </li>
              <li>
                Open it and tap <strong>“Yes, I sent it”</strong>. Only then does your{" "}
                {sentKind === "single_piece" ? "piece" : sentKind === "room_request" ? "request" : "suggestion"} reach me.
              </li>
            </ol>
            <p className={y.small}>
              The link works for 7 days. Not in your inbox? Check Spam or Promotions. I usually reply within a week.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className={y.form}>
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
              strategy="afterInteractive"
              onLoad={renderWidget}
            />
            <input type="hidden" name="kind" value={kind} />
            {series && <input type="hidden" name="series_token" value={series.token} />}
            {contributor && <input type="hidden" name="contributor_token" value={contributor.token} />}
            {contributor && (
              <p className={y.threadNote}>
                Sharing as <strong>{contributor.name}</strong>
              </p>
            )}
            {series && (
              <p className={y.threadNote}>
                Part {series.nextPart} of <strong>“{series.title}”</strong>, by {series.name}
              </p>
            )}
            {piece && !series && threadFrom && threadLabel && (
              <>
                <input type="hidden" name="thread_from" value={threadFrom} />
                <p className={y.threadNote}>
                  ↳ Picking up the thread from {threadLabel}
                  <button type="button" onClick={() => setThreadFrom(null)}>
                    Start a new thread instead
                  </button>
                </p>
              </>
            )}

            {suggestion && (
              <div className={y.row}>
                <label className={y.field}>
                  Creator’s name
                  <input name="creator_name" maxLength={200} required />
                </label>
                <label className={y.field}>
                  How do you know them?
                  <input name="relation" maxLength={120} />
                </label>
              </div>
            )}

            {!series && !contributor && (
              <div className={y.row}>
                <label className={y.field}>
                  Your name
                  <input name="name" maxLength={200} autoComplete="name" required />
                </label>
                <label className={y.field}>
                  Your email
                  <input name="email" type="email" maxLength={320} autoComplete="email" required />
                </label>
              </div>
            )}

            <div className={y.row}>
              <label className={y.field}>
                {suggestion ? "What do they make?" : "What is it?"}
                <select name="form" defaultValue={series?.form ?? "prose"}>
                  {FORMS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.formLabel}
                    </option>
                  ))}
                </select>
              </label>
              {!suggestion && !series && (
                <label className={y.field}>
                  City <small>optional, shown as “by you, City”</small>
                  <input name="city" maxLength={120} autoComplete="address-level2" defaultValue={contributor?.city ?? ""} />
                </label>
              )}
            </div>

            <fieldset className={y.themes}>
              <legend>
                What is it about? <small>optional, up to {MAX_THEMES}</small>
              </legend>
              <div className={y.themeChips}>
                {THEMES.map((t) => {
                  const on = themes.includes(t.value);
                  const full = !on && themes.length >= MAX_THEMES;
                  return (
                    <label key={t.value} className={on ? `${y.themeChip} ${y.themeOn}` : y.themeChip} aria-disabled={full}>
                      <input
                        type="checkbox"
                        name="themes"
                        value={t.value}
                        checked={on}
                        disabled={full}
                        onChange={() => toggleTheme(t.value)}
                      />
                      {t.label} <span className="gu">{t.gu}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {piece && (
              <>
                <label className={y.field}>
                  Title
                  <input name="title" maxLength={200} required />
                </label>
                <label className={y.field}>
                  Your piece — paste text, or describe what you’re attaching
                  <textarea name="body" rows={series ? 10 : 5} maxLength={20000} />
                </label>
                <div className={y.attachRow}>
                  <label className={y.attach}>
                    Attach a file (photo, audio, PDF)
                    <input
                      name="file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,application/pdf"
                    />
                  </label>
                  <span className={y.small}>up to 4 MB, or paste a link: GitHub, YouTube, Drive</span>
                </div>
                <label className={y.field}>
                  Link <small>optional</small>
                  <input name="links" type="url" inputMode="url" placeholder="https://" />
                </label>
                {!series && (
                  <div className={y.seriesBox}>
                    <label className={y.seriesToggle}>
                      <input
                        type="checkbox"
                        name="series_start"
                        checked={startSeries}
                        onChange={(e) => setStartSeries(e.target.checked)}
                      />
                      <span>
                        <strong>This is the first part of a series.</strong> One subject, more parts to come, e.g.
                        notes on the Upanishads.
                      </span>
                    </label>
                    {startSeries && (
                      <>
                        <label className={y.field}>
                          Name of the series
                          <input name="series_title" maxLength={120} required placeholder="e.g. Notes on the Upanishads" />
                        </label>
                        <label className={y.field}>
                          A line about the series <small>optional</small>
                          <textarea name="series_description" rows={2} maxLength={1000} />
                        </label>
                        <p className={y.small}>
                          Once I approve this first part, I’ll email you a personal link to add each next part.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {room && (
              <>
                <label className={y.field}>
                  A few lines about you and what you make
                  <textarea name="about" rows={4} maxLength={3000} required />
                </label>
                <label className={y.field}>
                  Links to 2–3 samples of your work <small>optional, one per line</small>
                  <textarea name="links" rows={3} maxLength={2000} placeholder={"https://\nhttps://"} />
                </label>
              </>
            )}

            {suggestion && (
              <>
                <label className={y.field}>
                  Why their work deserves readers — and a sample if you have one
                  <textarea name="why" rows={4} maxLength={3000} required />
                </label>
                <label className={y.field}>
                  Their email or WhatsApp number <small>optional</small>
                  <input name="creator_contact" maxLength={320} autoComplete="off" />
                  <small>
                    Only Jaydeep sees this. Nothing is sent to them automatically: if it’s right, I’ll reach out
                    personally and mention you.
                  </small>
                </label>
                <div className={y.ticks}>
                  <label>
                    <input type="checkbox" name="creator_aware" />
                    <span>They know I’m suggesting them.</span>
                  </label>
                </div>
              </>
            )}

            {!suggestion ? (
              <div className={y.ticks}>
                <label>
                  <input type="checkbox" name="own_work" required />
                  <span>This is my own work and I have the right to share it.</span>
                </label>
                <label>
                  <input type="checkbox" name="permission" required />
                  <span>Jaydeep may publish it here under my name, and remove it if he needs to.</span>
                </label>
                <label>
                  <input type="checkbox" name="family_only" />
                  <span>Show it only to my family circle for now. I can make it public later.</span>
                </label>
              </div>
            ) : (
              <p className={y.small}>
                I’ll only contact them with their permission to mention you, and nothing of theirs goes up without their
                own yes.
              </p>
            )}

            <label className={y.honeypot} aria-hidden="true">
              Leave this empty
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div ref={widgetEl} />
            {(fileError || state.status === "error") && (
              <p className={y.error} role="alert">
                {fileError ?? state.message}
              </p>
            )}
            {!series && !contributor && (
              <p className={y.small}>
                After you send, I’ll email you a link to confirm it’s you. It reaches me only once you click it.
              </p>
            )}
            <button type="submit" disabled={pending || preparing} className={y.send}>
              {preparing ? "Preparing photo…" : pending ? "Sending…" : series ? `Send part ${series.nextPart}` : door.send}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
