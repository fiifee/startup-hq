import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and live (founders and their AIs edit concurrently),
  // so pages render dynamically instead of from prerendered shells.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
