import "server-only";
import { deleteForever, readPrivate, uploadPrivate } from "@/lib/r2";

// A request's creative files in the private R2 bucket (docs/CREATORS_SPACE_BRIEF.md §6B, §6H):
//   creators/<request id>/story.txt     the story as sent (checked against story_sha256)
//   creators/<request id>/brief.json    the note, the follow-up questions and answers
//   creators/<request id>/sample/...    the watermarked sample and its credits
// Nothing here is public. Deleted 7 days after the sample is sent, or at once when a
// request is withdrawn, refused or closed (the daily job, src/app/api/daily).

export type Brief = {
  about: string;
  answers: { topic: string; question: string; answer: string }[];
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (s: string) => enc.encode(s).buffer as ArrayBuffer;

export const storyKey = (requestId: string) => `creators/${requestId}/story.txt`;
export const briefKey = (requestId: string) => `creators/${requestId}/brief.json`;
export const sampleKey = (requestId: string, n: number) => `creators/${requestId}/sample/sample-${n}.mp3`;
export const creditsKey = (requestId: string, n: number) => `creators/${requestId}/sample/credits-${n}.json`;

export async function saveRequestFiles(requestId: string, story: string, brief: Brief) {
  await uploadPrivate(storyKey(requestId), buf(story), "text/plain; charset=utf-8");
  await uploadPrivate(briefKey(requestId), buf(JSON.stringify(brief)), "application/json");
  return storyKey(requestId);
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

// Deletes every known file of a request. Missing files are fine. Returns the keys tried.
export async function deleteRequestFiles(requestId: string, sampleKeys: string[] = []) {
  const keys = [storyKey(requestId), briefKey(requestId), ...sampleKeys];
  for (const key of keys) await deleteForever({ url: `r2-private:${key}`, bucket: "private", key });
  return keys;
}
