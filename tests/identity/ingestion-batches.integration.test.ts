import { beforeAll, afterAll, it, expect } from "vitest";
import { chromium, expect as webExpect, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { publicationFields } from "../../src/modules/jobs/model";
import { courseFields } from "../../src/modules/learning/model";
import { planImport } from "../../src/modules/ingestion/normalizer";
import { Sha256ImportKey } from "../../src/modules/ingestion/adapters/identity";
const id = () => crypto.randomUUID(),
  prefix = `rf-import-${id()}`;
let stack: LocalFixtures,
  admin: LocalMember,
  member: LocalMember,
  jobSource: string,
  courseSource: string;
const sources: string[] = [],
  batches: string[] = [],
  tasks: string[] = [];
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
const fields = {
  company: prefix,
  title: "Authored AI engineer",
  track: "Engineering & data",
  specialization: "ai-llm-applications",
  summary: "Synthetic source text",
  requirements: [
    { text: "Explicit Python requirement", priority: "mandatory", skills: ["Python"] },
  ],
};
function data(externalId = "role-1", changes: Record<string, unknown> = {}) {
  return {
    externalId,
    url: `https://jobs.test.invalid/${prefix}/${externalId}`,
    state: "active",
    fields: { ...fields, ...changes },
  };
}
async function submit(rows: unknown[], source = jobSource, batchId = id(), key = id()) {
  const response = await stack.request(
    "admin/imports",
    admin,
    "POST",
    { sourceId: source, batchId, format: "json", content: JSON.stringify({ records: rows }) },
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  const result = (await response.json()).data;
  batches.push(result.id);
  tasks.push(result.taskId);
  return result as { id: string; taskId: string; status: string };
}
async function find(batchId: string) {
  const response = await stack.request(`admin/imports/${batchId}`, admin);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function worker() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts", "--drain"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: stack.env.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
        },
        stdio: "ignore",
      },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Owned import fixture worker exceeded its deadline."));
    }, 25000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(Error("Owned import worker failed."));
    });
  });
}
async function configure(sourceId: string, enabled = true, expectedRevision = 0) {
  const response = await stack.request(`admin/imports/sources/${sourceId}`, admin, "PATCH", {
    expectedRevision,
    uploadsEnabled: enabled,
    allowClosure: true,
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  const source = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Authored fixture",
    authorizationBasis: "Synthetic test metadata",
    rightsSummary: "Not a real opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(source.status).toBe(201);
  jobSource = (await source.json()).data.id;
  sources.push(jobSource);
  const course = await stack.request("admin/courses/sources", admin, "POST", {
    providerId: "deeplearning-ai",
    name: `${prefix}-courses`,
    publisher: "Authored fixture",
    authorizationBasis: "Synthetic independent metadata",
    rightsSummary: "Not a verified provider offering",
    allowedHosts: ["www.deeplearning.ai"],
    permittedFields: courseFields,
    isDemo: true,
  });
  expect(course.status).toBe(201);
  courseSource = (await course.json()).data.id;
  sources.push(courseSource);
  await configure(jobSource);
  await configure(courseSource);
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=$1 and kind='catalog.import' and queue_message_id is not null",
    [admin.id],
  );
  await stack.sql.query(
    "delete from public.ingestion_publications where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [sources],
  );
  await stack.sql.query(
    "delete from public.review_items where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [sources],
  );
  await stack.sql.query("delete from public.source_records where source_id=any($1::uuid[])", [
    sources,
  ]);
  await stack.sql.query(
    "delete from public.import_requests where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [sources],
  );
  await stack.sql.query("delete from public.import_batches where source_id=any($1::uuid[])", [
    sources,
  ]);
  const jobIds = (
    await stack.sql.query(
      "select distinct job_id from public.job_sources where source_id=any($1::uuid[])",
      [sources],
    )
  ).rows.map((row) => row.job_id);
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[])))",
    [jobIds],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
    [jobIds],
  );
  await stack.sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [jobIds]);
  await stack.sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [jobIds]);
  await stack.sql.query("delete from public.jobs where id=any($1::uuid[])", [jobIds]);
  await stack.sql.query(
    "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=companies.id)",
    [prefix],
  );
  const courseIds = (
    await stack.sql.query(
      "select distinct course_id from public.course_versions where source_id=any($1::uuid[])",
      [sources],
    )
  ).rows.map((row) => row.course_id);
  await stack.sql.query(
    "delete from public.course_skill_links where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courseIds],
  );
  await stack.sql.query(
    "delete from public.course_prerequisites where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courseIds],
  );
  await stack.sql.query("delete from public.course_url_registry where course_id=any($1::uuid[])", [
    courseIds,
  ]);
  await stack.sql.query("delete from public.course_versions where course_id=any($1::uuid[])", [
    courseIds,
  ]);
  await stack.sql.query("delete from public.courses where id=any($1::uuid[])", [courseIds]);
  await stack.sql.query("delete from public.ingestion_settings where source_id=any($1::uuid[])", [
    sources,
  ]);
  await stack.sql.query(
    "delete from public.course_source_providers where source_id=any($1::uuid[])",
    [sources],
  );
  await stack.sql.query("delete from public.sources where id=any($1::uuid[])", [sources]);
  await stack.sql.query("delete from public.ingestion_audit where actor_id=$1", [admin.id]);
  await stack.close();
});
it("queues one sanitized batch under concurrency and runs a real worker into pending review without publishing", async () => {
  const batchId = id(),
    key = id(),
    body = {
      sourceId: jobSource,
      batchId,
      format: "json",
      content: JSON.stringify({
        records: [data(), data("forbidden", { privateField: "Do not retain this payload" })],
      }),
    };
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      stack.request("admin/imports", admin, "POST", body, { "Idempotency-Key": key }),
    ),
  );
  expect(responses.every((response) => response.status === 202)).toBe(true);
  const values = await Promise.all(responses.map(async (response) => (await response.json()).data));
  expect(new Set(values.map((value) => value.id)).size).toBe(1);
  batches.push(values[0].id);
  tasks.push(values[0].taskId);
  const stored = (
    await stack.sql.query("select content from public.import_batches where id=$1", [values[0].id])
  ).rows[0].content;
  expect(JSON.stringify(stored)).not.toContain("Do not retain this payload");
  expect(JSON.stringify(stored)).not.toContain("privateField");
  expect(
    (
      await stack.sql.query(
        "select message from pgmq.q_rolefoundry_tasks where msg_id=(select queue_message_id from public.tasks where id=$1)",
        [values[0].taskId],
      )
    ).rows[0].message,
  ).toEqual({ taskId: values[0].taskId });
  await worker();
  const batch = await find(values[0].id);
  expect(batch.status).toBe("succeeded");
  expect(batch.stage).toBe("review");
  expect(batch.items).toHaveLength(1);
  expect(batch.rejected).toHaveLength(1);
  expect(batch.items[0].normalized.candidate.salary).toBeNull();
  expect(batch.items[0].normalized.candidate.requirements[0].skills).toEqual(["python"]);
  expect(
    (
      await stack.sql.query("select count(*) from public.job_sources where source_id=$1", [
        jobSource,
      ])
    ).rows[0].count,
  ).toBe("0");
  const duplicate = await stack.request("admin/imports", admin, "POST", body, {
    "Idempotency-Key": id(),
  });
  expect(duplicate.status).toBe(202);
  expect((await duplicate.json()).data.id).toBe(batch.id);
  expect(
    (
      await stack.request(
        "admin/imports",
        admin,
        "POST",
        { ...body, content: JSON.stringify({ records: [data("changed")] }) },
        { "Idempotency-Key": key },
      )
    ).status,
  ).toBe(409);
  const rejectedChange = {
    ...body,
    content: JSON.stringify({
      records: [data(), data("forbidden", { privateField: "A different forbidden value" })],
    }),
  };
  expect(
    (
      await stack.request("admin/imports", admin, "POST", rejectedChange, {
        "Idempotency-Key": key,
      })
    ).status,
  ).toBe(409);
});
it("keeps reads, source configuration and worker functions inaccessible to members or raw tables", async () => {
  const batch = await submit([data("private")]);
  expect((await stack.request("admin/imports")).status).toBe(401);
  expect((await stack.request(`admin/imports/${batch.id}`, member)).status).toBe(403);
  expect((await stack.request("admin/imports/sources", member)).status).toBe(403);
  for (const table of [
    "ingestion_settings",
    "import_batches",
    "source_records",
    "review_items",
    "import_requests",
    "ingestion_audit",
  ])
    expect((await member.client.from(table).select("*")).error).not.toBeNull();
  expect(
    (await admin.client.rpc("ingestion_task_load", { p_task: batch.taskId, p_token: id() })).error,
  ).not.toBeNull();
  expect(
    (
      await stack.request(`admin/imports/sources/${jobSource}`, member, "PATCH", {
        expectedRevision: 1,
        uploadsEnabled: false,
        allowClosure: false,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await stack.request(
        "admin/imports",
        admin,
        "POST",
        {
          sourceId: jobSource,
          batchId: id(),
          format: "json",
          content: JSON.stringify({ records: [data()] }),
        },
        { "Idempotency-Key": id(), Origin: "https://foreign.invalid" },
      )
    ).status,
  ).toBe(403);
  await worker();
});
it("processes actual course metadata and CSV partial rows using the same dictionary and provider rules", async () => {
  const course = await submit(
    [
      {
        externalId: "course-1",
        url: `https://www.deeplearning.ai/short-courses/${prefix}/`,
        state: "active",
        fields: {
          title: "Synthetic course",
          summary: "Independent fixture summary",
          skills: ["Python"],
          format: "Short course",
          officialMinutes: "2 hours",
          durationNote: "Authored duration",
          practice: {
            prompt: "Build a synthetic exercise",
            completionCriteria: "Explain its result",
            minutes: 30,
          },
        },
      },
    ],
    courseSource,
  );
  const csv = await stack.request(
    "admin/imports",
    admin,
    "POST",
    {
      sourceId: jobSource,
      batchId: id(),
      format: "csv",
      content: `externalId,url,title\nfirst,https://jobs.test.invalid/${prefix}/csv,"Quoted, title"\nsecond,https://jobs.test.invalid/${prefix}/bad,extra,column`,
    },
    { "Idempotency-Key": id() },
  );
  expect(csv.status).toBe(202);
  const csvBatch = (await csv.json()).data;
  await worker();
  const result = await find(course.id);
  expect(result.items[0].normalized.candidate.officialMinutes).toBe(120);
  expect(result.items[0].normalized.candidate.skills).toEqual(["python"]);
  expect(result.items[0].normalized.candidate.editorialMinutes).toBeNull();
  expect((await find(csvBatch.id)).rejected).toHaveLength(1);
});
it("invalidates queued authority after settings changes and a revoke/reactivate cycle", async () => {
  const queued = await submit([data("revoked")]);
  const original = (await find(queued.id)).sourceCurrent;
  expect(original).toBe(true);
  for (const status of ["revoked", "active"]) {
    const response = await stack.request(
      `admin/catalog/sources/${jobSource}/status`,
      admin,
      "POST",
      { status },
    );
    expect(response.status).toBe(200);
  }
  expect((await find(queued.id)).sourceCurrent).toBe(false);
  await worker();
  const result = await find(queued.id);
  expect(result.status).toBe("failed");
  expect(result.items).toHaveLength(0);
  const current = (await (await stack.request("admin/imports/sources", admin)).json()).data.find(
    (source: { id: string }) => source.id === jobSource,
  );
  await configure(jobSource, false, current.revision);
  expect(
    (
      await stack.request(
        "admin/imports",
        admin,
        "POST",
        {
          sourceId: jobSource,
          batchId: id(),
          format: "json",
          content: JSON.stringify({ records: [data()] }),
        },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(403);
  await configure(jobSource, true, current.revision + 1);
});
it("rejects forged worker source references and rolls back review rows on a lease lost inside publication", async () => {
  const batch = await submit([data("lease-guard")]);
  const token = id();
  await stack.sql.query(
    "update public.tasks set status='running',attempt_count=1,worker_id=$2,lease_token=$3,lease_expires_at=clock_timestamp()+interval '30 seconds' where id=$1",
    [batch.taskId, id(), token],
  );
  const loaded = await stack.privileged.rpc("ingestion_task_load", {
    p_task: batch.taskId,
    p_token: token,
  });
  checked(loaded.error);
  const output = planImport(loaded.data.content, loaded.data.context, new Sha256ImportKey());
  const forged = structuredClone(output);
  forged.rows[0].externalId = "foreign-source-id";
  expect(
    (
      await stack.privileged.rpc("ingestion_task_publish", {
        p_task: batch.taskId,
        p_token: token,
        p_output: forged,
      })
    ).error?.message,
  ).toBe("RF_INVALID_INPUT");
  const functionName = `test_import_expiry_${id().replaceAll("-", "")}`;
  try {
    await stack.sql.query(
      `create function public.${functionName}() returns trigger language plpgsql as $$begin update public.tasks set lease_expires_at=clock_timestamp()-interval '1 second' where id='${batch.taskId}'::uuid;return new;end$$;create trigger ${functionName} before insert on public.review_items for each row when(new.batch_id='${batch.id}'::uuid) execute function public.${functionName}()`,
    );
    const result = await stack.privileged.rpc("ingestion_task_publish", {
      p_task: batch.taskId,
      p_token: token,
      p_output: output,
    });
    expect(result.error?.message).toBe("RF_CONFLICT");
    expect(
      (
        await stack.sql.query("select count(*) from public.review_items where batch_id=$1", [
          batch.id,
        ])
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await stack.sql.query(
      `drop trigger if exists ${functionName} on public.review_items;drop function if exists public.${functionName}()`,
    );
  }
  checked(
    (
      await stack.privileged.rpc("ingestion_task_publish", {
        p_task: batch.taskId,
        p_token: token,
        p_output: output,
      })
    ).error,
  );
  expect((await find(batch.id)).items).toHaveLength(1);
});
it("returns bounded history summaries and preserves full review details behind an owner-verified administrator read", async () => {
  const response = await stack.request("admin/imports", admin);
  expect(response.status).toBe(200);
  const page = await response.json();
  expect(page.data.length).toBeGreaterThan(0);
  expect(
    page.data.every(
      (batch: Record<string, unknown>) =>
        !Object.hasOwn(batch, "items") && !Object.hasOwn(batch, "rejected"),
    ),
  ).toBe(true);
  expect(page.data[0].rejectedCount).toBeTypeOf("number");
  expect((await stack.request("admin/imports?cursor=invalid", admin)).status).toBe(400);
});

async function review(id: string) {
  const response = await stack.request(`admin/imports/reviews/${id}`, admin);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function decide(
  item: any,
  decision = "publish",
  key = id(),
  draft: Record<string, unknown> | null = item.normalized.candidate,
  allowNewDuplicate = false,
) {
  return stack.request(
    `admin/imports/reviews/${item.id}/decide`,
    admin,
    "POST",
    {
      expectedRevision: item.revision,
      decision,
      draft: decision === "publish" ? draft : null,
      reason: "Explicit synthetic fixture review",
      allowNewDuplicate,
    },
    { "Idempotency-Key": key },
  );
}
it("publishes a reviewed opening with exact origin/reviewer, and repeats the decision without creating another version", async () => {
  const batch = await submit([data("published")]);
  await worker();
  const item = await review((await find(batch.id)).items[0].id),
    key = id();
  const first = await decide(item, "publish", key);
  expect(first.status).toBe(200);
  const receipt = (await first.json()).data;
  const repeat = await decide(item, "publish", key);
  expect(repeat.status).toBe(200);
  expect((await repeat.json()).data).toEqual(receipt);
  const job = await stack.request(`jobs/${receipt.resourceId}`);
  expect(job.status).toBe(200);
  expect((await job.json()).data.title).toBe(fields.title);
  const origin = (
    await stack.sql.query(
      "select reviewer_id,batch_id,preview_id from public.ingestion_publications where review_id=$1",
      [item.id],
    )
  ).rows[0];
  expect(origin.reviewer_id).toBe(admin.id);
  expect(origin.batch_id).toBe(batch.id);
  expect(origin.preview_id).toBe(item.previewId);
  expect(
    (
      await stack.sql.query("select count(*) from public.job_versions where job_id=$1", [
        receipt.resourceId,
      ])
    ).rows[0].count,
  ).toBe("1");
});
it("rebases a stale partial update onto current curation and keeps both preview versions immutable", async () => {
  const job = (
    await stack.sql.query(
      "select job_id from public.job_sources where source_id=$1 and external_id='published'",
      [jobSource],
    )
  ).rows[0].job_id;
  const batch = await submit([
    { ...data("published"), fields: { summary: "New partial source summary" } },
  ]);
  await worker();
  let item = await review((await find(batch.id)).items[0].id);
  await stack.sql.query("update public.jobs set revision=revision+1 where id=$1", [job]);
  expect((await decide(item)).status).toBe(409);
  const rebased = await stack.request(`admin/imports/reviews/${item.id}/rebase`, admin, "POST", {
    expectedRevision: item.revision,
    targetId: job,
  });
  expect(rebased.status).toBe(200);
  const newer = (await rebased.json()).data;
  expect(newer.previewVersion).toBe(2);
  expect(newer.normalized.candidate.title).toBe(fields.title);
  expect(newer.normalized.candidate.summary).toBe("New partial source summary");
  await expect(
    stack.sql.query(
      "update public.ingestion_review_versions set normalized='{}' where review_id=$1",
      [item.id],
    ),
  ).rejects.toMatchObject({ message: "RF_IMMUTABLE" });
  expect((await decide(newer)).status).toBe(200);
  expect(
    (
      await stack.sql.query(
        "select count(*) from public.ingestion_review_versions where review_id=$1",
        [item.id],
      )
    ).rows[0].count,
  ).toBe("2");
});
it("requires an explicit cross-source choice and can link a suggested canonical opening without creating a duplicate", async () => {
  const added = await stack.request("admin/catalog/sources", admin, "POST", {
    name: `${prefix}-second`,
    publisher: "Second authored publisher",
    authorizationBasis: "Synthetic duplicate metadata",
    rightsSummary: "Not a real opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(added.status).toBe(201);
  const secondSource = (await added.json()).data.id;
  sources.push(secondSource);
  await configure(secondSource);
  const batch = await submit([data("same-opening-other-id")], secondSource);
  await worker();
  let item = await review((await find(batch.id)).items[0].id);
  expect(item.normalized.candidateIds.length).toBeGreaterThan(0);
  expect((await decide(item)).status).toBe(409);
  const target = item.normalized.candidateIds[0],
    rebased = await stack.request(`admin/imports/reviews/${item.id}/rebase`, admin, "POST", {
      expectedRevision: item.revision,
      targetId: target,
    });
  expect(rebased.status).toBe(200);
  item = (await rebased.json()).data;
  const result = await decide(item);
  expect(result.status).toBe(200);
  expect((await result.json()).data.resourceId).toBe(target);
  expect(
    (
      await stack.sql.query(
        "select count(distinct job_id) from public.job_sources where source_id=any($1::uuid[]) and external_id in('published','same-opening-other-id')",
        [[jobSource, secondSource]],
      )
    ).rows[0].count,
  ).toBe("1");
});
it("publishes reviewed course metadata and can record a source closure without rewriting the prior version", async () => {
  const parent = (
    await stack.sql.query(
      "select id from public.import_batches where source_id=$1 order by sequence limit 1",
      [courseSource],
    )
  ).rows[0].id;
  let item = await review((await find(parent)).items[0].id);
  const published = await decide(item);
  expect(published.status).toBe(200);
  const receipt = (await published.json()).data;
  expect((await stack.request(`courses/${receipt.resourceId}`)).status).toBe(200);
  const batch = await submit(
    [
      {
        externalId: "course-1",
        url: `https://www.deeplearning.ai/short-courses/${prefix}/`,
        state: "closed",
        fields: {},
      },
    ],
    courseSource,
  );
  await worker();
  item = await review((await find(batch.id)).items[0].id);
  const closed = await decide(item, "close");
  expect(closed.status).toBe(200);
  expect((await stack.request(`courses/${receipt.resourceId}`)).status).toBe(404);
  expect(
    (
      await stack.sql.query("select count(*) from public.course_versions where course_id=$1", [
        receipt.resourceId,
      ])
    ).rows[0].count,
  ).toBe("1");
});
it("blocks an older observed source row once a newer batch has been prepared, while allowing an audited rejection", async () => {
  const old = await submit([data("superseded", { title: "Different observed title" })]);
  await worker();
  const newer = await submit([data("superseded", { title: "Newer observed title" })]);
  await worker();
  const item = await review((await find(old.id)).items[0].id);
  expect((await decide(item)).status).toBe(409);
  expect(
    (
      await stack.request(`admin/imports/reviews/${item.id}/rebase`, admin, "POST", {
        expectedRevision: item.revision,
        targetId: null,
      })
    ).status,
  ).toBe(409);
  expect((await decide(item, "reject")).status).toBe(200);
  expect((await find(newer.id)).items[0].state).toBe("pending");
});

it("requires new source authority after a completed preview and allows a deliberate current-policy rebase", async () => {
  const batch = await submit([data("authority-after-ready", { title: "Authority fixture" })]);
  await worker();
  let item = await review((await find(batch.id)).items[0].id);
  const setting = (await (await stack.request("admin/imports/sources", admin)).json()).data.find(
    (entry: { id: string }) => entry.id === jobSource,
  );
  await configure(jobSource, true, setting.revision);
  expect((await decide(item)).status).toBe(409);
  const response = await stack.request(`admin/imports/reviews/${item.id}/rebase`, admin, "POST", {
    expectedRevision: item.revision,
    targetId: null,
  });
  expect(response.status).toBe(200);
  item = (await response.json()).data;
  expect(item.sourceCurrent).toBe(true);
  expect((await decide(item)).status).toBe(200);
});
it("makes publication idempotent under concurrent decisions and keeps source input immutable", async () => {
  const batch = await submit([
    data("concurrent-publish", { title: "Concurrent publication fixture" }),
  ]);
  await worker();
  const item = await review((await find(batch.id)).items[0].id),
    key = id();
  await expect(
    stack.sql.query("update public.import_batches set content='{}' where id=$1", [batch.id]),
  ).rejects.toMatchObject({ message: "RF_IMMUTABLE" });
  const results = await Promise.all(Array.from({ length: 4 }, () => decide(item, "publish", key)));
  expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200]);
  const receipts = await Promise.all(results.map(async (response) => (await response.json()).data));
  expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(1);
  expect(
    (
      await stack.sql.query(
        "select count(*) from public.ingestion_publications where review_id=$1",
        [item.id],
      )
    ).rows[0].count,
  ).toBe("1");
});
it("does not let an administrator request bypass reviewer authorization from a member session", async () => {
  const batch = await submit([data("review-private", { title: "Role-guard fixture" })]);
  await worker();
  const item = await review((await find(batch.id)).items[0].id);
  expect((await stack.request(`admin/imports/reviews/${item.id}`, member)).status).toBe(403);
  expect(
    (
      await stack.request(`admin/imports/reviews/${item.id}/rebase`, member, "POST", {
        expectedRevision: item.revision,
        targetId: null,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await stack.request(
        `admin/imports/reviews/${item.id}/decide`,
        member,
        "POST",
        {
          expectedRevision: item.revision,
          decision: "reject",
          draft: null,
          reason: "Forged review",
          allowNewDuplicate: false,
        },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(403);
  for (const table of [
    "ingestion_review_versions",
    "ingestion_publications",
    "ingestion_decisions",
  ])
    expect((await member.client.from(table).select("*")).error).not.toBeNull();
  expect((await decide(item, "reject")).status).toBe(200);
});

async function browserPage(browser: Browser, user?: LocalMember, mobile = true) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 },
  });
  if (user)
    await context.addCookies(
      user.cookie.split("; ").map((entry) => {
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
  return context.newPage();
}
it("uploads, corrects, rebases and publishes a real job batch in the mobile administrator browser", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browserPage(browser, admin),
      batchKey = `${prefix}-browser-job`,
      title = `${prefix} browser role`,
      workspace = page.getByRole("region", { name: "Source import administration", exact: true });
    await page.goto(`${stack.origin}/admin/`);
    const sourceName = `${prefix}-browser-policy`;
    await page.getByText("Register a job metadata source", { exact: true }).click();
    await page.getByLabel("Job source name", { exact: true }).fill(sourceName);
    await page
      .getByLabel("Job source publisher", { exact: true })
      .fill("Authored fixture publisher");
    await page
      .getByLabel("Job source authorization basis (private)", { exact: true })
      .fill("Author-owned synthetic fixture metadata");
    await page
      .getByLabel("Job source public rights summary", { exact: true })
      .fill("Not a real opening");
    await page
      .getByLabel("Job source allowed hostnames", { exact: true })
      .fill("jobs.test.invalid");
    const permissions = page.getByRole("group", {
      name: "Permitted job metadata fields",
      exact: true,
    });
    for (const field of publicationFields)
      await permissions.getByLabel(field, { exact: true }).check();
    await page
      .getByLabel("This source contains fictional demonstration metadata", { exact: true })
      .check();
    const registration = page.waitForResponse(
      (response) =>
        /\/api\/v1\/admin\/catalog\/sources\/?$/.test(response.url()) && response.status() === 201,
    );
    await page
      .getByRole("button", { name: "Register job source with uploads disabled", exact: true })
      .click();
    const browserSource = (await (await registration).json()).data.id;
    sources.push(browserSource);
    await page.getByText(/^Authorized source settings/).click();
    await page.getByLabel(`Enable authorized uploads for ${sourceName}`, { exact: true }).check();
    await page
      .getByRole("button", { name: `Save settings for ${sourceName}`, exact: true })
      .click();
    await webExpect(
      page.getByLabel("Import source", { exact: true }).locator(`option[value="${browserSource}"]`),
    ).toHaveCount(1);
    await page.getByText(/^Authorized source settings/).click();
    await page.getByText("Register a job metadata source", { exact: true }).click();
    await page.getByLabel("Import source", { exact: true }).selectOption(browserSource);
    await page.getByLabel("Import batch identifier", { exact: true }).fill(batchKey);
    // Exercise the native file input and partial failures with real transport, not mocked routes.
    await page.getByLabel("Import file", { exact: true }).setInputFiles({
      name: "authored-jobs.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          records: [
            data("browser-job", { title }),
            { externalId: "bad-row", url: "http://private.invalid", fields: {} },
          ],
        }),
      ),
    });
    await webExpect(page.getByLabel("Import content", { exact: true })).toContainText(
      "browser-job",
    );
    const sent = page.waitForResponse(
      (response) =>
        /\/api\/v1\/admin\/imports\/?$/.test(response.url()) &&
        response.status() !== 308 &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Queue import for review", exact: true }).click();
    const response = await sent;
    expect(response.status()).toBe(202);
    const receipt = (await response.json()).data;
    batches.push(receipt.id);
    tasks.push(receipt.taskId);
    await worker();
    await webExpect(
      page.getByRole("heading", { name: "Rejected input rows", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review row 1", exact: true }).click();
    const panel = page.getByRole("region", { name: "Import record review", exact: true });
    await webExpect(panel.getByLabel("Role title", { exact: true })).toHaveValue(title);
    await panel.getByLabel("Role title", { exact: true }).fill(`${title} editorial correction`);
    await panel
      .getByLabel("Import decision reason", { exact: true })
      .fill("Reviewed authored source and corrected title");
    // Concurrent settings change invalidates authority; conflict must retain editorial edits.
    const settings = (await (await stack.request("admin/imports/sources", admin)).json()).data.find(
      (source: { id: string }) => source.id === browserSource,
    );
    await configure(browserSource, true, settings.revision);
    await panel.getByRole("button", { name: "Publish reviewed metadata", exact: true }).click();
    await webExpect(panel.getByRole("alert")).toBeVisible();
    await webExpect(panel.getByLabel("Role title", { exact: true })).toHaveValue(
      `${title} editorial correction`,
    );
    await panel
      .getByRole("button", { name: "Reload review and discard unsaved edits", exact: true })
      .click();
    await webExpect(
      panel.getByRole("button", { name: "Publish reviewed metadata", exact: true }),
    ).toBeDisabled();
    await panel
      .getByRole("button", { name: "Rebuild preview and discard unsaved edits", exact: true })
      .click();
    await webExpect(
      panel.getByRole("button", { name: "Publish reviewed metadata", exact: true }),
    ).toBeEnabled();
    await panel.getByLabel("Role title", { exact: true }).fill(`${title} reviewed`);
    await panel.getByRole("button", { name: "Publish reviewed metadata", exact: true }).click();
    await webExpect(panel.getByText(/Recorded decision: publish/)).toBeVisible();
    const stored = await find(receipt.id),
      item = await review(stored.items[0].id);
    expect(item.publication.decision).toBe("publish");
    const published = (await (await stack.request(`jobs/${item.publication.resourceId}`)).json())
      .data;
    expect(published.title).toBe(`${title} reviewed`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "docs/assets/ingestion-mobile.png", fullPage: true });
    await page.reload();
    await workspace.getByRole("button", { name: `Open batch ${batchKey}`, exact: true }).click();
    await page.getByRole("button", { name: "Review row 1", exact: true }).click();
    await webExpect(page.getByText(/Recorded decision: publish/)).toBeVisible();
  } finally {
    await browser.close();
  }
});
it("edits and publishes a provider course through the desktop import review and saves source settings", async () => {
  const batch = await submit(
    [
      {
        externalId: "browser-course",
        url: `https://www.deeplearning.ai/short-courses/${prefix}-browser/`,
        state: "active",
        fields: {
          title: `${prefix} browser course`,
          summary: "Authored independent metadata",
          skills: ["Python"],
          format: "Short course",
          officialMinutes: 90,
          durationNote: "Authored fixture estimate",
          practice: {
            prompt: "Build an exercise",
            completionCriteria: "Explain the result",
            minutes: 30,
          },
        },
      },
    ],
    courseSource,
    `${prefix}-browser-course`,
  );
  await worker();
  const browser = await chromium.launch();
  try {
    const page = await browserPage(browser, admin, false);
    await page.goto(`${stack.origin}/admin/`);
    await page
      .getByRole("button", { name: `Open batch ${prefix}-browser-course`, exact: true })
      .click();
    await page.getByRole("button", { name: "Review row 1", exact: true }).click();
    const panel = page.getByRole("region", { name: "Import record review", exact: true });
    await panel
      .getByLabel("Course title", { exact: true })
      .fill(`${prefix} reviewed browser course`);
    await panel.getByLabel("Difficulty", { exact: true }).selectOption("Beginner");
    await panel
      .getByLabel("Import decision reason", { exact: true })
      .fill("Reviewed authored course metadata and difficulty");
    await panel.getByRole("button", { name: "Publish reviewed metadata", exact: true }).click();
    await webExpect(panel.getByText(/Recorded decision: publish/)).toBeVisible();
    const item = await review((await find(batch.id)).items[0].id);
    const published = (await (await stack.request(`courses/${item.publication.resourceId}`)).json())
      .data;
    expect(published.title).toBe(`${prefix} reviewed browser course`);
    expect(published.difficulty).toBe("Beginner");
    await page.getByText(/^Authorized source settings/).click();
    await page
      .getByLabel(`Enable authorized uploads for ${prefix}-courses`, { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: `Save settings for ${prefix}-courses`, exact: true })
      .click();
    await webExpect(
      page.getByLabel("Import source", { exact: true }).locator(`option[value="${courseSource}"]`),
    ).toHaveCount(0);
    await page
      .getByLabel(`Enable authorized uploads for ${prefix}-courses`, { exact: true })
      .check();
    await page
      .getByRole("button", { name: `Save settings for ${prefix}-courses`, exact: true })
      .click();
    await webExpect(
      page.getByLabel("Import source", { exact: true }).locator(`option[value="${courseSource}"]`),
    ).toHaveCount(1);
    await page.screenshot({ path: "docs/assets/ingestion-desktop.png", fullPage: true });
  } finally {
    await browser.close();
  }
});
it("keeps import controls and batch contents unavailable to anonymous and member browsers", async () => {
  const browser = await chromium.launch();
  try {
    for (const user of [undefined, member]) {
      const page = await browserPage(browser, user);
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/v1/admin/imports")) requests.push(request.url());
      });
      await page.goto(`${stack.origin}/admin/`);
      await webExpect(
        page.getByText("Administrator access is required.", { exact: false }),
      ).toBeVisible();
      await webExpect(page.getByLabel("Import content", { exact: true })).toHaveCount(0);
      expect(requests).toEqual([]);
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
});
