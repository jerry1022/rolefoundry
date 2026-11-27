import { expect, it, vi } from "vitest";
import { InvalidationDispatcher } from "../../src/modules/invalidation/dispatcher";
import type { InvalidationStore } from "../../src/modules/invalidation/ports";
const lease = () => ({ id: crypto.randomUUID(), token: crypto.randomUUID() });
function setup() {
  const leases = [lease(), lease()];
  const store = {
    claim: vi.fn(async () => leases),
    apply: vi.fn(async () => ({ completed: true, canceled: 1 })),
    retry: vi.fn(async () => {}),
  } satisfies InvalidationStore;
  return { leases, store, dispatcher: new InvalidationDispatcher(store) };
}
it("dispatches through injected ports and reports only aggregate outcomes", async () => {
  const { dispatcher, store, leases } = setup(),
    signal = new AbortController().signal;
  expect(await dispatcher.tick(signal)).toEqual({ completed: 2, canceled: 2 });
  expect(store.apply.mock.calls).toEqual(leases.map((item) => [item, signal]));
  expect(store.retry).not.toHaveBeenCalled();
});
it("never claims after cancellation", async () => {
  const { dispatcher, store } = setup();
  expect(await dispatcher.tick(AbortSignal.abort())).toEqual({ completed: 0, canceled: 0 });
  expect(store.claim).not.toHaveBeenCalled();
});
it("rejects an oversized replacement-store batch before applying any delivery", async () => {
  const { dispatcher, store } = setup();
  store.claim.mockResolvedValueOnce(Array.from({ length: 5 }, lease));
  await expect(dispatcher.tick(new AbortController().signal)).rejects.toThrow("execution limit");
  expect(store.apply).not.toHaveBeenCalled();
});
it("keeps partial batches pending and retries failures without acknowledging them", async () => {
  const { dispatcher, store, leases } = setup();
  store.apply
    .mockResolvedValueOnce({ completed: false, canceled: 20 })
    .mockRejectedValueOnce(Error("private transport detail"));
  expect(await dispatcher.tick(new AbortController().signal)).toEqual({
    completed: 0,
    canceled: 20,
  });
  expect(store.retry).toHaveBeenCalledExactlyOnceWith(leases[1], expect.any(AbortSignal));
});
it("leaves canceled in-flight claims for expiry and stops acquiring work", async () => {
  const { dispatcher, store } = setup(),
    controller = new AbortController();
  store.apply.mockImplementationOnce(async () => {
    controller.abort();
    throw Error("aborted");
  });
  expect(await dispatcher.tick(controller.signal)).toEqual({ completed: 0, canceled: 0 });
  expect(store.apply).toHaveBeenCalledTimes(1);
  expect(store.retry).not.toHaveBeenCalled();
});
it("propagates a failed persisted retry so a lease cannot be reported complete", async () => {
  const { dispatcher, store } = setup();
  store.apply.mockRejectedValueOnce(Error("transport"));
  store.retry.mockRejectedValueOnce(Error("retry persistence failed"));
  await expect(dispatcher.tick(new AbortController().signal)).rejects.toThrow(
    "retry persistence failed",
  );
  expect(store.apply).toHaveBeenCalledTimes(1);
});
