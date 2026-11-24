// The asset library's vocabulary: the only words that may ever reach a music, sound-effect,
// image or voice prompt. A writer's own words about style are turned into these tags by
// Claude (styleTags in claude.ts), every tag is checked against this list in code, and the
// raw text is never passed on (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards", rule 3).
//
// To add a word: add it here first, and make sure the library has an asset or a prompt
// block for it. Tags are "group:word", e.g. "music:flute".

export const VOCABULARY = {
  // Visual styles (brief §3 "Style and colour guide").
  style: [
    "indian-miniature",
    "pahari-miniature",
    "soft-watercolour",
    "storybook",
    "ink-and-wash",
    "realistic-period",
    "classic-cinema",
  ],
  // Colour treatments, applied in the edit.
  colour: ["full-colour-warm", "sepia", "black-and-white", "colour-journey", "muted", "night-tint"],
  // How it should feel (brief §3B question 3).
  mood: [
    "warm",
    "devotional",
    "suspenseful",
    "funny",
    "sad",
    "inspiring",
    "nostalgic",
    "mysterious",
    "calm",
    "dramatic",
  ],
  // Music beds and lead instruments in the library.
  music: [
    "none",
    "sparse",
    "flute",
    "bansuri",
    "sitar",
    "santoor",
    "sarangi",
    "shehnai",
    "tabla",
    "dholak",
    "harmonium",
    "tanpura-drone",
    "strings",
    "piano",
    "folk-gujarati",
    "devotional-bhajan",
    "lullaby",
    "no-music-in-sad-parts",
  ],
  // Sound effects in the library.
  sound: [
    "rain",
    "monsoon-storm",
    "thunder",
    "wind",
    "river",
    "sea",
    "birds-morning",
    "crickets-night",
    "temple-bells",
    "conch",
    "footsteps",
    "door",
    "bullock-cart",
    "horse",
    "village-crowd",
    "market",
    "train",
    "fire",
    "cooking",
    "children-playing",
    "few-effects",
  ],
  // Narration and character voices.
  voice: [
    "narrator-female",
    "narrator-male",
    "elderly-female",
    "elderly-male",
    "young-female",
    "young-male",
    "child",
    "soft",
    "deep",
    "storyteller",
  ],
  // Pacing.
  pace: ["slow", "measured", "lively"],
  // Things to keep out (brief §3B question 9).
  avoid: [
    "no-blood",
    "no-violence-shown",
    "no-deity-face",
    "no-mixed-language",
    "no-scary-sounds",
    "no-loud-music",
    "no-modern-objects",
  ],
} as const;

export type TagGroup = keyof typeof VOCABULARY;
export type StyleTag = `${TagGroup}:${string}`;

export const ALL_TAGS: readonly string[] = (Object.keys(VOCABULARY) as TagGroup[]).flatMap((g) =>
  VOCABULARY[g].map((w) => `${g}:${w}`),
);
const TAG_SET = new Set(ALL_TAGS);

// Keeps only real vocabulary tags, without repeats. Anything else, however it got here, is dropped.
export function onlyVocabulary(tags: unknown): StyleTag[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<StyleTag>();
  for (const t of tags) if (typeof t === "string" && TAG_SET.has(t)) out.add(t as StyleTag);
  return [...out];
}
