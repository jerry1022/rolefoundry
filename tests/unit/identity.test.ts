import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertAuthorized,
  databaseError,
  IdentityError,
  resolveActor,
  utcWeekStart,
  type Actor,
} from "../../src/modules/identity/core";
const id = "8b681b84-170a-4fe0-91a8-134064df2cf0";
function client(role: "member" | "admin" = "member") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id,
            email_confirmed_at: "2026-11-14T00:00:00Z",
            user_metadata: { role: "admin" },
          },
        },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: { userId: id, role }, error: null }),
  } as unknown as SupabaseClient;
}
describe("verified identity and authorization", () => {
  it("derives the role from the database, ignoring user metadata", async () => {
    const actor = await resolveActor(client());
    expect(actor.role).toBe("member");
    expect(() => assertAuthorized(actor, "catalog:write")).toThrowError(
      new IdentityError("RF_FORBIDDEN"),
    );
    expect(() => assertAuthorized(actor, "profile:read", id)).not.toThrow();
  });
  it("rejects forged actor objects, unknown actions and missing ownership", async () => {
    expect(() =>
      assertAuthorized({ userId: id, role: "admin" } as Actor, "catalog:write"),
    ).toThrowError(new IdentityError("RF_UNAUTHORIZED"));
    const actor = await resolveActor(client());
    expect(() => assertAuthorized(actor, "made-up", id)).toThrowError(
      new IdentityError("RF_FORBIDDEN"),
    );
    expect(() => assertAuthorized(actor, "profile:read")).toThrowError(
      new IdentityError("RF_FORBIDDEN"),
    );
  });
  it("returns not-found for cross-user resources, including administrators", async () => {
    for (const role of ["member", "admin"] as const) {
      const actor = await resolveActor(client(role));
      expect(() => assertAuthorized(actor, "task:read", crypto.randomUUID())).toThrowError(
        new IdentityError("RF_NOT_FOUND"),
      );
    }
  });
  it("permits administrators to manage invitations without granting private-data access", async () => {
    const actor = await resolveActor(client("admin"));
    expect(() => assertAuthorized(actor, "admin:invitations")).not.toThrow();
    expect(() => assertAuthorized(actor, "admin:quotas")).not.toThrow();
    expect(() => assertAuthorized(actor, "admin:refunds")).not.toThrow();
  });
  it("rejects absent, expired, unconfirmed or mismatched sessions", async () => {
    const expired = client();
    vi.mocked(expired.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { status: 401 },
    } as never);
    await expect(resolveActor(expired)).rejects.toThrowError(new IdentityError("RF_UNAUTHORIZED"));
    const unconfirmed = client();
    vi.mocked(unconfirmed.auth.getUser).mockResolvedValue({
      data: { user: { id, email_confirmed_at: null } },
      error: null,
    } as never);
    await expect(resolveActor(unconfirmed)).rejects.toThrowError(
      new IdentityError("RF_UNAUTHORIZED"),
    );
    const mismatch = client();
    vi.mocked(mismatch.rpc).mockResolvedValue({
      data: { userId: crypto.randomUUID(), role: "admin" },
      error: null,
    } as never);
    await expect(resolveActor(mismatch)).rejects.toThrowError(new IdentityError("RF_FORBIDDEN"));
  });
  it("does not misclassify an Auth outage as an expired session", async () => {
    const unavailable = client();
    vi.mocked(unavailable.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { status: 503 },
    } as never);
    await expect(resolveActor(unavailable)).rejects.toThrowError(
      new IdentityError("RF_UNAVAILABLE"),
    );
  });
  it("does not expose raw database messages", () => {
    expect(databaseError({ message: "private database detail" }).message).not.toContain(
      "private database detail",
    );
    expect(databaseError({ message: "RF_QUOTA_EXCEEDED" }).status).toBe(429);
    expect(databaseError({ message: "permission denied", code: "42501" }).status).toBe(403);
  });
});
describe("UTC weekly quota boundaries", () => {
  it("starts at Monday midnight across Sunday and year boundaries", () => {
    expect(utcWeekStart(new Date("2026-11-15T23:59:59.999Z")).toISOString()).toBe(
      "2026-11-09T00:00:00.000Z",
    );
    expect(utcWeekStart(new Date("2026-11-16T00:00:00Z")).toISOString()).toBe(
      "2026-11-16T00:00:00.000Z",
    );
    expect(utcWeekStart(new Date("2027-01-01T10:00:00Z")).toISOString()).toBe(
      "2026-12-28T00:00:00.000Z",
    );
  });
});
