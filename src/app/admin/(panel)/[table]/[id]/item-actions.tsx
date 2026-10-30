"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPublished } from "../../../actions";
import DeleteDialog from "../../../delete-dialog";
import a from "../../../admin.module.css";

// Hide / Show and Delete for one item, under its edit form.
export default function ItemActions({
  table,
  id,
  published,
}: {
  table: string;
  id: string;
  published: boolean | null; // null when the table has no published flag
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    setError(null);
    start(async () => {
      const res = await setPublished(table, [id], !published);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section className={a.danger}>
      {published !== null && (
        <div className={a.dangerRow}>
          <div>
            <strong>{published ? "Hide from the site" : "Hidden from the site"}</strong>
            <p>
              {published
                ? "For “not now”: it stays here in the admin and comes back with one click."
                : "Visitors can’t see it. It stays here until you show it again."}
            </p>
          </div>
          <button type="button" onClick={toggle} disabled={pending} className={a.secondary}>
            {published ? "Hide" : "Show on the site"}
          </button>
        </div>
      )}
      <div className={a.dangerRow}>
        <div>
          <strong>Delete</strong>
          <p>For “never”: it goes to the Trash, and is removed for good after 30 days.</p>
        </div>
        <DeleteDialog targets={[{ table, ids: [id] }]} mode="trash" label="Delete…" after={`/admin/${table}`} />
      </div>
      {error && <p className={a.error}>{error}</p>}
    </section>
  );
}
