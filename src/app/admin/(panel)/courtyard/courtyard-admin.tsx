"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  FORMS,
  KIND_LABELS,
  STATUS_LABELS,
  declineTemplate,
  formLabel,
  kindLine,
  themeNotes,
  type SubmissionKind,
  type SubmissionStatus,
} from "@/lib/courtyard";
import {
  WEEKDAYS,
  describeGathering,
  gatheringShort,
  turnNote,
  type GatheringSetting,
} from "@/lib/gathering";
import { ROOM_TERMS, STAGE_LABELS, type InviteStage } from "@/lib/invite-stages";
import DeleteDialog from "../../delete-dialog";
import {
  createInvite,
  declineSubmission,
  joinThreadNow,
  markReachedOut,
  setGathering,
  moveInvite,
  previewFile,
  publishSubmission,
  resendInvite,
  setRoomLimit,
  updateSeries,
  type InviteSent,
} from "./actions";
import a from "../../admin.module.css";
import c from "./courtyard.module.css";

export type InviteRow = {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  relation: string | null;
  craft: string | null;
  room_slug: string | null;
  note: string | null;
  stage: InviteStage;
  sent_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  updated_at: string;
};

export type SubmissionRow = {
  id: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  name: string;
  email: string;
  city: string | null;
  form: string;
  themes: string[];
  title: string | null;
  body: string | null;
  has_file: boolean;
  series_id: string | null;
  series_part: number | null;
  series_title: string | null;
  file_type: string | null;
  file_name: string | null;
  links: string[];
  about: string | null;
  creator_name: string | null;
  relation: string | null;
  why: string | null;
  creator_contact: string | null; // a suggested creator's email or phone, if given
  creator_aware: boolean;
  invite_id: string | null;
  family_only: boolean;
  thread_from_title: string | null; // the piece it picks up the thread from
  gathering_at: string | null; // when it joins (or joined) the thread
  gathering_notified_at: string | null;
  created_at: string;
  published_at: string | null;
};

export type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  name: string;
  email: string;
  form: string | null;
  status: "pending" | "active" | "paused" | "ended";
  parts: number; // published parts
  waiting: number; // parts not yet reviewed
  followers: number; // confirmed followers
  last_part_at: string | null;
  created_at: string;
};

type Draft = {
  name: string;
  email: string;
  whatsapp: string;
  relation: string;
  craft: string;
  roomSlug: string;
  note: string;
  submissionId: string | null;
};

type Panel =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "sent"; sent: InviteSent & { name: string } }
  | { mode: "review"; s: SubmissionRow; fileUrl: string | null }
  | { mode: "decline"; s: SubmissionRow };

// The invite form's crafts are the forms; a submission's form becomes its craft.
const CRAFTS = FORMS.map((f) => f.label);
const craftOf = (form: string | null) => formLabel(form);
const EMPTY: Draft = { name: "", email: "", whatsapp: "", relation: "", craft: CRAFTS[0], roomSlug: "", note: "", submissionId: null };
const KIND_FILTERS: { value: "all" | SubmissionKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "single_piece", label: "Single pieces" },
  { value: "room_request", label: "Room requests" },
  { value: "suggestion", label: "Suggestions" },
];

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";

// Badge colours from design/Invites.dc.html.
const TONE: Record<InviteStage, string> = {
  invited: c.toneGrey,
  agreement_accepted: c.toneBlue,
  room_draft: c.toneAmber,
  needs_review: c.toneAmber,
  live: c.toneGreen,
  paused: c.toneGrey,
  expired: c.toneRed,
  revoked: c.toneRed,
  left: c.toneGrey,
};
const KIND_TONE: Record<SubmissionKind, string> = {
  single_piece: c.toneGreen,
  room_request: c.toneBlue,
  suggestion: c.toneAmber,
};

function nextStep(r: InviteRow) {
  switch (r.stage) {
    case "invited":
      return `Waiting for them to open the link · sent ${day(r.sent_at)} · expires ${day(r.expires_at)}`;
    case "agreement_accepted":
      return `Accepted ${day(r.accepted_at)} · collect their work`;
    case "room_draft":
      return "Preview sent · waiting for their yes";
    case "needs_review":
      return "Review their room before it goes live";
    case "live":
      return "—";
    case "paused":
      return "Hidden from the site";
    case "expired":
      return `Never accepted · expired ${day(r.expires_at)}`;
    case "revoked":
      return `Link cancelled ${day(r.updated_at)}`;
    case "left":
      return "Room taken down";
  }
}

