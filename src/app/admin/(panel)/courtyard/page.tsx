import { requireAdmin } from "@/lib/admin";
import { nextGathering, parseGathering } from "@/lib/gathering";
import { WAITING_ON_ME, type InviteStage } from "@/lib/invites";
import CourtyardAdmin, { type InviteRow, type SeriesRow, type SubmissionRow } from "./courtyard-admin";

// Stages that hold a room (or the promise of one), counted against the yearly limit.
const ROOM_STAGES: InviteStage[] = ["agreement_accepted", "room_draft", "needs_review", "live", "paused"];
const WAITING_ON_THEM: InviteStage[] = ["invited", "room_draft"];

export default async function CourtyardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db } = await requireAdmin();

  const [invitesRes, subsRes, limitRes, gatheringRes, seriesRes, followersRes] = await Promise.all([
    // Never select token_hash: link fingerprints stay on the server.
    db
      .from("courtyard_invites")
      .select("id, name, email, whatsapp, relation, craft, room_slug, note, stage, sent_at, expires_at, accepted_at, updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Unconfirmed submissions never reach the admin.
    db
      .from("courtyard_submissions")
      .select(
        "id, kind, status, name, email, city, form, themes, title, body, file_url, file_type, file_name, links, about, creator_name, relation, why, creator_contact, creator_aware, invite_id, family_only, thread_from, gathering_at, gathering_notified_at, series_id, series_part, created_at, published_at",
      )
      .neq("status", "unconfirmed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("settings").select("value").eq("key", "courtyard.room_limit_per_year").maybeSingle(),
    db.from("settings").select("value").eq("key", "courtyard.gathering").maybeSingle(),
    db
      .from("courtyard_series")
      .select("id, slug, title, description, name, email, form, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    db.from("courtyard_series_followers").select("series_id").not("confirmed_at", "is", null),
  ]);
  const gathering = parseGathering(gatheringRes.data?.value);

  const invites = (invitesRes.data ?? []) as InviteRow[];
  type Raw = Omit<SubmissionRow, "has_file" | "thread_from_title" | "series_title"> & {
    file_url: string | null;
    thread_from: string | null;
  };
  const raw = (subsRes.data ?? []) as unknown as Raw[];
  const seriesList = (seriesRes.data ?? []) as Omit<SeriesRow, "parts" | "waiting" | "followers" | "last_part_at">[];
  const seriesTitle = new Map(seriesList.map((s) => [s.id, s.title]));

  // Names the piece each one picks up the thread from.
  const parentIds = [...new Set(raw.map((s) => s.thread_from).filter((x): x is string => !!x))];
  const parents = new Map<string, string>();
  if (parentIds.length) {
    const { data } = await db.from("courtyard_submissions").select("id, name, title").in("id", parentIds);
    for (const p of data ?? []) parents.set(p.id, `${p.name}’s “${p.title ?? "piece"}”`);
  }
  const submissions: SubmissionRow[] = raw.map(({ file_url, thread_from, ...s }) => ({
    ...s,
    has_file: !!file_url,
    thread_from_title: thread_from ? (parents.get(thread_from) ?? "an earlier piece") : null,
    series_title: s.series_id ? (seriesTitle.get(s.series_id) ?? null) : null,
  }));

  const followerCount = new Map<string, number>();
  for (const f of followersRes.data ?? []) followerCount.set(f.series_id, (followerCount.get(f.series_id) ?? 0) + 1);
  const series: SeriesRow[] = seriesList.map((s) => {
    const parts = submissions.filter((p) => p.series_id === s.id);
    const published = parts.filter((p) => p.status === "published");
    return {
      ...s,
      parts: published.length,
      waiting: parts.filter((p) => p.status === "new").length,
      followers: followerCount.get(s.id) ?? 0,
      last_part_at: published.map((p) => p.gathering_at ?? p.published_at).sort().at(-1) ?? null,
    };
  });

  const limit = Number(limitRes.data?.value ?? 5) || 5;
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const used = invites.filter(
    (i) => ROOM_STAGES.includes(i.stage) && i.accepted_at != null && i.accepted_at >= yearStart,
  ).length;

  return (
    <CourtyardAdmin
      invites={invites}
      submissions={submissions}
      series={series}
      initialTab={tab === "requests" ? "requests" : tab === "series" ? "series" : "invites"}
      limit={limit}
      used={used}
      gathering={gathering}
      nextGatheringAt={nextGathering(gathering).toISOString()}
      counts={{
        them: invites.filter((i) => WAITING_ON_THEM.includes(i.stage)).length,
        me: invites.filter((i) => WAITING_ON_ME.includes(i.stage)).length,
        live: invites.filter((i) => i.stage === "live").length,
      }}
      error={invitesRes.error?.message ?? subsRes.error?.message ?? seriesRes.error?.message ?? null}
    />
  );
}
