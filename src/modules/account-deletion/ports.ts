import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type {
  DeletionStatus,
  DeletionReceipt,
  DeletionSubject,
  DeletionFile,
  ResumeReason,
} from "./model";
export interface DeletionAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): void | Promise<void>;
}
export interface DeletionRepository {
  request(input: DeletionReceipt & { confirmation: "DELETE" }): Promise<DeletionStatus>;
  status(receipt: DeletionReceipt): Promise<DeletionStatus>;
  resume(id: string, reason: ResumeReason): Promise<DeletionStatus>;
  find(taskId: string): Promise<DeletionStatus>;
}
export interface DeletionExecutionStore {
  load(lease: TaskLease): Promise<DeletionSubject>;
  files(lease: TaskLease): Promise<DeletionFile[]>;
  beginAuth(lease: TaskLease): Promise<boolean>;
  defer(lease: TaskLease, seconds: number): Promise<void>;
  finish(lease: TaskLease): Promise<void>;
}
export interface DeletionDirectory {
  block(subjectId: string, signal: AbortSignal): Promise<void>;
  remove(subjectId: string, signal: AbortSignal): Promise<void>;
}
export interface DeletionFiles {
  remove(subjectId: string, files: DeletionFile[], signal: AbortSignal): Promise<void>;
}
export interface DeletionClient {
  request(input: DeletionReceipt & { confirmation: "DELETE" }): Promise<DeletionStatus>;
  status(receipt: DeletionReceipt): Promise<DeletionStatus>;
}
export interface DeletionAdminClient {
  resume(id: string, reason: ResumeReason): Promise<DeletionStatus>;
  find(taskId: string): Promise<DeletionStatus>;
}

export interface LateDeletionStore {
  pending(): Promise<{ subjectId: string; files: DeletionFile[] }[]>;
}
