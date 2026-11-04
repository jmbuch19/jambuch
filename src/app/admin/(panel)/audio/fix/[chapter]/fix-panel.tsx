"use client";

import { useRef, useState, useTransition } from "react";
import { clock } from "@/lib/admin-stats";
import { addMark, deleteMark, requestRebuild, updateMark, type Fix } from "../actions";
import a from "../../../../admin.module.css";

export type Mark = {
  id: string;
  at_seconds: number;
  note: string;
  fix: Fix | null;
  length: number | null;
  active: boolean;
  anchor: string | null;
  built_at: number | null;
  created_at: string;
};

const FIX_LABELS: Record<Fix, string> = {
  fade_in: "Add fade in",
  fade_out: "Add fade out",
  pause: "Lengthen pause",
  crossfade: "Crossfade",
};
const DEFAULT_LENGTH: Record<Fix, number> = { fade_in: 1, fade_out: 2.5, pause: 0.6, crossfade: 1.5 };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function FixPanel({
  chapterId,
  url,
  marks,
  rebuild,
  uploadedAt,
}: {
  chapterId: string;
  url: string;
  marks: Mark[];
  rebuild: { requested_at: string; built_at: string | null } | null;
  uploadedAt: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState<{ at: number; note: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (job: () => Promise<{ error?: string } | { ok: true }>, ok?: string) =>
    start(async () => {
      const r = await job();
      setMessage("error" in r && r.error ? r.error : (ok ?? null));
    });

  function markHere() {
    const el = audio.current;
    if (!el) return;
    el.pause();
    setDraft({ at: el.currentTime, note: "" });
  }

  // Where to listen from: after a rebuild has been uploaded, the point may have moved.
  const rebuildUploaded = !!rebuild?.built_at && uploadedAt >= rebuild.built_at;
  const pointOf = (m: Mark) => (m.built_at != null && rebuildUploaded ? m.built_at : m.at_seconds);
  function playFrom(seconds: number) {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds - 5);
    el.play().catch(() => {});
  }

  const waiting = rebuild && (!rebuild.built_at || !rebuildUploaded);

  return (
    <>
      <audio ref={audio} controls preload="metadata" src={url} style={{ width: "100%" }} />
      <p>
        <button type="button" className={a.primary} onClick={markHere}>
          Mark a problem here
        </button>
      </p>

      {draft && (
        <form
          className={a.form}
          onSubmit={(e) => {
            e.preventDefault();
            const d = draft;
            run(async () => {
              const r = await addMark(chapterId, d.at, d.note);
              if (!("error" in r)) setDraft(null);
              return r;
            }, "Marked.");
          }}
        >
          <label className={a.field}>
            What’s wrong at {clock(draft.at)}?
            <input
              autoFocus
              value={draft.note}
              placeholder="e.g. fade-out too sudden"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
          <p>
            <button type="submit" className={a.primary} disabled={pending}>
              Save mark
            </button>{" "}
            <button type="button" className={a.linkButton} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </p>
        </form>
      )}

      {message && <p className={a.mutedSmall}>{message}</p>}

      <h2 className={a.readersTitle} style={{ marginTop: 28 }}>
        Marked points <small>{marks.length}</small>
      </h2>
      {marks.length === 0 ? (
        <p className={a.mutedSmall}>Nothing marked yet.</p>
      ) : (
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead>
              <tr>
                <th>At</th>
                <th>Note</th>
                <th>Fix</th>
                <th>Length (s)</th>
                <th>On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {marks.map((m) => (
                <tr key={m.id} style={m.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <button type="button" className={a.linkButton} onClick={() => playFrom(pointOf(m))}>
                      {clock(pointOf(m))} ▶
                    </button>
                    <br />
                    <small className={a.mutedSmall}>plays from 5 s before</small>
                  </td>
                  <td>{m.note || "—"}</td>
                  <td>
                    <select
                      value={m.fix ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        const fix = (e.target.value || null) as Fix | null;
                        run(() => updateMark(chapterId, m.id, { fix, length: fix ? (m.length ?? DEFAULT_LENGTH[fix]) : null }));
                      }}
                    >
                      <option value="">Choose…</option>
                      {(Object.keys(FIX_LABELS) as Fix[]).map((f) => (
                        <option key={f} value={f}>
                          {FIX_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.05}
                      max={20}
                      step={0.05}
                      defaultValue={m.length ?? ""}
                      disabled={!m.fix || pending}
                      style={{ width: 80 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (m.fix && v > 0 && v !== m.length) run(() => updateMark(chapterId, m.id, { length: v }));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.active}
                      disabled={pending}
                      aria-label={m.active ? "Turn this fix off" : "Turn this fix on"}
                      onChange={(e) => run(() => updateMark(chapterId, m.id, { active: e.target.checked }))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={a.linkButton}
                      disabled={pending}
                      onClick={() => window.confirm("Delete this mark?") && run(() => deleteMark(chapterId, m.id))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className={a.listenDetail}>
        <h3>Rebuild episode</h3>
        <p className={a.mutedSmall}>
          The rebuild runs on your PC, where the voice lines are kept: after pressing the button, tell Claude
          “rebuild”. The new audio play, voice-only file and timings.json come out in the chapter’s folder; upload them
          on the Listening page as usual. The earlier versions are kept on the PC.
        </p>
        {rebuild && (
          <p>
            {waiting
              ? rebuild.built_at
                ? `Rebuilt on ${when(rebuild.built_at)}: waiting for the upload.`
                : `Asked for on ${when(rebuild.requested_at)}: not rebuilt yet.`
              : `Last rebuilt on ${when(rebuild.built_at!)} and uploaded.`}
          </p>
        )}
        <button
          type="button"
          className={a.primary}
          disabled={pending}
          onClick={() => run(() => requestRebuild(chapterId), "Rebuild asked for. Tell Claude “rebuild”.")}
        >
          Rebuild episode
        </button>
      </section>
    </>
  );
}
