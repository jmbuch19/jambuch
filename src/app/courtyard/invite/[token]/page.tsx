import type { Metadata } from "next";
import { maskEmail, sameEmail } from "@/lib/invites";
import { sessionClient } from "@/lib/supabase-server";
import LibraryHeader from "../../../library/header";
import { signOut } from "../../../admin/login/actions";
import { liveInvite } from "./actions";
import { AcceptForm, SignInButton } from "./invite-forms";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Your invitation · The Courtyard · jambuch.in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await liveInvite(token);
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <>
        <h1 className={y.h1}>This link can’t be used</h1>
        <p className={y.lede}>
          Invitation links work once. This one has already been used, replaced by a newer link, or cancelled. If you
          think that’s a mistake, write to Jaydeep and he’ll send a fresh one.
        </p>
      </>
    );
  } else if (invite.expired) {
    body = (
      <>
        <h1 className={y.h1}>This invitation has expired</h1>
        <p className={y.lede}>Invitation links last 14 days. Ask Jaydeep for a new link, and it will be waiting for you.</p>
      </>
    );
  } else {
    const first = invite.name.split(" ")[0];
    body = (
      <>
        <h1 className={y.h1}>A room for you, {first}</h1>
        <p className={y.lede}>
          Jaydeep would like to give you a room of your own in the Courtyard at jambuch.in: a place for your work, with
          your name on every piece.
        </p>
        {invite.note && <blockquote className={y.inviteNote}>{invite.note}</blockquote>}
        {!user ? (
          <div className={y.inviteStep}>
            <p>
              First, sign in with the email this invitation was sent to ({maskEmail(invite.email)}). I’ll email you a
              sign-in link.
            </p>
            <SignInButton token={token} />
          </div>
        ) : !sameEmail(user.email, invite.email) ? (
          <div className={y.inviteStep}>
            <p className={y.error}>
              You’re signed in as {user.email}, but this invitation is for {maskEmail(invite.email)}. Sign out, then open
              the invitation link again.
            </p>
            <form action={signOut}>
              <button type="submit" className={y.send}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <AcceptForm token={token} name={first} />
        )}
      </>
    );
  }

  return (
    <>
      <LibraryHeader />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        {body}
      </main>
    </>
  );
}
