import { sendGatheringNotes } from "@/lib/gathering-notes";
import { adminClient } from "@/lib/supabase-admin";
import { expired, purge, trash } from "@/lib/trash";
import { deleteRequestFiles } from "@/lib/creators/files";
import { deleteSample } from "@/lib/creators/sample";
import { sendEmail } from "@/lib/email";

// Creator's Space: request files whose time is up (brief §6B): 7 days after the sample was
// sent, at once for withdrawn, refused or closed requests without a sent sample, and for
// abandoned drafts (below). Everything under creators/<id>/ goes; the row stays, without
// file keys, marked files_purged_at.
async function purgeCreatorFiles(db: ReturnType<typeof adminClient>, now: string) {
  const { data: rows, error } = await db
    .from("creator_requests")
    .select("id, state, story_key, sample_key, sample_state, files_delete_at")
    .is("files_purged_at", null)
    .or("story_key.not.is.null,sample_key.not.is.null,files_delete_at.not.is.null,state.in.(withdrawn,refused,closed)")
    .limit(200);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of rows ?? []) {
    if (r.state === "ordered") continue; // production needs the files
    const due =
      (r.files_delete_at && r.files_delete_at <= now) ||
      (["withdrawn", "refused", "closed"].includes(r.state) && r.sample_state !== "sent");
    if (!due) continue;
    await deleteRequestFiles(r.id);
    if (r.sample_key) await deleteSample(r.sample_key);
    await db.from("creator_requests").update({ story_key: null, sample_key: null, files_purged_at: now, updated_at: now }).eq("id", r.id);
    console.log("daily: creator files deleted for", r.id);
    n++;
  }
  return n;
}

// Question-flow drafts left unfinished (docs/CREATORS_QUESTION_FLOW.md §13): a reminder at
// day 3, and at day 14 the draft is withdrawn and its story and files deleted (the purge
// above runs right after this).
async function abandonedDrafts(db: ReturnType<typeof adminClient>, now: string) {
  const day = 86400_000;
  const t = Date.parse(now);
  const { data: rows, error } = await db
    .from("creator_requests")
    .select("id, email, name, language, updated_at, reminded_at")
    .in("state", ["draft", "questions", "plan"])
    .lt("updated_at", new Date(t - 3 * day).toISOString())
    .limit(200);
  if (error) throw new Error(error.message);
  let reminded = 0;
  let closed = 0;
  for (const r of rows ?? []) {
    if (Date.parse(r.updated_at) < t - 14 * day) {
      await db.from("creator_requests").update({ state: "withdrawn", files_delete_at: now, updated_at: now }).eq("id", r.id);
      closed++;
      continue;
    }
    if (r.reminded_at) continue;
    const gu = r.language === "gu";
    const sent = await sendEmail({
      to: r.email,
      subject: gu ? "તમારી વાર્તા રાહ જુએ છે · Your story is waiting" : "Creator's Space: your story is waiting",
      text: [
        `Dear ${r.name || "writer"},`,
        "",
        gu ? "તમારી Creator's Space વિનંતી અધૂરી છે. જ્યાં છોડી હતી ત્યાંથી આગળ વધો:" : "",
        "Your Creator's Space request is not finished yet. You can continue where you left off:",
        "https://jambuch.in/creators/start",
        "",
        "Unfinished requests and their stories are deleted 14 days after the last change.",
        "",
        "Jaydeep Buch",
        "Creator's Space · jambuch.in/creators",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
      replyTo: process.env.ADMIN_EMAIL,
    });
    // reminded_at only, so the 14-day clock still counts from the writer's last change.
    if (sent) {
      await db.from("creator_requests").update({ reminded_at: now }).eq("id", r.id);
      reminded++;
    }
  }
  return { reminded, closed };
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
    const drafts = await abandonedDrafts(db, now);
    purged.creator_drafts_reminded = drafts.reminded;
    purged.creator_drafts_closed = drafts.closed;
  } catch (err) {
    failed.creator_drafts = err instanceof Error ? err.message : String(err);
    console.error("daily: creator drafts failed:", failed.creator_drafts);
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
