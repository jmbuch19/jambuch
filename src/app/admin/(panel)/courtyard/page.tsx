import { requireAdmin } from "@/lib/admin";
import { WAITING_ON_ME, type InviteStage } from "@/lib/invites";
import CourtyardAdmin, { type InviteRow, type SubmissionRow } from "./courtyard-admin";

// Stages that hold a room (or the promise of one), counted against the yearly limit.
const ROOM_STAGES: InviteStage[] = ["agreement_accepted", "room_draft", "needs_review", "live", "paused"];
const WAITING_ON_THEM: InviteStage[] = ["invited", "room_draft"];

export default async function CourtyardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db } = await requireAdmin();

  const [invitesRes, subsRes, limitRes] = await Promise.all([
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
        "id, kind, status, name, email, city, category, title, body, file_url, file_type, file_name, links, about, creator_name, relation, why, invite_id, created_at, published_at",
      )
      .neq("status", "unconfirmed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("settings").select("value").eq("key", "courtyard.room_limit_per_year").maybeSingle(),
  ]);

  const invites = (invitesRes.data ?? []) as InviteRow[];
  const submissions = ((subsRes.data ?? []) as (Omit<SubmissionRow, "has_file"> & { file_url: string | null })[]).map(
    ({ file_url, ...s }) => ({ ...s, has_file: !!file_url }),
  );
  const limit = Number(limitRes.data?.value ?? 5) || 5;
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const used = invites.filter(
    (i) => ROOM_STAGES.includes(i.stage) && i.accepted_at != null && i.accepted_at >= yearStart,
  ).length;

  return (
    <CourtyardAdmin
      invites={invites}
      submissions={submissions}
      initialTab={tab === "requests" ? "requests" : "invites"}
      limit={limit}
      used={used}
      counts={{
        them: invites.filter((i) => WAITING_ON_THEM.includes(i.stage)).length,
        me: invites.filter((i) => WAITING_ON_ME.includes(i.stage)).length,
        live: invites.filter((i) => i.stage === "live").length,
      }}
      error={invitesRes.error?.message ?? subsRes.error?.message ?? null}
    />
  );
}
