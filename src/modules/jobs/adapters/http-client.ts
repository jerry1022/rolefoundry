import { z } from "zod";
import { createBrowserTransport } from "../../platform/browser-http";
import { catalogPageSchema, publishedJobSchema, bookmarkPageSchema } from "../model";
import type { CatalogClient, BookmarkClient } from "../ports";
function params(input: Record<string, unknown>) {
  return new URLSearchParams(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}
export function createCatalogClient(fetcher: typeof fetch = fetch): CatalogClient {
  const request = createBrowserTransport(fetcher);
  return {
    list: async (query, signal) =>
      catalogPageSchema.parse(await request(`jobs?${params(query)}`, { signal })),
    find: async (id) =>
      publishedJobSchema.parse((await request(`jobs/${encodeURIComponent(id)}`)).data),
  };
}
export function createBookmarkClient(fetcher: typeof fetch = fetch): BookmarkClient {
  const request = createBrowserTransport(fetcher);
  const result = z.object({ revision: z.number().int().nonnegative() });
  return {
    list: async (query) => bookmarkPageSchema.parse(await request(`bookmarks?${params(query)}`)),
    save: async (id) =>
      result.parse(
        (await request(`bookmarks/${encodeURIComponent(id)}`, { method: "PUT", body: {} })).data,
      ),
    remove: async (id) =>
      result.parse(
        (await request(`bookmarks/${encodeURIComponent(id)}`, { method: "DELETE", body: {} })).data,
      ),
  };
}
