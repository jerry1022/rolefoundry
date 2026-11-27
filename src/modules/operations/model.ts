import { z } from "zod";
import { taskKindSchema, taskStatusSchema } from "../tasks/model";
export const safeCodes = [
  "RF_TRANSIENT",
  "RF_FORBIDDEN",
  "RF_STALE_INPUT",
  "RF_CANCELED",
  "RF_INVALID_INPUT",
  "RF_RETRY_EXHAUSTED",
  "RF_POISON",
] as const;
export const operationsTaskSchema = z.object({
  id: z.uuid(),
  kind: taskKindSchema,
  status: taskStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  retryPolicy: z.enum(["bounded", "until-complete"]).default("bounded"),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  nextRunAt: z.string(),
  leaseExpiresAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  workerId: z.uuid().nullable(),
  errorCode: z.enum(safeCodes).nullable(),
  resultAvailable: z.boolean(),
});
export type OperationsTask = z.infer<typeof operationsTaskSchema>;
const count = z.number().int().nonnegative(),
  seconds = z.number().nonnegative().nullable();
export const operationsSummarySchema = z.object({
  observedAt: z.string(),
  workerFreshSeconds: count,
  kinds: z.array(
    z.object({
      kind: taskKindSchema,
      queued: count,
      ready: count,
      running: count,
      failed24h: count,
      succeeded24h: count,
      retried24h: count,
      expiredLeases: count,
      oldestReadySeconds: seconds,
      maxLeaseAgeSeconds: seconds,
      activeWorkers: count,
    }),
  ),
  deliveryCount: count,
  poison24h: count,
});
export type OperationsSummary = z.infer<typeof operationsSummarySchema>;
export const operationsEventSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  event: z.enum([
    "task.queued",
    "task.deferred",
    "task.claimed",
    "task.retry_scheduled",
    "task.released",
    "task.failed",
    "task.succeeded",
    "queue.poison",
    "event.unclassified",
  ]),
  code: z.enum(safeCodes).nullable(),
  createdAt: z.string(),
  workerId: z.uuid().nullable(),
});
export type OperationsEvent = z.infer<typeof operationsEventSchema>;
export const operationsWorkersSchema = z.object({
  observedAt: z.string(),
  truncated: z.boolean(),
  data: z
    .array(
      z.object({
        id: z.uuid(),
        kinds: z.array(taskKindSchema),
        leaseSeconds: count,
        concurrency: count,
        reportedState: z.enum(["active", "draining", "stopped"]),
        observedState: z.enum(["active", "draining", "stopped", "stale"]),
        startedAt: z.string(),
        lastSeenAt: z.string(),
      }),
    )
    .max(100),
});
export type OperationsWorkers = z.infer<typeof operationsWorkersSchema>;
export const operationsQuerySchema = z
  .object({
    kind: taskKindSchema.optional(),
    status: taskStatusSchema.optional(),
    cursor: z.string().min(1).max(1024).optional(),
  })
  .strict();
export type OperationsQuery = z.infer<typeof operationsQuerySchema>;
export const operationsTaskPageSchema = z.object({
  data: z.array(operationsTaskSchema).max(20),
  nextCursor: z.string().nullable(),
});
export type OperationsTaskPage = z.infer<typeof operationsTaskPageSchema>;
export const operationsEventPageSchema = z.object({
  data: z.array(operationsEventSchema).max(20),
  nextCursor: z.string().nullable(),
});
export type OperationsEventPage = z.infer<typeof operationsEventPageSchema>;
export function operationsAlerts(summary: OperationsSummary) {
  const alerts: { kind: string | null; code: string; message: string }[] = [];
  for (const item of summary.kinds) {
    if (item.oldestReadySeconds !== null && item.oldestReadySeconds >= 300)
      alerts.push({
        kind: item.kind,
        code: "queue-age",
        message: "Ready work has waited at least five minutes.",
      });
    if (item.ready > 0 && item.activeWorkers === 0)
      alerts.push({
        kind: item.kind,
        code: "no-worker",
        message: "No recent active worker reports handling this ready work.",
      });
    if (item.expiredLeases > 0)
      alerts.push({
        kind: item.kind,
        code: "expired-lease",
        message: "Running work has an expired or missing lease.",
      });
    if (item.kind === "account.delete" && item.retried24h >= 3)
      alerts.push({
        kind: item.kind,
        code: "erasure-retries",
        message:
          "Account removal has retried repeatedly. Inspect worker configuration and service availability.",
      });
    const terminal = item.failed24h + item.succeeded24h;
    if (terminal >= 10 && item.failed24h / terminal >= 0.1)
      alerts.push({
        kind: item.kind,
        code: "failures",
        message:
          "At least ten percent of terminal work failed in the last 24 hours (minimum ten tasks).",
      });
  }
  if (summary.poison24h > 0)
    alerts.push({
      kind: null,
      code: "poison",
      message: "Workers observed invalid queue deliveries in the last 24 hours.",
    });
  return alerts;
}
