import type { Metadata } from "next";
import { seriesForLink } from "@/lib/series";
import { adminClient } from "@/lib/supabase-admin";
import LibraryHeader from "../../../library/header";
import ContributeForm from "../../contribute-form";
import y from "../../courtyard.module.css";

export const metadata: Metadata = { title: "Add the next part · The Courtyard · jambuch.in", robots: { index: false } };
export const dynamic = "force-dynamic";

// A contributor's personal link for adding the next part of their series.
export default async function AddPartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const series = await seriesForLink(token);

  let body: React.ReactNode;
  if (!series) {
    body = (
      <>
        <h1 className={y.h1}>This link doesn’t work any more</h1>
        <p className={y.lede}>It may have been replaced by a newer one. Ask Jaydeep for a fresh link to your series.</p>
      </>
    );
  } else if (series.status !== "active") {
    body = (
      <>
        <h1 className={y.h1}>{series.title}</h1>
        <p className={y.lede}>
          {series.status === "ended"
            ? "This series is complete, so it isn’t taking new parts. Thank you for every one of them."
            : series.status === "paused"
              ? "This series is resting for now. Jaydeep will let you know when it opens again."
              : "This series opens once Jaydeep approves its first part. You’ll get an email when it does."}
        </p>
      </>
    );
  } else {
    const { count } = await adminClient()
      .from("courtyard_submissions")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id)
      .eq("status", "published")
      .is("deleted_at", null);
    body = (
      <>
        <h1 className={y.h1}>The next part of “{series.title}”</h1>
        <p className={y.lede}>
          Welcome back, {series.name.split(" ")[0]}. Send the next part whenever it’s ready: once I’ve read and approved
          it, it joins the thread at the next gathering.
        </p>
        <div className={y.addForm}>
          <ContributeForm
            series={{
              token,
              title: series.title,
              name: series.name,
              form: series.form,
              themes: series.themes,
              nextPart: (count ?? 0) + 1,
            }}
          />
        </div>
        <p className={y.small}>
          This link is yours alone: please don’t share it. <a href={`/courtyard/series/${series.slug}`}>See your series →</a>
        </p>
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
