import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ITEM_META, TABLES, tableConfig, type TableConfig } from "./admin-tables";
import { deleteForever, fileRef, fileRefsIn, moveToTrash, r2Problem, restoreFromTrash, type FileRef } from "./r2";

// Moving items to the Trash, restoring them, and deleting them for good,
// together with their R2 files. Works with the admin's session client (row-level
// security checks the admin role) and with the service-role client (daily cleanup).

export type Target = { table: string; ids: string[] };
export type Usage = { table: string; label: string; id: string; title: string; trashed: boolean };
type Row = Record<string, unknown>;
type Owned = { cfg: TableConfig; row: Row };

const TRASH_DAYS = 30;
export const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000;

function cfgOf(table: string) {
  const cfg = tableConfig(table);
  if (!cfg?.canDelete) throw new Error(`Items in ${table} can't be deleted.`);
  return cfg;
}

const idOf = (cfg: TableConfig, row: Row) => String(row[cfg.key]);

// Filters travel in the request URL, so long id/URL lists go in batches.
function chunks<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
const tag = (table: string, id: string) => `${table}:${id}`;

export function titleOf(table: string, row: Row) {
  const meta = ITEM_META[table];
  // Untitled rows (a room request, a suggestion) fall back to who it's about or from.
  const raw = String(
    row[meta?.title ?? "title"] ?? row.title ?? row.creator_name ?? row.name ?? row.body ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();
  return (raw.length > 120 ? `${raw.slice(0, 120)}…` : raw) || "(untitled)";
}

export function thumbOf(table: string, row: Row) {
  const field = ITEM_META[table]?.thumb;
  const value = field ? row[field] : null;
  return typeof value === "string" && value ? value : null;
}

export function filesOf(rows: Row[]): FileRef[] {
  const seen = new Map<string, FileRef>();
  for (const row of rows) {
    for (const value of Object.values(row)) {
      const ref = fileRef(value);
      if (ref) seen.set(ref.url, ref);
      // Images placed inside chapter text go to the Trash with their chapter.
      else if (typeof value === "string") for (const r of fileRefsIn(value)) seen.set(r.url, r);
    }
  }
  return [...seen.values()];
}

async function load(db: SupabaseClient, table: string, column: string, values: string[], trashed: boolean | null) {
  const rows: Row[] = [];
  for (const batch of chunks(values)) {
    let q = db.from(table).select("*").in(column, batch);
    if (trashed === true) q = q.not("deleted_at", "is", null);
    if (trashed === false) q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

async function updateIn(db: SupabaseClient, table: string, column: string, values: string[], patch: Row, onlyLive = false) {
  for (const batch of chunks(values)) {
    let q = db.from(table).update(patch).in(column, batch);
    if (onlyLive) q = q.is("deleted_at", null);
    const { error } = await q;
    if (error) throw new Error(error.message);
  }
}

// The items to act on plus the rows that belong to them.
async function collect(db: SupabaseClient, targets: Target[], trashed: boolean | null) {
  const owned: Owned[] = [];
  const children: { cfg: TableConfig; fk: string; parentIds: string[]; rows: Row[] }[] = [];
  for (const t of targets) {
    const cfg = cfgOf(t.table);
    const rows = await load(db, t.table, cfg.key, t.ids, trashed);
    owned.push(...rows.map((row) => ({ cfg, row })));
    const parentIds = rows.map((r) => idOf(cfg, r));
    for (const child of ITEM_META[t.table]?.children ?? []) {
      const childCfg = cfgOf(child.table);
      const childRows = await load(db, child.table, child.fk, parentIds, null);
      children.push({ cfg: childCfg, fk: child.fk, parentIds, rows: childRows });
    }
  }
  return { owned, children };
}

// Every row (live or trashed) that refers to one of these files.
export async function findUsages(db: SupabaseClient, urls: string[]) {
  const usages = new Map<string, Usage[]>(urls.map((u) => [u, []]));
  if (urls.length === 0) return usages;
  for (const cfg of TABLES.filter((t) => t.canDelete)) {
    const cols = cfg.fields.filter((f) => f.type === "url" || f.type === "text" || f.type === "image").map((f) => f.name);
    if (cols.length === 0) continue;
    const titleCol = ITEM_META[cfg.table]?.title ?? "title";
    const select = [...new Set([cfg.key, titleCol, "deleted_at", ...cols])].join(", ");
    const found: Row[] = [];
    for (const batch of chunks(urls, 20)) {
      const quoted = batch.map((u) => `"${u.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
      const { data, error } = await db
        .from(cfg.table)
        .select(select)
        .or(cols.map((c) => `${c}.in.(${quoted})`).join(","));
      if (error) throw new Error(error.message);
      found.push(...((data ?? []) as unknown as Row[]));
    }
    for (const row of found) {
      for (const c of cols) {
        const list = usages.get(String(row[c]));
        if (!list) continue;
        list.push({
          table: cfg.table,
          label: cfg.label,
          id: idOf(cfg, row),
          title: titleOf(cfg.table, row),
          trashed: row.deleted_at != null,
        });
      }
    }
  }
  return usages;
}

export type Preview = {
  items: { table: string; label: string; id: string; title: string; thumb: string | null }[];
  total: number;
  childCounts: { label: string; count: number }[];
  fileCount: number;
  shared: { url: string; usedBy: Usage[] }[];
  problem: string | null;
};

// What a delete would touch, for the confirmation dialog.
export async function preview(db: SupabaseClient, targets: Target[], mode: "trash" | "purge"): Promise<Preview> {
  const { owned, children } = await collect(db, targets, mode === "purge");
  const childRows = children.flatMap((c) => c.rows.map((row) => ({ cfg: c.cfg, row })));
  const all = [...owned, ...childRows];
  const inSet = new Set(all.map(({ cfg, row }) => tag(cfg.table, idOf(cfg, row))));
  const files = filesOf(all.map((o) => o.row));
  const usages = await findUsages(db, files.map((f) => f.url));
  const shared = files
    .map((f) => ({ url: f.url, usedBy: (usages.get(f.url) ?? []).filter((u) => !inSet.has(tag(u.table, u.id))) }))
    .filter((s) => s.usedBy.length > 0);

  const counts = new Map<string, number>();
  for (const c of children) counts.set(c.cfg.label, (counts.get(c.cfg.label) ?? 0) + c.rows.length);

  return {
    items: owned.slice(0, 50).map(({ cfg, row }) => ({
      table: cfg.table,
      label: cfg.label,
      id: idOf(cfg, row),
      title: titleOf(cfg.table, row),
      thumb: thumbOf(cfg.table, row),
    })),
    total: owned.length,
    childCounts: [...counts].filter(([, n]) => n > 0).map(([label, count]) => ({ label, count })),
    fileCount: files.length,
    shared,
    problem: files.some((f) => f.bucket === "public" || mode === "purge") ? r2Problem() : null,
  };
}

// Trash: hide the rows (and their children) and move their public files out
// of reach. A file another live item still uses stays where it is.
export async function trash(db: SupabaseClient, userId: string | null, targets: Target[]) {
  const { owned, children } = await collect(db, targets, false);
  const live = [...owned, ...children.flatMap((c) => c.rows.filter((r) => r.deleted_at == null).map((row) => ({ cfg: c.cfg, row })))];
  const inSet = new Set(live.map(({ cfg, row }) => tag(cfg.table, idOf(cfg, row))));
  const files = filesOf(live.map((o) => o.row));
  const usages = await findUsages(db, files.map((f) => f.url));
  const toMove = files.filter(
    (f) => !(usages.get(f.url) ?? []).some((u) => !u.trashed && !inSet.has(tag(u.table, u.id))),
  );

  // Move files first; if one fails, put the moved ones back and change nothing.
  const moved: FileRef[] = [];
  try {
    for (const f of toMove) {
      await moveToTrash(f);
      moved.push(f);
    }
  } catch (err) {
    await Promise.allSettled(moved.map(restoreFromTrash));
    throw err;
  }

  const stamp = { deleted_at: new Date().toISOString(), deleted_by: userId };
  try {
    for (const t of targets) await updateIn(db, t.table, cfgOf(t.table).key, t.ids, stamp, true);
    // Children share the parent's timestamp, so a restore brings back exactly these.
    for (const c of children) await updateIn(db, c.cfg.table, c.fk, c.parentIds, stamp, true);
  } catch (err) {
    await Promise.allSettled(moved.map(restoreFromTrash));
    throw err;
  }
  return owned.length;
}

export async function restore(db: SupabaseClient, targets: Target[]) {
  const { owned, children } = await collect(db, targets, true);
  const stamps = new Map(owned.map(({ cfg, row }) => [idOf(cfg, row), String(row.deleted_at)]));
  const childRows = children.flatMap((c) =>
    c.rows.filter((r) => r.deleted_at != null && stamps.get(String(r[c.fk])) === String(r.deleted_at)).map((row) => ({ c, row })),
  );

  for (const f of filesOf([...owned.map((o) => o.row), ...childRows.map((x) => x.row)])) await restoreFromTrash(f);

  const clear = { deleted_at: null, deleted_by: null };
  for (const t of targets) await updateIn(db, t.table, cfgOf(t.table).key, t.ids, clear);
  for (const c of children) {
    const ids = childRows.filter((x) => x.c === c).map((x) => idOf(c.cfg, x.row));
    await updateIn(db, c.cfg.table, c.cfg.key, ids, clear);
  }
  return owned.length;
}

// Permanent delete of trashed items: their files (unless another item still
// uses them), then the rows (children go by cascade), then the log entry.
export async function purge(
  db: SupabaseClient,
  userId: string | null,
  targets: Target[],
  reason: "manual" | "expired",
) {
  const { owned, children } = await collect(db, targets, true);
  if (owned.length === 0) return 0;
  const all = [...owned, ...children.flatMap((c) => c.rows.map((row) => ({ cfg: c.cfg, row })))];
  const inSet = new Set(all.map(({ cfg, row }) => tag(cfg.table, idOf(cfg, row))));
  const files = filesOf(all.map((o) => o.row));
  const usages = await findUsages(db, files.map((f) => f.url));
  const toDelete = files.filter((f) => !(usages.get(f.url) ?? []).some((u) => !inSet.has(tag(u.table, u.id))));

  // Files first: if one can't be deleted, the rows stay in the Trash so the
  // file is never orphaned.
  for (const f of toDelete) await deleteForever(f);

  for (const t of targets) {
    const cfg = cfgOf(t.table);
    const ids = owned.filter((o) => o.cfg.table === t.table).map((o) => idOf(cfg, o.row));
    for (const batch of chunks(ids)) {
      const { error } = await db.from(t.table).delete().in(cfg.key, batch);
      if (error) throw new Error(error.message);
    }
  }

  const deletedUrls = new Set(toDelete.map((f) => f.url));
  const { error } = await db.from("delete_log").insert(
    all.map(({ cfg, row }) => ({
      table_name: cfg.table,
      row_id: idOf(cfg, row),
      title: titleOf(cfg.table, row),
      files: filesOf([row]).map((f) => f.url).filter((u) => deletedUrls.has(u)),
      reason,
      deleted_by: userId,
    })),
  );
  if (error) console.error("delete_log insert failed:", error.message);
  return owned.length;
}

// Items whose 30 days in the Trash are over. Children of an expiring parent
// are left out: they go with the parent.
export async function expired(db: SupabaseClient): Promise<Target[]> {
  const cutoff = new Date(Date.now() - TRASH_MS).toISOString();
  const found = new Map<string, Row[]>();
  for (const cfg of TABLES.filter((t) => t.canDelete)) {
    const { data, error } = await db.from(cfg.table).select("*").lt("deleted_at", cutoff).limit(1000);
    if (error) throw new Error(error.message);
    found.set(cfg.table, (data ?? []) as Row[]);
  }
  // Rows trashed along with their parent are deleted by the parent's cascade.
  const withParent = new Set<string>();
  for (const [table, meta] of Object.entries(ITEM_META)) {
    const parentCfg = tableConfig(table)!;
    const parents = new Set((found.get(table) ?? []).map((r) => idOf(parentCfg, r)));
    for (const child of meta.children ?? []) {
      const childCfg = tableConfig(child.table)!;
      for (const r of found.get(child.table) ?? []) {
        if (parents.has(String(r[child.fk]))) withParent.add(tag(child.table, idOf(childCfg, r)));
      }
    }
  }
  return [...found]
    .map(([table, rows]) => {
      const cfg = tableConfig(table)!;
      return { table, ids: rows.map((r) => idOf(cfg, r)).filter((id) => !withParent.has(tag(table, id))) };
    })
    .filter((t) => t.ids.length > 0);
}
