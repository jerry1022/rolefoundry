import type { NextConfig } from "next";
const exporting = process.env.STATIC_EXPORT === "1";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
  ...(exporting ? { output: "export" } : { output: "standalone" }),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default config;
