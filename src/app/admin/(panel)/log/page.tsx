import { requireAdmin } from "@/lib/admin";
import { tableConfig } from "@/lib/admin-tables";
import a from "../../admin.module.css";

type Entry = {
  id: number;
  table_name: string;
  title: string | null;
  files: string[];
  reason: "manual" | "expired";
  deleted_at: string;
};

export default async function DeleteLog() {
  const { db } = await requireAdmin();
  const { data, error } = await db
    .from("delete_log")
    .select("id, table_name, title, files, reason, deleted_at")
    .order("deleted_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Entry[];

  return (
    <>
      <h1 className={a.title}>Delete log</h1>
      <p className={a.intro}>Every permanent delete, whether you did it from the Trash or the 30-day cleanup did.</p>
      {error && <p className={a.error}>Could not load: {error.message}</p>}
      <div className={a.tableWrap}>
        <table className={a.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Item</th>
              <th>From</th>
              <th>Files removed</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {new Date(r.deleted_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td>{r.title}</td>
                <td>{tableConfig(r.table_name)?.label ?? r.table_name}</td>
                <td>{r.files.length ? r.files.map((f) => f.split("/").pop()).join(", ") : "—"}</td>
                <td>{r.reason === "expired" ? "30-day cleanup" : "By you"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className={a.empty}>
                  Nothing has been permanently deleted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
