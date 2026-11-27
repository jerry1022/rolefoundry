import { beforeAll, afterAll, it, expect } from "vitest";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
const id = () => crypto.randomUUID();
let stack: LocalFixtures, owner: LocalMember;
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
async function ownedLease(expired = false) {
  const result = await stack.privileged.rpc("task_enqueue", {
    p_user: owner.id,
    p_kind: "catalog.import",
    p_source: id(),
    p_version: "authored-import-retry-v1",
    p_key: id(),
    p_hash: "synthetic-hash",
  });
  checked(result.error);
  const taskId = result.data as string,
    token = id();
  // Claim only this fixture's row/message; never consume another user's queued import.
  const row = (
    await stack.sql.query(
      "update public.tasks set status='running',attempt_count=1,worker_id=$2,lease_token=$3,lease_expires_at=clock_timestamp()+make_interval(secs=>$4) where id=$1 returning queue_message_id",
      [taskId, id(), token, expired ? -1 : 30],
    )
  ).rows[0];
  await stack.sql.query("select pgmq.set_vt('rolefoundry_tasks',$1,30)", [row.queue_message_id]);
  return { taskId, token, messageId: row.queue_message_id };
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  owner = await stack.member();
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=$1 and queue_message_id is not null",
    [owner.id],
  );
  await stack.close();
});
it("persists provider Retry-After on both the owned task and actual queue message without extending a duplicate stale lease", async () => {
  const lease = await ownedLease();
  const result = await stack.privileged.rpc("task_fail_after", {
    p_task: lease.taskId,
    p_token: lease.token,
    p_category: "infrastructure",
    p_retry_after: 60,
  });
  checked(result.error);
  expect(result.data.status).toBe("queued");
  const state = (
    await stack.sql.query(
      "select status,next_run_at,extract(epoch from next_run_at-clock_timestamp())::float8 seconds,lease_token from public.tasks where id=$1",
      [lease.taskId],
    )
  ).rows[0];
  expect(state.status).toBe("queued");
  expect(state.seconds).toBeGreaterThan(55);
  expect(state.lease_token).toBeNull();
  const visible = (
    await stack.sql.query(
      "select extract(epoch from vt-clock_timestamp())::float8 seconds,message from pgmq.q_rolefoundry_tasks where msg_id=$1",
      [lease.messageId],
    )
  ).rows[0];
  expect(visible.seconds).toBeGreaterThan(55);
  expect(visible.message).toEqual({ taskId: lease.taskId });
  checked(
    (
      await stack.privileged.rpc("task_fail_after", {
        p_task: lease.taskId,
        p_token: lease.token,
        p_category: "infrastructure",
        p_retry_after: 600,
      })
    ).error,
  );
  expect(
    (await stack.sql.query("select next_run_at from public.tasks where id=$1", [lease.taskId]))
      .rows[0].next_run_at,
  ).toEqual(state.next_run_at);
});
it("does not reschedule an expired or foreign lease", async () => {
  const lease = await ownedLease(true);
  const before = (
    await stack.sql.query("select next_run_at,lease_expires_at from public.tasks where id=$1", [
      lease.taskId,
    ])
  ).rows[0];
  for (const token of [lease.token, id()]) {
    const result = await stack.privileged.rpc("task_fail_after", {
      p_task: lease.taskId,
      p_token: token,
      p_category: "timeout",
      p_retry_after: 60,
    });
    checked(result.error);
    expect(result.data.status).toBe("lease_lost");
  }
  expect(
    (
      await stack.sql.query("select next_run_at,lease_expires_at from public.tasks where id=$1", [
        lease.taskId,
      ])
    ).rows[0],
  ).toEqual(before);
});
it("keeps retry authority service-only and rejects an invalid delay", async () => {
  const lease = await ownedLease();
  expect(
    (
      await owner.client.rpc("task_fail_after", {
        p_task: lease.taskId,
        p_token: lease.token,
        p_category: "timeout",
        p_retry_after: 60,
      })
    ).error,
  ).not.toBeNull();
  const invalid = await stack.privileged.rpc("task_fail_after", {
    p_task: lease.taskId,
    p_token: lease.token,
    p_category: "timeout",
    p_retry_after: 86401,
  });
  expect(invalid.error?.message).toBe("RF_INVALID_INPUT");
  expect(
    (await stack.sql.query("select status from public.tasks where id=$1", [lease.taskId])).rows[0]
      .status,
  ).toBe("running");
});
