import "server-only";
import { AwsClient } from "aws4fetch";

// Files in Cloudflare R2. A row refers to a file by value:
//   https://media.jambuch.in/<key>   object in the public bucket (R2_BUCKET)
//   r2-private:<key>                 object in the private bucket (R2_PRIVATE_BUCKET)
// While an item is in the Trash its public files are moved to the private
// trash bucket (R2_TRASH_BUCKET), so their old links stop working.

export type FileRef = { url: string; bucket: "public" | "private"; key: string };

const PRIVATE_PREFIX = "r2-private:";

function publicBase() {
  return process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
}

export function fileRef(value: unknown): FileRef | null {
  if (typeof value !== "string") return null;
  const base = publicBase();
  if (base && value.startsWith(`${base}/`)) {
    const key = decodeURIComponent(value.slice(base.length + 1).split(/[?#]/)[0]);
    return key ? { url: value, bucket: "public", key } : null;
  }
  if (value.startsWith(PRIVATE_PREFIX)) {
    const key = value.slice(PRIVATE_PREFIX.length);
    return key ? { url: value, bucket: "private", key } : null;
  }
  return null;
}

function settings() {
  const env = process.env;
  return {
    account: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    publicBucket: env.R2_BUCKET,
    trashBucket: env.R2_TRASH_BUCKET,
    privateBucket: env.R2_PRIVATE_BUCKET,
  };
}

// Why R2 can't be used right now, or null when it can.
export function r2Problem(): string | null {
  const s = settings();
  if (!s.account || !s.accessKeyId || !s.secretAccessKey) return "R2 keys are not set";
  if (!s.publicBucket || !s.trashBucket) return "R2_BUCKET and R2_TRASH_BUCKET must be set";
  return null;
}

export function cachePurgeReady() {
  return !!(process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_API_TOKEN);
}

let client: AwsClient | null = null;
function r2() {
  const problem = r2Problem();
  if (problem) throw new Error(`Can't change files: ${problem}.`);
  const s = settings();
  client ??= new AwsClient({
    accessKeyId: s.accessKeyId!,
    secretAccessKey: s.secretAccessKey!,
    service: "s3",
    region: "auto",
  });
  return { client, s };
}

function objectUrl(bucket: string, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${settings().account}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

// Copies an object between buckets. False when the source doesn't exist.
async function copy(from: string, to: string, key: string) {
  const { client } = r2();
  const src = await client.fetch(objectUrl(from, key));
  if (src.status === 404) return false;
  if (!src.ok) throw new Error(`Couldn't read ${key} from R2 (${src.status}).`);
  const put = await client.fetch(objectUrl(to, key), {
    method: "PUT",
    body: await src.arrayBuffer(),
    headers: { "Content-Type": src.headers.get("content-type") ?? "application/octet-stream" },
  });
  if (!put.ok) throw new Error(`Couldn't write ${key} to R2 (${put.status}).`);
  return true;
}

// Saves a new file in the public bucket and returns its media.jambuch.in link.
export async function uploadPublic(key: string, body: ArrayBuffer, contentType: string) {
  const { client, s } = r2();
  const base = publicBase();
  if (!base) throw new Error("Can't upload: NEXT_PUBLIC_R2_PUBLIC_URL is not set.");
  const res = await client.fetch(objectUrl(s.publicBucket!, key), {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
  if (!res.ok) throw new Error(`Couldn't upload to R2 (${res.status}).`);
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// Every media.jambuch.in link written anywhere inside a piece of text, such
// as images placed in a chapter.
export function fileRefsIn(text: string): FileRef[] {
  const base = publicBase();
  if (!base) return [];
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = text.match(new RegExp(`${escaped}/[^\\s)"'<>]+`, "g")) ?? [];
  return found.map(fileRef).filter((f): f is FileRef => f !== null);
}

async function remove(bucket: string, key: string) {
  const { client } = r2();
  const res = await client.fetch(objectUrl(bucket, key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Couldn't delete ${key} from R2 (${res.status}).`);
}

// media.jambuch.in goes through Cloudflare's cache, which can keep serving a
// file after it leaves the bucket. Purging makes the old link stop at once.
async function purgeCache(url: string) {
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!zone || !token) return;
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: [url] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) console.error("cache purge failed:", res.status, await res.text());
}

export async function moveToTrash(f: FileRef) {
  if (f.bucket !== "public") return; // private files are never publicly reachable
  const { s } = r2();
  if (await copy(s.publicBucket!, s.trashBucket!, f.key)) await remove(s.publicBucket!, f.key);
  await purgeCache(f.url);
}

export async function restoreFromTrash(f: FileRef) {
  if (f.bucket !== "public") return;
  const { s } = r2();
  if (await copy(s.trashBucket!, s.publicBucket!, f.key)) await remove(s.trashBucket!, f.key);
}

export async function deleteForever(f: FileRef) {
  const { s } = r2();
  if (f.bucket === "private") {
    if (!s.privateBucket) throw new Error("Can't delete a private file: R2_PRIVATE_BUCKET is not set.");
    await remove(s.privateBucket, f.key);
    return;
  }
  await remove(s.publicBucket!, f.key);
  await remove(s.trashBucket!, f.key);
  await purgeCache(f.url);
}
