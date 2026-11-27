import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { courseFields } from "../../src/modules/learning/model";
import { FeedFailure } from "../../src/modules/ingestion/model";
import { publicationFields } from "../../src/modules/jobs/model";
import { TaskWorker } from "../../src/modules/tasks/worker";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase";
import { FeedImportHandler, FeedScheduler } from "../../src/modules/ingestion/feed-handler";
import {
  StaticFeedRegistry,
  SafeFeedReader,
  type FeedNetwork,
} from "../../src/modules/ingestion/adapters/safe-feed";
import { SupabaseFeedExecutionStore } from "../../src/modules/ingestion/adapters/feed-store";
import { Sha256ImportDigest } from "../../src/modules/ingestion/adapters/identity";
import type { FeedReader } from "../../src/modules/ingestion/ports";
// Exercise server adapters against the local database in Vitest's Node runtime.
vi.mock("server-only", () => ({}));
const id = () => crypto.randomUUID(),
  prefix = `rf-feed-${id()}`;
let stack: LocalFixtures,
  admin: LocalMember,
  member: LocalMember,
  sourceId: string,
  courseSourceId: string,
  registry: StaticFeedRegistry,
  store: SupabaseFeedExecutionStore;
const runs: string[] = [],
  signal = () => new AbortController().signal;
