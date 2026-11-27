import { expect, it, vi } from "vitest";
import { HttpObserver } from "../../src/modules/telemetry/observer";
import { MetricsService } from "../../src/modules/telemetry/service";
import { renderMetrics } from "../../src/modules/telemetry/metrics";
import { httpObservationSchema, telemetrySnapshotSchema } from "../../src/modules/telemetry/model";
import { telemetrySnapshot } from "../support/telemetry-snapshot";
import type { ObservationRuntime, TelemetryStore } from "../../src/modules/telemetry/ports";
function observer() {
  const callbacks: (() => Promise<void>)[] = [],
    log = vi.fn(),
    recordHttp = vi.fn<TelemetryStore["recordHttp"]>().mockResolvedValue(undefined);
  const runtime: ObservationRuntime = {
    now: vi.fn().mockReturnValueOnce(100).mockReturnValue(112),
    requestId: () => "a1a1a1a1-1111-4111-8111-111111111111",
    schedule: (work) => {
      callbacks.push(work);
    },
    log,
  };
  return {
    callbacks,
    log,
    recordHttp,
    runtime,
    observer: new HttpObserver({ recordHttp }, runtime, 100),
  };
}
it("returns the exact unread response before any aggregate write and excludes private data", async () => {
  const setup = observer(),
    response = new Response("private resume text", {
      headers: { "x-request-id": "a1a1a1a1-1111-4111-8111-222222222222" },
    });
  expect(await setup.observer.observe("profile", "GET", async () => response)).toBe(response);
  expect(response.bodyUsed).toBe(false);
  expect(setup.recordHttp).not.toHaveBeenCalled();
  await setup.callbacks[0]();
  expect(setup.recordHttp.mock.calls[0][0]).toEqual({
    family: "profile",
    method: "GET",
    status: 200,
    durationMs: 12,
  });
  expect(JSON.stringify(setup.log.mock.calls)).not.toContain("private resume text");
});
it("preserves a business exception and records its safe server-error category", async () => {
  const setup = observer(),
    failure = Error("private upstream URL and payload");
  await expect(
    setup.observer.observe("identity", "POST", async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await setup.callbacks[0]();
  expect(setup.recordHttp.mock.calls[0][0]).toMatchObject({ status: 500 });
  expect(JSON.stringify(setup.log.mock.calls)).not.toContain(failure.message);
});
it("isolates scheduling and clock failures without repeating the business operation", async () => {
  for (const broken of ["schedule", "now"] as const) {
    const setup = observer(),
      work = vi.fn(async () => new Response("ok"));
    setup.runtime[broken] = () => {
      throw Error("runtime unavailable");
    };
    expect(
      (
        await new HttpObserver({ recordHttp: setup.recordHttp }, setup.runtime).observe(
          "jobs",
          "GET",
          work,
        )
      ).status,
    ).toBe(200);
    expect(work).toHaveBeenCalledTimes(1);
  }
});
it("bounds an unresponsive observation port and ignores logger failures", async () => {
  vi.useFakeTimers();
  try {
    const setup = observer();
    setup.recordHttp.mockImplementation(async () => new Promise<void>(() => {}));
    setup.runtime.log = () => {
      throw Error("log unavailable");
    };
    await setup.observer.observe("jobs", "GET", async () => new Response("ok"));
    const flushed = setup.callbacks[0]();
    await vi.advanceTimersByTimeAsync(101);
    await flushed;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("rejects private label injection and normalizes an unknown HTTP method", async () => {
  expect(
    httpObservationSchema.safeParse({
      family: "user@example.test",
      method: "GET",
      status: 200,
      durationMs: 1,
    }).success,
  ).toBe(false);
  const setup = observer();
  await setup.observer.observe("jobs", "PRIVATE-METHOD", async () => new Response("ok"));
  await setup.callbacks[0]();
  expect(setup.recordHttp.mock.calls[0][0]).toMatchObject({ method: "OTHER" });
});
it("renders cumulative OpenMetrics buckets, exact sums and explicit absence of an AI provider", () => {
  const text = renderMetrics(telemetrySnapshot());
  expect(text).toContain('status_class="2xx",le="0.01"} 2');
  expect(text).toContain('status_class="2xx",le="0.05"} 3');
  expect(text).toContain('status_class="2xx",le="+Inf"} 3');
  expect(text).toContain(
    'rolefoundry_http_request_duration_seconds_sum{family="profile",method="GET",status_class="2xx"} 0.055',
  );
  expect(text).toContain("rolefoundry_provider_integration_enabled 0");
  expect(text).not.toContain("rolefoundry_catalog_oldest_review_seconds{");
  expect(text.endsWith("# EOF\n")).toBe(true);
});
it("keeps counts above the JavaScript safe-integer boundary exact and rejects malformed snapshots", () => {
  const snapshot = telemetrySnapshot();
  snapshot.http[0].count = "9007199254740993";
  expect(renderMetrics(snapshot)).toContain('le="+Inf"} 9007199254740994');
  expect(telemetrySnapshotSchema.safeParse({ ...snapshot, privateInput: "secret" }).success).toBe(
    false,
  );
  snapshot.http[0].family = "profile\nuser=private" as never;
  expect(() => renderMetrics(snapshot)).toThrow();
});
it("coalesces concurrent scrapes, caches valid snapshots and refreshes on expiry", async () => {
  let now = 0;
  const store = { snapshot: vi.fn(async () => telemetrySnapshot()) },
    service = new MetricsService(store, () => now, 100, 100);
  const signal = new AbortController().signal;
  const [first, second] = await Promise.all([service.read(signal), service.read(signal)]);
  expect(first).toBe(second);
  expect(store.snapshot).toHaveBeenCalledTimes(1);
  await service.read(signal);
  expect(store.snapshot).toHaveBeenCalledTimes(1);
  now = 101;
  await service.read(signal);
  expect(store.snapshot).toHaveBeenCalledTimes(2);
});
it("does not serve expired cached data after a failed refresh", async () => {
  let now = 0;
  const store = { snapshot: vi.fn(async () => telemetrySnapshot()) },
    service = new MetricsService(store, () => now, 10, 100),
    signal = new AbortController().signal;
  await service.read(signal);
  now = 11;
  store.snapshot.mockRejectedValueOnce(Error("private failure"));
  await expect(service.read(signal)).rejects.toThrow("private failure");
  await service.read(signal);
  expect(store.snapshot).toHaveBeenCalledTimes(3);
});
it("bounds hung reads and clears timers when a replacement store throws synchronously", async () => {
  vi.useFakeTimers();
  try {
    const signal = new AbortController().signal;
    const hung = new MetricsService(
      { snapshot: async () => new Promise(() => {}) },
      () => 0,
      0,
      100,
    );
    const result = expect(hung.read(signal)).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(101);
    await result;
    const broken = new MetricsService(
      {
        snapshot: () => {
          throw Error("unavailable");
        },
      },
      () => 0,
      0,
      100,
    );
    await expect(broken.read(signal)).rejects.toThrow("unavailable");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
