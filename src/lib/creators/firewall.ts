// The prompt firewall (docs/CREATORS_QUESTION_FLOW.md §12, brief §6A "Safeguards").
//
// Rule 1: a writer's own words never reach a music, sound, image or voice generator.
//         Generators only ever receive vocabulary tags and ids (vocabulary.ts), checked
//         in code by onlyVocabulary().
// Rule 2: a writer's words may reach Claude only as quoted data: cleaned here, wrapped in
//         a tag (wrap() in claude.ts), with instructions that say it is data.
// Rule 3: text that looks like instructions to an AI is still passed (it may be innocent
//         story text), but it is flagged, and a flagged draft is shown to Jaydeep.
//
// This file does rules 2 and 3 for every free-text answer before any Claude call.

const MAX_DEFAULT = 2000;

// Phrases that try to steer an AI rather than describe a story. Kept small and plain:
// a flag is a reason for a person to look, not a refusal.
const SUSPICIOUS = [
  /ignore (all |any |the )?(previous|above|earlier|prior) (instructions|rules|prompts?)/i,
  /disregard (all |any |the )?(previous|above|earlier|prior)/i,
  /\b(system|developer) prompt\b/i,
  /\byou are now\b/i,
  /\bact as (an? )?(ai|assistant|system|admin)/i,
  /\bnew instructions?\b/i,
  /\b(price|cost|charge)\s*(=|:|is|should be)\s*(0|zero|free|₹?\s*0)\b/i,
  /\bmake (it|this|the order) free\b/i,
  /\bmark (this|it) (as )?(clear|approved)\b/i,
  /<\/?(system|instructions?|assistant|user|story|about|answer)[^>]*>/i,
  /```/,
];

export type Clean = { text: string; flagged: boolean };

// Plain text only: no control characters, no markup-looking tags, sane whitespace, a length cap.
export function cleanText(input: unknown, max = MAX_DEFAULT): Clean {
  let text = String(input ?? "");
  const flagged = SUSPICIOUS.some((re) => re.test(text));
  text = text
    .replace(/\r\n?/g, "\n")
    // Control characters (keep newline and tab).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Zero-width and direction marks that can hide text (keep ZWJ/ZWNJ: Indic scripts need them).
    .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/<[^>\n]{0,200}>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
  return { text, flagged };
}

// Cleans a whole notes object (free-text answers) and reports whether anything was flagged.
export function cleanNotes(notes: Record<string, unknown>, max = MAX_DEFAULT) {
  let flagged = false;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(notes)) {
    if (typeof v !== "string") continue;
    const c = cleanText(v, max);
    flagged ||= c.flagged;
    if (c.text) out[k] = c.text;
  }
  return { notes: out, flagged };
}

// The story itself is long creative text: only control characters and hidden marks are
// removed (its words must stay exactly as written), and it is flagged the same way.
export function cleanStory(input: string): Clean {
  const flagged = SUSPICIOUS.slice(0, 7).some((re) => re.test(input));
  const text = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return { text, flagged };
}
