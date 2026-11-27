import { it, expect, vi } from "vitest";
import {
  TaskReplayService,
  type ReplayContext,
  type TaskReplayStore,
} from "../../src/modules/operations/replay";
import type { Actor } from "../../src/modules/identity/core";
const actor: Actor = { userId: crypto.randomUUID(), role: "admin" },
  task = crypto.randomUUID();
const context: ReplayContext = {
  available: true,
  reason: null,
  nextTaskId: null,
  feed: { id: "approved", revision: "a".repeat(64), kind: "jobs" },
};
function fixture(allowed = true, authorize = vi.fn(async () => {})) {
  const store: TaskReplayStore = {
    context: vi.fn(async () => context),
    request: vi.fn(async () => ({ previousTaskId: task, taskId: crypto.randomUUID() })),
  };
  return {
    store,
    authorize,
    service: new TaskReplayService(store, { authorize }, { allows: () => allowed }),
  };
}
it("rechecks authorization before reading domain context or creating an attempt", async () => {
  const f = fixture(
    true,
    vi.fn(async () => {
      throw Error("denied");
    }),
  );
  await expect(f.service.preview(actor, task)).rejects.toThrow("denied");
  await expect(
    f.service.request(actor, task, { requestId: crypto.randomUUID(), reason: "operator-reviewed" }),
  ).rejects.toThrow("denied");
  expect(f.store.context).not.toHaveBeenCalled();
  expect(f.store.request).not.toHaveBeenCalled();
});
it("keeps deployment feed metadata private and blocks removed definitions", async () => {
  const f = fixture(false);
  expect(await f.service.preview(actor, task)).toEqual({
    available: false,
    reason: "deployment-unavailable",
    nextTaskId: null,
  });
  await expect(
    f.service.request(actor, task, { requestId: crypto.randomUUID(), reason: "operator-reviewed" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.store.request).not.toHaveBeenCalled();
});
it("preserves the mutation identity and lets the atomic store resolve a lost response", async () => {
  const f = fixture();
  const input = { requestId: crypto.randomUUID(), reason: "operator-reviewed" as const };
  f.store.context = vi.fn(async () => ({
    ...context,
    available: false,
    reason: "already-replayed" as const,
    feed: null,
  }));
  await f.service.request(actor, task, input);
  expect(f.store.request).toHaveBeenCalledWith(task, input);
});
it("rejects spoofed authority, unknown fields and invalid identifiers before store mutation", async () => {
  const f = fixture();
  for (const input of [
    { requestId: crypto.randomUUID(), reason: "operator-reviewed", ownerId: actor.userId },
    { requestId: "invalid", reason: "operator-reviewed" },
    { requestId: crypto.randomUUID(), reason: "free form private notes" },
  ])
    await expect(f.service.request(actor, task, input)).rejects.toMatchObject({ status: 400 });
  expect(f.store.request).not.toHaveBeenCalled();
  expect(f.store.context).not.toHaveBeenCalled();
});
it("blocks ineligible input at the domain port boundary before requesting a mutation", async () => {
  const f = fixture();
  f.store.context = vi.fn(async () => ({
    ...context,
    available: false,
    reason: "source-stale" as const,
    feed: null,
  }));
  await expect(
    f.service.request(actor, task, { requestId: crypto.randomUUID(), reason: "operator-reviewed" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.store.request).not.toHaveBeenCalled();
});
