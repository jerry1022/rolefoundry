import { it, expect, vi } from "vitest";
import { AccountDeletionHandler } from "../../src/modules/account-deletion/handler";
import { TaskWorker } from "../../src/modules/tasks/worker";
import type { DeletionExecutionStore } from "../../src/modules/account-deletion/ports";
import type { TaskLease } from "../../src/modules/tasks/model";
import type { TaskQueue } from "../../src/modules/tasks/ports";
const id = () => crypto.randomUUID(),
  lease: TaskLease = {
    taskId: id(),
    token: id(),
    kind: "account.delete",
    messageId: "1",
    leaseSeconds: 30,
  };
function store(ready = true): DeletionExecutionStore {
  return {
    load: async () => ({ id: id(), subjectId: id(), phase: "queued" }),
    files: async () => [],
    beginAuth: async () => ready,
    defer: vi.fn(),
    finish: vi.fn(),
  };
}
it("persists a continuation without deleting Auth while file cleanup remains", async () => {
  const execution = store(false),
    directory = { block: vi.fn(), remove: vi.fn() },
    handler = new AccountDeletionHandler(execution, directory, { remove: vi.fn() });
  expect(await handler.execute(lease, new AbortController().signal)).toBe("deferred");
  expect(execution.defer).toHaveBeenCalledWith(lease, 10);
  expect(directory.remove).not.toHaveBeenCalled();
  expect(execution.finish).not.toHaveBeenCalled();
});
it("removes Auth only after fenced file readiness and then records completion", async () => {
  const calls: string[] = [],
    execution = {
      ...store(),
      beginAuth: async () => {
        calls.push("ready");
        return true;
      },
      finish: async () => {
        calls.push("finish");
      },
    };
  await new AccountDeletionHandler(
    execution,
    {
      block: async () => {
        calls.push("block");
      },
      remove: async () => {
        calls.push("auth-delete");
      },
    },
    {
      remove: async () => {
        calls.push("files");
      },
    },
  ).execute(lease, new AbortController().signal);
  expect(calls).toEqual(["block", "files", "ready", "auth-delete", "finish"]);
});
it("does not acknowledge or fail a task after a persisted continuation", async () => {
  const queue: TaskQueue = {
      read: async () => [lease],
      heartbeat: async () => true,
      acknowledge: vi.fn(),
      fail: vi.fn(),
      release: vi.fn(),
    },
    execution = store(false);
  const worker = new TaskWorker(
    queue,
    {
      "account.delete": new AccountDeletionHandler(
        execution,
        { block: vi.fn(), remove: vi.fn() },
        { remove: vi.fn() },
      ),
    },
    { workerId: id(), leaseSeconds: 30, concurrency: 1 },
  );
  expect(await worker.tick(new AbortController().signal)).toBe(1);
  expect(execution.defer).toHaveBeenCalledOnce();
  expect(queue.acknowledge).not.toHaveBeenCalled();
  expect(queue.fail).not.toHaveBeenCalled();
});
it("leaves completion unrecorded when the directory fails and respects cancellation", async () => {
  const execution = store(),
    handler = new AccountDeletionHandler(
      execution,
      {
        block: vi.fn(),
        remove: async () => {
          throw Error("transport unavailable");
        },
      },
      { remove: vi.fn() },
    );
  await expect(handler.execute(lease, new AbortController().signal)).rejects.toThrow(
    "transport unavailable",
  );
  expect(execution.finish).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(handler.execute(lease, controller.signal)).rejects.toThrow();
});
