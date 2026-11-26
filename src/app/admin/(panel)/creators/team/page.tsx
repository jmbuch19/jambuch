import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";
import { cleared, directedSettings, directedStart, teamMembers, type Member } from "@/lib/creators/team";
import { legalEntity } from "@/lib/creators/legal";
import { saveJsonSetting, saveTeamMember } from "../actions";
import a from "../../../admin.module.css";

// The Creator's Space team (owner's decision, 26 Nov 2026): roles, not names. Admin runs the
// service, a director directs Varta Vishva Directors orders, the on-duty reviewer gets the
// needs_human alerts and checks orders. Until a member is added here, every role falls back
// to the admin email.
export const dynamic = "force-dynamic";

function MemberForm({ m }: { m?: Member }) {
  return (
    <form action={saveTeamMember} className={a.form}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <label>
        Name (shown in the credit line of the orders they direct)
        <input name="name" defaultValue={m?.name ?? ""} required maxLength={120} />
      </label>
      <label>
        Email (alerts and orders go here)
        <input name="email" type="email" defaultValue={m?.email ?? ""} required />
      </label>
      <p className={a.mutedSmall}>
        Roles:{" "}
        {(["admin", "director", "reviewer"] as const).map((r) => (
          <label key={r} style={{ display: "inline", marginRight: 12 }}>
            <input type="checkbox" name={`role_${r}`} defaultChecked={m?.roles.includes(r)} /> {r}
          </label>
        ))}
        <label style={{ display: "inline", marginRight: 12 }}>
          <input type="checkbox" name="on_duty" defaultChecked={m?.on_duty} /> on-duty reviewer
        </label>
        <label style={{ display: "inline" }}>
          <input type="checkbox" name="active" defaultChecked={m ? m.active : true} /> active
        </label>
      </p>
      <label>
        Confidentiality agreement signed on (no access or orders before this)
        <input name="confidentiality_signed" type="date" defaultValue={m?.confidentiality_signed ?? ""} />
      </label>
      <label>
        Directing since (weekly cap: the first month, then the later cap)
        <input name="directing_since" type="date" defaultValue={m?.directing_since ?? ""} />
      </label>
      <label>
        Hourly rate (₹)
        <input name="hourly_inr" type="number" min={0} max={100000} defaultValue={m?.hourly_inr ?? 1000} />
      </label>
      <button type="submit" className={a.secondary}>
        {m ? "Save" : "Add to the team"}
      </button>
    </form>
  );
}

export default async function TeamPage() {
  await requireAdmin();
  const [team, directed, start, legal] = await Promise.all([teamMembers(), directedSettings(), directedStart(), legalEntity()]);
  const { data: access } = await adminClient()
    .from("creator_story_access")
    .select("request_id, who, role, what, at")
    .order("at", { ascending: false })
    .limit(30);
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <>
      <p className={a.crumb}>
        <Link href="/admin/creators">← Creator’s Space requests</Link>
      </p>
      <h1 className={a.title}>Team and roles</h1>
      <p className={a.intro}>
        Admin runs the service; a <b>director</b> directs Varta Vishva Directors orders (assigned automatically to the
        cleared director with the fewest open orders, changeable on each request); the <b>on-duty reviewer</b> gets the
        “needs your eye” alerts and checks orders. With nobody here, everything goes to the admin email. Separate sign-ins
        for team members (each seeing only their assigned orders) come before the first person joins (brief §6J).
      </p>

      <h2 className={a.gapTop}>Members</h2>
      {!team.length && <p className={a.empty}>Nobody yet: every role is the admin email.</p>}
      {team.map((m) => (
        <details key={m.id} className={a.gapTop}>
          <summary>
            <b>{m.name}</b> · {m.roles.join(", ") || "no role"}
            {m.on_duty ? " · on duty" : ""}
            {!m.active ? " · inactive" : !cleared(m) ? " · NOT CLEARED (no confidentiality date)" : ""}
          </summary>
          <MemberForm m={m} />
        </details>
      ))}
      <h2 className={a.gapTop}>Add a member</h2>
      <MemberForm />

      <h2 className={a.gapTop}>Varta Vishva Directors</h2>
      <p className={a.mutedSmall}>
        Opens on <b>{directed.opens_on}</b> · weekly cap per director: {directed.cap_first_month} in their first month, then{" "}
        {directed.cap_after} · next start for a new order: <b>{start ?? "this week"}</b>. Change these in the question flow
        settings (“directed”).
      </p>

      <h2 className={a.gapTop}>Legal entity</h2>
      <p className={a.mutedSmall}>
        Named on the terms, the privacy page and invoices; “we” in those texts means it. Add the GSTIN when it arrives;
        later the One Person Company replaces the entity.
      </p>
      <form action={saveJsonSetting} className={a.form}>
        <input type="hidden" name="key" value="creators.legal" />
        <textarea name="value" rows={7} defaultValue={JSON.stringify(legal, null, 2)} style={{ fontFamily: "monospace", fontSize: 13, width: "100%" }} />
        <button type="submit" className={a.secondary}>
          Save legal entity
        </button>
      </form>

      <h2 className={a.gapTop}>Recent story access</h2>
      {!access?.length ? (
        <p className={a.empty}>No story opened yet.</p>
      ) : (
        <ul className={a.mutedSmall}>
          {access.map((x, i) => (
            <li key={i}>
              {when(x.at)} · {x.who} ({x.role}) · {x.what} ·{" "}
              <Link href={`/admin/creators/${x.request_id}`}>request</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
