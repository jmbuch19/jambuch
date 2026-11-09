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

// A channel (@handle or /channel/ID) or a playlist; share tails like ?si= are dropped.
// Empty stays empty (no button); anything else gives null (refused).
function cleanYouTube(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || !/^(www\.|m\.)?youtube\.com$/.test(u.hostname)) return null;
  if (/^\/(@[\w.-]+|channel\/[\w-]+)\/?$/.test(u.pathname)) return `https://www.youtube.com${u.pathname.replace(/\/$/, "")}`;
  const list = u.searchParams.get("list");
  if (u.pathname === "/playlist" && list && /^[\w-]+$/.test(list)) return `https://www.youtube.com/playlist?list=${list}`;
  return null;
}

export async function saveShow(show: Show) {
  const { db } = await requireAdmin();
  const youtubeUrl = cleanYouTube(show.youtubeUrl ?? "");
  if (youtubeUrl === null)
    return { error: "The YouTube link should be a channel (https://www.youtube.com/@…) or a playlist (…/playlist?list=…)." };
  const clean: Show = {
    title: show.title.trim().slice(0, 300),
    author: show.author.trim().slice(0, 200),
    description: show.description.trim().slice(0, 4000),
    email: show.email.trim().slice(0, 200),
    coverUrl: show.coverUrl.trim().slice(0, 1000),
    link: show.link.trim().slice(0, 1000),
    // Spotify's share links carry a ?si= tracking tail; keep the plain address.
    spotifyUrl: (show.spotifyUrl ?? "").trim().split("?")[0].slice(0, 300),
    youtubeUrl,
  };
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) return { error: "That owner email doesn't look right." };
  for (const u of [clean.coverUrl, clean.link]) if (u && !/^https:\/\//.test(u)) return { error: "Links must start with https://." };
  if (clean.spotifyUrl && !/^https:\/\/open\.spotify\.com\/show\/\w+$/.test(clean.spotifyUrl))
    return { error: "The Spotify link should look like https://open.spotify.com/show/…" };
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

// After a new audio play is uploaded: the old MP3 is deleted, so a published
// episode would point at a missing file. This rewrites the live feed with the
// new link — only for an episode that is already out, and only when nothing
// new is waiting (new episodes go out by hand, in book order). Never fails the
// upload; returns a short note for the admin, or null when there is nothing to do.
export async function refreshFeedAfterUpload(chapterId: string): Promise<string | null> {
  const { db } = await requireAdmin();
  try {
    const old = await readPublic(FEED_KEY);
    if (!old) return null; // no feed published yet
    const { xml, problems, episodes } = await checkFeed(db);
    const mine = episodes.find((e) => e.chapterId === chapterId);
    if (!mine || mine.isNew) return null; // not in the podcast, or not out yet
    if (problems.length || !xml) return `Podcast feed not refreshed (${problems[0] ?? "the feed could not be built"}). Check it on the Podcast page.`;
    if (episodes.some((e) => e.isNew)) return "Podcast feed not refreshed: new episodes are waiting. Publish them from the Podcast page, and the new audio goes out with them.";
    await writePublicFile(FEED_BAK_KEY, old, "application/rss+xml; charset=utf-8");
    const bytes = new TextEncoder().encode(xml);
    await writePublicFile(FEED_KEY, bytes.buffer as ArrayBuffer, "application/rss+xml; charset=utf-8");
    done();
    return "Podcast feed refreshed: Spotify gets the new audio for this episode.";
  } catch (err) {
    console.error("podcast refresh after upload failed:", err);
    return "Podcast feed not refreshed (an error). Publish it from the Podcast page.";
  }
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
    for (const e of rest.episodes.filter((e) => e.isNew)) {
      const { error } = await db
        .from("podcast_episodes")
        .update({ first_published_at: e.pubDateIso })
        .eq("chapter_id", e.chapterId)
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
