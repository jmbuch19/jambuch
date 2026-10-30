import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Admin image uploads go through a server action. Photos are shrunk in the
    // browser first, so this only needs headroom (Vercel's own cap is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
