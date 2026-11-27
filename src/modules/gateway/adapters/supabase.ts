import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { recipientPageSchema, type RecipientChange, type RecipientStore } from "../admin";
import type { GatewayRequest, GatewayResult } from "../model";
import type { GatewayAuthority, GatewayRecorder, ProviderBudgets, ProviderSlots } from "../ports";
import { usageReportSchema, type UsageReportStore, type UsageWindow } from "../usage";

const bounded = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(5000)]);

/** Service-role authority backed by identity tasks, consent and reviewed recipients. */
export class SupabaseGatewayAuthority implements GatewayAuthority {
  constructor(private readonly client: SupabaseClient) {}

  async admit(request: GatewayRequest, recipients: readonly string[], signal: AbortSignal) {
    const { data, error } = await this.client
      .rpc("gateway_admit", {
        p_task: request.taskId,
        p_owner: request.ownerId,
        p_purpose: request.purpose,
        p_input_version: request.inputVersion,
        p_recipients: recipients,
      })
      .abortSignal(bounded(signal));
    if (error) throw new Error("Gateway admission is unavailable.");
    if (data === null) return { admitted: true as const };
    if (typeof data !== "string" || !/^RF_[A-Z_]+$/.test(data))
      throw new Error("Gateway admission returned an invalid response.");
    return { admitted: false as const, code: data };
  }

  async stillCurrent(request: GatewayRequest, signal: AbortSignal) {
    const { data, error } = await this.client
      .rpc("gateway_current", {
        p_task: request.taskId,
        p_owner: request.ownerId,
        p_input_version: request.inputVersion,
      })
      .abortSignal(bounded(signal));
    if (error || typeof data !== "boolean") throw new Error("Gateway publication check failed.");
    return data;
  }
}

/** Stores the content-free result and attempts once per identity task. */
export class SupabaseGatewayRecorder implements GatewayRecorder {
  constructor(private readonly client: SupabaseClient) {}

  async record(result: GatewayResult<unknown>, signal: AbortSignal) {
    const { output: _content, ...metadata } = result;
    const { error } = await this.client
      .rpc("gateway_record", { p_task: result.taskId, p_result: metadata })
      .abortSignal(bounded(signal));
    if (error) throw safeDatabaseError(error);
  }
}

/** Request-scoped administrator store; every RPC re-verifies the stored admin role. */
export class SupabaseRecipientStore implements RecipientStore {
  constructor(private readonly client: SupabaseClient) {}

  async list() {
    const { data, error } = await this.client.rpc("gateway_recipients");
    if (error) throw safeDatabaseError(error);
    return recipientPageSchema.parse(data);
  }

  async approve(change: RecipientChange) {
    const { error } = await this.client.rpc("gateway_approve_recipient", {
      p_purpose: change.purpose,
      p_recipient: change.recipient,
      p_reason: change.reason,
    });
    if (error) throw safeDatabaseError(error);
  }

  async revoke(change: RecipientChange) {
    const { error } = await this.client.rpc("gateway_revoke_recipient", {
      p_purpose: change.purpose,
      p_recipient: change.recipient,
      p_reason: change.reason,
    });
    if (error) throw safeDatabaseError(error);
  }
}

/** Request-scoped administrator report; the RPC verifies the administrator itself. */
export class SupabaseUsageReportStore implements UsageReportStore {
  constructor(private readonly client: SupabaseClient) {}

  async report(windowDays: UsageWindow) {
    const { data, error } = await this.client.rpc("gateway_usage_report", { p_days: windowDays });
    if (error) throw safeDatabaseError(error);
    return usageReportSchema.parse(data);
  }
}

/** Leased provider-wide slots in PostgreSQL, shared by every worker instance. */
export class SupabaseProviderSlots implements ProviderSlots {
  constructor(private readonly client: SupabaseClient) {}
  async acquire(provider: string, limit: number, leaseSeconds: number, signal: AbortSignal) {
    const { data, error } = await this.client
      .rpc("gateway_slot_acquire", {
        p_provider: provider,
        p_limit: limit,
        p_seconds: leaseSeconds,
      })
      .abortSignal(bounded(signal));
    if (error) throw new Error("Provider slot store is unavailable.");
    return typeof data === "string" ? data : null;
  }
  async release(provider: string, token: string) {
    const { error } = await this.client
      .rpc("gateway_slot_release", { p_provider: provider, p_token: token })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("Provider slot release failed.");
  }
}

/** Rolling 24-hour provider token budgets in PostgreSQL, shared by every worker instance. */
export class SupabaseProviderBudgets implements ProviderBudgets {
  constructor(private readonly client: SupabaseClient) {}
  async reserve(provider: string, tokens: number, dailyCap: number, signal: AbortSignal) {
    const { data, error } = await this.client
      .rpc("gateway_budget_reserve", {
        p_provider: provider,
        p_tokens: tokens,
        p_daily_cap: dailyCap,
      })
      .abortSignal(bounded(signal));
    if (error) throw new Error("Provider budget store is unavailable.");
    return typeof data === "string" ? data : null;
  }
  async settle(provider: string, reservation: string, actualTokens: number) {
    const { error } = await this.client
      .rpc("gateway_budget_settle", {
        p_provider: provider,
        p_id: reservation,
        p_actual: actualTokens,
      })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("Provider budget settlement failed.");
  }
}
