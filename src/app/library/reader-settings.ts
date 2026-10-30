// Shared by the reader panel (client) and the no-flash script (server).
export const READER_SIZES = [16, 18, 20, 22, 24, 26, 28];
export const READER_THEMES = ["paper", "white", "sepia", "night"] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];

// Runs while the page is still loading, before the text is painted, so a
// reader who chose Night never sees a flash of the light page.
export const READER_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("reader-theme"),s=Number(localStorage.getItem("reader-font-size"));if(${JSON.stringify(
  READER_THEMES.filter((t) => t !== "paper"),
)}.indexOf(t)>-1)d.dataset.readerTheme=t;if(${JSON.stringify(READER_SIZES)}.indexOf(s)>-1)d.style.setProperty("--reader-size",s+"px")}catch(e){}})()`;
