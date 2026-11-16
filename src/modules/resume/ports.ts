import type {
  ConfirmedResume,
  ExtractedResume,
  ResumeMedia,
  ResumeRevisionInput,
  ResumeRevisionOutput,
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

/** Load/publish adapters must recheck owner, immutable source versions and task lease. */
export interface ResumeParseStore {
  load(
    lease: import("../tasks/model").TaskLease,
    signal: AbortSignal,
  ): Promise<{ mediaType: ResumeMedia; byteCount: number; bytes: Uint8Array }>;
  publish(
    lease: import("../tasks/model").TaskLease,
    draft: ExtractedResume,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface ResumeRevisionStore {
  load(
    lease: import("../tasks/model").TaskLease,
    signal: AbortSignal,
  ): Promise<ResumeRevisionInput>;
  publish(
    lease: import("../tasks/model").TaskLease,
    proposal: ResumeRevisionOutput,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface ResumeExportStore {
  load(
    lease: import("../tasks/model").TaskLease,
    signal: AbortSignal,
  ): Promise<import("./model").ResumeVersion>;
  publish(
    lease: import("../tasks/model").TaskLease,
    bytes: Uint8Array,
    signal: AbortSignal,
  ): Promise<void>;
}
