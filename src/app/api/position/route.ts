import { sessionClient } from "@/lib/supabase-server";

// A signed-in member's reading positions (one per book), so "Continue
// reading" works on any of their devices. Anonymous readers keep theirs in the
// browser only and never call this (see library/bookmarks.ts). Row-level
// security limits every member to their own rows.
export const dynamic = "force-dynamic";

const PATH = /^\/library\/[a-z0-9-]{1,80}\/[^/?#\s]{1,120}$/;
const SLUG = /^[a-z0-9-]{1,80}$/;

async function member() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db, user } : null;
}

export async function GET() {
  const m = await member();
  if (!m) return Response.json([]);
  const { data, error } = await m.db
    .from("reading_positions")
    .select("work, path, title, book, para, saved_at")
    .order("saved_at", { ascending: false })
    .limit(50);
  if (error) return Response.json([]);
  return Response.json(
    (data ?? []).map((r) => ({ ...r, saved_at: undefined, at: new Date(r.saved_at).getTime() })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let p: Record<string, unknown>;
  try {
    p = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const { work, path, title, book, para, at } = p;
  if (
    typeof work !== "string" ||
    !SLUG.test(work) ||
    typeof path !== "string" ||
    !PATH.test(path) ||
    !path.startsWith(`/library/${work}/`) ||
    typeof title !== "string" ||
    !Number.isInteger(para) ||
    (para as number) < 0 ||
    (para as number) > 100000
  ) {
    return new Response(null, { status: 400 });
  }
  const m = await member();
  if (!m) return new Response(null, { status: 204 });

  // Never later than now, so a wrong phone clock can't pin an old place on top.
  const when = Math.min(typeof at === "number" ? at : Date.now(), Date.now());
  const { error } = await m.db.from("reading_positions").upsert(
    {
      user_id: m.user.id,
      work,
      path,
      title: title.slice(0, 200),
      book: typeof book === "string" ? book.slice(0, 200) : null,
      para,
      saved_at: new Date(when).toISOString(),
    },
    { onConflict: "user_id,work" },
  );
  if (error) console.error("reading position not saved:", error.message);
  return new Response(null, { status: 204 });
}
