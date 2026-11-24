import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { publicationFields } from "../../src/modules/jobs/model";
import {
  courseFields,
  courseSchema,
  planSchema,
  learningSnapshotSchema,
  type CourseDraft,
  type LearningSnapshot,
} from "../../src/modules/learning/model";
import { planLearning } from "../../src/modules/learning/planner";
import { RuleLearningGapAnalyzer } from "../../src/modules/learning/adapters/matching";
let stack: LocalFixtures, admin: LocalMember;
const prefix = `rf-learn-${crypto.randomUUID()}`;
let sequence = 0,
  sourceId: string,
  jobId: string;
const conceptIds: string[] = [],
  providerIds: string[] = [];
const courseIds: string[] = [],
  sourceIds: string[] = [],
  jobIds: string[] = [];
type CourseRecord = { id: string; revision: number; draft: CourseDraft };
let foundation: CourseRecord, target: CourseRecord;
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
async function source() {
  const response = await stack.request("admin/courses/sources", admin, "POST", {
    providerId: "deeplearning-ai",
    name: `${prefix}-${++sequence}`,
    publisher: "Local fixture publisher",
    authorizationBasis: `Private source policy ${prefix}`,
    rightsSummary: "Fictional metadata, not a real provider offering",
    allowedHosts: ["www.deeplearning.ai"],
    permittedFields: courseFields,
    isDemo: true,
  });
  expect(response.status).toBe(201);
  const id = (await response.json()).data.id;
  sourceIds.push(id);
  return id as string;
}
async function course(overrides: Partial<CourseDraft> = {}, publish = true) {
  const draft: CourseDraft = {
    key: `${prefix}-${++sequence}`,
    providerId: "deeplearning-ai",
    sourceId,
    title: `${prefix} learning ${sequence}`,
    url: `https://www.deeplearning.ai/courses/${prefix}-${sequence}/`,
    summary: "Authored fictional metadata for isolated tests",
    skills: ["content"],
    prerequisiteSkills: [],
    prerequisiteCourseIds: [],
    language: "en",
    difficulty: "Beginner",
    format: "Course",
    officialMinutes: 45,
    editorialMinutes: null,
    durationNote: "Fictional reviewed duration, not a real provider fact",
    practice: {
      prompt: "Build a small example and test it",
      completionCriteria: "Keep the example, constraints and test result",
      minutes: 15,
    },
    ...overrides,
  };
  const response = await stack.request("admin/courses", admin, "POST", draft);
  expect(response.status).toBe(201);
  const record = { ...(await response.json()).data, draft } as CourseRecord;
  courseIds.push(record.id);
  if (publish) {
    await transition(record, "review");
    await transition(record, "publish");
  }
  return record;
}
async function transition(record: CourseRecord, action: string) {
  const response = await stack.request(`admin/courses/${record.id}/transition`, admin, "POST", {
    expectedRevision: record.revision,
    action,
    reason: "Isolated fixture source/content review",
  });
  expect(response.status).toBe(200);
  record.revision++;
}
async function job(skills = ["rag"]) {
  const policy = await stack.request("admin/catalog/sources", admin, "POST", {
    name: `${prefix}-jobs-${++sequence}`,
    publisher: "Local job fixture",
    authorizationBasis: "Authored fictional metadata",
    rightsSummary: "Not a real opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(policy.status).toBe(201);
  const id = (await policy.json()).data.id;
  sourceIds.push(id);
  const created = await stack.request("admin/catalog/jobs", admin, "POST", {
    job: {
      canonicalKey: `${prefix}-job-${sequence}`,
      company: prefix,
      title: `${prefix} target role`,
      track: "Engineering & data",
      specialization: "ai-llm-applications",
      location: null,
      workplace: null,
      level: null,
      salary: null,
      summary: "Fictional target for learning",
      responsibilities: [],
      requirements: [{ text: "Demonstrate the listed skills", priority: "mandatory", skills }],
      conditions: { workAuthorization: null, education: null, experienceYears: null },
      expiresAt: null,
    },
    source: {
      sourceId: id,
      externalId: `${prefix}-${sequence}`,
      url: `https://jobs.test.invalid/${sequence}`,
    },
  });
  expect(created.status).toBe(201);
  const record = (await created.json()).data;
  jobIds.push(record.id);
  for (const status of ["review", "published"]) {
    const response = await stack.request(`admin/catalog/jobs/${record.id}/status`, admin, "POST", {
      expectedRevision: record.revision,
      status,
    });
    expect(response.status).toBe(200);
    record.revision = (await response.json()).data.revision;
  }
  return record.id as string;
}
async function start(
  owner: LocalMember,
  hours = 1,
  id = jobId,
  key = crypto.randomUUID(),
  overrides: { courseId: string; minutes: number }[] = [],
) {
  const response = await stack.request(
    "learning-plans",
    owner,
    "POST",
    { jobId: id, weeklyHours: hours, durationOverrides: overrides },
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data as { planId: string; taskId: string };
}
async function find(owner: LocalMember, id: string) {
  const response = await stack.request(`learning-plans/${id}`, owner);
  expect(response.status).toBe(200);
  return planSchema.parse((await response.json()).data);
}
async function lease(taskId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await stack.privileged.rpc("task_read", {
      p_worker: crypto.randomUUID(),
      p_kinds: ["learning.plan"],
      p_seconds: 5,
      p_quantity: 8,
    });
    checked(response.error);
    const leases = response.data as { taskId: string; token: string; messageId: string }[];
    for (const other of leases.filter((item) => item.taskId !== taskId))
      checked(
        (await stack.privileged.rpc("task_release", { p_task: other.taskId, p_token: other.token }))
          .error,
      );
    const selected = leases.find((item) => item.taskId === taskId);
    if (selected) return selected;
  }
  throw Error("Owned learning task not visible");
}
async function load(task: { taskId: string; token: string }): Promise<LearningSnapshot> {
  const result = await stack.privileged.rpc("learning_load_task", {
    p_task: task.taskId,
    p_token: task.token,
  });
  checked(result.error);
  return learningSnapshotSchema.parse(result.data);
}
function compute(input: LearningSnapshot) {
  return planLearning(input, new RuleLearningGapAnalyzer().analyze(input.matching));
}
async function publish(task: { taskId: string; token: string }, output: unknown) {
  return stack.privileged.rpc("learning_publish_task", {
    p_task: task.taskId,
    p_token: task.token,
    p_output: output,
  });
}
async function worker() {
  const chunks: string[] = [];
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts", "--drain"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: stack.env.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
          WORKER_LEASE_SECONDS: "5",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (data) => chunks.push(data.toString()));
    child.stderr.on("data", (data) => chunks.push(data.toString()));
    child.on("close", resolve);
    child.on("error", reject);
  });
  expect(code).toBe(0);
  const log = chunks.join("");
  expect(log).not.toContain(stack.env.SERVICE_ROLE_KEY);
  return log;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  sourceId = await source();
  foundation = await course({ skills: ["python"] });
  target = await course({
    skills: ["rag"],
    prerequisiteSkills: ["python"],
    prerequisiteCourseIds: [foundation.id],
  });
  jobId = await job();
});
afterEach(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  await stack.sql.query(
    "update public.tasks set status='failed',safe_error='RF_CANCELED',lease_token=null,lease_expires_at=null where user_id=any($1::uuid[]) and status in ('queued','running')",
    [ids],
  );
  const rows = await stack.sql.query(
    "select queue_message_id from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
    [ids],
  );
  for (const row of rows.rows)
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      row.queue_message_id,
    ]);
});
afterAll(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  await stack.sql.query(
    "delete from pgmq.a_rolefoundry_tasks where message->>'taskId' in(select id::text from public.tasks where user_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query("delete from public.learning_plans where user_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.learning_progress where user_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.sql.query(
    "delete from public.course_prerequisites where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courseIds],
  );
  await stack.sql.query(
    "delete from public.course_skill_links where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courseIds],
  );
  await stack.sql.query("delete from public.course_url_registry where course_id=any($1::uuid[])", [
    courseIds,
  ]);
  await stack.sql.query("delete from public.course_versions where course_id=any($1::uuid[])", [
    courseIds,
  ]);
  await stack.sql.query("delete from public.courses where id=any($1::uuid[])", [courseIds]);
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
  await stack.sql.query("delete from public.sources where id=any($1::uuid[])", [sourceIds]);
  await stack.sql.query("delete from public.course_audit where actor_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.catalog_audit where actor_id=any($1::uuid[])", [ids]);
  await stack.sql.query(
    "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=public.companies.id)",
    [prefix],
  );
  if (conceptIds.length) {
    const connection = await stack.sql.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select pg_advisory_xact_lock(hashtextextended('catalog:write',0)),pg_advisory_xact_lock(hashtextextended('dictionary:write',0))",
      );
      await connection.query("delete from public.skill_aliases where skill_id=any($1::text[])", [
        conceptIds,
      ]);
      await connection.query(
        "delete from public.skill_relations where parent_id=any($1::text[]) or child_id=any($1::text[])",
        [conceptIds],
      );
      await connection.query("delete from public.track_skills where skill_id=any($1::text[])", [
        conceptIds,
      ]);
      await connection.query("delete from public.skills where id=any($1::text[])", [conceptIds]);
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
  }
  await stack.sql.query(
    "delete from public.dictionary_change_outbox where version in(select version from public.dictionary_audit where actor_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query("delete from public.dictionary_audit where actor_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.sql.query("delete from public.course_providers where id=any($1::text[])", [
    providerIds,
  ]);
  await stack.close();
});
describe("module 07 reviewed courses and private learning plans", () => {
  it("serves reviewed metadata anonymously without private source policies and hides drafts", async () => {
    const hidden = await course({}, false);
    expect((await stack.request(`courses/${hidden.id}`)).status).toBe(404);
    const response = await stack.request(`courses/${target.id}`);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(courseSchema.parse(json.data).source.isDemo).toBe(true);
    expect(JSON.stringify(json)).not.toContain("Private source policy");
    const member = await stack.member();
    expect((await stack.request("admin/courses", member)).status).toBe(403);
    expect((await member.client.from("course_versions").select("*")).data || []).toEqual([]);
  });
  it("retains the approved version while revising and rejects duplicate URLs or unsupported hosts", async () => {
    const record = await course();
    const original = (await (await stack.request(`courses/${record.id}`)).json()).data;
    const changed = { ...record.draft, title: `${prefix} newer draft` };
    const revise = await stack.request(`admin/courses/${record.id}`, admin, "PATCH", {
      expectedRevision: record.revision,
      course: changed,
    });
    expect(revise.status).toBe(200);
    record.revision++;
    expect((await (await stack.request(`courses/${record.id}`)).json()).data.versionId).toBe(
      original.versionId,
    );
    await transition(record, "review");
    await transition(record, "publish");
    expect((await (await stack.request(`courses/${record.id}`)).json()).data.title).toBe(
      changed.title,
    );
    expect(
      (
        await stack.request("admin/courses", admin, "POST", {
          ...record.draft,
          key: `${prefix}-duplicate`,
          url: record.draft.url + "?tracking=1",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await stack.request("admin/courses", admin, "POST", {
          ...record.draft,
          key: `${prefix}-evil`,
          url: "https://evil.test.invalid/courses/unsafe/",
        })
      ).status,
    ).toBe(400);
  });
  it("publishes reviewed editorial translations for the published version only", async () => {
    const record = await course();
    const read = async () =>
      courseSchema.parse((await (await stack.request(`courses/${record.id}`)).json()).data);
    const first = await read();
    expect(first.translations).toEqual({});
    const body = (versionId: string) => ({
      versionId,
      locale: "zh-TW",
      summary: "為隔離測試撰寫的虛構課程資訊",
      practicePrompt: "做一個小範例並測試",
      completionCriteria: "保留範例、限制與測試結果",
      reviewNote: "Synthetic fixture reviewed against the editorial source",
    });
    const put = (input: unknown, user = admin) =>
      stack.request(`admin/courses/${record.id}/translations`, user, "POST", input);
    expect((await put(body(first.versionId), await stack.member())).status).toBe(403);
    expect((await put({ ...body(first.versionId), title: "翻譯標題" })).status).toBe(400);
    expect((await put(body(crypto.randomUUID()))).status).toBe(409);
    expect((await put(body(first.versionId))).status).toBe(200);
    const translated = await read();
    expect(translated.title).toBe(first.title);
    expect(translated.translations?.["zh-TW"]).toMatchObject({
      summary: "為隔離測試撰寫的虛構課程資訊",
      practicePrompt: "做一個小範例並測試",
    });
    const audit = await stack.sql.query(
      "select reason from public.course_audit where resource_id=$1 and action='course.translated'",
      [record.id],
    );
    expect(audit.rows).toEqual([
      { reason: "Synthetic fixture reviewed against the editorial source" },
    ]);
    // A newly published version hides the earlier review until it is translated again.
    const revise = await stack.request(`admin/courses/${record.id}`, admin, "PATCH", {
      expectedRevision: record.revision,
      course: { ...record.draft, summary: "Revised fictional metadata" },
    });
    expect(revise.status).toBe(200);
    record.revision++;
    expect((await read()).translations?.["zh-TW"]).toBeDefined();
    await transition(record, "review");
    await transition(record, "publish");
    const second = await read();
    expect(second.versionId).not.toBe(first.versionId);
    expect(second.translations).toEqual({});
    expect((await put(body(second.versionId))).status).toBe(200);
    const remove = (reason: string) =>
      stack.request(`admin/courses/${record.id}/translations/remove`, admin, "POST", {
        versionId: second.versionId,
        locale: "zh-TW",
        reason,
      });
    expect((await remove(" ")).status).toBe(400);
    expect((await remove("Reviewer withdrew the translation")).status).toBe(200);
    expect((await read()).translations).toEqual({});
  });
  it("rejects cycles in the proposed published prerequisite graph", async () => {
    const a = await course(),
      b = await course({ prerequisiteCourseIds: [a.id] });
    const changed = { ...a.draft, prerequisiteCourseIds: [b.id] };
    expect(
      (
        await stack.request(`admin/courses/${a.id}`, admin, "PATCH", {
          expectedRevision: a.revision,
          course: changed,
        })
      ).status,
    ).toBe(200);
    a.revision++;
    await transition(a, "review");
    expect(
      (
        await stack.request(`admin/courses/${a.id}/transition`, admin, "POST", {
          expectedRevision: a.revision,
          action: "publish",
          reason: "Cycle rejection fixture",
        })
      ).status,
    ).toBe(409);
  });
  it("creates one plan/task and an ID-only message under concurrent idempotent requests", async () => {
    const owner = await stack.member(),
      key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => start(owner, 1, jobId, key)),
    );
    expect(new Set(results.map((item) => item.planId)).size).toBe(1);
    const message = await stack.sql.query(
      "select message from pgmq.q_rolefoundry_tasks where msg_id=(select queue_message_id from public.tasks where id=$1)",
      [results[0].taskId],
    );
    expect(message.rows[0].message).toEqual({ taskId: results[0].taskId });
    expect(
      (
        await stack.request(
          "learning-plans",
          owner,
          "POST",
          { jobId, weeklyHours: 2, durationOverrides: [] },
          { "Idempotency-Key": key },
        )
      ).status,
    ).toBe(409);
  });
  it("executes the actual worker with prerequisites, budgets and explicit original practice", async () => {
    const owner = await stack.member(),
      task = await start(owner);
    expect(await worker()).toContain("task.completed");
    const plan = await find(owner, task.planId);
    const selected = (
      await stack.sql.query(
        "select input_snapshot->'courses' courses from public.learning_plans where id=$1",
        [task.planId],
      )
    ).rows[0].courses;
    expect(new Set(selected.map((course: { id: string }) => course.id))).toEqual(
      new Set([foundation.id, target.id]),
    );
    expect(plan.status).toBe("succeeded");
    expect(plan.stale).toBe(false);
    expect(plan.output?.scheduledMinutes).toBeLessThanOrEqual(120);
    expect(plan.steps.map((step) => step.courseId)).toEqual([foundation.id, target.id]);
    expect(plan.output?.limitations.join(" ")).toContain("never changes capability evidence");
    // Steps show the reviewed translation of the exact course version they were planned from.
    const step = plan.steps[0];
    const translate = await stack.request(
      `admin/courses/${foundation.id}/translations`,
      admin,
      "POST",
      {
        versionId: step.courseVersionId,
        locale: "zh-TW",
        summary: "虛構的基礎課程",
        practicePrompt: "做一個小範例並測試",
        completionCriteria: "保留範例與測試結果",
        reviewNote: "Synthetic fixture reviewed for plan display",
      },
    );
    expect(translate.status).toBe(200);
    try {
      const translated = await find(owner, task.planId);
      expect(translated.steps[0].translations?.["zh-TW"]?.practicePrompt).toBe(
        "做一個小範例並測試",
      );
      expect(translated.steps[1].translations).toEqual({});
    } finally {
      await stack.request(`admin/courses/${foundation.id}/translations/remove`, admin, "POST", {
        versionId: step.courseVersionId,
        locale: "zh-TW",
        reason: "Fixture cleanup",
      });
    }
  });
  it("isolates owner plans/progress and denies privileged worker RPCs", async () => {
    const owner = await stack.member(),
      other = await stack.member(),
      task = await start(owner);
    expect((await stack.request(`learning-plans/${task.planId}`, other)).status).toBe(404);
    expect((await stack.request("learning-plans")).status).toBe(401);
    for (const table of [
      "learning_plans",
      "learning_steps",
      "learning_progress",
      "practice_submissions",
    ]) {
      expect((await owner.client.from(table).select("*")).data || []).toEqual([]);
    }
    expect(
      (
        await owner.client.rpc("learning_load_task", {
          p_task: task.taskId,
          p_token: crypto.randomUUID(),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await stack.request(
          "learning-plans",
          owner,
          "POST",
          { jobId, weeklyHours: 1, durationOverrides: [], userId: other.id },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(400);
  });
  it("keeps course completion separate from skills and uses optimistic progress versions", async () => {
    const owner = await stack.member();
    const before = (await (await stack.request("profile", owner)).json()).data;
    const updates = await Promise.all(
      Array.from({ length: 2 }, () =>
        stack.request(`learning-progress/courses/${foundation.id}`, owner, "PATCH", {
          expectedRevision: 0,
          completed: true,
        }),
      ),
    );
    expect(updates.map((response) => response.status).sort()).toEqual([200, 409]);
    const progress = (await (await stack.request("learning-progress", owner)).json()).data;
    expect(progress.revision).toBe(1);
    expect(
      progress.data.find((item: { courseId: string }) => item.courseId === foundation.id).completed,
    ).toBe(true);
    expect((await (await stack.request("profile", owner)).json()).data).toEqual(before);
    expect((await (await stack.request("evidence", owner)).json()).data).toEqual([]);
    const task = await start(owner);
    await worker();
    expect(
      (await find(owner, task.planId)).steps.every((step) => step.courseId !== foundation.id),
    ).toBe(true);
  });
  it("withholds stale course/progress/profile snapshots and rejects fabricated course IDs", async () => {
    const owner = await stack.member(),
      first = await start(owner);
    const claimed = await lease(first.taskId),
      input = await load(claimed);
    const forged = compute(input);
    if (forged.steps[0].courseId) forged.steps[0].courseId = crypto.randomUUID();
    expect((await publish(claimed, forged)).error?.message).toBe("RF_INVALID_INPUT");
    expect(
      (
        await stack.request(`learning-progress/courses/${foundation.id}`, owner, "PATCH", {
          expectedRevision: 0,
          completed: true,
        })
      ).status,
    ).toBe(200);
    expect((await publish(claimed, compute(input))).error?.message).toBe("RF_STALE_INPUT");
    const second = await start(owner),
      lease2 = await lease(second.taskId),
      snapshot = await load(lease2);
    await transition(target, "network_failure");
    expect((await publish(lease2, compute(snapshot))).error?.message).toBe("RF_STALE_INPUT");
    await transition(target, "confirmed_active");
  });
  it("marks outdated resources uncertain without inventing closure and preserves historical plan versions", async () => {
    const owner = await stack.member(),
      task = await start(owner);
    await worker();
    const plan = await find(owner, task.planId);
    const version = plan.steps.find((step) => step.courseId === target.id)?.courseVersionId;
    await transition(target, "retire");
    expect((await stack.request(`courses/${target.id}`)).status).toBe(404);
    const old = await find(owner, task.planId);
    expect(old.stale).toBe(true);
    if (version)
      expect(old.steps.find((step) => step.courseId === target.id)?.courseVersionId).toBe(version);
    await transition(target, "review");
    await transition(target, "publish");
    const pending = await start(owner),
      claimed = await lease(pending.taskId),
      snapshot = await load(claimed);
    await stack.sql.query(
      "update public.courses set last_reviewed_at=clock_timestamp()-interval '91 days' where id=$1",
      [target.id],
    );
    expect((await (await stack.request(`courses/${target.id}`)).json()).data.availability).toBe(
      "uncertain",
    );
    expect((await publish(claimed, compute(snapshot))).error?.message).toBe("RF_STALE_INPUT");
    await transition(target, "confirmed_active");
  });
  it("supports zero/partial time and no-resource practice without fake course references", async () => {
    const owner = await stack.member();
    const zero = await start(owner, 0);
    await worker();
    expect((await find(owner, zero.planId)).steps).toEqual([]);
    const partial = await start(owner, 0.25);
    await worker();
    const plan = await find(owner, partial.planId);
    expect(plan.output?.scheduledMinutes).toBeLessThanOrEqual(30);
    expect(plan.steps.some((step) => step.scope === "partial-resource")).toBe(true);
    const unsupported = await job(["automation"]),
      practice = await start(owner, 1, unsupported);
    await worker();
    const other = await find(owner, practice.planId);
    expect(other.steps.every((step) => step.courseId === null)).toBe(true);
    expect(other.output?.issues.some((issue) => issue.kind === "no-resource")).toBe(true);
  });
  it("purges derived plan content on evidence deletion while retaining independently submitted practice", async () => {
    const owner = await stack.member();
    const claim = {
      source: "self-report",
      label: `${prefix} private claim`,
      context: `${prefix} copied private context`,
      observedAt: "2026-11-01T00:00:00Z",
      skills: ["python"],
      claimedLevel: 1,
    };
    const response = await stack.request("evidence", owner, "POST", {
      expectedRevision: 0,
      evidence: claim,
    });
    expect(response.status).toBe(201);
    const evidence = (await response.json()).data.evidence;
    const task = await start(owner);
    await worker();
    let plan = await find(owner, task.planId);
    const step = plan.steps[0];
    expect(step).toBeDefined();
    const submitted = await stack.request(
      `learning-plans/${plan.id}/steps/${step.id}/practice`,
      owner,
      "POST",
      {
        expectedRevision: 0,
        url: "https://example.org/my-independent-practice",
        summary: "My own independent practice reference",
      },
    );
    expect(submitted.status).toBe(201);
    plan = planSchema.parse((await submitted.json()).data);
    const queued = await start(owner),
      claimed = await lease(queued.taskId),
      input = await load(claimed);
    expect(
      (
        await stack.request(`evidence/${evidence.id}`, owner, "DELETE", {
          expectedRevision: 1,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
    const invalidated = await find(owner, plan.id);
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.output).toBeNull();
    expect(invalidated.steps).toEqual([]);
    expect(invalidated.practiceSubmissions).toHaveLength(1);
    expect((await publish(claimed, compute(input))).error?.message).toBe("RF_STALE_INPUT");
    expect(
      (
        await stack.sql.query("select input_snapshot from public.learning_plans where id=$1", [
          plan.id,
        ])
      ).rows[0].input_snapshot,
    ).toBeNull();
    const removed = await stack.request(
      `learning-plans/${plan.id}/practice/${invalidated.practiceSubmissions[0].id}`,
      owner,
      "DELETE",
      { expectedRevision: invalidated.progressRevision },
    );
    expect(removed.status).toBe(200);
    expect((await removed.json()).data.practiceSubmissions).toEqual([]);
  });
  it("rejects a lease expiring during publication and recovers redelivery without duplicate steps", async () => {
    const owner = await stack.member(),
      task = await start(owner);
    const claimed = await lease(task.taskId),
      input = await load(claimed),
      output = compute(input),
      fn = `test_learning_delay_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await stack.sql.query(
        `create function public.${fn}() returns trigger language plpgsql as $$begin if new.plan_id='${task.planId}'::uuid then perform pg_sleep(0.3);end if;return new;end $$`,
      );
      await stack.sql.query(
        `create trigger ${fn} before insert on public.learning_steps for each row execute function public.${fn}()`,
      );
      await stack.sql.query(
        "update public.tasks set lease_expires_at=clock_timestamp()+interval '0.2 seconds' where id=$1",
        [task.taskId],
      );
      expect((await publish(claimed, output)).error?.message).toBe("RF_CONFLICT");
      expect(
        (
          await stack.sql.query("select 1 from public.learning_steps where plan_id=$1", [
            task.planId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await stack.sql.query(`drop trigger if exists ${fn} on public.learning_steps`);
      await stack.sql.query(`drop function if exists public.${fn}()`);
    }
    await stack.sql.query(
      "update public.tasks set lease_expires_at=clock_timestamp()-interval '1 second',next_run_at=now() where id=$1",
      [task.taskId],
    );
    await stack.sql.query(
      "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
      [task.taskId],
    );
    const fresh = await lease(task.taskId);
    expect((await publish(claimed, output)).error?.message).toBe("RF_CONFLICT");
    checked((await publish(fresh, output)).error);
    await stack.sql.query(
      "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
      [task.taskId],
    );
    await worker();
    expect((await find(owner, task.planId)).steps).toHaveLength(output.steps.length);
  });
  it("blocks profile changes and deactivated/deleted owners before publication", async () => {
    const owner = await stack.member(),
      task = await start(owner);
    const claimed = await lease(task.taskId),
      input = await load(claimed);
    expect(
      (
        await stack.request("profile", owner, "PATCH", {
          expectedRevision: 0,
          name: "Taylor",
          track: "Engineering & data",
          workplaces: [],
          weeklyHours: 1,
        })
      ).status,
    ).toBe(200);
    expect((await publish(claimed, compute(input))).error?.message).toBe("RF_STALE_INPUT");
    const second = await start(owner),
      active = await lease(second.taskId),
      snapshot = await load(active);
    checked(
      (await stack.privileged.rpc("identity_deactivate_profile", { p_user: owner.id })).error,
    );
    expect((await publish(active, compute(snapshot))).error?.message).toBe("RF_FORBIDDEN");
    const deleted = await stack.member(),
      third = await start(deleted),
      before = await lease(third.taskId),
      old = await load(before);
    checked((await stack.privileged.auth.admin.deleteUser(deleted.id)).error);
    expect((await publish(before, compute(old))).error?.message).toBe("RF_NOT_FOUND");
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      before.messageId,
    ]);
    stack.users.splice(
      stack.users.findIndex((user) => user.id === deleted.id),
      1,
    );
    await stack.sql.query(
      "delete from public.invitations where email_hash=public.identity_email_hash($1)",
      [deleted.email],
    );
  });
  it("creates a real plan in the browser and persists separate step/course/practice progress", async () => {
    const owner = await stack.member(),
      browser = await chromium.launch();
    try {
      const anonymous = await browser.newContext();
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`${stack.origin}/learning/`);
      await webExpect(
        publicPage.getByRole("heading", { name: target.draft.title, exact: true }),
      ).toBeVisible();
      await webExpect(
        publicPage.getByRole("button", { name: "Create a two-week learning plan", exact: true }),
      ).toHaveCount(0);
      await anonymous.close();
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
      const page = await context.newPage(),
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${stack.origin}/learning/?job=${jobId}`);
      await webExpect(page.getByLabel("Learning target role")).toHaveValue(jobId);
      await page.getByLabel("Weekly learning hours").fill("1");
      await page
        .getByRole("button", { name: "Create a two-week learning plan", exact: true })
        .click();
      await webExpect(
        page.getByRole("heading", { name: "Learning plan is queued or running", exact: true }),
      ).toBeVisible();
      await worker();
      await webExpect(
        page.getByRole("heading", { name: "Your two-week learning plan", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Mark assigned step done", exact: true })
        .first()
        .click();
      await webExpect(
        page.getByRole("button", { name: "Assigned step done · undo", exact: true }),
      ).toHaveCount(1);
      expect((await (await stack.request("learning-progress", owner)).json()).data.data).toEqual(
        [],
      );
      await page
        .getByLabel("Learning practice URL", { exact: true })
        .fill("https://example.org/my-browser-learning-practice");
      await page
        .getByLabel("Learning practice summary", { exact: true })
        .fill("An independently authored practice note");
      await page
        .getByRole("button", { name: "Save private practice reference", exact: true })
        .click();
      await webExpect(
        page.getByRole("heading", { name: "Your independent practice references", exact: true }),
      ).toBeVisible();
      const resource = page
        .locator(".learning-course-grid")
        .first()
        .getByRole("article")
        .filter({ has: page.getByRole("heading", { name: foundation.draft.title, exact: true }) });
      await resource
        .getByRole("button", { name: "Report entire course complete", exact: true })
        .click();
      await webExpect(
        resource.getByRole("button", { name: "Reported complete · undo", exact: true }),
      ).toBeVisible();
      await page.reload();
      await webExpect(
        page.getByRole("button", { name: "Assigned step done · undo", exact: true }),
      ).toHaveCount(1);
      await webExpect(
        page.getByText("An independently authored practice note", { exact: true }),
      ).toBeVisible();
      expect((await (await stack.request("profile", owner)).json()).data.revision).toBe(0);
      expect((await (await stack.request("evidence", owner)).json()).data).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      await page
        .locator(".learning-course-grid")
        .first()
        .getByRole("article")
        .first()
        .screenshot({ path: ".local/learning-course-mobile.png", animations: "disabled" });
      await page
        .getByRole("heading", { name: "Your two-week learning plan", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: ".local/learning-plan-mobile.png", animations: "disabled" });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: ".local/learning-desktop.png", animations: "disabled" });
    } finally {
      await browser.close();
    }
  });
  it("authors, reviews, publishes and retires a course through the administrator browser", async () => {
    const browser = await chromium.launch(),
      name = `${prefix}-browser-source`,
      key = `${prefix}-browser-course`,
      title = `${prefix} browser-authored resource`;
    try {
      const context = await browser.newContext();
      await context.addCookies(
        admin.cookie.split("; ").map((entry) => {
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
      const page = await context.newPage();
      await page.goto(`${stack.origin}/learning/`);
      await page.getByLabel("Source name", { exact: true }).fill(name);
      await page.getByLabel("Publisher", { exact: true }).fill("Browser fixture publisher");
      await page
        .getByLabel("Authorization basis (private)", { exact: true })
        .fill("Author-owned fictional metadata for browser checks");
      await page
        .getByLabel("Public rights summary", { exact: true })
        .fill("Not a real course offering");
      await page.getByRole("checkbox", { name: /I reviewed the stated permission/ }).check();
      await page.getByRole("button", { name: "Create course source policy", exact: true }).click();
      await webExpect(
        page
          .getByLabel("Draft course source", { exact: true })
          .getByRole("option", { name, exact: true }),
      ).toHaveCount(1);
      const policy = await stack.sql.query("select id from public.sources where name=$1", [name]);
      sourceIds.push(policy.rows[0].id);
      await page.getByLabel("Draft course source", { exact: true }).selectOption({ label: name });
      await page.getByLabel("Course catalog key", { exact: true }).fill(key);
      await page.getByLabel("Course title", { exact: true }).fill(title);
      await page
        .getByLabel("Official course URL", { exact: true })
        .fill(`https://www.deeplearning.ai/courses/${key}/`);
      await page
        .getByLabel("Independent course summary", { exact: true })
        .fill("Independent fictional resource metadata");
      await page.getByLabel("Course addressed skills", { exact: true }).selectOption("content");
      await page.getByLabel("Editorial course minutes", { exact: true }).fill("30");
      await page
        .getByLabel("Course practice prompt", { exact: true })
        .fill("Create a small example and record its limits");
      await page
        .getByLabel("Course practice completion criteria", { exact: true })
        .fill("Keep the example and a test result");
      await page.getByRole("button", { name: "Create course draft", exact: true }).click();
      const card = page
        .locator(".learning-reference")
        .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await webExpect(card).toHaveCount(1);
      const record = await stack.sql.query("select id from public.courses where canonical_key=$1", [
        key,
      ]);
      if (record.rows[0]) courseIds.push(record.rows[0].id);
      expect((await stack.request(`courses/${record.rows[0].id}`)).status).toBe(404);
      await page
        .getByLabel("Course review reason", { exact: true })
        .fill("Checked independent metadata, source scope and practice criteria");
      await card.getByRole("button", { name: "Review course draft", exact: true }).click();
      await card.getByRole("button", { name: "Publish reviewed course", exact: true }).click();
      await webExpect(
        page
          .locator(".learning-course-grid")
          .first()
          .getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await card.getByRole("button", { name: "Retire course", exact: true }).click();
      await webExpect(card).toContainText("Retired");
      expect((await stack.request(`courses/${record.rows[0].id}`)).status).toBe(404);
    } finally {
      await browser.close();
      const ids = await stack.sql.query("select id from public.courses where canonical_key=$1", [
        key,
      ]);
      for (const row of ids.rows) if (!courseIds.includes(row.id)) courseIds.push(row.id);
      const policies = await stack.sql.query("select id from public.sources where name=$1", [name]);
      for (const row of policies.rows) if (!sourceIds.includes(row.id)) sourceIds.push(row.id);
    }
  });
  it("follows reviewed canonical skill merges without rewriting original course versions", async () => {
    let version = (await (await stack.request("skills")).json()).data.version;
    const from = `${prefix}-from`,
      to = `${prefix}-to`;
    for (const id of [from, to]) {
      const response = await stack.request("admin/skills", admin, "POST", {
        id,
        nameEn: `${id} English`,
        nameZhTw: `${id} local label`,
        description: "Isolated course-consumer concept",
        expectedVersion: version,
        reason: "Course dictionary integration fixture",
      });
      expect(response.status).toBe(201);
      conceptIds.push(id);
      version = (await response.json()).data.version;
    }
    const record = await course({ skills: [from] }),
      role = await job([from]);
    const before = (await (await stack.request(`courses/${record.id}`)).json()).data;
    const merged = await stack.request("admin/skills/merge", admin, "POST", {
      fromId: from,
      toId: to,
      expectedVersion: version,
      reason: "Test course canonical projection",
    });
    expect(merged.status).toBe(200);
    const after = (await (await stack.request(`courses/${record.id}`)).json()).data;
    expect(after.versionId).toBe(before.versionId);
    expect(after.skills).toEqual([to]);
    expect(
      (
        await stack.sql.query(
          "select metadata->'skills' skills from public.course_versions where id=$1",
          [before.versionId],
        )
      ).rows[0].skills,
    ).toEqual([from]);
    const owner = await stack.member(),
      task = await start(owner, 1, role);
    await worker();
    const plan = await find(owner, task.planId);
    expect(plan.steps[0].courseId).toBe(record.id);
    expect(plan.steps[0].skills).toEqual([to]);
  });
  it("paginates published courses and makes revoked-source plans historical", async () => {
    for (let index = 0; index < 21; index++) await course({ skills: ["content"] });
    const first = await stack.request("courses?skill=content");
    expect(first.status).toBe(200);
    const page = await first.json();
    expect(page.data).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    const next = await stack.request(
      `courses?skill=content&cursor=${encodeURIComponent(page.nextCursor)}`,
    );
    expect(next.status).toBe(200);
    const second = await next.json();
    expect(new Set([...page.data, ...second.data].map((item) => item.id)).size).toBe(
      page.data.length + second.data.length,
    );
    const policy = await source(),
      record = await course({ sourceId: policy, skills: ["automation"] }),
      role = await job(["automation"]),
      owner = await stack.member(),
      task = await start(owner, 1, role);
    await worker();
    expect((await find(owner, task.planId)).steps[0].courseId).toBe(record.id);
    expect(
      (
        await stack.request(`admin/courses/sources/${policy}/status`, admin, "POST", {
          status: "revoked",
          reason: "Isolated source withdrawal",
        })
      ).status,
    ).toBe(200);
    expect((await stack.request(`courses/${record.id}`)).status).toBe(404);
    const old = await find(owner, task.planId);
    expect(old.stale).toBe(true);
    expect(old.steps[0].available).toBe(false);
    expect(
      (await stack.request(`courses?skill=content&cursor=${encodeURIComponent(page.nextCursor)}`))
        .status,
    ).toBe(409);
  });
  it("adds an independently configured provider without replacing planning or catalog contracts", async () => {
    const provider = `${prefix}-provider`;
    providerIds.push(provider);
    await stack.sql.query(
      "insert into public.course_providers(id,name,allowed_hosts,path_prefixes,url_identity) values($1,'Fictional alternate provider',array['learn.test.invalid'],array['/training/'],'origin-path')",
      [provider],
    );
    const policy = await stack.request("admin/courses/sources", admin, "POST", {
      providerId: provider,
      name: `${prefix}-alternate`,
      publisher: "Authored fixture publisher",
      authorizationBasis: "Isolated fictional provider metadata",
      rightsSummary: "Not a real resource",
      allowedHosts: ["learn.test.invalid"],
      permittedFields: courseFields,
      isDemo: true,
    });
    expect(policy.status).toBe(201);
    const policyId = (await policy.json()).data.id;
    sourceIds.push(policyId);
    const record = await course({
      providerId: provider,
      sourceId: policyId,
      skills: ["sql"],
      url: `https://learn.test.invalid/training/${prefix}/`,
    });
    const resource = (await (await stack.request(`courses/${record.id}`)).json()).data;
    expect(resource.providerName).toBe("Fictional alternate provider");
    const owner = await stack.member(),
      role = await job(["sql"]),
      task = await start(owner, 1, role);
    await worker();
    expect((await find(owner, task.planId)).steps[0].courseId).toBe(record.id);
  });
});
