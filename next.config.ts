import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and live (founders and their AIs edit concurrently),
  // so pages render dynamically instead of from prerendered shells.
  cacheComponents: false,
  // Pages folded into the five main sections; old links keep working.
  async redirects() {
    return [
      { source: "/review", destination: "/", permanent: false },
      { source: "/agenda", destination: "/meetings", permanent: false },
      { source: "/weekly", destination: "/docs?kind=weekly", permanent: false },
      { source: "/notes", destination: "/docs", permanent: false },
      { source: "/drive", destination: "/docs", permanent: false },
      { source: "/goals", destination: "/brief#roadmap", permanent: false },
    ];
  },
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
