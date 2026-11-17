import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type {
  ImportKind,
  ImportFormat,
  ImportSource,
  SanitizedImport,
  ImportContext,
  ImportOutput,
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
