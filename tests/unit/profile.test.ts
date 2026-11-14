import { describe, it, expect, vi } from "vitest";
import { ProfileService } from "../../src/modules/profile/service";
import {
  publicEvidenceSchema,
  internalEvidenceSchema,
  isProfileSnapshotStale,
  type CareerProfile,
} from "../../src/modules/profile/model";
import type { ProfileRepository } from "../../src/modules/profile/ports";
import { assertAuthorized, resolveActor, type Actor } from "../../src/modules/identity/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHttpProfileClient } from "../../src/modules/profile/adapters/http-client";

const userId = crypto.randomUUID();
const profile: CareerProfile = {
  name: "Sam",
  track: "Engineering & data",
  workplaces: ["Remote"],
  weeklyHours: 4,
  revision: 2,
  updatedAt: null,
};
const claim = {
  source: "self-report" as const,
  label: "Python reporting",
  context: "Self-reported work",
  observedAt: "2026-11-01T00:00:00Z",
  skills: ["python"],
  claimedLevel: 2,
};
async function actor() {
  return resolveActor({
    auth: {
      getUser: async () => ({
        data: { user: { id: userId, email_confirmed_at: "2026-01-01" } },
        error: null,
      }),
    },
    rpc: async () => ({ data: { userId, role: "member" }, error: null }),
  } as unknown as SupabaseClient);
}
function setup() {
  const repository = {
    read: vi.fn().mockResolvedValue(profile),
    update: vi.fn().mockResolvedValue({ ...profile, revision: 3 }),
    list: vi.fn(),
    history: vi.fn(),
    create: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    importDemo: vi.fn(),
  } satisfies ProfileRepository;
  const authorization = {
    authorize: async (a: Actor, action: string, ownerId: string) =>
      assertAuthorized(a, action, ownerId),
  };
  return { repository, service: new ProfileService(repository, authorization) };
}
describe("profile domain through replaceable ports", () => {
  it("round-trips normalized preferences without importing a database adapter", async () => {
    const { service, repository } = setup();
    const member = await actor();
    await service.update(member, {
      name: "  Sam  ",
      track: profile.track,
      workplaces: profile.workplaces,
      weeklyHours: profile.weeklyHours,
      expectedRevision: 2,
    });
    expect(repository.update).toHaveBeenCalledWith({
      name: "Sam",
      track: profile.track,
      workplaces: ["Remote"],
      weeklyHours: 4,
      expectedRevision: 2,
    });
    expect((await service.read(member)).revision).toBe(2);
  });
  it("does not reach persistence when a client forges an actor", async () => {
    const { service, repository } = setup();
    await expect(service.read({ userId, role: "admin" })).rejects.toMatchObject({ status: 401 });
    expect(repository.read).not.toHaveBeenCalled();
  });
  it("rejects unknown skills and attempts to submit scored evidence", async () => {
    const { service, repository } = setup();
    const member = await actor();
    for (const evidence of [
      { ...claim, skills: ["unknown"] },
      { ...claim, source: "scenario", reviewState: "scored" },
      { ...claim, reviewState: "reviewed" },
    ])
      await expect(service.create(member, { expectedRevision: 2, evidence })).rejects.toMatchObject(
        { status: 400 },
      );
    expect(repository.create).not.toHaveBeenCalled();
  });
  it("allows HTTPS references without fetching their contents", () => {
    expect(
      publicEvidenceSchema.safeParse({
        label: claim.label,
        context: claim.context,
        observedAt: claim.observedAt,
        skills: claim.skills,
        source: "portfolio-reference",
        url: "https://example.com/project",
      }).success,
    ).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
    ])
      expect(
        publicEvidenceSchema.safeParse({
          source: "portfolio-reference",
          label: "Link",
          context: "",
          observedAt: claim.observedAt,
          skills: ["python"],
          url,
        }).success,
      ).toBe(false);
  });
  it("requires immutable source and rubric versions for trusted scenario evidence", () => {
    const scored = {
      source: "scenario",
      sourceRef: crypto.randomUUID(),
      sourceVersion: "question-v1",
      rubricVersion: null,
      label: "Scenario",
      context: "",
      outcome: "Try again",
      observedAt: claim.observedAt,
      skills: ["python"],
    };
    expect(internalEvidenceSchema.safeParse(scored).success).toBe(false);
    expect(
      internalEvidenceSchema.safeParse({ ...scored, rubricVersion: "rubric-v2" }).success,
    ).toBe(true);
  });
  it("treats changed inputs as stale without inferring proficiency from course progress", () => {
    expect(isProfileSnapshotStale(2, 2)).toBe(false);
    expect(isProfileSnapshotStale(2, 3)).toBe(true);
    expect(publicEvidenceSchema.safeParse({ ...claim, source: "course-completion" }).success).toBe(
      false,
    );
  });
  it("propagates optimistic write conflicts to the caller", async () => {
    const { service, repository } = setup();
    repository.update.mockRejectedValue(Object.assign(new Error("Reload"), { status: 409 }));
    await expect(
      service.update(await actor(), {
        name: "Sam",
        track: profile.track,
        workplaces: [],
        weeklyHours: 4,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("keeps HTTP errors and credentials at the browser transport boundary", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "RF_CONFLICT", message: "Reload profile" } }),
          { status: 409 },
        ),
      );
    const client = createHttpProfileClient(fetcher);
    await expect(client.read()).rejects.toMatchObject({ code: "RF_CONFLICT", status: 409 });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/profile",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });
});
