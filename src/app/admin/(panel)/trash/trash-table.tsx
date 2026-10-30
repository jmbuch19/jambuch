"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Target } from "@/lib/trash";
import { restoreFromTrash } from "../../actions";
import DeleteDialog from "../../delete-dialog";
import a from "../../admin.module.css";

export type TrashRow = {
  table: string;
  label: string;
  id: string;
  title: string;
  thumb: string | null;
  deletedAt: string;
  daysLeft: number;
  extra: string | null; // e.g. "with 12 chapters"
};

const tag = (r: { table: string; id: string }) => `${r.table}:${r.id}`;

function group(rows: TrashRow[]): Target[] {
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.table, [...(map.get(r.table) ?? []), r.id]);
  return [...map].map(([table, ids]) => ({ table, ids }));
}

export default function TrashTable({ rows }: { rows: TrashRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = rows.filter((r) => picked.has(tag(r)));
  const all = rows.length > 0 && chosen.length === rows.length;

  function toggle(r: TrashRow) {
    const next = new Set(picked);
    if (next.has(tag(r))) next.delete(tag(r));
    else next.add(tag(r));
    setPicked(next);
  }

  function restore(list: TrashRow[]) {
    setError(null);
    start(async () => {
      const res = await restoreFromTrash(group(list));
      if (!res.ok) setError(res.error);
      else {
        setPicked(new Set());
        router.refresh();
      }
    });
  }

  if (rows.length === 0) return <p className={a.intro}>The Trash is empty.</p>;

  return (
    <>
      <div className={a.bulkBar} aria-live="polite">
        <span>{chosen.length ? `${chosen.length} selected` : "Tick items to act on several at once"}</span>
        <button type="button" className={a.secondary} disabled={!chosen.length || pending} onClick={() => restore(chosen)}>
          Restore
        </button>
        <DeleteDialog targets={group(chosen)} mode="purge" label="Delete permanently…" className={a.dangerOutline} />
      </div>
      {error && <p className={a.error}>{error}</p>}

      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              <th className={a.checkCell}>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={all}
                  onChange={() => setPicked(all ? new Set() : new Set(rows.map(tag)))}
                />
              </th>
              <th>Item</th>
              <th>From</th>
              <th>Deleted</th>
              <th>Removed for good in</th>
              <th className={a.rowActionsHead}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={tag(r)}>
                <td className={a.checkCell}>
                  <input type="checkbox" aria-label="Select" checked={picked.has(tag(r))} onChange={() => toggle(r)} />
                </td>
                <td>
                  <div className={a.itemCell}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.thumb ? <img src={r.thumb} alt="" /> : <span className={a.noThumb} />}
                    <span>
                      {r.title}
                      {r.extra && <small>{r.extra}</small>}
                    </span>
                  </div>
                </td>
                <td>{r.label}</td>
                <td>{new Date(r.deletedAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</td>
                <td>{r.daysLeft <= 0 ? "Today" : `${r.daysLeft} ${r.daysLeft === 1 ? "day" : "days"}`}</td>
                <td className={a.rowActions}>
                  <button type="button" className={a.linkButton} disabled={pending} onClick={() => restore([r])}>
                    Restore
                  </button>
                  <DeleteDialog
                    targets={[{ table: r.table, ids: [r.id] }]}
                    mode="purge"
                    label="Delete permanently"
                    className={a.linkDanger}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
