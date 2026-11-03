import type { Metadata } from "next";
import { MEDIA_KIND_LABELS, isMediaKind } from "@/lib/courtyard";
import { linkId, linkValid } from "@/lib/signed-links";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../../library/header";
import MediaAnswer from "./answer";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "An audio story or video? · The Courtyard · jambuch.in", robots: { index: false } };
export const dynamic = "force-dynamic";

// "May I make your piece into an audio story or video?": the creator's answer,
// reached from the signed link in Jaydeep's email.
export default async function MediaConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = linkValid("media-consent", token);
  const { data: s } = valid
    ? await adminClient()
        .from("courtyard_submissions")
        .select("name, title, media_stage, media_kind")
        .eq("id", linkId(token)!.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  const what = isMediaKind(s?.media_kind) ? MEDIA_KIND_LABELS[s.media_kind].toLowerCase() : "audio story or video";
  const open = s && (s.media_stage === "asked" || s.media_stage === "agreed" || s.media_stage === "declined");

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        {!s ? (
          <>
            <h1 className={y.h1}>This link doesn’t work</h1>
            <p className={y.lede}>Please reply to my email instead, and I’ll sort it out.</p>
          </>
        ) : s.media_stage === "made" ? (
          <>
            <h1 className={y.h1}>It’s already made</h1>
            <p className={y.lede}>
              The {what} of “{s.title}” is up. If you’d like any change, or want it taken down, just reply to my email.
            </p>
          </>
        ) : !open ? (
          <>
            <h1 className={y.h1}>Nothing to answer just now</h1>
            <p className={y.lede}>If you have a question about “{s.title}”, reply to my email.</p>
          </>
        ) : (
          <>
            <h1 className={y.h1}>May I make “{s.title}” into an {what}?</h1>
            <p className={y.lede}>Dear {s.name.split(" ")[0]}, here’s what that would mean:</p>
            <ul className={y.mediaPromise}>
              <li>Your piece read aloud by a voice, with a little music and sound where it helps.</li>
              <li>Always credited to you, by name.</li>
              <li>I share it with you before it goes up.</li>
              <li>You can ask me to take it down at any time, no reason needed.</li>
            </ul>
            <MediaAnswer token={token} current={s.media_stage as "asked" | "agreed" | "declined"} />
          </>
        )}
      </main>
    </>
  );
}
