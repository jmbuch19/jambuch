import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { TABLES } from "@/lib/admin-tables";
import a from "../admin.module.css";

export default async function Dashboard() {
  const { db } = await requireAdmin();
  const counts = await Promise.all(
    TABLES.map(async (t) => {
      let q = db.from(t.table).select("*", { count: "exact", head: true });
      if (t.canDelete) q = q.is("deleted_at", null);
      const { count } = await q;
      return count ?? 0;
    }),
  );
  const trashCounts = await Promise.all(
    TABLES.filter((t) => t.canDelete).map(async (t) => {
      const { count } = await db
        .from(t.table)
        .select("*", { count: "exact", head: true })
        .not("deleted_at", "is", null);
      return count ?? 0;
    }),
  );
  const inTrash = trashCounts.reduce((n, c) => n + c, 0);
  const { count: unread } = await db
    .from("ideas")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false)
    .is("deleted_at", null);

  return (
    <>
      <h1 className={a.title}>Dashboard</h1>
      {!!unread && (
        <p className={a.notice}>
          <Link href="/admin/ideas">
            {unread} new {unread === 1 ? "idea" : "ideas"} in the inbox →
          </Link>
        </p>
      )}
      <div className={a.tiles}>
        {TABLES.map((t, i) => (
          <Link key={t.table} href={`/admin/${t.table}`} className={a.tile}>
            <span className={a.tileCount}>{counts[i]}</span>
            <span>{t.label}</span>
          </Link>
        ))}
        <Link href="/admin/trash" className={a.tile}>
          <span className={a.tileCount}>{inTrash}</span>
          <span>Trash</span>
        </Link>
      </div>
    </>
  );
}
