import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Analytics from "./analytics";
import { EARLY_PROMPT_SCRIPT } from "./install/install-state";
import Pwa from "./pwa";
import "./globals.css";

// The fonts live in ./fonts (the same WOFF2 files Google Fonts serves, all
// variable 400–600). Fetching them from Google at build time failed Vercel
// builds again and again, so the site keeps its own copies.
const newsreader = localFont({
  src: [
    { path: "./fonts/newsreader-latin.woff2", weight: "400 600", style: "normal" },
    { path: "./fonts/newsreader-latin-italic.woff2", weight: "400 600", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const plex = localFont({
  src: "./fonts/plex-sans-latin.woff2",
  weight: "400 600",
  variable: "--font-plex",
  display: "swap",
});

// Noto Serif Gujarati comes as two files: the Gujarati letters, and its own
// Latin letters for numbers and punctuation inside Gujarati text.
const gujarati = localFont({
  src: "./fonts/noto-serif-gujarati.woff2",
  weight: "400 600",
  variable: "--font-noto-gujarati",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const gujaratiLatin = localFont({
  src: "./fonts/noto-serif-gujarati-latin.woff2",
  weight: "400 600",
  variable: "--font-noto-gujarati-latin",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jambuch.in"),
  title: "Jaydeep Buch",
  description:
    "I carry world literature into Gujarati, guide students toward study abroad, and build software for the causes I care about. From Ahmedabad.",
  // Added to an iPhone's home screen, it opens full screen like an app.
  appleWebApp: { capable: true, title: "jambuch", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F5F3EE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plex.variable} ${gujarati.variable} ${gujaratiLatin.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: EARLY_PROMPT_SCRIPT }} />
        {children}
        <Analytics />
        <Pwa />
      </body>
    </html>
  );
}
