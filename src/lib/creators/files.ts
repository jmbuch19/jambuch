import "server-only";
import { deleteForever, listPrivate, readPrivate, uploadPrivate } from "@/lib/r2";

// A request's creative files in the private R2 bucket (docs/CREATORS_SPACE_BRIEF.md §6B,
// §6H; docs/CREATORS_QUESTION_FLOW.md §13). Nothing here is public, and none of it is
// ever copied into a database table:
//   creators/<id>/story.txt          the story as added (checked against story_sha256)
//   creators/<id>/draft.json         free-text answers, characters, setting, follow-ups,
//                                    episodes, look suggestions (the creative side of the flow)
//   creators/<id>/brief.json         what the studio and the sample read (made at approval)
//   creators/<id>/plan-<n>.md        each version of the creative plan
//   creators/<id>/ref/<n>.<ext>      the writer's own pictures (guidance only)
//   creators/<id>/voice/<n>.webm     voice notes, deleted as soon as they are transcribed
//   creators/<id>/order_pack.json    the order pack (after the advance)
//   creators/<id>/sample/...         the watermarked sample and its credits
// Deleted 7 days after the sample is sent, at once when a request is withdrawn, refused
// or closed, and 14 days after a draft is abandoned (the daily job, src/app/api/daily).

export type Brief = {
  about: string;
  answers: { topic: string; question: string; answer: string }[];
};

export type Character = {
  name: string;
  role: "main" | "minor";
  age: string;
  look: string;
  voice: string; // a voice-type word from VOICE_TYPES, or ""
  real_person: "no" | "alive_permission" | "alive_no_permission" | "historical";
  sacred: "" | "show_face" | "symbols_only";
};

export type FollowUpQ = { id: string; topic: string; question: string; options: string[] };
export type FollowUpRound = { questions: FollowUpQ[]; answers: Record<string, string> };
export type Episode = { start: number; title: string };
export type LookSuggestion = { style: string; colour: string; reason: string };
export type Pronunciation = { word: string; say_as: string };

export type Draft = {
  text: Record<string, string>; // free-text answers by question id
  characters: Character[];
  characters_found: boolean; // Claude has listed them (once)
  setting_suggested: string;
  looks: LookSuggestion[];
  followups: FollowUpRound[];
  followups_done: boolean;
  pronunciation: Pronunciation[];
  episodes: Episode[];
  pictures: string[]; // keys under ref/
  flagged: boolean; // the firewall saw instruction-like text somewhere
  fix?: { reason: string; suggestions: { where: string; change: string }[] }; // the fix-it flow
};

export const EMPTY_DRAFT: Draft = {
  text: {},
  characters: [],
  characters_found: false,
  setting_suggested: "",
  looks: [],
  followups: [],
  followups_done: false,
  pronunciation: [],
  episodes: [],
  pictures: [],
  flagged: false,
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (s: string) => enc.encode(s).buffer as ArrayBuffer;

export const folder = (requestId: string) => `creators/${requestId}/`;
export const storyKey = (requestId: string) => `creators/${requestId}/story.txt`;
export const briefKey = (requestId: string) => `creators/${requestId}/brief.json`;
export const draftKey = (requestId: string) => `creators/${requestId}/draft.json`;
export const planKey = (requestId: string, n: number) => `creators/${requestId}/plan-${n}.md`;
export const pictureKey = (requestId: string, n: number, ext: string) => `creators/${requestId}/ref/${n}.${ext}`;
export const voiceKey = (requestId: string, n: number) => `creators/${requestId}/voice/${n}.webm`;
export const packKey = (requestId: string) => `creators/${requestId}/order_pack.json`;
export const sampleKey = (requestId: string, n: number) => `creators/${requestId}/sample/sample-${n}.mp3`;
export const creditsKey = (requestId: string, n: number) => `creators/${requestId}/sample/credits-${n}.json`;

export async function saveRequestFiles(requestId: string, story: string, brief: Brief) {
  await uploadPrivate(storyKey(requestId), buf(story), "text/plain; charset=utf-8");
  await uploadPrivate(briefKey(requestId), buf(JSON.stringify(brief)), "application/json");
  return storyKey(requestId);
}

export async function saveStory(requestId: string, story: string) {
  await uploadPrivate(storyKey(requestId), buf(story), "text/plain; charset=utf-8");
  return storyKey(requestId);
}

export async function saveBrief(requestId: string, brief: Brief) {
  await uploadPrivate(briefKey(requestId), buf(JSON.stringify(brief)), "application/json");
}

export async function readStory(requestId: string) {
  return dec.decode(await readPrivate(storyKey(requestId)));
}

export async function readBrief(requestId: string): Promise<Brief | null> {
  try {
    return JSON.parse(dec.decode(await readPrivate(briefKey(requestId)))) as Brief;
  } catch {
    return null;
  }
}

export async function readDraft(requestId: string): Promise<Draft> {
  try {
    return { ...EMPTY_DRAFT, ...(JSON.parse(dec.decode(await readPrivate(draftKey(requestId)))) as Partial<Draft>) };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export async function saveDraft(requestId: string, draft: Draft) {
  await uploadPrivate(draftKey(requestId), buf(JSON.stringify(draft)), "application/json");
}

export async function savePlan(requestId: string, n: number, markdown: string) {
  await uploadPrivate(planKey(requestId, n), buf(markdown), "text/markdown; charset=utf-8");
  return planKey(requestId, n);
}

export async function readPlan(requestId: string, n: number) {
  try {
    return dec.decode(await readPrivate(planKey(requestId, n)));
  } catch {
    return null;
  }
}

export async function savePack(requestId: string, pack: unknown) {
  await uploadPrivate(packKey(requestId), buf(JSON.stringify(pack, null, 2)), "application/json");
  return packKey(requestId);
}

// Deletes every file of a request: everything under creators/<id>/, plus any extra keys
// given. Missing files are fine. Returns the keys deleted.
export async function deleteRequestFiles(requestId: string, extraKeys: string[] = []) {
  let keys: string[] = [];
  try {
    keys = await listPrivate(folder(requestId));
  } catch (e) {
    // Listing failed: fall back to the known names so the main files still go.
    console.error("creators: could not list files of", requestId, e instanceof Error ? e.message : e);
    keys = [storyKey(requestId), briefKey(requestId), draftKey(requestId), packKey(requestId)];
  }
  const all = [...new Set([...keys, ...extraKeys])];
  for (const key of all) await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
  return all;
}

export async function deleteKey(key: string) {
  await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
}
