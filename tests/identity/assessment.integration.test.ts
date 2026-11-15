import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { tracks, type Track } from "../../src/modules/skills/catalog";
import type { AssessmentAttempt } from "../../src/modules/assessment/model";
let stack: LocalFixtures, admin: LocalMember;
const prefix = `rf-assess-${crypto.randomUUID().slice(0, 8)}`;
let rubricId: string;
const questionIds: string[] = [];
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
async function question(
  track: Track,
  index: number,
  version = 1,
  key = `${prefix}-${track}-${index}`,
) {
  const response = await stack.request("admin/assessments/questions", admin, "POST", {
    key,
    version,
    track,
    skillId: "python",
    rubricId,
    prompt: `${prefix} ${track} scenario ${index} v${version}`,
    options: ["A measured source check", "An unsupported shortcut", "A documented clarification"],
    correctIndex: index % 3,
    explanation: `Private feedback ${crypto.randomUUID()}`,
  });
  expect(response.status).toBe(201);
  const id = (await response.json()).data.id;
  questionIds.push(id);
  expect(
    (
      await stack.request(`admin/assessments/questions/${id}/review`, admin, "POST", {
        reason: "Isolated fixture review, not professional calibration",
      })
    ).status,
  ).toBe(200);
  return id;
}
async function start(owner: LocalMember, track: Track = tracks[0]): Promise<AssessmentAttempt> {
  const response = await stack.request("assessments", owner, "POST", { track });
  expect(response.status).toBe(201);
  return (await response.json()).data;
}
async function answers(attempt: AssessmentAttempt) {
  const result = await stack.sql.query(
    "select id,correct_index from public.question_versions where id=any($1::uuid[])",
    [attempt.items.map((item) => item.questionVersionId)],
  );
  return Object.fromEntries(
    attempt.items.map((item) => [
      item.id,
      result.rows.find((row) => row.id === item.questionVersionId).correct_index as number,
    ]),
  );
}
async function submit(
  owner: LocalMember,
  attempt: AssessmentAttempt,
  key = crypto.randomUUID(),
  input?: Record<string, number>,
) {
  const response = await stack.request(
    `assessments/${attempt.id}/submit`,
    owner,
    "POST",
    { expectedRevision: attempt.revision, answers: input || (await answers(attempt)) },
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data as { taskId: string; status: string };
}
async function read() {
  const result = await stack.privileged.rpc("task_read", {
    p_worker: crypto.randomUUID(),
    p_kinds: ["assessment.grade"],
    p_seconds: 5,
    p_quantity: 8,
  });
  checked(result.error);
  return result.data as { taskId: string; token: string; messageId: string }[];
}
async function lease(taskId: string) {
  for (let i = 0; i < 10; i++) {
    const leases = await read();
    const selected = leases.find((value) => value.taskId === taskId);
    for (const other of leases.filter((value) => value.taskId !== taskId))
      checked(
        (await stack.privileged.rpc("task_release", { p_task: other.taskId, p_token: other.token }))
          .error,
      );
    if (selected) return selected;
  }
  throw Error("The owned task was not visible in the local queue.");
}
async function grade(claim: { taskId: string; token: string }) {
  return stack.privileged.rpc("assessment_grade_task", {
    p_task: claim.taskId,
    p_token: claim.token,
  });
}
async function expire(taskId: string) {
  await stack.sql.query(
    "update public.tasks set lease_expires_at=now()-interval '1 second',next_run_at=now() where id=$1",
    [taskId],
  );
  await stack.sql.query(
    "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
    [taskId],
  );
}
async function worker(args = ["--drain"]) {
  const chunks: string[] = [];
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts", ...args],
      {
        env: {
          ...process.env,
          SUPABASE_URL: stack.env.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
          WORKER_CONCURRENCY: "2",
          WORKER_LEASE_SECONDS: "5",
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
  expect(log.includes(stack.env.SERVICE_ROLE_KEY)).toBe(false);
  return log;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  const response = await stack.request("admin/assessments/rubrics", admin, "POST", {
    key: prefix,
    version: 1,
    description: "Fixed-answer learning-preview fixture rubric",
  });
  expect(response.status).toBe(201);
  rubricId = (await response.json()).data.id;
  for (const track of tracks) for (let index = 0; index < 4; index++) await question(track, index);
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
  for (const row of messages.rows)
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      row.queue_message_id,
    ]);
});
afterAll(async () => {
  if (!stack) return;
  const ids = stack.users.map((user) => user.id);
  const tasks = await stack.sql.query("select id from public.tasks where user_id=any($1::uuid[])", [
    ids,
  ]);
  const taskIds = tasks.rows.map((row) => row.id);
  await stack.sql.query(
    "delete from pgmq.a_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
    [taskIds],
  );
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
  await stack.sql.query("delete from public.rubric_versions where id=$1", [rubricId]);
  await stack.sql.query("delete from public.assessment_audit where actor_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.close();
});
describe("module 05 through real private attempts and durable workers", () => {
  it("selects reviewed questions for every track, hides answers and avoids recently repeated questions", async () => {
    const owner = await stack.member();
    for (const track of tracks) {
      const attempt = await start(owner, track);
      expect(attempt.items).toHaveLength(3);
      expect(attempt.result).toBeNull();
      expect(JSON.stringify(attempt)).not.toContain("correctIndex");
      expect(JSON.stringify(attempt)).not.toContain("explanation");
      expect(attempt.track).toBe(track);
    }
    const first = await start(owner);
    const next = await start(owner);
    expect(
      next.items.some(
        (item) => !first.items.some((old) => old.questionVersionId === item.questionVersionId),
      ),
    ).toBe(true);
  });
  it("round-trips partial drafts, serializes edits and rejects invalid/extra answer IDs", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const partial = { [attempt.items[0].id]: 0 };
    const saved = await stack.request(`assessments/${attempt.id}/answers`, owner, "PATCH", {
      expectedRevision: 1,
      answers: partial,
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ revision: 2, answers: partial });
    const edits = await Promise.all(
      [0, 1].map((value) =>
        stack.request(`assessments/${attempt.id}/answers`, owner, "PATCH", {
          expectedRevision: 2,
          answers: { [attempt.items[0].id]: value },
        }),
      ),
    );
    expect(edits.map((response) => response.status).sort()).toEqual([200, 409]);
    for (const invalid of [
      { [crypto.randomUUID()]: 0 },
      { [attempt.items[0].id]: 99 },
      { [attempt.items[0].id]: -1 },
    ])
      expect(
        (
          await stack.request(`assessments/${attempt.id}/answers`, owner, "PATCH", {
            expectedRevision: 3,
            answers: invalid,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await stack.request(
          `assessments/${attempt.id}/submit`,
          owner,
          "POST",
          { expectedRevision: 3, answers: partial },
          { "Idempotency-Key": crypto.randomUUID() },
        )
      ).status,
    ).toBe(400);
  });
  it("seals once under concurrent duplicate submissions with a task and task-ID-only queue message", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const selected = await answers(attempt);
    const key = crypto.randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => submit(owner, attempt, key, selected)),
    );
    expect(new Set(responses.map((value) => value.taskId)).size).toBe(1);
    const taskId = responses[0].taskId;
    const rows = await stack.sql.query(
      "select count(*)::int count from public.tasks where user_id=$1 and kind='assessment.grade'",
      [owner.id],
    );
    expect(rows.rows[0].count).toBe(1);
    const queue = await stack.sql.query(
      "select message from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
      [taskId],
    );
    expect(queue.rows).toEqual([{ message: { taskId } }]);
    const changed = { ...selected, [attempt.items[0].id]: (selected[attempt.items[0].id] + 1) % 3 };
    expect(
      (
        await stack.request(
          `assessments/${attempt.id}/submit`,
          owner,
          "POST",
          { expectedRevision: 1, answers: changed },
          { "Idempotency-Key": key },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await stack.request(`assessments/${attempt.id}/answers`, owner, "PATCH", {
          expectedRevision: 2,
          answers: selected,
        })
      ).status,
    ).toBe(409);
    const usage = await stack.sql.query(
      "select count(*)::int count from public.usage_reservations where user_id=$1",
      [owner.id],
    );
    expect(usage.rows[0].count).toBe(0);
  });
  it("isolates attempts/results/tasks and keeps answer keys private even from ordinary raw table reads", async () => {
    const owner = await stack.member(),
      other = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt);
    expect((await stack.request(`assessments/${attempt.id}`, other)).status).toBe(404);
    expect((await stack.request(`tasks/${task.taskId}`, other)).status).toBe(404);
    expect((await stack.request(`assessments/${attempt.id}`)).status).toBe(401);
    for (const table of ["question_versions", "rubric_versions", "question_publications"]) {
      expect((await owner.client.from(table).select("*")).error !== null).toBe(true);
    }
    const rows = await other.client.from("assessment_attempts").select("*");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
    expect((await stack.request("admin/assessments", owner)).status).toBe(403);
    const workerCall = await owner.client.rpc("task_read", {
      p_worker: crypto.randomUUID(),
      p_kinds: ["assessment.grade"],
      p_seconds: 5,
      p_quantity: 1,
    });
    expect(workerCall.error !== null).toBe(true);
    expect(
      (
        await owner.client
          .from("responses")
          .upsert({ attempt_item_id: attempt.items[0].id, answer_index: 1 })
      ).error !== null,
    ).toBe(true);
  });
  it("runs the actual Node worker, publishes narrow observations and preserves self-report claims", async () => {
    const owner = await stack.member();
    const claim = await stack.request("evidence", owner, "POST", {
      expectedRevision: 0,
      evidence: {
        source: "self-report",
        label: "Prior experience",
        context: "A separate claim",
        skills: ["python"],
        observedAt: "2026-11-01T00:00:00Z",
        claimedLevel: 3,
      },
    });
    expect(claim.status).toBe(201);
    const attempt = await start(owner);
    const correct = await answers(attempt);
    const selected = { ...correct, [attempt.items[0].id]: (correct[attempt.items[0].id] + 1) % 3 };
    const task = await submit(owner, attempt, crypto.randomUUID(), selected);
    const log = await worker();
    expect(log).toContain("task.completed");
    expect(log).not.toContain("Private feedback");
    const completed = (await (await stack.request(`assessments/${attempt.id}`, owner)).json()).data;
    expect(completed.status).toBe("completed");
    expect(completed.result).toMatchObject({ correct: 2, total: 3, recipe: "mcq-v1" });
    const evidence = (await (await stack.request("evidence", owner)).json()).data;
    expect(
      evidence.filter((value: { source: string }) => value.source === "scenario"),
    ).toHaveLength(3);
    expect(
      evidence.find((value: { source: string }) => value.source === "self-report").claimedLevel,
    ).toBe(3);
    expect((await (await stack.request(`tasks/${task.taskId}`, owner)).json()).data.status).toBe(
      "succeeded",
    );
  });
  it("retains selected question/rubric/dictionary versions after a new question is reviewed", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const selected = attempt.items[0];
    const original = (
      await stack.sql.query("select * from public.question_versions where id=$1", [
        selected.questionVersionId,
      ])
    ).rows[0];
    const response = await stack.request("admin/assessments/questions", admin, "POST", {
      key: original.key,
      version: original.version + 10,
      track: original.track,
      skillId: original.skill_id,
      rubricId: original.rubric_version_id,
      prompt: `${prefix} Changed version`,
      options: ["Different A", "Different B"],
      correctIndex: 1,
      explanation: "A newer reviewed explanation",
    });
    expect(response.status).toBe(201);
    const newer = (await response.json()).data.id;
    questionIds.push(newer);
    expect(
      (
        await stack.request(`admin/assessments/questions/${newer}/review`, admin, "POST", {
          reason: "Review a replacement fixture version",
        })
      ).status,
    ).toBe(200);
    await submit(owner, attempt);
    await worker();
    const result = (await (await stack.request(`assessments/${attempt.id}`, owner)).json()).data;
    expect(result.items.find((item: { id: string }) => item.id === selected.id).prompt).toBe(
      selected.prompt,
    );
    expect(
      result.result.observations.find((value: { itemId: string }) => value.itemId === selected.id)
        .explanation,
    ).toBe(original.explanation);
  });
  it("recovers expired leases and suppresses stale-worker result publication", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt);
    const first = await lease(task.taskId);
    await expire(task.taskId);
    const second = await lease(task.taskId);
    expect(second.token).not.toBe(first.token);
    expect((await grade(first)).error?.message).toBe("RF_CONFLICT");
    checked((await grade(second)).error);
    expect(
      (
        await stack.sql.query(
          "select count(*)::int count from public.assessment_results where attempt_id=$1",
          [attempt.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("survives a crash after result commit and archives redelivery without adding duplicate evidence", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt);
    const claim = await lease(task.taskId);
    checked((await grade(claim)).error);
    expect(
      (
        await stack.sql.query(
          "select count(*)::int count from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
          [task.taskId],
        )
      ).rows[0].count,
    ).toBe(1);
    await stack.sql.query("select pgmq.set_vt('rolefoundry_tasks',$1,0)", [claim.messageId]);
    expect((await read()).some((value) => value.taskId === task.taskId)).toBe(false);
    expect(
      (
        await stack.sql.query(
          "select count(*)::int count from pgmq.q_rolefoundry_tasks where message->>'taskId'=$1",
          [task.taskId],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await stack.sql.query(
          "select count(*)::int count from public.evidence where user_id=$1 and source='scenario'",
          [owner.id],
        )
      ).rows[0].count,
    ).toBe(3);
  });
  it("bounds transient retries, preserves sealed answers and creates an audited explicit retry task", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt);
    for (let number = 1; number <= 3; number++) {
      const claim = await lease(task.taskId);
      const failed = await stack.privileged.rpc("task_fail", {
        p_task: task.taskId,
        p_token: claim.token,
        p_category: "infrastructure",
      });
      checked(failed.error);
      expect(failed.data.status).toBe(number < 3 ? "queued" : "failed");
      if (number < 3) await expire(task.taskId);
    }
    const failed = (await (await stack.request(`assessments/${attempt.id}`, owner)).json()).data;
    expect(failed.status).toBe("failed");
    expect(failed.answers).toEqual(await answers(attempt));
    const key = crypto.randomUUID();
    const retried = await stack.request(
      `assessments/${attempt.id}/retry`,
      owner,
      "POST",
      { previousTaskId: task.taskId },
      { "Idempotency-Key": key },
    );
    expect(retried.status).toBe(202);
    const next = (await retried.json()).data.taskId;
    expect(next).not.toBe(task.taskId);
    const duplicate = await stack.request(
      `assessments/${attempt.id}/retry`,
      owner,
      "POST",
      { previousTaskId: task.taskId },
      { "Idempotency-Key": key },
    );
    expect((await duplicate.json()).data.taskId).toBe(next);
    await worker();
    expect(
      (await (await stack.request(`assessments/${attempt.id}`, owner)).json()).data.status,
    ).toBe("completed");
    expect(
      (
        await stack.sql.query(
          "select count(*)::int count from public.assessment_audit where actor_id=$1 and action='assessment.retry.requested'",
          [owner.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("blocks deactivated/deleted owners and mismatched sealed input versions before publication", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt);
    const claim = await lease(task.taskId);
    checked(
      (await stack.privileged.rpc("identity_deactivate_profile", { p_user: owner.id })).error,
    );
    expect((await grade(claim)).error?.message).toBe("RF_FORBIDDEN");
    expect((await stack.request(`assessments/${attempt.id}`, owner)).status).toBe(403);
    const other = await stack.member();
    const stale = await start(other);
    const submitted = await submit(other, stale);
    const staleLease = await lease(submitted.taskId);
    await stack.sql.query("update public.tasks set input_version='stale-fixture' where id=$1", [
      submitted.taskId,
    ]);
    expect((await grade(staleLease)).error?.message).toBe("RF_STALE_INPUT");
    await stack.sql.query("update public.tasks set input_version=$2 where id=$1", [
      submitted.taskId,
      String(stale.revision + 1),
    ]);
    const deleted = await stack.privileged.auth.admin.deleteUser(other.id);
    checked(deleted.error);
    expect((await grade(staleLease)).error?.message).toBe("RF_NOT_FOUND");
    stack.users.splice(
      stack.users.findIndex((user) => user.id === other.id),
      1,
    );
    await stack.sql.query(
      "delete from public.invitations where email_hash=public.identity_email_hash($1)",
      [other.email],
    );
  });
  it("rejects malformed queue payloads and exposes safe operational metrics only to admins/workers", async () => {
    const marker = `secret-poison-${crypto.randomUUID()}`;
    await stack.sql.query("select pgmq.send('rolefoundry_tasks',$1::jsonb)", [
      JSON.stringify({ privateContent: marker }),
    ]);
    await read();
    const events = await stack.sql.query(
      "select event,safe_code from public.task_events where event='queue.poison' order by id desc limit 1",
    );
    expect(events.rows).toEqual([{ event: "queue.poison", safe_code: "RF_POISON" }]);
    expect(JSON.stringify(events.rows)).not.toContain(marker);
    const metrics = await stack.privileged.rpc("task_metrics");
    checked(metrics.error);
    expect(Object.keys(metrics.data)).toEqual(
      expect.arrayContaining([
        "queued",
        "running",
        "failed",
        "expiredLeases",
        "oldestQueueSeconds",
        "retryCount",
      ]),
    );
    const member = await stack.member();
    expect((await member.client.rpc("task_metrics")).error?.message).toBe("RF_FORBIDDEN");
    await stack.sql.query(
      "delete from pgmq.a_rolefoundry_tasks where message->>'privateContent'=$1",
      [marker],
    );
  });
  it("autosaves real browser answers, resumes after reload and polls a real worker result", async () => {
    const owner = await stack.member();
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
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${stack.origin}/assessments/`);
      await page.getByRole("button", { name: "Start a private assessment", exact: true }).click();
      await webExpect(page.locator(".assessment-question-list > fieldset")).toHaveCount(3);
      await page.getByRole("radio").nth(0).check();
      await webExpect(page.getByRole("status")).toHaveText("All answers saved.");
      await page.reload();
      await webExpect(page.getByRole("radio").nth(0)).toBeChecked();
      await page
        .locator(".assessment-question-list > fieldset")
        .nth(1)
        .getByRole("radio")
        .first()
        .check();
      await page
        .locator(".assessment-question-list > fieldset")
        .nth(2)
        .getByRole("radio")
        .first()
        .check();
      await webExpect(
        page.getByRole("button", { name: "Submit for scoring", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Submit for scoring", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "Scoring is queued", exact: true }),
      ).toBeVisible();
      await worker();
      await webExpect(page.getByText(/of 3 scenarios/, { exact: false })).toBeVisible();
      await webExpect(
        page.getByRole("link", { name: "View scenario evidence in my profile", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/assessment-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
  it("rolls back result and evidence if the lease expires during publication", async () => {
    const owner = await stack.member();
    const attempt = await start(owner);
    const task = await submit(owner, attempt, crypto.randomUUID());
    const claim = await lease(task.taskId);
    const fn = `test_assessment_delay_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await stack.sql.query(
        `create function public.${fn}() returns trigger language plpgsql as $$ begin if new.attempt_id='${attempt.id}'::uuid then perform pg_sleep(0.3);end if; return new;end $$`,
      );
      await stack.sql.query(
        `create trigger ${fn} before insert on public.assessment_results for each row execute function public.${fn}()`,
      );
      await stack.sql.query(
        "update public.tasks set lease_expires_at=clock_timestamp()+interval '0.2 seconds' where id=$1",
        [task.taskId],
      );
      expect((await grade(claim)).error?.message).toBe("RF_CONFLICT");
      expect(
        (
          await stack.sql.query("select id from public.assessment_results where attempt_id=$1", [
            attempt.id,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (await stack.sql.query("select id from public.evidence where user_id=$1", [owner.id]))
          .rowCount,
      ).toBe(0);
    } finally {
      await stack.sql.query(`drop trigger if exists ${fn} on public.assessment_results`);
      await stack.sql.query(`drop function if exists public.${fn}()`);
    }
    await expire(task.taskId);
    expect((await grade(await lease(task.taskId))).error).toBeNull();
  });
  it("authors, reviews and retires question versions through the administrator browser", async () => {
    const browser = await chromium.launch();
    const key = `${prefix}-browser`;
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
      await page.goto(`${stack.origin}/assessments/`);
      await page.getByLabel("Rubric key", { exact: true }).fill(key);
      await page
        .getByLabel("Rubric description", { exact: true })
        .fill("Browser-reviewed rubric for safe learning feedback");
      await page.getByRole("button", { name: "Create rubric version", exact: true }).click();
      await webExpect(
        page
          .getByLabel("Question rubric", { exact: true })
          .getByRole("option", { name: `${key} · version 1`, exact: true }),
      ).toHaveCount(1);
      await page.getByLabel("Question key", { exact: true }).fill(key);
      await page
        .getByLabel("Question rubric", { exact: true })
        .selectOption({ label: `${key} · version 1` });
      await page
        .getByLabel("Question prompt", { exact: true })
        .fill(`A browser-authored learning scenario ${key}`);
      await page
        .getByLabel("Question options", { exact: true })
        .fill("Inspect the source\nAssume it is correct");
      await page
        .getByLabel("Question explanation", { exact: true })
        .fill("Inspect sources before drawing conclusions.");
      await page.getByRole("button", { name: "Create draft question", exact: true }).click();
      const card = page.getByRole("article").filter({
        has: page.getByRole("heading", {
          name: `A browser-authored learning scenario ${key}`,
          exact: true,
        }),
      });
      await webExpect(card).toHaveCount(1);
      await page
        .getByLabel("Question review reason", { exact: true })
        .fill("Checked prompt, answer and feedback against rubric");
      await card.getByRole("button", { name: "Review question version", exact: true }).click();
      await webExpect(card).toContainText("Reviewed for selection");
      await card.getByRole("button", { name: "Retire question version", exact: true }).click();
      await webExpect(card).toContainText("Draft or retired");
      await page.screenshot({
        path: ".local/assessment-bank-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await browser.close();
      const rows = await stack.sql.query("select id from public.question_versions where key=$1", [
        key,
      ]);
      for (const row of rows.rows) questionIds.push(row.id);
      // The main fixture rubric is removed by afterAll; this extra operator rubric owns only this test's questions.
      await stack.sql.query(
        "delete from public.question_publications where question_version_id=any($1::uuid[])",
        [rows.rows.map((row) => row.id)],
      );
      await stack.sql.query("delete from public.question_versions where key=$1", [key]);
      await stack.sql.query("delete from public.rubric_versions where key=$1", [key]);
    }
  });
  it("does not build operator-authored question answers or feedback into client assets", async () => {
    const secretRows = await stack.sql.query(
      "select id,explanation from public.question_versions where id=any($1::uuid[])",
      [questionIds],
    );
    const assets = await readdir(".next/static", { recursive: true });
    for (const name of assets.filter((file) => /\.(js|map)$/.test(file))) {
      const content = await readFile(`.next/static/${name}`, "utf8");
      for (const question of secretRows.rows) {
        expect(content.includes(question.id)).toBe(false);
        expect(content.includes(question.explanation)).toBe(false);
      }
    }
  });
});
