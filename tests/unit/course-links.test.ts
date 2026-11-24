import { expect, it, vi } from "vitest";
import {
  SafeCourseLinkProbe,
  allowedCourseLink,
  pinnedHttpsHead,
  type HeadNetwork,
} from "../../src/modules/course-links/adapters/head";
import { CourseLinkChecker } from "../../src/modules/course-links/service";
import type { LinkResult, LinkTarget } from "../../src/modules/course-links/model";
const host = "www.deeplearning.ai",
  url = `https://${host}/short-courses/owned-fixture/`;
const target = { url, allowedHosts: [host] };
const address = { address: "93.184.216.34", family: 4 as const };
const signal = () => new AbortController().signal;
const outcome = (reason: LinkResult["reason"] = "ok"): LinkResult => ({
  reason,
  httpStatus: 200,
  notBefore: null,
  manualPause: false,
});
function network(status = 200): HeadNetwork {
  return {
    resolve: vi.fn(async () => [address]),
    head: vi.fn(async () => ({ status })),
    now: () => Date.parse("2026-11-24T00:00:00Z"),
  };
}
it("pins the checked public address and returns only a minimal HEAD observation", async () => {
  const port = network();
  expect(await new SafeCourseLinkProbe(port).check(target, signal())).toEqual(outcome());
  expect(port.head).toHaveBeenCalledExactlyOnceWith(new URL(url), address, expect.any(AbortSignal));
});
it("rejects unapproved hosts, query credentials, userinfo, non-HTTPS, local and IP targets before DNS", async () => {
  const port = network();
  for (const value of [
    "http://www.deeplearning.ai/courses/x",
    "https://evil.invalid/x",
    `${url}?token=private`,
    `https://user:secret@${host}/x`,
    `https://${host}:444/x`,
    "https://127.0.0.1/x",
    "https://host.internal/x",
    `${url}#secret`,
    `https://${host}./x`,
    "https://[::1]/x",
    `https://${host}/bad path`,
  ]) {
    expect(() => allowedCourseLink(value, [host, "127.0.0.1", "host.internal", "[::1]"])).toThrow();
    expect(
      (await new SafeCourseLinkProbe(port).check({ ...target, url: value }, signal())).reason,
    ).toBe("blocked");
  }
  expect(port.resolve).not.toHaveBeenCalled();
  expect(port.head).not.toHaveBeenCalled();
});
it("rejects mixed public/private, mapped IPv6, empty and oversized DNS results before connecting", async () => {
  for (const addresses of [
    [],
    [address, { address: "127.0.0.1", family: 4 as const }],
    [{ address: "::ffff:127.0.0.1", family: 6 as const }],
    Array.from({ length: 65 }, () => address),
  ]) {
    const port = network();
    port.resolve = vi.fn(async () => addresses);
    expect((await new SafeCourseLinkProbe(port).check(target, signal())).reason).toBe("blocked");
    expect(port.head).not.toHaveBeenCalled();
  }
  await expect(
    pinnedHttpsHead(new URL(url), { address: "127.0.0.1", family: 4 }, signal()),
  ).rejects.toThrow("Blocked course address");
});
it("revalidates and resolves each approved redirect without retaining a final URL in results", async () => {
  const port = network();
  port.head = vi
    .fn()
    .mockResolvedValueOnce({ status: 301, location: "/courses/redirected/" })
    .mockResolvedValueOnce({ status: 200 });
  expect(await new SafeCourseLinkProbe(port).check(target, signal())).toEqual(outcome());
  expect(port.resolve).toHaveBeenCalledTimes(2);
  expect(port.head).toHaveBeenCalledTimes(2);
});
it("blocks redirect escapes, loops and overlong chains without fallback to GET", async () => {
  for (const location of [
    "http://127.0.0.1/metadata",
    "https://evil.invalid/",
    `${url}?secret=token`,
    url,
  ]) {
    const port = network();
    port.head = vi.fn(async () => ({ status: 302, location }));
    expect(["blocked", "redirect"]).toContain(
      (await new SafeCourseLinkProbe(port).check(target, signal())).reason,
    );
    expect(port.head).toHaveBeenCalledTimes(1);
  }
  const port = network();
  let count = 0;
  port.head = vi.fn(async () => ({ status: 302, location: `/courses/${count++}/` }));
  expect((await new SafeCourseLinkProbe(port).check(target, signal())).reason).toBe("redirect");
  expect(port.head).toHaveBeenCalledTimes(4);
});
it("distinguishes missing, unsupported, denied, transient and invalid responses", async () => {
  for (const [status, reason] of [
    [404, "not-found"],
    [410, "not-found"],
    [405, "unsupported"],
    [501, "unsupported"],
    [403, "access-denied"],
    [503, "server-error"],
    [429, "rate-limit"],
    [400, "http-error"],
    [0, "invalid-response"],
  ] as const) {
    const port = network(status);
    expect((await new SafeCourseLinkProbe(port).check(target, signal())).reason).toBe(reason);
    expect(port.head).toHaveBeenCalledTimes(1);
  }
});
it("preserves long Retry-After waits and pauses unrepresentable or invalid advertised waits", async () => {
  for (const [retryAfter, notBefore, manualPause] of [
    ["90000", "2026-11-25T01:00:00.000Z", false],
    ["Wed, 25 Nov 2026 01:00:00 GMT", "2026-11-25T01:00:00.000Z", false],
    ["9999999999999999999999999999999999999", null, true],
    ["invalid-private-header", null, true],
  ] as const) {
    const port = network();
    port.head = vi.fn(async () => ({ status: 429, retryAfter }));
    expect(await new SafeCourseLinkProbe(port).check(target, signal())).toEqual({
      reason: "rate-limit",
      httpStatus: 429,
      notBefore,
      manualPause,
    });
  }
});
it("bounds hung DNS/HEAD ports and clears its deadline timer", async () => {
  vi.useFakeTimers();
  try {
    for (const stage of ["resolve", "head"] as const) {
      const port = network();
      port[stage] = vi.fn(async () => new Promise<never>(() => {}));
      const checked = new SafeCourseLinkProbe(port, 100).check(target, signal());
      await vi.advanceTimersByTimeAsync(101);
      expect((await checked).reason).toBe("timeout");
      expect(vi.getTimerCount()).toBe(0);
    }
  } finally {
    vi.useRealTimers();
  }
});
it("does not resolve an already-cancelled request or expose private network exceptions", async () => {
  const port = network(),
    controller = new AbortController();
  controller.abort();
  expect((await new SafeCourseLinkProbe(port).check(target, controller.signal)).reason).toBe(
    "timeout",
  );
  expect(port.resolve).not.toHaveBeenCalled();
  port.resolve = vi.fn(async () => {
    throw Error("secret URL and raw socket error");
  });
  expect(await new SafeCourseLinkProbe(port).check(target, signal())).toEqual({
    reason: "network",
    httpStatus: null,
    notBefore: null,
    manualPause: false,
  });
});
const policy = { sourceId: "a1a1a1a1-1111-4111-8111-111111111111", allowedHosts: [host] };
const lease: LinkTarget = {
  ...target,
  id: "a1a1a1a1-1111-4111-8111-222222222222",
  versionId: "a1a1a1a1-1111-4111-8111-333333333333",
  lease: "a1a1a1a1-1111-4111-8111-444444444444",
  revision: 1,
};
it("suppresses overlapping ticks and never publishes a cancelled observation", async () => {
  let finish: (value: LinkResult) => void = () => {};
  const store = { claim: vi.fn(async () => lease), complete: vi.fn(async () => true) },
    probe = {
      check: vi.fn(
        async () =>
          new Promise<LinkResult>((resolve) => {
            finish = resolve;
          }),
      ),
    },
    checker = new CourseLinkChecker(store, probe, [policy]),
    controller = new AbortController();
  const work = checker.tick(controller.signal);
  await vi.waitFor(() => expect(probe.check).toHaveBeenCalledOnce());
  expect(await checker.tick(signal())).toBe(0);
  controller.abort();
  finish(outcome());
  await expect(work).rejects.toThrow();
  expect(store.complete).not.toHaveBeenCalled();
});
it("keeps deployment policy authoritative over replacement stores and validates result categories", async () => {
  const store = {
      claim: vi.fn(async () => ({ ...lease, allowedHosts: ["evil.invalid"] })),
      complete: vi.fn(async () => true),
    },
    probe = { check: vi.fn(async () => outcome()) };
  await expect(new CourseLinkChecker(store, probe, [policy]).tick(signal())).rejects.toThrow(
    "policy mismatch",
  );
  expect(probe.check).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
});
it("rotates source admission so a continuously due first source cannot starve later sources", async () => {
  const second = { ...policy, sourceId: "a1a1a1a1-1111-4111-8111-555555555555" };
  const store = {
      claim: vi.fn(async (_policy: typeof policy) => lease),
      complete: vi.fn(async () => true),
    },
    probe = { check: vi.fn(async () => outcome()) };
  const checker = new CourseLinkChecker(store, probe, [policy, second]);
  await checker.tick(signal());
  await checker.tick(signal());
  expect(store.claim.mock.calls.map((call) => call[0].sourceId)).toEqual([
    policy.sourceId,
    second.sourceId,
  ]);
});
