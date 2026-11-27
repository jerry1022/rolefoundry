import { z } from "zod";
import type { TaskKind } from "./model";
export const taskResourceLimitsSchema = z
  .object({
    documents: z.number().int().min(0).max(8),
    fetch: z.number().int().min(0).max(8),
    general: z.number().int().min(0).max(8),
  })
  .strict();
export type TaskResourceLimits = z.infer<typeof taskResourceLimitsSchema>;
export type TaskResourcePool = keyof TaskResourceLimits;
const pools: Record<TaskKind, TaskResourcePool> = {
  "resume.parse": "documents",
  "resume.export": "documents",
  "account.export": "documents",
  "catalog.fetch": "fetch",
  "assessment.grade": "general",
  "matches.refresh": "general",
  "learning.plan": "general",
  "resume.revise": "general",
  "catalog.import": "general",
  "account.delete": "general",
};
export function taskResourcePool(kind: TaskKind): TaskResourcePool {
  return pools[kind];
}
export function declareTaskResources(kinds: TaskKind[], limits: TaskResourceLimits) {
  const enabled = kinds.filter((kind) => limits[taskResourcePool(kind)] > 0);
  return {
    kinds: enabled.length ? enabled : kinds,
    state: enabled.length ? ("active" as const) : ("draining" as const),
  };
}
