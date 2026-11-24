import { describe, it, expect, vi } from "vitest";
import {
  querySchema,
  jobDraftSchema,
  salarySchema,
  sourcePolicySchema,
  catalogUrl,
  localizedJobText,
} from "../../src/modules/jobs/model";
import {
  JobCatalogService,
  BookmarkService,
  CatalogAdminService,
} from "../../src/modules/jobs/service";
import type {
  CatalogRepository,
  BookmarkRepository,
  CatalogAdminRepository,
} from "../../src/modules/jobs/ports";
import { createCatalogClient } from "../../src/modules/jobs/adapters/http-client";
import { safeDatabaseError } from "../../src/modules/platform/database-errors";
const draft = {
  canonicalKey: "role-1",
  company: "Example",
  title: "AI engineer",
  track: "Engineering & data",
  specialization: "ai-llm-applications",
  location: null,
  workplace: null,
  level: null,
  salary: null,
  summary: "A sourced description",
  responsibilities: [],
  requirements: [{ text: "Python useful", priority: "preferred", skills: ["python"] }],
  conditions: { workAuthorization: null, education: null, experienceYears: null },
  expiresAt: null,
};
describe("catalog contracts and replaceable adapters", () => {
  it("normalizes supported search text while retaining symbols and bounded filters", () => {
    expect(querySchema.parse({ q: " Ｃ＋＋   資料科學家 " })).toMatchObject({
      q: "c++ 資料科學家",
      limit: 20,
    });
    expect(querySchema.safeParse({ workplace: "Anywhere" }).success).toBe(false);
    expect(querySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(querySchema.safeParse({ ownerId: crypto.randomUUID() }).success).toBe(false);
  });
  it("preserves unknown salary/conditions and distinct mandatory/preferred requirements", () => {
    const parsed = jobDraftSchema.parse(draft);
    expect(parsed.salary).toBeNull();
    expect(parsed.conditions.workAuthorization).toBeNull();
    expect(parsed.requirements[0].priority).toBe("preferred");
    expect(
      salarySchema.safeParse({ min: 0, max: 0, currency: "TWD", interval: "year" }).success,
    ).toBe(false);
    expect(
      salarySchema.safeParse({ min: 200, max: 100, currency: "TWD", interval: "year" }).success,
    ).toBe(false);
  });
  it("requires explicit source permissions and safe reference URLs", () => {
    expect(sourcePolicySchema.safeParse({ name: "Source" }).success).toBe(false);
    expect(catalogUrl.parse("HTTPS://EXAMPLE.COM?x=1")).toBe("https://example.com/?x=1");
    for (const url of [
      "javascript:alert(1)",
      "https://user:password@example.com/",
      "http://example.com/",
    ])
      expect(catalogUrl.safeParse(url).success).toBe(false);
  });
  it("keeps public browsing independent of identity and passes only normalized queries to persistence", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ data: [] }),
      find: vi.fn(),
    } satisfies CatalogRepository;
    await new JobCatalogService(repository).list({ q: " PYTHON " });
    expect(repository.list).toHaveBeenCalledWith({ q: "python", limit: 20 });
    expect(() => new JobCatalogService(repository).find("bad-id")).toThrowError();
  });
  it("does not reach bookmark persistence after authorization failure", async () => {
    const repo = { list: vi.fn(), save: vi.fn(), remove: vi.fn() } satisfies BookmarkRepository;
    const auth = {
      authorize: vi.fn().mockRejectedValue(Object.assign(Error("Denied"), { status: 401 })),
    };
    await expect(
      new BookmarkService(repo, auth).save(
        { userId: crypto.randomUUID(), role: "member" },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("validates admin content before allowing a replacement repository to persist it", async () => {
    const repo = {
      source: vi.fn(),
      sourceStatus: vi.fn(),
      create: vi.fn(),
      revise: vi.fn(),
      link: vi.fn(),
      transition: vi.fn(),
      observe: vi.fn(),
      translate: vi.fn(),
      removeTranslation: vi.fn(),
    } satisfies CatalogAdminRepository;
    const service = new CatalogAdminService(repo, { authorize: async () => {} });
    await expect(
      service.create(
        { userId: crypto.randomUUID(), role: "admin" },
        {
          job: {
            ...draft,
            requirements: [{ text: "Unknown", priority: "mandatory", skills: ["unknown!"] }],
          },
          source: { sourceId: crypto.randomUUID(), externalId: "1", url: "https://example.com/" },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("validates reviewed translations before persisting them", async () => {
    const repo = {
      source: vi.fn(),
      sourceStatus: vi.fn(),
      create: vi.fn(),
      revise: vi.fn(),
      link: vi.fn(),
      transition: vi.fn(),
      observe: vi.fn(),
      translate: vi.fn(),
      removeTranslation: vi.fn(),
    } satisfies CatalogAdminRepository;
    const service = new CatalogAdminService(repo, { authorize: async () => {} });
    const actor = { userId: crypto.randomUUID(), role: "admin" as const };
    const job = crypto.randomUUID();
    const input = {
      versionId: crypto.randomUUID(),
      locale: "zh-TW",
      title: " AI 應用工程師 ",
      summary: "打造可靠的 AI 產品。",
      responsibilities: ["設計評估流程"],
      reviewNote: "Reviewed by a bilingual editor",
    };
    await service.translate(actor, job, input);
    expect(repo.translate).toHaveBeenCalledWith(job, { ...input, title: "AI 應用工程師" });
    for (const bad of [
      { ...input, locale: "ja" },
      { ...input, reviewNote: " " },
      { ...input, extra: true },
      { ...input, responsibilities: [""] },
    ])
      await expect(service.translate(actor, job, bad)).rejects.toMatchObject({ status: 400 });
    await expect(service.translate(actor, "not-a-job", input)).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.translate).toHaveBeenCalledTimes(1);
  });
  it("shows reviewed translations only to zh-TW viewers and only when aligned", () => {
    const job = {
      title: "AI Engineer",
      summary: "Build reliable AI.",
      responsibilities: ["Design evaluations"],
      translations: {
        "zh-TW": {
          title: "AI 工程師",
          summary: "打造可靠的 AI。",
          responsibilities: ["設計評估"],
          reviewedAt: "2026-11-24T00:00:00Z",
        },
      },
    };
    expect(localizedJobText(job, "zh-TW")).toMatchObject({ title: "AI 工程師", lang: "zh-Hant" });
    expect(localizedJobText(job, "en")).toMatchObject({ title: "AI Engineer", lang: "en" });
    expect(localizedJobText({ ...job, translations: undefined }, "zh-TW").lang).toBe("en");
    const misaligned = { ...job, responsibilities: ["Design evaluations", "Ship"] };
    expect(localizedJobText(misaligned, "zh-TW").title).toBe("AI Engineer");
  });
  it("transports cancellation without browser provider credentials and maps safe failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "RF_CONFLICT", message: "Reload" } }), {
        status: 409,
      }),
    );
    const controller = new AbortController();
    await expect(
      createCatalogClient(fetcher).list(querySchema.parse({ q: "Python" }), controller.signal),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("jobs?"),
      expect.objectContaining({ signal: controller.signal, credentials: "same-origin" }),
    );
    expect(safeDatabaseError({ message: "private connection string" }).message).not.toContain(
      "private connection",
    );
  });
});
