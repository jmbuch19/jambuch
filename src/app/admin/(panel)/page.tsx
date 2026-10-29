import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { TABLES } from "@/lib/admin-tables";
import a from "../admin.module.css";

export default async function Dashboard() {
  const { db } = await requireAdmin();
  const counts = await Promise.all(
    TABLES.map(async (t) => {
      const { count } = await db.from(t.table).select("*", { count: "exact", head: true });
      return count ?? 0;
    }),
  );
  const { count: unread } = await db.from("ideas").select("*", { count: "exact", head: true }).eq("is_read", false);

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
      </div>
    </>
  );
}
