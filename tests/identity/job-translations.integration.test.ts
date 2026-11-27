import { afterAll, beforeAll, expect, it } from "vitest";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { publicationFields, publishedJobSchema } from "../../src/modules/jobs/model";

let stack: LocalFixtures, admin: LocalMember, member: LocalMember;
const prefix = `rf-translation-${crypto.randomUUID().slice(0, 8)}`;
let jobId = "";

const draft = (summary: string) => ({
  canonicalKey: prefix,
  company: prefix,
  title: "AI Application Engineer",
  track: "Engineering & data",
  specialization: "ai-llm-applications",
  location: null,
  workplace: null,
  level: null,
  salary: null,
  summary,
  responsibilities: ["Design evaluation sets", "Ship retrieval features"],
  requirements: [{ text: "Python", priority: "mandatory", skills: ["python"] }],
  conditions: { workAuthorization: null, education: null, experienceYears: null },
  expiresAt: null,
});
const published = async () => {
  const response = await stack.request(`jobs/${jobId}`);
  expect(response.status).toBe(200);
  return publishedJobSchema.parse((await response.json()).data);
};
const translation = (versionId: string, responsibilities = ["設計評估資料集", "交付檢索功能"]) => ({
  versionId,
  locale: "zh-TW",
  title: "AI 應用工程師",
  summary: "打造可靠的 AI 產品。",
  responsibilities,
  reviewNote: "Synthetic fixture reviewed against the published listing",
});
const put = (body: unknown, user = admin) =>
  stack.request(`admin/catalog/jobs/${jobId}/translations`, user, "POST", body);
const transition = (expectedRevision: number, status: string) =>
  stack.request(`admin/catalog/jobs/${jobId}/status`, admin, "POST", { expectedRevision, status });

beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  const source = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Local fixture",
    authorizationBasis: "Authored isolated test data",
    rightsSummary: "Fictional test data",
    allowedHosts: ["translations.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(source.status).toBe(201);
  const created = await stack.request("admin/catalog/jobs", admin, "POST", {
    job: draft("Build reliable AI products."),
    source: {
      sourceId: (await source.json()).data.id,
      externalId: "1",
      url: "https://translations.test.invalid/role",
    },
  });
  expect(created.status).toBe(201);
  jobId = (await created.json()).data.id;
  expect((await transition(1, "review")).status).toBe(200);
  expect((await transition(2, "published")).status).toBe(200);
});

afterAll(async () => {
  if (!stack) return;
  if (jobId) {
    for (const statement of [
      "delete from public.job_skill_links where requirement_id in(select r.id from public.job_requirements r join public.job_versions v on v.id=r.job_version_id where v.job_id=$1)",
      "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=$1)",
      "delete from public.job_versions where job_id=$1",
      "delete from public.job_sources where job_id=$1",
      "delete from public.catalog_audit where resource_id=$1",
      "delete from public.jobs where id=$1",
    ])
      await stack.sql.query(statement, [jobId]);
  }
  await stack.sql.query("delete from public.sources where name=$1", [prefix]);
  await stack.sql.query("delete from public.companies where name=$1", [prefix]);
  await stack.close();
});

it("publishes reviewed translations for the exact current version only", async () => {
  const first = await published();
  expect(first.translations).toEqual({});
  // Members cannot translate; malformed or misaligned text is rejected before storage.
  expect((await put(translation(first.versionId), member)).status).toBe(403);
  expect((await put(translation(first.versionId, ["只有一行"]))).status).toBe(400);
  expect((await put({ ...translation(first.versionId), locale: "ja" })).status).toBe(400);
  expect((await put(translation(crypto.randomUUID()))).status).toBe(409);

  expect((await put(translation(first.versionId))).status).toBe(200);
  const translated = await published();
  expect(translated.translations?.["zh-TW"]).toMatchObject({
    title: "AI 應用工程師",
    responsibilities: ["設計評估資料集", "交付檢索功能"],
  });
  const audit = await stack.sql.query(
    "select action from public.catalog_audit where resource_id=$1 and action='job.translated'",
    [jobId],
  );
  expect(audit.rows).toHaveLength(1);

  // A revision creates a new version: the old translation is hidden until reviewed again.
  const revised = await stack.request(`admin/catalog/jobs/${jobId}`, admin, "PATCH", {
    expectedRevision: first.revision,
    job: draft("Build reliable, evaluated AI products."),
  });
  expect(revised.status).toBe(200);
  const revision = (await revised.json()).data.revision;
  expect((await transition(revision, "published")).status).toBe(200);
  const second = await published();
  expect(second.versionId).not.toBe(first.versionId);
  expect(second.translations).toEqual({});
  expect((await put(translation(first.versionId))).status).toBe(409);

  expect((await put(translation(second.versionId))).status).toBe(200);
  const removal = await stack.request(
    `admin/catalog/jobs/${jobId}/translations/remove`,
    admin,
    "POST",
    { versionId: second.versionId, locale: "zh-TW" },
  );
  expect(removal.status).toBe(200);
  expect((await published()).translations).toEqual({});
});
