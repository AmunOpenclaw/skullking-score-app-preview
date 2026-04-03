import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isProd ? "/skullking-score-app-preview" : "",
  assetPrefix: isProd ? "/skullking-score-app-preview/" : undefined,
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
