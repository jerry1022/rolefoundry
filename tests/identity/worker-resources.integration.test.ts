import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import type { PoolClient } from "pg";
import { CareerJourney } from "../support/career-journey";
import type { LocalMember } from "../support/local-fixtures";
import { taskKinds, type TaskKind } from "../../src/modules/tasks/model";
import { taskResourcePool } from "../../src/modules/tasks/resources";
import { TaskWorker } from "../../src/modules/tasks/worker";
import type { TaskQueue } from "../../src/modules/tasks/ports";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase";
import { ResumeParseHandler } from "../../src/modules/resume/handler";
import { SupabaseResumeParseStore } from "../../src/modules/resume/adapters/execution";
import {
  SupabaseResumeStorage,
  Sha256ResumeDigest,
} from "../../src/modules/resume/adapters/storage";
import { IsolatedResumeProcessor } from "../../src/modules/resume/adapters/isolated-process";
import { MatchingHandler } from "../../src/modules/matching/handler";
import { SupabaseMatchingExecutionStore } from "../../src/modules/matching/adapters/supabase";
vi.mock("server-only", () => ({}));
let journey: CareerJourney, admin: LocalMember, user: LocalMember;
beforeAll(async () => {
  journey = await CareerJourney.open();
  admin = await journey.stack.member(true);
  user = await journey.stack.member();
});
afterAll(async () => {
  if (journey) await journey.close();
});
async function isolated(work: (sql: PoolClient) => Promise<void>) {
  const sql = await journey.stack.sql.connect();
  try {
    await sql.query("begin");
    await work(sql);
  } finally {
    await sql.query("rollback");
    sql.release();
  }
}
/** Transaction-only IDs sort before real work and never change a production queue sequence. */
async function queued(sql: PoolClient, kinds: TaskKind[]) {
  const base = -BigInt("0x" + crypto.randomUUID().replaceAll("-", "").slice(0, 12)) * 1000n;
  const ids: string[] = [];
  for (const [index, kind] of kinds.entries()) {
    const id = crypto.randomUUID(),
      message = (base + BigInt(index)).toString();
    ids.push(id);
    await sql.query(
      "insert into public.tasks(id,user_id,kind,source_ref,input_version,idempotency_key,request_hash,queue_message_id) values($1,$2,$3,$4,'owned-snapshot',$1::uuid::text,'owned-hash',$5)",
      [id, user.id, kind, crypto.randomUUID(), message],
    );
    await sql.query(
      "insert into pgmq.q_rolefoundry_tasks(msg_id,message,vt) overriding system value values($1,jsonb_build_object('taskId',$2::text),clock_timestamp())",
      [message, id],
    );
  }
  return ids;
}
async function read(
  sql: PoolClient,
  limits: unknown,
  quantity: number,
  workerId = crypto.randomUUID(),
) {
  return (
    await sql.query("select public.task_read_resources($1,$2,5,$3,$4::jsonb) value", [
      workerId,
      taskKinds,
      quantity,
      JSON.stringify(limits),
    ])
  ).rows[0].value as { taskId: string; kind: TaskKind; token: string }[];
}
it("keeps RPC authority private, validates resource bounds and agrees with every TypeScript assignment", async () => {
  const anonymous = createClient(journey.stack.env.API_URL, journey.stack.env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const args = {
    p_worker: crypto.randomUUID(),
    p_kinds: taskKinds,
    p_seconds: 5,
    p_quantity: 2,
    p_limits: { documents: 1, fetch: 1, general: 2 },
  };
  for (const client of [anonymous, user.client, admin.client])
    expect((await client.rpc("task_read_resources", args)).error).toBeTruthy();
  expect(
    (await journey.stack.privileged.rpc("task_resource_pool", { p_kind: "resume.parse" })).error,
  ).toBeTruthy();
  for (const p_limits of [
    {},
    [],
    { documents: -1, fetch: 1, general: 2 },
    { documents: 1.5, fetch: 1, general: 2 },
    { documents: "1", fetch: 1, general: 2 },
    { documents: 9, fetch: 1, general: 2 },
    { documents: 1, fetch: 1, provider: 2 },
  ])
    expect(
      (await journey.stack.privileged.rpc("task_read_resources", { ...args, p_limits })).error
        ?.message,
    ).toBe("RF_INVALID_INPUT");
  for (const kind of taskKinds)
    expect(
      (await journey.stack.sql.query("select public.task_resource_pool($1) pool", [kind])).rows[0]
        .pool,
    ).toBe(taskResourcePool(kind));
});
it("admits independent pools without consuming attempts or hiding the capacity-blocked document", async () => {
  await isolated(async (sql) => {
    const ids = await queued(sql, ["resume.parse", "resume.export", "assessment.grade"]);
    const first = await read(sql, { documents: 1, fetch: 1, general: 2 }, 2);
    expect(first.map((item) => item.taskId)).toEqual([ids[0], ids[2]]);
    expect(
      (await sql.query("select status,attempt_count from public.tasks where id=$1", [ids[1]]))
        .rows[0],
    ).toEqual({ status: "queued", attempt_count: 0 });
    expect(
      (
        await sql.query(
          "select vt<=clock_timestamp() visible from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
          [ids[1]],
        )
      ).rows[0].visible,
    ).toBe(true);
    // Each separate worker has its own handler budget; this is not a project-wide semaphore.
    const second = await read(sql, { documents: 1, fetch: 1, general: 0 }, 1);
    expect(second.map((item) => item.taskId)).toEqual([ids[1]]);
  });
});
it("finds general work beyond a paused document backlog and retains the legacy acquisition contract", async () => {
  await isolated(async (sql) => {
    const ids = await queued(sql, [
      ...Array.from({ length: 70 }, () => "resume.parse" as const),
      "assessment.grade",
    ]);
    const head = BigInt(
      (await sql.query("select queue_message_id::text id from public.tasks where id=$1", [ids[0]]))
        .rows[0].id,
    );
    for (const [offset, payload] of [
      [1n, {}],
      [2n, { taskId: null }],
    ] as const)
      await sql.query(
        "insert into pgmq.q_rolefoundry_tasks(msg_id,message,vt) overriding system value values($1,$2::jsonb,clock_timestamp())",
        [(head - offset).toString(), JSON.stringify(payload)],
      );
    const workerId = crypto.randomUUID();
    expect(
      (await read(sql, { documents: 0, fetch: 0, general: 1 }, 1, workerId)).map(
        (item) => item.taskId,
      ),
    ).toEqual([ids[70]]);
    expect(
      (
        await sql.query(
          "select 1 from public.task_events where worker_id=$1 and event='queue.poison' and safe_code='RF_POISON'",
          [workerId],
        )
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await sql.query(
          "select count(*)::int n from public.tasks where id=any($1::uuid[]) and status='queued' and attempt_count=0",
          [ids.slice(0, 70)],
        )
      ).rows[0].n,
    ).toBe(70);
    expect(await read(sql, { documents: 0, fetch: 0, general: 0 }, 8)).toEqual([]);
    const legacy = (
      await sql.query("select public.task_read($1,$2,5,2) value", [
        crypto.randomUUID(),
        ["resume.parse"],
      ])
    ).rows[0].value;
    expect(legacy.map((item: { taskId: string }) => item.taskId)).toEqual(ids.slice(0, 2));
    // Preserve the legacy reader's recovery of an interrupted/missing expiry.
    await sql.query("update public.tasks set lease_expires_at=null where id=$1", [ids[0]]);
    await sql.query(
      "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
      [ids[0]],
    );
    const recovered = (
      await sql.query("select public.task_read($1,$2,5,1) value", [
        crypto.randomUUID(),
        ["resume.parse"],
      ])
    ).rows[0].value;
    expect(recovered[0].taskId).toBe(ids[0]);
  });
});
it("runs actual private parsing and matching handlers while a replacement queue's excess document lease is released", async () => {
  const jobId = await journey.publishJob(admin),
    owner = await journey.stack.member();
  const documents = [];
  for (const text of [
    "Completed a Python evaluation project.",
    "Built a retrieval example with source citations.",
  ])
    documents.push(await journey.data("resumes/paste", owner, "POST", { text }, 202));
  const matching = await journey.data(
    "matches",
    owner,
    "POST",
    { jobId, constraints: { experienceYears: null, confirmations: [] } },
    202,
  );
  const owned = [...documents.map((item) => item.taskId), matching.taskId] as string[];
  for (const id of owned) journey.tasks.add(id);
  const adapter = new SupabaseTaskQueue(journey.stack.privileged);
  const queue: TaskQueue = {
    read: async (_worker, kinds, _seconds, quantity) => {
      const rows = (
        await journey.stack.sql.query(
          "select id from public.tasks where id=any($1::uuid[]) and status='queued' and kind=any($2::text[])",
          [owned, kinds],
        )
      ).rows;
      const queuedIds = new Set(rows.map((row) => row.id));
      const leases = [];
      for (const id of owned.filter((id) => queuedIds.has(id)).slice(0, quantity))
        leases.push(await journey.execution.claim(id));
      return leases;
    },
    heartbeat: adapter.heartbeat.bind(adapter),
    acknowledge: adapter.acknowledge.bind(adapter),
    fail: adapter.fail.bind(adapter),
    release: adapter.release.bind(adapter),
  };
  const parser = new ResumeParseHandler(
    new SupabaseResumeParseStore(
      journey.stack.privileged,
      new SupabaseResumeStorage(journey.stack.privileged),
      new Sha256ResumeDigest(),
    ),
    new IsolatedResumeProcessor(),
  );
  const worker = new TaskWorker(
    queue,
    {
      "resume.parse": parser,
      "matches.refresh": new MatchingHandler(
        new SupabaseMatchingExecutionStore(journey.stack.privileged),
      ),
    },
    {
      workerId: crypto.randomUUID(),
      concurrency: 3,
      leaseSeconds: 30,
      resourceLimits: { documents: 1, fetch: 1, general: 2 },
    },
  );
  expect(await worker.tick(AbortSignal.timeout(10000))).toBe(2);
  expect(
    (
      await journey.stack.sql.query("select status,attempt_count from public.tasks where id=$1", [
        documents[1].taskId,
      ])
    ).rows[0],
  ).toEqual({ status: "queued", attempt_count: 0 });
  expect((await journey.data(`resumes/${documents[0].documentId}`, owner)).status).toBe("parsed");
  expect((await journey.data(`matches/${matching.runId}`, owner)).status).toBe("succeeded");
  expect(await worker.tick(AbortSignal.timeout(10000))).toBe(1);
  expect((await journey.data(`resumes/${documents[1].documentId}`, owner)).status).toBe("parsed");
});
it("fails closed on invalid process resource settings without making a request or printing credentials", async () => {
  for (const documents of ["-1", "9", "invalid"]) {
    const chunks: string[] = [];
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts", "--once"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: journey.stack.env.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: journey.stack.env.SERVICE_ROLE_KEY,
          WORKER_CONCURRENCY: "3",
          WORKER_DOCUMENT_CONCURRENCY: documents,
          WORKER_FETCH_CONCURRENCY: "1",
          WORKER_GENERAL_CONCURRENCY: "3",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
    expect(
      await new Promise((resolve, reject) => {
        child.once("close", resolve);
        child.once("error", reject);
      }),
    ).toBe(1);
    expect(chunks.join("")).toContain("Worker configuration is missing or invalid");
    expect(chunks.join("")).not.toContain(journey.stack.env.SERVICE_ROLE_KEY);
  }
});
