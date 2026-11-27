import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
import {
  bookmarkPageSchema,
  bookmarkSchema,
  catalogPageSchema,
  publishedJobSchema,
} from "../model";
import { careerPathIds } from "../specializations";
import type { CatalogRepository, BookmarkRepository, CatalogAdminRepository } from "../ports";
const revision = z.number().int().nonnegative();
async function rpc(client: SupabaseClient, name: string, input?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, input);
  if (error) throw safeDatabaseError(error);
  return data;
}
function decode<T>(schema: z.ZodType<T>, cursor: string): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The page cursor is invalid.");
  }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly client: SupabaseClient) {}
  async list(query: Parameters<CatalogRepository["list"]>[0]) {
    const { limit, cursor, ...filters } = query;
    const filterKey = JSON.stringify(filters);
    const position = cursor
      ? decode(z.object({ after: z.uuid(), revision, filterKey: z.string() }).strict(), cursor)
      : null;
    if (position && position.filterKey !== filterKey)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "Use the page cursor with its original filters.",
      );
    const result = z
      .object({
        data: z.array(publishedJobSchema),
        lastId: z.uuid().nullable(),
        revision,
        counts: z.record(z.string(), z.number().int().nonnegative()),
      })
      .parse(
        await rpc(this.client, "catalog_search_jobs", {
          p_filters: filters,
          p_after: position?.after || null,
          p_revision: position?.revision ?? null,
          p_limit: limit,
        }),
      );
    return catalogPageSchema.parse({
      data: result.data,
      nextCursor: result.lastId
        ? encode({ after: result.lastId, revision: result.revision, filterKey })
        : null,
      revision: result.revision,
      recipe: "lexical-v1",
      appliedFilters: filters,
      counts: { ...Object.fromEntries(careerPathIds.map((id) => [id, 0])), ...result.counts },
    });
  }
  async find(id: string) {
    return publishedJobSchema.parse(await rpc(this.client, "catalog_find_job", { p_id: id }));
  }
}
export class SupabaseBookmarkRepository implements BookmarkRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly ownerId: string,
  ) {}
  async list(query: Parameters<BookmarkRepository["list"]>[0]) {
    const position = query.cursor
      ? decode(z.object({ after: z.uuid(), revision, ownerId: z.uuid() }).strict(), query.cursor)
      : null;
    if (position && position.ownerId !== this.ownerId)
      throw new ApplicationError(
        "RF_INVALID_INPUT",
        400,
        "The bookmark cursor belongs to another session.",
      );
    const result = z
      .object({ data: z.array(bookmarkSchema), lastId: z.uuid().nullable(), revision })
      .parse(
        await rpc(this.client, "catalog_list_bookmarks", {
          p_after: position?.after || null,
          p_revision: position?.revision ?? null,
          p_limit: query.limit,
        }),
      );
    return bookmarkPageSchema.parse({
      data: result.data,
      nextCursor: result.lastId
        ? encode({ after: result.lastId, revision: result.revision, ownerId: this.ownerId })
        : null,
      revision: result.revision,
    });
  }
  async save(id: string) {
    return z
      .object({ revision })
      .parse(await rpc(this.client, "catalog_save_bookmark", { p_job: id }));
  }
  async remove(id: string) {
    return z
      .object({ revision })
      .parse(await rpc(this.client, "catalog_remove_bookmark", { p_job: id }));
  }
}
export class SupabaseCatalogAdminRepository implements CatalogAdminRepository {
  constructor(private readonly client: SupabaseClient) {}
  async source(input: Parameters<CatalogAdminRepository["source"]>[0]) {
    return z
      .object({ id: z.uuid() })
      .parse(await rpc(this.client, "catalog_source_create", { p_data: input }));
  }
  async sourceStatus(id: string, status: Parameters<CatalogAdminRepository["sourceStatus"]>[1]) {
    await rpc(this.client, "catalog_source_status", { p_id: id, p_status: status });
  }
  async create(input: Parameters<CatalogAdminRepository["create"]>[0]) {
    return z.object({ id: z.uuid(), revision }).parse(
      await rpc(this.client, "catalog_create_job", {
        p_data: input.job,
        p_source: input.source.sourceId,
        p_external: input.source.externalId,
        p_url: input.source.url,
      }),
    );
  }
  async revise(
    id: string,
    expectedRevision: number,
    job: Parameters<CatalogAdminRepository["revise"]>[2],
  ) {
    return z.object({ id: z.uuid(), revision }).parse(
      await rpc(this.client, "catalog_revise_job", {
        p_id: id,
        p_expected: expectedRevision,
        p_data: job,
      }),
    );
  }
  async link(id: string, source: Parameters<CatalogAdminRepository["link"]>[1]) {
    await rpc(this.client, "catalog_link_source", {
      p_job: id,
      p_source: source.sourceId,
      p_external: source.externalId,
      p_url: source.url,
    });
  }
  async transition(
    id: string,
    expectedRevision: number,
    status: Parameters<CatalogAdminRepository["transition"]>[2],
  ) {
    return z.object({ id: z.uuid(), revision }).parse(
      await rpc(this.client, "catalog_transition_job", {
        p_id: id,
        p_expected: expectedRevision,
        p_status: status,
      }),
    );
  }
  async observe(id: string, event: Parameters<CatalogAdminRepository["observe"]>[1]) {
    await rpc(this.client, "catalog_observe_source", { p_id: id, p_event: event });
  }
  async translate(id: string, input: Parameters<CatalogAdminRepository["translate"]>[1]) {
    const { versionId, locale, ...text } = input;
    await rpc(this.client, "catalog_put_translation", {
      p_job: id,
      p_version: versionId,
      p_locale: locale,
      p_data: text,
    });
  }
  async removeTranslation(
    id: string,
    input: Parameters<CatalogAdminRepository["removeTranslation"]>[1],
  ) {
    await rpc(this.client, "catalog_remove_translation", {
      p_job: id,
      p_version: input.versionId,
      p_locale: input.locale,
    });
  }
}
