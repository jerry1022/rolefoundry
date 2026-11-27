import type { ResumeDocument } from "./model";
const terminal = new Set(["succeeded", "failed", "accepted"]);
/** Delayed polling cannot undo a confirmation or a known task result/invalidation. */
export function acceptResumeRead(
  current: ResumeDocument | null,
  next: ResumeDocument,
): ResumeDocument {
  if (!current || current.id !== next.id) return next;
  if (next.revision < current.revision) return current;
  return {
    ...next,
    proposals: [
      ...next.proposals,
      ...current.proposals.filter((item) => !next.proposals.some((next) => next.id === item.id)),
    ].map((item) => {
      const previous = current.proposals.find(
        (old) => old.id === item.id && old.taskId === item.taskId,
      );
      if (!previous) return item;
      const result =
        previous.status === "accepted" ||
        (terminal.has(previous.status) && item.status !== "accepted")
          ? previous
          : item;
      return { ...result, stale: previous.stale || item.stale };
    }),
    exports: [
      ...next.exports,
      ...current.exports.filter((item) => !next.exports.some((next) => next.id === item.id)),
    ].map((item) => {
      const previous = current.exports.find(
        (old) => old.id === item.id && old.taskId === item.taskId,
      );
      return previous && terminal.has(previous.status) ? previous : item;
    }),
  };
}
