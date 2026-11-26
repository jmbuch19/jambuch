"use server";

import { LIMITS as RULES } from "@/lib/creators/limits";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { passesTurnstile } from "@/lib/turnstile";
import { sessionClient } from "@/lib/supabase-server";
import { adminClient } from "@/lib/supabase-admin";
import { signedPrivateUrl, uploadPrivate } from "@/lib/r2";
import {
  claudeReady,
  episodeTitles,
  followUpRound,
  screenStory,
  fixSuggestions,
  FIXABLE,
  storyFacts,
  styleTags,
  suggestLooks,
  writePlan,
} from "@/lib/creators/claude";
import { cleanNotes, cleanStory, cleanText } from "@/lib/creators/firewall";
import { detectLanguage, extractText } from "@/lib/creators/extract";
import {
  deleteKey,
  deleteRequestFiles,
  pictureKey,
  readDraft,
  readPlan,
  readStory,
  saveBrief,
  saveDraft,
  savePlan,
  saveStory,
  type Character,
  type Draft,
} from "@/lib/creators/files";
import {
  EPISODE_CHARS,
  STORY_MAX,
  STORY_MIN,
  charactersText,
  choiceTags,
  choicesText,
  claudePrices,
  flowSettings,
  followupsText,
  makeQuote,
  meterFor,
  notesText,
  overCap,
  pricingSettings,
  type CostLog,
  type FlowSettings,
} from "@/lib/creators/flow";
import { priceOne, inputFrom, isDirected, priceRange, type Quote } from "@/lib/creators/pricing";
import {
  BY_ID,
  CHOICE_IDS,
  LEVEL_LIMITS,
  LEVEL_PRESETS,
  TEXT_IDS,
  cleanAnswer,
  cleanLook,
  VOICE_TYPES,
  narrationMinutes,
  type Answers,
  type Ctx,
} from "@/lib/creators/questions";
import { CONSENT_LANGS, TERMS_VERSION, type ConsentLang } from "@/lib/creators/terms";
import { LIMITS, OPEN_STATES } from "./limits";
import { STUDIO_FROM, STUDIO_SIGNATURE, studioReplyTo, alertTo, directedStart } from "@/lib/creators/team";

// The guided question flow's server side (docs/CREATORS_QUESTION_FLOW.md). Rules kept here:
//  · no Claude call before sign-in (stage 0 uses only the pricing engine)
//  · every choice is checked against questions.ts; anything else is dropped
//  · free text and the story go to private R2 through the firewall, never into a table
//  · every Claude call is metered; over the per-draft cap the draft waits for the reviewer

const now = () => new Date().toISOString();
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const EDITABLE = ["draft", "questions", "plan"];

async function signedInUser() {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user?.email ? { id: user.id, email: user.email.toLowerCase() } : null;
}

type Row = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  whatsapp: string | null;
  state: string;
  language: string;
  answers: Answers;
  story_chars: number;
  story_sha256: string;
  story_key: string | null;
  screening_result: string | null;
  claude_cost: CostLog | null;
  quote: Quote | null;
  plan_version: number;
  plan_rounds: number;
};

// The signed-in writer's own request, in a state they may still change.
async function own(id: string, states = EDITABLE): Promise<Row | null> {
  const user = await signedInUser();
  if (!user || !id) return null;
  const { data } = await adminClient()
    .from("creator_requests")
    .select("id, user_id, email, name, whatsapp, state, language, answers, story_chars, story_sha256, story_key, screening_result, claude_cost, quote, plan_version, plan_rounds")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.user_id !== user.id || !states.includes(data.state)) return null;
  return data as Row;
}

const ctxOf = (r: Row, d?: Draft): Ctx => ({ storyChars: r.story_chars, storyLang: r.story_key ? r.language : null, characters: d?.characters.length ?? 0 });
const stale = (r: Row) => (r.state === "plan" ? { state: "questions", quote: null } : {});
const uiLang = (a: Answers): ConsentLang => (["gu", "hi", "en"].includes(String(a.lang)) ? (a.lang as ConsentLang) : "en");

async function update(id: string, patch: Record<string, unknown>) {
  const { error } = await adminClient().from("creator_requests").update({ ...patch, updated_at: now() }).eq("id", id);
  if (error) throw new Error(error.message);
}

async function mailStudio(m: { subject: string; lines: string[]; replyTo: string }) {
  const to = await alertTo("reviewer");
  return !!to && (await sendEmail({ to, subject: m.subject, text: m.lines.join("\n"), replyTo: m.replyTo }));
}
const adminLink = (id: string) => `https://jambuch.in/admin/creators/${id}`;

// A draft that must wait for the reviewer (big screen, over the Claude cap, plan to discuss).
async function toHuman(r: Row, why: string, lines: string[]) {
  await update(r.id, { state: "needs_human", needs_human_why: why });
  await mailStudio({
    subject: `Creator's Space: ${r.name || r.email} needs your eye (${why.replace(/_/g, " ")})`,
    lines: [`${r.name || "A writer"} <${r.email}>`, "", ...lines, "", `Open the request: ${adminLink(r.id)}`],
    replyTo: r.email,
  });
  revalidatePath("/creators/start");
}

// ---------------------------------------------------------------- stage 0 (no sign-in needed)

export async function priceRangeAction(answers: Answers) {
  const a: Answers = {};
  for (const k of ["lang", "make", "length"]) {
    const v = cleanAnswer(k, answers[k]);
    if (v !== undefined) a[k] = v;
  }
  const [s, cp] = await Promise.all([pricingSettings(), claudePrices()]);
  return priceRange(a, s, cp);
}

