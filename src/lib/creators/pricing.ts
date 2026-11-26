// Creator's Space pricing engine (docs/CREATORS_SPACE_BRIEF.md §5). Pure arithmetic: the
// rates come from the settings rows `creators.pricing` and `creators.claude_prices`
// (editable in admin). Everything we pay for in dollars (ElevenLabs credits, Claude, cloud
// render time, storage) is kept in dollars and converted with the day's USD→INR rate plus
// the card's forex markup (src/lib/fx.ts); never a fixed rupee rate (owner's decision, 25 Nov 2026).
// Only the studio's own prices (hourly rate, minimum, add-ons) are in rupees. The writer sees
// one fixed price; admin sees the breakdown and the rate it was made with.
//
//   tool_cost = narration + paintings (own retake factors) + (Claude + render + music
//               + effects + other) × retry buffer
//   overhead  = fixed monthly costs (Vercel, the Claude plan's share…) ÷ expected orders a month
//   price     = 2 × tool_cost + review (or director) hours × ₹/hour + add-ons + overhead
//             ÷ (1 − gateway fee), at least the minimum, rounded UP to ₹99
//   sample    = ₹499 (setting), paid after the plan is approved, counted toward the advance:
//   advance   = 50% − sample fee, final = the rest; sample + advance + final = price
//   (owner's decision, 25 Nov 2026: paid sample, deducted from the full price).
//   Varta Vishva Directors (26 Nov 2026): a director's hours instead of review hours (2.5 h
//   audio, 4 h video, 5 h Premium video, scaled by length), the director's extra retakes
//   (voice 1.5×, paintings 1.3× per still), and a ₹999 sample.

import type { Answers } from "./questions";
import { LEVEL_PRESETS } from "./questions";

type StepRate = { model: string; input_per_1k?: number; output_per_1k?: number; input_per_still?: number; output_per_still?: number; batch: boolean };

export type FixedCost = { name: string; amount: number; currency: "USD" | "INR"; per: "month" | "year"; share: number };

// The day's rate, filled in at run time (not a setting).
export type FxUsed = { rate: number; markup: number; effective: number; date: string; source: string };

export type PricingSettings = {
  credit_usd_per_1000: number; // ElevenLabs: plan price ÷ credits (Pro: $99 / 600,000 = $0.165)
  fx_markup: number; // the card's forex charge on dollar payments, e.g. 3.5% + 18% GST on it = 0.0413
  chars_per_minute: Record<string, number>;
  credits_per_char: { plain: number; dramatised: number };
  retake: { plain: number; dramatised: number };
  voice_factor_per_extra: number;
  credits_per_painting: number;
  paintings_per_still: number;
  seconds_per_still: { standard: number; premium: number };
  hero_shots_premium: number;
  credits_per_motion_clip: number;
  credits_per_effect: number;
  effects_per_minute: number;
  music_credits_per_minute: number;
  claude_steps: Record<string, StepRate>;
  batch_multiplier: number;
  render_usd_per_minute: number; // cloud running time per narration minute
  other_flat_usd: number; // storage and bandwidth for the 7-day window
  retry_buffer: number;
  review_hours: Record<string, { self_serve: number }>;
  // Varta Vishva Directors: hours per order (at review_minutes_base minutes of narration).
  directed_hours: { audio: number; video: number; premium_video: number };
  // A director polishes: more voice retakes and more paintings per still than the studio.
  directed_retake: { voice: number; paintings_per_still: number };
  directed_sample_fee_inr: number;
  review_minutes_base: number;
  hourly_inr: number;
  gateway_fee_rate: number;
  minimum_inr: number;
  round_to: number;
  addons_inr: { exclusive_voice: number; own_voice: number };
  sample_fee_inr: number; // one sample per order (a series has one sample), deducted from the price
  // Fixed running costs carried by Creator's Space, spread over the orders expected a month.
  // Costs already priced per order (ElevenLabs credits, Claude API tokens) do not belong here.
  fixed_costs: FixedCost[];
  expected_orders_per_month: number;
  fx: FxUsed; // run time only
};

