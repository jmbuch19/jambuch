import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";

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
  return { due: data?.length ?? 0, sent };
}