// After sign-in: the draft row is created with the stage-0 answers and the 18+ tick.
export async function createDraft(input: { answers: Answers; age18: boolean }): Promise<{ id?: string; error?: string }> {
  const user = await signedInUser();
  if (!user) return { error: "Please sign in again." };
  if (!input.age18) return { error: "Please confirm you are 18 or older." };
  const a: Answers = {};
  for (const k of ["lang", "ready", "make", "length"]) {
    const v = cleanAnswer(k, input.answers?.[k]);
    if (v !== undefined) a[k] = v;
  }
  if (a.ready !== "yes") return { error: "Please come back when your story is written." };

  const db = adminClient();
  // An open draft already? Continue it rather than start another.
  const { data: existing } = await db
    .from("creator_requests")
    .select("id")
    .eq("user_id", user.id)
    .in("state", EDITABLE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [open, today] = await Promise.all([
    db.from("creator_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("state", OPEN_STATES),
    db.from("creator_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", dayAgo),
  ]);
  if ((open.count ?? 0) >= LIMITS.open) return { error: `You already have ${LIMITS.open} requests open. Withdraw one, or wait for our reply.` };
  if ((today.count ?? 0) >= LIMITS.perDay) return { error: `You can start ${LIMITS.perDay} requests a day. Please try again tomorrow.` };

  const lang = uiLang(a);
  const { data: row, error } = await db
    .from("creator_requests")
    .insert({
      user_id: user.id,
      email: user.email,
      state: "draft",
      current_step: "you",
      language: lang,
      make: String(a.make ?? "unsure"),
      length: String(a.length ?? "pages_2_5"),
      answers: a,
    })
    .select("id")
    .single();
  if (error || !row) return { error: "Something went wrong on our side. Please try again." };
  await db.from("creator_consents").insert({ user_id: user.id, request_id: row.id, kind: "age_18", terms_version: TERMS_VERSION, language: lang });
  revalidatePath("/creators/start");
  return { id: row.id };
}

// ---------------------------------------------------------------- choices

export type SaveResult = { ok: boolean; answers?: Answers; stopped?: "end" | "needs_human"; error?: string };

export async function saveAnswers(id: string, patch: Record<string, unknown>, step: string): Promise<SaveResult> {
  const r = await own(id);
  if (!r) return { ok: false, error: "This request can’t be changed any more." };
  const a: Answers = { ...r.answers };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "look_style" || k === "look_colour") continue;
    if (!CHOICE_IDS.includes(k) && k !== "level" && k !== "length_check") continue;
    const clean = cleanAnswer(k, v);
    if (clean === undefined) delete a[k];
    else a[k] = clean;
    // A level pre-fills the configurator (brief §3A).
    if (k === "level" && typeof clean === "string" && r.answers.level !== clean) Object.assign(a, LEVEL_PRESETS[clean]);
  }
  if ("look_style" in patch || "look_colour" in patch) {
    const l = cleanLook(patch.look_style, patch.look_colour);
    if (l.look_style) a.look_style = l.look_style;
    else delete a.look_style;
    if (l.look_colour) a.look_colour = l.look_colour;
    else delete a.look_colour;
  }
  // Premium is always Varta Vishva Directors; "assisted" is the old name of that service.
  if (a.level === "premium" || a.service === "assisted") a.service = "directed";

  // A change after the plan was written makes the plan and quote stale: the next visit to
  // the plan step writes a new one.
  const cols: Record<string, unknown> = { answers: a, current_step: BY_ID[step] ? step : null, ...stale(r) };
  if (typeof a.make === "string") cols.make = a.make;
  if (a.big_screen === "yes") Object.assign(cols, { big_screen: "yes", music_replacement: true });
  await update(id, cols);

  // A stop ends the flow here (questions.ts).
  for (const k of Object.keys(patch)) {
    const stop = BY_ID[k]?.stop?.(a);
    if (!stop) continue;
    if (stop.kind === "needs_human") {
      await toHuman({ ...r, answers: a }, "big_screen", [
        "MUSIC REPLACEMENT: the writer will show this at a film festival, on TV or in a cinema (question 2.1c).",
        "The flow stopped here: no questions, no plan and no sample until you decide.",
        "Quote the music replacement add-on, then let them continue from the request page.",
      ]);
      return { ok: true, answers: a, stopped: "needs_human" };
    }
    await update(id, { state: "withdrawn", files_delete_at: now() });
    revalidatePath("/creators/start");
    return { ok: true, answers: a, stopped: "end" };
  }
  return { ok: true, answers: a };
}

// ---------------------------------------------------------------- free text (→ R2 through the firewall)

export async function saveText(id: string, qid: string, text: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const r = await own(id);
  if (!r) return { ok: false, error: "This request can’t be changed any more." };
  if (!TEXT_IDS.includes(qid)) return { ok: false };
  const q = BY_ID[qid];
  const c = cleanText(text, q.maxLength ?? 1000);
  const d = await readDraft(id);
  if (c.text) d.text[qid] = c.text;
  else delete d.text[qid];
  d.flagged ||= c.flagged;
  await saveDraft(id, d);
  await update(id, { current_step: qid, ...stale(r) });
  return { ok: true, text: c.text };
}

export async function saveYou(id: string, name: string, whatsapp: string): Promise<{ ok: boolean; error?: string }> {
  const r = await own(id);
  if (!r) return { ok: false, error: "This request can’t be changed any more." };
  const n = cleanText(name, 200).text;
  if (!n) return { ok: false, error: "Please tell us your name." };
  const w = whatsapp.replace(/[^\d+ ]/g, "").slice(0, 20);
  await update(id, { name: n, whatsapp: w || null, current_step: "story" });
  const d = await readDraft(id);
  d.text.credit_name = n;
  await saveDraft(id, d);
  return { ok: true };
}

// ---------------------------------------------------------------- the story (1.1)

export type StoryResult = { ok: boolean; chars?: number; lang?: string; error?: string };

const UPLOAD_ERRORS: Record<string, string> = {
  type: "Please upload a Word (.docx), text (.txt) or PDF file.",
  size: "That file is over 4 MB. Please paste the text instead.",
  empty: "We couldn’t find any text in that file.",
  broken_pdf: "The text in this PDF comes out broken (common with Gujarati and Hindi fonts). Please upload a Word or text file, or paste the text.",
  failed: "We couldn’t read that file. Please upload a Word or text file, or paste the text.",
};