// Same numbers as the migration 20261125000000_creator_flow.sql (used if a key is missing).
export const PRICING_DEFAULTS: Omit<PricingSettings, "fx"> = {
  credit_usd_per_1000: 0.165,
  fx_markup: 0.0413,
  chars_per_minute: { gu: 700, hi: 800, en: 850 },
  credits_per_char: { plain: 0.48, dramatised: 0.48 },
  retake: { plain: 1.2, dramatised: 1.25 },
  voice_factor_per_extra: 0.1,
  credits_per_painting: 920,
  paintings_per_still: 1.1,
  seconds_per_still: { standard: 50, premium: 28 },
  hero_shots_premium: 3,
  credits_per_motion_clip: 3000,
  credits_per_effect: 0,
  effects_per_minute: 2,
  music_credits_per_minute: 0,
  claude_steps: {
    script_prep: { model: "claude-opus-5-5", input_per_1k: 1500, output_per_1k: 1200, batch: false },
    directions: { model: "claude-opus-5-5", input_per_1k: 1500, output_per_1k: 1500, batch: false },
    shot_list: { model: "claude-opus-5-5", input_per_1k: 2000, output_per_1k: 800, batch: false },
    translation: { model: "claude-opus-5-5", input_per_1k: 1200, output_per_1k: 1500, batch: false },
    vision_check: { model: "claude-haiku-5-5", input_per_still: 3000, output_per_still: 300, batch: false },
  },
  batch_multiplier: 0.5,
  render_usd_per_minute: 0.06,
  other_flat_usd: 0.25,
  retry_buffer: 1.4,
  review_hours: {
    basic: { self_serve: 0.5 },
    standard: { self_serve: 1.5 },
    premium: { self_serve: 4 }, // Premium is always directed; kept for completeness
  },
  directed_hours: { audio: 2.5, video: 4, premium_video: 5 },
  directed_retake: { voice: 1.5, paintings_per_still: 1.3 },
  directed_sample_fee_inr: 999,
  review_minutes_base: 12,
  hourly_inr: 1000,
  gateway_fee_rate: 0.0236,
  minimum_inr: 999,
  round_to: 99,
  addons_inr: { exclusive_voice: 1500, own_voice: 500 },
  // Owner's decision, 25 Nov 2026: Vercel Pro (needed for paid service), half of the Claude Pro plan
  // (shared with his other projects); 5 orders a month to start. ElevenLabs is prepaid for a
  // year and already priced per credit, so it is not listed.
  fixed_costs: [
    { name: "Vercel Pro", amount: 20, currency: "USD", per: "month", share: 1 },
    { name: "Claude Pro (chat + Code), Creator's Space share", amount: 20, currency: "USD", per: "month", share: 0.5 },
  ],
  expected_orders_per_month: 5,
  sample_fee_inr: 499,
};

// US$ per million tokens, from `creators.claude_prices` (models → input/output).
export type ClaudePrices = { models: Record<string, { input: number; output: number }> };

// Old keys that held fixed rupee conversions; dropped so they can never come back into use.
const RETIRED = ["inr_per_usd", "credit_inr_per_1000", "render_inr_per_minute", "other_flat_inr", "fx", "usd_inr", "assisted_weekly_cap"];

// The stored settings without the run-time rate (what admin edits).
export function storedPricing(v: unknown): Omit<PricingSettings, "fx"> {
  const x = { ...((v ?? {}) as Record<string, unknown>) };
  for (const k of RETIRED) delete x[k];
  const y = x as Partial<PricingSettings>;
  return {
    ...PRICING_DEFAULTS,
    ...y,
    claude_steps: { ...PRICING_DEFAULTS.claude_steps, ...(y.claude_steps ?? {}) },
    review_hours: { ...PRICING_DEFAULTS.review_hours, ...(y.review_hours ?? {}) },
    directed_hours: { ...PRICING_DEFAULTS.directed_hours, ...(y.directed_hours ?? {}) },
    directed_retake: { ...PRICING_DEFAULTS.directed_retake, ...(y.directed_retake ?? {}) },
  };
}

