import { revalidatePath } from "next/cache";
import { sendGatheringNotes } from "@/lib/gathering-notes";
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
    const result = await sendGatheringNotes(adminClient(), new URL(request.url).origin);
    if (result.due > 0) revalidatePath("/courtyard");
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    console.error("gathering:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
