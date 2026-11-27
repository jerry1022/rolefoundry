import { beforeAll, afterAll, expect, it } from "vitest";
import type { OperationsSummary, OperationsWorkers } from "../../src/modules/operations/model";
import { chromium, expect as webExpect } from "@playwright/test";
import { spawn } from "node:child_process";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
let stack: LocalFixtures, admin: LocalMember, member: LocalMember;
const ids = Array.from({ length: 25 }, () => crypto.randomUUID());
const workers = Array.from({ length: 4 }, () => crypto.randomUUID());
const privateSource = crypto.randomUUID(),
  privateResult = crypto.randomUUID(),
  privateToken = crypto.randomUUID();
const root = "admin/operations";
const report = (id: string, state = "active") =>
  stack.privileged.rpc("worker_report", {
    p_worker: id,
    p_kinds: ["account.delete"],
    p_seconds: 30,
    p_concurrency: 2,
    p_state: state,
  });
async function get(path = "", user: LocalMember | undefined = admin) {
  const response = await stack.request(`${root}${path}`, user);
  return { response, body: await response.json() };
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  // Direct, owned SQL fixtures never send executable work to the live queue.
  await stack.sql.query(
    `insert into public.tasks(id,user_id,kind,source_ref,input_version,idempotency_key,request_hash,status,created_at,next_run_at,safe_error,result_ref,lease_token)
  select x,$2,'account.delete',$3,'private-input','private-key-'||x,'private-hash','failed',now(),now(),'untrusted-error',$4,$5 from unnest($1::uuid[]) x`,
    [ids, member.id, privateSource, privateResult, privateToken],
  );
  await stack.sql.query(
    "insert into public.task_events(task_id,event,safe_code) select $1,case when n=1 then 'untrusted-event' when n=2 then 'task.succeeded' else 'task.failed' end,case when n=1 then 'untrusted-code' else 'RF_TRANSIENT' end from generate_series(1,25) n",
    [ids[0]],
  );
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query("delete from public.tasks where id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.worker_instances where id=any($1::uuid[])", [workers]);
  await stack.sql.query("delete from public.operations_audit where actor_id=any($1::uuid[])", [
    [admin?.id, member?.id].filter(Boolean),
  ]);
  await stack.close();
});
it("denies anonymous and member diagnostics at HTTP, RPC and raw-table boundaries", async () => {
  expect((await stack.request(root)).status).toBe(401);
  for (const path of ["", "/tasks", `/tasks/${ids[0]}`, `/tasks/${ids[0]}/events`, "/workers"])
    expect((await get(path, member)).response.status).toBe(403);
  for (const [fn, args] of [
    ["operations_summary", {}],
    ["operations_tasks", {}],
    ["operations_task_find", { p_id: ids[0] }],
    ["operations_events", { p_task: ids[0] }],
    ["operations_workers", {}],
  ] as const)
    expect((await member.client.rpc(fn, args)).error).toBeTruthy();
  for (const table of ["worker_instances", "operations_audit"])
    expect((await admin.client.from(table).select("*")).error).toBeTruthy();
  expect(
    (
      await admin.client.rpc("worker_report", {
        p_worker: workers[0],
        p_kinds: ["account.delete"],
        p_seconds: 30,
        p_concurrency: 2,
        p_state: "active",
      })
    ).error,
  ).toBeTruthy();
});
it("redacts private task material and untrusted classification strings and audits reads", async () => {
  const { response, body } = await get(`/tasks/${ids[0]}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(body.data).toMatchObject({ id: ids[0], errorCode: null, resultAvailable: true });
  const text = JSON.stringify(body);
  for (const value of [
    member.id,
    member.email,
    privateSource,
    privateResult,
    privateToken,
    "private-input",
    "private-key",
    "private-hash",
    "untrusted-error",
  ])
    expect(text).not.toContain(value);
  const audit = await stack.sql.query(
    "select action,resource_id from public.operations_audit where actor_id=$1 and resource_id=$2",
    [admin.id, ids[0]],
  );
  expect(audit.rows.some((row) => row.action === "task.read")).toBe(true);
});
it("paginates equal-timestamp tasks without duplicates and binds cursors to filters", async () => {
  const one = await get("/tasks?kind=account.delete&status=failed");
  expect(one.response.status).toBe(200);
  expect(one.body.data).toHaveLength(20);
  expect(one.body.nextCursor).toBeTypeOf("string");
  const cursor = encodeURIComponent(one.body.nextCursor);
  const two = await get(`/tasks?kind=account.delete&status=failed&cursor=${cursor}`);
  expect(two.response.status).toBe(200);
  const actual = [...one.body.data, ...two.body.data].map((row) => row.id);
  expect(new Set(actual).size).toBe(actual.length);
  expect(ids.every((id) => actual.includes(id))).toBe(true);
  expect(
    (await get(`/tasks?kind=account.delete&status=queued&cursor=${cursor}`)).response.status,
  ).toBe(400);
});
it("paginates event sequences, preserves success and sanitizes unknown event text", async () => {
  const first = await get(`/tasks/${ids[0]}/events`);
  expect(first.body.data).toHaveLength(20);
  const cursor = encodeURIComponent(first.body.nextCursor);
  const second = await get(`/tasks/${ids[0]}/events?cursor=${cursor}`);
  expect(second.body.data).toHaveLength(5);
  expect(second.body.nextCursor).toBeNull();
  expect(second.body.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "task.succeeded" }),
      expect.objectContaining({ event: "event.unclassified", code: null }),
    ]),
  );
  expect(JSON.stringify(second.body)).not.toContain("untrusted");
  expect((await get(`/tasks/${ids[1]}/events?cursor=${cursor}`)).response.status).toBe(400);
});
it("rejects ambiguous filters, malformed cursors and missing tasks", async () => {
  for (const path of [
    "?limit=100",
    "/tasks?status=failed&status=queued",
    "/tasks?kind=invalid",
    "/tasks?cursor=not-json",
    `/tasks/${ids[0]}/events?cursor=not-json`,
    "/tasks/not-a-uuid",
  ])
    expect((await get(path)).response.status).toBe(400);
  expect((await get(`/tasks/${crypto.randomUUID()}`)).response.status).toBe(404);
});
it("rejects invalid presence declarations and out-of-range event cursors", async () => {
  const valid = {
    p_worker: workers[0],
    p_kinds: ["account.delete"],
    p_seconds: 30,
    p_concurrency: 2,
    p_state: "active",
  };
  for (const change of [
    { p_kinds: [] },
    { p_kinds: ["account.delete", "account.delete"] },
    { p_kinds: ["unknown"] },
    { p_seconds: 0 },
    { p_concurrency: 9 },
    { p_state: "unknown" },
  ])
    expect(
      (await stack.privileged.rpc("worker_report", { ...valid, ...change })).error,
    ).toBeTruthy();
  const cursor = Buffer.from(
    JSON.stringify({ taskId: ids[0], sequence: "9223372036854775808" }),
  ).toString("base64url");
  expect((await get(`/tasks/${ids[0]}/events?cursor=${cursor}`)).response.status).toBe(400);
});
it("preserves event sequence precision beyond JavaScript safe integers", async () => {
  const sequence = 9007199254740993n + BigInt("0x" + ids[24].replaceAll("-", "").slice(0, 10));
  await stack.sql.query(
    "insert into public.task_events(id,task_id,event) overriding system value values($1,$2,'task.succeeded')",
    [sequence.toString(), ids[24]],
  );
  const { response, body } = await get(`/tasks/${ids[24]}/events`);
  expect(response.status).toBe(200);
  expect(body.data[0].id).toBe(sequence.toString());
});
it("reports worker coverage and distinguishes stale, draining and stopped processes", async () => {
  for (const [i, state] of ["active", "active", "draining", "stopped"].entries())
    expect((await report(workers[i], state)).error).toBeNull();
  await stack.sql.query(
    "update public.worker_instances set last_seen_at=now()-interval '46 seconds' where id=$1",
    [workers[1]],
  );
  const { body } = await get("/workers");
  expect(
    workers.map(
      (id) => (body.data as OperationsWorkers).data.find((row) => row.id === id)?.observedState,
    ),
  ).toEqual(["active", "stale", "draining", "stopped"]);
  expect((await report(workers[3], "active")).error).toBeTruthy();
  expect((await report(workers[2], "active")).error).toBeTruthy();
  const summary = (await get()).body.data as OperationsSummary;
  expect(summary.kinds.find((row) => row.kind === "account.delete")!.activeWorkers).toBe(1);
});
it("measures ready work separately from delayed retries and expired running leases", async () => {
  const before = ((await get()).body.data as OperationsSummary).kinds.find(
    (row) => row.kind === "account.delete",
  )!;
  await stack.sql.query(
    "update public.tasks set status='queued',next_run_at=now()+interval '1 hour' where id=$1",
    [ids[0]],
  );
  await stack.sql.query(
    "update public.tasks set status='queued',next_run_at=now()-interval '6 minutes' where id=$1",
    [ids[1]],
  );
  await stack.sql.query(
    "update public.tasks set status='running',lease_expires_at=now()-interval '1 second',heartbeat_at=now()-interval '2 minutes' where id=$1",
    [ids[2]],
  );
  await stack.sql.query(
    "insert into public.task_events(task_id,event,safe_code) values($1,'task.retry_scheduled','RF_TRANSIENT')",
    [ids[1]],
  );
  await stack.sql.query(
    "update public.tasks set status='succeeded',finished_at=now() where id=any($1::uuid[])",
    [ids.slice(3, 13)],
  );
  await stack.sql.query("update public.tasks set finished_at=now() where id=$1", [ids[13]]);
  await stack.sql.query(
    "insert into public.task_events(task_id,event,safe_code) values($1,'queue.poison','RF_POISON')",
    [ids[1]],
  );
  const after = ((await get()).body.data as OperationsSummary).kinds.find(
    (row) => row.kind === "account.delete",
  )!;
  expect(after.succeeded24h).toBe(before.succeeded24h + 10);
  expect(after.failed24h).toBe(before.failed24h + 1);
  expect((await get()).body.data.poison24h).toBeGreaterThanOrEqual(1);
  expect(after.queued).toBe(before.queued + 2);
  expect(after.ready).toBe(before.ready + 1);
  expect(after.running).toBe(before.running + 1);
  expect(after.expiredLeases).toBe(before.expiredLeases + 1);
  expect(after.retried24h).toBe(before.retried24h + 1);
  expect(after.oldestReadySeconds).toBeGreaterThanOrEqual(360);
  expect(after.maxLeaseAgeSeconds).toBeGreaterThanOrEqual(120);
});
it("reports a real independent worker heartbeat and graceful SIGTERM shutdown", async () => {
  const before = await stack.sql.query("select id from public.worker_instances");
  const known = new Set(before.rows.map((row) => row.id));
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "apps/worker/src/main.ts"],
    {
      env: {
        ...process.env,
        SUPABASE_URL: stack.env.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: stack.env.SERVICE_ROLE_KEY,
      },
      stdio: "ignore",
    },
  );
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("close", resolve);
    child.once("error", reject);
  });
  let owned: string | undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await stack.sql.query(
        "select id from public.worker_instances where state='active'",
      );
      owned = rows.rows.find((row) => !known.has(row.id))?.id;
      if (owned) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(owned).toBeTruthy();
    if (owned) workers.push(owned);
    const first = await stack.sql.query(
      "select last_seen_at from public.worker_instances where id=$1",
      [owned],
    );
    await expect
      .poll(
        async () => {
          const next = await stack.sql.query(
            "select last_seen_at from public.worker_instances where id=$1",
            [owned],
          );
          return +next.rows[0].last_seen_at > +first.rows[0].last_seen_at;
        },
        { timeout: 13000, interval: 500 },
      )
      .toBe(true);
    child.kill("SIGTERM");
    expect(
      await Promise.race([
        closed,
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
      ]),
    ).toBe(0);
    expect(
      (await stack.sql.query("select state from public.worker_instances where id=$1", [owned]))
        .rows[0].state,
    ).toBe("stopped");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await closed;
  }
});
it("supports real mobile administrator lookup, history pagination and on-demand refresh", async () => {
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
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/admin/operations", async (route) => {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    await panel.locator("summary").click();
    await webExpect(panel.getByText("Loading task diagnostics…", { exact: true })).toBeVisible();
    await panel.locator("summary").click();
    await webExpect(panel).not.toHaveAttribute("open", "");
    release();
    await panel.locator("summary").click();
    await webExpect(
      panel.getByRole("button", { name: "Refresh task diagnostics", exact: true }),
    ).toBeEnabled();
    await webExpect(
      panel.getByRole("heading", { name: "Queue and lease observations" }),
    ).toBeVisible();
    await panel.getByLabel("Diagnostic task identifier", { exact: true }).fill(ids[0]);
    await panel.getByRole("button", { name: "Inspect task identifier", exact: true }).click();
    await webExpect(panel.getByLabel("Selected task diagnostics", { exact: true })).toContainText(
      ids[0],
    );
    await panel.getByRole("button", { name: "Load older task events", exact: true }).click();
    await webExpect(panel.getByLabel("Selected task diagnostics", { exact: true })).toContainText(
      "event.unclassified",
    );
    await panel.getByLabel("Diagnostic task kind", { exact: true }).selectOption("account.delete");
    await panel.getByRole("button", { name: "Apply task filters", exact: true }).click();
    await webExpect(panel).toContainText("Applied filters: account.delete / failed.");
    await panel.getByRole("button", { name: "Refresh task diagnostics", exact: true }).click();
    await webExpect(
      panel.getByRole("button", { name: "Refresh task diagnostics", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await panel.getByRole("button", { name: "Inspect task identifier", exact: true }).click();
    await webExpect(panel.getByLabel("Selected task diagnostics", { exact: true })).toBeVisible();
    await panel
      .getByLabel("Selected task diagnostics", { exact: true })
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: "docs/assets/operations-admin-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/assets/operations-admin-desktop.png" });
    // Revoke role after an authorized read; the next API call must clear cached observations.
    await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
    await panel.getByRole("button", { name: "Refresh task diagnostics", exact: true }).click();
    await webExpect(panel).toContainText("Task diagnostics require an administrator session.");
    await webExpect(
      panel.getByRole("heading", { name: "Queue and lease observations" }),
    ).toHaveCount(0);
    await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
    await context.close();
  } finally {
    await browser.close();
  }
});
