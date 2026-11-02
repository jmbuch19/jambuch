"use client";

import { useMemo, useRef, useState } from "react";
import { PIECE_BYTES, VOICES, type ProductionKey, type VoiceKey } from "@/lib/audio-voices";
import a from "../../admin.module.css";
import s from "./audio.module.css";
import { finishAudioPlay, saveLexicon, saveVoiceChoice, setProductionPaused, uploadAudioPiece } from "./actions";

type VoiceState = { state: "none" | "current" | "outdated"; durationMs: number | null; url: string | null };
type PlayState = { state: "current" | "outdated"; durationMs: number; url: string; spokenUrl: string | null; paused: boolean };
type AudioChapter = {
  id: string;
  label: string;
  title: string;
  characters: number;
  ownRecording: boolean;
  voiceOverride: VoiceKey | null; // null: the book's voice
  voices: Record<VoiceKey, VoiceState>;
  play: PlayState | null; // the uploaded audio play
};
export type AudioBook = { id: string; title: string; voice: VoiceKey; chapters: AudioChapter[] };

// Azure neural voices cost roughly this per million characters (pay-as-you-go
// list price; the free account's credit pays for it first).
const USD_PER_MILLION = 16;

const minutes = (ms: number | null) => (ms ? `${Math.max(1, Math.round(ms / 60000))} min` : "");
const chosen = (b: AudioBook, c: AudioChapter) => c.voiceOverride ?? b.voice;
// Readers hear the audio play instead of Azure.
const playLive = (c: AudioChapter) => c.play?.state === "current" && !c.play.paused;

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
  const [busy, setBusy] = useState<string | null>(null); // chapter being made
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [lexicon, setLexicon] = useState(initialLexicon);
  const [lexiconNote, setLexiconNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ chapterId: string; done: number; total: number } | null>(null);
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const rowNote = (id: string, text: string | null) =>
    setRowNotes((n) => {
      const next = { ...n };
      if (text) next[id] = text;
      else delete next[id];
      return next;
    });

  // Still to make: each chapter in its chosen voice, if missing or out of
  // date. Chapters you recorded yourself, and chapters whose audio play
  // readers hear, are skipped.
  const todo = useMemo(
    () =>
      books.flatMap((b) =>
        b.chapters
          .filter((c) => !c.ownRecording && !playLive(c) && c.voices[chosen(b, c)].state !== "current")
          .map((c) => ({ chapter: c, voice: chosen(b, c) })),
      ),
    [books],
  );
  const todoCharacters = todo.reduce((n, t) => n + t.chapter.characters, 0);

  function update(fn: (b: AudioBook) => AudioBook) {
    setBooks((bs) => bs.map(fn));
  }

  async function make(chapterId: string, voice: VoiceKey) {
    setBusy(chapterId);
    try {
      const res = await fetch("/admin/audio/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, voice }),
      });
      const out = await res.json().catch(() => ({ error: `The server answered ${res.status}.` }));
      if (!res.ok || out.error) throw new Error(out.error ?? `The server answered ${res.status}.`);
      update((b) => ({
        ...b,
        chapters: b.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, voices: { ...c.voices, [voice]: { state: "current", durationMs: out.durationMs, url: out.url } } }
            : c,
        ),
      }));
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

  async function makeOne(chapterId: string, voice: VoiceKey) {
    const why = await make(chapterId, voice);
    if (why) setProgress({ done: 0, total: 0, failed: [why] });
  }

  async function setBookVoice(bookId: string, voice: VoiceKey) {
    update((b) => (b.id === bookId ? { ...b, voice } : b));
    const r = await saveVoiceChoice("book", bookId, voice);
    setNote("error" in r ? r.error : null);
  }

  async function setChapterVoice(bookId: string, chapterId: string, voice: VoiceKey | null) {
    update((b) =>
      b.id === bookId ? { ...b, chapters: b.chapters.map((c) => (c.id === chapterId ? { ...c, voiceOverride: voice } : c)) } : b,
    );
    const r = await saveVoiceChoice("chapter", chapterId, voice);
    setNote("error" in r ? r.error : null);
  }

  function setPlay(chapterId: string, fn: (p: PlayState | null) => PlayState | null) {
    update((b) => ({ ...b, chapters: b.chapters.map((c) => (c.id === chapterId ? { ...c, play: fn(c.play) } : c)) }));
  }

  // Upload: the audio play MP3, its timings file and (optional) the voice-only
  // MP3, chosen together. Each MP3 goes up in pieces, then the site joins them.
  async function uploadPlay(chapterId: string, list: FileList | null) {
    const files = Array.from(list ?? []);
    const json = files.find((f) => /.json$/i.test(f.name));
    const mp3s = files.filter((f) => /.mp3$/i.test(f.name));
    const spoken = mp3s.find((f) => /voice[-_ ]?only|spoken/i.test(f.name));
    const play = mp3s.find((f) => f !== spoken);
    if (!json || !play) {
      rowNote(chapterId, "Choose the audio play MP3 and its timings.json together (the voice-only MP3 too, if there is one).");
      return;
    }
    let timings: Parameters<typeof finishAudioPlay>[1];
    try {
      timings = JSON.parse(await json.text());
    } catch {
      rowNote(chapterId, "The timings file couldn’t be read.");
      return;
    }
    rowNote(chapterId, null);
    const jobs: { kind: ProductionKey; file: File }[] = [{ kind: "play", file: play }];
    if (spoken) jobs.push({ kind: "spoken", file: spoken });
    const total = jobs.reduce((n, j) => n + Math.ceil(j.file.size / PIECE_BYTES), 0);
    let done = 0;
    setUploading({ chapterId, done, total });
    try {
      const uploaded: { kind: ProductionKey; id: string; pieces: number }[] = [];
      for (const j of jobs) {
        const id = crypto.randomUUID();
        const pieces = Math.ceil(j.file.size / PIECE_BYTES);
        for (let i = 0; i < pieces; i++) {
          const form = new FormData();
          form.set("id", id);
          form.set("index", String(i));
          form.set("piece", j.file.slice(i * PIECE_BYTES, (i + 1) * PIECE_BYTES));
          const r = await uploadAudioPiece(form);
          if ("error" in r) throw new Error(r.error);
          setUploading({ chapterId, done: ++done, total });
        }
        uploaded.push({ kind: j.kind, id, pieces });
      }
      const r = await finishAudioPlay(chapterId, timings, uploaded);
      if ("error" in r) throw new Error(r.error);
      const p = r.saved.find((x) => x.kind === "play")!;
      const sp = r.saved.find((x) => x.kind === "spoken");
      setPlay(chapterId, (old) => ({
        state: "current",
        durationMs: p.durationMs,
        url: p.url,
        spokenUrl: sp?.url ?? (spoken ? null : (old?.spokenUrl ?? null)),
        paused: false,
      }));
      rowNote(chapterId, "Saved. Readers now hear the audio play.");
    } catch (e) {
      rowNote(chapterId, (e as Error).message || "The upload didn’t go through. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function setPaused(chapterId: string, paused: boolean) {
    setPlay(chapterId, (p) => (p ? { ...p, paused } : p));
    const r = await setProductionPaused(chapterId, paused);
    if ("error" in r) {
      setPlay(chapterId, (p) => (p ? { ...p, paused: !paused } : p));
      rowNote(chapterId, r.error);
    }
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
        Chapters read aloud by Azure’s Gujarati voices. Choose a voice for each book, and for any chapter that should
        sound different; readers hear only that voice. Each chapter is made once and saved on media.jambuch.in;
        listeners play that file and never use Azure. Chapters with your own recording keep it and are skipped by
        “Make all”.
      </p>
      <p className={a.intro}>
        <strong>Audio plays</strong> (cast, music and sound effects, made with ElevenLabs) are uploaded per chapter:
        choose the audio play MP3, its timings.json and the voice-only MP3 together. Where one is uploaded, readers
        hear it instead of Azure and can switch to voice only; “Use Azure instead” brings the Azure voice back without
        deleting it. If the chapter’s text changes, the audio play shows “Out of date” and readers hear Azure until a new
        one is uploaded.
      </p>
      {error && <p className={a.error}>{error}</p>}
      {note && <p className={a.error}>{note}</p>}
      {!azureReady && (
        <p className={a.error}>Azure isn’t set up here: add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in Vercel.</p>
      )}

      <div className={s.makeAll}>
        <div>
          <strong>
            {todo.length === 0
              ? "Every chapter is made in its voice."
              : `${todo.length} ${todo.length === 1 ? "chapter" : "chapters"} to make`}
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
          <button
            type="button"
            className={a.secondary}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
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
          <div className={s.bookHead}>
            <h2 className="gu">{b.title}</h2>
            <label className={s.voiceSelect}>
              Voice for this book
              <select value={b.voice} onChange={(e) => setBookVoice(b.id, e.target.value as VoiceKey)} disabled={running}>
                {voices.map((v) => (
                  <option key={v} value={v}>
                    {VOICES[v].en} · {VOICES[v].gu}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead>
                <tr>
                  <th>Chapter</th>
                  <th>Voice</th>
                  <th>Recording</th>
                  <th />
                  <th>Audio play</th>
                </tr>
              </thead>
              <tbody>
                {b.chapters.map((c) => {
                  const v = chosen(b, c);
                  const st = c.voices[v];
                  return (
                    <tr key={c.id}>
                      <td className="gu">
                        {c.label} {c.title}
                        {c.ownRecording && <span className={s.own}>Your recording</span>}
                      </td>
                      <td>
                        <label className={s.srOnly} htmlFor={`voice-${c.id}`}>
                          Voice for {c.title}
                        </label>
                        <select
                          id={`voice-${c.id}`}
                          className={s.rowSelect}
                          value={c.voiceOverride ?? ""}
                          onChange={(e) => setChapterVoice(b.id, c.id, (e.target.value || null) as VoiceKey | null)}
                          disabled={running}
                        >
                          <option value="">Book’s voice ({VOICES[b.voice].en})</option>
                          {voices.map((x) => (
                            <option key={x} value={x}>
                              {VOICES[x].en} · {VOICES[x].gu}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {busy === c.id ? (
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
                      <td>
                        <button
                          type="button"
                          className={a.secondary}
                          onClick={() => makeOne(c.id, v)}
                          disabled={!azureReady || !!busy || running}
                        >
                          {st.state === "current" ? "Make again" : "Make"}
                        </button>
                      </td>
                      <td className={s.playCell}>
                        {uploading?.chapterId === c.id ? (
                          <span className={s.working}>
                            Uploading… {uploading.done < uploading.total ? `${Math.round((uploading.done / uploading.total) * 100)}%` : "saving"}
                          </span>
                        ) : c.play ? (
                          <>
                            {c.play.state === "outdated" ? (
                              <span className={s.outdated}>Out of date</span>
                            ) : (
                              <span className={c.play.paused ? s.none : s.current}>
                                {c.play.paused ? "Paused · readers hear Azure" : `✓ ${minutes(c.play.durationMs)}`}
                                <a href={c.play.url} target="_blank" rel="noopener noreferrer" className={s.listen}>
                                  Listen
                                </a>
                                {c.play.spokenUrl && (
                                  <a href={c.play.spokenUrl} target="_blank" rel="noopener noreferrer" className={s.listen}>
                                    Voice only
                                  </a>
                                )}
                              </span>
                            )}
                            {c.play.state === "current" && (
                              <button
                                type="button"
                                className={a.secondary}
                                onClick={() => setPaused(c.id, !c.play!.paused)}
                                disabled={!!uploading}
                              >
                                {c.play.paused ? "Use audio play" : "Use Azure instead"}
                              </button>
                            )}
                          </>
                        ) : null}
                        <label className={`${a.secondary} ${s.uploadButton}`} aria-disabled={!!uploading}>
                          {c.play ? "Upload again" : "Upload"}
                          <input
                            type="file"
                            multiple
                            accept=".mp3,.json,audio/mpeg,application/json"
                            className={s.srOnly}
                            disabled={!!uploading}
                            onChange={(e) => {
                              void uploadPlay(c.id, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {rowNotes[c.id] && <span className={s.rowNote}>{rowNotes[c.id]}</span>}
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
