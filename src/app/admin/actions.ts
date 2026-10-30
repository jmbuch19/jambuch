"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { hasPublished, tableConfig, type Field } from "@/lib/admin-tables";
import { preview, purge, restore, trash, type Target } from "@/lib/trash";

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

// ---------------------------------------------------------------- hide, trash, restore, delete
// Called from client components, so they return a result instead of redirecting.

export type ActionResult = { ok: true; count: number } | { ok: false; error: string };

async function run(work: () => Promise<number>): Promise<ActionResult> {
  try {
    const count = await work();
    revalidatePath("/", "layout");
    return { ok: true, count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function checkTargets(targets: Target[]) {
  for (const t of targets) {
    if (!tableConfig(t.table)?.canDelete) throw new Error(`Items in ${t.table} can't be changed here.`);
    if (!t.ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new Error("Bad item id.");
  }
}

// Hide = published off: the item stays in the admin but leaves the site.
export async function setPublished(table: string, ids: string[], published: boolean): Promise<ActionResult> {
  return run(async () => {
    const cfg = tableConfig(table);
    if (!cfg || !hasPublished(cfg)) throw new Error("These items can't be hidden.");
    checkTargets([{ table, ids }]);
    const { db } = await requireAdmin();
    const { error, count } = await db.from(table).update({ published }, { count: "exact" }).in(cfg.key, ids);
    if (error) throw new Error(error.message);
    return count ?? ids.length;
  });
}

export async function previewDelete(targets: Target[], mode: "trash" | "purge") {
  checkTargets(targets);
  const { db } = await requireAdmin();
  return preview(db, targets, mode);
}

export async function moveToTrash(targets: Target[]) {
  return run(async () => {
    checkTargets(targets);
    const { db, user } = await requireAdmin();
    return trash(db, user.id, targets);
  });
}

export async function restoreFromTrash(targets: Target[]) {
  return run(async () => {
    checkTargets(targets);
    const { db } = await requireAdmin();
    return restore(db, targets);
  });
}

export async function deletePermanently(targets: Target[]) {
  return run(async () => {
    checkTargets(targets);
    const { db, user } = await requireAdmin();
    return purge(db, user.id, targets, "manual");
  });
}
