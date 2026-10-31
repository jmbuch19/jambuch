import type { Metadata } from "next";
import LibraryHeader from "../../../library/header";
import { confirmFollow } from "../../series/actions";
import LinkButton from "../../link-button";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Follow a series · The Courtyard · jambuch.in", robots: { index: false } };

// From the "Follow …?" email. A click confirms, so a mail scanner opening the
// link can't sign anyone up.
export default async function FollowConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        <h1 className={y.h1}>Follow along</h1>
        <p className={y.lede}>Confirm, and you’ll get an email each time a new part of this series joins the Courtyard.</p>
        <LinkButton
          token={token}
          run={confirmFollow}
          label="Yes, follow this series"
          done="You’re following it. Each email has a one-tap way to stop."
          failed="This link is no longer valid. You can follow again from the series page."
        />
      </main>
    </>
  );
}
