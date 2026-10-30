// Spot text that will read badly on the site, so the admin can fix it before
// saving. Used live under chapter text boxes in /admin.

// A Gujarati vowel sign or other combining mark must follow a letter. Text
// copied out of a PDF often stores "િ" before its consonant (visual order),
// or leaves a mark stranded after a space; browsers then draw a dotted circle.
const MISPLACED_I = /(^|[^ક-હ઼])િ/gm;
const STRANDED_MARK = /(^|\s)[ઁ-ઃ઼-ાી-્]/gm; // "િ" is counted above

export function textProblems(text: string): string[] {
  const problems: string[] = [];
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return problems;

  const broken = (body.match(MISPLACED_I)?.length ?? 0) + (body.match(STRANDED_MARK)?.length ?? 0);
  if (broken > 0) {
    problems.push(
      `${broken} Gujarati letter${broken === 1 ? " looks" : "s look"} out of order (e.g. “િ” before its letter). ` +
        "This usually happens when text is copied from a PDF. Paste from the original Word or Google Doc instead.",
    );
  }

  if (/!\[[^\]]*\]\(\S+\)|media\.jambuch\.in\//.test(body)) {
    problems.push(
      "There is a picture link in the text. Pictures inside the text aren’t shown; " +
        "upload it in “Chapter picture” instead, and remove the link line from the text.",
    );
  }

  const lineBreaks = body.match(/\n/g)?.length ?? 0;
  if (lineBreaks >= 3 && !/\n\s*\n/.test(body)) {
    problems.push(
      "There are no blank lines between paragraphs, so every line break will show on the site. " +
        "Leave one empty line between paragraphs.",
    );
  }

  return problems;
}
