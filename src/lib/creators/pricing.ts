// Creator's Space pricing engine (docs/CREATORS_SPACE_BRIEF.md §5). Pure arithmetic: the
// rates come from the settings rows `creators.pricing` and `creators.claude_prices`
// (editable in admin, never fetched live). The writer sees one fixed price; admin sees the
// breakdown.
//
//   tool_cost = narration + paintings (own retake factors) + (Claude + render + music
//               + effects + other) × retry buffer
//   price     = 2 × tool_cost + review hours × ₹/hour + add-ons
//             ÷ (1 − gateway fee), at least the minimum, rounded UP to ₹99
//   advance   = 50%, final = the rest. The 30–60 s sample is free (Jaydeep, 25 Nov 2026).

import type { Answers } from "./questions";
import { LEVEL_PRESETS } from "./questions";

type StepRate = { model: string; input_per_1k?: number; output_per_1k?: number; input_per_still?: number; output_per_still?: number; batch: boolean };

export type PricingSettings = {
  inr_per_usd: number;
  credit_inr_per_1000: number;
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
  render_inr_per_minute: number;
  other_flat_inr: number;
  retry_buffer: number;
  review_hours: Record<string, { self_serve: number; assisted: number }>;
  review_minutes_base: number;
  hourly_inr: number;
  gateway_fee_rate: number;
  minimum_inr: number;
  round_to: number;
  addons_inr: { exclusive_voice: number; own_voice: number };
  assisted_weekly_cap: number;
};

// Same numbers as the migration 20261125000000_creator_flow.sql (used if a key is missing).
export const PRICING_DEFAULTS: PricingSettings = {
  inr_per_usd: 85,
  credit_inr_per_1000: 14,
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
  render_inr_per_minute: 5,
  other_flat_inr: 20,
  retry_buffer: 1.4,
  review_hours: {
    basic: { self_serve: 0.5, assisted: 1.5 },
    standard: { self_serve: 1.5, assisted: 3 },
    premium: { self_serve: 4, assisted: 4 },
  },
  review_minutes_base: 12,
  hourly_inr: 1000,
  gateway_fee_rate: 0.0236,
  minimum_inr: 999,
  round_to: 99,
  addons_inr: { exclusive_voice: 1500, own_voice: 500 },
  assisted_weekly_cap: 3,
};

// US$ per million tokens, from `creators.claude_prices` (models → input/output).
export type ClaudePrices = { models: Record<string, { input: number; output: number }> };

export function mergePricing(v: unknown): PricingSettings {
  const x = (v ?? {}) as Partial<PricingSettings>;
  return {
    ...PRICING_DEFAULTS,
    ...x,
    claude_steps: { ...PRICING_DEFAULTS.claude_steps, ...(x.claude_steps ?? {}) },
    review_hours: { ...PRICING_DEFAULTS.review_hours, ...(x.review_hours ?? {}) },
  };
}

export type PriceInput = {
  chars: number;
  lang: string;
  level: "basic" | "standard" | "premium";
  service: "self_serve" | "assisted";
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
  inr: { narration: number; images: number; claude: number; render: number; music_effects: number; other: number; buffered: number; tool_cost: number; review: number; addons: number };
  claude_usd: number;
  review_hours: number;
};
export type Price = { price: number; advance: number; final: number; breakdown: Breakdown };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function priceOne(i: PriceInput, s: PricingSettings, cp: ClaudePrices | null): Price {
  const langs = i.secondLanguage ? 2 : 1;
  const minutes = i.chars / (s.chars_per_minute[i.lang] ?? 700);
  const video = i.visual !== "audio_only";
  const extraVoices = i.voices === "characters" ? Math.max(0, i.characterVoices) : 0;

  // Narration (its own retake factor, so no retry buffer).
  const narration =
    i.chars * langs * s.credits_per_char[i.delivery] * (1 + s.voice_factor_per_extra * extraVoices) * s.retake[i.delivery];

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
  const paintings = stills * s.paintings_per_still * s.credits_per_painting;
  const motion = i.level === "premium" && i.visual === "moving_stills" ? s.hero_shots_premium * s.credits_per_motion_clip : 0;

  const music = i.sound !== "narration" ? s.music_credits_per_minute * minutes * langs : 0;
  const effects = i.sound === "music_sfx" ? s.effects_per_minute * minutes * s.credits_per_effect : 0;
  // Shorts: script + narration of ~50 s each, pictures reused.
  const shorts = video ? i.shorts * ((s.chars_per_minute[i.lang] ?? 700) * (50 / 60)) * s.credits_per_char[i.delivery] * s.retake[i.delivery] : 0;

  const creditInr = (c: number) => (c / 1000) * s.credit_inr_per_1000;

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
  const claudeInr = claudeUsd * s.inr_per_usd;

  const render = s.render_inr_per_minute * minutes * langs * (video ? 1 : 0.2);
  const musicEffects = creditInr(music + effects);
  const buffered = (claudeInr + render + musicEffects + s.other_flat_inr) * s.retry_buffer;

  const narrationInr = creditInr(narration + shorts);
  const imagesInr = creditInr(paintings + motion);
  const toolCost = narrationInr + imagesInr + buffered;

  const hours = (s.review_hours[i.level]?.[i.service] ?? 1.5) * Math.max(1, minutes / s.review_minutes_base);
  const addons = i.addons.reduce((sum, a) => sum + (s.addons_inr[a as keyof PricingSettings["addons_inr"]] ?? 0), 0);

  let price = 2 * toolCost + hours * s.hourly_inr + addons;
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
        other: s.other_flat_inr,
        buffered: r2(buffered),
        tool_cost: r2(toolCost),
        review: r2(hours * s.hourly_inr),
        addons,
      },
      claude_usd: r2(claudeUsd),
      review_hours: r2(hours),
    },
  };
}

// A long story is made as episodes, each quoted and paid separately (brief §1).
export type Quote = { total: number; advance: number; final: number; episodes: Price[]; input: PriceInput; made_at: string };

export function quote(i: PriceInput, episodeChars: number[], s: PricingSettings, cp: ClaudePrices | null): Quote {
  const parts = episodeChars.length > 1 ? episodeChars : [i.chars];
  const episodes = parts.map((chars, n) => priceOne({ ...i, chars, shorts: n === 0 ? i.shorts : 0 }, s, cp));
  const total = episodes.reduce((a, p) => a + p.price, 0);
  const advance = episodes.reduce((a, p) => a + p.advance, 0);
  return { total, advance, final: total - advance, episodes, input: i, made_at: new Date().toISOString() };
}

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
    service: level === "premium" || a.service === "assisted" ? "assisted" : "self_serve",
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
