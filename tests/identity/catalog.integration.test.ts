import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { publicationFields, type JobDraft, type PublishedJob } from "../../src/modules/jobs/model";
import { careerPaths } from "../../src/modules/jobs/specializations";
let stack: LocalFixtures, admin: LocalMember, owner: LocalMember, other: LocalMember;
const prefix = `rf-cat-${crypto.randomUUID()}`;
let sequence = 0;
const baseJob: JobDraft = {
  canonicalKey: "",
  company: prefix,
  title: "AI application engineer",
  track: "Engineering & data",
  specialization: "ai-llm-applications",
  location: "Taipei",
  workplace: "Remote",
  level: "Mid",
  salary: null,
  summary: "A fictional local test opening for retrieval work.",
  responsibilities: ["Build reliable retrieval workflows"],
  requirements: [
    { text: "Use Python to build an API", priority: "mandatory", skills: ["python"] },
    { text: "Explore retrieval evaluation", priority: "preferred", skills: ["rag", "evaluation"] },
  ],
  conditions: { workAuthorization: null, education: null, experienceYears: null },
  expiresAt: null,
};
async function source(fields: readonly string[] = publicationFields) {
  const response = await stack.request("admin/catalog/sources", admin, "POST", {
    name: `${prefix}-${++sequence}`,
    publisher: "Local fixture publisher",
    authorizationBasis: "Authored fictional data for isolated integration tests; no live openings.",
    rightsSummary: "Fictional test fixture, not a real recruiting opportunity.",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: fields,
    isDemo: true,
  });
  expect(response.status).toBe(201);
  return (await response.json()).data.id as string;
}
async function draft(overrides: Partial<JobDraft> = {}, sourceId?: string) {
  const job = {
    ...baseJob,
    ...overrides,
    canonicalKey: overrides.canonicalKey || `${prefix}-${++sequence}`,
  };
  const id = sourceId || (await source());
  const response = await stack.request("admin/catalog/jobs", admin, "POST", {
    job,
    source: {
      sourceId: id,
      externalId: `external-${++sequence}`,
      url: `https://jobs.test.invalid/${sequence}`,
    },
  });
  expect(response.status).toBe(201);
  return { ...(await response.json()).data, job, sourceId: id } as {
    id: string;
    revision: number;
    job: JobDraft;
    sourceId: string;
  };
}
async function transition(job: { id: string; revision: number }, status: string) {
  const response = await stack.request(`admin/catalog/jobs/${job.id}/status`, admin, "POST", {
    expectedRevision: job.revision,
    status,
  });
  expect(response.status).toBe(200);
  const result = (await response.json()).data;
  job.revision = result.revision;
  return result;
}
async function published(overrides: Partial<JobDraft> = {}) {
  const job = await draft(overrides);
  await transition(job, "review");
  await transition(job, "published");
  return job;
}
async function find(id: string) {
  return stack.request(`jobs/${id}`);
}
async function search(input: Record<string, string | number> = {}) {
  return stack.request(
    `jobs?${new URLSearchParams(Object.entries({ q: prefix, ...input }).map(([key, value]) => [key, String(value)]))}`,
  );
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  owner = await stack.member();
  other = await stack.member(true);
});
afterAll(async () => {
  if (!stack) return;
  const { rows } = await stack.sql.query("select id from public.jobs where canonical_key like $1", [
    `${prefix}%`,
  ]);
  const ids = rows.map((row) => row.id);
  await stack.sql.query("delete from public.bookmarks where job_id=any($1::uuid[])", [ids]);
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select r.id from public.job_requirements r join public.job_versions v on v.id=r.job_version_id where v.job_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.jobs where id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.catalog_audit where actor_id=any($1::uuid[])", [
    stack.users.map((user) => user.id),
  ]);
  await stack.sql.query("delete from public.sources where name like $1", [`${prefix}%`]);
  await stack.sql.query(
    "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=public.companies.id)",
    [prefix],
  );
  await stack.close();
});
describe("module 03 published catalog and private bookmarks", () => {
  it("publishes reviewed jobs for anonymous readers and hides drafts, permissions and unknown IDs", async () => {
    const job = await draft();
    expect((await find(job.id)).status).toBe(404);
    await transition(job, "review");
    expect((await find(job.id)).status).toBe(404);
    await transition(job, "published");
    const response = await find(job.id);
    expect(response.status).toBe(200);
    const json = (await response.json()).data as PublishedJob;
    expect(json.salary).toBeNull();
    expect(json.conditions.workAuthorization).toBeNull();
    expect(json.requirements.map((r) => r.priority)).toEqual(["mandatory", "preferred"]);
    expect(json.sources[0]).toMatchObject({ isDemo: true, freshness: "current" });
    expect(JSON.stringify(json)).not.toContain("authorizationBasis");
    expect(JSON.stringify(json)).not.toContain("canonicalKey");
    expect((await find(crypto.randomUUID())).status).toBe(404);
    const rendered = await (await fetch(`${stack.origin}/jobs/`)).text();
    expect(rendered).toContain(job.job.title);
    expect(rendered).toContain(prefix);
    const raw = await owner.client.from("jobs").select("*");
    expect(raw.error !== null).toBe(true);
  });
  it("retains all ten original specialization seeds and supports bilingual AND queries with combined filters", async () => {
    const seeded = await stack.sql.query(
      "select id,title,aliases from public.job_specializations order by id",
    );
    expect(seeded.rows).toEqual(
      careerPaths
        .map(({ id, title, aliases }) => ({ id, title, aliases }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    const job = await published({
      title: "Data insight engineer",
      specialization: "data-analytics-science",
      workplace: "Hybrid",
      level: "Senior",
      location: "Taipei",
    });
    const response = await search({
      q: `${prefix} 資料科學家`,
      workplace: "Hybrid",
      level: "Senior",
      location: "tai",
      track: "Engineering & data",
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.map((item: PublishedJob) => item.id)).toContain(job.id);
    expect(result.recipe).toBe("lexical-v1");
    expect(result.appliedFilters.q).toBe(`${prefix} 資料科學家`);
    expect(Object.keys(result.counts)).toHaveLength(10);
    expect(
      (await (await search({ q: `${prefix} 資料科學家`, workplace: "On-site" })).json()).data,
    ).toHaveLength(0);
    expect((await (await search({ q: `${prefix} % OR 1=1` })).json()).data).toHaveLength(0);
    expect((await stack.request("jobs?workplace=Anywhere")).status).toBe(400);
    expect((await stack.request("jobs?limit=2&limit=3")).status).toBe(400);
  });
  it("requires real admin authorization, review transitions and complete publication rights", async () => {
    expect((await stack.request("admin/catalog/jobs", owner, "POST", {})).status).toBe(403);
    expect((await stack.request("admin/catalog/jobs", undefined, "POST", {})).status).toBe(401);
    const restricted = await source(["title"]);
    const job = await draft({}, restricted);
    expect(
      (
        await stack.request(`admin/catalog/jobs/${job.id}/status`, admin, "POST", {
          expectedRevision: 1,
          status: "published",
        })
      ).status,
    ).toBe(409);
    await transition(job, "review");
    expect(
      (
        await stack.request(`admin/catalog/jobs/${job.id}/status`, admin, "POST", {
          expectedRevision: job.revision,
          status: "published",
        })
      ).status,
    ).toBe(403);
    expect((await find(job.id)).status).toBe(404);
    const invalid = await stack.request("admin/catalog/jobs", admin, "POST", {
      job: { ...baseJob, canonicalKey: `${prefix}-${++sequence}` },
      source: { sourceId: restricted, externalId: "bad-url", url: "https://other.invalid/" },
    });
    expect(invalid.status).toBe(400);
    const writes = await owner.client
      .from("jobs")
      .insert({ canonical_key: "forged", company_id: crypto.randomUUID(), status: "published" });
    expect(writes.error !== null).toBe(true);
  });
  it("deduplicates canonical openings and external source IDs without losing multiple sources", async () => {
    const job = await published();
    const secondSource = await source();
    const link = {
      sourceId: secondSource,
      externalId: `external-${++sequence}`,
      url: "https://jobs.test.invalid/second",
    };
    expect(
      (await stack.request(`admin/catalog/jobs/${job.id}/sources`, admin, "POST", link)).status,
    ).toBe(200);
    expect(
      (await stack.request(`admin/catalog/jobs/${job.id}/sources`, admin, "POST", link)).status,
    ).toBe(200);
    const detail = (await (await find(job.id)).json()).data;
    expect(detail.sources).toHaveLength(2);
    const results = (await (await search()).json()).data;
    expect(results.filter((item: PublishedJob) => item.id === job.id)).toHaveLength(1);
    const duplicate = await stack.request("admin/catalog/jobs", admin, "POST", {
      job: job.job,
      source: {
        sourceId: secondSource,
        externalId: `external-${++sequence}`,
        url: "https://jobs.test.invalid/duplicate",
      },
    });
    expect(duplicate.status).toBe(409);
    const externalDuplicate = await stack.request("admin/catalog/jobs", admin, "POST", {
      job: { ...job.job, canonicalKey: `${prefix}-${++sequence}` },
      source: link,
    });
    expect(externalDuplicate.status).toBe(409);
  });
  it("treats network failures as uncertain and closes only after the remaining source closes", async () => {
    const job = await published();
    const secondSource = await source();
    expect(
      (
        await stack.request(`admin/catalog/jobs/${job.id}/sources`, admin, "POST", {
          sourceId: secondSource,
          externalId: `external-${++sequence}`,
          url: "https://jobs.test.invalid/alternate",
        })
      ).status,
    ).toBe(200);
    const sources = (await (await find(job.id)).json()).data.sources as {
      id: string;
      lastValidatedAt: string | null;
    }[];
    const observe = (id: string, event: string) =>
      stack.request(`admin/catalog/observations/${id}/record`, admin, "POST", { event });
    expect((await observe(sources[0].id, "confirmed_active")).status).toBe(200);
    const lastValidated = (await (await find(job.id)).json()).data.sources.find(
      (source: { id: string }) => source.id === sources[0].id,
    ).lastValidatedAt;
    expect((await observe(sources[0].id, "network_failure")).status).toBe(200);
    const uncertain = (await (await find(job.id)).json()).data.sources.find(
      (source: { id: string }) => source.id === sources[0].id,
    );
    expect(uncertain.freshness).toBe("uncertain");
    expect(uncertain.lastValidatedAt).toBe(lastValidated);
    expect((await observe(sources[0].id, "confirmed_closed")).status).toBe(200);
    expect((await find(job.id)).status).toBe(200);
    expect((await observe(sources[0].id, "network_failure")).status).toBe(200);
    expect(
      (await (await find(job.id)).json()).data.sources.some(
        (source: { id: string }) => source.id === sources[0].id,
      ),
    ).toBe(false);
    expect((await observe(sources[1].id, "confirmed_closed")).status).toBe(200);
    expect((await find(job.id)).status).toBe(404);
    expect(
      (await stack.sql.query("select status from public.jobs where id=$1", [job.id])).rows[0]
        .status,
    ).toBe("expired");
  });
  it("revokes source rights immediately and requires a new review before republishing", async () => {
    const job = await published();
    expect(
      (
        await stack.request(`admin/catalog/sources/${job.sourceId}/status`, admin, "POST", {
          status: "revoked",
        })
      ).status,
    ).toBe(200);
    expect((await find(job.id)).status).toBe(404);
    expect(
      (
        await stack.request(`admin/catalog/sources/${job.sourceId}/status`, admin, "POST", {
          status: "active",
        })
      ).status,
    ).toBe(200);
    expect((await find(job.id)).status).toBe(404);
    job.revision = Number(
      (await stack.sql.query("select revision from public.jobs where id=$1", [job.id])).rows[0]
        .revision,
    );
    await transition(job, "published");
    expect((await find(job.id)).status).toBe(200);
  });
  it("keeps prior job versions immutable and rejects conflicting concurrent edits", async () => {
    const job = await published();
    const first = (await (await find(job.id)).json()).data;
    const results = await Promise.all(
      ["First edit", "Second edit"].map((title) =>
        stack.request(`admin/catalog/jobs/${job.id}`, admin, "PATCH", {
          expectedRevision: job.revision,
          job: { ...job.job, title },
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await find(job.id)).status).toBe(404);
    const old = await stack.sql.query("select title from public.job_versions where id=$1", [
      first.versionId,
    ]);
    expect(old.rows[0].title).toBe(first.title);
    const versions = await stack.sql.query(
      "select count(*)::int count from public.job_versions where job_id=$1",
      [job.id],
    );
    expect(versions.rows[0].count).toBe(2);
  });
  it("uses stable keyset pages and rejects a cursor after catalog changes or filter tampering", async () => {
    const tag = `${prefix} PageGroup`;
    for (let i = 0; i < 3; i++) await published({ title: `${tag} ${i}` });
    const first = await (await search({ q: tag, limit: 2 })).json();
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf("string");
    const next = await (await search({ q: tag, limit: 2, cursor: first.nextCursor })).json();
    expect(next.data).toHaveLength(1);
    expect(new Set([...first.data, ...next.data].map((item) => item.id)).size).toBe(3);
    expect((await search({ q: `${tag} changed`, cursor: first.nextCursor })).status).toBe(400);
    await published({ title: `${tag} new` });
    expect((await search({ q: tag, cursor: first.nextCursor })).status).toBe(409);
    expect((await search({ cursor: "malformed" })).status).toBe(400);
  });
  it("isolates private idempotent bookmarks and preserves saved snapshots after retirement", async () => {
    const job = await published();
    expect((await stack.request(`bookmarks/${job.id}`, undefined, "PUT", {})).status).toBe(401);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => stack.request(`bookmarks/${job.id}`, owner, "PUT", {})),
    );
    expect(results.every((response) => response.status === 200)).toBe(true);
    const list = await (await stack.request("bookmarks", owner)).json();
    expect(list.data).toHaveLength(1);
    expect(list.revision).toBe(1);
    expect(list.data[0].jobId).toBe(job.id);
    const others = await other.client.from("bookmarks").select("*");
    expect(others.error).toBeNull();
    expect(others.data).toEqual([]);
    expect((await (await stack.request("bookmarks", other)).json()).data).toEqual([]);
    const forged = await other.client
      .from("bookmarks")
      .insert({ user_id: owner.id, job_id: job.id });
    expect(forged.error !== null).toBe(true);
    await transition(job, "expired");
    expect((await find(job.id)).status).toBe(404);
    const retired = (await (await stack.request("bookmarks", owner)).json()).data[0];
    expect(retired).toMatchObject({ title: job.job.title, company: prefix, available: false });
    expect((await stack.request(`bookmarks/${job.id}`, owner, "PUT", {})).status).toBe(200);
    expect((await stack.request(`bookmarks/${job.id}`, other, "PUT", {})).status).toBe(404);
    expect((await stack.request(`bookmarks/${job.id}`, owner, "DELETE", {})).status).toBe(200);
    expect((await stack.request(`bookmarks/${job.id}`, owner, "DELETE", {})).status).toBe(200);
    expect((await (await stack.request("bookmarks", owner)).json()).revision).toBe(2);
  });
  it("excludes automatically expired and rejected jobs and does not expose private helper RPCs", async () => {
    const rejected = await draft();
    await transition(rejected, "review");
    await transition(rejected, "rejected");
    expect((await find(rejected.id)).status).toBe(404);
    const job = await published();
    await stack.sql.query(
      "update public.jobs set expires_at=now()-interval '1 second' where id=$1",
      [job.id],
    );
    expect((await find(job.id)).status).toBe(404);
    expect(
      (await (await search()).json()).data.some((item: PublishedJob) => item.id === job.id),
    ).toBe(false);
    const helper = await owner.client.rpc("catalog_job_json", { p_job: job.id });
    expect(helper.error !== null).toBe(true);
    const wrongOrigin = await stack.request(
      `bookmarks/${job.id}`,
      owner,
      "DELETE",
      {},
      { Origin: "https://other.invalid" },
    );
    expect(wrongOrigin.status).toBe(403);
  });
  it("browses guides anonymously and saves a published role from a real mobile browser", async () => {
    const job = await published({ title: `${prefix} BrowserRole` });
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${stack.origin}/jobs/`);
      await webExpect(
        page.getByRole("group", { name: "AI career specializations" }).getByRole("button"),
      ).toHaveCount(10);
      await page.getByLabel("Search jobs", { exact: true }).fill(`${prefix} BrowserRole`);
      await page.getByRole("button", { name: "Search published roles", exact: true }).click();
      await webExpect(page.getByRole("button", { name: job.job.title, exact: true })).toBeVisible();
      await page.getByRole("button", { name: job.job.title, exact: true }).click();
      await webExpect(page.getByRole("dialog")).toContainText("Unknown / not supplied");
      await webExpect(page.getByRole("dialog")).toContainText(
        "Demonstration listing; fictional data",
      );
      await page.getByRole("button", { name: "Close job details", exact: true }).click();
      await page.getByRole("button", { name: `Save ${job.job.title}`, exact: true }).click();
      await webExpect(
        page.getByRole("link", { name: "Sign in to save roles", exact: true }),
      ).toBeVisible();
      await context.addCookies(
        owner.cookie.split("; ").map((entry) => {
          const index = entry.indexOf("=");
          return {
            name: entry.slice(0, index),
            value: entry.slice(index + 1),
            url: stack.origin,
            httpOnly: true,
            sameSite: "Lax" as const,
          };
        }),
      );
      await page.reload();
      await page.getByLabel("Search jobs", { exact: true }).fill(`${prefix} BrowserRole`);
      await page.getByRole("button", { name: "Search published roles", exact: true }).click();
      await page.getByRole("button", { name: `Save ${job.job.title}`, exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText("Role saved privately");
      await page.getByRole("button", { name: "My saved roles", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: job.job.title, exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByRole("button", { name: "My saved roles", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: job.job.title, exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/catalog-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Browse roles", exact: true }).click();
      await page.getByLabel("Search jobs", { exact: true }).fill(`${prefix} BrowserRole`);
      await page.getByRole("button", { name: "Search published roles", exact: true }).click();
      await webExpect(page.getByRole("button", { name: job.job.title, exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/catalog-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await browser.close();
    }
  });
  it("serves public catalog API and rendered jobs with no service key or identity backend", async () => {
    const port = 3310;
    await new Promise<void>((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
    });
    const server = spawn(process.execPath, [".next/standalone/server.js"], {
      stdio: "ignore",
      env: {
        ...process.env,
        HOSTNAME: "127.0.0.1",
        PORT: String(port),
        ROLEFOUNDRY_CATALOG_ENABLED: "true",
        ROLEFOUNDRY_IDENTITY_ENABLED: "false",
        SUPABASE_URL: stack.env.API_URL,
        SUPABASE_ANON_KEY: stack.env.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (server.exitCode !== null) throw Error("Owned public-only server exited.");
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/v1/jobs/`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(ready).toBe(true);
      expect((await fetch(`http://127.0.0.1:${port}/api/v1/courses/`)).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/api/v1/identity/session/`)).status).toBe(503);
      const rendered = await (await fetch(`http://127.0.0.1:${port}/jobs/`)).text();
      expect(rendered).toContain(prefix);
    } finally {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once("close", () => resolve());
      });
    }
  });
});
