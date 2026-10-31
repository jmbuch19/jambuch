import type { Metadata } from "next";
import LibraryHeader from "../library/header";
import l from "../library/library.module.css";
import InstallCard from "./install-card";

export const metadata: Metadata = {
  title: "Install on your phone · jambuch.in",
  description: "Keep jambuch on your phone's home screen: one tap opens the chapter where you stopped.",
};

// Linked from the homepage footer: how to put jambuch on this phone.
export default function InstallPage() {
  return (
    <>
      <LibraryHeader />
      <main className={l.reader}>
        <p className={l.eyebrow} style={{ marginTop: 40 }}>
          Install on your phone · <span className="gu">ફોન પર રાખો</span>
        </p>
        <h1 className={l.chapterTitle} style={{ fontFamily: "var(--font-heading)" }}>
          One tap to keep reading
        </h1>
        <p className={l.lede}>
          With jambuch on your home screen, one tap opens the chapter you were reading, at the same paragraph, with your
          text size. Chapters you have read stay readable without internet. No app store, no account.
        </p>
        <InstallCard variant="page" />
      </main>
    </>
  );
}
