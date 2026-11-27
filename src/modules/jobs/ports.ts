import type { Actor } from "../identity/core";
import type { JobQuery, CatalogPage, PublishedJob, BookmarkPage, JobDraft } from "./model";
import type { z } from "zod";
import type { sourcePolicySchema, sourceLinkSchema } from "./model";
export interface CatalogRepository {
  list(query: JobQuery): Promise<CatalogPage>;
  find(id: string): Promise<PublishedJob>;
}
export interface BookmarkRepository {
  list(query: { limit: number; cursor?: string }): Promise<BookmarkPage>;
  save(jobId: string): Promise<{ revision: number }>;
  remove(jobId: string): Promise<{ revision: number }>;
}
export interface CatalogAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface CatalogAdminRepository {
  source(input: z.infer<typeof sourcePolicySchema>): Promise<{ id: string }>;
  sourceStatus(id: string, status: "active" | "revoked"): Promise<void>;
  create(input: {
    job: JobDraft;
    source: z.infer<typeof sourceLinkSchema>;
  }): Promise<{ id: string; revision: number }>;
  revise(
    id: string,
    expectedRevision: number,
    job: JobDraft,
  ): Promise<{ id: string; revision: number }>;
  link(id: string, source: z.infer<typeof sourceLinkSchema>): Promise<void>;
  transition(
    id: string,
    expectedRevision: number,
    status: "draft" | "review" | "published" | "expired" | "rejected",
  ): Promise<{ id: string; revision: number }>;
  observe(
    id: string,
    event: "confirmed_active" | "confirmed_closed" | "network_failure",
  ): Promise<void>;
}
export interface CatalogClient {
  list(query: JobQuery, signal?: AbortSignal): Promise<CatalogPage>;
  find(id: string): Promise<PublishedJob>;
}
export interface BookmarkClient extends BookmarkRepository {}
