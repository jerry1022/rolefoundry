import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import PDFDocument from "pdfkit";
import { randomBytes } from "node:crypto";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { ReplayExecution } from "../support/replay-execution";
import { publicationFields } from "../../src/modules/jobs/model";
import { resumeDocumentSchema } from "../../src/modules/resume/model";
import { deploymentFeedRegistry } from "../../src/modules/ingestion/adapters/feed-config";
vi.mock("server-only", () => ({}));
const id = () => crypto.randomUUID(),
  prefix = `replay-${id()}`,
  owned = new Set<string>(),
  jobIds: string[] = [],
  sourceIds: string[] = [],
  questions: string[] = [],
  retired = new Set<string>(),
  deletions: string[] = [];
let stack: LocalFixtures,
  admin: LocalMember,
  member: LocalMember,
  execution: ReplayExecution,
  rubric: string,
  jobId: string;
const path = (task: string) => `admin/operations/tasks/${task}/replay`;
async function data(response: Response, status = 202) {
  expect(response.status).toBe(status);
  return (await response.json()).data;
}
async function post(route: string, user: LocalMember, body: unknown, status = 202) {
  return data(await stack.request(route, user, "POST", body, { "Idempotency-Key": id() }), status);
}
async function paste(user: LocalMember = member) {
  const result = await post("resumes/paste", user, {
    text: "Completed a Python project with a documented evaluation.",
  });
  owned.add(result.taskId);
  return result;
}
async function replay(task: string, input = { requestId: id(), reason: "operator-reviewed" }) {
  const result = await data(await stack.request(path(task), admin, "POST", input));
  owned.add(result.taskId);
  return result;
}
async function preview(task: string, user = admin) {
  return data(await stack.request(path(task), user), 200);
}
async function row(task: string) {
  return (await stack.sql.query("select to_jsonb(t) value from public.tasks t where id=$1", [task]))
    .rows[0].value;
}
async function fail(task: string) {
  owned.add(task);
  await execution.exhaust(task);
  expect((await row(task)).safe_error).toBe("RF_RETRY_EXHAUSTED");
}
async function job() {
  const source = await post(
    "admin/catalog/sources",
    admin,
    {
      name: prefix,
      publisher: "Synthetic fixture",
      authorizationBasis: "Authored test data",
      rightsSummary: "Not a real opening",
      allowedHosts: ["jobs.test.invalid"],
      permittedFields: publicationFields,
      isDemo: true,
    },
    201,
  );
  sourceIds.push(source.id);
  const record = await post(
    "admin/catalog/jobs",
    admin,
    {
      job: {
        canonicalKey: prefix,
        company: prefix,
        title: "Synthetic AI role",
        track: "Engineering & data",
        specialization: "ai-llm-applications",
        location: "Taipei",
        workplace: "Remote",
        level: "Mid",
        salary: null,
        summary: "Synthetic recovery acceptance role",
        responsibilities: ["Build tools"],
        requirements: [
          { text: "Build Python services", priority: "mandatory", skills: ["python"] },
        ],
        conditions: { workAuthorization: null, education: null, experienceYears: null },
        expiresAt: null,
      },
      source: {
        sourceId: source.id,
        externalId: prefix,
        url: `https://jobs.test.invalid/${prefix}`,
      },
    },
    201,
  );
  jobIds.push(record.id);
  let revision = record.revision;
  for (const status of ["review", "published"])
    revision = (
      await post(
        `admin/catalog/jobs/${record.id}/status`,
        admin,
        { expectedRevision: revision, status },
        200,
      )
    ).revision;
  return record.id;
}
async function confirmed(user = member) {
  const created = await paste(user);
  await execution.execute(created.taskId);
  let document = resumeDocumentSchema.parse(
    await data(await stack.request(`resumes/${created.documentId}`, user), 200),
  );
  const fact = {
    id: id(),
    text: document.draft!.text,
    kind: "project",
    state: "completed",
    skillIds: ["python"],
    sourceBlockId: document.draft!.blocks[0].id,
  };
  document = resumeDocumentSchema.parse(
    await post(
      `resumes/${document.id}/confirm`,
      user,
      {
        expectedRevision: document.revision,
        content: {
          facts: [fact],
          sections: [{ id: id(), heading: "Projects", factIds: [fact.id] }],
        },
      },
      200,
    ),
  );
  return document;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  execution = new ReplayExecution(stack.sql, stack.privileged, owned);
  jobId = await job();
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((u) => u.id);
  const tasks = (
    await stack.sql.query(
      "select id from public.tasks where user_id=any($1::uuid[]) or id=any($2::uuid[])",
      [users, [...owned]],
    )
  ).rows.map((r) => r.id);
  const batches = (
    await stack.sql.query("select id from public.import_batches where source_id=any($1::uuid[])", [
      sourceIds,
    ])
  ).rows.map((r) => r.id);
  const feedRuns = (
    await stack.sql.query(
      "select id from public.ingestion_feed_runs where source_id=any($1::uuid[])",
      [sourceIds],
    )
  ).rows.map((r) => r.id);
  for (const bucket of ["rolefoundry-resumes", "rolefoundry-account-exports"]) {
    const objects = (
      await stack.sql.query(
        "select name from storage.objects where bucket_id=$1 and split_part(name,'/',1)=any($2::text[])",
        [bucket, users],
      )
    ).rows.map((r) => r.name);
    if (objects.length)
      expect((await stack.privileged.storage.from(bucket).remove(objects)).error).toBeNull();
  }
  await stack.sql.query(
    "delete from public.resume_storage_objects where user_id=any($1::uuid[]) or split_part(object_key,'/',1)=any($2::text[])",
    [users, users],
  );
  await stack.sql.query(
    "delete from public.account_export_objects where user_id=any($1::uuid[]) or split_part(object_key,'/',1)=any($2::text[])",
    [users, users],
  );
  await stack.sql.query("delete from public.account_deletions where id=any($1::uuid[])", [
    deletions,
  ]);
  await stack.sql.query(
    "delete from pgmq.q_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
    [tasks],
  );
  await stack.sql.query(
    "delete from pgmq.a_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
    [tasks],
  );
  await stack.sql.query("delete from public.tasks where id=any($1::uuid[])", [tasks]);
  await stack.sql.query("delete from public.assessment_attempts where user_id=any($1::uuid[])", [
    users,
  ]);
  await stack.sql.query(
    "delete from public.question_publications where question_version_id=any($1::uuid[])",
    [questions],
  );
  await stack.sql.query("delete from public.question_versions where id=any($1::uuid[])", [
    questions,
  ]);
  if (rubric) await stack.sql.query("delete from public.rubric_versions where id=$1", [rubric]);
  await stack.sql.query(
    "delete from public.ingestion_feed_settings where source_id=any($1::uuid[])",
    [sourceIds],
  );
  await stack.sql.query("delete from public.ingestion_feed_runs where id=any($1::uuid[])", [
    feedRuns,
  ]);
  await stack.sql.query("delete from public.import_requests where batch_id=any($1::uuid[])", [
    batches,
  ]);
  await stack.sql.query("delete from public.review_items where batch_id=any($1::uuid[])", [
    batches,
  ]);
  await stack.sql.query("delete from public.source_records where source_id=any($1::uuid[])", [
    sourceIds,
  ]);
  await stack.sql.query("delete from public.import_batches where id=any($1::uuid[])", [batches]);
  await stack.sql.query("delete from public.operations_audit where actor_id=any($1::uuid[])", [
    users,
  ]);
  stack.users.splice(0, stack.users.length, ...stack.users.filter((u) => !retired.has(u.id)));
  await stack.close();
  // Shared fixture publications are removed only after their private references have cascaded.
  await usingCleanup(async (sql) => {
    await sql.query(
      "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[])))",
      [jobIds],
    );
    await sql.query(
      "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
      [jobIds],
    );
    await sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [jobIds]);
    await sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [jobIds]);
    await sql.query("delete from public.jobs where id=any($1::uuid[])", [jobIds]);
    await sql.query("delete from public.ingestion_settings where source_id=any($1::uuid[])", [
      sourceIds,
    ]);
    await sql.query(
      "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=companies.id)",
      [prefix],
    );
    await sql.query("delete from public.sources where id=any($1::uuid[])", [sourceIds]);
  });
});
async function usingCleanup(work: (sql: import("pg").Client) => Promise<void>) {
  const { default: pg } = await import("pg");
  const sql = new pg.Client({ connectionString: stack.env.DB_URL });
  await sql.connect();
  try {
    await work(sql);
  } finally {
    await sql.end();
  }
}
it("denies anonymous/member mutations, raw tables, private helpers, spoofed owners and cross-origin bodies", async () => {
  const created = await paste();
  await fail(created.taskId);
  expect((await stack.request(path(created.taskId))).status).toBe(401);
  expect((await stack.request(path(created.taskId), member)).status).toBe(403);
  expect(
    (
      await stack.request(path(created.taskId), member, "POST", {
        requestId: id(),
        reason: "operator-reviewed",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await stack.request(
        path(created.taskId),
        admin,
        "POST",
        { requestId: id(), reason: "operator-reviewed" },
        { Origin: "https://other.invalid" },
      )
    ).status,
  ).toBe(403);
  for (const body of [
    { requestId: id(), reason: "operator-reviewed", ownerId: member.id },
    { requestId: id(), reason: "private free form reason" },
    { requestId: "invalid", reason: "operator-reviewed" },
  ])
    expect((await stack.request(path(created.taskId), admin, "POST", body)).status).toBe(400);
  expect((await stack.request(path(created.taskId) + "?owner=anything", admin)).status).toBe(400);
  expect((await admin.client.from("task_replays").select("*")).error).toBeTruthy();
  expect(
    (await admin.client.rpc("resume_replay_binding", { p_previous: created.taskId })).error,
  ).toBeTruthy();
  expect(
    (
      await member.client.rpc("operations_task_replay", {
        p_task: created.taskId,
        p_request: id(),
        p_reason: "operator-reviewed",
      })
    ).error,
  ).toBeTruthy();
  const checked = await preview(created.taskId);
  expect(checked).toEqual({ available: true, reason: null, nextTaskId: null });
});
it("creates one audited new parse attempt, preserves history and recovers a lost response idempotently", async () => {
  const original = await paste();
  await fail(original.taskId);
  const before = await row(original.taskId),
    request = { requestId: id(), reason: "configuration-restored" };
  const responses = await Promise.all([
    stack.request(path(original.taskId), admin, "POST", request),
    stack.request(path(original.taskId), admin, "POST", request),
  ]);
  const first = await data(responses[0]),
    second = await data(responses[1]);
  owned.add(first.taskId);
  expect(first).toEqual(second);
  expect(first.taskId).not.toBe(original.taskId);
  expect(await row(original.taskId)).toEqual(before);
  expect(await preview(original.taskId)).toEqual({
    available: false,
    reason: "already-replayed",
    nextTaskId: first.taskId,
  });
  expect(
    (
      await stack.request(path(original.taskId), admin, "POST", {
        requestId: id(),
        reason: "operator-reviewed",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await stack.request(path(original.taskId), admin, "POST", {
        ...request,
        reason: "operator-reviewed",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.task_replays where previous_task_id=$1",
        [original.taskId],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await stack.sql.query(
        "select message from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
        [first.taskId],
      )
    ).rows[0].message,
  ).toEqual({ taskId: first.taskId });
  await execution.execute(first.taskId);
  expect((await row(first.taskId)).status).toBe("succeeded");
  expect(
    (await data(await stack.request(`resumes/${original.documentId}`, member), 200)).status,
  ).toBe("parsed");
});
it("rechecks source deletion, permanent failures, owner status, history limits and administrator revocation", async () => {
  const original = await paste();
  await fail(original.taskId);
  await stack.sql.query("update public.tasks set safe_error='RF_INVALID_INPUT' where id=$1", [
    original.taskId,
  ]);
  expect((await preview(original.taskId)).reason).toBe("permanent");
  await stack.sql.query("update public.tasks set safe_error='RF_RETRY_EXHAUSTED' where id=$1", [
    original.taskId,
  ]);
  await stack.sql.query("update public.profiles set status='inactive' where user_id=$1", [
    member.id,
  ]);
  expect((await preview(original.taskId)).reason).toBe("owner-unavailable");
  await stack.sql.query("update public.profiles set status='active' where user_id=$1", [member.id]);
  await stack.sql.query("update public.resume_documents set source_hash='changed' where id=$1", [
    original.documentId,
  ]);
  expect((await preview(original.taskId)).reason).toBe("source-stale");
  await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
  try {
    expect(
      (
        await stack.request(path(original.taskId), admin, "POST", {
          requestId: id(),
          reason: "operator-reviewed",
        })
      ).status,
    ).toBe(403);
  } finally {
    await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
  }
  let current = (await paste()).taskId;
  for (let i = 0; i < 4; i++) {
    await fail(current);
    current = (await replay(current)).taskId;
  }
  await fail(current);
  expect((await preview(current)).reason).toBe("limit");
});
it("replays accepted sealed assessment answers without granting administrator access to private inputs", async () => {
  rubric = (
    await post(
      "admin/assessments/rubrics",
      admin,
      { key: prefix, version: 1, description: "Synthetic recovery rubric" },
      201,
    )
  ).id;
  for (let i = 0; i < 3; i++) {
    const question = await post(
      "admin/assessments/questions",
      admin,
      {
        key: `${prefix}-${i}`,
        version: 1,
        track: "Engineering & data",
        skillId: "python",
        rubricId: rubric,
        prompt: `Synthetic scenario ${i}`,
        options: ["Measured result", "Unsupported claim"],
        correctIndex: 0,
        explanation: "Use measured evidence",
      },
      201,
    );
    questions.push(question.id);
    await post(
      `admin/assessments/questions/${question.id}/review`,
      admin,
      { reason: "Synthetic fixture review" },
      200,
    );
  }
  const attempt = await post("assessments", member, { track: "Engineering & data" }, 201);
  const created = await post(`assessments/${attempt.id}/submit`, member, {
    expectedRevision: attempt.revision,
    answers: Object.fromEntries(attempt.items.map((item: { id: string }) => [item.id, 0])),
  });
  await fail(created.taskId);
  const old = await row(created.taskId),
    result = await replay(created.taskId);
  await execution.execute(result.taskId);
  expect((await row(created.taskId)).input_version).toBe(old.input_version);
  expect((await row(result.taskId)).status).toBe("succeeded");
  expect((await data(await stack.request(`assessments/${attempt.id}`, member), 200)).status).toBe(
    "completed",
  );
});
it("replays current matching and learning snapshots and refuses changed profile inputs", async () => {
  for (const [route, body] of [
    ["matches", { jobId, constraints: { experienceYears: null, confirmations: [] } }],
    ["learning-plans", { jobId, weeklyHours: 1, durationOverrides: [] }],
  ] as const) {
    const original = await post(route, member, body);
    await fail(original.taskId);
    expect((await preview(original.taskId)).available).toBe(true);
    const next = await replay(original.taskId);
    await execution.execute(next.taskId);
    expect((await row(next.taskId)).status).toBe("succeeded");
  }
  const stale = await post("matches", member, {
    jobId,
    constraints: { experienceYears: null, confirmations: [] },
  });
  await fail(stale.taskId);
  await stack.sql.query(
    "insert into public.career_preferences(user_id,revision) values($1,1) on conflict(user_id) do update set revision=public.career_preferences.revision+1",
    [member.id],
  );
  expect((await preview(stale.taskId)).reason).toBe("source-stale");
});
it("replays confirmed resume revision and fixed-version PDF export through actual processors", async () => {
  const document = await confirmed();
  for (const [route, body] of [
    [
      `resumes/${document.id}/revisions`,
      { versionId: document.currentVersion!.id, jobId, expectedRevision: document.revision },
    ],
    [`resumes/${document.id}/exports`, { versionId: document.currentVersion!.id }],
  ] as const) {
    const original = await post(route, member, body);
    await fail(original.taskId);
    const next = await replay(original.taskId);
    await execution.execute(next.taskId);
    expect((await row(next.taskId)).status).toBe("succeeded");
  }
});
it("replays sealed account archives without resnapshotting or extending retention", async () => {
  const original = await post("account/exports", member, {});
  await fail(original.taskId);
  const before = (
    await stack.sql.query("select payload,expires_at from public.account_exports where id=$1", [
      original.id,
    ])
  ).rows[0];
  const next = await replay(original.taskId);
  expect(
    (
      await stack.sql.query("select payload,expires_at from public.account_exports where id=$1", [
        original.id,
      ])
    ).rows[0],
  ).toEqual(before);
  await execution.execute(next.taskId);
  expect((await row(next.taskId)).status).toBe("succeeded");
  const expired = await post("account/exports", member, {});
  await fail(expired.taskId);
  await stack.sql.query(
    "update public.account_exports set expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [expired.id],
  );
  expect((await preview(expired.taskId)).reason).toBe("source-stale");
});
it("routes accepted account erasure through its existing persistent recovery grant", async () => {
  const owner = await stack.member(),
    request = id();
  deletions.push(request);
  await post("account/deletion", owner, {
    id: request,
    secret: randomBytes(32).toString("hex"),
    confirmation: "DELETE",
  });
  const task = (
    await stack.sql.query("select task_id from public.account_deletions where id=$1", [request])
  ).rows[0].task_id;
  owned.add(task);
  await execution.exhaust(task, "validation");
  const next = await replay(task);
  await execution.execute(next.taskId);
  retired.add(owner.id);
  expect((await row(next.taskId)).user_id).toBeNull();
  expect(
    (await stack.sql.query("select phase from public.account_deletions where id=$1", [request]))
      .rows[0].phase,
  ).toBe("completed");
});
it("replays authorized import and feed work while preserving review and provider-wait boundaries", async () => {
  const source = await post(
    "admin/catalog/sources",
    admin,
    {
      name: `${prefix}-imports`,
      publisher: "Synthetic source",
      authorizationBasis: "Authored fixture metadata",
      rightsSummary: "No live feed claim",
      allowedHosts: ["jobs.test.invalid"],
      permittedFields: publicationFields,
      isDemo: true,
    },
    201,
  );
  sourceIds.push(source.id);
  expect(
    (
      await stack.request(`admin/imports/sources/${source.id}`, admin, "PATCH", {
        expectedRevision: 0,
        uploadsEnabled: true,
        allowClosure: true,
      })
    ).status,
  ).toBe(200);
  const imported = await post("admin/imports", admin, {
    sourceId: source.id,
    batchId: id(),
    format: "json",
    content: JSON.stringify({
      records: [
        {
          externalId: "owned-role",
          url: `https://jobs.test.invalid/${prefix}/owned-role`,
          state: "active",
          fields: {
            company: prefix,
            title: "Synthetic Python role",
            track: "Engineering & data",
            specialization: "ai-llm-applications",
            summary: "Synthetic authorized source metadata",
            requirements: [
              { text: "Build Python tools", priority: "mandatory", skills: ["Python"] },
            ],
          },
        },
      ],
    }),
  });
  await fail(imported.taskId);
  const next = await replay(imported.taskId);
  await execution.execute(next.taskId);
  expect((await row(next.taskId)).status).toBe("succeeded");
  expect((await data(await stack.request(`admin/imports/${imported.id}`, admin), 200)).status).toBe(
    "succeeded",
  );
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.ingestion_publications where batch_id=$1",
        [imported.id],
      )
    ).rows[0].n,
  ).toBe(0);
  const definitions = deploymentFeedRegistry();
  expect(definitions.find("fixture-jobs-json", "jobs")).not.toBeNull();
  expect(
    (
      await stack.request(`admin/imports/feeds/${source.id}`, admin, "PATCH", {
        expectedRevision: 0,
        feedId: "fixture-jobs-json",
        enabled: true,
        intervalMinutes: 15,
        resume: false,
      })
    ).status,
  ).toBe(200);
  const feed = await post(`admin/imports/feeds/${source.id}/fetch`, admin, {});
  await fail(feed.taskId);
  await stack.sql.query(
    "update public.ingestion_feed_settings set pause_until=clock_timestamp()+interval '1 hour' where source_id=$1",
    [source.id],
  );
  expect((await preview(feed.taskId)).reason).toBe("source-stale");
  await stack.sql.query(
    "update public.ingestion_feed_settings set pause_until=null where source_id=$1",
    [source.id],
  );
  expect((await preview(feed.taskId)).available).toBe(true);
  const retrieved = await replay(feed.taskId);
  await execution.execute(retrieved.taskId);
  expect((await row(retrieved.taskId)).status).toBe("succeeded");
  const prepared = (
    await stack.sql.query(
      "select b.task_id from public.ingestion_feed_runs r join public.import_batches b on b.id=r.batch_id where r.id=$1",
      [feed.id],
    )
  ).rows[0].task_id;
  owned.add(prepared);
  await execution.execute(prepared);
  expect((await row(prepared)).status).toBe("succeeded");
});
it("rolls back new task, source binding, audit and message when recovery publication fails", async () => {
  const original = await paste();
  await fail(original.taskId);
  const request = id(),
    connection = await stack.sql.connect(),
    name = `abort_replay_${id().replaceAll("-", "")}`;
  const before = await row(original.taskId),
    queue = (await stack.sql.query("select count(*)::int n from pgmq.q_rolefoundry_tasks")).rows[0]
      .n;
  try {
    await connection.query(
      `create function pg_temp.${name}() returns trigger language plpgsql as $$begin if new.request_id='${request}'::uuid then raise exception 'RF_CONFLICT';end if;return new;end$$`,
    );
    await connection.query(
      `create trigger ${name} before insert on public.task_replays for each row execute function pg_temp.${name}()`,
    );
    expect(
      (
        await stack.request(path(original.taskId), admin, "POST", {
          requestId: request,
          reason: "operator-reviewed",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await stack.sql.query("select count(*)::int n from public.tasks where source_ref=$1", [
          original.documentId,
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await stack.sql.query("select parse_task_id from public.resume_documents where id=$1", [
          original.documentId,
        ])
      ).rows[0].parse_task_id,
    ).toBe(original.taskId);
    expect(
      (await stack.sql.query("select count(*)::int n from pgmq.q_rolefoundry_tasks")).rows[0].n,
    ).toBe(queue);
    expect(await row(original.taskId)).toEqual(before);
  } finally {
    await connection.query(`drop trigger if exists ${name} on public.task_replays`);
    await connection.query(`drop function if exists pg_temp.${name}()`);
    connection.release();
  }
  const next = await replay(original.taskId, { requestId: request, reason: "operator-reviewed" });
  expect(next.taskId).not.toBe(original.taskId);
});
it("serializes competing administrators and owner retries without duplicating accepted work", async () => {
  const other = await stack.member(true),
    original = await paste();
  await fail(original.taskId);
  const input = { requestId: id(), reason: "operator-reviewed" };
  const replies = await Promise.all([
    stack.request(path(original.taskId), admin, "POST", input),
    stack.request(path(original.taskId), other, "POST", {
      requestId: id(),
      reason: "configuration-restored",
    }),
    stack.request(
      `resumes/${original.documentId}/parse`,
      member,
      "POST",
      { previousTaskId: original.taskId },
      { "Idempotency-Key": id() },
    ),
  ]);
  const accepted = replies.filter((r) => r.status === 202);
  expect(accepted).toHaveLength(1);
  for (const response of replies.filter((r) => r.status !== 202)) expect(response.status).toBe(409);
  const value = (await accepted[0].json()).data;
  owned.add(value.taskId);
  expect(
    (
      await stack.sql.query("select count(*)::int n from public.tasks where source_ref=$1", [
        original.documentId,
      ])
    ).rows[0].n,
  ).toBe(2);
});
it("supports explicit mobile recovery, lost-response retry and inspection of the new attempt", async () => {
  const original = await paste();
  await fail(original.taskId);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(
      admin.cookie.split("; ").map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stack.origin };
      }),
    );
    const page = await context.newPage();
    await page.goto(`${stack.origin}/admin/`);
    const panel = page.getByLabel("Task and worker diagnostics", { exact: true });
    await panel.locator("summary").click();
    await panel.getByLabel("Diagnostic task identifier").fill(original.taskId);
    await panel.getByRole("button", { name: "Inspect task identifier", exact: true }).click();
    const control = panel.getByLabel("Task recovery", { exact: true });
    await control.getByRole("button", { name: "Check recovery eligibility", exact: true }).click();
    await webExpect(
      control.getByRole("button", { name: "Create new task attempt", exact: true }),
    ).toBeVisible();
    let lost = true;
    await page.route(`**/api/v1/${path(original.taskId)}`, async (route) => {
      if (route.request().method() === "POST" && lost) {
        lost = false;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await control.getByRole("button", { name: "Create new task attempt", exact: true }).click();
    await webExpect(control.getByRole("alert")).toBeVisible();
    await control.getByRole("button", { name: "Retry this recovery request", exact: true }).click();
    await webExpect(
      control.getByRole("button", { name: "Inspect recovered attempt", exact: true }),
    ).toBeVisible();
    const next = (
      await stack.sql.query("select task_id from public.task_replays where previous_task_id=$1", [
        original.taskId,
      ])
    ).rows[0].task_id;
    owned.add(next);
    expect(
      (
        await stack.sql.query("select count(*)::int n from public.tasks where source_ref=$1", [
          original.documentId,
        ])
      ).rows[0].n,
    ).toBe(2);
    await control.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/assets/task-replay-mobile.png", fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await control.getByRole("button", { name: "Inspect recovered attempt", exact: true }).click();
    await webExpect(
      panel
        .getByLabel("Selected task diagnostics")
        .getByText(`${next} · resume.parse · queued`, { exact: true }),
    ).toBeVisible();
    await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
    try {
      await panel
        .getByLabel("Task recovery", { exact: true })
        .getByRole("button", { name: "Check recovery eligibility", exact: true })
        .click();
      await webExpect(
        page.getByText("Administration requires a current administrator session.", {
          exact: false,
        }),
      ).toBeVisible();
      await webExpect(panel).toHaveCount(0);
      await webExpect(panel.getByLabel("Selected task diagnostics", { exact: true })).toHaveCount(
        0,
      );
    } finally {
      await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
    }
  } finally {
    await browser.close();
  }
  // A full mobile browser journey against a cold production server; match career-journey.
}, 60000);
it("replays a committed private PDF and refuses a source whose stored object disappeared", async () => {
  const pdf = new PDFDocument(),
    chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    pdf.on("data", (part) => chunks.push(part));
    pdf.once("end", resolve);
    pdf.once("error", reject);
  });
  pdf.text("Synthetic committed PDF recovery fixture.");
  pdf.end();
  await done;
  const bytes = Buffer.concat(chunks);
  async function upload() {
    const authority = await post(
      "resumes/upload-intents",
      member,
      { filename: "recovery.pdf", mediaType: "application/pdf", byteCount: bytes.length },
      201,
    );
    const response = await fetch(`${stack.origin}/api/v1/resumes/${authority.documentId}/source`, {
      method: "PUT",
      headers: {
        Cookie: member.cookie,
        Origin: stack.origin,
        "Content-Type": "application/pdf",
        "X-Upload-Token": authority.uploadToken,
      },
      body: new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
    });
    const document = resumeDocumentSchema.parse(await data(response, 200));
    owned.add(document.taskId!);
    return document;
  }
  const document = await upload();
  await fail(document.taskId!);
  expect((await preview(document.taskId!)).available).toBe(true);
  const next = await replay(document.taskId!);
  await execution.execute(next.taskId);
  expect((await row(next.taskId)).status).toBe("succeeded");
  const missing = await upload();
  await fail(missing.taskId!);
  const key = (
    await stack.sql.query("select source_key from public.resume_documents where id=$1", [
      missing.id,
    ])
  ).rows[0].source_key;
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").remove([key])).error,
  ).toBeNull();
  expect((await preview(missing.taskId!)).reason).toBe("source-stale");
});
it("inherits the original execution retry ceiling rather than silently increasing it", async () => {
  const original = await paste();
  await stack.sql.query("update public.tasks set max_attempts=1 where id=$1", [original.taskId]);
  await fail(original.taskId);
  const next = await replay(original.taskId);
  expect((await row(next.taskId)).max_attempts).toBe(1);
  await execution.exhaust(next.taskId);
  expect((await row(next.taskId)).status).toBe("failed");
  expect((await row(next.taskId)).attempt_count).toBe(1);
});
