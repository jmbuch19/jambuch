import { adminClient } from "@/lib/supabase-admin";
import { expired, purge } from "@/lib/trash";

// Called once a day by Vercel Cron (see vercel.json) with CRON_SECRET as a
// bearer token. It keeps the free Supabase project awake and permanently
// deletes items (rows and R2 files) that have been in the Trash for 30 days.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = adminClient();
  const { error } = await db.from("site_text").select("key").limit(1);
  if (error) {
    console.error("daily: keep-awake query failed:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }

  // One table at a time, so a failure (say, a file R2 won't delete) leaves
  // those items in the Trash for tomorrow and the rest still get cleaned.
  const purged: Record<string, number> = {};
  const failed: Record<string, string> = {};
  try {
    for (const target of await expired(db)) {
      try {
        purged[target.table] = await purge(db, null, [target], "expired");
      } catch (err) {
        failed[target.table] = err instanceof Error ? err.message : String(err);
        console.error(`daily: purge of ${target.table} failed:`, failed[target.table]);
      }
    }
  } catch (err) {
    console.error("daily: finding expired items failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: Object.keys(failed).length === 0, purged, failed, at: new Date().toISOString() });
}
