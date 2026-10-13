import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate build directories allow isolated database/browser regression checks.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
