import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskLease } from "../../tasks/model";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
import {
  accountExportSchema,
  accountExportPageSchema,
  exportAccessSchema,
  exportPayloadSchema,
} from "../model";
import type {
  AccountExportRepository,
  AccountExportExecutionStore,
  AccountExportCleanupStore,
} from "../ports";
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  if (error) throw safeDatabaseError(error);
  return data;
}
const cursorSchema = z
  .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export class SupabaseAccountExports implements AccountExportRepository {
  constructor(private readonly client: SupabaseClient) {}
  async request(key: string) {
    return accountExportSchema.parse(
      await rpc(this.client, "account_export_request", { p_key: key }),
    );
  }
  async list(cursor?: string) {
    let before: z.infer<typeof cursorSchema> | null = null;
    if (cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
        before = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      } catch {
        throw new ApplicationError("RF_INVALID_INPUT", 400, "The export cursor is invalid.");
      }
    }
    const raw = await rpc(this.client, "account_export_list", {
      p_before: before?.createdAt ?? null,
      p_id: before?.id ?? null,
    });
    return accountExportPageSchema.parse({
      data: raw.data,
      nextCursor: raw.next ? Buffer.from(JSON.stringify(raw.next)).toString("base64url") : null,
    });
  }
  async remove(id: string) {
    return accountExportSchema.parse(await rpc(this.client, "account_export_delete", { p_id: id }));
  }
  async access(id: string) {
    return exportAccessSchema.parse(await rpc(this.client, "account_export_access", { p_id: id }));
  }
}
const args = (lease: TaskLease) => ({ p_task: lease.taskId, p_token: lease.token });
export class SupabaseAccountExportExecution implements AccountExportExecutionStore {
  constructor(private readonly client: SupabaseClient) {}
  async load(lease: TaskLease) {
    return exportPayloadSchema.parse(await rpc(this.client, "account_export_load", args(lease)));
  }
  async prepare(lease: TaskLease) {
    return z.string().parse(await rpc(this.client, "account_export_prepare", args(lease)));
  }
  async publish(lease: TaskLease, key: string, sha256: string, bytes: number) {
    await rpc(this.client, "account_export_publish", {
      ...args(lease),
      p_key: key,
      p_sha256: sha256,
      p_bytes: bytes,
    });
  }
}
export class SupabaseAccountExportCleanup implements AccountExportCleanupStore {
  constructor(private readonly client: SupabaseClient) {}
  async claim() {
    return z
      .array(z.object({ id: z.uuid(), key: z.string(), token: z.uuid() }))
      .max(10)
      .parse(await rpc(this.client, "account_export_cleanup_claim"));
  }
  async acknowledge(id: string, token: string) {
    await rpc(this.client, "account_export_cleanup_ack", { p_id: id, p_token: token });
  }
}
