import { expect, it } from "vitest";
import { operationsAlerts, type OperationsSummary } from "../../src/modules/operations/model";
import { WorkerPresence } from "../../src/modules/tasks/presence";
import type { WorkerDescriptor, WorkerState } from "../../src/modules/tasks/ports";
const descriptor: WorkerDescriptor = {
  id: crypto.randomUUID(),
  kinds: ["assessment.grade"],
  leaseSeconds: 30,
  concurrency: 2,
};
it("serializes shutdown behind a slow pulse and coalesces queued heartbeats", async () => {
  const states: WorkerState[] = [];
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  const presence = new WorkerPresence(
    {
      report: async (_, state) => {
        states.push(state);
        if (state === "active") await slow;
      },
    },
    descriptor,
    () => {},
  );
  const first = presence.report("active");
  await Promise.resolve();
  presence.report("active");
  presence.report("active");
  presence.report("draining");
  const done = presence.report("stopped");
  presence.report("active");
  expect(states).toEqual(["active"]);
  release();
  await Promise.all([first, done]);
  expect(states).toEqual(["active", "draining", "stopped"]);
});
it("continues reporting after transport and logger failures", async () => {
  const states: WorkerState[] = [];
  const presence = new WorkerPresence(
    {
      report: async (_, state) => {
        states.push(state);
        if (state === "active") throw Error("transport");
      },
    },
    descriptor,
    () => {
      throw Error("logger");
    },
  );
  await presence.report("active");
  await presence.report("active");
  await presence.report("stopped");
  await presence.report("draining");
  expect(states).toEqual(["active", "active", "stopped"]);
});
function summary(overrides: Partial<OperationsSummary["kinds"][number]> = {}): OperationsSummary {
  return {
    observedAt: new Date().toISOString(),
    workerFreshSeconds: 45,
    deliveryCount: 0,
    poison24h: 0,
    kinds: [
      {
        kind: "assessment.grade",
        queued: 0,
        ready: 0,
        running: 0,
        failed24h: 0,
        succeeded24h: 0,
        retried24h: 0,
        expiredLeases: 0,
        oldestReadySeconds: null,
        maxLeaseAgeSeconds: null,
        activeWorkers: 0,
        ...overrides,
      },
    ],
  };
}
it("does not report missing workers for delayed retries or a low-volume failure ratio", () => {
  expect(operationsAlerts(summary({ queued: 5, failed24h: 1 }))).toEqual([]);
});
it("uses observed ready age, lease expiry, worker coverage and minimum failure sample", () => {
  expect(
    operationsAlerts({
      ...summary({
        queued: 2,
        ready: 1,
        oldestReadySeconds: 300,
        expiredLeases: 1,
        failed24h: 1,
        succeeded24h: 9,
      }),
      poison24h: 1,
    }).map((a) => a.code),
  ).toEqual(["queue-age", "no-worker", "expired-lease", "failures", "poison"]);
  expect(
    operationsAlerts(
      summary({
        ready: 1,
        activeWorkers: 1,
        oldestReadySeconds: 299,
        failed24h: 1,
        succeeded24h: 10,
      }),
    ),
  ).toEqual([]);
});
