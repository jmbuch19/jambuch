import { requireAdmin } from "@/lib/admin";
import { setRequestState } from "./actions";
import a from "../../admin.module.css";

// Creator's Space sample requests (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards").
// No story text is stored: the story and answers are in the email each request sends.
export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

const OPEN = ["screening", "questions", "submitted", "needs_human"];

export default async function CreatorRequestsPage() {
  const { db } = await requireAdmin();
  const { data: rows, error } = await db
    .from("creator_requests")
    .select("id, created_at, name, email, language, make, story_chars, state, screening_result, screening_categories, screening_reason, style_tags, big_screen, music_replacement")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <h1 className={a.title}>Creator’s Space requests</h1>
      <p className={a.intro}>
        Sign-in, Turnstile, the limits (3 open per writer, 5 new a day) and the story screening run before any
        follow-up questions. “Needs your eye” requests are emailed to you with the story; close or refuse them here once
        you have replied.
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
                <th>Style tags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.created_at)}</td>
                  <td>
                    {r.name}
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
    </>
  );
}
