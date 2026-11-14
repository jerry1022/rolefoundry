import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertAuthorized,
  consentSchema,
  databaseError,
  featureSchema,
  IdentityError,
  policySchema,
  resolveActor,
  taskResultSchema,
  usageSchema,
  type Actor,
  type AnalysisFeature,
} from "./core";

async function rpc(client: SupabaseClient, name: string, params?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw databaseError(error);
  return data;
}
export class SupabaseIdentityService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly privileged: () => SupabaseClient,
  ) {}
  currentActor() {
    return resolveActor(this.client);
  }
  async authorize(actor: Actor, action: string, ownerId?: string) {
    assertAuthorized(actor, action, ownerId);
  }
  async policies() {
    return z.array(policySchema).parse(await rpc(this.client, "identity_policies"));
  }
  async activate() {
    await rpc(this.client, "identity_activate");
    return this.currentActor();
  }
  async consents(actor: Actor) {
    assertAuthorized(actor, "consent:read", actor.userId);
    return z.array(consentSchema).parse(await rpc(this.client, "identity_list_consents"));
  }
  async grantConsent(actor: Actor, purpose: AnalysisFeature, version: string) {
    assertAuthorized(actor, "consent:write", actor.userId);
    return rpc(this.client, "identity_grant_consent", {
      p_purpose: featureSchema.parse(purpose),
      p_policy_version: version,
    });
  }
  async revokeConsent(actor: Actor, purpose: AnalysisFeature) {
    assertAuthorized(actor, "consent:write", actor.userId);
    await rpc(this.client, "identity_revoke_consent", { p_purpose: featureSchema.parse(purpose) });
  }
  async usage(actor: Actor) {
    assertAuthorized(actor, "usage:read", actor.userId);
    return z.array(usageSchema).parse(await rpc(this.client, "identity_usage"));
  }
  async invite(actor: Actor, email: string, expiresAt: string) {
    assertAuthorized(actor, "admin:invitations");
    return rpc(this.client, "identity_create_invitation", {
      p_email: email,
      p_expires_at: expiresAt,
    });
  }
  async setQuota(actor: Actor, feature: AnalysisFeature, limit: number, effectiveFrom: string) {
    assertAuthorized(actor, "admin:quotas");
    return rpc(this.client, "identity_set_quota_policy", {
      p_feature: feature,
      p_weekly_limit: limit,
      p_effective_from: effectiveFrom,
    });
  }
  async refund(actor: Actor, taskId: string, reason: string) {
    assertAuthorized(actor, "admin:refunds");
    await rpc(this.client, "identity_refund_reservation", { p_task: taskId, p_reason: reason });
  }
  async reserveAnalysis(
    actor: Actor,
    input: {
      feature: AnalysisFeature;
      resourceId: string;
      inputVersion: string;
      idempotencyKey: string;
    },
  ) {
    assertAuthorized(actor, "task:create", actor.userId);
    const parsed = z
      .object({
        feature: featureSchema,
        resourceId: z.uuid(),
        inputVersion: z.string().min(1).max(200),
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict()
      .parse(input);
    return taskResultSchema.parse(
      await rpc(this.privileged(), "identity_reserve_analysis", {
        p_user: actor.userId,
        p_feature: parsed.feature,
        p_resource_ref: parsed.resourceId,
        p_input_version: parsed.inputVersion,
        p_idempotency_key: parsed.idempotencyKey,
      }),
    );
  }
  async task(actor: Actor, taskId: string) {
    assertAuthorized(actor, "task:read", actor.userId);
    const { data, error } = await this.client
      .from("identity_tasks")
      .select("id,status,feature,created_at,started_at,finished_at,result_ref,failure_category")
      .eq("id", z.uuid().parse(taskId))
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new IdentityError("RF_NOT_FOUND");
    return data;
  }
}

/** Used by trusted workers before provider calls and again before publication. */
export class IdentityWorkerGuard {
  constructor(private readonly client: SupabaseClient) {}
  start(taskId: string) {
    return rpc(this.client, "identity_start_task", { p_task: z.uuid().parse(taskId) });
  }
  async assertTaskAuthorized(taskId: string) {
    if (
      (await rpc(this.client, "identity_task_authorized", { p_task: z.uuid().parse(taskId) })) !==
      true
    )
      throw new IdentityError("RF_CONSENT_REQUIRED");
  }
  finish(taskId: string, resultRef: string) {
    return rpc(this.client, "identity_finish_task", {
      p_task: z.uuid().parse(taskId),
      p_result_ref: z.uuid().parse(resultRef),
    });
  }
  fail(taskId: string, category: "infrastructure" | "validation") {
    return rpc(this.client, "identity_fail_task", {
      p_task: z.uuid().parse(taskId),
      p_category: category,
    });
  }
  release(taskId: string) {
    return rpc(this.client, "identity_release_reservation", { p_task: z.uuid().parse(taskId) });
  }
}
