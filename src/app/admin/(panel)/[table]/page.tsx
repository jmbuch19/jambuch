import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatCell as cell, tableConfig } from "@/lib/admin-tables";
import a from "../../admin.module.css";

export default async function TableList({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; q?: string }>;
}) {
  const { table } = await params;
  const { saved, deleted, q } = await searchParams;
  const cfg = tableConfig(table);
  if (!cfg) notFound();
  const { db } = await requireAdmin();

  let query = db.from(table).select([cfg.key, ...cfg.list].join(", "));
  for (const o of cfg.order) query = query.order(o.column, { ascending: o.ascending });
  // Search the first text column (titles, names), mainly for the ~1,000 books.
  const searchCol = cfg.list.find((c) => {
    const type = cfg.fields.find((f) => f.name === c)?.type ?? "text";
    return type === "text" || type === "textarea";
  });
  const needle = q?.trim().replace(/[%_,()]/g, "");
  if (needle && searchCol) query = query.ilike(searchCol, `%${needle}%`);
  const { data, error } = await query.limit(500);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  // Show "ref" columns by the other row's label instead of its id.
  for (const f of cfg.fields) {
    if (f.type !== "ref" || !f.ref || !cfg.list.includes(f.name)) continue;
    const { data: refs } = await db.from(f.ref.table).select(`id, ${f.ref.label}`);
    const names = new Map(((refs ?? []) as unknown as Record<string, string>[]).map((r) => [r.id, r[f.ref!.label]]));
    for (const r of rows) r[f.name] = names.get(String(r[f.name])) ?? r[f.name];
  }

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
      {deleted && <p className={a.notice}>Deleted.</p>}
      {error && <p className={a.error}>Could not load: {error.message}</p>}

      <form className={a.search}>
        <input type="search" name="q" defaultValue={q} placeholder="Search…" aria-label="Search" />
        <button type="submit" className={a.secondary}>
          Search
        </button>
      </form>

      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              {cfg.list.map((c) => (
                <th key={c}>{cfg.fields.find((f) => f.name === c)?.label ?? c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = `/admin/${table}/${encodeURIComponent(String(r[cfg.key]))}`;
              const unread = table === "ideas" && !r.is_read;
              return (
                <tr key={String(r[cfg.key])} className={unread ? a.unread : undefined}>
                  {cfg.list.map((c, i) => (
                    <td key={c}>{i === 0 ? <Link href={href}>{cell(cfg, c, r[c]) || "(untitled)"}</Link> : cell(cfg, c, r[c])}</td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cfg.list.length} className={a.empty}>
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length === 500 && <p className={a.intro}>Showing the first 500. Search to narrow it down.</p>}
    </>
  );
}
