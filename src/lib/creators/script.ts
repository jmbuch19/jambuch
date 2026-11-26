// The narration script for a sample (owner's decision, 25 Nov 2026): an opening announcement of the
// title and author, then the story's opening, split into segments that are voiced separately.
// The pauses between segments are real silences put in when the segments are joined (FFmpeg),
// never left to the voice model; their lengths come from the engine's narration rules
// (rules.ts). Pure functions: no I/O, so they can be tested on their own.

import type { PauseName } from "./rules";

export type Segment = {
  text: string;
  kind: "title" | "author" | "story";
  gapAfter: number; // seconds of silence after this segment
  gapKind: PauseName | "none";
  sentences: number[]; // 1-based story sentence numbers in this segment
};

export type Script = { segments: Segment[]; sentences: string[]; spoken: string };

// "Title" lines compare letters and digits only (any script), ignoring punctuation and spaces.
export const normTitle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

// If the story's first line is its title, it is not read twice.
export function stripTitle(story: string, title: string) {
  const text = story.replace(/\r\n?/g, "\n").replace(/^\s+/, "");
  if (!title.trim()) return text;
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  return normTitle(first) && normTitle(first) === normTitle(title) ? text.slice(nl < 0 ? text.length : nl + 1).replace(/^\s+/, "") : text;
}

const OPENING: Record<string, (title: string, author: string) => [string, string]> = {
  gu: (t, a) => [`વાર્તા: ${t}.`, `લેખક: ${a}.`],
  hi: (t, a) => [`कहानी: ${t}।`, `लेखक: ${a}।`],
  en: (t, a) => [`Story: ${t}.`, `Written by ${a}.`],
};

const SCENE_MARK = /^\s*(\*\s*){3,}\s*$|^\s*(-\s*){3,}\s*$|^\s*⁂\s*$|^\s*(#\s*){3,}\s*$/;
const QUOTE_OPEN = /^["“„«'‘]/;
const SENTENCE_SPLIT = /(?<=[.!?।॥])\s+/;

type Block = { text: string; breakBefore: "paragraph" | "scene_break" };

// Paragraphs and scene breaks. A text that puts a blank line between most paragraphs uses
// blank lines as paragraph breaks, and only marks (***) or two blank lines as scene breaks;
// otherwise a blank line is a scene break.
function blocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const breaks = { single: 0, blank: 0 };
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (!lines[i - 1].trim()) breaks.blank++;
    else breaks.single++;
  }
  const blankIsParagraph = breaks.blank > breaks.single;
  const out: Block[] = [];
  let blanks = 0;
  let pendingScene = false;
  for (const line of lines) {
    if (!line.trim()) {
      blanks++;
      continue;
    }
    if (SCENE_MARK.test(line)) {
      pendingScene = true;
      blanks = 0;
      continue;
    }
    const scene = pendingScene || (blankIsParagraph ? blanks >= 2 : blanks >= 1);
    out.push({ text: line.trim(), breakBefore: scene && out.length ? "scene_break" : "paragraph" });
    blanks = 0;
    pendingScene = false;
  }
  return out;
}

// Builds the script: announcement (if a title is given), then whole sentences of the story up to
// maxChars (never cut mid-sentence; a single overlong first sentence is cut at a word).
export function buildScript(
  body: string,
  maxChars: number,
  opening: { title: string; author: string; lang: string },
  pauses: Record<PauseName, number>,
): Script {
  const segments: Segment[] = [];
  const title = opening.title.trim();
  const author = opening.author.trim();
  if (title) {
    const [t, a] = (OPENING[opening.lang] ?? OPENING.en)(title, author);
    segments.push({ text: t, kind: "title", gapAfter: author ? pauses.title : pauses.title_swell, gapKind: author ? "title" : "title_swell", sentences: [] });
    // After the author: the silence where the music swells, before the story starts.
    if (author) segments.push({ text: a, kind: "author", gapAfter: Math.max(pauses.author, pauses.title_swell), gapKind: "title_swell", sentences: [] });
  }

  const sentences: string[] = [];
  let used = 0;
  let full = false;
  for (const block of blocks(body)) {
    if (full) break;
    const parts = block.text.split(SENTENCE_SPLIT).map((x) => x.trim()).filter(Boolean);
    let run: { text: string[]; nums: number[]; quote: boolean } | null = null;
    const flush = (gap: PauseName) => {
      if (!run) return;
      segments.push({ text: run.text.join(" "), kind: "story", gapAfter: pauses[gap], gapKind: gap, sentences: run.nums });
      run = null;
    };
    // The gap before this block is set on the last segment of the previous one.
    const prev = [...segments].reverse().find((x) => x.kind === "story");
    if (prev) {
      prev.gapAfter = pauses[block.breakBefore];
      prev.gapKind = block.breakBefore;
    }
    for (const p of parts) {
      let text = p;
      if (used + text.length > maxChars) {
        if (sentences.length) {
          full = true;
          break;
        }
        const cut = text.lastIndexOf(" ", maxChars);
        text = `${text.slice(0, cut > 0 ? cut : maxChars)}…`;
        full = true;
      }
      const quote = QUOTE_OPEN.test(text);
      // A change between narration and dialogue gets its own short pause.
      if (run && run.quote !== quote) flush("dialogue_change");
      sentences.push(text);
      used += text.length + 1;
      run ??= { text: [], nums: [], quote };
      run.text.push(text);
      run.nums.push(sentences.length);
      if (full) break;
    }
    flush("paragraph");
  }
  // Nothing after the last segment: the end pause is set by the mix (before the closing tag).
  if (segments.length) {
    segments[segments.length - 1].gapAfter = 0;
    segments[segments.length - 1].gapKind = "none";
  }
  return { segments, sentences, spoken: segments.map((x) => x.text).join(" ") };
}
