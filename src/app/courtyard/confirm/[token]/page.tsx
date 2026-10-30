import type { Metadata } from "next";
import LibraryHeader from "../../../library/header";
import ConfirmButton from "./confirm-button";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Confirm · The Courtyard · jambuch.in", robots: { index: false } };

// The link in the confirmation email lands here. Confirming takes a click, so
// an email scanner that opens links on its own can't confirm for the sender.
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <LibraryHeader />
      <main className={y.narrow}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        <h1 className={y.h1}>One last step</h1>
        <p className={y.lede}>Confirm that it was you who sent this to the Courtyard, and it will reach me.</p>
        <ConfirmButton token={token} />
      </main>
    </>
  );
}