export function mergePricing(v: unknown, fx: { rate: number; date: string; source: string }): PricingSettings {
  const s = storedPricing(v);
  return { ...s, fx: { rate: fx.rate, markup: s.fx_markup, effective: fx.rate * (1 + s.fx_markup), date: fx.date, source: fx.source } };
}

export type PriceInput = {
  chars: number;
  lang: string;
  level: "basic" | "standard" | "premium";
  service: "self_serve" | "directed";
  visual: "moving_stills" | "single_image" | "audio_only";
  shorts: number;
  sound: "narration" | "music" | "music_sfx";
  voices: "narrator" | "characters";
  characterVoices: number; // speaking characters with their own voice
  delivery: "plain" | "dramatised";
  secondLanguage: boolean;
  addons: string[];
};

export type Breakdown = {
  minutes: number;
  stills: number;
  credits: { narration: number; paintings: number; motion: number; music: number; effects: number; shorts: number };
  inr: { narration: number; images: number; claude: number; render: number; music_effects: number; other: number; buffered: number; tool_cost: number; review: number; addons: number; overhead: number; gateway_fee: number; left_for_you: number };
  claude_usd: number;
  review_hours: number;
  fx: FxUsed;
};
export type Price = { price: number; advance: number; final: number; breakdown: Breakdown };

const r2 = (n: number) => Math.round(n * 100) / 100;

// Fixed running costs per month, in rupees at the day's rate (dollar costs include the card markup).
export function fixedPerMonth(s: PricingSettings) {
  return (s.fixed_costs ?? []).reduce((sum, c) => {
    const amount = Number(c.amount) || 0;
    const share = Math.min(Math.max(Number(c.share) || 0, 0), 1);
    const inr = c.currency === "USD" ? amount * s.fx.effective : amount;
    return sum + (inr * share) / (c.per === "year" ? 12 : 1);
  }, 0);
}
export const overheadPerOrder = (s: PricingSettings) => fixedPerMonth(s) / Math.max(1, Number(s.expected_orders_per_month) || 1);

