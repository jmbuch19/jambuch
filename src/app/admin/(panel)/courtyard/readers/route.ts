import { requireAdmin } from "@/lib/admin";

// /admin/courtyard/readers: the weekly letter's readers as a CSV download.
export async function GET() {
  const { db } = await requireAdmin();
  const { data, error } = await db
    .from("courtyard_readers")
    .select("name, email, source, confirmed_at, created_at")
    .order("created_at", { ascending: true });
  if (error) return new Response(error.message, { status: 500 });

  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote everything; neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const rows = [
    ["name", "email", "joined from", "confirmed", "signed up"],
    ...(data ?? []).map((r) => [r.name, r.email, r.source, r.confirmed_at ? "yes" : "not yet", r.created_at]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jambuch-letter-readers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