export async function submitStory(id: string, form: FormData): Promise<StoryResult> {
  const r = await own(id, ["draft"]);
  if (!r) return { ok: false, error: "This request can’t be changed any more." };
  if (r.screening_result) return { ok: false, error: "Your story has already been read. To use a different story, start a new request." };

  let raw = String(form.get("story") ?? "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const got = await extractText(file);
    if ("error" in got) return { ok: false, error: UPLOAD_ERRORS[got.error] };
    raw = got.text;
  }
  const { text, flagged } = cleanStory(raw);
  const title = cleanText(form.get("title"), 200);
  const author = cleanText(form.get("author"), 200);
  if (!title.text) return { ok: false, error: "Please give the story’s title." };
  if (!author.text) return { ok: false, error: "Please give the author’s name." };
  if (text.length < STORY_MIN) return { ok: false, error: "Please add at least a few paragraphs of the story." };
  if (text.length > STORY_MAX) {
    return { ok: false, error: `Stories up to ${STORY_MAX.toLocaleString("en-IN")} characters can be made here. For a longer work, choose Varta Vishva Directors and write to us.` };
  }
  const detected = detectLanguage(text);
  const override = String(form.get("story_lang") ?? "");
  const lang = ["gu", "hi", "en"].includes(override) ? override : detected;
  try {
    await saveStory(id, text);
  } catch (e) {
    console.error("creators: story not stored for", id, e instanceof Error ? e.message : e);
    return { ok: false, error: "We couldn’t save the story just now. Please try again." };
  }
  {
    // Title and author: separate fields (owner's decision, 25 Nov 2026), read as the sample's opening.
    const d = await readDraft(id);
    d.text.title = title.text;
    d.text.author = author.text;
    d.flagged ||= flagged || title.flagged || author.flagged;
    await saveDraft(id, d);
  }
  await update(id, {
    story_key: `creators/${id}/story.txt`,
    story_sha256: sha256(text),
    story_chars: text.length,
    language: lang,
    length: text.length <= 3000 ? "short" : text.length <= 20000 ? "medium" : "long",
    current_step: "origin",
  });
  return { ok: true, chars: text.length, lang };
}

export async function setStoryLanguage(id: string, lang: string) {
  const r = await own(id, ["draft"]);
  if (!r || !["gu", "hi", "en"].includes(lang) || r.screening_result) return { ok: false };
  await update(id, { language: lang });
  return { ok: true };
}

// ---------------------------------------------------------------- consent + screening (1.3)

export type ScreenResult = {
  status: "clear" | "fix" | "needs_human" | "refused" | "error";
  message?: string;
  draft?: ClientDraft;
  fix?: { suggestions: { where: string; change: string }[]; story: string; left: number };
};

const SCREEN_TICKS = ["terms_refund", "rights_origin", "data_processing"] as const;

