import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkPolicySchema, linkResultSchema, linkTargetSchema, linkAdminSchema } from "../model";
import type { CourseLinkStore } from "../ports";
import { safeDatabaseError } from "../../platform/database-errors";
export class SupabaseCourseLinkStore implements CourseLinkStore {
  constructor(private readonly client: SupabaseClient) {}
  async claim(policy: Parameters<CourseLinkStore["claim"]>[0], signal: AbortSignal) {
    const input = linkPolicySchema.parse(policy);
    const { data, error } = await this.client
      .rpc("course_links_claim", { p_source: input.sourceId, p_hosts: input.allowedHosts })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (error) throw Error("Course link claim is unavailable");
    return data === null ? null : linkTargetSchema.parse(data);
  }
  async complete(
    target: Parameters<CourseLinkStore["complete"]>[0],
    result: Parameters<CourseLinkStore["complete"]>[1],
    signal: AbortSignal,
  ) {
    const lease = linkTargetSchema.parse(target),
      input = linkResultSchema.parse(result);
    const { data, error } = await this.client
      .rpc("course_links_complete", {
        p_course: lease.id,
        p_lease: lease.lease,
        p_reason: input.reason,
        p_status: input.httpStatus,
        p_not_before: input.notBefore,
        p_manual: input.manualPause,
      })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (error || typeof data !== "boolean") throw Error("Course link completion is unavailable");
    return data;
  }
}
export class SupabaseCourseLinkAdmin {
  constructor(private readonly client: SupabaseClient) {}
  async list(query: { cursor?: string; hostCursor?: string }) {
    const { data, error } = await this.client.rpc("course_links_admin", {
      p_after: query.cursor ?? null,
      p_host_after: query.hostCursor ?? null,
    });
    if (error) throw safeDatabaseError(error);
    return linkAdminSchema.parse(data);
  }
  async resume(input: { host: string; expectedRevision: number; reason: string }) {
    const { error } = await this.client.rpc("course_links_resume", {
      p_host: input.host,
      p_expected: input.expectedRevision,
      p_reason: input.reason,
    });
    if (error) throw safeDatabaseError(error);
  }
}
