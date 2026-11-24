import type { LinkAdminPage, LinkPolicy, LinkResult, LinkTarget } from "./model";
export interface CourseLinkClient {
  list(
    query?: { cursor?: string; hostCursor?: string },
    signal?: AbortSignal,
  ): Promise<LinkAdminPage>;
  resume(input: { host: string; expectedRevision: number; reason: string }): Promise<void>;
}
export interface CourseLinkProbe {
  check(target: Pick<LinkTarget, "url" | "allowedHosts">, signal: AbortSignal): Promise<LinkResult>;
}
export interface CourseLinkStore {
  claim(policy: LinkPolicy, signal: AbortSignal): Promise<LinkTarget | null>;
  complete(target: LinkTarget, result: LinkResult, signal: AbortSignal): Promise<boolean>;
}
