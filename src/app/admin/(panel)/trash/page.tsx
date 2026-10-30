import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { ITEM_META, TABLES, tableConfig } from "@/lib/admin-tables";
import { cachePurgeReady, r2Problem } from "@/lib/r2";
import { thumbOf, titleOf, TRASH_MS } from "@/lib/trash";
import TrashTable, { type TrashRow } from "./trash-table";
import a from "../../admin.module.css";

type Row = Record<string, unknown>;

export default async function TrashPage() {
  const { db } = await requireAdmin();
  const found = new Map<string, Row[]>();
  for (const cfg of TABLES.filter((t) => t.canDelete)) {
    const { data } = await db
      .from(cfg.table)
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500);
    found.set(cfg.table, (data ?? []) as Row[]);
  }

  // Rows trashed together with their parent (same timestamp) are listed under it.
  const hidden = new Set<string>();
  const extras = new Map<string, string>();
  for (const [table, meta] of Object.entries(ITEM_META)) {
    const parents = new Map((found.get(table) ?? []).map((r) => [String(r.id), String(r.deleted_at)]));
    for (const child of meta.children ?? []) {
      const childCfg = tableConfig(child.table)!;
      const counts = new Map<string, number>();
      for (const r of found.get(child.table) ?? []) {
        const parent = String(r[child.fk]);
        if (parents.get(parent) === String(r.deleted_at)) {
          hidden.add(`${child.table}:${r.id}`);
          counts.set(parent, (counts.get(parent) ?? 0) + 1);
        }
      }
      for (const [parent, n] of counts) extras.set(`${table}:${parent}`, `with ${n} ${childCfg.label.toLowerCase()}`);
    }
  }

  const rows: TrashRow[] = [];
  for (const [table, list] of found) {
    const cfg = tableConfig(table)!;
    for (const r of list) {
      const id = String(r[cfg.key]);
      if (hidden.has(`${table}:${id}`)) continue;
      const deletedAt = String(r.deleted_at);
      rows.push({
        table,
        label: cfg.label,
        id,
        title: titleOf(table, r),
        thumb: thumbOf(table, r),
        deletedAt,
        daysLeft: Math.ceil((new Date(deletedAt).getTime() + TRASH_MS - Date.now()) / 86_400_000),
        extra: extras.get(`${table}:${id}`) ?? null,
      });
    }
  }
  rows.sort((x, y) => y.deletedAt.localeCompare(x.deletedAt));

  const problem = r2Problem();
  return (
    <>
      <h1 className={a.title}>Trash</h1>
      <p className={a.intro}>
        Deleted items wait here for 30 days, hidden from the site, with their files offline. Restore brings an item back
        exactly as it was. After 30 days the daily cleanup deletes the item and its files for good.{" "}
        <Link href="/admin/log">See the delete log</Link>.
      </p>
      {problem && (
        <p className={a.warn}>
          File storage isn’t connected yet ({problem}). Items without files work as normal; items with R2 files can’t be
          deleted until it is, so no file is ever left behind.
        </p>
      )}
      {!problem && !cachePurgeReady() && (
        <p className={a.warn}>
          Cloudflare cache purge isn’t set up (CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN), so a deleted file’s old link may
          keep working from Cloudflare’s cache for a while.
        </p>
      )}
      <TrashTable rows={rows} />
    </>
  );
}