export async function consentAndScreen(id: string, form: FormData): Promise<ScreenResult> {
  const r = await own(id, ["draft"]);
  if (!r) return { status: "error", message: "This request can’t be changed any more." };
  if (r.screening_result === "clear") return { status: "clear", draft: await clientDraft(id) };
  if (r.screening_result) {
    // Already screened with a problem: show the fix-it page again (no new check).
    const d0 = await readDraft(id);
    const { data: cur } = await adminClient().from("creator_requests").select("rechecks").eq("id", id).single();
    if (d0.fix) {
      return { status: "fix", message: d0.fix.reason, fix: { suggestions: d0.fix.suggestions, story: await readStory(id), left: MAX_RECHECKS - (cur?.rechecks ?? 0) } };
    }
  }
  if (!r.story_key) return { status: "error", message: "Please add your story first." };
  if (!r.answers.origin) return { status: "error", message: "Please say where the story comes from." };
  const str = (k: string) => String(form.get(k) ?? "").trim();
  if (str("terms_version") !== TERMS_VERSION) return { status: "error", message: "Our terms have just been updated. Please reload the page and tick the boxes again." };
  if (!SCREEN_TICKS.every((k) => str(`consent_${k}`) === "yes")) return { status: "error", message: "Please tick all three boxes to continue." };
  if (!claudeReady()) return { status: "error", message: "Requests are paused for a short while. Please try again later." };
  if (!(await passesTurnstile(str("cf-turnstile-response"), "creator"))) return { status: "error", message: "The spam check didn’t go through. Please try again." };

  const db = adminClient();
  const lang: ConsentLang = str("consent_lang") in CONSENT_LANGS ? (str("consent_lang") as ConsentLang) : uiLang(r.answers);
  // No story goes to any AI provider until the consents are on record.
  const consents = await db.from("creator_consents").insert(
    SCREEN_TICKS.map((kind) => ({ user_id: r.user_id, request_id: id, kind, terms_version: TERMS_VERSION, language: lang, accepted_at: now() })),
  );
  if (consents.error) return { status: "error", message: "Something went wrong on our side. Please try again." };

  const [story, d, prices, settings] = await Promise.all([readStory(id), readDraft(id), claudePrices(), flowSettings()]);
  const origin = [
    BY_ID.origin.options?.find((o) => o.id === r.answers.origin)?.label.en ?? "",
    d.text.original_work ? `Original work: ${d.text.original_work}` : "",
    d.text.tradition ? `Tradition: ${d.text.tradition}` : "",
    r.answers.permission ? `Permission: ${r.answers.permission}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return screenAndRoute({ ...r, story, d, prices, settings, origin });
}

const MAX_RECHECKS = RULES.rechecks;

// The writer's words when a story can't be made (Gujarati and Hindi: drafts for the admin to check).
const FRESH_IDEA: Record<ConsentLang, string> = {
  en: "We’re sorry: we can’t make this story as it is. You’re very welcome to come back with a fresh idea or a different story; we’d love to hear it. If you’d like to talk it over, reply to our email.",
  gu: "માફ કરશો: આ વાર્તા જેમ છે તેમ અમે બનાવી શકતા નથી. નવા વિચાર કે બીજી વાર્તા સાથે ફરી આવજો; અમને સાંભળવું ગમશે. વાત કરવી હોય તો અમારા ઇમેલનો જવાબ આપજો.",
  hi: "क्षमा करें: यह कहानी जैसी है वैसी हम नहीं बना सकते। नए विचार या दूसरी कहानी के साथ फिर आइए; हमें सुनना अच्छा लगेगा। बात करनी हो तो हमारे ईमेल का जवाब दें।",
};

type ScreenInput = Row & {
  story: string;
  d: Draft;
  prices: Awaited<ReturnType<typeof claudePrices>>;
  settings: Awaited<ReturnType<typeof flowSettings>>;
  origin: string;
};

// Screening and what follows it (owner's decision, 25 Nov 2026):
//   clear                          → continue (characters and setting are listed once)
//   a problem the writer can fix   → a gentle page with suggestions that genuinely remove it;
//                                    the writer edits and re-checks, at most 3 times
//   anything else, or 3 re-checks  → the polite "come back with a fresh idea" page
//   unsure, with nothing to fix    → a person at the studio reads it
async function screenAndRoute(x: ScreenInput): Promise<ScreenResult> {
  const { id, story, d, prices, settings } = x;
  const lang = uiLang(x.answers);
  const m = meterFor("screening", prices);
  let screening;
  try {
    await update(id, { state: "screening" });
    screening = await screenStory(story, "", m.meter, x.origin);
  } catch (e) {
    console.error("creators screening failed:", e instanceof Error ? e.message : e);
    await update(id, { state: "draft" });
    return { status: "error", message: "We couldn’t read the story just now. Please try again in a little while." };
  }
  let log = await m.save(id, x.claude_cost);
  await update(id, {
    state: "draft",
    screening_result: screening.result,
    screening_categories: screening.categories,
    screening_reason: screening.reason || null,
  });

  const refuse = async (): Promise<ScreenResult> => {
    await update(id, { state: "refused", files_delete_at: now() });
    revalidatePath("/creators/start");
    return { status: "refused", message: FRESH_IDEA[lang] };
  };

  if (screening.result !== "clear") {
    const fixable = screening.categories.length > 0 && screening.categories.every((c) => FIXABLE.has(c));
    if (!fixable) {
      // Never offered a fix: refused outright, or unsure with nothing the writer could change.
      if (screening.result === "refused" || screening.categories.length > 0) return refuse();
      await update(id, { state: "needs_human", needs_human_why: "screening" });
      await mailStudio({
        subject: `Creator's Space: request from ${x.name} needs your eye`,
        lines: [
          `${x.name} <${x.email}> sent a story that the automatic check could not settle.`,
          `Check: ${screening.categories.join(", ") || "no answer from the checker"}${screening.reason ? ` — ${screening.reason}` : ""}`,
          "",
          `Read the story: ${adminLink(id)}`,
          "",
          "Let them continue, close or refuse it on the request page.",
        ],
        replyTo: x.email,
      });
      revalidatePath("/creators/start");
      return {
        status: "needs_human",
        message: "Thank you. Before we go further, a person at the studio will read your story. We’ll write to you by email, usually within two working days.",
      };
    }
    const { data: cur } = await adminClient().from("creator_requests").select("rechecks").eq("id", id).single();
    if ((cur?.rechecks ?? 0) >= MAX_RECHECKS) return refuse();

    const m2 = meterFor("fix_suggestions", prices);
    let suggestions = null;
    try {
      suggestions = await fixSuggestions(story, screening.categories, screening.reason, lang, m2.meter);
    } catch (e) {
      console.error("creators fix suggestions failed:", e instanceof Error ? e.message : e);
    }
    log = await m2.save(id, log);
    if (!suggestions?.length) return refuse();
    const first = !d.fix;
    d.fix = { reason: screening.reason, suggestions };
    await saveDraft(id, d);
    await update(id, { current_step: "consent" });
    if (first) {
      await sendEmail({
        to: x.email,
        subject: lang === "gu" ? "તમારી વાર્તામાં નાનો ફેરફાર જરૂરી છે · A small change is needed" : "Creator's Space: a small change is needed in your story",
        text: [
          `Dear ${x.name || "writer"},`,
          "",
          "Before we can make your story, one part of it needs a small change. Our suggestions are waiting for you, with the story ready to edit:",
          "https://jambuch.in/creators/start",
          "",
          ...STUDIO_SIGNATURE,
        ].join("\n"),
        replyTo: studioReplyTo(),
      from: STUDIO_FROM,
      });
    }
    return { status: "fix", message: screening.reason, fix: { suggestions, story, left: MAX_RECHECKS - (cur?.rechecks ?? 0) } };
  }

  // Clear: list the characters and the setting once (cheap model), to prefill stages 5–6.
  if (d.fix) delete d.fix;
  if (!overCap(log, settings) && !d.characters_found) {
    const m3 = meterFor("story_facts", prices);
    try {
      const facts = await storyFacts(story, lang, 8, m3.meter);
      if (facts) {
        d.characters = facts.characters.map((c) => ({
          name: c.name,
          role: c.role,
          age: c.age,
          look: c.look,
          voice: "",
          real_person: c.real_person ? "historical" : "no",
          sacred: c.sacred ? "show_face" : "",
        }));
        d.setting_suggested = facts.setting;
        if (!d.text.setting && facts.setting) d.text.setting = cleanText(facts.setting, 300).text;
      }
    } catch (e) {
      console.error("creators story facts failed:", e instanceof Error ? e.message : e);
    }
    d.characters_found = true;
    await m3.save(id, log);
  }
  await saveDraft(id, d);
  await update(id, { current_step: "purpose" });
  return { status: "clear", draft: await clientDraft(id) };
}

// The writer changed their story after our suggestions: check it again (consents are
// already on record). At most 3 re-checks.
export async function recheckStory(id: string, text: string): Promise<ScreenResult> {
  const r = await own(id, ["draft"]);
  if (!r) return { status: "error", message: "This request can’t be changed any more." };
  if (r.screening_result === "clear") return { status: "clear", draft: await clientDraft(id) };
  const { data: cur } = await adminClient().from("creator_requests").select("rechecks").eq("id", id).single();
  if ((cur?.rechecks ?? 0) >= MAX_RECHECKS) {
    await update(id, { state: "refused", files_delete_at: now() });
    return { status: "refused", message: FRESH_IDEA[uiLang(r.answers)] };
  }
  const { text: story, flagged } = cleanStory(text);
  if (story.length < STORY_MIN) return { status: "error", message: "Please keep at least a few paragraphs of the story." };
  if (story.length > STORY_MAX) return { status: "error", message: "The story is too long." };
  if (!claudeReady()) return { status: "error", message: "Requests are paused for a short while. Please try again later." };
  await saveStory(id, story);
  await update(id, { story_sha256: sha256(story), story_chars: story.length, rechecks: (cur?.rechecks ?? 0) + 1 });
  const [d, prices, settings] = await Promise.all([readDraft(id), claudePrices(), flowSettings()]);
  if (flagged) d.flagged = true;
  if (overCap(r.claude_cost, settings)) {
    await toHuman(r, "claude_cap", [`The draft reached the Claude budget of US$${settings.claude_cap_usd} during the fix-it re-checks.`]);
    return { status: "needs_human", message: "Thank you. A person at the studio will read your story and write to you." };
  }
  const origin = BY_ID.origin.options?.find((o) => o.id === r.answers.origin)?.label.en ?? "";
  return screenAndRoute({ ...r, story_chars: story.length, story, d, prices, settings, origin });
}