export function priceOne(i: PriceInput, s: PricingSettings, cp: ClaudePrices | null): Price {
  const langs = i.secondLanguage ? 2 : 1;
  const minutes = i.chars / (s.chars_per_minute[i.lang] ?? 700);
  const video = i.visual !== "audio_only";
  const extraVoices = i.voices === "characters" ? Math.max(0, i.characterVoices) : 0;
  const directed = i.service === "directed";

  // Narration (its own retake factor, so no retry buffer). A director retakes more.
  const retake = directed ? Math.max(s.retake[i.delivery], s.directed_retake.voice) : s.retake[i.delivery];
  const narration = i.chars * langs * s.credits_per_char[i.delivery] * (1 + s.voice_factor_per_extra * extraVoices) * retake;

  // Paintings: stills at the level's pace + cover + reference sheets; paintings-per-still
  // is their own retake factor.
  let stills = 0;
  if (i.visual === "single_image") stills = 1;
  if (i.visual === "moving_stills") {
    const pace = i.level === "premium" ? s.seconds_per_still.premium : s.seconds_per_still.standard;
    const sheets = i.voices === "characters" ? Math.max(1, Math.min(extraVoices, 6)) : 1;
    stills = Math.ceil((minutes * 60) / pace) + 1 + sheets;
  }
  if (video && i.level !== "basic") stills += 1; // YouTube thumbnail (Standard and Premium)
  const perStill = directed ? Math.max(s.paintings_per_still, s.directed_retake.paintings_per_still) : s.paintings_per_still;
  const paintings = stills * perStill * s.credits_per_painting;
  const motion = i.level === "premium" && i.visual === "moving_stills" ? s.hero_shots_premium * s.credits_per_motion_clip : 0;

  const music = i.sound !== "narration" ? s.music_credits_per_minute * minutes * langs : 0;
  const effects = i.sound === "music_sfx" ? s.effects_per_minute * minutes * s.credits_per_effect : 0;
  // Shorts: script + narration of ~50 s each, pictures reused.
  const shorts = video ? i.shorts * ((s.chars_per_minute[i.lang] ?? 700) * (50 / 60)) * s.credits_per_char[i.delivery] * s.retake[i.delivery] : 0;

  const usdInr = s.fx.effective;
  const creditInr = (c: number) => (c / 1000) * s.credit_usd_per_1000 * usdInr;

  // Claude, step by step (brief §5): tokens × the model's price × batch multiplier if on.
  const usdFor = (step: string, inTok: number, outTok: number) => {
    const rate = s.claude_steps[step];
    const m = rate && cp?.models?.[rate.model];
    if (!rate || !m) return 0;
    const usd = (inTok * m.input + outTok * m.output) / 1_000_000;
    return rate.batch ? usd * s.batch_multiplier : usd;
  };
  const k = (i.chars / 1000) * langs;
  const per1k = (step: string) => usdFor(step, (s.claude_steps[step]?.input_per_1k ?? 0) * k, (s.claude_steps[step]?.output_per_1k ?? 0) * k);
  let claudeUsd = per1k("script_prep");
  if (i.delivery === "dramatised") claudeUsd += per1k("directions");
  if (i.visual === "moving_stills") claudeUsd += per1k("shot_list");
  if (i.secondLanguage) claudeUsd += usdFor("translation", (s.claude_steps.translation?.input_per_1k ?? 0) * (i.chars / 1000), (s.claude_steps.translation?.output_per_1k ?? 0) * (i.chars / 1000));
  const vision = s.claude_steps.vision_check;
  if (vision) claudeUsd += usdFor("vision_check", (vision.input_per_still ?? 0) * stills, (vision.output_per_still ?? 0) * stills);
  const claudeInr = claudeUsd * usdInr;

  const render = s.render_usd_per_minute * usdInr * minutes * langs * (video ? 1 : 0.2);
  const other = s.other_flat_usd * usdInr;
  const musicEffects = creditInr(music + effects);
  const buffered = (claudeInr + render + musicEffects + other) * s.retry_buffer;

  const narrationInr = creditInr(narration + shorts);
  const imagesInr = creditInr(paintings + motion);
  const toolCost = narrationInr + imagesInr + buffered;

  // Studio-made: review hours. Directed: the director's hours (audio, video, Premium video).
  const baseHours = directed
    ? !video
      ? s.directed_hours.audio
      : i.level === "premium"
        ? s.directed_hours.premium_video
        : s.directed_hours.video
    : (s.review_hours[i.level]?.self_serve ?? 1.5);
  const hours = baseHours * Math.max(1, minutes / s.review_minutes_base);
  const overhead = overheadPerOrder(s);
  const addons = i.addons.reduce((sum, a) => sum + (s.addons_inr[a as keyof PricingSettings["addons_inr"]] ?? 0), 0);

  let price = 2 * toolCost + hours * s.hourly_inr + addons + overhead;
  price = price / (1 - s.gateway_fee_rate);
  price = Math.max(price, s.minimum_inr);
  // "Rounded up to ₹99": up to the next price ending in 99 (₹999, ₹1,099, ₹2,799), so the
  // ₹999 minimum stays ₹999. round_to = 99 → steps of 100 ending in 99.
  const step = s.round_to + 1;
  price = Math.ceil((price + 1) / step) * step - 1;
  const advance = Math.round(price / 2);

  return {
    price,
    advance,
    final: price - advance,
    breakdown: {
      minutes: r2(minutes),
      stills,
      credits: { narration: Math.round(narration), paintings: Math.round(paintings), motion, music: Math.round(music), effects: Math.round(effects), shorts: Math.round(shorts) },
      inr: {
        narration: r2(narrationInr),
        images: r2(imagesInr),
        claude: r2(claudeInr),
        render: r2(render),
        music_effects: r2(musicEffects),
        other: r2(other),
        buffered: r2(buffered),
        tool_cost: r2(toolCost),
        review: r2(hours * s.hourly_inr),
        addons,
        overhead: r2(overhead),
        gateway_fee: r2(price * s.gateway_fee_rate),
        // What remains after tools, the gateway fee and the fixed-cost share: the reviewer's or
        // director's time plus margin, before GST and income tax.
        left_for_you: r2(price * (1 - s.gateway_fee_rate) - toolCost - overhead),
      },
      claude_usd: r2(claudeUsd),
      review_hours: r2(hours),
      fx: s.fx,
    },
  };
}

