import "server-only";
import { makeLink } from "./signed-links";
import { adminClient } from "./supabase-admin";
import type { InviteStage } from "./invite-stages";

// Courtyard rooms: a page of their own at /courtyard/<room_slug> for someone
// Jaydeep invited, who accepted the four room terms. The room is the invite
// row; what it shows is everything of theirs Jaydeep has approved (single
// pieces, series and books), matched by their email. They add work from
// /courtyard/my-room, signed in with the invited address, and every piece
// still waits for Jaydeep's approval.

// Addresses the Courtyard already uses, so no room can take them.
export const RESERVED_ROOM_SLUGS = [
  "add", "confirm", "follow", "invite", "letter", "media", "my-room", "room", "rooms",
  "series", "share", "unfollow", "admin", "api", "new", "edit",
];

export function roomSlugProblem(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Room address: small letters, numbers and single dashes only.";
  if (RESERVED_ROOM_SLUGS.includes(slug)) return `“${slug}” is used by the Courtyard itself. Please choose another address.`;
  return null;
}

// Stages where the owner has a room to work on: before it opens, while it is
// open, and while it rests. (After "left" or "revoked" it is gone.)
export const OWNER_STAGES: InviteStage[] = ["agreement_accepted", "room_draft", "needs_review", "live", "paused"];
export const DRAFT_STAGES: InviteStage[] = ["agreement_accepted", "room_draft"];

export type OwnRoom = {
  id: string;
  name: string;
  email: string;
  craft: string | null;
  room_slug: string | null;
  room_about: string | null;
  stage: InviteStage;
};

// The room that belongs to a signed-in person, if any.
export async function roomForUser(userId: string): Promise<OwnRoom | null> {
  const { data } = await adminClient()
    .from("courtyard_invites")
    .select("id, name, email, craft, room_slug, room_about, stage")
    .eq("accepted_user_id", userId)
    .in("stage", OWNER_STAGES)
    .is("deleted_at", null)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OwnRoom | null) ?? null;
}

// Whether an address belongs to someone with a room (for the sign-in form,
// which never says either way).
export async function hasRoom(email: string) {
  const { data } = await adminClient()
    .from("courtyard_invites")
    .select("id")
    .eq("email", email.toLowerCase())
    .not("accepted_user_id", "is", null)
    .in("stage", OWNER_STAGES)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export type RoomShelfItem = { slug: string; title: string; shape: string; status: string; parts: number };

// Everything of theirs on public view: single pieces that aren't part of a
// series (with the given public columns, which must include series_id), and
// their series and books with the number of parts so far.
export async function roomWork<P extends { series_id: string | null }>(email: string, columns: string) {
  const db = adminClient();
  const now = new Date().toISOString();
  const [{ data: pieces }, { data: series }] = await Promise.all([
    db
      .from("courtyard_submissions")
      .select(columns)
      .eq("email", email.toLowerCase())
      .eq("kind", "single_piece")
      .eq("status", "published")
      .eq("family_only", false)
      .lte("gathering_at", now)
      .is("deleted_at", null)
      .order("gathering_at", { ascending: false })
      .limit(300),
    db
      .from("courtyard_series")
      .select("id, slug, title, shape, status")
      .eq("email", email.toLowerCase())
      .in("status", ["active", "paused", "ended"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const all = (pieces ?? []) as unknown as P[];
  const shelf: RoomShelfItem[] = (series ?? [])
    .map((s) => ({ slug: s.slug, title: s.title, shape: s.shape, status: s.status, parts: all.filter((p) => p.series_id === s.id).length }))
    .filter((s) => s.parts > 0);
  const singles = all.filter((p) => !p.series_id);
  return { shelf, singles };
}

// The owner's "share more" link token, so My room can reuse the Courtyard
// form exactly as returning contributors do (no confirmation step, and every
// piece still waits for Jaydeep). Creates their contributor row if needed.
export async function contributorTokenFor(room: OwnRoom, city: string | null = null) {
  const db = adminClient();
  const email = room.email.toLowerCase();
  const { data: existing } = await db
    .from("courtyard_contributors")
    .select("id, name, city, link_version")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  let c = existing;
  if (!c) {
    const { data, error } = await db
      .from("courtyard_contributors")
      .insert({ email, name: room.name, city })
      .select("id, name, city, link_version")
      .single();
    if (error || !data) throw new Error(error?.message ?? "contributor not saved");
    c = data;
  }
  return { token: makeLink("contrib-share", c.id, c.link_version), name: c.name as string, city: (c.city as string | null) ?? null };
}
