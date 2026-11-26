import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { readBrief, readDraft, readPlan, readStory } from "@/lib/creators/files";
import { signedPrivateUrl } from "@/lib/r2";
import { BY_ID, STYLE_LABELS, COLOUR_LABELS } from "@/lib/creators/questions";
import type { Quote } from "@/lib/creators/pricing";
import type { CostLog } from "@/lib/creators/flow";
import { PlanView } from "@/app/creators/start/steps";
import { isStyleTopic } from "@/lib/creators/claude";
import { sampleLink } from "@/lib/creators/delivery";
import { DEFAULT_MODEL, SAMPLE_LANGS, listVoices, sampleSettings, speaksLanguage, voiceFor, type Voice } from "@/lib/creators/sample";
import {
  advanceReceived,
  assignDirectorAction,
  letContinue,
  logDirectorHours,
  sampleFeeReceivedAction,
  saveSampleSettings,
  saveTitleAuthorAction,
  sendSampleAction,
  setRequestState,
  useDirectedSample,
} from "../actions";
import { isDirected } from "@/lib/creators/pricing";
import { STUDIO_CREDIT, cleared, directedCredit, logStoryAccess, teamMembers } from "@/lib/creators/team";
import { listPrivate } from "@/lib/r2";
import { narrationRules } from "@/lib/creators/rules";
import MakeSampleButton, { StopButton } from "./make-sample";
import { FreeRemakeButton, RefundForm } from "./refund-form";
import a from "../../../admin.module.css";

