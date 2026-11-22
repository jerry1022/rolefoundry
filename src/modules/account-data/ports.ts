import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type { AccountExport, AccountExportPage, ExportPayload, ExportAccess } from "./model";
export interface AccountDataAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): void | Promise<void>;
}
export interface AccountExportRepository {
  request(key: string): Promise<AccountExport>;
  remove(id: string): Promise<AccountExport>;
  list(cursor?: string): Promise<AccountExportPage>;
  access(id: string): Promise<ExportAccess>;
}
export interface AccountExportExecutionStore {
  load(lease: TaskLease): Promise<ExportPayload>;
  prepare(lease: TaskLease): Promise<string>;
  publish(lease: TaskLease, key: string, sha256: string, bytes: number): Promise<void>;
}
export interface AccountArchiveStorage {
  source(key: string, signal: AbortSignal): Promise<Uint8Array>;
  get(key: string, signal: AbortSignal): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  remove(keys: string[], signal: AbortSignal): Promise<void>;
}
export interface AccountArchiveBuilder {
  build(
    payload: ExportPayload,
    source: (key: string) => Promise<Uint8Array>,
    signal: AbortSignal,
  ): Promise<{ bytes: Uint8Array; sha256: string }>;
  verify(bytes: Uint8Array, sha256: string): boolean;
}
export interface AccountExportCleanupStore {
  claim(): Promise<{ id: string; key: string; token: string }[]>;
  acknowledge(id: string, token: string): Promise<void>;
}
export interface AccountDataClient {
  request(key: string): Promise<AccountExport>;
  remove(id: string): Promise<AccountExport>;
  list(cursor?: string): Promise<AccountExportPage>;
  download(id: string): Promise<Uint8Array>;
}
