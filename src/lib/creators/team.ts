import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { flowSettings } from "./flow";

// Roles, not names (owner's decision, 26 Nov 2026). Everything the studio does by hand is done
// by a role: an admin runs the service, a director directs "Varta Vishva Directors" orders,
// a reviewer checks orders and answers needs_human alerts. Today one person holds every
// role; until the team table has a row, every role falls back to ADMIN_EMAIL.

export type Role = "admin" | "director" | "reviewer";
export type Member = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  on_duty: boolean;
  hourly_inr: number;
  directing_since: string | null;
  confidentiality_signed: string | null;
  active: boolean;
};

const FIELDS = "id, name, email, roles, on_duty, hourly_inr, directing_since, confidentiality_signed, active";

export async function teamMembers(): Promise<Member[]> {
  const { data } = await adminClient().from("creator_team").select(FIELDS).order("created_at");
  return (data ?? []) as Member[];
}

// A member may work on writers' stories only once the confidentiality agreement is signed.
export const cleared = (m: Member) => m.active && !!m.confidentiality_signed;

// Where an alert for a role goes: active, cleared members with that role (for "reviewer",
// the on-duty one first). Falls back to ADMIN_EMAIL.
export async function alertTo(role: Role): Promise<string | null> {
  const team = (await teamMembers()).filter((m) => cleared(m) && m.roles.includes(role));
  const pick = role === "reviewer" ? (team.find((m) => m.on_duty) ?? team[0]) : team[0];
  return pick?.email ?? process.env.ADMIN_EMAIL ?? null;
}

// The address writers reply to: the studio's, not a person's.
export const studioReplyTo = () => process.env.STUDIO_EMAIL || process.env.ADMIN_EMAIL || undefined;

// How writers' emails are signed and sent (the team voice).
export const STUDIO_FROM = "Varta Vishva <creators@jambuch.in>";
export const STUDIO_SIGNATURE = ["The Varta Vishva team", "Creator's Space · jambuch.in/creators"];

// ---------------------------------------------------------------- Varta Vishva Directors

export type DirectedSettings = { opens_on: string; cap_first_month: number; cap_after: number };
export const DIRECTED_DEFAULTS: DirectedSettings = { opens_on: "2027-01-04", cap_first_month: 1, cap_after: 2 };

export async function directedSettings(): Promise<DirectedSettings> {
  const f = (await flowSettings()) as unknown as { directed?: Partial<DirectedSettings> };
  return { ...DIRECTED_DEFAULTS, ...(f.directed ?? {}) };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const mondayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));

// A director's weekly cap: cap_first_month for the first four weeks they direct, then cap_after.
function capFor(m: { directing_since: string | null }, week: Date, s: DirectedSettings) {
  const since = new Date(`${m.directing_since ?? s.opens_on}T00:00:00Z`);
  if (week.getTime() + 7 * 86400_000 <= since.getTime()) return 0; // not directing yet
  return week.getTime() < since.getTime() + 28 * 86400_000 ? s.cap_first_month : s.cap_after;
}

// The directors who can take orders (cleared, active, with the director role). With no team
// rows yet, one stand-in director (the admin) directing from the opening date.
async function directors(): Promise<Pick<Member, "id" | "directing_since">[]> {
  const list = (await teamMembers()).filter((m) => cleared(m) && m.roles.includes("director"));
  return list.length ? list : [{ id: "", directing_since: null }];
}

// When can a new directed order start? null = this week; otherwise the date (the opening date,
// or the Monday of the first week with room).
export async function directedStart(): Promise<string | null> {
  const s = await directedSettings();
  const today = new Date();
  const opens = new Date(`${s.opens_on}T00:00:00Z`);
  const list = await directors();
  const db = adminClient();
  let week = mondayOf(today > opens ? today : opens);
  for (let i = 0; i < 26; i++, week = new Date(week.getTime() + 7 * 86400_000)) {
    const cap = list.reduce((sum, m) => sum + capFor(m, week, s), 0);
    const { count } = await db
      .from("creator_requests")
      .select("id", { count: "exact", head: true })
      .in("state", ["sample_due", "submitted", "ordered"])
      .eq("answers->>service", "directed")
      .gte("plan_approved_at", week.toISOString())
      .lt("plan_approved_at", new Date(week.getTime() + 7 * 86400_000).toISOString());
    if ((count ?? 0) < cap) {
      const start = week.getTime() > today.getTime() ? week : opens > today ? opens : null;
      return start ? day(start) : null;
    }
  }
  return day(week);
}

// The per-order credit line for a directed order.
export function directedCredit(directorName: string) {
  return `Directed by ${directorName}, Varta Vishva Directors · AI-assisted voices and illustrations`;
}
export const STUDIO_CREDIT = "Made by Varta Vishva Studio · AI-assisted voices and illustrations";

// A directed order gets the cleared director with the fewest open directed orders (the admin
// can change it). With no team rows yet, nobody is set and the alert goes to ADMIN_EMAIL.
// Returns the director's email for the alert.
export async function assignDirector(requestId: string): Promise<{ id: string | null; email: string | null; name: string | null }> {
  const db = adminClient();
  const { data: cur } = await db.from("creator_requests").select("director_id").eq("id", requestId).maybeSingle();
  const team = (await teamMembers()).filter((m) => cleared(m) && m.roles.includes("director"));
  if (cur?.director_id) {
    const m = team.find((x) => x.id === cur.director_id);
    if (m) return { id: m.id, email: m.email, name: m.name };
  }
  if (!team.length) return { id: null, email: process.env.ADMIN_EMAIL ?? null, name: null };
  const { data: open } = await db
    .from("creator_requests")
    .select("director_id")
    .in("state", ["sample_due", "submitted", "ordered"])
    .not("director_id", "is", null);
  const load = (id: string) => (open ?? []).filter((r) => r.director_id === id).length;
  const pick = [...team].sort((a, b) => load(a.id) - load(b.id))[0];
  await db.from("creator_requests").update({ director_id: pick.id, director_assigned_at: new Date().toISOString() }).eq("id", requestId);
  return { id: pick.id, email: pick.email, name: pick.name };
}

// ---------------------------------------------------------------- story access log

// Every time a team member opens a writer's story (or its plan, draft or files) it is logged.
export async function logStoryAccess(requestId: string, who: string | null | undefined, role: Role, what: string) {
  await adminClient()
    .from("creator_story_access")
    .insert({ request_id: requestId, who: (who ?? "unknown").toLowerCase(), role, what })
    .then(({ error }) => error && console.error("story access log failed:", error.message));
}
