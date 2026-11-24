import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { CareerJourney } from "../support/career-journey";
import type { LocalMember } from "../support/local-fixtures";
import { resumeDocumentSchema, type ResumeDocument } from "../../src/modules/resume/model";
import { InvalidationDispatcher } from "../../src/modules/invalidation/dispatcher";
import { SupabaseInvalidationStore } from "../../src/modules/invalidation/adapters/supabase";
import {
  invalidationLeaseSchema,
  type InvalidationLease,
} from "../../src/modules/invalidation/model";
import { MatchingHandler } from "../../src/modules/matching/handler";
import { SupabaseMatchingExecutionStore } from "../../src/modules/matching/adapters/supabase";
vi.mock("server-only", () => ({}));
let journey: CareerJourney, admin: LocalMember, jobId: string;
const documents = new Map<string, ResumeDocument>();
const alias = `dispatch-${crypto.randomUUID()}`;
beforeAll(async () => {
  journey = await CareerJourney.open();
  admin = await journey.stack.member(true);
  jobId = await journey.publishJob(admin);
});
afterAll(async () => {
  if (!journey) return;
  const dictionary = await journey.data("skills");
  if (dictionary.aliases.some((item: { alias: string }) => item.alias === alias))
    await journey.data("admin/skills/aliases", admin, "DELETE", {
      expectedVersion: dictionary.version,
      reason: "Remove only the owned acceptance alias",
      locale: "en",
      alias,
    });
  await journey.close();
});
async function owner(withResume = false) {
  const user = await journey.stack.member();
  await journey.data("profile", user, "PATCH", {
    expectedRevision: 0,
    name: "Dispatch fixture",
    track: "Engineering & data",
    workplaces: [],
    weeklyHours: 1,
  });
  if (withResume) {
    const created = await journey.data(
      "resumes/paste",
      user,
      "POST",
      { text: "Completed a Python project with measured evaluation." },
      202,
    );
    await journey.execute(created.taskId);
    const parsed = resumeDocumentSchema.parse(
      await journey.data(`resumes/${created.documentId}`, user),
    );
    const factId = crypto.randomUUID();
    documents.set(
      user.id,
      resumeDocumentSchema.parse(
        await journey.data(`resumes/${parsed.id}/confirm`, user, "POST", {
          expectedRevision: parsed.revision,
          content: {
            facts: [
              {
                id: factId,
                text: parsed.draft!.text,
                kind: "project",
                state: "completed",
                skillIds: ["python"],
                sourceBlockId: parsed.draft!.blocks[0].id,
              },
            ],
            sections: [{ id: crypto.randomUUID(), heading: "Projects", factIds: [factId] }],
          },
        }),
      ),
    );
  }
  return user;
}
async function match(user: LocalMember) {
  const task = await journey.data(
    "matches",
    user,
    "POST",
    { jobId, constraints: { experienceYears: null, confirmations: [] } },
    202,
  );
  journey.tasks.add(task.taskId);
  return task;
}
async function pending(user: LocalMember) {
  const document = documents.get(user.id)!;
  const tasks = [
    await match(user),
    await journey.data(
      "learning-plans",
      user,
      "POST",
      { jobId, weeklyHours: 1, durationOverrides: [] },
      202,
    ),
    await journey.data(
      `resumes/${document.id}/revisions`,
      user,
      "POST",
      { versionId: document.currentVersion!.id, jobId, expectedRevision: document.revision },
      202,
    ),
  ];
  for (const task of tasks) journey.tasks.add(task.taskId);
  return tasks.map((task) => task.taskId as string);
}
async function changed(user: LocalMember) {
  const before = await journey.data("profile", user);
  const after = await journey.data("profile", user, "PATCH", {
    expectedRevision: before.revision,
    name: "Changed preference",
    track: before.track,
    workplaces: before.workplaces,
    weeklyHours: before.weeklyHours,
  });
  return (
    await journey.stack.sql.query(
      "select d.id,d.consumer from public.invalidation_deliveries d join public.profile_change_outbox e on e.id=d.profile_event_id where e.user_id=$1 and e.revision=$2 order by d.consumer",
      [user.id, after.revision],
    )
  ).rows as { id: string; consumer: string }[];
}
async function claim(ids: string[]) {
  const response = await journey.stack.privileged.rpc("invalidation_claim", { p_ids: ids });
  expect(response.error).toBeNull();
  return invalidationLeaseSchema.array().max(4).parse(response.data);
}
async function apply(lease: InvalidationLease) {
  return journey.stack.privileged.rpc("invalidation_apply", {
    p_id: lease.id,
    p_token: lease.token,
  });
}
async function tasks(ids: string[]) {
  return (
    await journey.stack.sql.query(
      "select id,status,safe_error,attempt_count from public.tasks where id=any($1::uuid[]) order by id",
      [ids],
    )
  ).rows;
}

