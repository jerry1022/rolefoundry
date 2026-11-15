import { describe, it, expect, vi } from "vitest";
import {
  gradeFixedAnswers,
  answerMapSchema,
  questionInputSchema,
} from "../../src/modules/assessment/model";
import { AssessmentService } from "../../src/modules/assessment/service";
import { TaskWorker } from "../../src/modules/tasks/worker";
import { TaskFailure, type TaskLease } from "../../src/modules/tasks/model";
import type { TaskQueue } from "../../src/modules/tasks/ports";
import type { AssessmentRepository } from "../../src/modules/assessment/ports";
const id = crypto.randomUUID();
const lease: TaskLease = {
  taskId: id,
  token: crypto.randomUUID(),
  messageId: "123",
  kind: "assessment.grade",
  leaseSeconds: 5,
};
function setup() {
  const queue = {
    read: vi.fn().mockResolvedValue([lease]),
    heartbeat: vi.fn().mockResolvedValue(true),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue({ status: "queued" }),
    release: vi.fn().mockResolvedValue(true),
  } satisfies TaskQueue;
  return queue;
}
describe("fixed scoring contracts", () => {
  it("scores only the reviewed answer key and rejects missing/extra/out-of-range responses", () => {
    const items = [{ id, correctIndex: 1, options: ["First", "Second"] }];
    expect(gradeFixedAnswers(items, { [id]: 1 })).toEqual({ correct: 1, total: 1 });
    expect(gradeFixedAnswers(items, { [id]: 0 })).toEqual({ correct: 0, total: 1 });
    for (const answers of [{}, { [id]: 2 }, { [crypto.randomUUID()]: 0 }])
      expect(() => gradeFixedAnswers(items, answers)).toThrow();
  });
  it("rejects duplicate UUID spellings and unsupported correct-option indices", () => {
    const lower = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(answerMapSchema.safeParse({ [lower]: 0, [lower.toUpperCase()]: 1 }).success).toBe(false);
    expect(
      questionInputSchema.safeParse({
        key: "q",
        version: 1,
        track: "Engineering & data",
        skillId: "python",
        rubricId: id,
        prompt: "Prompt",
        options: ["A", "B"],
        correctIndex: 2,
        explanation: "Feedback",
      }).success,
    ).toBe(false);
  });
  it("authorizes before attempting to create a private assessment", async () => {
    const repo = {
      start: vi.fn(),
      find: vi.fn(),
      list: vi.fn(),
      save: vi.fn(),
      submit: vi.fn(),
      retry: vi.fn(),
    } satisfies AssessmentRepository;
    const service = new AssessmentService(repo, {
      authorize: vi.fn().mockRejectedValue(Object.assign(Error("Denied"), { status: 401 })),
    });
    await expect(
      service.start({ userId: id, role: "member" }, { track: "Engineering & data" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(repo.start).not.toHaveBeenCalled();
  });
});
describe("replaceable durable worker engine", () => {
  it("archives only after a handler has committed and never logs answer contents", async () => {
    const queue = setup();
    const calls: string[] = [];
    queue.acknowledge.mockImplementation(async () => {
      calls.push("ack");
    });
    const log = vi.fn();
    const worker = new TaskWorker(
      queue,
      {
        "assessment.grade": {
          execute: async () => {
            calls.push("commit");
          },
        },
      },
      { workerId: crypto.randomUUID(), leaseSeconds: 5, concurrency: 1, log },
    );
    await worker.tick(new AbortController().signal);
    expect(calls).toEqual(["commit", "ack"]);
    expect(queue.fail).not.toHaveBeenCalled();
    expect(log.mock.calls.every(([value]) => !Object.hasOwn(value, "answers"))).toBe(true);
  });
  it("schedules bounded transient retries without archiving the message", async () => {
    const queue = setup();
    const worker = new TaskWorker(
      queue,
      {
        "assessment.grade": {
          execute: async () => {
            throw new TaskFailure("timeout");
          },
        },
      },
      { workerId: crypto.randomUUID(), leaseSeconds: 5, concurrency: 1 },
    );
    await worker.tick(new AbortController().signal);
    expect(queue.fail).toHaveBeenCalledWith(lease, "timeout");
    expect(queue.acknowledge).not.toHaveBeenCalled();
  });
  it("archives terminal validation failures and does not acquire after shutdown", async () => {
    const queue = setup();
    queue.fail.mockResolvedValue({ status: "failed" });
    const worker = new TaskWorker(
      queue,
      {
        "assessment.grade": {
          execute: async () => {
            throw new TaskFailure("validation");
          },
        },
      },
      { workerId: crypto.randomUUID(), leaseSeconds: 5, concurrency: 1 },
    );
    await worker.tick(new AbortController().signal);
    expect(queue.acknowledge).toHaveBeenCalledWith(lease);
    const stop = new AbortController();
    stop.abort();
    queue.read.mockClear();
    expect(await worker.tick(stop.signal)).toBe(0);
    expect(queue.read).not.toHaveBeenCalled();
  });
  it("releases work acquired concurrently with shutdown without running it", async () => {
    const queue = setup();
    const stop = new AbortController();
    queue.read.mockImplementation(async () => {
      stop.abort();
      return [lease];
    });
    const execute = vi.fn();
    await new TaskWorker(
      queue,
      { "assessment.grade": { execute } },
      { workerId: crypto.randomUUID(), leaseSeconds: 5, concurrency: 1 },
    ).tick(stop.signal);
    expect(execute).not.toHaveBeenCalled();
    expect(queue.release).toHaveBeenCalledWith(lease);
  });
  it("times out an unresponsive handler and relinquishes storage ownership before a late commit", async () => {
    vi.useFakeTimers();
    try {
      const queue = setup();
      const execute = vi.fn(async () => new Promise<void>(() => {}));
      const work = new TaskWorker(
        queue,
        { "assessment.grade": { execute } },
        {
          workerId: crypto.randomUUID(),
          leaseSeconds: 5,
          concurrency: 1,
          executionTimeoutMs: 100,
        },
      ).tick(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(101);
      await work;
      expect(queue.fail).toHaveBeenCalledWith(lease, "timeout");
      expect(queue.acknowledge).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("stops without waiting forever for a handler that ignores shutdown", async () => {
    const queue = setup();
    const stop = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execute = async () => {
      started();
      return new Promise<void>(() => {});
    };
    const work = new TaskWorker(
      queue,
      { "assessment.grade": { execute } },
      {
        workerId: crypto.randomUUID(),
        leaseSeconds: 5,
        concurrency: 1,
      },
    ).tick(stop.signal);
    await ready;
    stop.abort();
    await work;
    expect(queue.release).toHaveBeenCalledWith(lease);
    expect(queue.fail).not.toHaveBeenCalled();
  });
  it("aborts a handler when heartbeat ownership is lost and preserves the new worker's lease", async () => {
    vi.useFakeTimers();
    try {
      const queue = setup();
      queue.heartbeat.mockResolvedValue(false);
      const worker = new TaskWorker(
        queue,
        {
          "assessment.grade": {
            execute: async (_lease, signal) =>
              new Promise<void>((_resolve, reject) =>
                signal.addEventListener("abort", () => reject(new TaskFailure("timeout")), {
                  once: true,
                }),
              ),
          },
        },
        { workerId: crypto.randomUUID(), leaseSeconds: 5, concurrency: 1 },
      );
      const work = worker.tick(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(2000);
      await work;
      expect(queue.fail).not.toHaveBeenCalled();
      expect(queue.acknowledge).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
