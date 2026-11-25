import type { Metadata } from "next";
import Link from "next/link";
import { sessionClient } from "@/lib/supabase-server";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../library/header";
import Flow, { type FlowInitial } from "./flow";
import ListenButton from "./listen-button";
import PayButton from "./pay-button";
import { signOutWriter, withdrawRequest } from "./actions";
import { clientDraft } from "./flow-actions";
import { flowSettings } from "@/lib/creators/flow";
import { OPEN_STATES } from "./limits";
import type { Answers } from "@/lib/creators/questions";
import h from "../../home.module.css";
import c from "../creators.module.css";

export const metadata: Metadata = {
  title: "Start your story · Creator's Space · jambuch.in",
  robots: { index: false },
};

// Signed in only beyond stage 0: reads the visitor's session on every request.
export const dynamic = "force-dynamic";
// The plan step runs Claude inside a server action on this page.
export const maxDuration = 120;

const STATE_LABEL: Record<string, string> = {
  draft: "In progress",
  screening: "Being checked",
  questions: "In progress",
  plan: "Plan ready for you",
  sample_due: "Plan approved: your sample is next",
  submitted: "With the studio",
  ordered: "In production",
  needs_human: "A person is reading it",
  refused: "Not accepted",
  withdrawn: "Withdrawn",
  closed: "Closed",
};
const EDITABLE = ["draft", "questions", "plan"];

export default async function StartPage() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  const { data: requests } = user
    ? await db
        .from("creator_requests")
        .select("id, state, created_at, story_chars, sample_state, sample_key, files_delete_at, quote")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };

  // The writer's open draft, if any, is continued where they left off.
  const open = requests?.find((r) => EDITABLE.includes(r.state));
  let initial: FlowInitial = null;
  if (open) {
    const { data: row } = await adminClient()
      .from("creator_requests")
      .select("id, answers, current_step, name, whatsapp, story_chars, story_key, language, screening_result, plan_version, state")
      .eq("id", open.id)
      .single();
    if (row) {
      const draft = await clientDraft(row.id);
      initial = {
        id: row.id,
        answers: (row.answers ?? {}) as Answers,
        currentStep: row.state === "plan" ? "plan" : row.current_step,
        name: row.name ?? "",
        whatsapp: row.whatsapp ?? "",
        storyChars: row.story_chars ?? 0,
        storyLang: row.story_key ? row.language : null,
        screened: row.screening_result === "clear",
        draft,
      };
    }
  }
  const settings = await flowSettings();
  // Payments open only when switched on in admin and the keys are set (brief §2).
  const payments = settings.payments_enabled && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  const others = (requests ?? []).filter((r) => r.id !== open?.id);

  return (
    <>
      <LibraryHeader cta={{ href: "/creators", label: "Creator’s Space" }} />
      <main className={c.page}>
        <section className={c.block} aria-labelledby="start">
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 id="start" className={c.h2}>
            Start your story
          </h1>

          {user && (
            <div className={c.small}>
              Signed in as <b>{user.email}</b> ·{" "}
              <form action={signOutWriter} className={c.inlineForm}>
                <button type="submit" className={c.linkButton}>
                  sign out
                </button>
              </form>
            </div>
          )}

          {!!others.length && (
            <ul className={c.requests} aria-label="Your requests">
              {others.map((r) => (
                <li key={r.id}>
                  <span>{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <span>{r.story_chars.toLocaleString("en-IN")} characters</span>
                  <b>{r.sample_state === "sent" && r.sample_key ? "Your sample is ready" : (STATE_LABEL[r.state] ?? r.state)}</b>
                  {r.sample_state === "sent" && r.sample_key && <ListenButton id={r.id} />}
                  {payments && r.state === "submitted" && r.sample_state === "sent" && !!(r.quote as { advance?: number } | null)?.advance && (
                    <PayButton id={r.id} kind="advance" amount={(r.quote as { advance: number }).advance} />
                  )}
                  {r.state === "sample_due" &&
                    (payments && (r.quote as { sample?: number } | null)?.sample ? (
                      <PayButton id={r.id} kind="sample" amount={(r.quote as { sample: number }).sample} />
                    ) : (
                      <span className={c.small}>Online payment opens soon; we’ll email you when you can pay for your sample.</span>
                    ))}
                  {r.state === "submitted" && r.sample_state !== "sent" && <span className={c.small}>your sample is being made</span>}
                  {r.state === "ordered" && <span className={c.small}>advance paid · in production</span>}
                  {r.sample_state === "sent" && r.files_delete_at && (
                    <span className={c.small}>
                      deleted after{" "}
                      {new Date(r.files_delete_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                    </span>
                  )}
                  {OPEN_STATES.includes(r.state) && (
                    <form action={withdrawRequest} className={c.inlineForm}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className={c.linkButton}>
                        withdraw
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Flow key={initial?.id ?? (user ? "signed-in" : "new")} signedIn={!!user} initial={initial} voiceNotes={settings.voice_notes} />
        </section>

        <p className={c.apart}>
          <Link href="/creators">← Back to Creator’s Space</Link>
        </p>
      </main>
    </>
  );
}
