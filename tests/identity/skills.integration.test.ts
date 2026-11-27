import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { normalizeSkillTerm, type SkillDictionary } from "../../src/modules/skills/model";
import { publicationFields } from "../../src/modules/jobs/model";
let stack: LocalFixtures, admin: LocalMember, owner: LocalMember;
const prefix = `rf-skill-${crypto.randomUUID().slice(0, 8)}`;
let sequence = 0;
const jobIds: string[] = [];
async function get(version?: number): Promise<SkillDictionary> {
  const response = await stack.request(`skills${version ? `?version=${version}` : ""}`);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function mutate(path: string, input: Record<string, unknown>, method = "POST") {
  return stack.request(`admin/skills${path}`, admin, method, {
    expectedVersion: (await get()).version,
    reason: "Isolated local dictionary fixture",
    ...input,
  });
}
async function create(label?: string) {
  const id = `${prefix}-${++sequence}`;
  const response = await mutate("", {
    id,
    nameEn: label || `Fixture concept ${id}`,
    nameZhTw: `測試概念 ${id}`,
    description: "Owned integration fixture",
  });
  expect(response.status).toBe(201);
  return id;
}
async function alias(skillId: string, term: string, locale = "en") {
  const response = await mutate("/aliases", { skillId, alias: term, locale });
  expect(response.status).toBe(201);
}
async function resolve(term: string, locale?: string, version?: number) {
  const response = await stack.request(
    `skills/resolve?${new URLSearchParams({ term, ...(locale ? { locale } : {}), ...(version ? { version: String(version) } : {}) })}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function addEvidence(skills: string[], revision = 0, user = owner) {
  const response = await stack.request("evidence", user, "POST", {
    expectedRevision: revision,
    evidence: {
      source: "self-report",
      label: `Fixture ${prefix}`,
      context: "A claimed observation",
      observedAt: "2026-11-01T00:00:00Z",
      skills,
      claimedLevel: 1,
    },
  });
  expect(response.status).toBe(201);
  return (await response.json()).data.evidence;
}
async function job(skills: string[]) {
  const source = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Local fixture",
    authorizationBasis: "Authored isolated test data",
    rightsSummary: "Fictional test data",
    allowedHosts: ["skills.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(source.status).toBe(201);
  const sourceId = (await source.json()).data.id;
  const response = await stack.request("admin/catalog/jobs", admin, "POST", {
    job: {
      canonicalKey: `${prefix}-${++sequence}`,
      company: prefix,
      title: "Dictionary integration fixture",
      track: "Engineering & data",
      specialization: "ai-llm-applications",
      location: null,
      workplace: null,
      level: null,
      salary: null,
      summary: "Source skill join test",
      responsibilities: [],
      requirements: [{ text: "A reviewed concept", priority: "mandatory", skills }],
      conditions: { workAuthorization: null, education: null, experienceYears: null },
      expiresAt: null,
    },
    source: { sourceId, externalId: `${++sequence}`, url: "https://skills.test.invalid/role" },
  });
  expect(response.status).toBe(201);
  const id = (await response.json()).data.id;
  jobIds.push(id);
  for (const [expectedRevision, status] of [
    [1, "review"],
    [2, "published"],
  ])
    expect(
      (
        await stack.request(`admin/catalog/jobs/${id}/status`, admin, "POST", {
          expectedRevision,
          status,
        })
      ).status,
    ).toBe(200);
  return id;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  owner = await stack.member();
});
afterAll(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  await stack.sql.query("delete from public.evidence where user_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.bookmarks where job_id=any($1::uuid[])", [jobIds]);
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select r.id from public.job_requirements r join public.job_versions v on v.id=r.job_version_id where v.job_id=any($1::uuid[]))",
    [jobIds],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
    [jobIds],
  );
  await stack.sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [jobIds]);
  await stack.sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [jobIds]);
  await stack.sql.query("delete from public.jobs where id=any($1::uuid[])", [jobIds]);
  await stack.sql.query("delete from public.sources where name=$1", [prefix]);
  await stack.sql.query("delete from public.companies where name=$1", [prefix]);
  await stack.sql.query(
    "delete from public.dictionary_change_outbox where version in(select version from public.dictionary_audit where actor_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query("delete from public.dictionary_audit where actor_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.sql.query("delete from public.catalog_audit where actor_id=any($1::uuid[])", [ids]);
  // Restore only this suite's current registry entries; immutable historical snapshots remain valid.
  const connection = await stack.sql.connect();
  try {
    await connection.query("begin");
    await connection.query(
      "select pg_advisory_xact_lock(hashtextextended('catalog:write',0)),pg_advisory_xact_lock(hashtextextended('dictionary:write',0))",
    );
    await connection.query("delete from public.skill_aliases where skill_id like $1", [
      `${prefix}%`,
    ]);
    await connection.query(
      "delete from public.skill_relations where parent_id like $1 or child_id like $1",
      [`${prefix}%`],
    );
    await connection.query("delete from public.track_skills where skill_id like $1", [
      `${prefix}%`,
    ]);
    await connection.query("delete from public.skills where id like $1", [`${prefix}%`]);
    await connection.query(
      "with bumped as(update public.dictionary_state set version=version+1 returning version) insert into public.dictionary_versions(version,snapshot) select version,public.dictionary_snapshot() from bumped",
    );
    await connection.query("update public.catalog_state set revision=revision+1");
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
  await stack.close();
});
describe("module 04 real dictionary, historical mappings and consumer joins", () => {
  it("publishes bilingual current and historical snapshots without exposing operational records", async () => {
    const initial = await get(1);
    expect(initial.skills).toHaveLength(9);
    expect(initial.skills.find((skill) => skill.id === "rag")?.nameZhTw).toBe("RAG 與檢索");
    expect((await stack.request("skills?version=999999999")).status).toBe(404);
    expect((await stack.request("skills?version=-1")).status).toBe(400);
    for (const table of ["dictionary_audit", "dictionary_versions", "skill_aliases"]) {
      const result = await owner.client.from(table).select("*");
      expect(result.error !== null).toBe(true);
    }
  });
  it("matches JavaScript/SQL normalization while retaining C++, C# and non-English aliases", async () => {
    const a = await create();
    const b = await create();
    const term = `${prefix} Ｃ＋＋  —  開發`;
    await alias(a, term, "zh-TW");
    await alias(b, `${prefix} C#`);
    const result = await resolve(` ${prefix} C++ - 開發\t`, "zh-TW");
    expect(result).toMatchObject({
      status: "resolved",
      skillId: a,
      normalizedTerm: normalizeSkillTerm(term),
    });
    expect((await resolve(`${prefix} C#`)).skillId).toBe(b);
    expect((await resolve(`${prefix} C++`)).status).toBe("unresolved");
  });
  it("reports ambiguous cross-language aliases and never guesses an unapproved phrase", async () => {
    const a = await create(),
      b = await create();
    const term = `${prefix} capability`;
    await alias(a, term, "en");
    await alias(b, term, "zh-TW");
    const ambiguous = await resolve(term);
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.skillId).toBeNull();
    expect(ambiguous.candidates.sort()).toEqual([a, b].sort());
    expect((await resolve(term, "en")).skillId).toBe(a);
    expect((await resolve(term, "zh-TW")).skillId).toBe(b);
    expect((await resolve(`${term} typo`)).status).toBe("unresolved");
  });
  it("rejects non-admin writes, alias conflicts and direct forged mappings", async () => {
    const version = (await get()).version;
    expect(
      (
        await stack.request("admin/skills/aliases", owner, "POST", {
          expectedVersion: version,
          skillId: "python",
          locale: "en",
          alias: prefix,
          reason: "Not authorized",
        })
      ).status,
    ).toBe(403);
    expect((await stack.request("admin/skills", undefined, "POST", {})).status).toBe(401);
    const raw = await owner.client.rpc("dictionary_add_alias", {
      p_expected: version,
      p_skill: "python",
      p_locale: "en",
      p_alias: prefix,
      p_reason: "Forgery",
    });
    expect(raw.error?.message).toBe("RF_FORBIDDEN");
    const a = await create();
    await alias(a, `${prefix} duplicate`);
    expect(
      (await mutate("/aliases", { skillId: a, alias: `  ${prefix}   DUPLICATE `, locale: "en" }))
        .status,
    ).toBe(409);
    expect((await mutate("/aliases", { skillId: a, alias: "python", locale: "en" })).status).toBe(
      409,
    );
    const write = await owner.client
      .from("skills")
      .update({ name_en: "Forged" })
      .eq("id", "python");
    expect(write.error !== null).toBe(true);
  });
  it("serializes optimistic mutations and commits one immutable version plus audit event", async () => {
    const version = (await get()).version;
    const responses = await Promise.all(
      [1, 2].map((index) =>
        stack.request("admin/skills", admin, "POST", {
          expectedVersion: version,
          id: `${prefix}-race-${index}`,
          nameEn: `${prefix} Race ${index}`,
          nameZhTw: `競爭 ${index}`,
          description: "",
          reason: "Concurrent fixture",
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await get()).version).toBe(version + 1);
    const audit = await stack.sql.query(
      "select action,reason from public.dictionary_audit where version=$1",
      [version + 1],
    );
    expect(audit.rows).toEqual([{ action: "skill.created", reason: "Concurrent fixture" }]);
  });
  it("preserves IDs and historical labels while publishing new approved names", async () => {
    const id = await create();
    const before = await get();
    const original = before.skills.find((skill) => skill.id === id)!;
    expect(
      (
        await mutate(
          `/${id}`,
          {
            nameEn: `${prefix} Renamed`,
            nameZhTw: "重新命名的概念",
            description: "An editorial clarification",
            status: "active",
          },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const after = await get();
    expect(after.skills.find((skill) => skill.id === id)?.nameEn).toBe(`${prefix} Renamed`);
    expect((await get(before.version)).skills.find((skill) => skill.id === id)?.nameEn).toBe(
      original.nameEn,
    );
    expect((await resolve(original.nameEn)).skillId).toBe(id);
    expect((await resolve(`${prefix} Renamed`)).skillId).toBe(id);
    expect((await resolve(`${prefix} Renamed`, undefined, before.version)).status).toBe(
      "unresolved",
    );
  });
  it("rejects prerequisite/hierarchy cycles, self references and unsupported relation types", async () => {
    const a = await create(),
      b = await create(),
      c = await create();
    for (const [parentId, childId] of [
      [a, b],
      [b, c],
    ])
      expect(
        (await mutate("/relations", { parentId, childId, relation: "prerequisite" })).status,
      ).toBe(201);
    expect(
      (await mutate("/relations", { parentId: c, childId: a, relation: "prerequisite" })).status,
    ).toBe(409);
    expect(
      (await mutate("/relations", { parentId: a, childId: a, relation: "prerequisite" })).status,
    ).toBe(400);
    expect(
      (await mutate("/relations", { parentId: a, childId: c, relation: "implies-mastery" })).status,
    ).toBe(400);
    expect(
      (await mutate("/relations", { parentId: b, childId: a, relation: "broader-than" })).status,
    ).toBe(201);
    expect(
      (await mutate("/relations", { parentId: a, childId: b, relation: "broader-than" })).status,
    ).toBe(409);
  });
  it("migrates canonical joins atomically while retaining original evidence and job source IDs", async () => {
    const a = await create(),
      b = await create();
    const evidence = await addEvidence([a, b]);
    const jobId = await job([a, b]);
    const before = await get();
    expect((await mutate("/merge", { fromId: a, toId: b })).status).toBe(200);
    const mapped = await resolve(a);
    expect(mapped).toMatchObject({ status: "resolved", skillId: b, redirectedFrom: a });
    expect((await resolve(a, undefined, before.version)).skillId).toBe(a);
    const rows = await stack.sql.query(
      "select skill_id,canonical_skill_id from public.evidence_skill_links where evidence_version_id=$1 order by skill_id",
      [evidence.versionId],
    );
    expect(rows.rows).toEqual(
      [a, b].sort().map((skill_id) => ({ skill_id, canonical_skill_id: b })),
    );
    const historical = (await (await stack.request(`evidence/${evidence.id}`, owner)).json())
      .data[0];
    expect(historical.skills.sort()).toEqual([a, b].sort());
    expect(historical.canonicalSkills).toEqual([b]);
    expect(historical.dictionaryVersion).toBe(before.version);
    const published = (await (await stack.request(`jobs/${jobId}`)).json()).data;
    expect(published.requirements[0]).toMatchObject({ skills: [b], sourceSkills: [a, b].sort() });
    // Learner-facing labels carry the reviewed zh-TW name next to English.
    expect(published.requirements[0].skillLabelsZhTw).toEqual({ [b]: `測試概念 ${b}` });
    expect(published.sourceDictionaryVersion).toBe(before.version);
  });
  it("rolls back cyclic merges, retains redirect chains and migrates reviewed track priorities", async () => {
    const a = await create(),
      b = await create(),
      c = await create(),
      d = await create();
    for (const [parentId, childId] of [
      [a, b],
      [b, c],
    ])
      expect(
        (await mutate("/relations", { parentId, childId, relation: "prerequisite" })).status,
      ).toBe(201);
    const version = (await get()).version;
    expect((await mutate("/merge", { fromId: a, toId: c })).status).toBe(409);
    expect((await get()).version).toBe(version);
    expect((await resolve(a)).skillId).toBe(a);
    expect(
      (await mutate("/relations", { parentId: b, childId: c, relation: "prerequisite" }, "DELETE"))
        .status,
    ).toBe(200);
    for (const [skillId, priority] of [
      [a, 2],
      [c, 5],
    ] as const)
      expect(
        (await mutate("/tracks", { track: "Engineering & data", skillId, priority })).status,
      ).toBe(200);
    expect((await mutate("/merge", { fromId: a, toId: c })).status).toBe(200);
    expect((await get()).trackSkills.find((mapping) => mapping.skillId === c)?.priority).toBe(2);
    expect((await mutate("/merge", { fromId: c, toId: d })).status).toBe(200);
    expect((await resolve(a)).skillId).toBe(d);
    expect(
      (await mutate("/tracks", { track: "Engineering & data", skillId: d }, "DELETE")).status,
    ).toBe(200);
  });
  it("invalidates evidence pagination and catalogue aliases after dictionary-only changes", async () => {
    const user = await stack.member();
    const a = await create();
    for (let revision = 0; revision < 3; revision++) await addEvidence([a], revision, user);
    const first = await (await stack.request("evidence?limit=2", user)).json();
    expect(first.nextCursor).toBeTypeOf("string");
    const role = await job([a]);
    const phrase = `${prefix} 中文新別名`;
    await alias(a, phrase, "zh-TW");
    expect((await stack.request(`evidence?limit=2&cursor=${first.nextCursor}`, user)).status).toBe(
      409,
    );
    expect((await (await stack.request("profile", user)).json()).data.revision).toBe(3);
    const found = await (await stack.request(`jobs?${new URLSearchParams({ q: phrase })}`)).json();
    expect(found.data.some((item: { id: string }) => item.id === role)).toBe(true);
    expect((await mutate("/aliases", { locale: "zh-TW", alias: phrase }, "DELETE")).status).toBe(
      200,
    );
    expect((await resolve(phrase)).status).toBe("unresolved");
  });

  it("includes a registered replacement projection without coupling merge to a domain table name", async () => {
    const from = await create(),
      to = await create();
    const tableName = `rf_projection_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await stack.sql.query(
        `create table public.${tableName}(source_skill text not null references public.skills(id),resolved_skill text not null references public.skills(id))`,
      );
      await stack.sql.query(`insert into public.${tableName} values($1,$1)`, [from]);
      await stack.sql.query(
        "insert into public.dictionary_link_targets values('public',$1,'resolved_skill')",
        [tableName],
      );
      expect((await mutate("/merge", { fromId: from, toId: to })).status).toBe(200);
      expect((await stack.sql.query(`select * from public.${tableName}`)).rows).toEqual([
        { source_skill: from, resolved_skill: to },
      ]);
      expect((await owner.client.from("dictionary_link_targets").select("*")).error !== null).toBe(
        true,
      );
    } finally {
      await stack.sql.query(
        "delete from public.dictionary_link_targets where schema_name='public' and table_name=$1",
        [tableName],
      );
      await stack.sql.query(`drop table if exists public.${tableName}`);
    }
  });
  it("retains deprecated evidence and its label snapshot while rejecting new claims", async () => {
    const id = await create();
    const user = await stack.member();
    const original = (await get()).skills.find((skill) => skill.id === id)!;
    const evidence = await addEvidence([id], 0, user);
    expect(
      (
        await mutate(
          `/${id}`,
          {
            nameEn: id,
            nameZhTw: "已停用的測試概念",
            description: "Historical only",
            status: "deprecated",
          },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const history = (await (await stack.request(`evidence/${evidence.id}`, user)).json()).data[0];
    expect(history.skills).toEqual([id]);
    expect(history.skillLabels[id]).toBe(original.nameEn);
    // The zh-TW label is pinned to the recorded dictionary version, not the later rename.
    expect(history.skillLabelsZhTw[id]).toBe(original.nameZhTw);
    expect((await get()).skills.find((skill) => skill.id === id)?.status).toBe("deprecated");
    const response = await stack.request("evidence", user, "POST", {
      expectedRevision: 1,
      evidence: {
        source: "self-report",
        label: "New claim",
        context: "",
        observedAt: "2026-11-01T00:00:00Z",
        skills: [id],
        claimedLevel: 1,
      },
    });
    expect(response.status).toBe(400);
  });
  it("serializes concurrent evidence creation and merging without changing original claims", async () => {
    const a = await create(),
      b = await create();
    const user = await stack.member();
    const version = (await get()).version;
    const [evidence, merged] = await Promise.all([
      addEvidence([a], 0, user),
      stack.request("admin/skills/merge", admin, "POST", {
        expectedVersion: version,
        fromId: a,
        toId: b,
        reason: "Concurrent join fixture",
      }),
    ]);
    expect(merged.status).toBe(200);
    const raw = await stack.sql.query(
      "select skill_id,canonical_skill_id from public.evidence_skill_links where evidence_version_id=$1",
      [evidence.versionId],
    );
    expect(raw.rows).toEqual([{ skill_id: a, canonical_skill_id: b }]);
  });
  it("creates a runtime skill in the admin UI and uses it in profile evidence and public resolution", async () => {
    const browser = await chromium.launch();
    const id = `${prefix}-browser`;
    const name = `${prefix} Browser concept`;
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies(
        admin.cookie.split("; ").map((entry) => {
          const i = entry.indexOf("=");
          return {
            name: entry.slice(0, i),
            value: entry.slice(i + 1),
            url: stack.origin,
            httpOnly: true,
            sameSite: "Lax" as const,
          };
        }),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${stack.origin}/dictionary/`);
      await page.getByRole("button", { name: "Add canonical skill", exact: true }).click();
      await page.getByLabel("Stable skill ID", { exact: true }).fill(id);
      await page.getByLabel("English name", { exact: true }).fill(name);
      await page.getByLabel("Traditional Chinese name", { exact: true }).fill("瀏覽器測試概念");
      await page
        .getByLabel("Skill change reason", { exact: true })
        .fill("Browser fixture authoring");
      await page.getByRole("button", { name: "Publish new skill", exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText("Dictionary version published");
      await page.getByLabel("Filter skill concepts", { exact: true }).fill(id);
      await webExpect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/dictionary-admin-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
      await page.goto(`${stack.origin}/skills/`);
      await page.getByRole("button", { name: "Add claim or reference", exact: true }).click();
      await page.getByLabel("Evidence label", { exact: true }).fill("Runtime dictionary claim");
      await page.getByRole("checkbox", { name, exact: true }).check();
      await page.getByRole("button", { name: "Add evidence", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "Runtime dictionary claim", exact: true }),
      ).toBeVisible();
      await webExpect(page.locator(".profile-evidence-card")).toContainText(name);
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await mobile.goto(`${stack.origin}/dictionary/`);
      await mobile.getByLabel("Skill term", { exact: true }).fill(name);
      await mobile.getByRole("button", { name: "Resolve term", exact: true }).click();
      await webExpect(mobile.getByRole("status")).toContainText(`Resolved: ${name}`);
      await mobile.getByLabel("Filter skill concepts", { exact: true }).fill(id);
      expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await webExpect(
        mobile.getByRole("heading", { name: "Dictionary administration", exact: true }),
      ).toHaveCount(0);
      await mobile.evaluate(() => window.scrollTo(0, 0));
      await mobile.screenshot({
        path: ".local/dictionary-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
