import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Logo and CSV uploads
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
