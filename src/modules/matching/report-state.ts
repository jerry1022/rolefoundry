import type { MatchRun } from "./model";
/** A delayed read cannot undo a known deletion, terminal result or freshness warning. */
export function acceptMatchRead(
  current: MatchRun | null,
  next: MatchRun,
  append = false,
): MatchRun {
  if (!current || current.id !== next.id) return next;
  if (current.status === "invalidated") return current;
  if (
    ["succeeded", "failed"].includes(current.status) &&
    ["queued", "running"].includes(next.status)
  )
    return current;
  if (next.status === "invalidated") return next;
  return {
    ...next,
    stale: current.stale || next.stale,
    data: append
      ? [...new Map([...current.data, ...next.data].map((item) => [item.jobId, item])).values()]
      : next.data,
  };
}
