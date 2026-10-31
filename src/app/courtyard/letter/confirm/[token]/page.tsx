import type { Metadata } from "next";
import LibraryHeader from "../../../../library/header";
import LinkButton from "../../../link-button";
import { confirmReader } from "../../actions";
import y from "../../../courtyard.module.css";

export const metadata: Metadata = { title: "Confirm the weekly letter · jambuch.in", robots: { index: false } };

export default async function ConfirmLetterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        <h1 className={y.h1}>The weekly letter</h1>
        <p className={y.lede}>One email after each gathering, with the pieces that joined that week. Nothing else.</p>
        <LinkButton
          token={token}
          run={confirmReader}
          label="Yes, send me the letter"
          done="You’re on the list. The first letter comes after the next gathering, and every one has a one-tap way to stop."
          failed="This link is no longer valid. You can join again from the Courtyard page."
        />
      </main>
    </>
  );
}
