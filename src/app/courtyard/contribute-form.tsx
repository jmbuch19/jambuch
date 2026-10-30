"use client";

import Script from "next/script";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { shrinkImage } from "@/app/admin/(panel)/[table]/[id]/shrink-image";
import { CATEGORIES, DOOR_HASH, MAX_FILE_BYTES, type SubmissionKind } from "@/lib/courtyard";
import { submitContribution, type ContributeState } from "./actions";
import y from "./courtyard.module.css";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const DOORS: { kind: SubmissionKind; label: string; send: string; thanks: string }[] = [
  { kind: "single_piece", label: "Share one piece", send: "Send my piece", thanks: "Thank you — your piece is with me." },
  { kind: "room_request", label: "Ask for a room", send: "Ask for a room", thanks: "Thank you — I’ll look at your work and write back." },
  { kind: "suggestion", label: "Suggest a creator", send: "Send suggestion", thanks: "Thank you for thinking of them." },
];

// One form, three doors: a single piece, a room request, or a suggestion.
export default function ContributeForm() {
  const [state, action, pending] = useActionState<ContributeState, FormData>(submitContribution, { status: "idle" });
  const [kind, setKind] = useState<SubmissionKind>("single_piece");
  const [sentKind, setSentKind] = useState<SubmissionKind>("single_piece");
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
    function fromHash() {
      const hash = window.location.hash.slice(1);
      const match = (Object.keys(DOOR_HASH) as SubmissionKind[]).find((k) => DOOR_HASH[k] === hash);
      if (!match) return;
      setKind(match);
      formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

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
    startTransition(() => action(data));
  }

  const door = DOORS.find((d) => d.kind === kind)!;
  const piece = kind === "single_piece";
  const room = kind === "room_request";
  const suggestion = kind === "suggestion";

  return (
    <div ref={formTop} className={y.contributeInner}>
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

      <div className={y.formCard}>
        {state.status === "sent" ? (
          <div className={y.done} role="status">
            <p>{DOORS.find((d) => d.kind === sentKind)!.thanks}</p>
            <span>Check your email to confirm it’s you. I usually reply within a week.</span>
          </div>
        ) : (
          <form onSubmit={onSubmit} className={y.form}>
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
              strategy="afterInteractive"
              onLoad={renderWidget}
            />
            <input type="hidden" name="kind" value={kind} />

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

            <div className={y.row}>
              <label className={y.field}>
                Category
                <select name="category" defaultValue="writing">
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.formLabel}
                    </option>
                  ))}
                </select>
              </label>
              {!suggestion && (
                <label className={y.field}>
                  City <small>optional, shown as “by you, City”</small>
                  <input name="city" maxLength={120} autoComplete="address-level2" />
                </label>
              )}
            </div>

            {piece && (
              <>
                <label className={y.field}>
                  Title
                  <input name="title" maxLength={200} required />
                </label>
                <label className={y.field}>
                  Your piece — paste text, or describe what you’re attaching
                  <textarea name="body" rows={5} maxLength={20000} />
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
              <label className={y.field}>
                Why their work deserves readers — and a sample if you have one
                <textarea name="why" rows={4} maxLength={3000} required />
              </label>
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
            <button type="submit" disabled={pending || preparing} className={y.send}>
              {preparing ? "Preparing photo…" : pending ? "Sending…" : door.send}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
