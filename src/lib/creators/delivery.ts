import "server-only";
import { signedPrivateUrl } from "@/lib/r2";

// Delivery to the writer (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards", rule 4).
// Only finished, mixed files leave the studio, and only as short-lived signed links to
// the private bucket. Stems, music-only beds, instrumental or "no voice" versions, raw
// narration, sound-effect layers and project files are never handed out: the music and
// effect licences cover the finished work, not the parts.
//
// Every deliverable sits at  creators/<order-id>/final/<name>.<ext>  in R2_PRIVATE_BUCKET.
// The worker that renders the finals writes only mixed files there; this check is the
// second lock, so a mistake upstream still can't leak a stem.

const LINK_SECONDS = 15 * 60;

const KINDS = {
  video: ["mp4"],
  audio: ["mp3", "wav"],
  captions: ["srt"],
  thumbnail: ["png", "jpg"],
  credits: ["txt", "pdf"],
} as const;
export type DeliveryKind = keyof typeof KINDS;

// Names that suggest a part rather than the finished mix: refused even inside final/.
// Matched against the words of the file name (split at - _ . and spaces).
const PART_WORDS = new Set([
  "stem", "stems", "instrumental", "instrumentals", "karaoke", "minus", "bed", "beds", "sfx", "fx",
  "layer", "layers", "raw", "dry", "session", "project", "multitrack", "track", "tracks", "acapella",
]);
const PART_PAIRS = /(music|voice|narration|vocal|effects?|sound)[-_. ]?only|no[-_. ]?(voice|vocals?|narration)|without[-_. ]?(voice|narration)/i;
const looksLikeAPart = (name: string) =>
  PART_PAIRS.test(name) || name.toLowerCase().split(/[-_. ]+/).some((w) => PART_WORDS.has(w));

const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Why a key may not be delivered, or null when it may.
export function deliveryProblem(orderId: string, key: string, kind: DeliveryKind): string | null {
  if (!ORDER_ID.test(orderId)) return "not an order";
  const prefix = `creators/${orderId}/final/`;
  if (!key.startsWith(prefix)) return "not a finished file of this order";
  const name = key.slice(prefix.length);
  if (!name || name.includes("/") || name.includes("..")) return "not a finished file of this order";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!(KINDS[kind] as readonly string[]).includes(ext)) return `a ${kind} file must be ${KINDS[kind].join(" or ")}`;
  if (looksLikeAPart(name)) return "only the finished mix is delivered, never stems or music-only versions";
  return null;
}

// A 15-minute download link for one finished file. The caller has already checked that
// the signed-in writer owns the order and has paid (brief §1: clean files after the
// final payment) and logs the download (creator_downloads).
export async function deliveryLink(orderId: string, key: string, kind: DeliveryKind): Promise<string> {
  const problem = deliveryProblem(orderId, key, kind);
  if (problem) throw new Error(`Refused to deliver ${key}: ${problem}.`);
  const url = await signedPrivateUrl({ url: `r2-private:${key}`, bucket: "private", key }, LINK_SECONDS);
  if (!url) throw new Error("Can't deliver: R2_PRIVATE_BUCKET is not set.");
  return url;
}
