import "server-only";

// Story upload (docs/CREATORS_QUESTION_FLOW.md §3, 1.1): .docx / .txt / .pdf → plain text.
// Unicode text only. PDFs made from Gujarati or Hindi fonts often extract as broken
// letters; looksBroken() catches the common cases so we can ask for a Word or text file.

export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export type Extracted = { text: string } | { error: "type" | "size" | "empty" | "broken_pdf" | "failed" };

export async function extractText(file: File): Promise<Extracted> {
  if (file.size > UPLOAD_MAX_BYTES) return { error: "size" };
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    if (name.endsWith(".txt")) return nonEmpty(new TextDecoder("utf-8").decode(buf));
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return nonEmpty(value);
    }
    if (name.endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: true });
      const out = Array.isArray(text) ? text.join("\n\n") : text;
      if (looksBroken(out)) return { error: "broken_pdf" };
      return nonEmpty(out);
    }
    return { error: "type" };
  } catch (e) {
    console.error("creators: story upload not read:", e instanceof Error ? e.message : e);
    return { error: "failed" };
  }
}

function nonEmpty(s: string): Extracted {
  const text = s.replace(/\r\n?/g, "\n").trim();
  return text.length ? { text } : { error: "empty" };
}

// Broken PDF text: replacement characters, private-use glyphs (legacy Gujarati fonts such
// as Shruti-less "Terafont" map letters into Latin or private-use code points), or a
// story that should be Indic but is almost all stray Latin punctuation.
export function looksBroken(s: string) {
  if (!s.trim()) return true;
  const total = s.replace(/\s/g, "").length || 1;
  const bad = (s.match(/[�-]/g) ?? []).length;
  if (bad / total > 0.02) return true;
  const odd = (s.match(/[ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g) ?? []).length;
  return odd / total > 0.1;
}

// Which script is the story mostly written in? Code, not AI (no cost before screening).
export function detectLanguage(s: string): "gu" | "hi" | "en" {
  let gu = 0;
  let hi = 0;
  let latin = 0;
  for (const ch of s.slice(0, 20000)) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0a80 && c <= 0x0aff) gu++;
    else if (c >= 0x0900 && c <= 0x097f) hi++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  if (gu >= hi && gu >= latin && gu > 0) return "gu";
  if (hi >= latin && hi > 0) return "hi";
  return "en";
}
