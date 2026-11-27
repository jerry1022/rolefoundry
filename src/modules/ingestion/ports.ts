import type { SourcePolicy } from "../jobs/model";
import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type {
  ImportKind,
  ImportFormat,
  ImportSource,
  SanitizedImport,
  ImportContext,
  ImportOutput,
  ImportSetting,
  ImportBatch,
  ImportBatchSummary,
} from "./model";
export interface ApprovedFeed {
  readonly id: string;
  readonly kind: ImportKind;
  readonly format: ImportFormat;
  readonly url: string;
  readonly allowedHosts: readonly string[];
  readonly revision: string;
}
/** Deployment-owned definitions, never an administrator supplied worker URL. */
export interface FeedRegistry {
  list(): readonly ApprovedFeed[];
  find(id: string, kind: ImportKind): ApprovedFeed | null;
}
export interface FeedReader {
  read(feed: ApprovedFeed, signal: AbortSignal): Promise<string>;
}
export interface ImportAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface ImportSubmissionStore {
  source(id: string): Promise<ImportSource>;
  submit(
    input: {
      sourceId: string;
      batchId: string;
      sourceFingerprint: string;
      content: SanitizedImport;
      rawHash: string;
    },
    key: string,
  ): Promise<{ id: string; taskId: string; status: string }>;
}
export interface ImportExecutionStore {
  load(
    lease: TaskLease,
    signal: AbortSignal,
  ): Promise<{ content: SanitizedImport; context: ImportContext }>;
  publish(lease: TaskLease, output: ImportOutput, signal: AbortSignal): Promise<void>;
}
export interface ImportAdministrationStore {
  settings(): Promise<ImportSetting[]>;
  configure(
    id: string,
    expectedRevision: number,
    uploadsEnabled: boolean,
    allowClosure: boolean,
  ): Promise<ImportSource>;
  find(id: string): Promise<ImportBatch>;
  list(cursor?: string): Promise<{ data: ImportBatchSummary[]; nextCursor: string | null }>;
}

export interface ImportDigest {
  sha256(text: string): string;
}
export interface ImportReviewStore {
  review(id: string): Promise<import("./model").ImportReview>;
  prepareReview(
    id: string,
    expectedRevision: number,
    targetId: string | null,
  ): Promise<import("./model").ImportReviewPreparation>;
  rebase(
    id: string,
    expectedRevision: number,
    targetId: string | null,
    sourceFingerprint: string,
    dictionaryVersion: number,
    normalized: import("./model").NormalizedRow,
  ): Promise<import("./model").ImportReview>;
  decide(
    id: string,
    expectedRevision: number,
    decision: "publish" | "reject" | "close" | "confirm",
    draft: Record<string, unknown> | null,
    reason: string,
    allowNewDuplicate: boolean,
    key: string,
  ): Promise<import("./model").ImportReceipt>;
}

/** UI-owned operations; no persistence or privileged transport is exposed. */
export interface ImportAdminClient {
  registerJobSource(input: SourcePolicy): Promise<{ id: string }>;
  settings(): Promise<ImportSetting[]>;
  configure(
    id: string,
    input: { expectedRevision: number; uploadsEnabled: boolean; allowClosure: boolean },
  ): Promise<ImportSource>;
  submit(
    input: { sourceId: string; batchId: string; format: ImportFormat; content: string },
    key: string,
  ): Promise<import("./model").ImportTaskReply>;
  list(cursor?: string): Promise<{ data: ImportBatchSummary[]; nextCursor: string | null }>;
  find(id: string): Promise<ImportBatch>;
  review(id: string): Promise<import("./model").ImportReview>;
  rebase(
    id: string,
    input: { expectedRevision: number; targetId: string | null },
  ): Promise<import("./model").ImportReview>;
  decide(
    id: string,
    input: {
      expectedRevision: number;
      decision: "publish" | "reject" | "close" | "confirm";
      draft: Record<string, unknown> | null;
      reason: string;
      allowNewDuplicate: boolean;
    },
    key: string,
  ): Promise<import("./model").ImportReceipt>;
}

export interface FeedAdministrationStore {
  source(id: string): Promise<ImportSource>;
  feedSettings(): Promise<import("./model").FeedSetting[]>;
  configureFeed(
    id: string,
    input: import("./model").FeedConfiguration,
    revision: string,
  ): Promise<import("./model").FeedSetting>;
  requestFeed(id: string, key: string): Promise<import("./model").FeedRun>;
  feedRun(id: string): Promise<import("./model").FeedRun>;
  feedRuns(): Promise<import("./model").FeedRun[]>;
}
export interface FeedExecutionStore {
  load(
    lease: TaskLease,
    signal: AbortSignal,
  ): Promise<{ source: ImportSource; feedId: string; feedRevision: string; waitSeconds: number }>;
  prepare(
    lease: TaskLease,
    content: SanitizedImport,
    rawHash: string,
    signal: AbortSignal,
  ): Promise<string>;
  failure(
    lease: TaskLease,
    code: string,
    providerWait: string | null,
    manual: boolean,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface FeedScheduleStore {
  due(
    definitions: readonly import("./model").ApprovedFeedOption[],
    signal: AbortSignal,
  ): Promise<number>;
}
export interface FeedAdminClient {
  settings(): Promise<{
    settings: import("./model").FeedSetting[];
    definitions: import("./model").ApprovedFeedOption[];
  }>;
  configure(
    id: string,
    input: import("./model").FeedConfiguration,
  ): Promise<import("./model").FeedSetting>;
  request(id: string, key: string): Promise<import("./model").FeedRun>;
  find(id: string): Promise<import("./model").FeedRun>;
  list(): Promise<import("./model").FeedRun[]>;
}
