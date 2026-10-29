import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Newsreader, Noto_Serif_Gujarati } from "next/font/google";
import Analytics from "./analytics";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const gujarati = Noto_Serif_Gujarati({
  variable: "--font-noto-gujarati",
  subsets: ["gujarati", "latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jambuch.in"),
  title: "Jaydeep Buch",
  description:
    "I carry world literature into Gujarati, guide students toward study abroad, and build software for the causes I care about. From Ahmedabad.",
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
    <html lang="en" className={`${newsreader.variable} ${plex.variable} ${gujarati.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
