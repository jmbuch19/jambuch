import { revalidatePath } from "next/cache";
import { sendGatheringNotes } from "@/lib/gathering-notes";
import { sendGatheringLetter } from "@/lib/letter";
import { adminClient } from "@/lib/supabase-admin";

// Called every 15 minutes by Supabase pg_cron with CRON_SECRET as a bearer
// token. When a weekly gathering has begun, it refreshes the Courtyard page
// and emails each contributor "Your turn is in the courtyard tonight".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const db = adminClient();
    const site = new URL(request.url).origin;
    const result = await sendGatheringNotes(db, site);
    if (result.due > 0 || result.followerEmails > 0) {
      revalidatePath("/courtyard");
      revalidatePath("/courtyard/series/[slug]", "page");
    }
    // The Sunday letter, once per gathering (within a few hours of it).
    const letter = await sendGatheringLetter(db, site);
    return Response.json({ ok: true, ...result, letter, at: new Date().toISOString() });
  } catch (err) {
    console.error("gathering:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
