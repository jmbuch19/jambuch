"use client";

import { useRef, useState } from "react";
import { uploadImage } from "../../../upload-action";
import { shrinkImage } from "./shrink-image";
import a from "../../../admin.module.css";

// An image field: shows the current picture, uploads a new one, or removes it.
// The saved value is the image's media.jambuch.in link, sent with the form.
export default function ImageField({ name, defaultValue, folder }: { name: string; defaultValue: string; folder: string }) {
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", await shrinkImage(file, 1800));
      form.set("folder", folder);
      const res = await uploadImage(form);
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn’t go through.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={a.imageField}>
      <input type="hidden" name={name} value={url} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={a.imagePreview} />
      ) : (
        <div className={a.imageEmpty}>No image</div>
      )}
      <div className={a.imageButtons}>
        <button type="button" className={a.secondary} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : url ? "Replace image" : "Upload image"}
        </button>
        {url && !busy && (
          <button type="button" className={a.linkButton} onClick={() => setUrl("")}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && (
        <p className={a.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