// ---------------------------------------------------------------- stage 3: prices per level

export async function levelPrices(id: string): Promise<{ prices: Record<string, number>; directedFrom: string | null } | null> {
  const r = await own(id);
  if (!r) return null;
  const [s, cp, d] = await Promise.all([pricingSettings(), claudePrices(), readDraft(id)]);
  const out: Record<string, number> = {};
  for (const level of ["basic", "standard", "premium"]) {
    const a: Answers = { ...r.answers, ...LEVEL_PRESETS[level], level };
    const n = Math.min(d.characters.length || 2, LEVEL_LIMITS[level].characters);
    out[level] = priceOne(inputFrom(a, r.story_chars || 8000, r.language, a.voices === "characters" ? n : 0), s, cp).price;
  }
  return { prices: out, directedFrom: await directedStart() };
}

// ---------------------------------------------------------------- stage 5: look suggestions

export async function suggestLooksAction(id: string): Promise<{ looks?: Draft["looks"]; error?: string }> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const [d, prices, settings] = await Promise.all([readDraft(id), claudePrices(), flowSettings()]);
  if (d.looks.length) return { looks: d.looks };
  if (overCap(r.claude_cost, settings)) return { error: "Please choose yourself: our suggestions are not available for this request." };
  const story = await readStory(id);
  const m = meterFor("look_suggestions", prices);
  try {
    const looks = await suggestLooks(story, choicesText(r.answers, ctxOf(r, d)), uiLang(r.answers), m.meter);
    await m.save(id, r.claude_cost);
    if (!looks) return { error: "We couldn’t make suggestions just now. Please choose yourself." };
    d.looks = looks;
    await saveDraft(id, d);
    return { looks };
  } catch (e) {
    console.error("creators looks failed:", e instanceof Error ? e.message : e);
    await m.save(id, r.claude_cost);
    return { error: "We couldn’t make suggestions just now. Please choose yourself." };
  }
}

// ---------------------------------------------------------------- stage 6: characters, pictures, episodes

const REAL = ["no", "alive_permission", "alive_no_permission", "historical"] as const;
const SACRED = ["", "show_face", "symbols_only"] as const;

export async function saveCharacters(id: string, list: Character[]): Promise<{ ok: boolean; characters?: Character[] }> {
  const r = await own(id);
  if (!r || !Array.isArray(list)) return { ok: false };
  const d = await readDraft(id);
  let flagged = false;
  d.characters = list.slice(0, 8).flatMap((c) => {
    const name = cleanText(c?.name, 80);
    if (!name.text) return [];
    const look = cleanText(c?.look, 200);
    flagged ||= name.flagged || look.flagged;
    return [
      {
        name: name.text,
        role: c.role === "main" ? "main" : "minor",
        age: cleanText(c.age, 40).text,
        look: look.text,
        voice: (VOICE_TYPES as readonly string[]).includes(c.voice) ? c.voice : "",
        real_person: (REAL as readonly string[]).includes(c.real_person) ? c.real_person : "no",
        sacred: (SACRED as readonly string[]).includes(c.sacred) ? c.sacred : "",
      } satisfies Character,
    ];
  });
  d.flagged ||= flagged;
  await saveDraft(id, d);
  await update(id, { current_step: "characters", ...stale(r) });
  return { ok: true, characters: d.characters };
}

const PICTURE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadPicture(id: string, form: FormData): Promise<{ pictures?: { key: string; url: string }[]; error?: string }> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  if (String(form.get("own") ?? "") !== "yes") return { error: "Please tick the box to confirm these are your own pictures." };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Please choose a picture." };
  const ext = PICTURE_TYPES[file.type];
  if (!ext) return { error: "Please upload a JPG, PNG or WebP picture." };
  if (file.size > 5 * 1024 * 1024) return { error: "Please keep each picture under 5 MB." };
  const d = await readDraft(id);
  if (d.pictures.length >= 5) return { error: "Up to 5 pictures." };
  const n = d.pictures.reduce((mx, k) => Math.max(mx, Number(k.match(/ref\/(\d+)\./)?.[1] ?? 0)), 0) + 1;
  const key = pictureKey(id, n, ext);
  await uploadPrivate(key, await file.arrayBuffer(), file.type);
  d.pictures.push(key);
  await saveDraft(id, d);
  return { pictures: await pictureLinks(d.pictures) };
}

export async function removePicture(id: string, key: string) {
  const r = await own(id);
  if (!r) return { pictures: [] };
  const d = await readDraft(id);
  if (!d.pictures.includes(key)) return { pictures: await pictureLinks(d.pictures) };
  await deleteKey(key).catch(() => {});
  d.pictures = d.pictures.filter((k) => k !== key);
  await saveDraft(id, d);
  return { pictures: await pictureLinks(d.pictures) };
}

async function pictureLinks(keys: string[]) {
  return Promise.all(keys.map(async (key) => ({ key, url: (await signedPrivateUrl({ url: `r2-private:${key}`, bucket: "private", key }, 900)) ?? "" })));
}

// Paragraph starts (character offsets) of the story.
function paragraphStarts(story: string) {
  const starts = [0];
  const re = /\n\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(story))) starts.push(m.index + m[0].length);
  return starts;
}

// Split at paragraph breaks into parts of at most ~20,000 characters, as even as possible.
function splitPoints(story: string) {
  const starts = paragraphStarts(story);
  const parts = Math.ceil(story.length / EPISODE_CHARS);
  const out = [0];
  for (let i = 1; i < parts; i++) {
    const target = (story.length / parts) * i;
    const best = starts.reduce((b, s) => (Math.abs(s - target) < Math.abs(b - target) && s > out[out.length - 1] ? s : b), starts[starts.length - 1]);
    if (best > out[out.length - 1]) out.push(best);
  }
  return out;
}

