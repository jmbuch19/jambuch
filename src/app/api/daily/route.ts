import { sendGatheringNotes } from "@/lib/gathering-notes";
import { adminClient } from "@/lib/supabase-admin";
import { expired, purge, trash } from "@/lib/trash";
import { deleteRequestFiles } from "@/lib/creators/files";
import { deleteSample } from "@/lib/creators/sample";

// Creator's Space: stored stories and samples whose time is up (brief §6B): 7 days after
// the sample was sent, or at once for withdrawn, refused or closed requests without a
// sent sample. The row stays, without file keys.
async function purgeCreatorFiles(db: ReturnType<typeof adminClient>, now: string) {
  const { data: rows, error } = await db
    .from("creator_requests")
    .select("id, state, story_key, sample_key, sample_state, files_delete_at")
    .or("story_key.not.is.null,sample_key.not.is.null")
    .limit(200);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of rows ?? []) {
    const due =
      (r.files_delete_at && r.files_delete_at <= now) ||
      (["withdrawn", "refused", "closed"].includes(r.state) && r.sample_state !== "sent");
    if (!due) continue;
    await deleteRequestFiles(r.id);
    if (r.sample_key) await deleteSample(r.sample_key);
    await db.from("creator_requests").update({ story_key: null, sample_key: null, updated_at: now }).eq("id", r.id);
    console.log("daily: creator files deleted for", r.id);
    n++;
  }
  return n;
}

// Called once a day by Vercel Cron (see vercel.json) with CRON_SECRET as a
// bearer token. It keeps the free Supabase project awake, expires old
// Courtyard invites, removes unconfirmed submissions, and permanently deletes
// items (rows and R2 files) that have been in the Trash for 30 days.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // Backstop for the 15-minute gathering job: any "your turn" note not yet sent.
  try {
    purged.gathering_notes_sent = (await sendGatheringNotes(db)).sent;
  } catch (err) {
    failed.gathering_notes = err instanceof Error ? err.message : String(err);
  }

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

  // A series whose first part was never confirmed has nothing left in it:
  // remove it, so the contributor can start again.
  {
    const { data: pendingSeries } = await db
      .from("courtyard_series")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString());
    for (const s of pendingSeries ?? []) {
      const { count } = await db
        .from("courtyard_submissions")
        .select("id", { count: "exact", head: true })
        .eq("series_id", s.id);
      if (!count) await db.from("courtyard_series").delete().eq("id", s.id);
    }
  }

  try {
    purged.creator_files = await purgeCreatorFiles(db, now);
  } catch (err) {
    failed.creator_files = err instanceof Error ? err.message : String(err);
    console.error("daily: creator files purge failed:", failed.creator_files);
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
