import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { initials, unit } from "@/lib/courtyard";
import { roomWork } from "@/lib/rooms";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../library/header";
import LetterInvite from "../../letter-invite";
import PieceTurn, { PIECE_COLUMNS, type Piece } from "../piece-turn";
import y from "../courtyard.module.css";

export const revalidate = 60;

// A room is public while it is live; while it rests, the page says so.
// Only these columns are read: never the owner's email in the page.
async function load(slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data: room } = await adminClient()
    .from("courtyard_invites")
    .select("name, email, craft, room_slug, room_about, stage")
    .eq("room_slug", slug)
    .in("stage", ["live", "paused"])
    .is("deleted_at", null)
    .maybeSingle();
  if (!room) return null;
  const work = room.stage === "live" ? await roomWork<Piece>(room.email, PIECE_COLUMNS) : { shelf: [], singles: [] };
  return { room: { name: room.name, craft: room.craft, about: room.room_about, live: room.stage === "live" }, ...work };
}

export async function generateMetadata({ params }: { params: Promise<{ room: string }> }): Promise<Metadata> {
  const found = await load((await params).room);
  if (!found) return {};
  return {
    title: `${found.room.name}’s room · The Courtyard · jambuch.in`,
    description: found.room.about?.slice(0, 160) ?? `${found.room.name}’s work in the Courtyard at jambuch.in.`,
  };
}

export default async function RoomPage({ params }: { params: Promise<{ room: string }> }) {
  const found = await load((await params).room);
  if (!found) notFound();
  const { room, shelf, singles } = found;

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard#contribute", label: "Contribute" }} current="courtyard" />
      <main>
        <section className={y.hero}>
          <p className={`gu ${y.kicker}`}>
            <a href="/courtyard">આંગણું · The Courtyard</a>
          </p>
          <div className={y.roomHead}>
            <span className={y.roomAvatar} aria-hidden="true">
              {initials(room.name)}
            </span>
            <div>
              <p className={y.eyebrow}>A room{room.craft ? ` · ${room.craft}` : ""}</p>
              <h1 className={y.h1}>{room.name}</h1>
            </div>
          </div>
          {room.about && <p className={`${y.lede} ${y.roomAbout}`}>{room.about}</p>}
          {!room.live && <p className={y.lede}>This room is resting for now. Its work will be back.</p>}
        </section>

        {room.live && shelf.length > 0 && (
          <section className={y.band} aria-labelledby="room-shelf">
            <div className={y.bandInner}>
              <h2 id="room-shelf" className={y.h2}>
                Series and books
              </h2>
              <div className={y.seriesShelf}>
                {shelf.map((s) => {
                  const u = unit(s.shape);
                  return (
                    <a key={s.slug} href={`/courtyard/series/${s.slug}`} className={y.seriesCard}>
                      <span className={y.eyebrow}>{s.shape === "book" ? "Book" : "Series"}</span>
                      <span className={y.seriesCardTitle}>{s.title}</span>
                      <span className={y.seriesCardBy}>
                        {s.parts} {s.parts === 1 ? u.one : u.many}
                        {s.status === "ended" ? " · complete" : ""}
                      </span>
                      <span className={y.doorGo}>Read the {u.whole} →</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {room.live && (
          <section className={`${y.band} ${y.bandAlt}`} aria-labelledby="room-pieces">
            <div className={y.threadWrap}>
              <h2 id="room-pieces" className={y.h2}>
                Pieces
              </h2>
              {singles.length === 0 && shelf.length === 0 && <p className={y.empty}>The first pieces are on their way.</p>}
              {singles.length === 0 && shelf.length > 0 && <p className={y.empty}>Everything so far is in the series and books above.</p>}
              <ol className={y.thread}>
                {singles.map((p) => (
                  <PieceTurn key={p.id} p={p} pickUpHref={`/courtyard#reply-${p.id}`} />
                ))}
              </ol>
              <p className={y.small}>
                <a href="/courtyard#thread">The whole Courtyard thread →</a>
              </p>
            </div>
          </section>
        )}
        <LetterInvite variant="bar" source="room page" />
      </main>
    </>
  );
}