export async function proposeEpisodes(id: string): Promise<{ episodes?: Draft["episodes"]; error?: string }> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const [story, d, prices] = await Promise.all([readStory(id), readDraft(id), claudePrices()]);
  if (d.episodes.length) return { episodes: d.episodes };
  const starts = splitPoints(story);
  const m = meterFor("episode_titles", prices);
  let titles: string[] | null = null;
  try {
    titles = await episodeTitles(
      starts.map((s, i) => story.slice(s, starts[i + 1] ?? story.length)),
      uiLang(r.answers),
      m.meter,
    );
  } catch (e) {
    console.error("creators episode titles failed:", e instanceof Error ? e.message : e);
  }
  await m.save(id, r.claude_cost);
  d.episodes = starts.map((start, i) => ({ start, title: titles?.[i] ?? `${i + 1}` }));
  await saveDraft(id, d);
  return { episodes: d.episodes };
}

// Move one split point a paragraph earlier or later (the first episode always starts at 0).
export async function moveEpisode(id: string, index: number, dir: -1 | 1): Promise<{ episodes?: Draft["episodes"]; error?: string }> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const [story, d] = await Promise.all([readStory(id), readDraft(id)]);
  if (index < 1 || index >= d.episodes.length) return { episodes: d.episodes };
  const starts = paragraphStarts(story);
  const cur = d.episodes[index].start;
  const pos = starts.findIndex((s) => s >= cur);
  const next = starts[pos + dir];
  const prev = d.episodes[index - 1].start;
  const after = d.episodes[index + 1]?.start ?? story.length;
  if (next === undefined || next <= prev || next >= after) return { episodes: d.episodes };
  // No part may grow past 25,000 characters (an episode is meant to be ~20,000).
  if (next - prev > 25_000 || after - next > 25_000) return { episodes: d.episodes, error: "That would make one episode too long." };
  d.episodes[index] = { ...d.episodes[index], start: next };
  await saveDraft(id, d);
  return { episodes: d.episodes };
}

export async function episodeOpenings(id: string): Promise<string[]> {
  const r = await own(id);
  if (!r) return [];
  const [story, d] = await Promise.all([readStory(id), readDraft(id)]);
  return d.episodes.map((e) => story.slice(e.start, e.start + 140).replace(/\s+/g, " ").trim());
}

// ---------------------------------------------------------------- stage 7: follow-up questions

export type FollowUpsResult = { rounds?: Draft["followups"]; done?: boolean; pronunciation?: Draft["pronunciation"]; error?: string; stopped?: boolean };

export async function nextFollowUps(id: string, answers?: Record<string, string>): Promise<FollowUpsResult> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const [d, prices, settings] = await Promise.all([readDraft(id), claudePrices(), flowSettings()]);

  // Save the answers to the current round (options, "__decide", or the writer's own words).
  const cur = d.followups[d.followups.length - 1];
  if (cur && answers) {
    for (const q of cur.questions) {
      const v = answers[q.id];
      if (typeof v !== "string") continue;
      const c = v === "__decide" || q.options.includes(v) ? { text: v, flagged: false } : cleanText(v, 300);
      if (c.text) cur.answers[q.id] = c.text;
      d.flagged ||= c.flagged;
    }
  }
  const lastAsked = !!cur && cur.questions.length > 0;
  const rounds = d.followups.length;
  if (d.followups_done || rounds >= settings.max_followup_rounds || (rounds > 0 && !lastAsked)) {
    d.followups_done = true;
    await saveDraft(id, d);
    await update(id, { state: "questions", current_step: "followups" });
    return { rounds: d.followups, done: true, pronunciation: d.pronunciation };
  }
  if (overCap(r.claude_cost, settings)) {
    await toHuman(r, "claude_cap", [`The draft reached the Claude budget of US$${settings.claude_cap_usd} before the follow-up questions.`]);
    return { stopped: true, error: "Thank you. A person at the studio will look at your request and write to you." };
  }

  const story = await readStory(id);
  const { notes } = cleanNotes(d.text);
  const level = String(r.answers.level ?? "standard");
  const m = meterFor(`followups_${rounds + 1}`, prices);
  let got = null;
  try {
    got = await followUpRound({
      story,
      choices: choicesText(r.answers, ctxOf(r, d)) + (d.characters.length ? `\nCharacters:\n${charactersText(d.characters)}` : ""),
      notes: notesText({ ...d, text: notes }),
      previous: d.followups.flatMap((rd) => rd.questions.map((q) => ({ question: q.question, answer: rd.answers[q.id] === "__decide" ? "You decide" : rd.answers[q.id] ?? "" }))),
      lang: uiLang(r.answers),
      round: rounds + 1,
      limits: `${level} level: about ${level === "premium" ? "1 picture per 28 seconds" : level === "standard" ? "1 picture per 50 seconds" : "1 picture or none"}; up to ${LEVEL_LIMITS[level]?.characters ?? 3} character voices`,
      meter: m.meter,
    });
  } catch (e) {
    console.error("creators follow-ups failed:", e instanceof Error ? e.message : e);
  }
  await m.save(id, r.claude_cost);
  if (!got) {
    // No questions is a fine outcome; a failed call just moves on to the plan.
    d.followups_done = true;
    await saveDraft(id, d);
    return { rounds: d.followups, done: true, pronunciation: d.pronunciation };
  }
  d.followups.push({ questions: got.questions.map((q, i) => ({ id: `r${rounds + 1}q${i + 1}`, ...q })), answers: {} });
  if (!d.pronunciation.length) d.pronunciation = got.pronunciation;
  if (!got.questions.length) d.followups_done = true;
  await saveDraft(id, d);
  await update(id, { state: "questions", current_step: "followups" });
  return { rounds: d.followups, done: d.followups_done, pronunciation: d.pronunciation };
}

export async function savePronunciation(id: string, list: { word: string; say_as: string }[]) {
  const r = await own(id);
  if (!r || !Array.isArray(list)) return { ok: false };
  const d = await readDraft(id);
  const known = new Set(d.pronunciation.map((p) => p.word));
  d.pronunciation = list
    .filter((p) => known.has(p.word))
    .slice(0, 15)
    .map((p) => ({ word: p.word, say_as: cleanText(p.say_as, 80).text }));
  await saveDraft(id, d);
  return { ok: true };
}

