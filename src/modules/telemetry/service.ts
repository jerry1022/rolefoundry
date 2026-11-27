import { renderMetrics } from "./metrics";
import type { TelemetryStore } from "./ports";
/** Shares bounded reads between scrapers and never serves expired data after a failed refresh. */
export class MetricsService {
  private cached?: { body: string; expires: number };
  private pending?: Promise<string>;
  constructor(
    private readonly store: Pick<TelemetryStore, "snapshot">,
    private readonly now: () => number = () => performance.now(),
    private readonly cacheMs = 5000,
    private readonly deadlineMs = 5000,
  ) {
    if (
      !Number.isInteger(cacheMs) ||
      cacheMs < 0 ||
      cacheMs > 60000 ||
      !Number.isInteger(deadlineMs) ||
      deadlineMs < 10 ||
      deadlineMs > 5000
    )
      throw Error("Invalid metric read limits");
  }
  async read(signal: AbortSignal) {
    if (signal.aborted) throw Error("Metrics stopped");
    if (this.cached && this.cached.expires > this.now()) return this.cached.body;
    if (this.pending) return this.pending;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort();
        reject(Error("Metrics stopped"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("Metrics read deadline"));
      }, this.deadlineMs);
    });
    const work = Promise.race([
      Promise.resolve().then(() => this.store.snapshot(controller.signal)),
      stopped,
    ])
      .then((snapshot) => {
        const body = renderMetrics(snapshot);
        this.cached = { body, expires: this.now() + this.cacheMs };
        return body;
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (onAbort) signal.removeEventListener("abort", onAbort);
        if (this.pending === work) this.pending = undefined;
      });
    this.pending = work;
    return work;
  }
}
