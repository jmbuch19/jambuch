import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import type { Usage } from "./claude";
import type { Character, Draft, Episode } from "./files";
import { BY_ID, LEVEL_LIMITS, LEVEL_PRESETS, STYLE_LABELS, COLOUR_LABELS, narrationMinutes, type Answers, type Ctx, type Lang, t } from "./questions";
import { inputFrom, mergePricing, quote, type ClaudePrices, type PricingSettings, type Quote } from "./pricing";
import { onlyVocabulary } from "./vocabulary";
import { TERMS_VERSION } from "./terms";

// Server side of the question flow (docs/CREATORS_QUESTION_FLOW.md): settings, the
// per-draft Claude budget, the plain summaries Claude reads, the quote, the style tags
// and the order pack.

export type FlowSettings = {
  claude_cap_usd: number;
  voice_notes: boolean;
  max_plan_rounds: number;
  max_followup_rounds: number;
  examples: Record<string, string>;
};
export const FLOW_DEFAULTS: FlowSettings = { claude_cap_usd: 2, voice_notes: false, max_plan_rounds: 3, max_followup_rounds: 2, examples: {} };

export const STORY_MAX = 120_000; // six episodes; longer stories go to Assisted by email
export const STORY_MIN = 200;
export const EPISODE_CHARS = 20_000;

