import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { MatchingFixtures } from "../support/matching-fixtures";
import { publicationFields, type JobDraft, type PublishedJob } from "../../src/modules/jobs/model";
import type { CapabilityEvidence } from "../../src/modules/profile/model";
import { rankMatches } from "../../src/modules/matching/rules";
import {
  matchSnapshotSchema,
  matchRunSchema,
  type MatchSnapshot,
  type MatchConstraints,
  type MatchTask,
} from "../../src/modules/matching/model";
let stack: LocalFixtures, admin: LocalMember;
let remote: PublishedJob, onsite: PublishedJob, product: PublishedJob;
const prefix = `rf-match-${crypto.randomUUID()}`;
let fixtures: MatchingFixtures;
const questionIds: string[] = [],
  rubricIds: string[] = [];
const constraints: MatchConstraints = { experienceYears: null, confirmations: [] };
const claim = {
  source: "self-report",
  label: `${prefix} private Python project`,
  context: `${prefix} private evidence context`,
  observedAt: "2026-11-01T00:00:00Z",
  skills: ["python"],
  claimedLevel: 2,
};
const preferences = {
  name: "Taylor",
  track: "Engineering & data",
  workplaces: ["Remote"],
  weeklyHours: 5,
};
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
/** Defaults match this suite's role: Python mandatory, SQL preferred, explicit conditions. */
function createJob(overrides: Partial<JobDraft> = {}): Promise<PublishedJob> {
  return fixtures.publishJob({
    requirements: [
      { text: "Build Python services", priority: "mandatory", skills: ["python"] },
      { text: "Query SQL datasets", priority: "preferred", skills: ["sql"] },
    ],
    conditions: {
      workAuthorization: "The stated local authorization requirement",
      education: "A degree or equivalent practice",
      experienceYears: 2,
    },
    ...overrides,
  });
}
const ownerWithEvidence = () => fixtures.ownerWithEvidence(claim.context);
async function refresh(
  owner: LocalMember,
  jobId: string | null = remote.id,
  conditions: MatchConstraints = constraints,
  key = crypto.randomUUID(),
): Promise<MatchTask> {
  const response = await stack.request(
    "matches",
    owner,
    "POST",
    { jobId, constraints: conditions },
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data;
}
async function find(owner: LocalMember, id: string) {
  const response = await stack.request(`matches/${id}`, owner);
  expect(response.status).toBe(200);
  return matchRunSchema.parse((await response.json()).data);
}
// Short leases let the expiry cases run quickly.
const lease = (taskId: string) => fixtures.lease(taskId, 5);
async function load(task: { taskId: string; token: string }): Promise<MatchSnapshot> {
  const result = await stack.privileged.rpc("matching_load_task", {
    p_task: task.taskId,
    p_token: task.token,
  });
  checked(result.error);
  return matchSnapshotSchema.parse(result.data);
}
async function publish(task: { taskId: string; token: string }, results: unknown) {
  return stack.privileged.rpc("matching_publish_task", {
    p_task: task.taskId,
    p_token: task.token,
    p_results: results,
  });
}
async function expire(taskId: string) {
  await stack.sql.query(
    "update public.tasks set lease_expires_at=clock_timestamp()-interval '1 second',next_run_at=now() where id=$1",
    [taskId],
  );
  await stack.sql.query(
    "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
    [taskId],
  );
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
          WORKER_CONCURRENCY: "2",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (data) => chunks.push(data.toString()));
    child.stderr.on("data", (data) => chunks.push(data.toString()));
    child.on("error", reject);
    child.on("close", resolve);
  });
  expect(code).toBe(0);
  const log = chunks.join("");
  expect(log).not.toContain(stack.env.SERVICE_ROLE_KEY);
  expect(log).not.toContain(claim.context);
  return log;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  fixtures = new MatchingFixtures(stack, admin, prefix);
  remote = await createJob();
  onsite = await createJob({ workplace: "On-site" });
  product = await createJob({
    track: "Product & strategy",
    specialization: "ai-product-consulting",
    requirements: [{ text: "Define product outcomes", priority: "mandatory", skills: ["product"] }],
  });
});
afterEach(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  await stack.sql.query(
    "update public.tasks set status='failed',safe_error='RF_CANCELED',lease_token=null,lease_expires_at=null where user_id=any($1::uuid[]) and status in ('queued','running')",
    [ids],
  );
  const messages = await stack.sql.query(
    "select queue_message_id from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
    [ids],
  );
  for (const message of messages.rows)
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      message.queue_message_id,
    ]);
});
afterAll(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  await stack.sql.query(
    "delete from pgmq.a_rolefoundry_tasks where message->>'taskId' in(select id::text from public.tasks where user_id=any($1::uuid[]))",
    [ids],
  );
  await stack.sql.query("delete from public.match_runs where user_id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.assessment_attempts where user_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.sql.query(
    "delete from public.question_publications where question_version_id=any($1::uuid[])",
    [questionIds],
  );
  await stack.sql.query("delete from public.question_versions where id=any($1::uuid[])", [
    questionIds,
  ]);
  await stack.sql.query("delete from public.rubric_versions where id=any($1::uuid[])", [rubricIds]);
  await stack.sql.query("delete from public.assessment_audit where actor_id=any($1::uuid[])", [
    ids,
  ]);
  await fixtures.cleanup(ids);
  await stack.close();
});
describe("module 06 private, versioned and deletion-safe matching", () => {
  it("creates one snapshot, task and ID-only message under concurrent idempotent refreshes", async () => {
    const { owner } = await ownerWithEvidence();
    const key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => refresh(owner, remote.id, constraints, key)),
    );
    expect(new Set(results.map((value) => value.runId)).size).toBe(1);
    expect(new Set(results.map((value) => value.taskId)).size).toBe(1);
    const stored = await stack.sql.query(
      "select input_snapshot,task_id from public.match_runs where id=$1",
      [results[0].runId],
    );
    expect(stored.rows[0].input_snapshot.profileRevision).toBe(2);
    const message = await stack.sql.query(
      "select message from pgmq.q_rolefoundry_tasks where msg_id=(select queue_message_id from public.tasks where id=$1)",
      [results[0].taskId],
    );
    expect(message.rows[0].message).toEqual({ taskId: results[0].taskId });
    const mismatch = await stack.request(
      "matches",
      owner,
      "POST",
      { jobId: onsite.id, constraints },
      { "Idempotency-Key": key },
    );
    expect(mismatch.status).toBe(409);
  });
  it("isolates private reports and prevents raw reads, privileged execution and forged request facts", async () => {
    const { owner } = await ownerWithEvidence(),
      other = await stack.member(),
      task = await refresh(owner);
    expect((await stack.request(`matches/${task.runId}`, other)).status).toBe(404);
    expect((await stack.request("matches")).status).toBe(401);
    expect((await stack.request("matches", other)).status).toBe(200);
    expect((await (await stack.request("matches", other)).json()).data).toEqual([]);
    for (const table of ["match_runs", "match_results", "match_run_evidence", "gap_items"]) {
      const raw = await owner.client.from(table).select("*");
      expect(raw.data || []).toEqual([]);
    }
    expect(
      (
        await owner.client.rpc("matching_load_task", {
          p_task: task.taskId,
          p_token: crypto.randomUUID(),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await stack.request(
          "matches",
          owner,
          "POST",
          { jobId: remote.id, constraints, userId: other.id },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await stack.request(
          "matches",
          owner,
          "POST",
          {
            jobId: remote.id,
            constraints: {
              experienceYears: 2,
              confirmations: [
                { jobVersionId: crypto.randomUUID(), field: "education", answer: "confirmed" },
              ],
            },
          },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await stack.request(
          "matches",
          owner,
          "POST",
          { jobId: remote.id, constraints },
          { "Idempotency-Key": crypto.randomUUID(), Origin: "https://evil.test.invalid" },
        )
      ).status,
    ).toBe(403);
  });
  it("runs the actual Node worker and publishes cited coverage, unknowns and preferred gaps", async () => {
    const { owner, evidence } = await ownerWithEvidence();
    const task = await refresh(owner, remote.id, {
      experienceYears: 3,
      confirmations: [{ jobVersionId: remote.versionId, field: "education", answer: "confirmed" }],
    });
    expect(await worker()).toContain("task.completed");
    const result = await find(owner, task.runId);
    expect(result.status).toBe("succeeded");
    expect(result.stale).toBe(false);
    expect(result.data[0].coverage).toEqual({
      mandatory: { covered: 1, total: 1 },
      preferred: { covered: 0, total: 1 },
    });
    expect(result.data[0].requirements[0].skills[0].support[0]).toMatchObject({
      evidenceId: evidence.id,
      versionId: evidence.versionId,
      context: claim.context,
      signal: "claim",
    });
    expect(
      result.data[0].conditions.find((value) => value.field === "workAuthorization")?.status,
    ).toBe("unknown");
    expect(result.data[0].conditions.find((value) => value.field === "education")?.status).toBe(
      "confirmed",
    );
    expect(
      result.data[0].gaps.some(
        (value) => value.skillId === "sql" && value.priority === "preferred",
      ),
    ).toBe(true);
    expect(
      (await stack.sql.query("select * from public.gap_items where run_id=$1", [task.runId]))
        .rowCount,
    ).toBeGreaterThan(0);
  });
  it("uses structured observations from an actual assessment without parsing feedback prose", async () => {
    const owner = await stack.member();
    const rubric = await stack.request("admin/assessments/rubrics", admin, "POST", {
      key: `${prefix}-rubric`,
      version: 1,
      description: "Isolated matching producer integration fixture",
    });
    expect(rubric.status).toBe(201);
    const rubricId = (await rubric.json()).data.id;
    rubricIds.push(rubricId);
    for (let index = 0; index < 3; index++) {
      const response = await stack.request("admin/assessments/questions", admin, "POST", {
        key: `${prefix}-q-${index}`,
        version: 1,
        track: "Engineering & data",
        skillId: "python",
        rubricId,
        prompt: `${prefix} producer question ${index}`,
        options: ["Inspect evidence", "Assume an outcome"],
        correctIndex: 0,
        explanation: "Feedback prose deliberately makes no correctness claim.",
      });
      expect(response.status).toBe(201);
      const id = (await response.json()).data.id;
      questionIds.push(id);
      expect(
        (
          await stack.request(`admin/assessments/questions/${id}/review`, admin, "POST", {
            reason: "Isolated producer integration review",
          })
        ).status,
      ).toBe(200);
    }
    const started = await stack.request("assessments", owner, "POST", {
      track: "Engineering & data",
    });
    expect(started.status).toBe(201);
    const attempt = (await started.json()).data as {
      id: string;
      revision: number;
      items: { id: string; questionVersionId: string; skillId: string; options: string[] }[];
    };
    const keys = await stack.sql.query(
      "select id,correct_index from public.question_versions where id=any($1::uuid[])",
      [attempt.items.map((item) => item.questionVersionId)],
    );
    const answers = Object.fromEntries(
      attempt.items.map((item, index) => {
        const correct = keys.rows.find((row) => row.id === item.questionVersionId).correct_index;
        return [item.id, index === 0 ? (correct + 1) % item.options.length : correct];
      }),
    );
    expect(
      (
        await stack.request(
          `assessments/${attempt.id}/submit`,
          owner,
          "POST",
          { expectedRevision: attempt.revision, answers },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(202);
    await worker();
    const target = await createJob({
      requirements: [
        {
          text: "Skills from the reviewed scenario track",
          priority: "mandatory",
          skills: [...new Set(attempt.items.map((item) => item.skillId))],
        },
      ],
    });
    const task = await refresh(owner, target.id);
    await worker();
    const report = await find(owner, task.runId);
    const refs = report.data[0].requirements[0].skills.flatMap((skill) => [
      ...skill.support,
      ...skill.practice,
    ]);
    expect(refs).toHaveLength(3);
    expect(refs.filter((ref) => ref.signal === "support")).toHaveLength(2);
    expect(refs.filter((ref) => ref.signal === "practice")).toHaveLength(1);
    expect(refs.every((ref) => ref.source === "scenario" && ref.rubricVersion)).toBe(true);
    expect(report.data[0].action).toBe("strengthen-evidence");
  });
  it("supports empty/unrelated evidence, direction filtering and explicit cross-direction targets", async () => {
    const owner = await stack.member();
    const direction = await refresh(owner, null);
    await worker();
    const result = await find(owner, direction.runId);
    expect(result.data.some((value) => value.jobId === product.id)).toBe(false);
    expect(result.data.every((value) => value.coverage.mandatory.covered === 0)).toBe(true);
    const target = await refresh(owner, product.id);
    await worker();
    expect((await find(owner, target.runId)).data.map((value) => value.jobId)).toEqual([
      product.id,
    ]);
  });
  it("rejects invented evidence and modified requirement text at publication", async () => {
    const { owner } = await ownerWithEvidence();
    const task = await refresh(owner);
    const claimed = await lease(task.taskId);
    const input = await load(claimed);
    const output = rankMatches(input);
    const changed = structuredClone(output);
    changed[0].requirements[0].text = "An invented requirement";
    expect((await publish(claimed, changed)).error?.message).toBe("RF_INVALID_INPUT");
    const invented = structuredClone(output);
    invented[0].requirements[0].skills[0].support[0].versionId = crypto.randomUUID();
    expect((await publish(claimed, invented)).error?.message).toBe("RF_INVALID_INPUT");
    checked((await publish(claimed, output)).error);
  });
  it("refuses stale profile publication and labels an old successful report historical", async () => {
    const { owner, evidence } = await ownerWithEvidence();
    const first = await refresh(owner);
    await worker();
    const queued = await refresh(owner);
    const claimed = await lease(queued.taskId);
    const input = await load(claimed);
    const edit = await stack.request(`evidence/${evidence.id}`, owner, "PATCH", {
      expectedRevision: 2,
      expectedVersion: 1,
      evidence: { ...claim, context: "Updated context" },
    });
    expect(edit.status).toBe(200);
    expect((await publish(claimed, rankMatches(input))).error?.message).toBe("RF_STALE_INPUT");
    const old = await find(owner, first.runId);
    expect(old.stale).toBe(true);
    expect(old.data[0].requirements[0].skills[0].support[0].context).toBe(claim.context);
  });
  it("immediately purges copied input/results/gaps after evidence deletion and blocks late publication", async () => {
    const { owner, evidence } = await ownerWithEvidence();
    const first = await refresh(owner);
    await worker();
    const queued = await refresh(owner);
    const claimed = await lease(queued.taskId);
    const input = await load(claimed);
    const removed = await stack.request(`evidence/${evidence.id}`, owner, "DELETE", {
      expectedRevision: 2,
      expectedVersion: 1,
    });
    expect(removed.status).toBe(200);
    for (const task of [first, queued]) {
      const report = await find(owner, task.runId);
      expect(report.status).toBe("invalidated");
      expect(report.data).toEqual([]);
      expect(report.constraints).toBeNull();
    }
    const rows = await stack.sql.query(
      "select input_snapshot from public.match_runs where id=any($1::uuid[])",
      [[first.runId, queued.runId]],
    );
    expect(rows.rows.every((row) => row.input_snapshot === null)).toBe(true);
    expect(
      (
        await stack.sql.query("select 1 from public.match_results where run_id=any($1::uuid[])", [
          [first.runId, queued.runId],
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await stack.sql.query("select 1 from public.gap_items where run_id=any($1::uuid[])", [
          [first.runId, queued.runId],
        ])
      ).rowCount,
    ).toBe(0);
    expect((await publish(claimed, rankMatches(input))).error?.message).toBe("RF_STALE_INPUT");
  });
  it("guards catalog and dictionary versions before publishing", async () => {
    const { owner } = await ownerWithEvidence();
    const first = await refresh(owner);
    const lease1 = await lease(first.taskId),
      input1 = await load(lease1);
    const changed = await createJob({ title: `${prefix} catalog revision check` });
    expect((await publish(lease1, rankMatches(input1))).error?.message).toBe("RF_STALE_INPUT");
    const second = await refresh(owner, changed.id);
    const lease2 = await lease(second.taskId),
      input2 = await load(lease2);
    const dictionary = (await (await stack.request("skills")).json()).data;
    const response = await stack.request("admin/skills/aliases", admin, "POST", {
      expectedVersion: dictionary.version,
      reason: "Matching stale-input fixture",
      skillId: "python",
      locale: "en",
      alias: `${prefix}-alias`,
    });
    expect(response.status).toBe(201);
    expect((await publish(lease2, rankMatches(input2))).error?.message).toBe("RF_STALE_INPUT");
    const version = (await response.json()).data.version;
    expect(
      (
        await stack.request("admin/skills/aliases", admin, "DELETE", {
          expectedVersion: version,
          reason: "Remove matching fixture alias",
          locale: "en",
          alias: `${prefix}-alias`,
        })
      ).status,
    ).toBe(200);
  });
  it("keeps retired roles historical and rejects explicit closure or time expiry before publication", async () => {
    const owner = await stack.member();
    const closing = await createJob();
    const first = await refresh(owner, closing.id);
    await worker();
    expect(
      (
        await stack.request(
          `admin/catalog/observations/${closing.sources[0].id}/record`,
          admin,
          "POST",
          { event: "network_failure" },
        )
      ).status,
    ).toBe(200);
    const uncertain = await find(owner, first.runId);
    expect(uncertain.data[0].available).toBe(true);
    expect(uncertain.data[0].freshness).toBe("uncertain");
    const next = await refresh(owner, closing.id);
    const claimed = await lease(next.taskId),
      input = await load(claimed);
    const source = await stack.sql.query("select id from public.job_sources where job_id=$1", [
      closing.id,
    ]);
    expect(
      (
        await stack.request(
          `admin/catalog/observations/${source.rows[0].id}/record`,
          admin,
          "POST",
          { event: "confirmed_closed" },
        )
      ).status,
    ).toBe(200);
    expect((await publish(claimed, rankMatches(input))).error?.message).toBe("RF_STALE_INPUT");
    const old = await find(owner, first.runId);
    expect(old.stale).toBe(true);
    expect(old.data[0].available).toBe(false);
    expect(
      (
        await stack.request(
          "matches",
          owner,
          "POST",
          { jobId: closing.id, constraints },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(404);
    const expiring = await createJob();
    const task = await refresh(owner, expiring.id);
    const active = await lease(task.taskId),
      snapshot = await load(active);
    await stack.sql.query(
      "update public.jobs set expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [expiring.id],
    );
    expect((await publish(active, rankMatches(snapshot))).error?.message).toBe("RF_STALE_INPUT");
  });
  it("recovers expired leases and redelivery after commit without duplicate results", async () => {
    const owner = await stack.member(),
      task = await refresh(owner);
    const first = await lease(task.taskId),
      input = await load(first);
    await expire(task.taskId);
    const second = await lease(task.taskId);
    expect((await publish(first, rankMatches(input))).error?.message).toBe("RF_CONFLICT");
    checked((await publish(second, rankMatches(input))).error);
    await stack.sql.query(
      "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
      [task.taskId],
    );
    await worker();
    expect(
      (await stack.sql.query("select 1 from public.match_results where run_id=$1", [task.runId]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await stack.sql.query(
          "select 1 from pgmq.q_rolefoundry_tasks where msg_id=(select queue_message_id from public.tasks where id=$1)",
          [task.taskId],
        )
      ).rowCount,
    ).toBe(0);
  });
  it("prevents publication for deactivated or deleted owners", async () => {
    const owner = await stack.member(),
      task = await refresh(owner);
    const claimed = await lease(task.taskId),
      input = await load(claimed);
    checked(
      (await stack.privileged.rpc("identity_deactivate_profile", { p_user: owner.id })).error,
    );
    expect((await publish(claimed, rankMatches(input))).error?.message).toBe("RF_FORBIDDEN");
    const deleted = await stack.member(),
      second = await refresh(deleted);
    const active = await lease(second.taskId),
      snapshot = await load(active);
    checked((await stack.privileged.auth.admin.deleteUser(deleted.id)).error);
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      active.messageId,
    ]);
    stack.users.splice(
      stack.users.findIndex((user) => user.id === deleted.id),
      1,
    );
    await stack.sql.query(
      "delete from public.invitations where email_hash=public.identity_email_hash($1)",
      [deleted.email],
    );
    await stack.sql.query("delete from public.identity_audit where actor_id=$1 or subject_id=$1", [
      deleted.id,
    ]);
    expect((await publish(active, rankMatches(snapshot))).error?.message).toBe("RF_NOT_FOUND");
  });
  it("rolls back all report and gap rows if the lease expires during publication", async () => {
    const owner = await stack.member(),
      task = await refresh(owner);
    const claimed = await lease(task.taskId),
      input = await load(claimed);
    const fn = `test_match_delay_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await stack.sql.query(
        `create function public.${fn}() returns trigger language plpgsql as $$ begin if new.run_id='${task.runId}'::uuid then perform pg_sleep(0.3);end if;return new;end $$`,
      );
      await stack.sql.query(
        `create trigger ${fn} before insert on public.match_results for each row execute function public.${fn}()`,
      );
      await stack.sql.query(
        "update public.tasks set lease_expires_at=clock_timestamp()+interval '0.2 seconds' where id=$1",
        [task.taskId],
      );
      expect((await publish(claimed, rankMatches(input))).error?.message).toBe("RF_CONFLICT");
      expect(
        (await stack.sql.query("select 1 from public.match_results where run_id=$1", [task.runId]))
          .rowCount,
      ).toBe(0);
      expect(
        (await stack.sql.query("select 1 from public.gap_items where run_id=$1", [task.runId]))
          .rowCount,
      ).toBe(0);
    } finally {
      await stack.sql.query(`drop trigger if exists ${fn} on public.match_results`);
      await stack.sql.query(`drop function if exists public.${fn}()`);
    }
    await expire(task.taskId);
    checked((await publish(await lease(task.taskId), rankMatches(input))).error);
  });
  it("paginates immutable results and owner history without duplicating entries", async () => {
    for (let index = 0; index < 21; index++)
      await createJob({ title: `${prefix} pagination ${index}` });
    const owner = await stack.member(),
      task = await refresh(owner, null);
    await worker();
    const first = await find(owner, task.runId);
    expect(first.data).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const next = await stack.request(
      `matches/${task.runId}?cursor=${encodeURIComponent(first.nextCursor!)}`,
      owner,
    );
    expect(next.status).toBe(200);
    const second = (await next.json()).data;
    expect(new Set([...first.data, ...second.data].map((value) => value.jobId)).size).toBe(
      first.candidateCount,
    );
    for (let index = 0; index < 21; index++) {
      await refresh(owner, remote.id);
      await stack.sql.query(
        "update public.tasks set status='failed',safe_error='RF_CANCELED' where user_id=$1 and status='queued'",
        [owner.id],
      );
    }
    const page = await (await stack.request("matches", owner)).json();
    expect(page.data).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    const after = await stack.request(
      `matches?cursor=${encodeURIComponent(page.nextCursor)}`,
      owner,
    );
    expect((await after.json()).data.length).toBeGreaterThan(0);
  });
  it("uses actual browser conditions, worker polling and report reload at a mobile viewport", async () => {
    const { owner } = await ownerWithEvidence();
    const browser = await chromium.launch();
    try {
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
      await page.goto(`${stack.origin}/matches/?job=${remote.id}`);
      await webExpect(page.getByLabel("Matching target role")).toHaveValue(remote.id);
      await page.getByLabel("Relevant experience years").fill("3");
      await page.getByLabel("education confirmation", { exact: true }).selectOption("confirmed");
      await page
        .getByRole("button", { name: "Create a fresh matching report", exact: true })
        .click();
      await webExpect(
        page.getByRole("heading", { name: "Matching is queued or running", exact: true }),
      ).toBeVisible();
      await worker();
      await webExpect(
        page.getByRole("heading", { name: "Your matching report", exact: true }),
      ).toBeVisible();
      await webExpect(
        page.getByText("Mandatory skills with linked support:", { exact: false }),
      ).toBeVisible();
      await page.getByText(claim.label, { exact: false }).first().click();
      await webExpect(page.getByText(claim.context, { exact: true })).toBeVisible();
      await page.reload();
      await webExpect(
        page.getByRole("heading", { name: "Your matching report", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      await page.screenshot({
        path: ".local/matching-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.screenshot({
        path: ".local/matching-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
      const evidencePage = (await (await stack.request("evidence", owner)).json()).data;
      const existing = evidencePage.find((item: { label: string }) => item.label === claim.label);
      expect(existing).toBeDefined();
      expect(
        (
          await stack.request(`evidence/${existing.id}`, owner, "PATCH", {
            expectedRevision: 2,
            expectedVersion: 1,
            evidence: { ...claim, context: "Browser changed evidence" },
          })
        ).status,
      ).toBe(200);
      await page.getByRole("button", { name: "Check report status", exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText("historical");
      expect(
        (
          await stack.request(`evidence/${existing.id}`, owner, "DELETE", {
            expectedRevision: 3,
            expectedVersion: 2,
          })
        ).status,
      ).toBe(200);
      await page.getByRole("button", { name: "Check report status", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "Report content removed", exact: true }),
      ).toBeVisible();
      await webExpect(page.getByText(claim.context, { exact: true })).toHaveCount(0);
    } finally {
      await browser.close();
    }
  });
});