// ---------------------------------------------------------------- stage 8: plan and quote

export type PlanResult = {
  plan?: string;
  version?: number;
  roundsLeft?: number;
  quote?: { total: number; sample: number; advance: number; final: number; episodes: number; minutes: number; days: number; directed: boolean };
  error?: string;
  stopped?: boolean;
};

// Delivery days come from the flow settings (delivery_days), the same numbers the FAQ shows.
function quoteSummary(q: Quote, level: string, days: FlowSettings["delivery_days"]) {
  const lv = (["basic", "standard", "premium"].includes(level) ? level : "standard") as "basic" | "standard" | "premium";
  const minutes = q.episodes.reduce((a, e) => a + e.breakdown.minutes, 0);
  return {
    total: q.total,
    sample: q.sample ?? 0,
    advance: q.advance,
    final: q.final,
    episodes: q.episodes.length,
    minutes: Math.round(minutes),
    // Worst case: the level's days, plus 3 per extra episode (5 when directed).
    days:
      q.input.service === "directed"
        ? days.directed[lv] + days.extra_episode.directed * (q.episodes.length - 1)
        : days.studio[lv] + days.extra_episode.studio * (q.episodes.length - 1),
    directed: q.input.service === "directed",
  };
}

export async function makePlanAction(id: string, change?: string): Promise<PlanResult> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const [d, prices, settings] = await Promise.all([readDraft(id), claudePrices(), flowSettings()]);
  const level = String(r.answers.level ?? "standard");

  // Already made and no change asked: show it again.
  if (!change && r.plan_version > 0 && r.quote) {
    return {
      plan: (await readPlan(id, r.plan_version)) ?? "",
      version: r.plan_version,
      roundsLeft: Math.max(0, settings.max_plan_rounds - r.plan_rounds),
      quote: quoteSummary(r.quote, level, (await flowSettings()).delivery_days),
    };
  }
  if (change && r.plan_rounds >= settings.max_plan_rounds) return { error: "No more changes here. Choose “Let’s discuss” and we’ll talk it through." };
  if (overCap(r.claude_cost, settings)) {
    await toHuman(r, "claude_cap", [`The draft reached the Claude budget of US$${settings.claude_cap_usd} before the plan.`]);
    return { stopped: true, error: "Thank you. A person at the studio will finish your plan and write to you." };
  }

  const story = await readStory(id);
  const q = await makeQuote(r.answers, d, r.story_chars, r.language);
  const { notes } = cleanNotes(d.text);
  const changeText = change ? cleanText(change, 800) : null;
  if (changeText?.flagged) d.flagged = true;
  const facts = [
    `About ${Math.round(q.episodes.reduce((a, e) => a + e.breakdown.minutes, 0))} minutes of narration`,
    `${q.episodes.reduce((a, e) => a + e.breakdown.stills, 0)} pictures in all (including cover, character sheets and thumbnail)`,
    `${q.episodes.length} part(s)`,
    `Level: ${level}; ${LEVEL_LIMITS[level]?.characters ?? 3} character voices at most`,
    d.episodes.length > 1 ? `Episodes: ${d.episodes.map((e, i) => `${i + 1}. ${e.title}`).join("; ")}` : "",
    d.pronunciation.length ? `Pronunciation list: ${d.pronunciation.map((p) => `${p.word}${p.say_as ? ` (${p.say_as})` : ""}`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const m = meterFor(`plan_${r.plan_version + 1}`, prices);
  let plan: string | null = null;
  try {
    plan = await writePlan({
      story,
      choices: choicesText(r.answers, ctxOf(r, d)),
      notes: notesText({ ...d, text: notes }),
      characters: charactersText(d.characters),
      followups: followupsText(d),
      facts,
      lang: uiLang(r.answers),
      change: changeText?.text,
      previousPlan: change ? ((await readPlan(id, r.plan_version)) ?? undefined) : undefined,
      meter: m.meter,
    });
  } catch (e) {
    console.error("creators plan failed:", e instanceof Error ? e.message : e);
  }
  const log = await m.save(id, r.claude_cost);
  if (!plan) return { error: "We couldn’t write your plan just now. Please try again in a minute." };

  // Style tags: choices + the writer's free words about sound and things to avoid (→ tags only).
  let tags = choiceTags(r.answers, d);
  const styleWords = [
    notes.sound_note ? { topic: "music", question: "Anything else about music and sound?", answer: notes.sound_note } : null,
    notes.avoid_note ? { topic: "avoid", question: "Anything else to avoid?", answer: notes.avoid_note } : null,
  ].filter((x): x is { topic: string; question: string; answer: string } => !!x);
  if (styleWords.length) {
    const m2 = meterFor("style_tags", prices);
    try {
      tags = [...new Set([...tags, ...(await styleTags(styleWords, m2.meter))])];
    } catch (e) {
      console.error("creators style tags failed:", e instanceof Error ? e.message : e);
    }
    await m2.save(id, log);
  }

  const version = r.plan_version + 1;
  await savePlan(id, version, plan);
  await saveDraft(id, d);
  await update(id, {
    state: "plan",
    current_step: "plan",
    quote: q,
    plan_version: version,
    plan_rounds: r.plan_rounds + (change ? 1 : 0),
    style_tags: tags,
  });
  return { plan, version, roundsLeft: Math.max(0, settings.max_plan_rounds - r.plan_rounds - (change ? 1 : 0)), quote: quoteSummary(q, level, settings.delivery_days) };
}

export async function discussPlan(id: string): Promise<{ ok: boolean }> {
  const r = await own(id, ["plan"]);
  if (!r) return { ok: false };
  await toHuman(r, "plan_discuss", ["The writer used all plan changes and asked to discuss the plan.", `Plan version ${r.plan_version}.`]);
  return { ok: true };
}

// Approve plan → the baseline (brief §6E) → 'sample_due': the writer pays the sample fee, then
// the sample is made, checked and sent automatically (owner's decision, 25 Nov 2026). A
// Varta Vishva Directors order is approved only when a director has room this week (team.ts);
// its sample is made by the assigned director.
export async function approvePlan(id: string, form: FormData): Promise<{ ok: boolean; error?: string; pay?: { amount: number; online: boolean } }> {
  const r = await own(id, ["plan"]);
  if (!r) return { ok: false, error: "This request can’t be changed any more." };
  if (String(form.get("consent_plan_baseline") ?? "") !== "yes") return { ok: false, error: "Please tick the box to approve the plan." };
  if (String(form.get("version") ?? "") !== String(r.plan_version)) return { ok: false, error: "Your plan has changed. Please read the latest version and approve again." };
  const directed = isDirected(r.answers);
  if (directed) {
    const from = await directedStart();
    if (from) {
      const when = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      return { ok: false, error: `Our directors can start new stories from ${when}. Please approve your plan again then, or choose Studio-made.` };
    }
  }
  const lang = uiLang(r.answers);
  const db = adminClient();
  await db.from("creator_consents").insert({ user_id: r.user_id, request_id: id, kind: "plan_baseline", terms_version: TERMS_VERSION, language: lang });

  // What the studio and the sample pipeline read (brief.json), from the private draft.
  const d = await readDraft(id);
  const { notes } = cleanNotes(d.text);
  await saveBrief(id, {
    about: notes.anything_else ?? "",
    answers: [
      ...Object.entries(notes)
        .filter(([k]) => k !== "anything_else")
        .map(([k, v]) => ({ topic: k, question: BY_ID[k]?.label.en ?? k, answer: v })),
      ...d.followups.flatMap((rd) =>
        rd.questions.map((q) => ({ topic: q.topic, question: q.question, answer: rd.answers[q.id] === "__decide" ? "You decide" : rd.answers[q.id] ?? "" })),
      ),
    ],
  });

  await update(id, { state: "sample_due", plan_approved_at: now(), current_step: null });
  const q = r.quote;
  await mailStudio({
    subject: `Creator's Space: plan approved by ${r.name}${directed ? " (Varta Vishva Directors)" : ""}${d.flagged ? " [firewall flag]" : ""}`,
    lines: [
      `${r.name} <${r.email}> approved plan version ${r.plan_version}.`,
      r.whatsapp ? `WhatsApp: ${r.whatsapp}` : "",
      `Level ${r.answers.level ?? "standard"} · ${r.story_chars.toLocaleString("en-IN")} characters · about ${Math.round(narrationMinutes(r.story_chars, r.language))} min`,
      q ? `Quote: ₹${q.total.toLocaleString("en-IN")} (sample ₹${q.sample}, advance ₹${q.advance.toLocaleString("en-IN")}, final ₹${q.final.toLocaleString("en-IN")}, ${q.episodes.length} part(s))` : "",
      d.flagged ? "The firewall flagged instruction-like text in this request: read it before making anything." : "",
      "",
      directed
        ? `Next: the writer pays the ₹${q?.sample ?? 999} sample fee; a director is assigned and calls the writer within 2 days, then makes the sample.`
        : `Next: the writer pays the ₹${q?.sample ?? 499} sample fee; the sample is then made, checked and sent automatically.`,
      `Request: ${adminLink(id)}`,
    ].filter(Boolean),
    replyTo: r.email,
  });
  revalidatePath("/creators/start");
  const online = (await flowSettings()).payments_enabled && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  return { ok: true, pay: { amount: q?.sample ?? 0, online } };
}

