import { isAdminVisit } from "@/lib/admin-visit";
import { adminClient } from "@/lib/supabase-admin";

// Receives anonymous listening heartbeats from the chapter player
// (listen-player.tsx, every 15 s while playing and on pause/close) into
// chapter_listens. Same rules as reading: no personal data, and the admin's
// own listening is not counted.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKS = ["play", "spoken", "niranjan", "dhwani"];
const DEVICES = ["phone", "tablet", "desktop"];
const SPEEDS = ["0.75", "1", "1.25", "1.5", "2"];

const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const ints = (v: unknown, max: number, limit: number) =>
  Array.isArray(v) ? v.map((x) => int(x, 0, max)).filter((x): x is number => x !== null).slice(0, limit) : [];

export async function POST(request: Request) {
  let note: Record<string, unknown>;
  try {
    note = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const { chapterId, readerId } = note;
  if (typeof chapterId !== "string" || !UUID.test(chapterId) || typeof readerId !== "string" || !UUID.test(readerId)) {
    return new Response(null, { status: 400 });
  }
  if (await isAdminVisit()) return new Response(null, { status: 204 });

  const speed: Record<string, number> = {};
  if (note.speed && typeof note.speed === "object") {
    for (const [k, v] of Object.entries(note.speed as Record<string, unknown>)) {
      const s = int(v, 0, 120);
      if (SPEEDS.includes(k) && s) speed[k] = s;
    }
  }
  const { error } = await adminClient().rpc("record_listen", {
    p_chapter: chapterId,
    p_reader: readerId,
    p_track: typeof note.track === "string" && TRACKS.includes(note.track) ? note.track : null,
    p_open: note.open === true,
    p_listened: int(note.listened, 0, 120) ?? 0,
    p_position: int(note.position, 0, 36000) ?? 0,
    p_duration: int(note.duration, 1, 36000),
    p_minutes: ints(note.minutes, 600, 120),
    p_rewinds: ints(note.rewinds, 36000, 50),
    p_skips: int(note.skips, 0, 100) ?? 0,
    p_speed: speed,
    p_device: typeof note.device === "string" && DEVICES.includes(note.device) ? note.device : null,
  });
  if (error) console.error("record_listen failed:", error.message);
  return new Response(null, { status: 204 });
}
