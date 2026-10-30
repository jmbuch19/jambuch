import { cookies } from "next/headers";
import { isAdminEmail } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";
import { sessionClient } from "@/lib/supabase-server";

// Receives anonymous notes from the chapter reader: reading (read-tracker.tsx,
// into chapter_reads) and blocked copy/save/print attempts (reading-guard.tsx,
// into protect_attempts). The admin's own visits are not counted.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICES = ["phone", "tablet", "desktop"];
const THEMES = ["paper", "white", "sepia", "night"];
const SPACINGS = ["compact", "normal", "wide"];

const pick = (value: unknown, allowed: string[]) =>
  typeof value === "string" && allowed.includes(value) ? value : null;

// Only a signed-in visitor can be the admin, and only they carry a Supabase
// session cookie, so ordinary readers never cost an extra sign-in check.
async function isAdminVisit() {
  const store = await cookies();
  if (!store.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))) return false;
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  return isAdminEmail(user?.email);
}

export async function POST(request: Request) {
  let note: Record<string, unknown>;
  try {
    note = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { chapterId, readerId } = note;
  if (typeof chapterId !== "string" || !UUID.test(chapterId) || typeof readerId !== "string" || !UUID.test(readerId)) {
    return new Response(null, { status: 400 });
  }
  if (await isAdminVisit()) return new Response(null, { status: 204 });

  // A note of blocked copy / save / print attempts (from reading-guard.tsx).
  if (note.attempts && typeof note.attempts === "object") {
    const { error } = await adminClient().rpc("record_attempts", {
      p_chapter: chapterId,
      p_reader: readerId,
      p_counts: note.attempts,
    });
    if (error) console.error("record_attempts failed:", error.message);
    return new Response(null, { status: 204 });
  }

  const seconds = Math.min(120, Math.max(0, Math.round(Number(note.seconds) || 0)));
  const size = Number(note.size);
  const { error } = await adminClient().rpc("record_read", {
    p_chapter: chapterId,
    p_reader: readerId,
    p_open: note.open === true,
    p_seconds: seconds,
    p_finished: note.finished === true,
    p_device: pick(note.device, DEVICES),
    p_theme: pick(note.theme, THEMES),
    p_size: Number.isInteger(size) && size >= 12 && size <= 40 ? size : null,
    p_spacing: pick(note.spacing, SPACINGS),
  });
  if (error) console.error("record_read failed:", error.message);
  return new Response(null, { status: 204 });
}
