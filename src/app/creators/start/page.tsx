import type { Metadata } from "next";
import Link from "next/link";
import { sessionClient } from "@/lib/supabase-server";
import LibraryHeader from "../../library/header";
import SignInForm from "./sign-in-form";
import RequestWizard from "./request-wizard";
import { signOutWriter, withdrawRequest } from "./actions";
import { LIMITS, OPEN_STATES } from "./limits";
import h from "../../home.module.css";
import c from "../creators.module.css";

export const metadata: Metadata = {
  title: "Start with a free sample · Creator's Space · jambuch.in",
  robots: { index: false },
};

// Signed in only: reads the visitor's session on every request.
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  screening: "Being checked",
  questions: "Waiting for your answers",
  submitted: "With the studio",
  needs_human: "A person is reading it",
  refused: "Not accepted",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

export default async function StartPage() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  const { data: requests } = user
    ? await db
        .from("creator_requests")
        .select("id, state, created_at, story_chars")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };
  const open = (requests ?? []).filter((r) => OPEN_STATES.includes(r.state) && r.state !== "questions").length;

  return (
    <>
      <LibraryHeader cta={{ href: "/creators", label: "Creator’s Space" }} />
      <main className={c.page}>
        <section className={c.block} aria-labelledby="start">
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 id="start" className={c.h2}>
            Start with a free sample
          </h1>

          {!user ? (
            <>
              <p className={c.text}>
                First, sign in with your email. We send a short code; no password is needed. We ask for it before
                anything is read or made, so each sample reaches a real writer.
              </p>
              <SignInForm />
            </>
          ) : (
            <>
              <div className={c.small}>
                Signed in as <b>{user.email}</b> ·{" "}
                <form action={signOutWriter} className={c.inlineForm}>
                  <button type="submit" className={c.linkButton}>
                    sign out
                  </button>
                </form>
              </div>

              {!!requests?.length && (
                <ul className={c.requests} aria-label="Your requests">
                  {requests.map((r) => (
                    <li key={r.id}>
                      <span>{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      <span>{r.story_chars.toLocaleString("en-IN")} characters</span>
                      <b>{STATE_LABEL[r.state] ?? r.state}</b>
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

              {open >= LIMITS.open ? (
                <p className={c.text}>
                  You have {LIMITS.open} requests open, the most at one time. We’ll reply by email; you can also
                  withdraw one above.
                </p>
              ) : (
                <RequestWizard />
              )}
            </>
          )}
        </section>

        <p className={c.apart}>
          <Link href="/creators">← Back to Creator’s Space</Link>
        </p>
      </main>
    </>
  );
}
