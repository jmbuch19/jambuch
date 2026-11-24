import type { Metadata } from "next";
import { unit } from "@/lib/courtyard";
import { DRAFT_STAGES, contributorTokenFor, roomForUser, roomWork } from "@/lib/rooms";
import { sessionClient } from "@/lib/supabase-server";
import LibraryHeader from "../../library/header";
import { signOutOfRoom } from "./actions";
import ContributeForm from "../contribute-form";
import { AboutForm, AskToOpen, LeaveRoom, RoomSignIn } from "./room-forms";
import y from "../courtyard.module.css";

export const metadata: Metadata = { title: "My room · The Courtyard · jambuch.in", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  agreement_accepted: "Being prepared: not public yet",
  room_draft: "Being prepared: not public yet",
  needs_review: "With Jaydeep for review: not public yet",
  live: "Open: anyone can visit it",
  paused: "Resting: hidden for now",
};

// The room owner's own page: signed in with the invited address, they write
// a few lines about themselves, add work (each piece waits for Jaydeep), ask
// for the room to open, or close it.
export default async function MyRoomPage() {
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  const room = user ? await roomForUser(user.id) : null;

  let body: React.ReactNode;
  if (!user) {
    body = (
      <>
        <h1 className={y.h1}>My room</h1>
        <p className={y.lede}>Sign in with the email your invitation came to. I’ll send you a link: no password needed.</p>
        <RoomSignIn />
      </>
    );
  } else if (!room) {
    body = (
      <>
        <h1 className={y.h1}>No room here yet</h1>
        <p className={y.lede}>
          You’re signed in as {user.email}, and there’s no room for this address. If you were invited with another email,
          sign out and sign in with that one. To ask for a room, use the form in the Courtyard.
        </p>
        <form action={signOutOfRoom}>
          <button type="submit" className={y.send}>
            Sign out
          </button>
        </form>
      </>
    );
  } else {
    const first = room.name.split(" ")[0];
    const draft = DRAFT_STAGES.includes(room.stage);
    const [me, work] = await Promise.all([
      contributorTokenFor(room).catch((err) => {
        console.error("my room: contributor link failed:", err);
        return null;
      }),
      roomWork<{ id: string; title: string; series_id: string | null }>(room.email, "id, title, series_id"),
    ]);
    body = (
      <>
        <h1 className={y.h1}>Your room, {first}</h1>
        <div className={y.roomPanel}>
          <p>
            Status: <span className={y.roomStatus}>{STATUS[room.stage]}</span>
          </p>
          {room.stage === "live" && room.room_slug && (
            <p>
              Your room: <a href={`/courtyard/${room.room_slug}`}>jambuch.in/courtyard/{room.room_slug}</a>
            </p>
          )}
          {draft && (
            <>
              <p className={y.small}>
                Write a few lines about yourself and share a few pieces below. When you’re happy, ask me to open the room.
                Nothing goes public until I do.
              </p>
              <AskToOpen />
            </>
          )}
          {room.stage === "needs_review" && <p className={y.small}>I’ll write to you once I’ve looked. You can keep adding work meanwhile.</p>}
        </div>

        <div className={y.roomPanel}>
          <h2>About you</h2>
          <AboutForm about={room.room_about} />
        </div>

        {room.stage !== "paused" && (
          <div className={y.roomPanel}>
            <h2>Add to your room</h2>
            <p className={y.small}>
              One piece, a series or a book. I read each one before it appears in your room and on the Courtyard thread.
            </p>
            {me ? (
              <ContributeForm contributor={{ token: me.token, name: me.name, city: me.city }} />
            ) : (
              <p className={y.error}>The form can’t open just now. Please try again in a little while.</p>
            )}
          </div>
        )}

        {(work.shelf.length > 0 || work.singles.length > 0) && (
          <div className={y.roomPanel}>
            <h2>Your work so far</h2>
            <ul className={y.small}>
              {work.shelf.map((s) => (
                <li key={s.slug}>
                  <a href={`/courtyard/series/${s.slug}`}>{s.title}</a> · {s.shape === "book" ? "book" : "series"}, {s.parts}{" "}
                  {s.parts === 1 ? unit(s.shape).one : unit(s.shape).many}
                </li>
              ))}
              {work.singles.map((p) => (
                <li key={p.id}>
                  <a href={`/courtyard#piece-${p.id}`}>{p.title}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={y.roomPanel}>
          <h2>Leave</h2>
          <p className={y.small}>You can close your room whenever you like, and you’ll get all your work back by email.</p>
          <LeaveRoom />
        </div>
        <form action={signOutOfRoom}>
          <button type="submit" className={y.textButton}>
            Sign out
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrowWide}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        {body}
      </main>
    </>
  );
}
