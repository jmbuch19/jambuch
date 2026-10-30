"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Preview, Target } from "@/lib/trash";
import { deletePermanently, moveToTrash, previewDelete, type ActionResult } from "./actions";
import a from "./admin.module.css";

// Button + confirmation for "Move to Trash" (mode "trash") and "Delete
// permanently" (mode "purge"). Shows each item's title and thumbnail, what
// goes with it, and any file another item still uses, before anything happens.
export default function DeleteDialog({
  targets,
  mode,
  label,
  className,
  after,
}: {
  targets: Target[];
  mode: "trash" | "purge";
  label: string;
  className?: string;
  after?: string; // where to go when done; refreshes the page when omitted
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const count = targets.reduce((n, t) => n + t.ids.length, 0);

  function open() {
    setInfo(null);
    setError(null);
    dialog.current?.showModal();
    start(async () => {
      try {
        setInfo(await previewDelete(targets, mode));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function confirm() {
    start(async () => {
      const res: ActionResult = mode === "purge" ? await deletePermanently(targets) : await moveToTrash(targets);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      dialog.current?.close();
      if (after) router.push(after);
      else router.refresh();
    });
  }

  const blocked = !!info?.problem;
  const action = mode === "purge" ? "Delete permanently" : "Move to Trash";

  return (
    <>
      <button type="button" onClick={open} disabled={count === 0} className={className ?? a.dangerButton}>
        {label}
      </button>
      <dialog ref={dialog} className={a.dialog} onClose={() => setInfo(null)}>
        <h2>
          {action}: {count} {count === 1 ? "item" : "items"}
        </h2>
        {!info && !error && <p className={a.intro}>Checking what this affects…</p>}
        {info && (
          <>
            <ul className={a.dialogItems}>
              {info.items.map((it) => (
                <li key={`${it.table}:${it.id}`}>
                  {/* Thumbnails can be any image URL the admin pasted. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.thumb ? <img src={it.thumb} alt="" /> : <span className={a.noThumb} />}
                  <span>
                    <strong>{it.title}</strong>
                    <small>{it.label}</small>
                  </span>
                </li>
              ))}
            </ul>
            {info.total > info.items.length && <p className={a.intro}>…and {info.total - info.items.length} more.</p>}
            {info.childCounts.map((c) => (
              <p key={c.label} className={a.notice}>
                {mode === "purge" ? "Also deletes" : "Also moves"} {c.count} {c.label.toLowerCase()} that belong to{" "}
                {count === 1 ? "it" : "them"}.
              </p>
            ))}
            {info.shared.length > 0 && (
              <div className={a.warn}>
                <p>
                  <strong>
                    {info.shared.length === 1 ? "A file here is" : `${info.shared.length} files here are`} also used
                    elsewhere.
                  </strong>{" "}
                  {mode === "purge" ? "They won’t be deleted" : "They stay online"} while these use them:
                </p>
                <ul>
                  {info.shared.map((s) => (
                    <li key={s.url}>
                      <code>{s.url.split("/").pop()}</code>:{" "}
                      {s.usedBy.map((u) => `${u.label} → ${u.title}${u.trashed ? " (in Trash)" : ""}`).join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className={a.intro}>
              {mode === "purge"
                ? `This removes ${count === 1 ? "it" : "them"} and ${info.fileCount ? "their files " : ""}for good. It can’t be undone.`
                : `${count === 1 ? "It" : "They"} leave the site now${info.fileCount ? " and their files go offline" : ""}. You can restore from the Trash for 30 days.`}
            </p>
            {info.problem && <p className={a.error}>Can’t continue: {info.problem}. Nothing was changed.</p>}
          </>
        )}
        {error && (
          <p className={a.error} role="alert">
            {error}
          </p>
        )}
        <div className={a.actions}>
          <button type="button" onClick={confirm} disabled={!info || blocked || pending} className={a.dangerButton}>
            {pending && info ? "Working…" : action}
          </button>
          <button type="button" onClick={() => dialog.current?.close()} className={a.secondary}>
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