it("denies raw rows and execution helpers to browsers and validates the service claim scope", async () => {
  const user = await owner();
  const anonymous = createClient(journey.stack.env.API_URL, journey.stack.env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const client of [anonymous, user.client, admin.client]) {
    expect((await client.from("invalidation_deliveries").select("*")).error).toBeTruthy();
    for (const [name, args] of [
      ["invalidation_claim", {}],
      ["invalidation_apply", { p_id: crypto.randomUUID(), p_token: crypto.randomUUID() }],
      ["invalidation_retry", { p_id: crypto.randomUUID(), p_token: crypto.randomUUID() }],
    ] as const)
      expect((await client.rpc(name, args)).error).toBeTruthy();
  }
  expect(
    (await journey.stack.privileged.from("invalidation_deliveries").select("*")).error,
  ).toBeTruthy();
  expect(
    (
      await journey.stack.privileged.rpc("matching_consume_invalidation", {
        p_user: user.id,
        p_revision: 2,
        p_dictionary: null,
      })
    ).error,
  ).toBeTruthy();
  for (const ids of [[], [null], Array.from({ length: 5 }, () => crypto.randomUUID())])
    expect(
      (await journey.stack.privileged.rpc("invalidation_claim", { p_ids: ids })).error,
    ).toBeTruthy();
});

it("creates three receipts atomically and retains late-committing lower event IDs without a watermark", async () => {
  const first = await owner(),
    second = await owner();
  const connection = await journey.stack.sql.connect();
  let rolledBack: string;
  try {
    await connection.query("begin");
    rolledBack = (
      await connection.query(
        "insert into public.profile_change_outbox(user_id,revision,kind) values($1,99,'profile.changed') returning id::text",
        [first.id],
      )
    ).rows[0].id;
    expect(
      (
        await connection.query(
          "select 1 from public.invalidation_deliveries where profile_event_id=$1",
          [rolledBack],
        )
      ).rowCount,
    ).toBe(3);
    await connection.query("rollback");
    expect(
      (
        await journey.stack.sql.query(
          "select 1 from public.invalidation_deliveries where profile_event_id=$1",
          [rolledBack],
        )
      ).rowCount,
    ).toBe(0);
    await connection.query("begin");
    const lower = (
      await connection.query(
        "insert into public.profile_change_outbox(user_id,revision,kind) values($1,99,'profile.changed') returning id::text",
        [first.id],
      )
    ).rows[0].id;
    const newer = await changed(second);
    await connection.query("commit");
    const late = (
      await journey.stack.sql.query(
        "select id from public.invalidation_deliveries where profile_event_id=$1",
        [lower],
      )
    ).rows;
    expect(late).toHaveLength(3);
    expect(newer).toHaveLength(3);
    expect(await claim(late.map((row) => row.id))).toHaveLength(3);
  } finally {
    await connection.query("rollback");
    connection.release();
  }
});

it("dispatches all three domain consumers, cancels only obsolete queued input and retains completed history", async () => {
  const user = await owner(true),
    completed = await match(user);
  await journey.execute(completed.taskId);
  const old = await pending(user),
    deliveries = await changed(user),
    current = await match(user);
  const adapter = new SupabaseInvalidationStore(journey.stack.privileged);
  const dispatcher = new InvalidationDispatcher({
    claim: async () => claim(deliveries.map((delivery) => delivery.id)),
    apply: adapter.apply.bind(adapter),
    retry: adapter.retry.bind(adapter),
  });
  expect(await dispatcher.tick(AbortSignal.timeout(10000))).toEqual({ completed: 3, canceled: 3 });
  for (const task of await tasks(old))
    expect(task).toMatchObject({
      status: "failed",
      safe_error: "RF_STALE_INPUT",
      attempt_count: 0,
    });
  expect((await tasks([current.taskId]))[0].status).toBe("queued");
  expect((await tasks([completed.taskId]))[0].status).toBe("succeeded");
  const history = await journey.data(`matches/${completed.runId}`, user);
  expect(history.stale).toBe(true);
  expect(history.data).toHaveLength(1);
  expect(
    (
      await journey.stack.sql.query(
        "select 1 from public.task_events where task_id=any($1::uuid[]) and event='task.failed' and safe_code='RF_STALE_INPUT'",
        [old],
      )
    ).rowCount,
  ).toBe(3);
  expect(await claim(deliveries.map((delivery) => delivery.id))).toEqual([]);
});