// ---------------------------------------------------------------- voice notes (principle 4)

// Speech to text through ElevenLabs (already a provider in the data tick). Off until
// The admin switches it on in the flow settings: each note costs credits. The recording is
// sent straight through and never stored.
export async function transcribe(id: string, form: FormData): Promise<{ text?: string; error?: string }> {
  const r = await own(id);
  if (!r) return { error: "This request can’t be changed any more." };
  const s = await flowSettings();
  if (!s.voice_notes) return { error: "Voice notes are not switched on yet. Please type instead." };
  const key = process.env.ELEVENLABS_API_KEY;
  const file = form.get("audio");
  if (!key || !(file instanceof File) || !file.size) return { error: "Please try recording again." };
  if (file.size > 10 * 1024 * 1024) return { error: "Please keep a voice note under 3 minutes." };
  const body = new FormData();
  body.append("model_id", "scribe_v1");
  body.append("file", file, "note.webm");
  const lang = uiLang(r.answers);
  body.append("language_code", lang === "gu" ? "guj" : lang === "hi" ? "hin" : "eng");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`speech-to-text ${res.status}`);
    const json = (await res.json()) as { text?: string };
    return { text: cleanText(json.text ?? "", 2000).text };
  } catch (e) {
    console.error("creators transcribe failed:", e instanceof Error ? e.message : e);
    return { error: "We couldn’t hear that note. Please try again, or type instead." };
  }
}

// ---------------------------------------------------------------- page data

export type ClientDraft = {
  text: Record<string, string>;
  characters: Character[];
  looks: Draft["looks"];
  followups: Draft["followups"];
  followups_done: boolean;
  pronunciation: Draft["pronunciation"];
  episodes: Draft["episodes"];
  pictures: { key: string; url: string }[];
};

export async function clientDraft(id: string): Promise<ClientDraft> {
  const d = await readDraft(id);
  return {
    text: d.text,
    characters: d.characters,
    looks: d.looks,
    followups: d.followups,
    followups_done: d.followups_done,
    pronunciation: d.pronunciation,
    episodes: d.episodes,
    pictures: await pictureLinks(d.pictures),
  };
}

// Start again: the open draft is withdrawn and its files deleted.
export async function abandonDraft(id: string) {
  const r = await own(id);
  if (!r) return { ok: false };
  await update(id, { state: "withdrawn", files_delete_at: now() });
  await deleteRequestFiles(id).catch(() => {});
  await update(id, { story_key: null, files_purged_at: now() });
  revalidatePath("/creators/start");
  return { ok: true };
}

// A writer returning to a story that needs a fix sees the suggestions again at once.
export async function pendingFix(id: string): Promise<ScreenResult | null> {
  const r = await own(id, ["draft"]);
  if (!r || !r.screening_result || r.screening_result === "clear") return null;
  const d = await readDraft(id);
  if (!d.fix) return null;
  const { data: cur } = await adminClient().from("creator_requests").select("rechecks").eq("id", id).single();
  return { status: "fix", message: d.fix.reason, fix: { suggestions: d.fix.suggestions, story: await readStory(id), left: MAX_RECHECKS - (cur?.rechecks ?? 0) } };
}
