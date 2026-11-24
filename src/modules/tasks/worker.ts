import { TaskFailure, type TaskKind, type TaskLease } from "./model";
import type { TaskQueue, TaskHandler, TaskLog } from "./ports";
import { taskResourcePool, taskResourceLimitsSchema, type TaskResourceLimits } from "./resources";
/** Queue/framework-independent worker; lease ownership remains authoritative in storage. */
export class TaskWorker {
  private acquiring = false;
  private readonly active: TaskResourceLimits = { documents: 0, fetch: 0, general: 0 };
  private readonly resources: TaskResourceLimits;
  constructor(
    private readonly queue: TaskQueue,
    private readonly handlers: Partial<Record<TaskKind, TaskHandler>>,
    private readonly options: {
      workerId: string;
      leaseSeconds: number;
      concurrency: number;
      resourceLimits?: TaskResourceLimits;
      executionTimeoutMs?: number;
      log?: (event: TaskLog) => void;
    },
  ) {
    if (
      options.leaseSeconds < 5 ||
      options.leaseSeconds > 300 ||
      options.concurrency < 1 ||
      options.concurrency > 8 ||
      !Number.isInteger(options.leaseSeconds) ||
      !Number.isInteger(options.concurrency) ||
      !Number.isInteger(options.executionTimeoutMs ?? 60_000) ||
      (options.executionTimeoutMs ?? 60_000) < 100 ||
      (options.executionTimeoutMs ?? 60_000) > 300_000
    )
      throw new Error("Invalid worker limits");
    this.resources = taskResourceLimitsSchema.parse(
      options.resourceLimits ?? {
        documents: options.concurrency,
        fetch: options.concurrency,
        general: options.concurrency,
      },
    );
  }
  async tick(signal: AbortSignal) {
    const available =
      this.options.concurrency - Object.values(this.active).reduce((a, b) => a + b, 0);
    const limits: TaskResourceLimits = {
      documents: Math.max(0, this.resources.documents - this.active.documents),
      fetch: Math.max(0, this.resources.fetch - this.active.fetch),
      general: Math.max(0, this.resources.general - this.active.general),
    };
    if (signal.aborted || this.acquiring || available <= 0 || !Object.values(limits).some(Boolean))
      return 0;
    const accepted: TaskLease[] = [],
      rejected: TaskLease[] = [];
    this.acquiring = true;
    try {
      const args = [
        this.options.workerId,
        Object.keys(this.handlers) as TaskKind[],
        this.options.leaseSeconds,
        available,
      ] as const;
      const leases = this.options.resourceLimits
        ? await this.queue.read(...args, limits)
        : await this.queue.read(...args);
      for (const lease of leases) {
        const pool = taskResourcePool(lease.kind);
        if (
          signal.aborted ||
          !this.handlers[lease.kind] ||
          accepted.length >= available ||
          this.active[pool] >= this.resources[pool]
        ) {
          rejected.push(lease);
          continue;
        }
        this.active[pool]++;
        accepted.push(lease);
      }
    } finally {
      this.acquiring = false;
    }
    // Observe every operation immediately, including replacement adapters that reject early.
    const outcomes = await Promise.allSettled([
      ...rejected.map(async (lease) => this.queue.release(lease)),
      ...accepted.map((lease) =>
        this.process(lease, signal).finally(() => {
          this.active[taskResourcePool(lease.kind)]--;
        }),
      ),
    ]);
    const failure = outcomes.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return accepted.length;
  }
  private async process(lease: TaskLease, signal: AbortSignal) {
    if (signal.aborted) {
      await this.queue.release(lease);
      return;
    }
    const handler = this.handlers[lease.kind];
    if (!handler) {
      await this.queue.release(lease);
      return;
    }
    const local = new AbortController();
    const stop = () => local.abort();
    signal.addEventListener("abort", stop, { once: true });
    let extending = false;
    let lost = false;
    const heartbeat = setInterval(
      () => {
        if (extending || local.signal.aborted) return;
        extending = true;
        void this.queue
          .heartbeat(lease)
          .then((valid) => {
            if (!valid) {
              lost = true;
              local.abort();
            }
          })
          .catch(() => {
            lost = true;
            local.abort();
          })
          .finally(() => {
            extending = false;
          });
      },
      Math.max(1000, Math.floor((lease.leaseSeconds * 1000) / 3)),
    );
    // Bound shutdown even when a replacement handler ignores its AbortSignal.
    // The storage publication guard must still validate the lease on every commit.
    let rejectAborted: (() => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(new TaskFailure("timeout"));
      local.signal.addEventListener("abort", rejectAborted, { once: true });
    });
    const deadline = setTimeout(() => local.abort(), this.options.executionTimeoutMs ?? 60_000);
    try {
      this.options.log?.({ event: "task.started", taskId: lease.taskId });
      const outcome = await Promise.race([handler.execute(lease, local.signal), interrupted]);
      if (outcome === "deferred") {
        this.options.log?.({ event: "task.deferred", taskId: lease.taskId });
        return;
      }
      if (!lost) {
        await this.queue.acknowledge(lease);
        this.options.log?.({ event: "task.completed", taskId: lease.taskId });
      }
    } catch (error) {
      if (lost) {
        this.options.log?.({ event: "task.lease_lost", taskId: lease.taskId });
        return;
      }
      if (signal.aborted) {
        await this.queue.release(lease);
        return;
      }
      const category = error instanceof TaskFailure ? error.category : "infrastructure";
      const retryAfterSeconds = error instanceof TaskFailure ? error.retryAfterSeconds : undefined;
      const result =
        retryAfterSeconds === undefined
          ? await this.queue.fail(lease, category)
          : await this.queue.fail(lease, category, retryAfterSeconds);
      if (result.status === "failed" || result.status === "succeeded")
        await this.queue.acknowledge(lease);
      this.options.log?.({
        event:
          result.status === "queued"
            ? "task.retry_scheduled"
            : result.status === "lease_lost"
              ? "task.lease_lost"
              : "task.failed",
        taskId: lease.taskId,
        code: category,
      });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      if (rejectAborted) local.signal.removeEventListener("abort", rejectAborted);
      signal.removeEventListener("abort", stop);
    }
  }
}
