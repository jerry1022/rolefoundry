import type { Application } from "./model";
/** An older read cannot replace a mutation result or restore a locally removed record. */
export function mergeApplication(current: Application | null, incoming: Application) {
  return current?.id === incoming.id && current.revision > incoming.revision ? current : incoming;
}
export function mergeApplications(
  current: Application[],
  incoming: Application[],
  deleted: ReadonlySet<string>,
) {
  const records = new Map(
    current.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item]),
  );
  for (const item of incoming)
    if (!deleted.has(item.id))
      records.set(item.id, mergeApplication(records.get(item.id) ?? null, item));
  return [...records.values()];
}
export function localDateInput(iso: string) {
  const value = new Date(iso),
    offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
export function localInputToUtc(value: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return null;
  // Reject nonexistent local times normalized by Date (for example DST spring-forward).
  return localDateInput(date.toISOString()) === value ? date.toISOString() : null;
}
