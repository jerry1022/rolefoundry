import { TaskFailure, type TaskKind, type TaskLease } from "./model";
import type { TaskQueue, TaskHandler, TaskLog } from "./ports";
/** Queue/framework-independent worker; lease ownership remains authoritative in storage. */
export class TaskWorker {
  constructor(
    private readonly queue: TaskQueue,
    private readonly handlers: Partial<Record<TaskKind, TaskHandler>>,
    private readonly options: {
      workerId: string;
      leaseSeconds: number;
      concurrency: number;
      executionTimeoutMs?: number;
      log?: (event: TaskLog) => void;
    },
  ) {
    if (
      options.leaseSeconds < 5 ||
      options.leaseSeconds > 300 ||
      options.concurrency < 1 ||
      options.concurrency > 8 ||
      !Number.isInteger(options.executionTimeoutMs ?? 60_000) ||
      (options.executionTimeoutMs ?? 60_000) < 100 ||
      (options.executionTimeoutMs ?? 60_000) > 300_000
    )
      throw new Error("Invalid worker limits");
  }
  async tick(signal: AbortSignal) {
    if (signal.aborted) return 0;
    const leases = await this.queue.read(
      this.options.workerId,
      Object.keys(this.handlers) as TaskKind[],
      this.options.leaseSeconds,
      this.options.concurrency,
    );
    await Promise.all(leases.map((lease) => this.process(lease, signal)));
    return leases.length;
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
      await Promise.race([handler.execute(lease, local.signal), interrupted]);
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