async function setting(key: string) {
  const { data } = await adminClient().from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

export async function flowSettings(): Promise<FlowSettings> {
  return { ...FLOW_DEFAULTS, ...((await setting("creators.flow")) as Partial<FlowSettings> | null) };
}
export async function pricingSettings(): Promise<PricingSettings> {
  return mergePricing(await setting("creators.pricing"));
}
export async function claudePrices(): Promise<ClaudePrices | null> {
  return (await setting("creators.claude_prices")) as ClaudePrices | null;
}

// ---------------------------------------------------------------- Claude budget per draft

export type CostLog = { usd: number; calls: { step: string; model: string; input: number; output: number; usd: number; at: string }[] };

export function usd(u: Usage, prices: ClaudePrices | null) {
  const m = prices?.models?.[u.model];
  // Unknown price: count it at Opus input/output so the cap still bites.
  const input = m?.input ?? 5;
  const output = m?.output ?? 25;
  return (u.input * input + u.output * output) / 1_000_000;
}

// Collects the usage of one step's calls, then writes it to the row.
export function meterFor(step: string, prices: ClaudePrices | null) {
  const calls: CostLog["calls"] = [];
  return {
    meter: (u: Usage) => calls.push({ step, model: u.model, input: u.input, output: u.output, usd: usd(u, prices), at: new Date().toISOString() }),
    async save(requestId: string, previous: CostLog | null) {
      if (!calls.length) return previous ?? { usd: 0, calls: [] };
      const log: CostLog = {
        usd: (previous?.usd ?? 0) + calls.reduce((a, c) => a + c.usd, 0),
        calls: [...(previous?.calls ?? []), ...calls].slice(-100),
      };
      await adminClient().from("creator_requests").update({ claude_cost: log }).eq("id", requestId);
      return log;
    },
  };
}

export const overCap = (log: CostLog | null, s: FlowSettings) => (log?.usd ?? 0) >= s.claude_cap_usd;

// ---------------------------------------------------------------- what Claude reads

const lab = (id: string, v: string | string[] | undefined, lang: Lang = "en") => {
  const q = BY_ID[id];
  if (!q || v === undefined) return "";
  const one = (x: string) => t(q.options?.find((o) => o.id === x)?.label, lang) || x;
  return Array.isArray(v) ? v.map(one).join(", ") : one(v);
};

// The writer's choices as plain English lines (choices only, never free text).
export function choicesText(a: Answers, ctx: Ctx) {
  const level = String(a.level ?? "standard");
  const preset = LEVEL_PRESETS[level] ?? {};
  const v = (k: string) => (a[k] ?? preset[k]) as string | string[] | undefined;
  const lines = [
    `Story language: ${ctx.storyLang ?? a.lang}; about ${Math.round(narrationMinutes(ctx.storyChars, ctx.storyLang))} minutes to narrate (${ctx.storyChars} characters)`,
    `Wants: ${lab("make", v("make"))}`,
    `Origin: ${lab("origin", v("origin"))}`,
    `For: ${lab("purpose", v("purpose")) || "not said"}`,
    a.monetise ? `Monetised on YouTube: ${lab("monetise", v("monetise"))}` : "",
    a.age_group ? `Children's age group: ${lab("age_group", v("age_group"))}` : "",
    `Audience: ${lab("audience", v("audience"))}${a.audience === "elders" ? " (larger captions, slower narration)" : ""}`,
    `Finish level: ${level}; service: ${level === "premium" ? "assisted" : lab("service", v("service")) || "self-serve"}`,
    `Visual: ${a.make === "audio" ? "audio only" : lab("visual", v("visual"))}${Number(v("shorts")) ? `; ${v("shorts")} Shorts` : ""}`,
    `Sound: ${lab("sound", v("sound"))}`,
    `Voices: ${lab("voices", v("voices"))}${(v("voice_addons") as string[] | undefined)?.length ? `; add-ons: ${lab("voice_addons", v("voice_addons"))}` : ""}`,
    `Delivery: ${lab("delivery", v("delivery"))}`,
    `Second language: ${a.second_language && a.second_language !== "none" ? lab("second_language", v("second_language")) : "none"}`,
    `Text: ${a.text_mode === "shape" ? `may be shortened; target ${a.target_minutes === "story" ? "as the story needs" : `${a.target_minutes} minutes`}` : "narrate exactly as written"}${
      a.length_check ? ` (length choice: ${a.length_check})` : ""
    }`,
    `Feel: ${lab("feel", v("feel")) || "you decide"}`,
    a.look_style ? `Look: ${t(STYLE_LABELS[String(a.look_style)], "en")}, ${t(COLOUR_LABELS[String(a.look_colour)], "en") || "colour: you decide"}` : isVideoA(a) ? "Look: you decide" : "",
    (a.music_wish as string[] | undefined)?.length ? `Music: ${lab("music_wish", v("music_wish"))}` : "",
    (a.sfx_wish as string[] | undefined)?.length ? `Sounds: ${lab("sfx_wish", v("sfx_wish"))}` : "",
    (a.avoid as string[] | undefined)?.length ? `Avoid: ${lab("avoid", v("avoid"))}` : "",
    `Level limits: up to ${LEVEL_LIMITS[level]?.characters ?? 3} character voices`,
  ];
  return lines.filter(Boolean).join("\n");
}
const isVideoA = (a: Answers) => a.make !== "audio" && a.visual !== "audio_only";

// Free-text answers (already cleaned by the firewall), labelled by question.
export function notesText(d: Draft) {
  return Object.entries(d.text)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${t(BY_ID[k]?.label, "en") || k}: ${v}`)
    .join("\n");
}

export function charactersText(cs: Character[]) {
  return cs
    .map(
      (c) =>
        `${c.name} (${c.role}${c.age ? `, ${c.age}` : ""})${c.look ? `: ${c.look}` : ""}${c.voice ? `; voice: ${c.voice}` : ""}${
          c.real_person === "alive_no_permission" ? "; REAL LIVING PERSON WITHOUT PERMISSION: narration only, never shown" : c.real_person !== "no" ? `; real person (${c.real_person})` : ""
        }${c.sacred === "symbols_only" ? "; show only symbols (feet, hands, light, objects), never the face" : c.sacred === "show_face" ? "; may be shown" : ""}`,
    )
    .join("\n");
}

export function followupsText(d: Draft) {
  return d.followups
    .flatMap((r) => r.questions.map((q) => `Q: ${q.question}\nA: ${r.answers[q.id] === "__decide" ? "You decide" : r.answers[q.id] || "(skipped)"}`))
    .join("\n\n");
}

// ---------------------------------------------------------------- quote

export function characterVoices(a: Answers, d: Draft) {
  const level = String(a.level ?? "standard");
  const voices = a.voices ?? LEVEL_PRESETS[level]?.voices;
  if (voices !== "characters") return 0;
  const limit = Math.max(LEVEL_LIMITS[level]?.characters ?? 3, 1);
  const n = d.characters.filter((c) => c.real_person !== "alive_no_permission").length || 2;
  return Math.min(n, limit);
}

export function episodeChars(chars: number, eps: Episode[]) {
  if (eps.length < 2) return [chars];
  const starts = [...eps.map((e) => e.start)].sort((x, y) => x - y);
  return starts.map((s, i) => (starts[i + 1] ?? chars) - s);
}

export async function makeQuote(a: Answers, d: Draft, chars: number, storyLang: string | null): Promise<Quote> {
  const [s, cp] = await Promise.all([pricingSettings(), claudePrices()]);
  // Writer chose "shorten" in the length check: price the target length, not the full text.
  let priced = chars;
  if (a.text_mode === "shape" && a.length_check === "shorten" && Number(a.target_minutes)) {
    priced = Math.min(chars, Math.round(Number(a.target_minutes) * (s.chars_per_minute[storyLang ?? "gu"] ?? 700)));
  }
  const input = inputFrom(a, priced, storyLang, characterVoices(a, d));
  return quote(input, priced === chars ? episodeChars(chars, d.episodes) : [priced], s, cp);
}

// Is Assisted full this week? (brief §3A capacity cap.) Returns the next Monday if full.
export async function assistedFull(): Promise<string | null> {
  const s = await pricingSettings();
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const { count } = await adminClient()
    .from("creator_requests")
    .select("id", { count: "exact", head: true })
    .in("state", ["submitted", "ordered"])
    .eq("answers->>service", "assisted")
    .gte("plan_approved_at", monday.toISOString());
  if ((count ?? 0) < s.assisted_weekly_cap) return null;
  const next = new Date(monday.getTime() + 7 * 86400_000);
  return next.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- style tags

// Every choice that has a vocabulary meaning becomes a tag. Free text goes through
// styleTags() (Claude) separately; both are checked by onlyVocabulary().
export function choiceTags(a: Answers, d: Draft): string[] {
  const list: string[] = [];
  for (const m of (a.feel as string[] | undefined) ?? []) list.push(`mood:${m}`);
  if (a.look_style) list.push(`style:${a.look_style}`);
  if (a.look_colour) list.push(`colour:${a.look_colour}`);
  for (const x of [...((a.music_wish as string[] | undefined) ?? []), ...((a.sfx_wish as string[] | undefined) ?? []), ...((a.avoid as string[] | undefined) ?? [])]) list.push(x);
  if (a.sound === "narration") list.push("music:none");
  if (a.audience === "elders") list.push("pace:slow");
  if (a.audience === "children" || a.age_group === "under8") list.push("avoid:no-scary-sounds", "avoid:no-violence-shown");
  if (d.characters.some((c) => c.sacred === "symbols_only")) list.push("avoid:no-deity-face");
  return onlyVocabulary(list);
}

// ---------------------------------------------------------------- order pack (§12)

export type PackRow = {
  id: string;
  language: string;
  answers: Answers;
  style_tags: string[];
  quote: Quote | null;
  plan_version: number;
};

// Tags and ids only for anything a generator will see; free text (look, ending card,
// follow-up answers) is carried as quoted data for the Claude shot-list step only.
export function orderPack(r: PackRow, d: Draft, consents: { terms_version: string; data_consent_version: string; own_voice: boolean }) {
  const a = r.answers;
  const level = String(a.level ?? "standard");
  const preset = LEVEL_PRESETS[level] ?? {};
  const v = (k: string) => String(a[k] ?? preset[k] ?? "");
  const tags = r.style_tags;
  const pick = (group: string) => tags.filter((x) => x.startsWith(`${group}:`)).map((x) => x.slice(group.length + 1));
  const children = a.age_group ? String(a.age_group) : null;
  return {
    order_id: r.id,
    engine_version: "engine-v1.0",
    made_at: new Date().toISOString(),
    language: r.language,
    second_language: a.second_language && a.second_language !== "none" ? a.second_language : null,
    story_r2_key: `creators/${r.id}/story.txt`,
    origin: { type: v("origin"), credits_block: d.text.credit_name || "" },
    purpose: (a.purpose as string[] | undefined) ?? [],
    monetise: a.monetise === "yes",
    broadcast_use: a.big_screen === "yes",
    audience: { group: v("audience") || "adults", elders_mode: a.audience === "elders", children_age: children },
    level,
    service: level === "premium" ? "assisted" : v("service") || "self_serve",
    format: { visual: a.make === "audio" ? "audio_only" : v("visual"), shorts: Number(v("shorts")) || 0 },
    sound: v("sound"),
    voices: {
      mode: v("voices") === "characters" ? "narrator_plus_characters" : "narrator",
      narrator_voice_id: null,
      exclusive_voice: ((a.voice_addons as string[] | undefined) ?? []).includes("exclusive_voice"),
      own_voice: ((a.voice_addons as string[] | undefined) ?? []).includes("own_voice"),
      characters: d.characters.map((c) => ({
        name: c.name,
        role: c.role,
        age: c.age,
        look: c.look,
        voice_type: c.voice,
        voice_id: null,
        likeness: c.real_person === "alive_no_permission" ? "narration_only" : c.sacred === "symbols_only" ? "symbols_only" : "allowed",
      })),
    },
    delivery_style: v("delivery"),
    text: {
      mode: a.text_mode === "shape" ? "shape" : "exact",
      target_minutes: a.text_mode === "shape" && Number(a.target_minutes) ? Number(a.target_minutes) : null,
      length_choice: a.length_check ?? null,
      episodes: d.episodes,
    },
    mood_tags: pick("mood"),
    look: { style: a.look_style ?? null, colour: a.look_colour ?? null, setting_quoted: d.text.setting || d.setting_suggested || "" },
    music_tags: pick("music"),
    sfx_tags: pick("sound"),
    voice_tags: pick("voice"),
    pace_tags: pick("pace"),
    avoid: pick("avoid"),
    symbols_only_for: d.characters.filter((c) => c.sacred === "symbols_only").map((c) => c.name),
    ending_card_quoted: [d.text.dedication, d.text.ending].filter(Boolean).join(" · "),
    reference_images: d.pictures,
    pronunciation: d.pronunciation.map((p) => ({ ...p, audio_r2_key: null })),
    followup_answers_quoted: d.followups.flatMap((rd) => rd.questions.map((q) => ({ q: q.question, a: rd.answers[q.id] ?? "" }))),
    approved_plan_r2_key: r.plan_version ? `creators/${r.id}/plan-${r.plan_version}.md` : null,
    approved_script_r2_key: null,
    budget: {
      quote_inr: r.quote?.total ?? 0,
      tool_cap_inr: Math.round((r.quote?.episodes ?? []).reduce((s, e) => s + e.breakdown.inr.tool_cost, 0) * 1.2),
      claude_cap_usd: Math.round((r.quote?.episodes ?? []).reduce((s, e) => s + e.breakdown.claude_usd, 0) * 1.2 * 100) / 100,
    },
    variation_seed: Math.floor(Math.random() * 1_000_000),
    flagged_by_firewall: d.flagged,
    consents: { terms_version: consents.terms_version || TERMS_VERSION, data_consent_version: consents.data_consent_version || TERMS_VERSION, own_voice_consent: consents.own_voice },
  };
}
