import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { formatCell, hasPublished, tableConfig } from "@/lib/admin-tables";
import { saveRow } from "../../../actions";
import CheckedTextarea from "./checked-textarea";
import ItemActions from "./item-actions";
import a from "../../../admin.module.css";

export default async function EditRow({
  params,
  searchParams,
}: {
  params: Promise<{ table: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { table, id: rawId } = await params;
  const { error } = await searchParams;
  const id = decodeURIComponent(rawId);
  const cfg = tableConfig(table);
  if (!cfg) notFound();
  const isNew = id === "new";
  if (isNew && !cfg.canCreate) notFound();
  const { db } = await requireAdmin();

  let row: Record<string, unknown> = { published: true, sort_order: 0 };
  if (!isNew) {
    const { data } = await db.from(table).select("*").eq(cfg.key, id).maybeSingle();
    if (!data) notFound();
    row = data;
    // Opening an idea marks it read.
    if (table === "ideas" && !row.is_read) {
      await db.from("ideas").update({ is_read: true }).eq("id", id);
      row.is_read = true;
    }
  }

  // "ref" fields become a dropdown of the other table's rows.
  const fields = await Promise.all(
    cfg.fields.map(async (f) => {
      if (f.type !== "ref" || !f.ref) return f;
      const { data } = await db.from(f.ref.table).select(`id, ${f.ref.label}`).order(f.ref.label);
      const options = ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({
        value: r.id,
        label: r[f.ref!.label],
      }));
      return { ...f, options };
    }),
  );
  const trashed = !isNew && row.deleted_at != null;

  return (
    <>
      <p className={a.crumb}>
        <Link href={`/admin/${table}`}>← {cfg.label}</Link>
      </p>
      <h1 className={a.title}>{isNew ? "Add new" : "Edit"}</h1>
      {trashed && (
        <p className={a.warn}>
          This item is in the Trash, so visitors can’t see it. <Link href="/admin/trash">Restore it from the Trash</Link>{" "}
          to use it again.
        </p>
      )}
      {error && (
        <p className={a.error} role="alert">
          {error}
        </p>
      )}

      <form action={saveRow.bind(null, table, id)} className={a.form}>
        {fields.map((f) => {
          const value = row[f.name];
          if (f.readOnly) {
            if (isNew) return null;
            return (
              <div key={f.name} className={a.field}>
                {f.label}
                <div className={a.readOnly}>
                  {f.name === "email" && value ? (
                    <a href={`mailto:${value}`}>{String(value)}</a>
                  ) : (
                    formatCell(cfg, f.name, value, true) || "—"
                  )}
                </div>
              </div>
            );
          }
          if (f.type === "bool") {
            return (
              <label key={f.name} className={a.check}>
                <input type="checkbox" name={f.name} defaultChecked={!!value} />
                <span>
                  {f.label}
                  {f.hint && <small>{f.hint}</small>}
                </span>
              </label>
            );
          }
          return (
            <label key={f.name} className={a.field}>
              <span>
                {f.label}
                {f.required && " *"}
              </span>
              {f.type === "textarea" && f.checkText ? (
                <CheckedTextarea name={f.name} defaultValue={String(value ?? "")} rows={f.rows ?? 4} required={f.required} />
              ) : f.type === "textarea" ? (
                <textarea name={f.name} defaultValue={String(value ?? "")} rows={f.rows ?? 4} required={f.required} />
              ) : f.type === "select" || f.type === "ref" ? (
                <select name={f.name} defaultValue={String(value ?? f.options?.[0]?.value ?? "")}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "int" ? "number" : f.type === "url" ? "url" : "text"}
                  name={f.name}
                  defaultValue={value == null ? "" : String(value)}
                  required={f.required}
                />
              )}
              {f.hint && <small>{f.hint}</small>}
            </label>
          );
        })}
        <div className={a.actions}>
          <button type="submit" className={a.primary}>
            Save
          </button>
          <Link href={`/admin/${table}`} className={a.secondary}>
            Cancel
          </Link>
        </div>
      </form>

      {!isNew && cfg.canDelete && !trashed && (
        <ItemActions table={table} id={id} published={hasPublished(cfg) ? row.published === true : null} />
      )}
    </>
  );
}
