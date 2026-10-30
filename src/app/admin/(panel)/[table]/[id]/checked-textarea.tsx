"use client";

import { useRef, useState } from "react";
import { textProblems } from "@/lib/text-checks";
import { uploadImage } from "../../../upload-action";
import { shrinkImage } from "./shrink-image";
import a from "../../../admin.module.css";

// A textarea that warns, as you type or paste, about text that will read badly.
// It only warns; saving is never blocked. With `images` (the upload folder) it
// also gets an "Insert image" button that uploads a picture and writes an
// image line, ![caption](link), where the cursor is.
export default function CheckedTextarea({
  name,
  defaultValue,
  rows,
  required,
  images,
}: {
  name: string;
  defaultValue: string;
  rows: number;
  required?: boolean;
  images?: string;
}) {
  const [problems, setProblems] = useState(() => textProblems(defaultValue));
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function insert(file: File | undefined) {
    const el = area.current;
    if (!file || !el || !images) return;
    const at = el.selectionStart ?? el.value.length;
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("file", await shrinkImage(file, 2000));
      form.set("folder", images);
      const res = await uploadImage(form);
      if (!res.ok) {
        setUploadError(res.error);
        return;
      }
      // The image is its own paragraph: blank lines before and after.
      const before = el.value.slice(0, at).replace(/\s*$/, "");
      const after = el.value.slice(at).replace(/^\s*/, "");
      const line = `![Caption](${res.url})`;
      el.value = [before, line, after].filter(Boolean).join("\n\n");
      const start = (before ? before.length + 2 : 0) + 2; // select "Caption" so typing replaces it
      el.focus();
      el.setSelectionRange(start, start + "Caption".length);
      setProblems(textProblems(el.value));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The upload didn’t go through.");
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <>
      <textarea
        ref={area}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        required={required}
        onChange={(e) => setProblems(textProblems(e.target.value))}
      />
      {images && (
        <span className={a.imageButtons}>
          <button
            type="button"
            className={a.secondary}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              picker.current?.click();
            }}
          >
            {busy ? "Uploading image…" : "Insert image at cursor"}
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => insert(e.target.files?.[0])}
          />
        </span>
      )}
      {uploadError && (
        <span className={a.error} role="alert">
          {uploadError}
        </span>
      )}
      {problems.length > 0 && (
        <div className={a.warn} role="status">
          <p>Check this text before saving:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
