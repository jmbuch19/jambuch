import "server-only";

// વાર્તા વિશ્વ – Story Tube: the YouTube channel's brand page (/vartavishva, and
// vartavishva.in once that domain points here). Links and text are site_text rows
// "vartavishva.*", editable in admin; the defaults below are used while a row is empty.

export const CHANNEL_ID = "UCZpC28mqUASByhJwFdTybHw";
export const CHANNEL_URL = "https://www.youtube.com/@Vartavishva-Storytube";
export const SUBSCRIBE_URL = `${CHANNEL_URL}?sub_confirmation=1`;

export type Video = { id: string; title: string; published: string };

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// The newest uploads, from the channel's public feed (no API key). Refreshed hourly;
// if YouTube can't be reached the page simply shows no list.
export async function latestVideos(limit = 6): Promise<Video[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const videos: Video[] = [];
    for (const entry of xml.split("<entry>").slice(1)) {
      const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id) && title) videos.push({ id, title: decode(title), published: published ?? "" });
      if (videos.length >= limit) break;
    }
    return videos;
  } catch {
    return [];
  }
}
