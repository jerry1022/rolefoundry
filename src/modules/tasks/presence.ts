import type { WorkerDescriptor, WorkerPresenceStore, WorkerState } from "./ports";
const rank = { active: 0, draining: 1, stopped: 2 };
/** Serializes terminal states, coalesces slow heartbeats and isolates telemetry failures. */
export class WorkerPresence {
  private state: WorkerState = "active";
  private pending = Promise.resolve();
  private queued = 0;
  constructor(
    private readonly store: WorkerPresenceStore,
    private readonly worker: WorkerDescriptor,
    private readonly unavailable: () => void,
  ) {}
  report(state: WorkerState): Promise<void> {
    if (rank[state] < rank[this.state] || (state === this.state && this.queued > 0))
      return this.pending;
    this.state = state;
    this.queued++;
    this.pending = this.pending
      .then(() => this.store.report(this.worker, state))
      .catch(() => {
        try {
          this.unavailable();
        } catch {
          /* A logger cannot prevent processing or shutdown. */
        }
      })
      .finally(() => {
        this.queued--;
      });
    return this.pending;
  }
}
