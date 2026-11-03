"use server";

import { sendEmail } from "@/lib/email";
import { linkId, linkValid } from "@/lib/signed-links";
import { adminClient } from "@/lib/supabase-admin";

// The creator's answer to "May I make your piece into an audio story or
// video?", from the signed link in that email. They can change their mind
// until it's made; after that, they write to Jaydeep.
async function answer(token: string, yes: boolean): Promise<{ ok: boolean }> {
  if (!linkValid("media-consent", token)) return { ok: false };
  const id = linkId(token)!.id;
  const db = adminClient();
  const { data, error } = await db
    .from("courtyard_submissions")
    .update({ media_stage: yes ? "agreed" : "declined", media_answered_at: new Date().toISOString() })
    .eq("id", id)
    .in("media_stage", ["asked", "agreed", "declined"])
    .is("deleted_at", null)
    .select("name, title")
    .maybeSingle();
  if (error || !data) return { ok: false };
  if (process.env.ADMIN_EMAIL) {
    await sendEmail({
      from: "The Courtyard <courtyard@jambuch.in>",
      to: process.env.ADMIN_EMAIL,
      subject: `${data.name} said ${yes ? "yes" : "no, thank you"} to an audio/video of “${data.title ?? "their piece"}”`,
      text: `${data.name} answered ${yes ? "YES: go ahead and make it" : "NO, thank you: nothing will be made"} for “${data.title ?? "their piece"}”.\n\nAdmin → Courtyard → Audio & video.`,
    });
  }
  return { ok: true };
}

export async function agreeMedia(token: string) {
  return answer(token, true);
}

export async function declineMedia(token: string) {
  return answer(token, false);
}
