"use client";
import { JobsScreen } from "../screens";
import { CatalogScreen } from "./catalog-screen";
import { createCatalogClient, createBookmarkClient } from "@/modules/jobs/adapters/http-client";
import type { CatalogPage } from "@/modules/jobs/model";
const catalog = createCatalogClient(),
  bookmarks = createBookmarkClient();
export function JobsWorkspace({
  initialPage,
  initialError,
}: { initialPage?: CatalogPage; initialError?: string } = {}) {
  return process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true" ? (
    <CatalogScreen
      catalog={catalog}
      bookmarks={bookmarks}
      initialPage={initialPage}
      initialError={initialError}
    />
  ) : (
    <JobsScreen />
  );
}
