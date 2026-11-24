import type { NextConfig } from "next";

// vartavishva.in (the YouTube channel's own domain) is served by this same site:
// its home page shows /vartavishva. Until the domain points at Vercel nothing
// arrives with that host, so this is inert. Once it does, also turn on the
// jambuch.in/vartavishva → vartavishva.in redirect (docs/PROGRESS.md).
const VARTAVISHVA_HOSTS = ["vartavishva.in", "www.vartavishva.in"];

const nextConfig: NextConfig = {
  experimental: {
    // Admin image uploads go through a server action. Photos are shrunk in the
    // browser first, so this only needs headroom (Vercel's own cap is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
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
