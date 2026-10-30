import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatCell as cell, hasPublished, tableConfig } from "@/lib/admin-tables";
import { bookOrder } from "@/lib/book-sections";
import ListTable, { type ListRow } from "./list-table";
import a from "../../admin.module.css";

export default async function TableList({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ saved?: string; q?: string }>;
}) {
  const { table } = await params;
  const { saved, q } = await searchParams;
  const cfg = tableConfig(table);
  if (!cfg) notFound();
  const { db } = await requireAdmin();
  const canHide = hasPublished(cfg);

  const cols = [...new Set([cfg.key, ...cfg.list, ...(canHide ? ["published"] : []), ...(table === "ideas" ? ["is_read"] : [])])];
  let query = db.from(table).select(cols.join(", "));
  // Trashed items only appear in the Trash.
  if (cfg.canDelete) query = query.is("deleted_at", null);
  for (const o of cfg.order) query = query.order(o.column, { ascending: o.ascending });
  // Search the first text column (titles, names), mainly for the ~1,000 books.
  const searchCol = cfg.list.find((c) => {
    const type = cfg.fields.find((f) => f.name === c)?.type ?? "text";
    return type === "text" || type === "textarea";
  });
  const needle = q?.trim().replace(/[%_,()]/g, "");
  if (needle && searchCol) query = query.ilike(searchCol, `%${needle}%`);
  const { data, error } = await query.limit(500);
  let rows = (data ?? []) as unknown as Record<string, unknown>[];

  // Chapters list in reading order, book by book: a preface (which has no
  // number) at the top of its book, a glossary at the bottom.
  if (table === "chapters") {
    type Entry = Record<string, unknown> & { id: string; number: number | null; section: string | null };
    const books = [...new Set(rows.map((r) => String(r.work_id)))];
    rows = books.flatMap((w) => bookOrder(rows.filter((r) => String(r.work_id) === w) as Entry[]));
  }

  // Show "ref" columns by the other row's label instead of its id.
  for (const f of cfg.fields) {
    if (f.type !== "ref" || !f.ref || !cfg.list.includes(f.name)) continue;
    const { data: refs } = await db.from(f.ref.table).select(`id, ${f.ref.label}`);
    const names = new Map(((refs ?? []) as unknown as Record<string, string>[]).map((r) => [r.id, r[f.ref!.label]]));
    for (const r of rows) r[f.name] = names.get(String(r[f.name])) ?? r[f.name];
  }

  const listRows: ListRow[] = rows.map((r) => ({
    id: String(r[cfg.key]),
    href: `/admin/${table}/${encodeURIComponent(String(r[cfg.key]))}`,
    cells: cfg.list.map((c) => cell(cfg, c, r[c])),
    published: canHide ? r.published === true : null,
    unread: table === "ideas" && !r.is_read,
  }));

  return (
    <>
      <div className={a.titleRow}>
        <h1 className={a.title}>{cfg.label}</h1>
        {cfg.canCreate && (
          <Link href={`/admin/${table}/new`} className={a.primary}>
            Add new
          </Link>
        )}
      </div>
      {cfg.intro && <p className={a.intro}>{cfg.intro}</p>}
      {saved && <p className={a.notice}>Saved. The homepage updates within a minute.</p>}
      {error && <p className={a.error}>Could not load: {error.message}</p>}

      <form className={a.search}>
        <input type="search" name="q" defaultValue={q} placeholder="Search…" aria-label="Search" />
        <button type="submit" className={a.secondary}>
          Search
        </button>
      </form>

      <ListTable
        table={table}
        headers={cfg.list.map((c) => cfg.fields.find((f) => f.name === c)?.label ?? c)}
        rows={listRows}
        canHide={canHide}
        canDelete={cfg.canDelete}
      />
      {rows.length === 500 && <p className={a.intro}>Showing the first 500. Search to narrow it down.</p>}
    </>
  );
}