const job = {
  externalId: "feed-role",
  url: `https://jobs.test.invalid/${prefix}/role`,
  state: "active",
  fields: {
    title: `${prefix} engineer`,
    company: prefix,
    track: "Engineering & data",
    specialization: "ai-llm-applications",
    summary: "Authored permitted metadata",
    requirements: [
      { text: "Explicit Python requirement", priority: "mandatory", skills: ["Python"] },
    ],
  },
};
async function settings() {
  return (await (await stack.request("admin/imports/feeds", admin)).json()).data.settings.find(
    (entry: { sourceId: string }) => entry.sourceId === sourceId,
  );
}
async function configure(extra: Record<string, unknown> = {}) {
  const current = await settings(),
    response = await stack.request(`admin/imports/feeds/${sourceId}`, admin, "PATCH", {
      expectedRevision: current.revision,
      feedId: "fixture-jobs-json",
      enabled: true,
      intervalMinutes: 15,
      resume: false,
      ...extra,
    });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function request(key = id(), requestedSource = sourceId) {
  const response = await stack.request(
    `admin/imports/feeds/${requestedSource}/fetch`,
    admin,
    "POST",
    {},
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  const run = (await response.json()).data;
  runs.push(run.id);
  return run;
}
async function find(runId: string) {
  const response = await stack.request(`admin/imports/feed-runs/${runId}`, admin);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
function engine(reader: FeedReader = new SafeFeedReader(network())) {
  return new TaskWorker(
    new SupabaseTaskQueue(stack.privileged),
    { "catalog.fetch": new FeedImportHandler(store, registry, reader, new Sha256ImportDigest()) },
    { workerId: id(), leaseSeconds: 30, concurrency: 1 },
  );
}
function network(reply?: FeedNetwork["get"]): FeedNetwork {
  return {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    get:
      reply ||
      (async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ records: [job] })),
      })),
    sleep: async () => {},
    now: () => Date.now(),
  };
}
async function nodeWorker() {
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
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Owned feed worker exceeded its deadline."));
    }, 25000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Owned feed worker failed."));
    });
  });
}
async function stopPending(source = sourceId) {
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',t.queue_message_id) from public.tasks t join public.ingestion_feed_runs r on r.task_id=t.id where r.source_id=$1 and t.queue_message_id is not null",
    [source],
  );
  await stack.sql.query(
    "update public.tasks set status='failed',lease_token=null,lease_expires_at=null,worker_id=null where id in(select task_id from public.ingestion_feed_runs where source_id=$1) and status in ('queued','running')",
    [source],
  );
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  registry = new StaticFeedRegistry(
    JSON.parse(await readFile("tests/support/approved-feeds.json", "utf8")),
  );
  store = new SupabaseFeedExecutionStore(stack.privileged);
  const response = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Authored feed fixture",
    authorizationBasis: "Own synthetic metadata",
    rightsSummary: "Not a real opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(response.status).toBe(201);
  sourceId = (await response.json()).data.id;
  const course = await stack.request("admin/courses/sources", admin, "POST", {
    providerId: "deeplearning-ai",
    name: `${prefix}-courses`,
    publisher: "Authored CSV feed fixture",
    authorizationBasis: "Own synthetic independent metadata",
    rightsSummary: "Not a verified offering",
    allowedHosts: ["www.deeplearning.ai"],
    permittedFields: courseFields,
    isDemo: true,
  });
  expect(course.status).toBe(201);
  courseSourceId = (await course.json()).data.id;
});
afterAll(async () => {
  if (!stack) return;
  await stopPending();
  await stopPending(courseSourceId);
  await stack.sql.query("delete from public.ingestion_feed_runs where source_id=any($1::uuid[])", [
    [sourceId, courseSourceId],
  ]);
  await stack.sql.query(
    "delete from public.ingestion_feed_settings where source_id=any($1::uuid[])",
    [[sourceId, courseSourceId]],
  );
  await stack.sql.query(
    "delete from public.ingestion_publications where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [[sourceId, courseSourceId]],
  );
  await stack.sql.query(
    "delete from public.review_items where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [[sourceId, courseSourceId]],
  );
  await stack.sql.query("delete from public.source_records where source_id=any($1::uuid[])", [
    [sourceId, courseSourceId],
  ]);
  await stack.sql.query(
    "delete from public.import_requests where batch_id in(select id from public.import_batches where source_id=any($1::uuid[]))",
    [[sourceId, courseSourceId]],
  );
  await stack.sql.query("delete from public.import_batches where source_id=any($1::uuid[])", [
    [sourceId, courseSourceId],
  ]);
  const jobs = (
    await stack.sql.query("select job_id from public.job_sources where source_id=any($1::uuid[])", [
      [sourceId, courseSourceId],
    ])
  ).rows.map((row) => row.job_id);
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[])))",
    [jobs],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
    [jobs],
  );
  await stack.sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [jobs]);
  await stack.sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [jobs]);
  await stack.sql.query("delete from public.jobs where id=any($1::uuid[])", [jobs]);
  await stack.sql.query(
    "delete from public.companies where name=$1 and not exists(select 1 from public.jobs where company_id=companies.id)",
    [prefix],
  );
  const courseIds = (
    await stack.sql.query(
      "select distinct course_id from public.course_versions where source_id=$1",
      [courseSourceId],
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
  await stack.sql.query("delete from public.course_source_providers where source_id=$1", [
    courseSourceId,
  ]);
  await stack.sql.query("delete from public.ingestion_settings where source_id=any($1::uuid[])", [
    [sourceId, courseSourceId],
  ]);
  await stack.sql.query("delete from public.sources where id=any($1::uuid[])", [
    [sourceId, courseSourceId],
  ]);
  await stack.sql.query("delete from public.ingestion_audit where actor_id=$1", [admin.id]);
  await stack.close();
});
it("selects only deployment-approved IDs and keeps feed permission independent of manual uploads", async () => {
  const response = await stack.request("admin/imports/feeds", admin),
    body = (await response.json()).data;
  expect(body.definitions.map((entry: { id: string }) => entry.id)).toContain("fixture-jobs-json");
  expect(JSON.stringify(body.definitions)).not.toContain("https://");
  expect(
    (
      await stack.request(`admin/imports/feeds/${sourceId}`, admin, "PATCH", {
        expectedRevision: 0,
        feedId: "fixture-jobs-json",
        enabled: true,
        intervalMinutes: 15,
        resume: false,
        url: "https://127.0.0.1/",
      })
    ).status,
  ).toBe(400);
  await configure();
  expect(
    (
      await stack.request(
        "admin/imports",
        admin,
        "POST",
        { sourceId, batchId: id(), format: "json", content: JSON.stringify({ records: [job] }) },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(403);
  const key = id(),
    replies = await Promise.all(Array.from({ length: 6 }, () => request(key)));
  expect(new Set(replies.map((reply) => reply.id)).size).toBe(1);
  const queued = replies[0];
  const message = (
    await stack.sql.query(
      "select message from pgmq.q_rolefoundry_tasks where msg_id=(select queue_message_id from public.tasks where id=$1)",
      [queued.taskId],
    )
  ).rows[0].message;
  expect(message).toEqual({ taskId: queued.taskId });
  let hops = 0;
  const reader = new SafeFeedReader(
    network(async (url, address) => {
      expect(address.address).toBe("93.184.216.34");
      hops++;
      return url.hostname === "feed.test.invalid"
        ? {
            status: 302,
            headers: { location: "https://redirect.test.invalid/jobs.json" },
            body: new Uint8Array(),
          }
        : {
            status: 200,
            headers: { "content-type": "application/json" },
            body: Buffer.from(
              JSON.stringify({
                records: [
                  job,
                  {
                    externalId: "forbidden",
                    url: job.url,
                    fields: { email: "never-store@invalid" },
                  },
                ],
              }),
            ),
          };
    }),
  );
  expect(await engine(reader).tick(signal())).toBe(1);
  const completed = await find(queued.id);
  expect(completed.status).toBe("succeeded");
  expect(completed.batchId).not.toBeNull();
  expect(hops).toBe(2);
  expect(
    (
      await stack.sql.query("select input_origin,content from public.import_batches where id=$1", [
        completed.batchId,
      ])
    ).rows[0].input_origin,
  ).toBe("feed");
  expect(
    JSON.stringify(
      (
        await stack.sql.query("select content from public.import_batches where id=$1", [
          completed.batchId,
        ])
      ).rows,
    ),
  ).not.toContain("never-store");
  // A retry after sealing cannot refetch or replace the immutable batch.
  await expect(
    new FeedImportHandler(store, registry, reader, new Sha256ImportDigest()).execute(
      {
        taskId: queued.taskId,
        messageId: "1",
        kind: "catalog.fetch",
        token: id(),
        leaseSeconds: 30,
      },
      signal(),
    ),
  ).rejects.toMatchObject({ category: "stale" });
  expect(hops).toBe(2);
  await nodeWorker();
  const batch = (await (await stack.request(`admin/imports/${completed.batchId}`, admin)).json())
    .data;
  expect(batch.items).toHaveLength(1);
  expect(batch.rejected).toHaveLength(1);
  const review = (
    await (await stack.request(`admin/imports/reviews/${batch.items[0].id}`, admin)).json()
  ).data;
  const published = await stack.request(
    `admin/imports/reviews/${review.id}/decide`,
    admin,
    "POST",
    {
      expectedRevision: review.revision,
      decision: "publish",
      draft: review.normalized.candidate,
      reason: "Reviewed authored feed metadata",
      allowNewDuplicate: false,
    },
    { "Idempotency-Key": id() },
  );
  expect(published.status).toBe(200);
  const resource = (await published.json()).data.resourceId;
  expect((await stack.request(`jobs/${resource}`)).status).toBe(200);
});
it("treats an empty authorized feed as an empty review batch without inferring closure", async () => {
  const run = await request();
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from('{"records":[]}'),
      })),
    ),
  ).tick(signal());
  await nodeWorker();
  const result = await find(run.id),
    batch = (await (await stack.request(`admin/imports/${result.batchId}`, admin)).json()).data;
  expect(batch.status).toBe("succeeded");
  expect(batch.total).toBe(0);
  expect(batch.items).toEqual([]);
  expect(batch.rejected).toEqual([]);
  expect(
    (
      await stack.sql.query("select freshness from public.job_sources where source_id=$1", [
        sourceId,
      ])
    ).rows[0].freshness,
  ).toBe("current");
  expect(
    (
      await stack.sql.query(
        "select state from public.source_records where source_id=$1 and external_id='feed-role'",
        [sourceId],
      )
    ).rows[0].state,
  ).toBe("active");
});
it("schedules a single due window across concurrent schedulers and skips pending, revoked and unowned sources", async () => {
  const scheduler = new FeedScheduler(store, registry);
  await stack.sql.query(
    "update public.ingestion_feed_settings set next_fetch_at=clock_timestamp()-interval '1 second' where source_id=$1",
    [sourceId],
  );
  const counts = await Promise.all(Array.from({ length: 4 }, () => scheduler.tick(signal())));
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
  expect(await scheduler.tick(signal())).toBe(0);
  await stack.sql.query(
    "update public.ingestion_feed_settings set next_fetch_at=clock_timestamp()-interval '1 second' where source_id=$1",
    [sourceId],
  );
  expect(await scheduler.tick(signal())).toBe(0); // In-flight run prevents a second window.
  await stopPending();
  await stack.sql.query("update public.sources set status='revoked' where id=$1", [sourceId]);
  expect(await scheduler.tick(signal())).toBe(0);
  await stack.sql.query("update public.sources set status='active' where id=$1", [sourceId]);
  await stack.sql.query(
    "update public.ingestion_feed_settings set owner_id=null where source_id=$1",
    [sourceId],
  );
  expect(await scheduler.tick(signal())).toBe(0);
  await configure();
});
it("persists a provider delay without closing a published job or scheduling overlapping work", async () => {
  const run = await request(),
    versions = (
      await stack.sql.query("select count(*) from public.job_versions where company_name=$1", [
        prefix,
      ])
    ).rows[0].count;
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 429,
        headers: { "retry-after": "120" },
        body: new Uint8Array(),
      })),
    ),
  ).tick(signal());
  const task = (
    await stack.sql.query(
      "select t.status,t.next_run_at,clock_timestamp() now,q.vt from public.tasks t join pgmq.q_rolefoundry_tasks q on q.msg_id=t.queue_message_id where t.id=$1",
      [run.taskId],
    )
  ).rows[0];
  expect(task.status).toBe("queued");
  expect(new Date(task.next_run_at).getTime() - new Date(task.now).getTime()).toBeGreaterThan(
    118000,
  );
  expect(new Date(task.vt).getTime() - new Date(task.now).getTime()).toBeGreaterThan(118000);
  expect(
    (
      await stack.sql.query("select freshness from public.job_sources where source_id=$1", [
        sourceId,
      ])
    ).rows[0].freshness,
  ).toBe("uncertain");
  expect(
    (
      await stack.sql.query("select count(*) from public.job_versions where company_name=$1", [
        prefix,
      ])
    ).rows[0].count,
  ).toBe(versions);
  expect(
    (
      await stack.sql.query(
        "select status from public.jobs where id=(select job_id from public.job_sources where source_id=$1 limit 1)",
        [sourceId],
      )
    ).rows[0].status,
  ).toBe("published");
  expect(await new FeedScheduler(store, registry).tick(signal())).toBe(0);
  await stopPending();
  // Advance only this fixture's provider clock before exercising another independent retrieval.
  await stack.sql.query(
    "update public.ingestion_feed_settings set pause_until=clock_timestamp()-interval '1 second' where source_id=$1",
    [sourceId],
  );
});
it("honors a persisted provider wait after a crash before queue backoff is written", async () => {
  const run = await request(),
    queue = new SupabaseTaskQueue(stack.privileged),
    leases = await queue.read(id(), ["catalog.fetch"], 30, 1),
    lease = leases.find((entry) => entry.taskId === run.taskId)!;
  expect(lease).toBeDefined();
  await store.failure(lease, "rate-limit", "120", false, signal());
  // Simulate process loss after recording the provider reply, before TaskWorker.queue.fail.
  await queue.release(lease);
  let requests = 0;
  await engine({
    read: async () => {
      requests++;
      return JSON.stringify({ records: [job] });
    },
  }).tick(signal());
  expect(requests).toBe(0);
  const task = (
    await stack.sql.query(
      "select status,next_run_at,clock_timestamp() now from public.tasks where id=$1",
      [run.taskId],
    )
  ).rows[0];
  expect(task.status).toBe("queued");
  expect(new Date(task.next_run_at).getTime() - new Date(task.now).getTime()).toBeGreaterThan(
    118000,
  );
  await stopPending();
  await stack.sql.query(
    "update public.ingestion_feed_settings set pause_until=clock_timestamp()-interval '1 second' where source_id=$1",
    [sourceId],
  );
});
it("pauses automatic retrieval for a long provider wait and rejects an early resume", async () => {
  const run = await request();
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 429,
        headers: { "retry-after": "90000" },
        body: new Uint8Array(),
      })),
    ),
  ).tick(signal());
  expect((await find(run.id)).status).toBe("failed");
  const setting = await settings();
  expect(setting.manualPause).toBe(true);
  expect(setting.providerWait).toBe("90000");
  expect(new Date(setting.pauseUntil).getTime() - Date.now()).toBeGreaterThan(89998000);
  expect(await new FeedScheduler(store, registry).tick(signal())).toBe(0);
  expect(
    (
      await stack.request(`admin/imports/feeds/${sourceId}`, admin, "PATCH", {
        expectedRevision: setting.revision,
        feedId: setting.feedId,
        enabled: true,
        intervalMinutes: 15,
        resume: true,
      })
    ).status,
  ).toBe(409);
  const changed = await admin.client.rpc("ingestion_feed_configure", {
    p_source: sourceId,
    p_expected: setting.revision,
    p_feed: setting.feedId,
    p_revision: "0".repeat(64),
    p_enabled: true,
    p_minutes: 30,
    p_resume: false,
  });
  expect(changed.error).toBeNull();
  expect(changed.data.manualPause).toBe(true);
  expect(changed.data.providerWait).toBe("90000");
  expect(
    (
      await admin.client.rpc("ingestion_feed_configure", {
        p_source: sourceId,
        p_expected: changed.data.revision,
        p_feed: setting.feedId,
        p_revision: setting.feedRevision,
        p_enabled: true,
        p_minutes: 15,
        p_resume: true,
      })
    ).error,
  ).not.toBeNull();
  await configure(); // Restoring the approved definition also preserves the reported wait.
  expect((await settings()).manualPause).toBe(true);
  await stack.sql.query(
    "update public.ingestion_feed_settings set pause_until=clock_timestamp()-interval '1 second' where source_id=$1",
    [sourceId],
  );
  await configure({ resume: true });
});
it("checks current registry and source authority before sealing fetched input", async () => {
  const run = await request();
  let reads = 0;
  const other = new StaticFeedRegistry([
    {
      id: "fixture-jobs-json",
      kind: "jobs",
      format: "json",
      url: "https://feed.test.invalid/changed.json",
      allowedHosts: ["feed.test.invalid"],
    },
  ]);
  const reader = {
    read: async () => {
      reads++;
      return JSON.stringify({ records: [job] });
    },
  };
  const worker = new TaskWorker(
    new SupabaseTaskQueue(stack.privileged),
    { "catalog.fetch": new FeedImportHandler(store, other, reader, new Sha256ImportDigest()) },
    { workerId: id(), leaseSeconds: 30, concurrency: 1 },
  );
  await worker.tick(signal());
  expect(reads).toBe(0);
  expect((await find(run.id)).status).toBe("failed");
  const stale = await request();
  const revoke = {
    read: async () => {
      await stack.sql.query("update public.sources set status='revoked' where id=$1", [sourceId]);
      return JSON.stringify({ records: [job] });
    },
  };
  await engine(revoke).tick(signal());
  expect((await find(stale.id)).batchId).toBeNull();
  await stack.sql.query("update public.sources set status='active' where id=$1", [sourceId]);
});
it("rolls back every sealed input when the lease expires during the actual commit", async () => {
  const run = await request(),
    queue = new SupabaseTaskQueue(stack.privileged),
    leases = await queue.read(id(), ["catalog.fetch"], 30, 1),
    lease = leases.find((entry) => entry.taskId === run.taskId)!;
  expect(lease).toBeDefined();
  const suffix = id().replaceAll("-", "");
  await stack.sql.query(
    `create function public.fixture_feed_${suffix}() returns trigger language plpgsql as $$begin if new.source_id='${sourceId}'::uuid and new.input_origin='feed' then update public.tasks set lease_expires_at=clock_timestamp()-interval '1 second' where id='${run.taskId}'::uuid;end if;return new;end $$;create trigger fixture_feed_${suffix} before insert on public.import_batches for each row execute function public.fixture_feed_${suffix}()`,
  );
  try {
    await expect(
      new FeedImportHandler(
        store,
        registry,
        new SafeFeedReader(network()),
        new Sha256ImportDigest(),
      ).execute(lease, signal()),
    ).rejects.toMatchObject({ category: "stale" });
    expect((await find(run.id)).batchId).toBeNull();
    expect(
      (
        await stack.sql.query("select count(*) from public.import_batches where batch_key=$1", [
          `feed:${run.id}`,
        ])
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await stack.sql.query(
      `drop trigger fixture_feed_${suffix} on public.import_batches;drop function public.fixture_feed_${suffix}()`,
    );
    await stopPending();
  }
});
it("records malformed input without source payloads and uses the actual Node network failure path", async () => {
  const run = await request();
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from('{"private":"do-not-retain"'),
      })),
    ),
  ).tick(signal());
  expect((await find(run.id)).status).toBe("failed");
  expect((await find(run.id)).errorCode).toBe("invalid-content");
  expect(
    JSON.stringify(
      (await stack.sql.query("select * from public.ingestion_feed_runs where id=$1", [run.id]))
        .rows,
    ),
  ).not.toContain("do-not-retain");
  const actual = await request();
  await nodeWorker();
  const result = await find(actual.id);
  expect(result.batchId).toBeNull();
  expect(["network", "timeout"]).toContain(result.errorCode);
  await stopPending();
});
it("denies browser roles access to schedules, raw runs and worker mutation helpers", async () => {
  expect((await stack.request("admin/imports/feeds", member)).status).toBe(403);
  expect((await stack.request("admin/imports/feed-runs", member)).status).toBe(403);
  expect(
    (
      await stack.request(
        `admin/imports/feeds/${sourceId}/fetch`,
        member,
        "POST",
        {},
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(403);
  expect((await stack.request("admin/imports/feeds")).status).toBe(401);
  for (const table of ["ingestion_feed_settings", "ingestion_feed_runs"])
    expect((await member.client.from(table).select("*")).error).not.toBeNull();
  expect(
    (
      await admin.client.rpc("ingestion_schedule_due", {
        p_definitions: registry.list(),
        p_limit: 10,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await admin.client.rpc("ingestion_feed_prepare", {
        p_task: id(),
        p_token: id(),
        p_content: {},
        p_raw_hash: "0".repeat(64),
      })
    ).error,
  ).not.toBeNull();
});

it("configures and fetches an approved source in the mobile administrator browser, then opens its review batch", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    page.setDefaultTimeout(8000);
    await page.goto(`${stack.origin}/admin/`);
    await page.getByText("Approved remote feeds and schedules", { exact: true }).click();
    await page
      .getByLabel(`Approved feed for ${prefix}`, { exact: true })
      .selectOption("fixture-jobs-json");
    await page.getByLabel(`Refresh interval for ${prefix}`, { exact: true }).fill("30");
    const saved = page.waitForResponse(
      (response) =>
        /\/api\/v1\/admin\/imports\/feeds\/[^/]+\/?$/.test(response.url()) &&
        response.request().method() === "PATCH" &&
        response.status() !== 308,
    );
    await page
      .getByRole("button", { name: `Save feed settings for ${prefix}`, exact: true })
      .click();
    expect((await saved).status()).toBe(200);
    await webExpect(page.getByLabel(`Refresh interval for ${prefix}`, { exact: true })).toHaveValue(
      "30",
    );
    const queued = page.waitForResponse(
      (response) => /\/fetch\/?$/.test(response.url()) && response.status() !== 308,
    );
    await page
      .getByRole("button", { name: `Fetch approved feed for ${prefix}`, exact: true })
      .click();
    const queuedResponse = await queued;
    expect(queuedResponse.status()).toBe(202);
    const run = (await queuedResponse.json()).data;
    runs.push(run.id);
    await engine().tick(signal());
    await nodeWorker();
    await webExpect(
      page.getByRole("button", { name: "Review fetched batch", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review fetched batch", exact: true }).click();
    await page.getByRole("button", { name: "Review row 1", exact: true }).click();
    const reviewPanel = page.getByRole("region", { name: "Import record review", exact: true });
    await reviewPanel
      .getByLabel("Import decision reason", { exact: true })
      .fill("Confirmed an unchanged authored feed record");
    await reviewPanel
      .getByRole("button", { name: "Confirm unchanged record", exact: true })
      .click();
    await webExpect(reviewPanel.getByText(/Recorded decision: confirm/)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "docs/assets/ingestion-feed-mobile.png", fullPage: true });
    await page.reload();
    await page.getByText("Approved remote feeds and schedules", { exact: true }).click();
    await webExpect(
      page.getByRole("button", { name: `Open fetched batch ${run.id}`, exact: true }),
    ).toBeVisible();
    expect((await settings()).intervalMinutes).toBe(30);
  } finally {
    await browser.close();
  }
});

it("fetches provider CSV into a reviewed course, preserves its version on failure and reviews explicit closure", async () => {
  const configured = await stack.request(`admin/imports/feeds/${courseSourceId}`, admin, "PATCH", {
    expectedRevision: 0,
    feedId: "fixture-courses-csv",
    enabled: true,
    intervalMinutes: 1440,
    resume: false,
  });
  expect(configured.status).toBe(200);
  const url = `https://www.deeplearning.ai/short-courses/${prefix}/`,
    quote = (cell: string) => `"${cell.replaceAll('"', '""')}"`,
    csv = [
      "externalId,url,state,title,summary,skills,format,officialMinutes,durationNote,practice",
      [
        "feed-course",
        url,
        "active",
        `${prefix} course`,
        "Authored independent summary",
        JSON.stringify(["Python"]),
        "Short course",
        "90",
        "Authored fixture duration",
        JSON.stringify({
          prompt: "Build a synthetic exercise",
          completionCriteria: "Explain its result",
          minutes: 30,
        }),
      ]
        .map(quote)
        .join(","),
    ].join("\n");
  const run = await request(id(), courseSourceId);
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 200,
        headers: { "content-type": "text/csv" },
        body: Buffer.from(csv),
      })),
    ),
  ).tick(signal());
  await nodeWorker();
  const batchId = (await find(run.id)).batchId,
    batch = (await (await stack.request(`admin/imports/${batchId}`, admin)).json()).data,
    review = (
      await (await stack.request(`admin/imports/reviews/${batch.items[0].id}`, admin)).json()
    ).data;
  const publish = await stack.request(
    `admin/imports/reviews/${review.id}/decide`,
    admin,
    "POST",
    {
      expectedRevision: review.revision,
      decision: "publish",
      draft: review.normalized.candidate,
      reason: "Reviewed authored provider feed metadata",
      allowNewDuplicate: false,
    },
    { "Idempotency-Key": id() },
  );
  expect(publish.status).toBe(200);
  const receipt = (await publish.json()).data;
  expect((await stack.request(`courses/${receipt.resourceId}`)).status).toBe(200);
  const failing = await request(id(), courseSourceId);
  await engine({
    read: async () => {
      throw new FeedFailure("network");
    },
  }).tick(signal());
  expect((await find(failing.id)).batchId).toBeNull();
  expect(
    (
      await stack.sql.query("select availability from public.courses where id=$1", [
        receipt.resourceId,
      ])
    ).rows[0].availability,
  ).toBe("uncertain");
  await stopPending(courseSourceId);
  const uploadSetting = (
    await (await stack.request("admin/imports/sources", admin)).json()
  ).data.find((entry: { id: string }) => entry.id === courseSourceId);
  expect(
    (
      await stack.request(`admin/imports/sources/${courseSourceId}`, admin, "PATCH", {
        expectedRevision: uploadSetting.revision,
        uploadsEnabled: false,
        allowClosure: true,
      })
    ).status,
  ).toBe(200);
  const closed = await request(id(), courseSourceId),
    closedCsv = `externalId,url,state\nfeed-course,${url},closed`;
  await engine(
    new SafeFeedReader(
      network(async () => ({
        status: 200,
        headers: { "content-type": "text/csv" },
        body: Buffer.from(closedCsv),
      })),
    ),
  ).tick(signal());
  await nodeWorker();
  const closedBatch = (
      await (await stack.request(`admin/imports/${(await find(closed.id)).batchId}`, admin)).json()
    ).data,
    closedReview = (
      await (await stack.request(`admin/imports/reviews/${closedBatch.items[0].id}`, admin)).json()
    ).data;
  expect(
    (
      await stack.request(
        `admin/imports/reviews/${closedReview.id}/decide`,
        admin,
        "POST",
        {
          expectedRevision: closedReview.revision,
          decision: "close",
          draft: null,
          reason: "Reviewed explicit fixture course closure",
          allowNewDuplicate: false,
        },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(200);
  expect((await stack.request(`courses/${receipt.resourceId}`)).status).toBe(404);
  expect(
    (
      await stack.sql.query("select count(*) from public.course_versions where course_id=$1", [
        receipt.resourceId,
      ])
    ).rows[0].count,
  ).toBe("1");
});
