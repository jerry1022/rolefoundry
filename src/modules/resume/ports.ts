import type { WordingContext, WordingRecord } from "./wording";
import type { Actor } from "../identity/core";
import type { TaskLease } from "../tasks/model";
import type {
  ConfirmedResume,
  ExtractedResume,
  ResumeMedia,
  ResumeRevisionInput,
  ResumeRevisionOutput,
  ResumeVersion,
  ResumeParseSource,
  ProcessingCode,
  ResumeDocument,
  ResumeProposal,
  ResumeUploadInput,
  ResumeUploadAuthority,
  ResumeHistory,
  ResumeTaskReply,
  ResumeTaskReference,
  ResumeDownloadAuthority,
  ResumeDeletion,
} from "./model";
export interface ResumeParser {
  parse(bytes: Uint8Array, mediaType: ResumeMedia, signal: AbortSignal): Promise<ExtractedResume>;
}
export interface ResumeRenderer {
  render(content: ConfirmedResume, signal: AbortSignal): Promise<Uint8Array>;
}
export interface ResumeReviser {
  propose(input: ResumeRevisionInput, signal: AbortSignal): Promise<ResumeRevisionOutput>;
}
/** These adapters recheck active ownership, immutable inputs and task lease at load/publication. */
export interface ResumeParseStore {
  load(lease: TaskLease, signal: AbortSignal): Promise<ResumeParseSource>;
  publish(lease: TaskLease, draft: ExtractedResume, signal: AbortSignal): Promise<void>;
  failed(lease: TaskLease, code: ProcessingCode, signal: AbortSignal): Promise<void>;
}
/** Optional wording stage: reservation context and atomic publication with suggestions. */
export interface ResumeWordingStore {
  wordingContext(lease: TaskLease, signal: AbortSignal): Promise<WordingContext | null>;
  publishWorded(
    lease: TaskLease,
    proposal: ResumeRevisionOutput,
    wording: WordingRecord,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface ResumeRevisionStore {
  load(lease: TaskLease, signal: AbortSignal): Promise<ResumeRevisionInput>;
  publish(lease: TaskLease, proposal: ResumeRevisionOutput, signal: AbortSignal): Promise<void>;
}
export interface ResumeExportStore {
  load(lease: TaskLease, signal: AbortSignal): Promise<ResumeVersion>;
  publish(lease: TaskLease, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  failed(lease: TaskLease, code: ProcessingCode, signal: AbortSignal): Promise<void>;
}
export interface ResumeRepository {
  list(cursor?: string): Promise<ResumeHistory>;
  find(id: string): Promise<ResumeDocument>;
  version(id: string): Promise<ResumeVersion>;
  intent(input: ResumeUploadInput, key: string): Promise<ResumeUploadAuthority>;
  beginUpload(
    id: string,
    token: string,
    sha256: string,
    byteCount: number,
  ): Promise<{
    alreadyUploaded: boolean;
    key: string;
    claim: string | null;
    mediaType: ResumeMedia;
  }>;
  finishUpload(id: string, claim: string, sha256: string, byteCount: number): Promise<void>;
  paste(text: string, key: string): Promise<ResumeTaskReference>;
  retryParse(id: string, previousTaskId: string, key: string): Promise<ResumeTaskReference>;
  confirm(id: string, expectedRevision: number, content: ConfirmedResume): Promise<ResumeDocument>;
  revise(
    id: string,
    versionId: string,
    jobId: string,
    expectedRevision: number,
    key: string,
  ): Promise<ResumeTaskReply>;
  proposal(id: string): Promise<ResumeProposal>;
  accept(id: string, expectedRevision: number, changeIds: string[]): Promise<ResumeDocument>;
  export(id: string, versionId: string, key: string): Promise<ResumeTaskReply>;
  downloadIntent(exportId: string): Promise<ResumeDownloadAuthority>;
  downloadAccess(
    id: string,
  ): Promise<{ key: string; sha256: string; byteCount: number; versionId: string }>;
  remove(id: string, expectedRevision: number): Promise<ResumeDeletion>;
}
export interface PrivateResumeStorage {
  put(key: string, bytes: Uint8Array, mediaType: ResumeMedia, signal: AbortSignal): Promise<void>;
  get(key: string, signal: AbortSignal): Promise<Uint8Array>;
  remove(keys: string[], signal: AbortSignal): Promise<void>;
}
export interface ResumeDigest {
  sha256(bytes: Uint8Array): string;
}
export interface ResumeAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
export interface ResumeClient extends Pick<
  ResumeRepository,
  | "list"
  | "find"
  | "version"
  | "intent"
  | "paste"
  | "retryParse"
  | "confirm"
  | "proposal"
  | "accept"
  | "export"
  | "remove"
> {
  upload(id: string, token: string, file: File): Promise<ResumeDocument>;
  /** Requests an order proposal, optionally with AI wording suggestions. */
  revise(
    id: string,
    request: { versionId: string; jobId: string; expectedRevision: number; wording?: boolean },
    key: string,
  ): Promise<ResumeTaskReply>;
  download(exportId: string): Promise<{ bytes: Uint8Array; filename: string }>;
}
/** Service-only cleanup deliberately survives deletion of the source owner. */
export interface ResumeCleanupRepository {
  claim(signal: AbortSignal): Promise<{ id: string; key: string; token: string }[]>;
  acknowledge(id: string, token: string, signal: AbortSignal): Promise<void>;
}
