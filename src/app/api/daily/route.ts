import { adminClient } from "@/lib/supabase-admin";
import { expired, purge, trash } from "@/lib/trash";

// Called once a day by Vercel Cron (see vercel.json) with CRON_SECRET as a
// bearer token. It keeps the free Supabase project awake, expires old
// Courtyard invites, removes unconfirmed submissions, and permanently deletes
// items (rows and R2 files) that have been in the Trash for 30 days.
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

  const purged: Record<string, number> = {};
  const failed: Record<string, string> = {};
  const now = new Date().toISOString();

  // Courtyard invites nobody accepted within 14 days: the link dies and the
  // invite shows as "Link expired" (waiting on Jaydeep).
  const { count: invitesExpired, error: inviteErr } = await db
    .from("courtyard_invites")
    .update({ stage: "expired", token_hash: null }, { count: "exact" })
    .eq("stage", "invited")
    .lt("expires_at", now);
  if (inviteErr) failed.courtyard_invites_expiry = inviteErr.message;

  // Submissions never confirmed by email within 7 days never reached the
  // admin. Delete them (row and private file) the normal way, so it's logged.
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale, error: staleErr } = await db
      .from("courtyard_submissions")
      .select("id")
      .eq("status", "unconfirmed")
      .lt("created_at", cutoff)
      .is("deleted_at", null)
      .limit(500);
    if (staleErr) throw new Error(staleErr.message);
    const ids = (stale ?? []).map((r) => r.id as string);
    if (ids.length) {
      const target = [{ table: "courtyard_submissions", ids }];
      await trash(db, null, target);
      purged.unconfirmed_submissions = await purge(db, null, target, "expired");
    }
  } catch (err) {
    failed.unconfirmed_submissions = err instanceof Error ? err.message : String(err);
    console.error("daily: removing unconfirmed submissions failed:", failed.unconfirmed_submissions);
  }

  // One table at a time, so a failure (say, a file R2 won't delete) leaves
  // those items in the Trash for tomorrow and the rest still get cleaned.
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

  return Response.json({
    ok: Object.keys(failed).length === 0,
    invitesExpired: invitesExpired ?? 0,
    purged,
    failed,
    at: new Date().toISOString(),
  });
}
