"use client";

import { useState, useTransition } from "react";
import { uploadImage } from "../../upload-action";
import type { Show } from "@/lib/podcast";
import { dryRun, publishFeed, saveEpisode, saveShow, type CheckResult } from "./actions";
import a from "../../admin.module.css";

type Episode = {
  chapterId: string;
  guid: string;
  title: string;
  included: boolean;
  description: string;
  firstPublishedAt: string | null;
  hasAudio: boolean;
  audioIssue: string | null;
  minutes: number | null;
};

const COVER_MIN = 1400; // Apple and Spotify: square, 1400–3000 px
const COVER_MAX = 3000;

// Reads an image's size in the browser before it is uploaded.
function imageSize(file: File) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error("That file isn't an image."));
    img.src = url;
  });
}

export default function PodcastPanel({ show: initial, episodes }: { show: Show; episodes: Episode[] }) {
  const [show, setShow] = useState(initial);
  // Take in what the server has saved whenever the page refreshes, so an old form never saves over newer data.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setShow(initial);
  }
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [check, setCheck] = useState<(CheckResult & { published?: string; error?: string }) | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Show) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setShow({ ...show, [k]: e.target.value });

  const run = (fn: () => Promise<{ error?: string } | undefined | void>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r && r.error ? { error: r.error } : { ok });
    });

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") return setMsg({ error: "The cover must be a JPG or PNG." });
    try {
      const { w, h } = await imageSize(file);
      if (w !== h) return setMsg({ error: `The cover must be square (this one is ${w}×${h}).` });
      if (w < COVER_MIN || w > COVER_MAX) return setMsg({ error: `The cover must be ${COVER_MIN}–${COVER_MAX} px wide (this one is ${w}).` });
    } catch (err) {
      return setMsg({ error: (err as Error).message });
    }
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("folder", "podcast");
      const r = await uploadImage(form);
      if (!r.ok) return setMsg({ error: r.error });
      setShow((s) => ({ ...s, coverUrl: r.url }));
      setMsg({ ok: "Cover uploaded. Press “Save show” to keep it." });
    });
  }

  const publishedCount = episodes.filter((e) => e.firstPublishedAt).length;

  return (
    <>
      {msg?.ok && <p className={a.notice}>{msg.ok}</p>}
      {msg?.error && <p className={a.error}>{msg.error}</p>}

      <h2>The show</h2>
      <div className={a.form}>
        <label className={a.field}>
          Title
          <input value={show.title} onChange={set("title")} />
        </label>
        <label className={a.field}>
          Author
          <input value={show.author} onChange={set("author")} />
        </label>
        <label className={a.field}>
          Description
          <textarea rows={4} value={show.description} onChange={set("description")} />
        </label>
        <label className={a.field}>
          Owner email
          <input type="email" value={show.email} onChange={set("email")} />
          <small>Spotify and Apple send the ownership check here. It appears in the feed.</small>
        </label>
        <label className={a.field}>
          Website link
          <input value={show.link} onChange={set("link")} />
        </label>
        <div className={a.field}>
          Cover (square, JPG or PNG, {COVER_MIN}–{COVER_MAX} px)
          {show.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={show.coverUrl} alt="Podcast cover" width={160} height={160} style={{ borderRadius: 8, objectFit: "cover" }} />
          ) : (
            <small>No cover yet. Every episode uses the show cover until it has its own.</small>
          )}
          <input type="file" accept="image/jpeg,image/png" onChange={onCover} disabled={pending} />
        </div>
        <p className={a.mutedSmall}>Category: Religion &amp; Spirituality › Hinduism · Language: Gujarati · Serial · Not explicit</p>
        <div className={a.actions}>
          <button type="button" className={a.primary} disabled={pending} onClick={() => run(() => saveShow(show), "Show saved.")}>
            Save show
          </button>
        </div>
      </div>

      <h2 className={a.gapTop}>Episodes</h2>
      <p className={a.intro}>
        {publishedCount} published so far. A published episode can’t be taken out (podcast apps would lose it); its ID and date never change.
      </p>
      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              <th>In feed</th>
              <th>Episode</th>
              <th>Description</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((e) => (
              <EpisodeRow key={e.chapterId} e={e} pending={pending} run={run} />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={a.gapTop}>Feed</h2>
      <div className={a.actions}>
        <button type="button" className={a.secondary} disabled={pending} onClick={() => start(async () => setCheck(await dryRun()))}>
          Check feed
        </button>{" "}
        <button
          type="button"
          className={a.primary}
          disabled={pending || !check || check.problems.length > 0}
          title={!check ? "Check the feed first" : undefined}
          onClick={() => {
            if (confirm("Publish the feed now? Podcast apps will pick it up within hours.")) start(async () => setCheck(await publishFeed()));
          }}
        >
          Publish
        </button>
      </div>
      {check && (
        <div className={a.gapTop}>
          {check.published && <p className={a.notice}>Published: {check.published}</p>}
          {check.error && <p className={a.error}>{check.error}</p>}
          {check.problems.length > 0 ? (
            <div className={a.warn}>
              <p>
                <strong>{check.problems.length} problem(s) stop publishing:</strong>
              </p>
              <ul>
                {check.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            !check.published && <p className={a.notice}>All checks passed: {check.episodes.length} episodes ready.</p>
          )}
          {check.notes.map((n) => (
            <p key={n} className={a.mutedSmall}>
              {n}
            </p>
          ))}
          {check.episodes.length > 0 && (
            <div className={a.tableWrap}>
              <table className={a.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Episode</th>
                    <th>Bytes</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {check.episodes.map((e) => (
                    <tr key={e.guid}>
                      <td>
                        <code>{e.guid}</code>
                      </td>
                      <td>{e.title}</td>
                      <td>{e.length ? e.length.toLocaleString() : "—"}</td>
                      <td>{e.isNew ? `new (${e.pubDate})` : e.pubDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {check.preview && (
            <details className={a.gapTop}>
              <summary>Feed XML</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 480, overflow: "auto" }}>{check.preview}</pre>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function EpisodeRow({
  e,
  pending,
  run,
}: {
  e: Episode;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string } | undefined | void>, ok: string) => void;
}) {
  const [description, setDescription] = useState(e.description);
  const [seen, setSeen] = useState(e.description);
  if (seen !== e.description) {
    setSeen(e.description);
    setDescription(e.description);
  }
  const locked = !!e.firstPublishedAt; // published episodes stay
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={e.included}
          disabled={pending || locked || (!e.included && !e.hasAudio)}
          title={locked ? "Published episodes stay in the feed" : undefined}
          onChange={(ev) => run(() => saveEpisode(e.chapterId, { included: ev.target.checked }), "Saved.")}
        />
      </td>
      <td>
        {e.title}
        <br />
        <small className={a.mutedSmall}>
          <code>{e.guid}</code>
          {e.minutes != null && ` · ${e.minutes} min`}
          {e.audioIssue && ` · ${e.audioIssue}`}
        </small>
      </td>
      <td style={{ minWidth: 280 }}>
        <textarea
          rows={2}
          style={{ width: "100%" }}
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          onBlur={() => description !== e.description && run(() => saveEpisode(e.chapterId, { description }), "Description saved.")}
        />
      </td>
      <td>{e.firstPublishedAt ? new Date(e.firstPublishedAt).toLocaleDateString("en-IN") : "—"}</td>
    </tr>
  );
}
