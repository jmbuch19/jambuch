import { publicClient } from "@/lib/supabase";

// Called once a day by Vercel Cron (see vercel.json) so the free Supabase
// project never pauses for inactivity. Vercel sends CRON_SECRET as a bearer
// token; anyone else gets a 401.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { error } = await publicClient().from("site_text").select("key").limit(1);
  if (error) {
    console.error("keep-awake query failed:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}