// A long story is made as episodes, each quoted and paid separately (brief §1).
// sample + advance + final = total. The sample fee is taken off the advance (it is never
// more than half the price: the minimum price is ₹999).
export type Quote = { total: number; sample: number; advance: number; final: number; episodes: Price[]; input: PriceInput; made_at: string };

export function quote(i: PriceInput, episodeChars: number[], s: PricingSettings, cp: ClaudePrices | null): Quote {
  const parts = episodeChars.length > 1 ? episodeChars : [i.chars];
  const episodes = parts.map((chars, n) => priceOne({ ...i, chars, shorts: n === 0 ? i.shorts : 0 }, s, cp));
  const total = episodes.reduce((a, p) => a + p.price, 0);
  const half = Math.round(total / 2);
  const fee = i.service === "directed" ? s.directed_sample_fee_inr : s.sample_fee_inr;
  const sample = Math.min(Math.max(0, Math.round(fee)), half);
  const advance = half - sample;
  return { total, sample, advance, final: total - half, episodes, input: i, made_at: new Date().toISOString() };
}

// Varta Vishva Directors: chosen, or Premium (always directed). "assisted" is the old name.
export const isDirected = (a: Answers) => a.level === "premium" || a.service === "directed" || a.service === "assisted";

// The answers → the engine's input (choices the writer did not make fall back to the
// level's preset, then to Standard).
export function inputFrom(a: Answers, chars: number, storyLang: string | null, characterVoices: number): PriceInput {
  const level = (["basic", "standard", "premium"].includes(String(a.level)) ? a.level : "standard") as PriceInput["level"];
  const preset = LEVEL_PRESETS[level];
  const val = (k: string) => String(a[k] ?? preset[k] ?? "");
  const visual =
    a.make === "audio" ? "audio_only" : (["moving_stills", "single_image", "audio_only"].includes(val("visual")) ? val("visual") : "moving_stills");
  return {
    chars,
    lang: storyLang ?? String(a.lang ?? "gu"),
    level,
    service: isDirected(a) ? "directed" : "self_serve",
    visual: visual as PriceInput["visual"],
    shorts: visual === "audio_only" ? 0 : Number(val("shorts")) || 0,
    sound: (["narration", "music", "music_sfx"].includes(val("sound")) ? val("sound") : "music") as PriceInput["sound"],
    voices: val("voices") === "characters" ? "characters" : "narrator",
    characterVoices,
    delivery: val("delivery") === "plain" ? "plain" : "dramatised",
    secondLanguage: !!a.second_language && a.second_language !== "none",
    addons: Array.isArray(a.voice_addons) ? a.voice_addons.map(String) : [],
  };
}

// Stage 0.4: "Typical price: ₹… to ₹…" for a format and length, across the three levels.
// A range only, never a quote.
const TYPICAL_CHARS: Record<string, number> = { short: 2500, pages_2_5: 8000, pages_6_10: 18000, longer: 20000 };

export function priceRange(a: Answers, s: PricingSettings, cp: ClaudePrices | null) {
  const chars = TYPICAL_CHARS[String(a.length)] ?? 8000;
  const lang = String(a.lang ?? "gu");
  const levels: PriceInput["level"][] =
    a.make === "audio" ? ["basic", "standard"] : a.make === "single" ? ["basic", "standard"] : ["basic", "standard", "premium"];
  const prices = levels.map((level) => {
    const preset = LEVEL_PRESETS[level];
    const visual = a.make === "audio" ? "audio_only" : a.make === "single" ? "single_image" : a.make === "stills" ? "moving_stills" : String(preset.visual);
    const answers: Answers = { ...preset, level, make: String(a.make ?? "unsure"), visual };
    return priceOne(inputFrom(answers, chars, lang, level === "basic" ? 0 : 2), s, cp).price;
  });
  return { from: Math.min(...prices), to: Math.max(...prices), episodes: a.length === "longer" };
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
