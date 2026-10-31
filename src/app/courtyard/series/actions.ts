"use server";

import { headers } from "next/headers";
import { sendEmail } from "@/lib/email";
import { followConfirmUrl } from "@/lib/series";
import { linkId, linkValid } from "@/lib/signed-links";
import { adminClient } from "@/lib/supabase-admin";
import { passesTurnstile } from "@/lib/turnstile";

export type FollowState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteUrl() {
  const origin = (await headers()).get("origin");
  return origin && /^https?:\/\//.test(origin) ? origin : "https://jambuch.in";
}

// "Follow along": one confirmation email; new parts are emailed only to
// confirmed followers, each with a one-tap way to stop.
export async function followSeries(_prev: FollowState, form: FormData): Promise<FollowState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const seriesId = String(form.get("series_id") ?? "");
  if (String(form.get("website") ?? "")) return { status: "sent" };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please give a valid email address." };
  if (!/^[0-9a-f-]{36}$/i.test(seriesId)) return { status: "error", message: "Something went wrong. Please reload the page." };
  if (!(await passesTurnstile(String(form.get("cf-turnstile-response") ?? ""), "follow"))) {
    return { status: "error", message: "The spam check didn’t go through. Please try again." };
  }

  const db = adminClient();
  const { data: series } = await db
    .from("courtyard_series")
    .select("id, title, name")
    .eq("id", seriesId)
    .in("status", ["active", "paused"])
    .is("deleted_at", null)
    .maybeSingle();
  if (!series) return { status: "error", message: "This series isn’t taking followers just now." };

  // Re-following never duplicates: reuse the row if there is one.
  const { data: existing } = await db
    .from("courtyard_series_followers")
    .select("id, confirmed_at")
    .eq("series_id", seriesId)
    .eq("email", email)
    .maybeSingle();
  if (existing?.confirmed_at) return { status: "sent" };
  let followerId = existing?.id as string | undefined;
  if (!followerId) {
    const { data: created, error } = await db
      .from("courtyard_series_followers")
      .insert({ series_id: seriesId, email })
      .select("id")
      .single();
    if (error) {
      console.error("follow insert failed:", error.message);
      return { status: "error", message: "Something went wrong on my side. Please try again in a little while." };
    }
    followerId = created.id;
  }

  const ok = await sendEmail({
    from: "Jaydeep Buch <courtyard@jambuch.in>",
    to: email,
    subject: `Follow “${series.title}” in the Courtyard?`,
    text: [
      `You asked to hear when a new part of “${series.title}” by ${series.name} joins the Courtyard at jambuch.in.`,
      "",
      "Please confirm by opening this link:",
      followConfirmUrl(await siteUrl(), followerId!),
      "",
      "If it wasn’t you, ignore this email and nothing will be sent.",
    ].join("\n"),
  });
  if (!ok) return { status: "error", message: "I couldn’t send the confirmation email. Please check the address." };
  return { status: "sent" };
}

export async function confirmFollow(token: string): Promise<{ ok: boolean; title?: string }> {
  if (!linkValid("series-follow", token)) return { ok: false };
  const db = adminClient();
  const { data } = await db
    .from("courtyard_series_followers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", linkId(token)!.id)
    .select("series_id")
    .maybeSingle();
  if (!data) return { ok: false };
  const { data: s } = await db.from("courtyard_series").select("title").eq("id", data.series_id).maybeSingle();
  return { ok: true, title: s?.title };
}

export async function unfollow(token: string): Promise<{ ok: boolean }> {
  if (!linkValid("series-unfollow", token)) return { ok: false };
  const { error } = await adminClient().from("courtyard_series_followers").delete().eq("id", linkId(token)!.id);
  return { ok: !error };
}
