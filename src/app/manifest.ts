import type { MetadataRoute } from "next";

// Makes jambuch.in installable: from the home-screen icon it opens straight
// at the chapter the reader was on (/continue).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "jambuch",
    short_name: "jambuch",
    description: "Jaydeep Buch's translations into Gujarati, to read anywhere, one tap from your home screen.",
    lang: "gu",
    start_url: "/continue",
    scope: "/",
    display: "standalone",
    theme_color: "#1E5C57",
    background_color: "#F5F3EE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