it("serializes competing claims and rejects null, wrong, expired and superseded lease tokens", async () => {
  const user = await owner(),
    delivery = (await changed(user))[0];
  const attempts = await Promise.all([claim([delivery.id]), claim([delivery.id])]);
  expect(attempts.map((rows) => rows.length).sort()).toEqual([0, 1]);
  const first = attempts.flat()[0];
  for (const token of [null, crypto.randomUUID()])
    expect(
      (
        await journey.stack.privileged.rpc("invalidation_apply", {
          p_id: delivery.id,
          p_token: token,
        })
      ).error?.message,
    ).toBe("RF_CONFLICT");
  await journey.stack.sql.query(
    "update public.invalidation_deliveries set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [delivery.id],
  );
  expect((await apply(first)).error?.message).toBe("RF_CONFLICT");
  const second = (await claim([delivery.id]))[0];
  expect(second.token).not.toBe(first.token);
  expect((await apply(first)).error?.message).toBe("RF_CONFLICT");
  expect((await apply(second)).error).toBeNull();
  expect((await apply(second)).error?.message).toBe("RF_CONFLICT");
});

it("persists a bounded private retry and redelivers without resetting its attempt history", async () => {
  const user = await owner(),
    delivery = (await changed(user))[0],
    first = (await claim([delivery.id]))[0];
  expect(
    (
      await journey.stack.privileged.rpc("invalidation_retry", {
        p_id: first.id,
        p_token: first.token,
      })
    ).error,
  ).toBeNull();
  const row = (
    await journey.stack.sql.query(
      "select attempts::text,safe_error,lease_token,completed_at,extract(epoch from available_at-clock_timestamp()) delay from public.invalidation_deliveries where id=$1",
      [delivery.id],
    )
  ).rows[0];
  expect(row).toMatchObject({
    attempts: "1",
    safe_error: "RF_UNAVAILABLE",
    lease_token: null,
    completed_at: null,
  });
  expect(Number(row.delay)).toBeGreaterThan(0);
  expect(Number(row.delay)).toBeLessThanOrEqual(300);
  expect(await claim([delivery.id])).toEqual([]);
  await journey.stack.sql.query(
    "update public.invalidation_deliveries set available_at=clock_timestamp() where id=$1",
    [delivery.id],
  );
  const second = (await claim([delivery.id]))[0];
  expect((await apply(second)).error).toBeNull();
  expect(
    (
      await journey.stack.sql.query(
        "select attempts::text,safe_error from public.invalidation_deliveries where id=$1",
        [delivery.id],
      )
    ).rows[0],
  ).toEqual({ attempts: "2", safe_error: null });
});

it("keeps a delivery pending when an obsolete queued task is locked and finishes it on a later claim", async () => {
  const user = await owner(),
    old = await match(user),
    delivery = (await changed(user)).find((row) => row.consumer === "matching")!;
  const connection = await journey.stack.sql.connect();
  try {
    await connection.query("begin");
    await connection.query("select id from public.tasks where id=$1 for update", [old.taskId]);
    const first = (await claim([delivery.id]))[0];
    const result = await apply(first);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ completed: false, canceled: 0 });
    expect((await tasks([old.taskId]))[0].status).toBe("queued");
    await connection.query("rollback");
    await journey.stack.sql.query(
      "update public.invalidation_deliveries set available_at=clock_timestamp() where id=$1",
      [delivery.id],
    );
    expect((await apply((await claim([delivery.id]))[0])).data).toEqual({
      completed: true,
      canceled: 1,
    });
  } finally {
    await connection.query("rollback");
    connection.release();
  }
});

