import type { Metadata } from "next";
import { contributorForLink } from "@/lib/series";
import LibraryHeader from "../../../library/header";
import ContributeForm from "../../contribute-form";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Share another piece · The Courtyard · jambuch.in", robots: { index: false } };
export const dynamic = "force-dynamic";

// A returning contributor's personal link: the form already knows them.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contributor = await contributorForLink(token);

  return (
    <>
      <LibraryHeader cta={{ href: "/courtyard", label: "The Courtyard" }} current="courtyard" />
      <main className={y.narrowWide}>
        <p className={`gu ${y.kicker}`}>આંગણું</p>
        {!contributor ? (
          <>
            <h1 className={y.h1}>This link doesn’t work any more</h1>
            <p className={y.lede}>
              It may have been replaced by a newer one. On the Courtyard page, use “Get your link again” and a fresh one
              will reach your inbox.
            </p>
          </>
        ) : (
          <>
            <h1 className={y.h1}>Welcome back, {contributor.name.split(" ")[0]}</h1>
            <p className={y.lede}>
              Share your next piece whenever it’s ready. Once I’ve read and approved it, it joins the thread at the next
              gathering.
            </p>
            <div className={y.addForm}>
              <ContributeForm contributor={{ token, name: contributor.name, city: contributor.city }} />
            </div>
            <p className={y.small}>
              This link is yours alone: please don’t share it. <a href="/courtyard#thread">See the thread →</a>
            </p>
          </>
        )}
      </main>
    </>
  );
}
