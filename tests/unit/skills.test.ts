import { describe, it, expect, vi } from "vitest";
import { normalizeSkillTerm, skillIdSchema, skillLabel } from "../../src/modules/skills/model";
import {
  SkillDictionaryService,
  SkillAdministrationService,
} from "../../src/modules/skills/service";
import { createSkillClient } from "../../src/modules/skills/adapters/http-client";
import type { SkillRepository, SkillAdminRepository } from "../../src/modules/skills/ports";
const empty = {
  version: 1,
  createdAt: "2026-11-14T00:00:00Z",
  skills: [],
  aliases: [],
  relations: [],
  trackSkills: [],
};
const actor = { userId: crypto.randomUUID(), role: "admin" as const };
describe("portable skill dictionary use cases", () => {
  it("normalizes supported width, case, whitespace and dashes without losing meaningful symbols", () => {
    expect(normalizeSkillTerm("  Ｃ＋＋  —  開發\t")).toBe("c++ - 開發");
    expect(normalizeSkillTerm("C#")).not.toBe(normalizeSkillTerm("C++"));
    expect(normalizeSkillTerm(".NET")).toBe(".net");
  });
  it("accepts extensible canonical IDs while rejecting malformed or reassigned names", () => {
    expect(skillIdSchema.safeParse("new-runtime-concept").success).toBe(true);
    for (const value of ["Bad ID", "UPPERCASE", "", "x".repeat(65)])
      expect(skillIdSchema.safeParse(value).success).toBe(false);
    expect(skillLabel("new-runtime-concept", { "new-runtime-concept": "A reviewed concept" })).toBe(
      "A reviewed concept",
    );
  });
  it("reads immutable versions and forwards exact ambiguous resolution without guessing", async () => {
    const result = {
      version: 3,
      normalizedTerm: "capability",
      status: "ambiguous",
      skillId: null,
      candidates: ["python", "sql"],
      redirectedFrom: null,
    };
    const repo = {
      get: vi.fn().mockResolvedValue(empty),
      resolve: vi.fn().mockResolvedValue(result),
    } satisfies SkillRepository;
    const service = new SkillDictionaryService(repo);
    expect(await service.resolve({ term: "capability" })).toEqual(result);
    await service.get(1);
    expect(repo.get).toHaveBeenCalledWith(1);
    expect(() => service.get(-1)).toThrowError();
  });
  it("does not invoke a provider when public input is malformed", () => {
    const repo = { get: vi.fn(), resolve: vi.fn() } satisfies SkillRepository;
    const service = new SkillDictionaryService(repo);
    expect(() => service.resolve({ term: "", ownerId: actor.userId })).toThrowError();
    expect(repo.resolve).not.toHaveBeenCalled();
  });
  it("uses authorization before any taxonomy mutation", async () => {
    const repo = {
      create: vi.fn(),
      update: vi.fn(),
      alias: vi.fn(),
      relation: vi.fn(),
      track: vi.fn(),
      merge: vi.fn(),
      removeAlias: vi.fn(),
      removeRelation: vi.fn(),
      removeTrack: vi.fn(),
    } satisfies SkillAdminRepository;
    const service = new SkillAdministrationService(repo, {
      authorize: vi.fn().mockRejectedValue(Object.assign(Error("Denied"), { status: 403 })),
    });
    await expect(
      service.merge(actor, {
        expectedVersion: 1,
        fromId: "python",
        toId: "sql",
        reason: "Invalid user action",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.merge).not.toHaveBeenCalled();
  });
  it("preserves safe HTTP conflict failures at the client adapter boundary", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "RF_CONFLICT", message: "Reload the dictionary" } }),
          { status: 409 },
        ),
      );
    await expect(createSkillClient(fetcher).get()).rejects.toMatchObject({
      code: "RF_CONFLICT",
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/skills"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
