"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { FEED_BAK_KEY, FEED_KEY, checkFeed, guidFor, loadEpisodes, type FeedCheck, type Show } from "@/lib/podcast";
import { readPublic, writePublicFile } from "@/lib/r2";

// The Ramayana podcast feed (§9.5). "Check feed" builds it and reports;
// "Publish" builds it again, checks again, keeps the old feed as feed.xml.bak
// and only then replaces feed.xml.

const UUID = /^[0-9a-f-]{36}$/;
const done = () => revalidatePath("/admin/podcast");

export async function saveShow(show: Show) {
  const { db } = await requireAdmin();
  const clean: Show = {
    title: show.title.trim().slice(0, 300),
    author: show.author.trim().slice(0, 200),
    description: show.description.trim().slice(0, 4000),
    email: show.email.trim().slice(0, 200),
    coverUrl: show.coverUrl.trim().slice(0, 1000),
    link: show.link.trim().slice(0, 1000),
  };
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) return { error: "That owner email doesn't look right." };
  for (const u of [clean.coverUrl, clean.link]) if (u && !/^https:\/\//.test(u)) return { error: "Links must start with https://." };
  const { error } = await db.from("settings").upsert({ key: "podcast.show", value: clean });
  if (error) return { error: error.message };
  done();
  return { ok: true };
}

// Saves one episode's choice and description. The row (and its GUID) is
// created the first time; the GUID itself is never sent from the page.
export async function saveEpisode(chapterId: string, change: { included?: boolean; description?: string }) {
  const { db } = await requireAdmin();
  if (!UUID.test(chapterId)) return { error: "Bad chapter." };
  const { data: c } = await db.from("chapters").select("number, section").eq("id", chapterId).maybeSingle();
  const guid = c && guidFor(c);
  if (!guid) return { error: "That chapter can't be an episode." };
  const { data: existing } = await db.from("podcast_episodes").select("chapter_id").eq("chapter_id", chapterId).maybeSingle();
  const row: Record<string, unknown> = {};
  if (change.included !== undefined) row.included = change.included;
  if (change.description !== undefined) row.description = change.description.trim().slice(0, 4000);
  const { error } = existing
    ? await db.from("podcast_episodes").update(row).eq("chapter_id", chapterId)
    : await db.from("podcast_episodes").insert({ chapter_id: chapterId, guid, ...row });
  if (error) return { error: error.message };
  done();
  return { ok: true };
}

export type CheckResult = Omit<FeedCheck, "xml"> & { preview: string | null };

export async function dryRun(): Promise<CheckResult> {
  const { db } = await requireAdmin();
  const { xml, ...rest } = await checkFeed(db);
  return { ...rest, preview: xml };
}

export async function publishFeed(): Promise<CheckResult & { published?: string; error?: string }> {
  const { db } = await requireAdmin();
  const now = new Date();
  const { xml, ...rest } = await checkFeed(db, now);
  if (rest.problems.length || !xml) return { ...rest, preview: xml, error: "Not published: fix the problems first." };

  // Every chosen episode needs its row (and GUID) stored before it goes out.
  const episodes = await loadEpisodes(db);
  const missing = episodes.filter((e) => e.included && !e.stored).map((e) => ({ chapter_id: e.chapterId, guid: e.guid }));
  if (missing.length) {
    const { error } = await db.from("podcast_episodes").insert(missing);
    if (error) return { ...rest, preview: xml, error: error.message };
  }

  try {
    const old = await readPublic(FEED_KEY);
    if (old) await writePublicFile(FEED_BAK_KEY, old, "application/rss+xml; charset=utf-8");
    const bytes = new TextEncoder().encode(xml);
    const url = await writePublicFile(FEED_KEY, bytes.buffer as ArrayBuffer, "application/rss+xml; charset=utf-8");
    // The pubDate each new episode went out with is now its date for ever.
    const fresh = episodes.filter((e) => e.included && !e.firstPublishedAt).map((e) => e.chapterId);
    if (fresh.length) {
      const { error } = await db
        .from("podcast_episodes")
        .update({ first_published_at: now.toISOString() })
        .in("chapter_id", fresh)
        .is("first_published_at", null);
      if (error) return { ...rest, preview: xml, published: url, error: `Published, but the dates weren't saved: ${error.message}` };
    }
    done();
    return { ...rest, preview: xml, published: url };
  } catch (err) {
    console.error("podcast publish failed:", err);
    return { ...rest, preview: xml, error: err instanceof Error ? err.message : "Publishing failed." };
  }
}
