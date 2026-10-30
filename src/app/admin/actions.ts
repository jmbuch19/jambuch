"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { hasPublished, tableConfig, type Field } from "@/lib/admin-tables";
import { sectionType } from "@/lib/book-sections";
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
    return raw === "" ? null : raw; // an empty choice (e.g. "Numbered chapter") is stored as nothing
  }
  if (!raw) {
    if (f.required) throw new Error(`${f.label} is required.`);
    return null;
  }
  if (f.type === "image" && !isMediaUrl(raw)) throw new Error(`${f.label} must be uploaded here.`);
  return raw;
}

// Image fields only ever hold links to our own media bucket.
function isMediaUrl(value: string) {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return !!base && value.startsWith(`${base}/`);
}

// Plain words for the database's "one chapter per number, one preface (etc.)
// per book" rules.
async function duplicateChapterMessage(db: Awaited<ReturnType<typeof requireAdmin>>["db"], row: Record<string, unknown>) {
  const section = sectionType(row.section as string | null);
  let q = db.from("chapters").select("title, deleted_at").eq("work_id", row.work_id as string);
  q = section ? q.eq("section", section.key) : q.eq("number", row.number as number);
  const { data: existing } = await q.limit(1).maybeSingle();
  const trashed = existing?.deleted_at ? " It’s in the Trash: restore it, or delete it for good, to add it again." : "";
  const title = existing ? ` (“${existing.title}”)` : "";
  return section
    ? `Not saved: this translation already has a ${section.en}${title}. A book has only one.${trashed}`
    : `Not saved: this translation already has chapter ${row.number}${title}. Please choose another number.${trashed}`;
}

export async function saveRow(table: string, id: string, form: FormData) {
  const cfg = tableConfig(table);
  if (!cfg) throw new Error("Unknown table");
  const { db } = await requireAdmin();

  const isNew = id === "new";
  const row: Record<string, unknown> = {};
  let problem: string | null = null;
  for (const f of cfg.fields) {
    // Locked fields are set once, when the item is added.
    if (f.readOnly || (f.lockAfterCreate && !isNew)) continue;
    try {
      row[f.name] = readField(f, form);
    } catch (err) {
      problem = (err as Error).message;
      break;
    }
  }

  // A chapter is either numbered or a section (preface, glossary...), never both.
  if (!problem && table === "chapters") {
    let isSection = !!row.section;
    if (!isNew) {
      const { data } = await db.from("chapters").select("section").eq("id", id).maybeSingle();
      isSection = !!data?.section;
    }
    if (isSection) row.number = null;
    else if (row.number == null) problem = "Please give the chapter a number.";
  }

  const back = `/admin/${table}/${encodeURIComponent(id)}`;
  if (problem) redirect(`${back}?error=${encodeURIComponent(problem)}`);

  if (isNew && !cfg.canCreate) throw new Error("Rows can't be added here");
  const res = isNew
    ? await db.from(table).insert(row).select(cfg.key).single()
    : await db.from(table).update(row).eq(cfg.key, id).select(cfg.key).single();
  if (res.error) {
    const message =
      table === "chapters" && res.error.code === "23505" ? await duplicateChapterMessage(db, row) : res.error.message;
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }

  // Every public page (homepage, book and chapter pages) reads this content.
  revalidatePath("/", "layout");
  redirect(cfg.ownPage ?? `/admin/${table}?saved=1`);
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
