import { expect, it, vi } from "vitest";
import { TaskWorker } from "../../src/modules/tasks/worker";
import { taskKinds, type TaskKind, type TaskLease } from "../../src/modules/tasks/model";
import type { TaskQueue } from "../../src/modules/tasks/ports";
import {
  taskResourcePool,
  taskResourceLimitsSchema,
  declareTaskResources,
} from "../../src/modules/tasks/resources";
const lease = (kind: TaskKind): TaskLease => ({
  taskId: crypto.randomUUID(),
  messageId: "1",
  token: crypto.randomUUID(),
  kind,
  leaseSeconds: 5,
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function queue() {
  return {
    read: vi.fn<TaskQueue["read"]>().mockResolvedValue([]),
    heartbeat: vi.fn(async () => true),
    acknowledge: vi.fn(async () => {}),
    release: vi.fn(async () => true),
    fail: vi.fn(async () => ({ status: "failed" })),
  } satisfies TaskQueue;
}
const options = () => ({
  workerId: crypto.randomUUID(),
  leaseSeconds: 5,
  concurrency: 3,
  resourceLimits: { documents: 1, fetch: 1, general: 2 },
});
it("assigns every implemented kind to an explicit resource pool", () => {
  expect(taskKinds.filter((kind) => taskResourcePool(kind) === "documents")).toEqual([
    "resume.parse",
    "resume.export",
    "account.export",
  ]);
  expect(taskKinds.filter((kind) => taskResourcePool(kind) === "fetch")).toEqual(["catalog.fetch"]);
  expect(taskKinds.filter((kind) => taskResourcePool(kind) === "general")).toHaveLength(6);
});
it("advertises only enabled pools and makes a fully paused process non-acquiring", () => {
  const enabled = declareTaskResources([...taskKinds], { documents: 0, fetch: 1, general: 2 });
  expect(enabled.state).toBe("active");
  expect(enabled.kinds.some((kind) => taskResourcePool(kind) === "documents")).toBe(false);
  expect(declareTaskResources([...taskKinds], { documents: 0, fetch: 0, general: 0 })).toEqual({
    kinds: [...taskKinds],
    state: "draining",
  });
});
it("rejects fractional/nonfinite worker limits and malformed resource configuration", () => {
  for (const concurrency of [1.5, NaN, Infinity])
    expect(() => new TaskWorker(queue(), {}, { ...options(), concurrency })).toThrow();
  for (const documents of [-1, 1.5, 9, NaN])
    expect(taskResourceLimitsSchema.safeParse({ documents, fetch: 1, general: 2 }).success).toBe(
      false,
    );
  expect(
    taskResourceLimitsSchema.safeParse({ documents: 1, fetch: 1, general: 2, provider: 8 }).success,
  ).toBe(false);
});
it("enforces handler budgets even when a replacement queue ignores admission limits", async () => {
  const store = queue(),
    batch = [lease("resume.parse"), lease("resume.export"), lease("assessment.grade")];
  store.read.mockResolvedValueOnce(batch);
  const document = vi.fn(async () => {}),
    general = vi.fn(async () => {});
  const worker = new TaskWorker(
    store,
    {
      "resume.parse": { execute: document },
      "resume.export": { execute: document },
      "assessment.grade": { execute: general },
    },
    options(),
  );
  expect(await worker.tick(new AbortController().signal)).toBe(2);
  expect(document).toHaveBeenCalledTimes(1);
  expect(general).toHaveBeenCalledTimes(1);
  expect(store.release).toHaveBeenCalledExactlyOnceWith(batch[1]);
  expect(store.read).toHaveBeenCalledWith(expect.any(String), expect.any(Array), 5, 3, {
    documents: 1,
    fetch: 1,
    general: 2,
  });
});
it("shares total and pool slots across overlapping ticks while other resource work can proceed", async () => {
  const store = queue(),
    document = deferred(),
    started = deferred(),
    general = deferred(),
    generalStarted = deferred();
  store.read
    .mockResolvedValueOnce([lease("resume.parse")])
    .mockResolvedValueOnce([lease("assessment.grade")]);
  const worker = new TaskWorker(
    store,
    {
      "resume.parse": {
        execute: async () => {
          started.resolve();
          await document.promise;
        },
      },
      "assessment.grade": {
        execute: async () => {
          generalStarted.resolve();
          await general.promise;
        },
      },
    },
    { ...options(), concurrency: 2 },
  );
  const first = worker.tick(new AbortController().signal);
  await started.promise;
  const second = worker.tick(new AbortController().signal);
  await generalStarted.promise;
  expect(store.read.mock.calls[1].slice(3)).toEqual([1, { documents: 0, fetch: 1, general: 2 }]);
  expect(await worker.tick(new AbortController().signal)).toBe(0);
  expect(store.read).toHaveBeenCalledTimes(2);
  general.resolve();
  document.resolve();
  expect(await Promise.all([first, second])).toEqual([1, 1]);
});
it("serializes acquisition before any handlers have reserved their slots", async () => {
  const store = queue(),
    ready = deferred();
  store.read.mockImplementationOnce(async () => {
    await ready.promise;
    return [];
  });
  const worker = new TaskWorker(store, {}, options());
  const first = worker.tick(new AbortController().signal);
  expect(await worker.tick(new AbortController().signal)).toBe(0);
  expect(store.read).toHaveBeenCalledTimes(1);
  ready.resolve();
  await first;
});
it("does not acquire when all resource pools are paused", async () => {
  const store = queue(),
    worker = new TaskWorker(
      store,
      {},
      { ...options(), resourceLimits: { documents: 0, fetch: 0, general: 0 } },
    );
  expect(await worker.tick(new AbortController().signal)).toBe(0);
  expect(store.read).not.toHaveBeenCalled();
});
it("releases pool capacity after timeout and permits the next bounded execution", async () => {
  vi.useFakeTimers();
  try {
    const store = queue();
    store.read
      .mockResolvedValueOnce([lease("resume.parse")])
      .mockResolvedValueOnce([lease("resume.parse")]);
    const execute = vi
      .fn()
      .mockImplementationOnce(async () => new Promise<void>(() => {}))
      .mockResolvedValueOnce(undefined);
    const worker = new TaskWorker(
      store,
      { "resume.parse": { execute } },
      { ...options(), executionTimeoutMs: 100 },
    );
    const first = worker.tick(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(101);
    await first;
    expect(await worker.tick(new AbortController().signal)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("does not strand acquisition capacity after a transport error", async () => {
  const store = queue();
  store.read
    .mockRejectedValueOnce(Error("unavailable"))
    .mockResolvedValueOnce([lease("assessment.grade")]);
  const worker = new TaskWorker(
    store,
    { "assessment.grade": { execute: async () => {} } },
    options(),
  );
  await expect(worker.tick(new AbortController().signal)).rejects.toThrow("unavailable");
  expect(await worker.tick(new AbortController().signal)).toBe(1);
});
it("settles accepted handlers and restores their slots when releasing excess work fails", async () => {
  const store = queue(),
    started = deferred(),
    finish = deferred();
  store.read.mockResolvedValueOnce([lease("resume.parse"), lease("resume.export")]);
  store.release.mockRejectedValueOnce(Error("release failed"));
  const worker = new TaskWorker(
    store,
    {
      "resume.parse": {
        execute: async () => {
          started.resolve();
          await finish.promise;
        },
      },
      "resume.export": { execute: async () => {} },
    },
    options(),
  );
  const first = worker.tick(new AbortController().signal);
  const observed = expect(first).rejects.toThrow("release failed");
  await started.promise;
  finish.resolve();
  await observed;
  store.read.mockResolvedValueOnce([lease("resume.parse")]);
  expect(await worker.tick(new AbortController().signal)).toBe(1);
});