// One Creator's Space request: the story and answers (from private storage), the
// screening, and the free audio sample (Phase 2a, brief §6H): make, listen, send.
export const dynamic = "force-dynamic";
// Making a sample (Claude, ElevenLabs, Freesound, FFmpeg) runs in this page's actions.
export const maxDuration = 300;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await requireAdmin();
  const { data: r } = await db.from("creator_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const narr = await narrationRules();
  const purged = !!r.files_purged_at;
  const [story, brief, draft, plan, settings, voices, listen] = await Promise.all([
    r.story_key ? readStory(id).catch(() => null) : Promise.resolve(null),
    r.story_key ? readBrief(id) : Promise.resolve(null),
    purged ? Promise.resolve(null) : readDraft(id),
    r.plan_version ? readPlan(id, r.plan_version) : Promise.resolve(null),
    sampleSettings(),
    listVoices().catch(() => [] as Voice[]),
    r.sample_key ? sampleLink(id, r.sample_key).catch(() => null) : Promise.resolve(null),
  ]);
  // Every opening of a writer's story is logged (brief §6J).
  if (story) await logStoryAccess(id, user.email, "admin", "request page");
  const directed = isDirected((r.answers ?? {}) as Record<string, string>);
  const team = directed ? await teamMembers() : [];
  const directors = team.filter((m) => cleared(m) && m.roles.includes("director"));
  const director = team.find((m) => m.id === r.director_id) ?? null;
  const directedFiles = directed && !purged ? await listPrivate(`creators/${id}/directed/`).catch(() => [] as string[]) : [];
  const { data: access } = await db.from("creator_story_access").select("who, role, what, at").eq("request_id", id).order("at", { ascending: false }).limit(15);
  const credits = (r.sample_credits ?? []) as { kind: string; name: string; author: string; licence: string; url: string; source?: string; attribution?: string | null }[];
  const cost = (r.sample_cost ?? {}) as Record<string, string | number>;
  const answers = (r.answers ?? {}) as Record<string, string | string[]>;
  const quote = r.quote as Quote | null;
  const claudeCost = r.claude_cost as CostLog | null;
  const { data: payments } = await db
    .from("creator_payments")
    .select("id, kind, amount_paise, status, razorpay_order_id, razorpay_payment_id, created_at, paid_at, failure_reason")
    .eq("request_id", id)
    .order("created_at");
  const { data: refunds } = await db
    .from("creator_refunds")
    .select("id, payment_id, razorpay_payment_id, razorpay_refund_id, amount_paise, reason, note, by, status, failure_reason, created_at")
    .eq("request_id", id)
    .order("created_at");
  const refundedOn = (rzpPaymentId: string | null) =>
    (refunds ?? []).filter((x) => x.razorpay_payment_id === rzpPaymentId && x.status !== "failed").reduce((sum, x) => sum + x.amount_paise, 0);
  const pictures = draft
    ? await Promise.all(draft.pictures.map(async (key) => ({ key, url: await signedPrivateUrl({ url: `r2-private:${key}`, bucket: "private", key }, 900) })))
    : [];
  const label = (qid: string, v: string | string[]) => {
    const q = BY_ID[qid];
    const one = (x: string) => q?.options?.find((o) => o.id === x)?.label.en ?? x;
    return Array.isArray(v) ? v.map(one).join(", ") : one(v);
  };

  return (
    <>
      <p className={a.crumb}>
        <Link href="/admin/creators">← Creator’s Space requests</Link>
      </p>
      <h1 className={a.title}>
        {r.name} · {r.state === "needs_human" ? "Needs your eye" : r.state}
      </h1>
      <p className={a.intro}>
        {r.email}
        {r.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ""} · {r.language} · {r.make} · {r.length} · sent {when(r.created_at)}
        {r.music_replacement ? " · MUSIC REPLACEMENT" : r.big_screen === "unsure" ? " · big screen: not sure" : ""}
      </p>

      {directed && (
        <>
          <h2 className={a.gapTop}>Varta Vishva Directors</h2>
          <form action={assignDirectorAction} className={a.actions}>
            <input type="hidden" name="id" value={id} />
            <label>
              Director{" "}
              <select name="director_id" defaultValue={r.director_id ?? ""}>
                <option value="">{directors.length ? "— not assigned —" : "— nobody cleared yet: the admin directs —"}</option>
                {directors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={a.secondary}>
              Assign
            </button>
            {r.director_assigned_at && <span className={a.mutedSmall}> assigned {when(r.director_assigned_at)}</span>}
          </form>
          <p className={a.mutedSmall}>
            Credit line: <b>{director ? directedCredit(director.name) : "Directed by (director’s name), Varta Vishva Directors · AI-assisted voices and illustrations"}</b>
            {" · "}
            <Link href="/admin/creators/team">Team and roles →</Link>
          </p>
          <form action={logDirectorHours} className={a.actions}>
            <input type="hidden" name="id" value={id} />
            <label>
              Hours actually spent{" "}
              <input name="hours" type="number" step="0.25" min={0} max={500} defaultValue={r.director_hours ?? ""} style={{ width: 90 }} />
            </label>
            <button type="submit" className={a.secondary}>
              Log hours
            </button>
            <span className={a.mutedSmall}>
              {" "}
              in the price: {quote ? quote.episodes.reduce((s, e) => s + e.breakdown.review_hours, 0).toFixed(2) : "?"} h
            </span>
          </form>
          <p className={a.mutedSmall}>
            The director’s sample: export it from the order folder on their PC to <code>creators/{id}/directed/</code>, then
            use it here; it is checked and sent with the same button as the studio’s.
          </p>
          {directedFiles.filter((k) => k.endsWith(".mp3")).length ? (
            <ul className={a.mutedSmall}>
              {directedFiles
                .filter((k) => k.endsWith(".mp3"))
                .map((k) => (
                  <li key={k}>
                    <form action={useDirectedSample} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="key" value={k} />
                      {k.split("/").pop()}{" "}
                      {r.sample_key === k ? (
                        <b>(the current sample)</b>
                      ) : (
                        <button type="submit" className={a.secondary} disabled={r.sample_state === "sent" || r.sample_state === "making"}>
                          Use as the sample
                        </button>
                      )}
                    </form>
                  </li>
                ))}
            </ul>
          ) : (
            <p className={a.mutedSmall}>No sample exported by the director yet.</p>
          )}
        </>
      )}
      {!directed && <p className={a.mutedSmall}>Studio-made · credit line: {STUDIO_CREDIT}</p>}

      {r.state === "needs_human" && r.needs_human_why && (
        <form action={letContinue} className={a.actions}>
          <input type="hidden" name="id" value={id} />
          <p>
            Waiting for you: <b>{r.needs_human_why.replace(/_/g, " ")}</b>.{" "}
            {r.needs_human_why === "big_screen"
              ? "Quote the music replacement add-on by email first."
              : r.needs_human_why === "claude_cap"
                ? "Raise claude_cap_usd in the flow settings first if needed."
                : ""}
          </p>
          <button type="submit" className={a.primary}>
            Let the writer continue (emails them)
          </button>
        </form>
      )}

      {!!Object.keys(answers).length && (
        <>
          <h2 className={a.gapTop}>Choices</h2>
          <ul className={a.mutedSmall}>
            {Object.entries(answers).map(([k, v]) => (
              <li key={k}>
                <b>{BY_ID[k]?.label.en ?? k}</b>:{" "}
                {k === "look_style" ? STYLE_LABELS[String(v)]?.en : k === "look_colour" ? COLOUR_LABELS[String(v)]?.en : label(k, v)}
              </li>
            ))}
          </ul>
        </>
      )}

      {draft && (
        <>
          {!!Object.keys(draft.text).length && (
            <>
              <h2 className={a.gapTop}>The writer’s own words{draft.flagged ? " (firewall flag: instruction-like text somewhere)" : ""}</h2>
              <ul>
                {Object.entries(draft.text).map(([k, v]) => (
                  <li key={k}>
                    <b>{BY_ID[k]?.label.en ?? k}</b>: {v}
                  </li>
                ))}
              </ul>
              <p className={a.mutedSmall}>For reading only; never paste these into a prompt.</p>
            </>
          )}
          {!!draft.characters.length && (
            <>
              <h2 className={a.gapTop}>Characters</h2>
              <ul>
                {draft.characters.map((ch, i) => (
                  <li key={i}>
                    <b>{ch.name}</b> ({ch.role}
                    {ch.age ? `, ${ch.age}` : ""}){ch.look ? ` · ${ch.look}` : ""}
                    {ch.voice ? ` · voice: ${ch.voice}` : ""}
                    {ch.real_person !== "no" ? ` · real person: ${ch.real_person.replace(/_/g, " ")}` : ""}
                    {ch.sacred ? ` · ${ch.sacred.replace(/_/g, " ")}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!!draft.followups.length && (
            <>
              <h2 className={a.gapTop}>Studio Saathi’s questions</h2>
              <ul>
                {draft.followups.flatMap((rd) =>
                  rd.questions.map((q) => (
                    <li key={q.id}>
                      {q.question}
                      <br />
                      <b>{rd.answers[q.id] === "__decide" ? "You decide" : rd.answers[q.id] || "(no answer)"}</b>
                    </li>
                  )),
                )}
              </ul>
            </>
          )}
          {!!draft.pronunciation.length && (
            <p className={a.mutedSmall}>
              Pronunciation: {draft.pronunciation.map((x) => `${x.word}${x.say_as ? ` = ${x.say_as}` : ""}`).join(" · ")}
            </p>
          )}
          {draft.episodes.length > 1 && (
            <p className={a.mutedSmall}>
              Episodes: {draft.episodes.map((e, i) => `${i + 1}. ${e.title} (from character ${e.start})`).join(" · ")}
            </p>
          )}
          {!!pictures.length && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pictures.map((p) =>
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived private link
                  <img key={p.key} src={p.url} alt="" width={120} height={120} style={{ objectFit: "cover", borderRadius: 6 }} />
                ) : null,
              )}
            </div>
          )}
        </>
      )}

      {plan && (
        <>
          <h2 className={a.gapTop}>
            Creative plan v{r.plan_version}
            {r.plan_approved_at ? ` · approved ${when(r.plan_approved_at)}` : " · not approved yet"}
          </h2>
          <PlanView md={plan} />
        </>
      )}
      {quote && (
        <>
          <h2 className={a.gapTop}>
            Quote ₹{quote.total.toLocaleString("en-IN")} · advance ₹{quote.advance.toLocaleString("en-IN")}
          </h2>
          {quote.episodes[0]?.breakdown.fx && (
            <p className={a.mutedSmall}>
              Priced at $1 = ₹{quote.episodes[0].breakdown.fx.rate} ({quote.episodes[0].breakdown.fx.date}) + {(quote.episodes[0].breakdown.fx.markup * 100).toFixed(2)}% card
              markup, {new Date(quote.made_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          )}
          {quote.episodes.map((e, i) => (
            <p key={i} className={a.mutedSmall}>
              {quote.episodes.length > 1 ? `Episode ${i + 1}: ` : ""}₹{e.price} · {e.breakdown.minutes} min · {e.breakdown.stills} pictures · tools ₹
              {e.breakdown.inr.tool_cost} (narration {e.breakdown.inr.narration}, images {e.breakdown.inr.images}, Claude {e.breakdown.inr.claude}, render{" "}
              {e.breakdown.inr.render}, buffered {e.breakdown.inr.buffered}) · review {e.breakdown.review_hours} h = ₹{e.breakdown.inr.review} · add-ons ₹
              {e.breakdown.inr.addons} · fixed-cost share ₹{e.breakdown.inr.overhead ?? 0}
              <br />
              Left for you after tools, Razorpay fee and fixed-cost share: ₹
              {Math.round(e.breakdown.inr.left_for_you ?? e.price - e.breakdown.inr.tool_cost).toLocaleString("en-IN")} (your{" "}
              {e.breakdown.review_hours} h of review + margin), before GST and income tax
            </p>
          ))}
        </>
      )}
      {typeof claudeCost?.usd === "number" && (
        <p className={a.mutedSmall}>
          Claude so far: ${claudeCost!.usd.toFixed(3)} · {(claudeCost!.calls ?? []).map((x) => `${x.step} ${Number(x.usd ?? 0).toFixed(3)}`).join(" · ")}
        </p>
      )}
      {r.state === "submitted" && r.sample_state === "sent" && r.plan_version > 0 && (
        <form action={advanceReceived} className={a.actions}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={a.primary}>
            50% advance received: build the order pack
          </button>
          <span className={a.mutedSmall}>By hand until Razorpay is set up. Stops the 7-day deletion clock.</span>
        </form>
      )}
      {r.order_pack_key && <p className={a.mutedSmall}>Order pack: {r.order_pack_key}</p>}
      {!!payments?.length && (
        <ul className={a.mutedSmall}>
          {payments.map((p) => (
            <li key={p.razorpay_order_id}>
              {p.kind} ₹{(p.amount_paise / 100).toLocaleString("en-IN")} · <b>{p.status}</b> · order {p.razorpay_order_id}
              {p.razorpay_payment_id ? ` · payment ${p.razorpay_payment_id}` : ""} · {when(p.paid_at ?? p.created_at)}
              {p.failure_reason ? ` · ${p.failure_reason}` : ""}
              {p.status === "paid" && p.razorpay_payment_id && (
                <RefundForm paymentId={p.id} requestId={id} left={p.amount_paise - refundedOn(p.razorpay_payment_id)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!!refunds?.length && (
        <>
          <h3>Refunds</h3>
          <ul className={a.mutedSmall}>
            {refunds.map((x) => (
              <li key={x.id}>
                ₹{(x.amount_paise / 100).toLocaleString("en-IN")} · <b>{x.status}</b> · {x.reason.replace(/_/g, " ")} · by {x.by} · {when(x.created_at)}
                {x.razorpay_refund_id ? ` · ${x.razorpay_refund_id}` : ""}
                {x.note ? ` · “${x.note}”` : ""}
                {x.failure_reason ? ` · ${x.failure_reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={a.mutedSmall}>
        <Link href={`/admin/creators/${id}/evidence`}>Evidence for a dispute (consents, plan, payments, delivery) →</Link>
      </p>

      <h2 className={a.gapTop}>Screening</h2>
      <p>
        {r.screening_result ?? "—"}
        {r.screening_categories?.length ? ` (${r.screening_categories.join(", ")})` : ""}
        {r.screening_reason ? ` — ${r.screening_reason}` : ""}
      </p>
      <p className={a.mutedSmall}>Style tags: {r.style_tags?.join(", ") || "none"}</p>

      <h2 className={a.gapTop}>Sample</h2>
      {draft && (
        <form action={saveTitleAuthorAction} className={a.form} style={{ maxWidth: 640 }}>
          <input type="hidden" name="id" value={id} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className={a.field} style={{ flex: "1 1 240px" }}>
              Title (read first)
              <input name="title" defaultValue={draft.text.title ?? ""} maxLength={200} />
            </label>
            <label className={a.field} style={{ flex: "1 1 200px" }}>
              Author
              <input name="author" defaultValue={draft.text.author ?? draft.text.credit_name ?? ""} maxLength={200} />
            </label>
          </div>
          <button type="submit" className={a.secondary}>
            Save title and author
          </button>
        </form>
      )}
      <p className={a.mutedSmall}>
        Pauses {narr.source ? `from the engine (${narr.source})` : "(engine rules not exported yet)"}:{" "}
        {Object.entries(narr.pauses).map(([k, v]) => `${k.replace(/_/g, " ")} ${v} s${narr.standIn.includes(k as never) ? " (stand-in)" : ""}`).join(" · ")}
        <br />
        Levels: {Object.entries(narr.levels).map(([k, v]) => `${k.replace(/_/g, " ")} ${v} dB${narr.standIn.includes(k as never) ? " (stand-in)" : ""}`).join(" · ")}
      </p>
      {r.state === "sample_due" && (
        <form action={sampleFeeReceivedAction} className={a.actions}>
          <input type="hidden" name="id" value={id} />
          <p>Plan approved; waiting for the ₹{(r.quote as { sample?: number } | null)?.sample ?? 499} sample fee.</p>
          <button type="submit" className={a.secondary}>
            ₹{(r.quote as { sample?: number } | null)?.sample ?? 499} received outside Razorpay: make the sample now
          </button>
        </form>
      )}
      {r.state === "submitted" && r.story_key ? (
        <>
          <p>
            State: <b>{r.sample_state ?? "not made yet"}</b>
            {r.sample_made_at ? ` · made ${when(r.sample_made_at)}` : ""}
            {r.sample_sent_at ? ` · sent ${when(r.sample_sent_at)}` : ""}
            {r.files_delete_at ? ` · files deleted after ${when(r.files_delete_at)}` : ""}
          </p>
          {r.sample_error && <p className={a.error}>Last attempt: {r.sample_error}</p>}
          {r.sample_qc && (
            <p className={a.mutedSmall}>
              Automatic check: <b>{(r.sample_qc as { pass: boolean }).pass ? "passed" : "not passed"}</b> ·{" "}
              {(r.sample_qc as { seconds: number }).seconds} s · {String((r.sample_qc as { lufs: number | null }).lufs ?? "?")} LUFS · heard as {String((r.sample_qc as { heard_language?: string | null }).heard_language ?? "?")} · words heard{" "}
              {(r.sample_qc as { words_matched: number | null }).words_matched === null
                ? "?"
                : `${Math.round(((r.sample_qc as { words_matched: number }).words_matched) * 100)}%`}
              {" · voice above music and sounds "}
              {(() => {
                const d = (r.sample_qc as { voice_clear_db?: number | null }).voice_clear_db;
                return d === undefined ? "not measured (older sample)" : d === null ? "nothing under the words" : `${d} dB`;
              })()}
              {Number(cost.background_lowered_db ?? 0) < 0 ? ` (background lowered ${String(cost.background_lowered_db)} dB to get there)` : ""}
              {cost.effects_after !== undefined ? ` · effects: ${String(cost.effects_after)} after a line, ${String(cost.effects_under)} under the words` : ""}
            </p>
          )}
          {listen && (
            <>
              <audio controls preload="none" src={listen} style={{ width: "100%", maxWidth: 560 }} />
              <p className={a.mutedSmall}>
                Mood {String(cost.mood ?? "—")} · {String(cost.seconds ?? "?")} s · {String(cost.elevenlabs_chars ?? "?")} voice characters ·
                Claude {String(cost.claude_input_tokens ?? 0)}/{String(cost.claude_output_tokens ?? 0)} tokens · attempt {String(cost.attempt ?? 1)}
              </p>
              {!!credits.length && (
                <ul className={a.mutedSmall}>
                  {credits.map((c, i) => (
                    <li key={`${c.name}-${i}`}>
                      {c.kind} ({c.source === "library" ? "our library" : "Freesound"}): “{c.name}” · {c.author} · {c.licence}
                      {c.attribution ? ` · credit: ${c.attribution}` : ""}
                      {c.url && (
                        <>
                          {" · "}
                          <a href={c.url} target="_blank" rel="noopener noreferrer">
                            source
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className={a.actions}>
            {r.sample_state === "making" && <StopButton id={id} />}
            {r.sample_state !== "sent" && r.sample_state !== "making" && <MakeSampleButton id={id} again={!!r.sample_key} />}
            {r.sample_state === "sent" && <FreeRemakeButton id={id} used={(r.sample_remakes ?? 0) >= 1} />}
            {r.sample_state === "sent" && <MakeSampleButton id={id} again label="Make a new version (studio’s cost; the writer keeps the current one until you send)" />}
            {r.sample_state === "review" && (
              <form action={sendSampleAction}>
                <input type="hidden" name="id" value={id} />
                <button type="submit" className={a.primary}>
                  Approve and send to the writer
                </button>
              </form>
            )}
          </div>
        </>
      ) : (
        <p className={a.mutedSmall}>
          {r.story_key
            ? "A sample is made only for submitted requests."
            : "No stored story for this request (sent before stories were stored, or already deleted). Its story is in your email."}
        </p>
      )}

      {story && (
        <>
          <h2 className={a.gapTop}>Story ({story.length.toLocaleString("en-IN")} characters)</h2>
          <div lang={r.language} style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, maxWidth: "70ch" }}>
            {story}
          </div>
        </>
      )}
      {brief && (
        <>
          <h2 className={a.gapTop}>Note and answers</h2>
          <p>{brief.about || "(no note)"}</p>
          <ul>
            {brief.answers.map((x) => (
              <li key={x.question}>
                <b>
                  [{x.topic}
                  {isStyleTopic(x.topic) ? ", style" : ""}]
                </b>{" "}
                {x.question}
                <br />
                {x.answer || "(skipped)"}
              </li>
            ))}
          </ul>
          <p className={a.mutedSmall}>Style answers are for reading only; never paste them into a prompt.</p>
        </>
      )}

      {["draft", "screening", "questions", "plan", "sample_due", "submitted", "needs_human"].includes(r.state) && (
        <div className={a.actions}>
          <form action={setRequestState}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="state" value="closed" />
            <button type="submit" className={a.secondary}>
              Close request
            </button>
          </form>
          {r.state === "needs_human" && (
            <form action={setRequestState}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="state" value="refused" />
              <button type="submit" className={a.secondary}>
                Refuse
              </button>
            </form>
          )}
        </div>
      )}

      <h2 className={a.gapTop}>Sample settings</h2>
      <form action={saveSampleSettings} className={a.form}>
        <p className={a.mutedSmall}>
          Native voice for native stories: each story is read only by the voice chosen for its own language. Voices
          ElevenLabs lists for the language come first, then your designed voices; anything else is marked. Gujarati and
          Hindi use ElevenLabs v4, like the Ramayana chapters.
        </p>
        {(["gu", "hi", "en"] as const).map((l) => {
          const cur = voiceFor(settings, l);
          const sorted = [...voices].sort(
            (x, y) =>
              Number(speaksLanguage(y, l)) - Number(speaksLanguage(x, l)) ||
              Number(y.category === "generated") - Number(x.category === "generated") ||
              x.name.localeCompare(y.name),
          );
          return (
            <div key={l} className={a.fieldRow ?? ""} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label className={a.field} style={{ flex: "2 1 320px" }}>
                {SAMPLE_LANGS[l]} narrator
                <select name={`voice_${l}`} defaultValue={cur?.voice_id ?? ""}>
                  <option value="">— none: {SAMPLE_LANGS[l]} samples wait for you —</option>
                  {sorted.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                      {v.category === "generated" ? " (our designed voice)" : v.category ? ` (${v.category})` : ""}
                      {speaksLanguage(v, l) ? ` · speaks ${SAMPLE_LANGS[l]}` : ` · NOT listed for ${SAMPLE_LANGS[l]}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className={a.field} style={{ flex: "1 1 140px" }}>
                Model
                <input name={`model_${l}`} defaultValue={cur?.model_id ?? DEFAULT_MODEL[l]} />
              </label>
            </div>
          );
        })}
        <label className={a.field}>
          Samples per day (all writers)
          <input name="daily_cap" type="number" min={0} max={50} defaultValue={settings.daily_cap} />
        </label>
        <label className={a.check}>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Samples switched on
        </label>
        <button type="submit" className={a.secondary}>
          Save settings
        </button>
        {!voices.length && <p className={a.mutedSmall}>No voices loaded (ElevenLabs key missing or unreachable).</p>}
      </form>
      <h2 className={a.gapTop}>Who opened this story</h2>
      {!access?.length ? (
        <p className={a.empty}>Nobody yet.</p>
      ) : (
        <ul className={a.mutedSmall}>
          {access.map((x, i) => (
            <li key={i}>
              {when(x.at)} · {x.who} ({x.role}) · {x.what}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