const isEmail = (v: string | null | undefined) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string | null | undefined) => !!v && !isEmail(v) && v.replace(/\D/g, "").length >= 8;
const firstName = (name: string | null) => (name ?? "them").split(" ")[0];

// A starting point for Jaydeep's own message to a suggested creator.
function creatorHello(s: SubmissionRow) {
  return `Hello ${firstName(s.creator_name)}, ${s.name} told me about your work and thought it deserves readers. I’m Jaydeep Buch; I host the Courtyard at jambuch.in, a place where people share what they make, always under their own name. Would you be open to a room there, or to sharing a piece? No pressure at all.`;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CourtyardAdmin({
  invites,
  submissions,
  series,
  initialTab,
  limit,
  used,
  gathering,
  nextGatheringAt,
  counts,
  error: loadError,
}: {
  invites: InviteRow[];
  submissions: SubmissionRow[];
  series: SeriesRow[];
  initialTab: "invites" | "requests" | "series";
  limit: number;
  used: number;
  gathering: GatheringSetting;
  nextGatheringAt: string;
  counts: { them: number; me: number; live: number };
  error: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [panel, setPanel] = useState<Panel>({ mode: "closed" });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // "id:move" awaiting a second click
  const [editLimit, setEditLimit] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | SubmissionKind>("all");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const [editGathering, setEditGathering] = useState(false);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);
  const nowIso = new Date().toISOString();
  // Approved pieces waiting for their gathering, grouped by when they join.
  const queued = submissions
    .filter((s) => s.status === "published" && s.gathering_at && s.gathering_at > nowIso)
    .sort((x, y) => (x.gathering_at! < y.gathering_at! ? -1 : 1));
  const filtered = submissions.filter((s) => kindFilter === "all" || s.kind === kindFilter);
  const fresh = filtered.filter((s) => s.status === "new");
  const handled = filtered.filter((s) => s.status !== "new");
  const newCount = submissions.filter((s) => s.status === "new").length;
  const atLimit = used >= limit;

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function close() {
    setError(null);
    setPanel({ mode: "closed" });
  }

  // From a room request or suggestion: the same single-use, 14-day, email-bound invite.
  function openNew(from?: SubmissionRow) {
    setError(null);
    setSlugTouched(false);
    if (!from) setDraft(EMPTY);
    else if (from.kind === "room_request") {
      setDraft({
        ...EMPTY,
        name: from.name,
        email: from.email,
        craft: craftOf(from.form),
        roomSlug: slugify(from.name),
        submissionId: from.id,
      });
    } else {
      // A suggestion: the creator's email is never collected; Jaydeep adds it.
      // (Its "relation" is how the suggester knows them, not how Jaydeep does.)
      setDraft({
        ...EMPTY,
        name: from.creator_name ?? "",
        email: isEmail(from.creator_contact) ? from.creator_contact! : "",
        whatsapp: isPhone(from.creator_contact) ? from.creator_contact! : "",
        craft: craftOf(from.form),
        roomSlug: slugify(from.creator_name ?? ""),
        submissionId: from.id,
      });
    }
    setPanel({ mode: "new" });
  }

  function update(change: Partial<Draft>) {
    setDraft((d) => {
      const next = { ...d, ...change };
      if (change.name !== undefined && !slugTouched) next.roomSlug = slugify(change.name);
      return next;
    });
  }

  function showSent(res: InviteSent, name: string) {
    setCopied(false);
    setPanel({ mode: "sent", sent: { ...res, name } });
    router.refresh();
  }

  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function send() {
    setError(null);
    start(async () => {
      const res = await createInvite(draft);
      if (!res.ok) setError(res.error);
      else showSent(res, draft.name);
    });
  }

  function resend(r: InviteRow) {
    setError(null);
    start(async () => {
      const res = await resendInvite(r.id);
      if (!res.ok) setError(res.error);
      else showSent(res, r.name);
    });
  }

  // Revoke, Remove and Pause ask for a second click.
  function move(r: InviteRow, step: Parameters<typeof moveInvite>[1], confirm = false) {
    const key = `${r.id}:${step}`;
    if (confirm && armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    run(() => moveInvite(r.id, step));
  }

  function review(s: SubmissionRow) {
    setError(null);
    setPanel({ mode: "review", s, fileUrl: null });
    if (s.has_file) {
      start(async () => {
        const res = await previewFile(s.id);
        if (res.ok) setPanel({ mode: "review", s, fileUrl: res.url });
        else setError(res.error);
      });
    }
  }

  function saveLimit(form: FormData) {
    run(() => setRoomLimit(Number(form.get("limit"))), () => setEditLimit(false));
  }

  function saveGathering(form: FormData) {
    run(() => setGathering(Number(form.get("weekday")), String(form.get("time"))), () => setEditGathering(false));
  }

  async function copyNote(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNote(id);
    } catch {
      setCopiedNote(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function confirmButton(r: InviteRow, step: Parameters<typeof moveInvite>[1], label: string) {
    const isArmed = armed === `${r.id}:${step}`;
    return (
      <button key={step} type="button" className={c.danger} disabled={pending} onClick={() => move(r, step, true)}>
        {isArmed ? `Sure? ${label}` : label}
      </button>
    );
  }

  function inviteActions(r: InviteRow) {
    const del = (
      <DeleteDialog key="del" targets={[{ table: "courtyard_invites", ids: [r.id] }]} mode="trash" label="Delete" className={c.danger} />
    );
    const plain = (label: string, onClick: () => void) => (
      <button key={label} type="button" className={c.action} disabled={pending} onClick={onClick}>
        {label}
      </button>
    );
    switch (r.stage) {
      case "invited":
        return [plain("Resend", () => resend(r)), confirmButton(r, "revoke", "Revoke")];
      case "agreement_accepted":
        return [plain("Start room", () => move(r, "start_room")), confirmButton(r, "revoke", "Revoke")];
      case "room_draft":
        return [plain("Ready for review", () => move(r, "ready_for_review")), confirmButton(r, "remove", "Remove")];
      case "needs_review":
        return [plain("Approve · go live", () => move(r, "approve")), confirmButton(r, "pause", "Pause")];
      case "live":
        return [
          r.room_slug ? (
            <a key="v" className={c.action} href={`/courtyard/${r.room_slug}`} target="_blank" rel="noopener noreferrer">
              View room
            </a>
          ) : null,
          confirmButton(r, "pause", "Pause"),
        ];
      case "paused":
        return [plain("Resume", () => move(r, "resume")), confirmButton(r, "remove", "Remove")];
      case "expired":
      case "revoked":
        return [plain("Resend", () => resend(r)), del];
      case "left":
        return [del];
    }
  }

  function submissionActions(s: SubmissionRow) {
    if (s.status !== "new") {
      return [
        s.status === "published" ? (
          <a key="v" className={c.action} href="/courtyard" target="_blank" rel="noopener noreferrer">
            View on shelf
          </a>
        ) : null,
        <DeleteDialog
          key="del"
          targets={[{ table: "courtyard_submissions", ids: [s.id] }]}
          mode="trash"
          label="Delete"
          className={c.danger}
        />,
      ];
    }
    // Design: one main button per type, plus "Not now" (the kind-reply panel,
    // where sending a reply is optional). The other actions sit as small links.
    // For a suggestion with the creator's contact, reach out to the creator
    // (by hand: this only opens your email or WhatsApp). Otherwise, the sender.
    const toCreator = s.kind === "suggestion" && (isEmail(s.creator_contact) || isPhone(s.creator_contact));
    const reachHref = !toCreator
      ? `mailto:${s.email}?subject=${encodeURIComponent("Your note to the Courtyard")}`
      : isEmail(s.creator_contact)
        ? `mailto:${s.creator_contact}?subject=${encodeURIComponent("The Courtyard at jambuch.in")}&body=${encodeURIComponent(creatorHello(s))}`
        : `https://wa.me/${s.creator_contact!.replace(/\D/g, "")}?text=${encodeURIComponent(creatorHello(s))}`;
    const reachOut = (cls: string, label = toCreator ? `Reach out to ${firstName(s.creator_name)}` : "Reach out") => (
      <a
        key="reach"
        className={cls}
        href={reachHref}
        target={reachHref.startsWith("https:") ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={() => run(() => markReachedOut(s.id))}
      >
        {label}
      </a>
    );
    const notNow = (
      <button key="notnow" type="button" className={c.secondary} onClick={() => setPanel({ mode: "decline", s })}>
        Not now
      </button>
    );
    const inviteBtn = (cls: string) => (
      <button key="invite" type="button" className={cls} onClick={() => openNew(s)}>
        Invite
      </button>
    );
    if (s.kind === "single_piece") {
      return [
        <button key="review" type="button" className={c.dark} onClick={() => review(s)}>
          Review piece
        </button>,
        notNow,
        reachOut(c.textLink),
      ];
    }
    if (s.kind === "room_request") return [inviteBtn(c.dark), notNow, reachOut(c.textLink)];
    // A suggestion: Jaydeep reaches out himself first; the invite comes after.
    return [reachOut(c.dark), notNow, inviteBtn(c.textLink)];
  }

  return (
    <div className={c.wrap}>
      <div className={c.head}>
        <div>
          <h1 className={c.title}>
            Courtyard invites <span className="gu">આંગણું</span>
          </h1>
          <p className={c.sub}>Who you’ve invited, who asked, and where each room stands.</p>
        </div>
        <button type="button" className={c.primary} onClick={() => openNew()}>
          + New invite
        </button>
      </div>

      <div className={c.cards}>
        <div className={c.card}>
          <p>
            Rooms this year
            <button type="button" className={c.cardEdit} onClick={() => setEditLimit((v) => !v)}>
              {editLimit ? "Cancel" : "Change limit"}
            </button>
          </p>
          {editLimit ? (
            <form action={saveLimit} className={c.limitForm}>
              <input type="number" name="limit" min={1} max={100} defaultValue={limit} aria-label="Rooms per year" />
              <button type="submit" className={c.action} disabled={pending}>
                Save
              </button>
            </form>
          ) : (
            <>
              <strong>
                {used} <span>of {limit}</span>
              </strong>
              <div className={c.meter}>
                <i style={{ width: `${Math.min(100, Math.round((used / limit) * 100))}%` }} />
              </div>
            </>
          )}
        </div>
        <div className={c.card}>
          <p>Waiting on them</p>
          <strong>{counts.them}</strong>
        </div>
        <div className={c.card}>
          <p>Waiting on you</p>
          <strong className={c.mine}>{counts.me}</strong>
        </div>
        <div className={c.card}>
          <p>Live rooms</p>
          <strong className={c.liveCount}>{counts.live}</strong>
        </div>
        <div className={c.card}>
          <p>
            Weekly gathering
            <button type="button" className={c.cardEdit} onClick={() => setEditGathering((v) => !v)}>
              {editGathering ? "Cancel" : "Change"}
            </button>
          </p>
          {editGathering ? (
            <form action={saveGathering} className={c.limitForm}>
              <select name="weekday" defaultValue={gathering.weekday} aria-label="Day">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <input type="time" name="time" defaultValue={gathering.time} aria-label="Time (IST)" />
              <button type="submit" className={c.action} disabled={pending}>
                Save
              </button>
            </form>
          ) : (
            <>
              <strong className={c.gatheringWhen}>{describeGathering(gathering)}</strong>
              <span className={c.meta}>
                Next: {gatheringShort(nextGatheringAt)} · {queued.filter((q) => q.gathering_at! <= nextGatheringAt).length} waiting
              </span>
            </>
          )}
        </div>
      </div>
      {atLimit && (
        <p className={a.warn}>
          You’ve reached this year’s limit of {limit} rooms. You can still send invites, but each new room goes over the
          limit.
        </p>
      )}
      {(error || loadError) && panel.mode === "closed" && (
        <p className={a.error} role="alert">
          {error ?? `Could not load: ${loadError}`}
        </p>
      )}

      <div className={c.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "invites"} onClick={() => setTab("invites")}>
          Invites
        </button>
        <button type="button" role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>
          Requests &amp; submissions ({newCount})
        </button>
        <button type="button" role="tab" aria-selected={tab === "series"} onClick={() => setTab("series")}>
          Series ({series.filter((s) => s.status === "active" || s.status === "paused").length})
        </button>
      </div>

      {tab === "series" && (
        <SeriesTab
          series={series}
          pending={pending}
          onChange={(id, change) => run(() => updateSeries(id, change))}
          onMakeRoom={(s) => {
            setError(null);
            setSlugTouched(false);
            setDraft({
              ...EMPTY,
              name: s.name,
              email: s.email,
              craft: craftOf(s.form),
              roomSlug: slugify(s.name),
              note: `Your series “${s.title}” has grown into a body of work. I’d like to give it a room of its own.`,
            });
            setPanel({ mode: "new" });
          }}
        />
      )}

      {tab === "invites" && (
        <>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Craft</th>
                  <th>Stage</th>
                  <th>Next step</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/courtyard_invites/${r.id}`} className={c.name}>
                        {r.name}
                      </Link>
                      <div className={c.meta}>
                        {[r.relation, r.room_slug && `/courtyard/${r.room_slug}`].filter(Boolean).join(" · ") || r.email}
                      </div>
                    </td>
                    <td>{r.craft}</td>
                    <td>
                      <span className={`${c.badge} ${TONE[r.stage]}`}>{STAGE_LABELS[r.stage]}</span>
                    </td>
                    <td className={c.next}>{nextStep(r)}</td>
                    <td>
                      <div className={c.actions}>{inviteActions(r)}</div>
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={5} className={a.empty}>
                      No invites yet. “+ New invite” sends the first one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className={c.foot}>
            Invite links expire after 14 days and work once, only for the invited email. Nothing a guest uploads is public
            until you approve it.
          </p>
        </>
      )}

      {tab === "requests" && queued.length > 0 && (
        <section className={c.queue} aria-label="Waiting for the gathering">
          <h2>Waiting for the gathering</h2>
          <p className={c.meta}>
            These join the thread together at their gathering, and each contributor gets an email. To send the note on
            WhatsApp as well, copy it.
          </p>
          <ul>
            {queued.map((q) => {
              const note = turnNote({ name: q.name, title: q.title ?? "", url: `https://jambuch.in/courtyard#piece-${q.id}` });
              return (
                <li key={q.id}>
                  <div>
                    <strong>{q.title}</strong> <span className={c.meta}>by {q.name} · joins {gatheringShort(q.gathering_at!)}</span>
                  </div>
                  <div className={c.actions}>
                    <button type="button" className={c.action} onClick={() => copyNote(q.id, note)}>
                      {copiedNote === q.id ? "Copied" : "Copy WhatsApp note"}
                    </button>
                    <button type="button" className={c.textLink} disabled={pending} onClick={() => run(() => joinThreadNow(q.id))}>
                      Join the thread now
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === "requests" && (
        <div className={c.requests}>
          <div className={c.chips}>
            {KIND_FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={kindFilter === f.value} onClick={() => setKindFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          {fresh.length === 0 && <p className={a.intro}>Nothing new. Only confirmed submissions appear here.</p>}
          {fresh.map((s) => (
            <SubmissionCard key={s.id} s={s}>
              {submissionActions(s)}
            </SubmissionCard>
          ))}
          {handled.length > 0 && (
            <details className={c.earlier}>
              <summary>Handled ({handled.length})</summary>
              {handled.map((s) => (
                <SubmissionCard key={s.id} s={s}>
                  {submissionActions(s)}
                </SubmissionCard>
              ))}
            </details>
          )}
        </div>
      )}

      {panel.mode !== "closed" && (
        <aside className={c.panel} aria-label="Courtyard panel">
          <div className={c.panelHead}>
            <h2>
              {panel.mode === "sent"
                ? "Invite ready"
                : panel.mode === "review"
                  ? "Review & publish"
                  : panel.mode === "decline"
                    ? "Not now"
                    : "New invite"}
            </h2>
            <button type="button" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>

          {panel.mode === "sent" && (
            <div className={c.sentBox}>
              <p className={c.sentTitle}>
                {panel.sent.emailed ? `Invite emailed to ${panel.sent.name}.` : "Invite created, but the email didn’t send."}
              </p>
              <p>It shows as “Invited” until they open the link and accept the room agreement.</p>
              <p className={c.linkLabel}>Their link (shown only now; it works once, for 14 days):</p>
              <code className={c.link}>{panel.sent.link}</code>
              <div className={c.actions}>
                <button type="button" className={c.action} onClick={() => copy(panel.sent.link)}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                {panel.sent.whatsappUrl && (
                  <a className={c.dark} href={panel.sent.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    Send on WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {panel.mode === "new" && (
            <form
              className={c.form}
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {draft.submissionId && !draft.email && (
                <p className={a.warn}>
                  From a suggestion: add the creator’s email yourself, after you’ve spoken to them. The site never
                  contacts them on its own.
                </p>
              )}
              <label>
                Name
                <input value={draft.name} onChange={(e) => update({ name: e.target.value })} required />
              </label>
              <label>
                Email <small>they sign in with this</small>
                <input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} required />
              </label>
              <label>
                WhatsApp <small>optional, to send the link</small>
                <input type="tel" value={draft.whatsapp} onChange={(e) => update({ whatsapp: e.target.value })} placeholder="+91 98…" />
              </label>
              <div className={c.pair}>
                <label>
                  Relation
                  <input value={draft.relation} onChange={(e) => update({ relation: e.target.value })} placeholder="cousin, friend…" />
                </label>
                <label>
                  Craft
                  <select value={draft.craft} onChange={(e) => update({ craft: e.target.value })}>
                    {CRAFTS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Room address
                <span className={c.slug}>
                  <span>jambuch.in/courtyard/</span>
                  <input
                    value={draft.roomSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      update({ roomSlug: e.target.value.toLowerCase() });
                    }}
                    placeholder="name"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                </span>
              </label>
              <label>
                Personal note <small>goes in the invite</small>
                <textarea rows={3} value={draft.note} onChange={(e) => update({ note: e.target.value })} />
              </label>
              <div className={c.terms}>
                <p>They’ll be asked to accept</p>
                {ROOM_TERMS.join(" · ")}
              </div>
              {atLimit && <p className={a.warn}>This year’s limit of {limit} rooms is already reached.</p>}
              {error && (
                <p className={a.error} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={c.primary} disabled={pending}>
                {pending ? "Sending…" : "Send invite"}
              </button>
            </form>
          )}

          {panel.mode === "review" && (
            <ReviewPanel
              s={panel.s}
              fileUrl={panel.fileUrl}
              pending={pending}
              error={error}
              nextGatheringAt={nextGatheringAt}
              onPublish={(edits, when) => run(() => publishSubmission(panel.s.id, edits, when), close)}
              onDecline={() => setPanel({ mode: "decline", s: panel.s })}
            />
          )}

          {panel.mode === "decline" && (
            <DeclinePanel
              s={panel.s}
              pending={pending}
              error={error}
              onSend={(reply, sendIt) => run(() => declineSubmission(panel.s.id, reply, sendIt), close)}
            />
          )}
        </aside>
      )}
    </div>
  );
}

const SERIES_STATUS: Record<SeriesRow["status"], string> = {
  pending: "Waiting for its first part to be approved",
  active: "Open",
  paused: "Paused",
  ended: "Complete",
};

// Every series: its parts and followers, and what can be done with it.
function SeriesTab({
  series,
  pending,
  onChange,
  onMakeRoom,
}: {
  series: SeriesRow[];
  pending: boolean;
  onChange: (id: string, change: Parameters<typeof updateSeries>[1]) => void;
  onMakeRoom: (s: SeriesRow) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  if (series.length === 0) {
    return (
      <p className={a.intro}>
        No series yet. Contributors start one by ticking “This is the first part of a series” when they share a piece.
      </p>
    );
  }
  return (
    <div className={c.tableWrap}>
      <table className={`${c.table} ${c.seriesTable}`}>
        <thead>
          <tr>
            <th>Series</th>
            <th>Status</th>
            <th>Parts</th>
            <th>Followers</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id}>
              <td>
                {renaming === s.id ? (
                  <form
                    className={c.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      onChange(s.id, {
                        action: "rename",
                        title: String(f.get("title") ?? ""),
                        description: String(f.get("description") ?? ""),
                      });
                      setRenaming(null);
                    }}
                  >
                    <label>
                      Name
                      <input name="title" defaultValue={s.title} maxLength={120} required />
                    </label>
                    <label>
                      Line about it
                      <textarea name="description" defaultValue={s.description ?? ""} rows={2} maxLength={1000} />
                    </label>
                    <div className={c.actions}>
                      <button type="submit" className={c.action} disabled={pending}>
                        Save
                      </button>
                      <button type="button" className={c.textLink} onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {s.status === "pending" ? (
                      <span className={c.name}>{s.title}</span>
                    ) : (
                      <a href={`/courtyard/series/${s.slug}`} target="_blank" rel="noopener noreferrer" className={c.name}>
                        {s.title}
                      </a>
                    )}
                    <small>
                      by {s.name} &lt;{s.email}&gt; · {formLabel(s.form)}
                    </small>
                  </>
                )}
              </td>
              <td>{SERIES_STATUS[s.status]}</td>
              <td>
                {s.parts}
                {s.waiting > 0 && <small>{s.waiting} waiting for you</small>}
                {s.last_part_at && <small>last {day(s.last_part_at)}</small>}
              </td>
              <td>{s.followers}</td>
              <td>
                <div className={c.actions}>
                  <button type="button" className={c.action} onClick={() => setRenaming(s.id)}>
                    Rename
                  </button>
                  {s.status === "active" && (
                    <>
                      <button type="button" className={c.action} disabled={pending} onClick={() => onChange(s.id, { action: "pause" })}>
                        Pause
                      </button>
                      <button
                        type="button"
                        className={c.action}
                        disabled={pending}
                        onClick={() => onChange(s.id, { action: "new_link" })}
                        title="Emails them a fresh personal link; the old one stops working"
                      >
                        New link
                      </button>
                    </>
                  )}
                  {s.status === "paused" && (
                    <button type="button" className={c.action} disabled={pending} onClick={() => onChange(s.id, { action: "resume" })}>
                      Resume
                    </button>
                  )}
                  {(s.status === "active" || s.status === "paused") && (
                    <button type="button" className={c.danger} disabled={pending} onClick={() => onChange(s.id, { action: "end" })}>
                      End
                    </button>
                  )}
                  {s.status !== "pending" && (
                    <button type="button" className={c.textLink} onClick={() => onMakeRoom(s)}>
                      Make it a room
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Laid out as in design/Invites.dc.html: type badge, name · craft · who sent it.
function SubmissionCard({ s, children }: { s: SubmissionRow; children: React.ReactNode }) {
  const who = s.kind === "suggestion" ? s.creator_name : s.name;
  const from =
    s.kind === "single_piece"
      ? "sent by themselves"
      : s.kind === "room_request"
        ? "asked for themselves"
        : `suggested by ${s.name}${s.relation ? ` (${s.relation})` : ""}`;
  const note =
    s.kind === "single_piece"
      ? [s.title, s.body].filter(Boolean).join(" — ")
      : s.kind === "room_request"
        ? s.about
        : s.why;
  return (
    <div className={c.request}>
      <div className={c.requestText}>
        <div className={c.name}>
          <span className={`${c.badge} ${c.badgeInline} ${KIND_TONE[s.kind]}`}>{KIND_LABELS[s.kind]}</span>
          {who}{" "}
          <span className={c.meta}>
            · {kindLine(s.form, s.themes)} · {from}
            {s.status !== "new" && ` · ${statusText(s)}`}
          </span>
          {s.family_only && <span className={`${c.badge} ${c.badgeInline} ${c.toneAmber} ${c.badgeAfter}`}>Family circle only</span>}
        </div>
        {s.series_title && (
          <div className={c.seriesTag}>
            {s.series_part ? `Series “${s.series_title}” · part ${s.series_part}` : `Series “${s.series_title}”`}
            {!s.series_part && s.status === "new" && " · approving this opens the series"}
          </div>
        )}
        {s.thread_from_title && <div className={c.meta}>↳ picks up the thread from {s.thread_from_title}</div>}
        {note && <div className={c.about}>{note.length > 280 ? `${note.slice(0, 280)}…` : note}</div>}
        <div className={c.meta}>
          {s.kind === "suggestion" ? `Suggester: ${s.email}` : s.email}
          {s.kind !== "suggestion" && s.city ? ` · ${s.city}` : ""}
        </div>
        {s.kind === "suggestion" && (
          <div className={c.meta}>
            {s.creator_contact ? `Creator’s contact: ${s.creator_contact}` : "No contact for the creator: ask the suggester"}
            {" · "}
            {s.creator_aware ? "they know they were suggested" : "they may not know yet"}
          </div>
        )}
        {(s.links.length > 0 || s.has_file) && (
          <div className={c.meta}>
            {s.has_file && <>📎 {s.file_name ?? "file"} · </>}
            {s.links.map((l) => (
              <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className={c.inlineLink}>
                {host(l)}
              </a>
            ))}
          </div>
        )}
        <div className={c.meta}>
          Received {day(s.created_at)} via the Courtyard form
          {s.published_at && ` · published ${day(s.published_at)}`}
        </div>
      </div>
      <div className={c.actions}>{children}</div>
    </div>
  );
}

// Status line for a handled submission; approved pieces show their gathering.
function statusText(s: SubmissionRow) {
  if (s.status === "published" && s.gathering_at) {
    return s.gathering_at > new Date().toISOString()
      ? `Queued for ${gatheringShort(s.gathering_at)}`
      : `In the thread since ${gatheringShort(s.gathering_at)}`;
  }
  return STATUS_LABELS[s.status];
}

function ReviewPanel({
  s,
  fileUrl,
  pending,
  error,
  nextGatheringAt,
  onPublish,
  onDecline,
}: {
  s: SubmissionRow;
  fileUrl: string | null;
  pending: boolean;
  error: string | null;
  nextGatheringAt: string;
  onPublish: (edits: { title: string; city: string }, when: "gathering" | "now") => void;
  onDecline: () => void;
}) {
  const [title, setTitle] = useState(s.title ?? "");
  const [city, setCity] = useState(s.city ?? "");
  const image = s.file_type?.startsWith("image/");
  const audio = s.file_type?.startsWith("audio/");
  return (
    <div className={c.form}>
      <p className={c.meta}>
        {kindLine(s.form, s.themes)} · from {s.name} &lt;{s.email}&gt; · received {day(s.created_at)}
        {s.series_title && ` · series “${s.series_title}”`}
      </p>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        City <small>credited as “by {s.name}{city ? `, ${city}` : ""}”</small>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </label>
      {s.has_file && (
        <div className={c.preview}>
          {!fileUrl && <p className={c.meta}>Loading the file…</p>}
          {/* A 10-minute private link: the file is not public yet. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {fileUrl && image && <img src={fileUrl} alt="" />}
          {fileUrl && audio && <audio controls src={fileUrl} />}
          {fileUrl && !image && !audio && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              Open {s.file_name ?? "the file"}
            </a>
          )}
        </div>
      )}
      {s.body && <div className={c.fullText}>{s.body}</div>}
      {s.links.length > 0 && (
        <div className={c.meta}>
          Links:{" "}
          {s.links.map((l) => (
            <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className={c.inlineLink}>
              {l}
            </a>
          ))}
        </div>
      )}
      {themeNotes(s.themes).map((n) => (
        <p key={n} className={a.warn}>
          It will show with: “{n}”
        </p>
      ))}
      {s.family_only && (
        <p className={a.warn}>
          They asked to show it only to their family circle. Publishing approves it, but it stays off the public thread
          until they say it may go public.
        </p>
      )}
      {s.thread_from_title && <p className={c.meta}>↳ Picks up the thread from {s.thread_from_title}</p>}
      <p className={c.meta}>They ticked: own work, and permission to publish with their name.</p>
      {error && (
        <p className={a.error} role="alert">
          {error}
        </p>
      )}
      <div className={c.actions}>
        <button
          type="button"
          className={c.primary}
          disabled={pending || !title.trim()}
          onClick={() => onPublish({ title, city }, "gathering")}
        >
          {pending ? "Approving…" : `Approve for ${gatheringShort(nextGatheringAt)}`}
        </button>
        <button type="button" className={c.textLink} disabled={pending || !title.trim()} onClick={() => onPublish({ title, city }, "now")}>
          Join the thread now instead
        </button>
        <button type="button" className={c.danger} onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  );
}

function DeclinePanel({
  s,
  pending,
  error,
  onSend,
}: {
  s: SubmissionRow;
  pending: boolean;
  error: string | null;
  onSend: (reply: string, send: boolean) => void;
}) {
  const [reply, setReply] = useState(() => declineTemplate(s));
  const [sendIt, setSendIt] = useState(true);
  return (
    <div className={c.form}>
      <p className={c.meta}>
        To {s.name} &lt;{s.email}&gt;
        {s.kind === "suggestion" && " (the person who made the suggestion; the creator is never contacted)"}
      </p>
      <label>
        Reply <small>edit as you like</small>
        <textarea rows={11} value={reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      <label className={c.checkRow}>
        <input type="checkbox" checked={sendIt} onChange={(e) => setSendIt(e.target.checked)} />
        Send this reply by email
      </label>
      {error && (
        <p className={a.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={c.primary} disabled={pending} onClick={() => onSend(reply, sendIt)}>
        {pending ? "Declining…" : sendIt ? "Send reply and decline" : "Decline without a reply"}
      </button>
    </div>
  );
}
