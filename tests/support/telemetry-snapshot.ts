import type { TelemetrySnapshot } from "../../src/modules/telemetry/model";
export function telemetrySnapshot(): TelemetrySnapshot {
  return {
    observedAt: "2026-11-24T00:00:00Z",
    operations: {
      observedAt: "2026-11-24T00:00:00Z",
      workerFreshSeconds: 45,
      kinds: [
        {
          kind: "resume.parse",
          queued: 2,
          ready: 1,
          running: 0,
          failed24h: 0,
          succeeded24h: 1,
          retried24h: 0,
          expiredLeases: 0,
          oldestReadySeconds: 10,
          maxLeaseAgeSeconds: null,
          activeWorkers: 1,
        },
      ],
      deliveryCount: 2,
      poison24h: 0,
    },
    http: [
      { family: "profile", method: "GET", statusClass: 2, upperMs: 10, count: "2", sumMs: "15" },
      { family: "profile", method: "GET", statusClass: 2, upperMs: 50, count: "1", sumMs: "40" },
    ],
    invalidations: [
      { consumer: "matching", pending: 0, leased: 0, retrying: 0, oldestSeconds: null },
    ],
    sources: [
      {
        catalog: "jobs",
        published: 0,
        unreviewed: 0,
        uncertain: 0,
        unavailable: 0,
        oldestReviewSeconds: null,
      },
    ],
  };
}
