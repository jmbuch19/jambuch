import "server-only";
import { randomBytes } from "node:crypto";
import { makeLink, linkId, linkValid } from "./signed-links";
import { adminClient } from "./supabase-admin";

// Courtyard series: helpers shared by the public pages, the submit action and
// the admin.

export type SeriesStatus = "pending" | "active" | "paused" | "ended";

export function seriesSlug(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  // A short tail keeps addresses unique even for the same title.
  return `${base || "series"}-${randomBytes(3).toString("hex")}`;
}

// The contributor's personal "add the next part" link.
export function seriesAddUrl(site: string, s: { id: string; add_link_version: number }) {
  return `${site}/courtyard/add/${makeLink("series-add", s.id, s.add_link_version)}`;
}

// The series behind a personal link, if the link is genuine and current.
export async function seriesForLink(token: string) {
  const parts = linkId(token);
  if (!parts) return null;
  const { data } = await adminClient()
    .from("courtyard_series")
    .select("id, slug, title, name, email, city, form, themes, status, add_link_version")
    .eq("id", parts.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || !linkValid("series-add", token, data.add_link_version)) return null;
  return data as {
    id: string;
    slug: string;
    title: string;
    name: string;
    email: string;
    city: string | null;
    form: string | null;
    themes: string[];
    status: SeriesStatus;
    add_link_version: number;
  };
}

// Follow / unfollow links for a follower row.
export const followConfirmUrl = (site: string, followerId: string) =>
  `${site}/courtyard/follow/${makeLink("series-follow", followerId)}`;
export const unfollowUrl = (site: string, followerId: string) =>
  `${site}/courtyard/unfollow/${makeLink("series-unfollow", followerId)}`;
