// Shared by the reading bar (client) and the no-flash script (server).
// Gujarati body text starts at 20px on every screen; each step is a clear jump
// for older eyes, and the text re-wraps to the screen at every size.
export const READER_SIZES = [18, 20, 23, 26, 30, 34];
export const READER_DEFAULT_SIZE = 20;
// From this size on, justified lines on a phone leave big gaps between words,
// so the text lines up on the left instead (see .text in library.module.css).
export const READER_LARGE_FROM = 26;
export const READER_THEMES = ["paper", "white", "sepia", "night"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

// Line spacing. Gujarati vowel signs sit above and below the letters, so even
// "compact" leaves room for them not to touch the next line.
export const READER_SPACINGS = { compact: 1.65, normal: 1.9, wide: 2.2 } as const;
export type ReaderSpacing = keyof typeof READER_SPACINGS;

// Runs while the page is still loading, before the text is painted, so a
// reader who chose Night, big letters or bold never sees the page jump.
export const READER_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("reader-theme"),s=Number(localStorage.getItem("reader-font-size")),l=${JSON.stringify(
  READER_SPACINGS,
)}[localStorage.getItem("reader-spacing")];if(${JSON.stringify(
  READER_THEMES.filter((t) => t !== "paper"),
)}.indexOf(t)>-1)d.dataset.readerTheme=t;if(${JSON.stringify(READER_SIZES)}.indexOf(s)>-1){d.style.setProperty("--reader-size",s+"px");if(s>=${READER_LARGE_FROM})d.dataset.readerLarge=""}if(l)d.style.setProperty("--reader-leading",String(l));if(localStorage.getItem("reader-bold")==="1")d.dataset.readerBold=""}catch(e){}})()`;
