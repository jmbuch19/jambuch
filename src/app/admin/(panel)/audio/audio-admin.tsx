"use client";

import { useMemo, useRef, useState } from "react";
import { VOICES, type VoiceKey } from "@/lib/audio-voices";
import a from "../../admin.module.css";
import s from "./audio.module.css";
import { saveLexicon } from "./actions";

type VoiceState = { state: "none" | "current" | "outdated"; durationMs: number | null; url: string | null };
export type AudioBook = {
  id: string;
  title: string;
  chapters: {
    id: string;
    label: string;
    title: string;
    characters: number;
    ownRecording: boolean;
    voices: Record<VoiceKey, VoiceState>;
  }[];
};

// Azure neural voices cost roughly this per million characters (pay-as-you-go
// list price; the free account's credit pays for it first).
const USD_PER_MILLION = 16;

const minutes = (ms: number | null) => (ms ? `${Math.max(1, Math.round(ms / 60000))} min` : "");

export default function AudioAdmin({
  books: initial,
  azureReady,
  lexicon: initialLexicon,
  voices,
  error,
}: {
  books: AudioBook[];
  azureReady: boolean;
  lexicon: string;
  voices: VoiceKey[];
  error: string | null;
}) {
  const [books, setBooks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null); // "chapterId:voice" being made
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [lexicon, setLexicon] = useState(initialLexicon);
  const [lexiconNote, setLexiconNote] = useState<string | null>(null);

  // Everything still to make: missing or out of date, skipping chapters you recorded yourself.
  const todo = useMemo(
    () =>
      books.flatMap((b) =>
        b.chapters
          .filter((c) => !c.ownRecording)
          .flatMap((c) => voices.filter((v) => c.voices[v].state !== "current").map((v) => ({ book: b, chapter: c, voice: v }))),
      ),
    [books, voices],
  );
  const todoCharacters = todo.reduce((n, t) => n + t.chapter.characters, 0);

  function mark(chapterId: string, voice: VoiceKey, v: VoiceState) {
    setBooks((bs) =>
      bs.map((b) => ({
        ...b,
        chapters: b.chapters.map((c) => (c.id === chapterId ? { ...c, voices: { ...c.voices, [voice]: v } } : c)),
      })),
    );
  }

  async function make(chapterId: string, voice: VoiceKey) {
    setBusy(`${chapterId}:${voice}`);
    try {
      const res = await fetch("/admin/audio/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, voice }),
      });
      const out = await res.json().catch(() => ({ error: `The server answered ${res.status}.` }));
      if (!res.ok || out.error) throw new Error(out.error ?? `The server answered ${res.status}.`);
      mark(chapterId, voice, { state: "current", durationMs: out.durationMs, url: out.url });
      return null;
    } catch (e) {
      return (e as Error).message;
    } finally {
      setBusy(null);
    }
  }

  async function makeAll() {
    stop.current = false;
    setStopping(false);
    const queue = todo;
    const failed: string[] = [];
    setProgress({ done: 0, total: queue.length, failed });
    for (let i = 0; i < queue.length && !stop.current; i++) {
      const t = queue[i];
      const why = await make(t.chapter.id, t.voice);
      if (why) failed.push(`${t.chapter.label} ${t.chapter.title} (${VOICES[t.voice].en}): ${why}`);
      setProgress({ done: i + 1, total: queue.length, failed: [...failed] });
    }
  }

  async function makeOne(chapterId: string) {
    const failed: string[] = [];
    for (const v of voices) {
      const why = await make(chapterId, v);
      if (why) failed.push(`${VOICES[v].en}: ${why}`);
    }
    if (failed.length) setProgress({ done: 0, total: 0, failed });
  }

  async function onSaveLexicon() {
    setLexiconNote("Saving…");
    const r = await saveLexicon(lexicon);
    setLexiconNote("error" in r ? r.error : `Saved ${r.count} ${r.count === 1 ? "fix" : "fixes"}. Reloading to show which chapters need making again…`);
    if (!("error" in r)) window.location.reload();
  }

  const running = progress !== null && progress.done < progress.total && !stopping;

  return (
    <>
      <h1 className={a.title}>Listening</h1>
      <p className={a.intro}>
        Chapters read aloud by Azure’s Gujarati voices, {voices.map((v) => VOICES[v].en).join(" and ")}. Each chapter is
        made once per voice and saved on media.jambuch.in; listeners play that file and never use Azure. Chapters with
        your own recording keep it and are skipped by “Make all”.
      </p>
      {error && <p className={a.error}>{error}</p>}
      {!azureReady && (
        <p className={a.error}>Azure isn’t set up here: add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in Vercel.</p>
      )}

      <div className={s.makeAll}>
        <div>
          <strong>
            {todo.length === 0
              ? "Every chapter is made in every voice."
              : `${todo.length} ${todo.length === 1 ? "recording" : "recordings"} to make`}
          </strong>
          {todo.length > 0 && (
            <span className={a.mutedSmall}>
              {" "}
              · about {todoCharacters.toLocaleString("en-IN")} characters, roughly $
              {Math.max(0.01, (todoCharacters / 1e6) * USD_PER_MILLION).toFixed(2)} of Azure credit
            </span>
          )}
        </div>
        {running ? (
          <button type="button" className={a.secondary} onClick={() => {
              stop.current = true;
              setStopping(true);
            }}>
            Stop after this one
          </button>
        ) : (
          <button type="button" className={a.primary} onClick={makeAll} disabled={!azureReady || todo.length === 0 || !!busy}>
            Make all missing and out of date
          </button>
        )}
      </div>
      {progress && progress.total > 0 && (
        <div className={s.progress} role="status">
          <div className={s.bar}>
            <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span>
            {progress.done} of {progress.total} made
            {running && busy ? " · working…" : ""}
            {!running && progress.done < progress.total ? " · stopped" : ""}
          </span>
        </div>
      )}
      {progress && progress.failed.length > 0 && (
        <div className={a.error}>
          <p>These didn’t work:</p>
          <ul>
            {progress.failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {books.map((b) => (
        <section key={b.id} className={s.book}>
          <h2 className="gu">{b.title}</h2>
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead>
                <tr>
                  <th>Chapter</th>
                  {voices.map((v) => (
                    <th key={v}>
                      {VOICES[v].en} · <span className="gu">{VOICES[v].gu}</span>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.chapters.map((c) => {
                  const needs = voices.some((v) => c.voices[v].state !== "current");
                  return (
                    <tr key={c.id}>
                      <td className="gu">
                        {c.label} {c.title}
                        {c.ownRecording && <span className={s.own}>Your recording</span>}
                      </td>
                      {voices.map((v) => {
                        const st = c.voices[v];
                        const working = busy === `${c.id}:${v}`;
                        return (
                          <td key={v}>
                            {working ? (
                              <span className={s.working}>Making…</span>
                            ) : st.state === "current" ? (
                              <span className={s.current}>
                                ✓ {minutes(st.durationMs)}
                                {st.url && (
                                  <a href={st.url} target="_blank" rel="noopener noreferrer" className={s.listen}>
                                    Listen
                                  </a>
                                )}
                              </span>
                            ) : st.state === "outdated" ? (
                              <span className={s.outdated}>Out of date</span>
                            ) : (
                              <span className={s.none}>Not made</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <button
                          type="button"
                          className={a.secondary}
                          onClick={() => makeOne(c.id)}
                          disabled={!azureReady || !!busy || running}
                        >
                          {needs ? "Make" : "Make again"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className={s.book}>
        <h2>Pronunciation fixes</h2>
        <p className={a.intro}>
          When a voice says a word wrong, write the word, an equals sign, and how it should be said, one per line (for
          example <span className="gu">ઋષિ = રુષિ</span>). Every chapter containing a changed word shows “Out of date”;
          make those again.
        </p>
        <label htmlFor="lexicon" className={s.srOnly}>
          Pronunciation fixes
        </label>
        <textarea
          id="lexicon"
          className={`gu ${s.lexicon}`}
          rows={8}
          value={lexicon}
          onChange={(e) => setLexicon(e.target.value)}
          placeholder="ઋષિ = રુષિ"
        />
        <div className={s.lexiconRow}>
          <button type="button" className={a.primary} onClick={onSaveLexicon}>
            Save fixes
          </button>
          {lexiconNote && <span className={a.mutedSmall}>{lexiconNote}</span>}
        </div>
      </section>
    </>
  );
}
