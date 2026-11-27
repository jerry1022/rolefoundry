import { it, expect, vi } from "vitest";
import { IdentityAdminDirectoryService } from "../../src/modules/identity/admin-service";
import type { IdentityAdminDirectoryStore } from "../../src/modules/identity/admin";
import type { Actor } from "../../src/modules/identity/core";
const actor: Actor = { userId: crypto.randomUUID(), role: "admin" };
function fixture(deny = false) {
  const store: IdentityAdminDirectoryStore = {
    invitations: vi.fn(async () => ({ data: [], nextCursor: null })),
    quotaPolicies: vi.fn(async () => ({ data: [], nextCursor: null })),
    revokeInvitation: vi.fn(async () => {}),
  };
  const authorize = vi.fn(async (_actor: Actor, _action: string) => {
    if (deny) throw Error("denied");
  });
  return { store, authorize, service: new IdentityAdminDirectoryService(store, { authorize }) };
}
it("authorizes before administrative reads or revocation reach a replaceable store", async () => {
  const f = fixture(true);
  for (const operation of [
    () => f.service.invitations(actor),
    () => f.service.quotaPolicies(actor),
    () => f.service.revokeInvitation(actor, crypto.randomUUID()),
  ])
    await expect(operation()).rejects.toThrow("denied");
  expect(f.store.invitations).not.toHaveBeenCalled();
  expect(f.store.quotaPolicies).not.toHaveBeenCalled();
  expect(f.store.revokeInvitation).not.toHaveBeenCalled();
});
it("rejects malformed identifiers and oversized cursors before adapter work", async () => {
  const f = fixture();
  await expect(f.service.invitations(actor, "x".repeat(513))).rejects.toMatchObject({
    status: 400,
  });
  await expect(f.service.quotaPolicies(actor, "")).rejects.toMatchObject({ status: 400 });
  await expect(f.service.revokeInvitation(actor, "not-a-uuid")).rejects.toMatchObject({
    status: 400,
  });
  expect(f.store.invitations).not.toHaveBeenCalled();
  expect(f.store.quotaPolicies).not.toHaveBeenCalled();
  expect(f.store.revokeInvitation).not.toHaveBeenCalled();
});
it("keeps invitation and quota permissions independent", async () => {
  const f = fixture();
  await f.service.invitations(actor, "cursor");
  await f.service.quotaPolicies(actor);
  const id = crypto.randomUUID();
  await f.service.revokeInvitation(actor, id);
  expect(f.authorize.mock.calls.map((args) => args[1])).toEqual([
    "admin:invitations",
    "admin:quotas",
    "admin:invitations",
  ]);
  expect(f.store.revokeInvitation).toHaveBeenCalledWith(id);
});
