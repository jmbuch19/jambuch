"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { tableConfig, type Field } from "@/lib/admin-tables";

function readField(f: Field, form: FormData): unknown {
  if (f.type === "bool") return form.get(f.name) === "on";
  const raw = String(form.get(f.name) ?? "").trim();
  if (f.type === "int") {
    if (!raw) return f.name === "sort_order" ? 0 : null;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) throw new Error(`${f.label} must be a whole number.`);
    return n;
  }
  if (f.type === "ref") {
    if (!/^[0-9a-f-]{36}$/i.test(raw)) throw new Error(`Pick a ${f.label.toLowerCase()}.`);
    return raw;
  }
  if (f.type === "select") {
    if (!f.options?.some((o) => o.value === raw)) throw new Error(`Pick a value for ${f.label}.`);
    return raw;
  }
  if (!raw) {
    if (f.required) throw new Error(`${f.label} is required.`);
    return null;
  }
  return raw;
}

export async function saveRow(table: string, id: string, form: FormData) {
  const cfg = tableConfig(table);
  if (!cfg) throw new Error("Unknown table");
  const { db } = await requireAdmin();

  const row: Record<string, unknown> = {};
  let problem: string | null = null;
  for (const f of cfg.fields) {
    if (f.readOnly) continue;
    try {
      row[f.name] = readField(f, form);
    } catch (err) {
      problem = (err as Error).message;
      break;
    }
  }

  const back = `/admin/${table}/${encodeURIComponent(id)}`;
  if (problem) redirect(`${back}?error=${encodeURIComponent(problem)}`);

  const isNew = id === "new";
  if (isNew && !cfg.canCreate) throw new Error("Rows can't be added here");
  const res = isNew
    ? await db.from(table).insert(row).select(cfg.key).single()
    : await db.from(table).update(row).eq(cfg.key, id).select(cfg.key).single();
  if (res.error) redirect(`${back}?error=${encodeURIComponent(res.error.message)}`);

  // Every public page (homepage, book and chapter pages) reads this content.
  revalidatePath("/", "layout");
  redirect(`/admin/${table}?saved=1`);
}

export async function deleteRow(table: string, id: string) {
  const cfg = tableConfig(table);
  if (!cfg?.canDelete) throw new Error("Rows can't be deleted here");
  const { db } = await requireAdmin();
  const { error } = await db.from(table).delete().eq(cfg.key, id);
  if (error) redirect(`/admin/${table}/${encodeURIComponent(id)}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(`/admin/${table}?deleted=1`);
}
