import type { InvalidationStore } from "./ports";
/** Bounded, reference-only maintenance; domain adapters own all invalidation decisions. */
export class InvalidationDispatcher {
  constructor(private readonly store: InvalidationStore) {}
  async tick(signal: AbortSignal) {
    let completed = 0,
      canceled = 0;
    if (signal.aborted) return { completed, canceled };
    const leases = await this.store.claim(signal);
    if (leases.length > 4) throw new Error("Invalidation batch exceeds the execution limit.");
    for (const lease of leases) {
      if (signal.aborted) break; // Unhandled claims become eligible after their lease expires.
      try {
        const result = await this.store.apply(lease, signal);
        completed += Number(result.completed);
        canceled += result.canceled;
      } catch {
        if (signal.aborted) break;
        await this.store.retry(lease, signal);
      }
    }
    return { completed, canceled };
  }
}
