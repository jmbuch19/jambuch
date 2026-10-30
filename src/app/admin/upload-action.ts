"use server";

import { requireAdmin } from "@/lib/admin";
import { r2Problem, uploadPublic } from "@/lib/r2";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 4 * 1024 * 1024; // the browser shrinks photos before upload, so this is generous

// Uploads one image to the public media bucket. Called from the admin's image
// fields and the chapter "Insert image" button.
export async function uploadImage(form: FormData): Promise<UploadResult> {
  await requireAdmin();
  const problem = r2Problem();
  if (problem) return { ok: false, error: `Uploads aren't set up yet (${problem}).` };

  const file = form.get("file");
  const folder = String(form.get("folder") ?? "images").replace(/[^a-z0-9-]/g, "") || "images";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No image was received." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Please choose a JPG, PNG or WebP image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That image is too large (over 4 MB)." };

  const month = new Date().toISOString().slice(0, 7);
  const key = `${folder}/${month}/${crypto.randomUUID()}.${ext}`;
  try {
    return { ok: true, url: await uploadPublic(key, await file.arrayBuffer(), file.type) };
  } catch (err) {
    console.error("image upload failed:", err);
    return { ok: false, error: "The upload didn’t go through. Please try again." };
  }
}
