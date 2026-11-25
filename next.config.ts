import type { NextConfig } from "next";

// vartavishva.in (the YouTube channel's own domain) is served by this same site:
// its home page shows /vartavishva. The old address jambuch.in/vartavishva
// forwards there (only on jambuch.in itself, so Vercel preview links still show
// the page; /vartavishva/logo.png etc. are not affected).
const VARTAVISHVA_HOSTS = ["vartavishva.in", "www.vartavishva.in"];

const nextConfig: NextConfig = {
  experimental: {
    // Admin image uploads go through a server action. Photos are shrunk in the
    // browser first, so this only needs headroom (Vercel's own cap is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Creator's Space samples are mixed with FFmpeg inside the admin request page's
  // function: keep the package unbundled (it finds its binary next to itself) and ship
  // the binary with that route only.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/admin/creators/[id]": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/creators/sample-job": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async redirects() {
    return [
      {
        source: "/vartavishva",
        has: [{ type: "host" as const, value: "(www\\.)?jambuch\\.in" }],
        destination: "https://vartavishva.in/",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: VARTAVISHVA_HOSTS.map((host) => ({
        source: "/",
        has: [{ type: "host" as const, value: host }],
        destination: "/vartavishva",
      })),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
