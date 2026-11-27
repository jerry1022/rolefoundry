import type { NextConfig } from "next";
const exporting = process.env.STATIC_EXPORT === "1";
const config: NextConfig = {
  // Pages/layouts use .tsx; dynamic Route Handlers use .ts and stay out of the Pages demo.
  pageExtensions: exporting ? ["tsx"] : ["tsx", "ts"],
  env: {
    NEXT_PUBLIC_CATALOG_ENABLED:
      !exporting && process.env.ROLEFOUNDRY_CATALOG_ENABLED === "true" ? "true" : "false",
    NEXT_PUBLIC_IDENTITY_ENABLED:
      !exporting && process.env.ROLEFOUNDRY_IDENTITY_ENABLED === "true" ? "true" : "false",
  },
  turbopack: { root: process.cwd() },
  devIndicators: false,
  ...(exporting ? { output: "export" } : { output: "standalone" }),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default config;
