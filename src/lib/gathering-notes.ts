import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { unfollowUrl } from "./series";

// Tells each contributor whose piece has just joined the thread. Run every
// 15 minutes (pg_cron calls /api/gathering) and by the daily job as a backstop.
// A piece is marked as told only once its email has gone, so a failure is
// retried on the next run.
export async function sendGatheringNotes(db: SupabaseClient, siteUrl = "https://jambuch.in") {
  const { data, error } = await db
    .from("courtyard_submissions")
    .select("id, name, email, title")
    .eq("kind", "single_piece")
    .eq("status", "published")
    .lte("gathering_at", new Date().toISOString())
    .is("gathering_notified_at", null)
    .is("deleted_at", null)
    .limit(100);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const p of data ?? []) {
    const url = `${siteUrl}/courtyard#piece-${p.id}`;
    const ok = await sendEmail({
      from: "Jaydeep Buch <courtyard@jambuch.in>",
      to: p.email,
      replyTo: process.env.ADMIN_EMAIL,
      subject: "Your turn is in the courtyard tonight",
      text: [
        `Dear ${p.name.split(" ")[0]},`,
        "",
        `Your turn is in the courtyard tonight. Your piece “${p.title}” has joined the thread at jambuch.in, alongside everyone else who shared this week:`,
        url,
        "",
        "If it moves you, pick up someone else’s thread too.",
        "",
        "Warmly,",
        "Jaydeep",
      ].join("\n"),
    });
    if (!ok) continue;
    await db.from("courtyard_submissions").update({ gathering_notified_at: new Date().toISOString() }).eq("id", p.id);
    sent++;
  }
  const followers = await sendFollowerNotes(db, siteUrl);
  return { due: data?.length ?? 0, sent, followerEmails: followers };
}

// New series parts: email each confirmed follower of that series once.
async function sendFollowerNotes(db: SupabaseClient, siteUrl: string) {
  const { data: parts, error } = await db
    .from("courtyard_submissions")
    .select("id, title, series_id, series_part")
    .not("series_id", "is", null)
    .eq("status", "published")
    .eq("family_only", false)
    .lte("gathering_at", new Date().toISOString())
    .is("followers_notified_at", null)
    .is("deleted_at", null)
    .limit(50);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const part of parts ?? []) {
    const { data: series } = await db
      .from("courtyard_series")
      .select("slug, title, name")
      .eq("id", part.series_id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data: followers } = await db
      .from("courtyard_series_followers")
      .select("id, email")
      .eq("series_id", part.series_id)
      .not("confirmed_at", "is", null);
    if (series) {
      for (const f of followers ?? []) {
        const ok = await sendEmail({
          from: "The Courtyard at jambuch.in <courtyard@jambuch.in>",
          to: f.email,
          subject: `${series.title} · Part ${part.series_part}: “${part.title}”`,
          text: [
            `A new part of “${series.title}” by ${series.name} has joined the Courtyard:`,
            "",
            `Part ${part.series_part}: ${part.title}`,
            `${siteUrl}/courtyard/series/${series.slug}#piece-${part.id}`,
            "",
            `Stop these emails: ${unfollowUrl(siteUrl, f.id)}`,
          ].join("\n"),
        });
        if (ok) sent++;
      }
    }
    // Marked once tried, so followers never get the same part twice.
    await db.from("courtyard_submissions").update({ followers_notified_at: new Date().toISOString() }).eq("id", part.id);
  }
  return sent;
}
