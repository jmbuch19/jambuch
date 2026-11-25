"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";

// The one-day test, part 1: RENDER ONLY (brief §6F "First steps"; Jaydeep, 25 Nov 2026).
// One session of the test agent in the test environment, with a hard $5 cap. No client
// story, no ElevenLabs, no image service: the agent makes synthetic stills and audio itself
// and renders a 12-minute 1080p moving-stills video the way the Ramayana engine does, then
// reports what worked, how long each part took, and deletes its files.
//
// Session-only overrides (the agent itself is not changed): its own instructions for this
// test, and tools that run without asking (no one approves commands inside a test run).

const SETTING = "creators.engine_test";
const AGENT_ID = "agent_01CGNoo1zESuPHn573PPoD3F";
const ENVIRONMENT_ID = "env_01TLba2ss3ucfbkhakLrGdQD";
const BUDGET_CENTS = "500"; // $5.00, list prices (tokens + running time)

const SYSTEM = `You are running a one-off technical test for Creator's Space (jambuch.in). Work only inside /tmp/rendertest. Use no client material, no network except installing packages, and no paid services. Report facts only; if something fails, say exactly what and stop that part. At the end delete /tmp/rendertest.`;

const TASK = `Render-only test. Do these steps in order and time each one (wall clock, seconds).

1. Report the machine: OS and version, CPU model and count, RAM, free disk in /tmp.
2. Get FFmpeg: try \`apt-get update && apt-get install -y ffmpeg fonts-noto-core\`; if that fails, \`pip install imageio-ffmpeg\` and use its binary. Report the FFmpeg version and whether the libx264 and drawtext filters exist, and whether a Gujarati font (Noto Sans Gujarati) is installed.
3. Make test material in /tmp/rendertest: 20 still images 2048x1152 PNG (use ffmpeg testsrc2 or gradients, each different), and a 12-minute stereo 44.1 kHz audio file (a quiet tone plus soft noise, -16 LUFS is not needed).
4. Render the video as the narrated-paintings format does: 1920x1080, 25 fps, H.264 (libx264, CRF 20, preset medium), AAC 192 kbps. Each still is on screen about 36 seconds with a slow zoom/pan (zoompan) and a 1-second crossfade to the next; over the first 10 seconds draw one caption line in Gujarati, "રામાયણ કસોટી", with Noto Sans Gujarati (skip the caption if the font is missing and say so). Total length must match the audio (12 minutes).
5. Check the output with ffprobe or ffmpeg: duration, resolution, frame rate, codecs, file size.
6. Report: every step's time; the render's speed as (video minutes ÷ render minutes); peak memory if you can see it; any warnings or errors; and anything that would block producing real 12-minute chapters here.
7. Delete /tmp/rendertest and confirm it is gone.`;

async function load() {
  const { data } = await adminClient().from("settings").select("value").eq("key", SETTING).maybeSingle();
  return (data?.value as { session_id?: string; started_at?: string } | null) ?? null;
}

export async function startEngineTest() {
  await requireAdmin();
  const current = await load();
  if (current?.session_id) return; // one test at a time; delete the old one first
  const client = new Anthropic({ maxRetries: 1, timeout: 30_000 });
  const session = await client.beta.sessions.create({
    agent: {
      type: "agent_with_overrides",
      id: AGENT_ID,
      system: SYSTEM,
      tools: [{ type: "agent_toolset_20260401", default_config: { enabled: true, permission_policy: { type: "always_allow" } } }],
    },
    environment_id: ENVIRONMENT_ID,
    title: "Creator's Space render-only test",
    budget: { type: "limit", max_list_cost: { amount: BUDGET_CENTS, currency: "USD" } },
    initial_events: [{ type: "user.message", content: [{ type: "text", text: TASK }] }],
  });
  await adminClient()
    .from("settings")
    .upsert({ key: SETTING, value: { session_id: session.id, started_at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  revalidatePath("/admin/creators/agent");
}

// Deletes the test session (its transcript and container) and forgets it.
export async function deleteEngineTest() {
  await requireAdmin();
  const current = await load();
  if (current?.session_id) {
    const client = new Anthropic({ maxRetries: 1, timeout: 30_000 });
    try {
      await client.beta.sessions.delete(current.session_id);
    } catch (e) {
      console.error("engine test: delete failed", e instanceof Error ? e.message : e);
    }
  }
  await adminClient().from("settings").delete().eq("key", SETTING);
  revalidatePath("/admin/creators/agent");
}


export async function engineTestView(): Promise<{
  id: string;
  started_at: string;
  status: string;
  cost: string;
  active_seconds: number | null;
  lines: { kind: string; text: string }[];
  error?: string;
} | null> {
  const current = await load();
  if (!current?.session_id) return null;
  const client = new Anthropic({ maxRetries: 1, timeout: 30_000 });
  try {
    const s = await client.beta.sessions.retrieve(current.session_id);
    const usage = s.usage as unknown as { list_cost?: { amount?: string } | null; active_seconds?: number };
    const lines: { kind: string; text: string }[] = [];
    for await (const ev of client.beta.sessions.events.list(current.session_id)) {
      const e = ev as unknown as { type: string; content?: { type: string; text?: string }[]; name?: string; input?: unknown; stop_reason?: unknown };
      if (e.type === "agent.message") lines.push({ kind: "agent", text: (e.content ?? []).map((c) => c.text ?? "").join("") });
      else if (e.type === "agent.tool_use") lines.push({ kind: "tool", text: `${e.name ?? "tool"}: ${JSON.stringify(e.input).slice(0, 300)}` });
      else if (e.type === "session.status_idle") lines.push({ kind: "status", text: `idle ${JSON.stringify(e.stop_reason ?? "")}` });
      else if (e.type === "session.error") lines.push({ kind: "error", text: JSON.stringify(ev).slice(0, 500) });
      if (lines.length > 400) break;
    }
    return {
      id: s.id,
      started_at: current.started_at ?? "",
      status: s.status,
      cost: usage?.list_cost?.amount ? `$${(Number(usage.list_cost.amount) / 100).toFixed(2)}` : "—",
      active_seconds: usage?.active_seconds ?? null,
      lines: lines.slice(-60),
    };
  } catch (e) {
    return { id: current.session_id, started_at: current.started_at ?? "", status: "unknown", cost: "—", active_seconds: null, lines: [], error: e instanceof Error ? e.message : String(e) };
  }
}