it("preserves a running lease while its existing publication guard rejects the stale input", async () => {
  const user = await owner(),
    old = await match(user),
    lease = await journey.execution.claim(old.taskId);
  const delivery = (await changed(user)).find((row) => row.consumer === "matching")!;
  expect((await apply((await claim([delivery.id]))[0])).data).toEqual({
    completed: true,
    canceled: 0,
  });
  expect((await tasks([old.taskId]))[0].status).toBe("running");
  await expect(
    new MatchingHandler(new SupabaseMatchingExecutionStore(journey.stack.privileged)).execute(
      lease,
      AbortSignal.timeout(5000),
    ),
  ).rejects.toThrow();
  expect(
    (
      await journey.stack.sql.query("select 1 from public.match_results where run_id=$1", [
        old.runId,
      ])
    ).rowCount,
  ).toBe(0);
});

it("rolls back domain cancellation and task events if the delivery lease expires inside its transaction", async () => {
  const user = await owner(),
    old = await match(user),
    delivery = (await changed(user)).find((row) => row.consumer === "matching")!;
  const lease = (await claim([delivery.id]))[0],
    name = `inv_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await journey.stack.sql.query(
      `create function public.${name}() returns trigger language plpgsql as $$ begin if new.id='${old.taskId}'::uuid and new.status='failed' then perform pg_sleep(2);end if;return new;end $$;create trigger ${name} after update on public.tasks for each row execute function public.${name}()`,
    );
    await journey.stack.sql.query(
      "update public.invalidation_deliveries set lease_expires_at=clock_timestamp()+interval '1 second' where id=$1",
      [delivery.id],
    );
    const start = Date.now();
    expect((await apply(lease)).error?.message).toBe("RF_CONFLICT");
    expect(Date.now() - start).toBeGreaterThanOrEqual(1500);
    expect((await tasks([old.taskId]))[0].status).toBe("queued");
    expect(
      (
        await journey.stack.sql.query(
          "select 1 from public.task_events where task_id=$1 and event='task.failed'",
          [old.taskId],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await journey.stack.sql.query(
      `drop trigger if exists ${name} on public.tasks;drop function if exists public.${name}()`,
    );
  }
});

it("routes a real dictionary event through all three consumers without committing changes to unrelated developer work", async () => {
  const user = await owner(true),
    old = await pending(user),
    dictionary = await journey.data("skills");
  const published = await journey.data(
    "admin/skills/aliases",
    admin,
    "POST",
    {
      expectedVersion: dictionary.version,
      reason: "Owned synthetic invalidation acceptance alias",
      skillId: "python",
      locale: "en",
      alias,
    },
    201,
  );
  const deliveries = (
    await journey.stack.sql.query(
      "select id from public.invalidation_deliveries where dictionary_version=$1",
      [published.version],
    )
  ).rows;
  expect(deliveries).toHaveLength(3);
  const current = await match(user),
    connection = await journey.stack.sql.connect();
  try {
    await connection.query("begin");
    const leases = (
      await connection.query("select public.invalidation_claim($1::uuid[]) value", [
        deliveries.map((row) => row.id),
      ])
    ).rows[0].value as InvalidationLease[];
    expect(leases).toHaveLength(3);
    for (const lease of leases)
      await connection.query("select public.invalidation_apply($1,$2)", [lease.id, lease.token]);
    expect(
      (
        await connection.query(
          "select 1 from public.tasks where id=any($1::uuid[]) and status='failed'",
          [old],
        )
      ).rowCount,
    ).toBe(3);
    expect(
      (await connection.query("select status from public.tasks where id=$1", [current.taskId]))
        .rows[0].status,
    ).toBe("queued");
    await connection.query("rollback");
    expect((await tasks(old)).every((row) => row.status === "queued")).toBe(true);
  } finally {
    await connection.query("rollback");
    connection.release();
  }
});

it("cascades private delivery references on owner removal and rejects a previously claimed receipt", async () => {
  const user = await owner(),
    delivery = (await changed(user))[0],
    lease = (await claim([delivery.id]))[0];
  await journey.stack.sql.query("delete from public.profiles where user_id=$1", [user.id]);
  expect(
    (
      await journey.stack.sql.query("select 1 from public.invalidation_deliveries where id=$1", [
        delivery.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect((await apply(lease)).error?.message).toBe("RF_CONFLICT");
});
