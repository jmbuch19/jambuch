import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { readBrief, readStory } from "@/lib/creators/files";
import { isStyleTopic } from "@/lib/creators/claude";
import { sampleLink } from "@/lib/creators/delivery";
import { listVoices, sampleSettings, type Voice } from "@/lib/creators/sample";
import { saveSampleSettings, sendSampleAction, setRequestState } from "../actions";
import MakeSampleButton from "./make-sample";
import a from "../../../admin.module.css";

// One Creator's Space request: the story and answers (from private storage), the
// screening, and the free audio sample (Phase 2a, brief §6H): make, listen, send.
export const dynamic = "force-dynamic";
// Making a sample (Claude, ElevenLabs, Freesound, FFmpeg) runs in this page's actions.
export const maxDuration = 300;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireAdmin();
  const { data: r } = await db.from("creator_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const [story, brief, settings, voices, listen] = await Promise.all([
    r.story_key ? readStory(id).catch(() => null) : Promise.resolve(null),
    r.story_key ? readBrief(id) : Promise.resolve(null),
    sampleSettings(),
    listVoices().catch(() => [] as Voice[]),
    r.sample_key ? sampleLink(id, r.sample_key).catch(() => null) : Promise.resolve(null),
  ]);
  const credits = (r.sample_credits ?? []) as { kind: string; name: string; author: string; licence: string; url: string }[];
  const cost = (r.sample_cost ?? {}) as Record<string, string | number>;

  return (
    <>
      <p className={a.crumb}>
        <Link href="/admin/creators">← Creator’s Space requests</Link>
      </p>
      <h1 className={a.title}>
        {r.name} · {r.state === "needs_human" ? "Needs your eye" : r.state}
      </h1>
      <p className={a.intro}>
        {r.email}
        {r.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ""} · {r.language} · {r.make} · {r.length} · sent {when(r.created_at)}
        {r.music_replacement ? " · MUSIC REPLACEMENT" : r.big_screen === "unsure" ? " · big screen: not sure" : ""}
      </p>

      <h2 className={a.gapTop}>Screening</h2>
      <p>
        {r.screening_result ?? "—"}
        {r.screening_categories?.length ? ` (${r.screening_categories.join(", ")})` : ""}
        {r.screening_reason ? ` — ${r.screening_reason}` : ""}
      </p>
      <p className={a.mutedSmall}>Style tags: {r.style_tags?.join(", ") || "none"}</p>

      <h2 className={a.gapTop}>Sample</h2>
      {r.state === "submitted" && r.story_key ? (
        <>
          <p>
            State: <b>{r.sample_state ?? "not made yet"}</b>
            {r.sample_made_at ? ` · made ${when(r.sample_made_at)}` : ""}
            {r.sample_sent_at ? ` · sent ${when(r.sample_sent_at)}` : ""}
            {r.files_delete_at ? ` · files deleted after ${when(r.files_delete_at)}` : ""}
          </p>
          {r.sample_error && <p className={a.error}>Last attempt failed: {r.sample_error}</p>}
          {listen && (
            <>
              <audio controls preload="none" src={listen} style={{ width: "100%", maxWidth: 560 }} />
              <p className={a.mutedSmall}>
                Mood {String(cost.mood ?? "—")} · {String(cost.seconds ?? "?")} s · {String(cost.elevenlabs_chars ?? "?")} voice characters ·
                Claude {String(cost.claude_input_tokens ?? 0)}/{String(cost.claude_output_tokens ?? 0)} tokens · attempt {String(cost.attempt ?? 1)}
              </p>
              {!!credits.length && (
                <ul className={a.mutedSmall}>
                  {credits.map((c) => (
                    <li key={c.url}>
                      {c.kind}: “{c.name}” by {c.author}, {c.licence} ·{" "}
                      <a href={c.url} target="_blank" rel="noopener noreferrer">
                        source
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className={a.actions}>
            {r.sample_state !== "sent" && <MakeSampleButton id={id} again={!!r.sample_key} />}
            {r.sample_state === "review" && (
              <form action={sendSampleAction}>
                <input type="hidden" name="id" value={id} />
                <button type="submit" className={a.primary}>
                  Approve and send to the writer
                </button>
              </form>
            )}
          </div>
        </>
      ) : (
        <p className={a.mutedSmall}>
          {r.story_key
            ? "A sample is made only for submitted requests."
            : "No stored story for this request (sent before stories were stored, or already deleted). Its story is in your email."}
        </p>
      )}

      {story && (
        <>
          <h2 className={a.gapTop}>Story ({story.length.toLocaleString("en-IN")} characters)</h2>
          <div lang={r.language} style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, maxWidth: "70ch" }}>
            {story}
          </div>
        </>
      )}
      {brief && (
        <>
          <h2 className={a.gapTop}>Note and answers</h2>
          <p>{brief.about || "(no note)"}</p>
          <ul>
            {brief.answers.map((x) => (
              <li key={x.question}>
                <b>
                  [{x.topic}
                  {isStyleTopic(x.topic) ? ", style" : ""}]
                </b>{" "}
                {x.question}
                <br />
                {x.answer || "(skipped)"}
              </li>
            ))}
          </ul>
          <p className={a.mutedSmall}>Style answers are for reading only; never paste them into a prompt.</p>
        </>
      )}

      {["screening", "questions", "submitted", "needs_human"].includes(r.state) && (
        <form action={setRequestState} className={a.actions}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" name="state" value="closed" className={a.secondary}>
            Close request
          </button>
          {r.state === "needs_human" && (
            <button type="submit" name="state" value="refused" className={a.secondary}>
              Refuse
            </button>
          )}
        </form>
      )}

      <h2 className={a.gapTop}>Sample settings</h2>
      <form action={saveSampleSettings} className={a.form}>
        <label className={a.field}>
          Narrator voice (ElevenLabs)
          <select name="voice_id" defaultValue={settings.voice_id}>
            <option value="">— choose —</option>
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}
                {v.category ? ` (${v.category})` : ""}
                {v.labels?.language ? ` · ${v.labels.language}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={a.field}>
          Voice model
          <input name="model_id" defaultValue={settings.model_id} />
        </label>
        <label className={a.field}>
          Samples per day (all writers)
          <input name="daily_cap" type="number" min={0} max={50} defaultValue={settings.daily_cap} />
        </label>
        <label className={a.check}>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Samples switched on
        </label>
        <button type="submit" className={a.secondary}>
          Save settings
        </button>
        {!voices.length && <p className={a.mutedSmall}>No voices loaded (ElevenLabs key missing or unreachable).</p>}
      </form>
    </>
  );
}
