import "server-only";
import { formLabel } from "./courtyard";
import { adminClient } from "./supabase-admin";
import { youtubeId } from "./youtube";

// "From the Courtyard": the guests' desk on the home page. Up to three
// approved, public pieces, one per person: the ones Jaydeep pins first, then
// pieces from the latest gathering. When a gathering has more pieces than
// places, they take turns (a new order every hour), so everyone gets seen.
// Pieces are read on the server; only these fields reach the page.

export type GuestPiece = {
  id: string;
  title: string;
  name: string;
  city: string | null;
  form: string; // its label, e.g. "Poetry"
  go: "Read" | "Listen" | "See" | "Watch";
  hasAudioStory: boolean;
};

const PLACES = 3;

type Row = {
  id: string;
  email: string;
  name: string;
  city: string | null;
  form: string;
  title: string;
  body: string | null;
  file_type: string | null;
  links: string[];
  gathering_at: string;
  home_pinned: boolean;
  media_stage: string | null;
};

// A stable shuffle for this hour: the same order for everyone, changing hourly.
function hourOrder(rows: Row[]) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const score = (id: string) => {
    let h = hour;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  return [...rows].sort((a, b) => score(a.id) - score(b.id));
}

function go(r: Row): GuestPiece["go"] {
  if (r.media_stage === "made") return "Listen";
  if (r.links.some((l) => youtubeId(l))) return "Watch";
  if (r.file_type?.startsWith("audio/")) return "Listen";
  if (r.file_type?.startsWith("image/") && !r.body) return "See";
  return "Read";
}

export async function loadGuestDesk(): Promise<GuestPiece[]> {
  try {
    const { data, error } = await adminClient()
      .from("courtyard_submissions")
      .select("id, email, name, city, form, title, body, file_type, links, gathering_at, home_pinned, media_stage")
      .eq("kind", "single_piece")
      .eq("status", "published")
      .eq("family_only", false)
      .lte("gathering_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("gathering_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];

    const latest = rows.find((r) => !r.home_pinned)?.gathering_at;
    const pinned = rows.filter((r) => r.home_pinned);
    const thisWeek = hourOrder(rows.filter((r) => !r.home_pinned && r.gathering_at === latest));
    const chosen: Row[] = [];
    const people = new Set<string>();
    for (const r of [...pinned, ...thisWeek]) {
      if (chosen.length === PLACES) break;
      if (people.has(r.email)) continue;
      people.add(r.email);
      chosen.push(r);
    }
    return chosen.map((r) => ({
      id: r.id,
      title: r.title,
      name: r.name,
      city: r.city,
      form: formLabel(r.form),
      go: go(r),
      hasAudioStory: r.media_stage === "made",
    }));
  } catch (err) {
    console.error("guest desk:", err instanceof Error ? err.message : err);
    return [];
  }
}
