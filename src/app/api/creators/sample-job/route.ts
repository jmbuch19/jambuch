import { after } from "next/server";
import { runSampleJob } from "@/lib/creators/sample-job";

// Makes, checks and sends one paid sample (src/lib/creators/sample-job.ts). Called by the
// payment confirmation and the daily job with CRON_SECRET; answers at once and does the work
// after the response (Claude, ElevenLabs, Freesound, FFmpeg: up to a few minutes).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorised", { status: 401 });
  }
  let id = "";
  try {
    id = String(((await request.json()) as { id?: string }).id ?? "");
  } catch {
    /* empty body */
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("bad id", { status: 400 });
  after(async () => {
    try {
      const r = await runSampleJob(id, "auto");
      console.log("sample job", id, r.status, r.message);
    } catch (e) {
      console.error("sample job crashed", id, e instanceof Error ? e.message : e);
    }
  });
  return new Response("started", { status: 202 });
}
