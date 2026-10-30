"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPublished } from "../../actions";
import DeleteDialog from "../../delete-dialog";
import a from "../../admin.module.css";

export type ListRow = { id: string; href: string; cells: string[]; published: boolean | null; unread: boolean };

// Admin list with row checkboxes and Hide / Show / Delete for the selection.
export default function ListTable({
  table,
  headers,
  rows,
  canHide,
  canDelete,
}: {
  table: string;
  headers: string[];
  rows: ListRow[];
  canHide: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selectable = canHide || canDelete;
  const ids = rows.map((r) => r.id).filter((id) => picked.has(id));
  const all = rows.length > 0 && ids.length === rows.length;

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function hide(published: boolean, only?: string) {
    setError(null);
    start(async () => {
      const res = await setPublished(table, only ? [only] : ids, published);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      {selectable && (
        <div className={a.bulkBar} aria-live="polite">
          <span>{ids.length ? `${ids.length} selected` : "Tick rows to act on several at once"}</span>
          {canHide && (
            <>
              <button type="button" className={a.secondary} disabled={!ids.length || pending} onClick={() => hide(false)}>
                Hide
              </button>
              <button type="button" className={a.secondary} disabled={!ids.length || pending} onClick={() => hide(true)}>
                Show
              </button>
            </>
          )}
          {canDelete && (
            <DeleteDialog targets={[{ table, ids }]} mode="trash" label="Delete…" className={a.dangerOutline} />
          )}
        </div>
      )}
      {error && <p className={a.error}>{error}</p>}

      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              {selectable && (
                <th className={a.checkCell}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={all}
                    onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
              )}
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th className={a.rowActionsHead}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={[r.unread && a.unread, r.published === false && a.hiddenRow].filter(Boolean).join(" ")}>
                {selectable && (
                  <td className={a.checkCell}>
                    <input type="checkbox" aria-label="Select" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                )}
                {r.cells.map((c, i) => (
                  <td key={i}>
                    {i === 0 ? <Link href={r.href}>{c || "(untitled)"}</Link> : c}
                    {i === 0 && r.published === false && <span className={a.hiddenTag}>Hidden</span>}
                  </td>
                ))}
                <td className={a.rowActions}>
                  <Link href={r.href}>Edit</Link>
                  {canHide && r.published !== null && (
                    <button type="button" className={a.linkButton} disabled={pending} onClick={() => hide(!r.published, r.id)}>
                      {r.published ? "Hide" : "Show"}
                    </button>
                  )}
                  {canDelete && (
                    <DeleteDialog targets={[{ table, ids: [r.id] }]} mode="trash" label="Delete" className={a.linkDanger} />
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 2} className={a.empty}>
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
