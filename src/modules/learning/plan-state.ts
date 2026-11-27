import type { LearningPlan } from "./model";
/** Preserve known deletion and newer user-authored progress across delayed responses. */
export function acceptLearningRead(current: LearningPlan | null, next: LearningPlan): LearningPlan {
  if (!current || current.id !== next.id) return next;
  if (current.status === "invalidated" && next.status !== "invalidated") return current;
  if (next.status === "invalidated" && next.progressRevision < current.progressRevision)
    return {
      ...next,
      progressRevision: current.progressRevision,
      practiceSubmissions: current.practiceSubmissions,
    };
  if (next.progressRevision < current.progressRevision) return current;
  if (
    ["succeeded", "failed"].includes(current.status) &&
    ["queued", "running"].includes(next.status)
  )
    return current;
  return { ...next, stale: current.stale || next.stale };
}
