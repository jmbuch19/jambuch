import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { saveJsonSetting, setRequestState } from "./actions";
import { flowSettings, pricingSettings } from "@/lib/creators/flow";
import a from "../../admin.module.css";

// Creator's Space sample requests (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards").
// No story text is stored: the story and answers are in the email each request sends.
export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

const OPEN = ["draft", "screening", "questions", "plan", "submitted", "needs_human"];
const WHY: Record<string, string> = {
  big_screen: "festival / TV / cinema",
  screening: "screening unsure",
  claude_cap: "Claude budget reached",
  plan_discuss: "wants to discuss the plan",
};

export default async function CreatorRequestsPage() {
  const { db } = await requireAdmin();
  const { data: rows, error } = await db
    .from("creator_requests")
    .select("id, created_at, name, email, language, make, story_chars, state, screening_result, screening_categories, screening_reason, style_tags, big_screen, music_replacement, sample_state, needs_human_why, quote, claude_cost")
    .order("created_at", { ascending: false })
    .limit(200);
  const [pricing, flow] = await Promise.all([pricingSettings(), flowSettings()]);
  // Which ticks each request was sent with (brief §7), and under which terms version.
  const { data: consents } = rows?.length
    ? await db.from("creator_consents").select("request_id, kind, terms_version, language").in("request_id", rows.map((r) => r.id))
    : { data: [] as { request_id: string; kind: string; terms_version: string; language: string }[] };
  type Ticks = { kinds: string[]; version: string; language: string };
  const ticks = new Map<string, Ticks>();
  for (const c of consents ?? []) {
    const t: Ticks = ticks.get(c.request_id) ?? { kinds: [], version: c.terms_version, language: c.language };
    t.kinds.push(c.kind);
    ticks.set(c.request_id, t);
  }

  return (
    <>
      <h1 className={a.title}>Creator’s Space requests</h1>
      <p className={a.intro}>
        The guided question flow (docs/CREATORS_QUESTION_FLOW.md): sign-in, the limits (3 open per writer, 5 new a day),
        the story, consents and screening come before any other Claude call. “Needs your eye” requests are emailed to you;
        open one to let the writer continue, close it or refuse it.
      </p>
      {error && <p className={a.error}>Couldn’t load requests: {error.message}</p>}
      {!rows?.length ? (
        <p className={a.empty}>No requests yet.</p>
      ) : (
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Writer</th>
                <th>Story</th>
                <th>State</th>
                <th>Screening</th>
                <th>Consents</th>
                <th>Style tags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.created_at)}</td>
                  <td>
                    <Link href={`/admin/creators/${r.id}`}>{r.name || "(no name yet)"}</Link>
                    <br />
                    <span className={a.mutedSmall}>{r.email}</span>
                  </td>
                  <td>
                    {r.language} · {r.make}
                    <br />
                    <span className={a.mutedSmall}>{r.story_chars.toLocaleString("en-IN")} characters</span>
                  </td>
                  <td>
                    {r.state === "needs_human" ? <b>Needs your eye</b> : r.state}
                    {r.needs_human_why && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>{WHY[r.needs_human_why] ?? r.needs_human_why}</span>
                      </>
                    )}
                    {r.quote && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>quote ₹{Number((r.quote as { total: number }).total).toLocaleString("en-IN")}</span>
                      </>
                    )}
                    {!!(r.claude_cost as { usd?: number } | null)?.usd && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>Claude ${(r.claude_cost as { usd: number }).usd.toFixed(2)}</span>
                      </>
                    )}
                    {r.sample_state && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>sample: {r.sample_state}</span>
                      </>
                    )}
                    {r.music_replacement && (
                      <>
                        <br />
                        <b>Music replacement</b>
                      </>
                    )}
                    {r.big_screen === "unsure" && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>big screen: not sure</span>
                      </>
                    )}
                  </td>
                  <td>
                    {r.screening_result ?? "—"}
                    {!!r.screening_categories?.length && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>{r.screening_categories.join(", ")}</span>
                      </>
                    )}
                    {r.screening_reason && (
                      <>
                        <br />
                        <span className={a.mutedSmall}>{r.screening_reason}</span>
                      </>
                    )}
                  </td>
                  <td className={a.mutedSmall}>
                    {ticks.get(r.id)
                      ? `${ticks.get(r.id)!.kinds.length} ticks · v${ticks.get(r.id)!.version} · ${ticks.get(r.id)!.language}`
                      : "none"}
                  </td>
                  <td className={a.mutedSmall}>{r.style_tags?.join(", ") || "—"}</td>
                  <td>
                    {OPEN.includes(r.state) && (
                      <form action={setRequestState}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" name="state" value="closed" className={a.linkButton}>
                          Close
                        </button>{" "}
                        {r.state === "needs_human" && (
                          <button type="submit" name="state" value="refused" className={a.linkButton}>
                            Refuse
                          </button>
                        )}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={a.gapTop}>Pricing settings (brief §5)</h2>
      <p className={a.intro}>
        Every number of the pricing engine. Defaults are the measured Ramayana rates (docs/pricing-calibration.md). Still
        assumptions until you set them: <b>inr_per_usd</b> (85), <b>review_hours</b> per level and service,{" "}
        <b>render_inr_per_minute</b> (5), <b>credits_per_motion_clip</b> (3000), <b>addons_inr</b>, the Hindi and English{" "}
        <b>chars_per_minute</b>. Claude token prices are in the separate setting creators.claude_prices.
      </p>
      <form action={saveJsonSetting} className={a.form}>
        <input type="hidden" name="key" value="creators.pricing" />
        <textarea name="value" rows={24} defaultValue={JSON.stringify(pricing, null, 2)} style={{ fontFamily: "monospace", fontSize: 13, width: "100%" }} />
        <button type="submit" className={a.secondary}>
          Save pricing
        </button>
      </form>

      <h2 className={a.gapTop}>Question flow settings</h2>
      <p className={a.intro}>
        <b>claude_cap_usd</b>: the most Claude may cost per request before it waits for you. <b>voice_notes</b>: off until you
        approve the cost (ElevenLabs speech-to-text, credits per note). <b>examples</b>: links to the 15-second example
        clips, when made. <b>payments_enabled</b>: the Razorpay advance button for writers (LIVE key: real money). Keep it{" "}
        false until Vercel Pro, the GST answer, Razorpay KYC and one full test order are done (brief §2).
      </p>
      <form action={saveJsonSetting} className={a.form}>
        <input type="hidden" name="key" value="creators.flow" />
        <textarea name="value" rows={10} defaultValue={JSON.stringify(flow, null, 2)} style={{ fontFamily: "monospace", fontSize: 13, width: "100%" }} />
        <button type="submit" className={a.secondary}>
          Save flow settings
        </button>
      </form>
    </>
  );
}
