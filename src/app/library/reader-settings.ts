// Shared by the reader panel (client) and the no-flash script (server).
export const READER_SIZES = [16, 18, 20, 22, 24, 26, 28];
export const READER_THEMES = ["paper", "white", "sepia", "night"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

// Line spacing. Gujarati vowel signs sit above and below the letters, so even
// "compact" leaves room for them not to touch the next line.
export const READER_SPACINGS = { compact: 1.6, normal: 1.85, wide: 2.2 } as const;
export type ReaderSpacing = keyof typeof READER_SPACINGS;

// Runs while the page is still loading, before the text is painted, so a
// reader who chose Night never sees a flash of the light page.
export const READER_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("reader-theme"),s=Number(localStorage.getItem("reader-font-size")),l=${JSON.stringify(
  READER_SPACINGS,
)}[localStorage.getItem("reader-spacing")];if(${JSON.stringify(
  READER_THEMES.filter((t) => t !== "paper"),
)}.indexOf(t)>-1)d.dataset.readerTheme=t;if(${JSON.stringify(READER_SIZES)}.indexOf(s)>-1)d.style.setProperty("--reader-size",s+"px");if(l)d.style.setProperty("--reader-leading",String(l))}catch(e){}})()`;
