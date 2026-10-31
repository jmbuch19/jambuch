import type { Metadata } from "next";
import LibraryHeader from "../../../library/header";
import { unfollow } from "../../series/actions";
import LinkButton from "../../link-button";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Stop following · The Courtyard · jambuch.in", robots: { index: false } };

export default async function UnfollowPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        <h1 className={y.h1}>Stop following</h1>
        <p className={y.lede}>No more emails about new parts of this series.</p>
        <LinkButton
          token={token}
          run={unfollow}
          label="Stop the emails"
          done="Done. You won’t hear about this series again."
          failed="This link is no longer valid; you may already have stopped following."
        />
      </main>
    </>
  );
}
