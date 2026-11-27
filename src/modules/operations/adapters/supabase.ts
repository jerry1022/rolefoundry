import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../../platform/database-errors";
import { ApplicationError } from "../../platform/errors";
import {
  operationsSummarySchema,
  operationsTaskSchema,
  operationsTaskPageSchema,
  operationsEventPageSchema,
  operationsWorkersSchema,
  operationsQuerySchema,
} from "../model";
import type { OperationsReadStore } from "../ports";
const taskCursor = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    kind: operationsQuerySchema.shape.kind.unwrap().nullable(),
    status: operationsQuerySchema.shape.status.unwrap().nullable(),
  })
  .strict();
const eventCursor = z
  .object({
    taskId: z.uuid(),
    sequence: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine((value) => BigInt(value) <= 9223372036854775807n),
  })
  .strict();
function invalidCursor(): never {
  throw new ApplicationError("RF_INVALID_INPUT", 400, "The diagnostics cursor is invalid.");
}
function decode<T>(schema: z.ZodType<T>, raw: string): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The diagnostics cursor is invalid.");
  }
}
const encode = (value: unknown) =>
  value === null ? null : Buffer.from(JSON.stringify(value)).toString("base64url");
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(10000));
  if (error) throw safeDatabaseError(error);
  return data;
}
export class SupabaseOperationsReadStore implements OperationsReadStore {
  constructor(private readonly client: SupabaseClient) {}
  async summary() {
    return operationsSummarySchema.parse(await rpc(this.client, "operations_summary"));
  }
  async tasks(query: Parameters<OperationsReadStore["tasks"]>[0]) {
    const cursor = query.cursor ? decode(taskCursor, query.cursor) : null;
    if (
      cursor &&
      (cursor.kind !== (query.kind ?? null) || cursor.status !== (query.status ?? null))
    )
      invalidCursor();
    const raw = await rpc(this.client, "operations_tasks", {
      p_kind: query.kind ?? null,
      p_status: query.status ?? null,
      p_before: cursor?.createdAt ?? null,
      p_id: cursor?.id ?? null,
    });
    return operationsTaskPageSchema.parse({
      data: raw.data,
      nextCursor: encode(
        raw.next ? { ...raw.next, kind: query.kind ?? null, status: query.status ?? null } : null,
      ),
    });
  }
  async task(id: string) {
    return operationsTaskSchema.parse(await rpc(this.client, "operations_task_find", { p_id: id }));
  }
  async events(id: string, cursor?: string) {
    const before = cursor ? decode(eventCursor, cursor) : null;
    if (before && before.taskId !== id) invalidCursor();
    const raw = await rpc(this.client, "operations_events", {
      p_task: id,
      p_before: before?.sequence ?? null,
    });
    return operationsEventPageSchema.parse({
      data: raw.data,
      nextCursor: encode(raw.next ? { taskId: id, sequence: raw.next } : null),
    });
  }
  async workers() {
    return operationsWorkersSchema.parse(await rpc(this.client, "operations_workers"));
  }
}
