import type { Metadata } from "next";
import LibraryHeader from "../../../../library/header";
import LinkButton from "../../../link-button";
import { stopReader } from "../../actions";
import y from "../../../courtyard.module.css";

export const metadata: Metadata = { title: "Stop the weekly letter · jambuch.in", robots: { index: false } };

export default async function StopLetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        <h1 className={y.h1}>Stop the weekly letter</h1>
        <p className={y.lede}>Your name and email are deleted, and no more letters will come.</p>
        <LinkButton
          token={token}
          run={stopReader}
          label="Stop the letter"
          done="Done. You’re off the list, and your details are deleted. The Courtyard stays open to read any time."
          failed="This link is no longer valid; you may already have stopped the letter."
        />
      </main>
    </>
  );
}
