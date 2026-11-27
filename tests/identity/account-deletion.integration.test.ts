import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat, rm, rmdir } from "node:fs/promises";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase";
import { TaskWorker } from "../../src/modules/tasks/worker";
import {
  AccountDeletionHandler,
  LateDeletionJanitor,
} from "../../src/modules/account-deletion/handler";
import {
  SupabaseDeletionExecution,
  SupabaseLateDeletionStore,
} from "../../src/modules/account-deletion/adapters/supabase";
import { SupabaseDeletionDirectory } from "../../src/modules/account-deletion/adapters/directory";
import { SupabaseDeletionFiles } from "../../src/modules/account-deletion/adapters/storage";
import { ResumeStorageJanitor } from "../../src/modules/resume/cleanup";
import { SupabaseResumeCleanupRepository } from "../../src/modules/resume/adapters/execution";
import { SupabaseResumeStorage } from "../../src/modules/resume/adapters/storage";
import { AccountExportJanitor } from "../../src/modules/account-data/handler";
import { SupabaseAccountExportCleanup } from "../../src/modules/account-data/adapters/supabase";
import { SupabaseAccountArchiveStorage } from "../../src/modules/account-data/adapters/storage";
import type { DeletionReceipt } from "../../src/modules/account-deletion/model";
vi.mock("server-only", () => ({}));
const id = () => crypto.randomUUID(),
  receipt = (): DeletionReceipt => ({ id: id(), secret: randomBytes(32).toString("hex") }),
  root = "account/deletion",
  requests: DeletionReceipt[] = [],
  fileKeys: { bucket: string; key: string }[] = [],
  retired = new Set<string>();
let stack: LocalFixtures, admin: LocalMember, other: LocalMember;
function engine() {
  return new TaskWorker(
    new SupabaseTaskQueue(stack.privileged),
    {
      "account.delete": new AccountDeletionHandler(
        new SupabaseDeletionExecution(stack.privileged),
        new SupabaseDeletionDirectory(stack.privileged),
        new SupabaseDeletionFiles(stack.privileged),
      ),
    },
    { workerId: id(), leaseSeconds: 30, concurrency: 8 },
  );
}
async function start(user: LocalMember, value = receipt()) {
  requests.push(value);
  const response = await stack.request(root, user, "POST", { ...value, confirmation: "DELETE" });
  expect(response.status).toBe(202);
  expect((await response.json()).data.id).toBe(value.id);
  return value;
}
async function status(value: DeletionReceipt) {
  const response = await stack.request(root + "/status", undefined, "POST", value);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function task(value: DeletionReceipt) {
  return (
    await stack.sql.query("select task_id from public.account_deletions where id=$1", [value.id])
  ).rows[0].task_id as string;
}
async function due(value: DeletionReceipt) {
  await stack.sql.query(
    "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=(select task_id from public.account_deletions where id=$1)",
    [value.id],
  );
  await stack.sql.query(
    "update public.tasks set next_run_at=now()-interval '1 second' where id=(select task_id from public.account_deletions where id=$1)",
    [value.id],
  );
}
async function janitors() {
  await new ResumeStorageJanitor(
    new SupabaseResumeCleanupRepository(stack.privileged),
    new SupabaseResumeStorage(stack.privileged),
  ).tick(new AbortController().signal);
  await new AccountExportJanitor(
    new SupabaseAccountExportCleanup(stack.privileged),
    new SupabaseAccountArchiveStorage(stack.privileged),
  ).tick(new AbortController().signal);
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
      reject(Error("Owned deletion worker exceeded its deadline."));
    }, 25000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Owned deletion worker failed."));
    });
  });
}
async function source(user: LocalMember, guarded = false, registered = true) {
  const doc = id(),
    key = `${user.id}/${doc}/source/${id()}`;
  fileKeys.push({ bucket: "rolefoundry-resumes", key });
  expect(
    (
      await stack.privileged.storage
        .from("rolefoundry-resumes")
        .upload(key, Buffer.from("Controlled account erasure bytes"), {
          contentType: "application/pdf",
        })
    ).error,
  ).toBeNull();
  if (registered) {
    await stack.sql.query(
      "insert into public.resume_documents(id,user_id,filename,source_kind,media_type,byte_count,source_key,request_key,request_hash,status) values($1,$2,'owned.pdf','file','application/pdf',32,$3,$4,'fixture','uploading')",
      [doc, user.id, key, id()],
    );
    await stack.sql.query(
      "insert into public.resume_storage_objects(document_id,user_id,object_key,kind,write_deadline,purge_after) values($1,$2,$3,'source',case when $4 then now()+interval '30 seconds' else null end,now()+interval '1 day')",
      [doc, user.id, key, guarded],
    );
  }
  return key;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  other = await stack.member();
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((user) => user.id);
  const owned = await stack.sql.query(
    "select id from public.account_deletions where subject_id=any($1::uuid[])",
    [users],
  );
  const ids = [
    ...new Set([...requests.map((value) => value.id), ...owned.rows.map((row) => row.id)]),
  ];
  const live = new Set(
    (await stack.sql.query("select id from auth.users where id=any($1::uuid[])", [users])).rows.map(
      (row) => row.id,
    ),
  );
  for (const user of stack.users) if (!live.has(user.id)) retired.add(user.id);
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where source_ref=any($1::uuid[]) and queue_message_id is not null",
    [ids],
  );
  await stack.sql.query("delete from public.identity_audit where resource_id=any($1::uuid[])", [
    ids,
  ]);
  await stack.sql.query("delete from public.account_deletions where id=any($1::uuid[])", [ids]);
  await stack.sql.query("delete from public.tasks where source_ref=any($1::uuid[])", [ids]);
  for (const bucket of ["rolefoundry-resumes", "rolefoundry-account-exports"]) {
    const keys = fileKeys.filter((file) => file.bucket === bucket).map((file) => file.key);
    if (keys.length) await stack.privileged.storage.from(bucket).remove(keys);
  }
  await stack.sql.query(
    "delete from public.resume_storage_objects where split_part(object_key,'/',1)=any($1::text[])",
    [users],
  );
  await stack.sql.query(
    "delete from public.account_export_objects where split_part(object_key,'/',1)=any($1::text[])",
    [users],
  );
  const removed = stack.users.filter((user) => retired.has(user.id));
  await stack.sql.query(
    "delete from public.invitations where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [removed.map((user) => user.email)],
  );
  await stack.sql.query(
    "delete from public.identity_otp_requests where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [removed.map((user) => user.email)],
  );
  stack.users.splice(0, stack.users.length, ...stack.users.filter((user) => !retired.has(user.id)));
  await stack.close();
});
it("requires verified own intent and rejects origin, role/body spoofing and receipt guessing", async () => {
  const value = receipt();
  expect(
    (await stack.request(root, undefined, "POST", { ...value, confirmation: "DELETE" })).status,
  ).toBe(401);
  expect(
    (
      await stack.request(root, other, "POST", {
        ...value,
        confirmation: "DELETE",
        userId: admin.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (await stack.request(root, other, "POST", { ...value, confirmation: "delete" })).status,
  ).toBe(400);
  expect(
    (
      await stack.request(
        root,
        other,
        "POST",
        { ...value, confirmation: "DELETE" },
        { Origin: "https://foreign.invalid" },
      )
    ).status,
  ).toBe(403);
  expect((await stack.request(root + "/status", undefined, "POST", value)).status).toBe(404);
  for (const table of ["account_deletions", "account_deletion_events", "task_erasure_grants"])
    expect((await other.client.from(table).select("*")).error).toBeTruthy();
  expect(
    (await other.client.rpc("account_deletion_load", { p_task: id(), p_token: id() })).error,
  ).toBeTruthy();
});
it("cannot execute a forged erasure task without an accepted capability", async () => {
  const sourceId = id();
  const result = await stack.privileged.rpc("task_enqueue", {
    p_user: other.id,
    p_kind: "account.delete",
    p_source: sourceId,
    p_version: "deletion-v1",
    p_key: id(),
    p_hash: "fixture",
  });
  expect(result.error).toBeNull();
  const taskId = result.data;
  expect(
    (
      await other.client
        .from("task_erasure_grants")
        .insert({ task_id: taskId, subject_id: other.id, request_id: sourceId })
    ).error,
  ).toBeTruthy();
  await engine().tick(new AbortController().signal);
  expect(
    (await stack.sql.query("select status,safe_error from public.tasks where id=$1", [taskId]))
      .rows[0],
  ).toEqual({ status: "failed", safe_error: "RF_FORBIDDEN" });
  expect((await stack.privileged.auth.admin.getUserById(other.id)).error).toBeNull();
  const response = await stack.request(`admin/operations/tasks/${taskId}`, admin);
  expect((await response.json()).data.retryPolicy).toBe("bounded");
});
it("accepts atomically, blocks private APIs/RLS immediately and recovers a lost response via the receipt", async () => {
  const user = await stack.member();
  await stack.sql.query(
    "insert into public.career_preferences(user_id,name) values($1,'Private erasure fixture') on conflict do nothing",
    [user.id],
  );
  const value = await start(user);
  const replay = await stack.request(root, undefined, "POST", { ...value, confirmation: "DELETE" });
  expect(replay.status).toBe(202);
  expect((await status(value)).status).toBe("queued");
  expect([401, 403]).toContain((await stack.request("identity/session", user)).status);
  expect((await user.client.from("career_preferences").select("*")).data).toEqual([]);
  expect(
    (
      await stack.request(root + "/status", undefined, "POST", {
        ...value,
        secret: receipt().secret,
      })
    ).status,
  ).toBe(404);
  const row = (
    await stack.sql.query(
      "select receipt_hash,contact_hash from public.account_deletions where id=$1",
      [value.id],
    )
  ).rows[0];
  expect(row.receipt_hash).not.toBe(value.secret);
  expect(row.contact_hash).not.toContain(user.email);
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  retired.add(user.id);
});
it("accepts deletion even when the ordinary twenty-task pending limit is full", async () => {
  const user = await stack.member();
  await stack.sql.query(
    "insert into public.tasks(user_id,kind,source_ref,input_version,idempotency_key,request_hash) select $1,'resume.parse',gen_random_uuid(),'1',gen_random_uuid()::text,'fixture' from generate_series(1,20)",
    [user.id],
  );
  const value = await start(user);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.tasks where user_id=$1 and kind<>'account.delete' and status='queued'",
        [user.id],
      )
    ).rows[0].n,
  ).toBe(0);
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  retired.add(user.id);
});
it("waits for outstanding writes, persists a continuation and deletes files before Auth", async () => {
  const user = await stack.member(),
    key = await source(user, true),
    value = await start(user);
  await engine().tick(new AbortController().signal);
  expect((await status(value)).status).toBe("cleaning-files");
  expect((await stack.privileged.auth.admin.getUserById(user.id)).error).toBeNull();
  expect(
    (
      await stack.sql.query("select status,attempt_count from public.tasks where id=$1", [
        await task(value),
      ])
    ).rows[0],
  ).toMatchObject({ status: "queued", attempt_count: 0 });
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
  ).toBeNull();
  await stack.sql.query(
    "update public.resume_storage_objects set write_deadline=now()-interval '3 minutes',purge_after=now()-interval '1 second' where object_key=$1",
    [key],
  );
  await janitors();
  await due(value);
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
  ).toBeTruthy();
  retired.add(user.id);
});
it("finds unregistered objects by the canonical subject prefix without deleting other accounts' files", async () => {
  const user = await stack.member(),
    key = await source(user, false, false),
    foreign = await source(other, false, false),
    value = await start(user);
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
  ).toBeTruthy();
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").download(foreign)).error,
  ).toBeNull();
  retired.add(user.id);
});
it("recovers a crash after Auth deletion and fences the stale lease without losing the task", async () => {
  const user = await stack.member(),
    value = await start(user),
    queue = new SupabaseTaskQueue(stack.privileged),
    leases = await queue.read(id(), ["account.delete"], 30, 8),
    ownedTask = await task(value),
    lease = leases.find((item) => item.taskId === ownedTask);
  expect(lease).toBeTruthy();
  if (!lease) throw Error("Missing owned lease.");
  for (const other of leases) if (other !== lease) await queue.release(other);
  const store = new SupabaseDeletionExecution(stack.privileged);
  expect(await store.beginAuth(lease)).toBe(true);
  expect((await stack.privileged.auth.admin.deleteUser(user.id)).error).toBeNull();
  retired.add(user.id);
  expect(
    (await stack.sql.query("select user_id,status from public.tasks where id=$1", [lease.taskId]))
      .rows[0],
  ).toEqual({ user_id: null, status: "running" });
  await stack.sql.query(
    "update public.tasks set lease_expires_at=now()-interval '1 second' where id=$1",
    [lease.taskId],
  );
  await due(value);
  const [next] = await queue.read(id(), ["account.delete"], 30, 1);
  expect(next.taskId).toBe(lease.taskId);
  await expect(store.finish(lease)).rejects.toMatchObject({ status: 409 });
  await new AccountDeletionHandler(
    store,
    new SupabaseDeletionDirectory(stack.privileged),
    new SupabaseDeletionFiles(stack.privileged),
  ).execute(next, new AbortController().signal);
  await queue.acknowledge(next);
  expect((await status(value)).status).toBe("completed");
});
it("retries accepted erasure after three infrastructure failures while ordinary task budgets stay bounded", async () => {
  const user = await stack.member(),
    value = await start(user),
    queue = new SupabaseTaskQueue(stack.privileged),
    taskId = await task(value);
  for (let n = 0; n < 4; n++) {
    await due(value);
    const leases = await queue.read(id(), ["account.delete"], 30, 8),
      lease = leases.find((item) => item.taskId === taskId);
    expect(lease).toBeTruthy();
    if (!lease) throw Error("Missing owned retry lease.");
    for (const other of leases) if (other !== lease) await queue.release(other);
    expect((await queue.fail(lease, "infrastructure")).status).toBe("queued");
  }
  expect((await status(value)).failures).toBe(4);
  await due(value);
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  retired.add(user.id);
});
it("allows only administrator recovery of an already accepted terminal failure, preserving the old attempt", async () => {
  const user = await stack.member(),
    value = await start(user),
    queue = new SupabaseTaskQueue(stack.privileged),
    old = await task(value),
    leases = await queue.read(id(), ["account.delete"], 30, 8),
    lease = leases.find((item) => item.taskId === old)!;
  for (const other of leases) if (other !== lease) await queue.release(other);
  expect((await queue.fail(lease, "validation")).status).toBe("failed");
  expect((await status(value)).status).toBe("needs-attention");
  expect(
    (
      await stack.request(`admin/account-deletions/${value.id}/resume`, other, "POST", {
        reason: "operator-reviewed",
      })
    ).status,
  ).toBe(403);
  expect((await stack.request(`admin/account-deletions/tasks/${old}`, other)).status).toBe(403);
  const lookup = await stack.request(`admin/account-deletions/tasks/${old}`, admin);
  expect((await lookup.json()).data.id).toBe(value.id);
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
    const panel = page.getByLabel("Account deletion recovery", { exact: true });
    await panel.locator("summary").click();
    await panel.getByLabel("Deletion task identifier", { exact: true }).fill(old);
    await panel.getByRole("button", { name: "Find deletion request", exact: true }).click();
    await webExpect(panel.getByLabel("Deletion request identifier", { exact: true })).toHaveValue(
      value.id,
    );
    await panel
      .getByRole("button", { name: "Resume failed account deletion", exact: true })
      .click();
    await webExpect(panel).toContainText(`${value.id} · queued`);
    await panel.evaluate((node) => node.scrollIntoView({ block: "start" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "docs/assets/account-deletion-admin-mobile.png" });
    await context.close();
  } finally {
    await browser.close();
  }
  expect(await task(value)).not.toBe(old);
  expect(
    (await stack.sql.query("select status from public.tasks where id=$1", [old])).rows[0].status,
  ).toBe("failed");
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
  retired.add(user.id);
});
it("recovers a terminal attempt through the local operator CLI after Auth/profile removal", async () => {
  const user = await stack.member(),
    value = await start(user),
    owned = await task(value),
    queue = new SupabaseTaskQueue(stack.privileged),
    leases = await queue.read(id(), ["account.delete"], 30, 8),
    lease = leases.find((item) => item.taskId === owned)!;
  for (const other of leases) if (other !== lease) await queue.release(other);
  const store = new SupabaseDeletionExecution(stack.privileged);
  expect(await store.beginAuth(lease)).toBe(true);
  expect((await stack.privileged.auth.admin.deleteUser(user.id)).error).toBeNull();
  retired.add(user.id);
  expect((await queue.fail(lease, "validation")).status).toBe("failed");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/resume-deletion.mjs", "--request", value.id, "--reason", "operator-reviewed"],
      { stdio: "ignore" },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Owned recovery command exceeded its deadline."));
    }, 15000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Owned recovery command failed."));
    });
  });
  expect(await task(value)).not.toBe(owned);
  expect(
    (
      await stack.sql.query("select user_id,status from public.tasks where id=$1", [
        await task(value),
      ])
    ).rows[0],
  ).toEqual({ user_id: null, status: "queued" });
  await nodeWorker();
  expect((await status(value)).status).toBe("completed");
});
it("reclaims an unexpected late file after completion without reactivating the erased account", async () => {
  const user = await stack.member(),
    value = await start(user);
  await nodeWorker();
  retired.add(user.id);
  expect((await status(value)).status).toBe("completed");
  const key = await source(user, false, false);
  await new LateDeletionJanitor(
    new SupabaseLateDeletionStore(stack.privileged),
    new SupabaseDeletionFiles(stack.privileged),
  ).tick(new AbortController().signal);
  expect(
    (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
  ).toBeTruthy();
  expect((await status(value)).status).toBe("completed");
});
it("removes ready account archives and retained private root records, minimizing contact/audit data", async () => {
  const user = await stack.member(),
    evidence = id(),
    version = id(),
    value = receipt();
  await stack.sql.query(
    "insert into public.career_preferences(user_id,name) values($1,'Retained private fixture') on conflict(user_id) do update set name=excluded.name",
    [user.id],
  );
  await stack.sql.query(
    "insert into public.evidence(id,user_id,source) values($1,$2,'self-report')",
    [evidence, user.id],
  );
  await stack.sql.query(
    "insert into public.evidence_versions(id,evidence_id,user_id,version,label,context,observed_at,source_version,review_state,dictionary_version) values($1,$2,$3,1,'Private retained fact','Controlled fixture',now(),'1','unreviewed',public.dictionary_current_version())",
    [version, evidence, user.id],
  );
  await stack.sql.query(
    "insert into public.identity_otp_requests(email_hash,requested_at) values(public.identity_email_hash($1),now()-interval '1 minute') on conflict(email_hash) do update set requested_at=excluded.requested_at",
    [user.email],
  );
  await stack.sql.query(
    "insert into public.identity_audit(actor_id,subject_id,action,resource_id,reason) values($1,$1,'controlled.fixture',$2,'Private authored reason')",
    [user.id, value.id],
  );
  const exported = await stack.request(
    "account/exports",
    user,
    "POST",
    {},
    { "Idempotency-Key": id() },
  );
  expect(exported.status).toBe(202);
  await nodeWorker();
  const keys = await stack.sql.query(
    "select object_key from public.account_export_objects where user_id=$1",
    [user.id],
  );
  expect(keys.rows).toHaveLength(1);
  fileKeys.push({ bucket: "rolefoundry-account-exports", key: keys.rows[0].object_key });
  await start(user, value);
  await nodeWorker();
  retired.add(user.id);
  expect((await status(value)).status).toBe("completed");
  for (const table of [
    "profiles",
    "career_preferences",
    "evidence",
    "evidence_versions",
    "resume_documents",
    "account_exports",
    "consents",
    "usage_reservations",
    "identity_tasks",
  ]) {
    expect(
      (
        await stack.sql.query(`select count(*)::int n from public.${table} where user_id=$1`, [
          user.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  }
  expect(
    (
      await stack.privileged.storage
        .from("rolefoundry-account-exports")
        .download(keys.rows[0].object_key)
    ).error,
  ).toBeTruthy();
  for (const table of ["sessions", "identities", "refresh_tokens"]) {
    expect(
      (
        await stack.sql.query(`select count(*)::int n from auth.${table} where user_id=$1`, [
          user.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  }
  const row = (
    await stack.sql.query(
      "select contact_hash,invitation_ids from public.account_deletions where id=$1",
      [value.id],
    )
  ).rows[0];
  expect(row).toEqual({ contact_hash: null, invitation_ids: [] });
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.invitations where email_hash=public.identity_email_hash($1)",
        [user.email],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.identity_otp_requests where email_hash=public.identity_email_hash($1)",
        [user.email],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await stack.sql.query(
        "select reason,actor_id,subject_id from public.identity_audit where resource_id=$1 and action='controlled.fixture'",
        [value.id],
      )
    ).rows[0],
  ).toEqual({ reason: null, actor_id: null, subject_id: null });
});
it("continues after repeated expired leases beyond ordinary attempt limits", async () => {
  const user = await stack.member(),
    value = await start(user),
    queue = new SupabaseTaskQueue(stack.privileged),
    ownedTask = await task(value);
  for (let n = 0; n < 4; n++) {
    await due(value);
    const leases = await queue.read(id(), ["account.delete"], 30, 8),
      lease = leases.find((item) => item.taskId === ownedTask);
    expect(lease).toBeTruthy();
    for (const other of leases) if (other !== lease) await queue.release(other);
    await stack.sql.query(
      "update public.tasks set lease_expires_at=now()-interval '1 second' where id=$1",
      [ownedTask],
    );
  }
  await due(value);
  await nodeWorker();
  retired.add(user.id);
  expect((await status(value)).status).toBe("completed");
  const response = await stack.request(`admin/operations/tasks/${ownedTask}`, admin),
    observed = (await response.json()).data;
  expect(observed.retryPolicy).toBe("until-complete");
  expect(observed.attempts).toBeGreaterThan(3);
});
it("exports a private minimal ledger without receipt secrets or contact hashes", async () => {
  const user = await stack.member(),
    value = await start(user),
    directory = `.local/deletion-ledger-${id()}`,
    filename = directory + "/ledger.json";
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/export-deletion-ledger.mjs", "--output", filename],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("Owned ledger export exceeded its deadline."));
      }, 10000);
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error("Owned ledger export failed."));
      });
    });
    const ledger = JSON.parse(await readFile(filename, "utf8")),
      entry = ledger.entries.find((row: { requestId: string }) => row.requestId === value.id);
    expect(ledger.version).toBe(1);
    expect(entry?.subjectId === user.id).toBe(true);
    expect(Object.keys(entry).sort()).toEqual([
      "completedAt",
      "requestId",
      "requestedAt",
      "subjectId",
    ]);
    expect(JSON.stringify(entry).includes(value.secret)).toBe(false);
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(filename, { force: true });
    await rmdir(directory).catch(() => {});
  }
  await nodeWorker();
  retired.add(user.id);
  expect((await status(value)).status).toBe("completed");
});
it("runs the mobile confirmation, private receipt download and signed-out progress flow", async () => {
  const user = await stack.member(),
    browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(
      user.cookie.split("; ").map((pair) => {
        const at = pair.indexOf("=");
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stack.origin };
      }),
    );
    const page = await context.newPage();
    await page.goto(`${stack.origin}/account/`);
    const panel = page.getByLabel("Delete your account", { exact: true });
    await webExpect(
      panel.getByRole("button", { name: "Permanently delete my account", exact: true }),
    ).toBeDisabled();
    await panel.getByLabel("Account deletion confirmation", { exact: true }).fill("DELETE");
    const accepted = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/account/deletion/") &&
        response.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "Permanently delete my account", exact: true }).click();
    const result = await accepted;
    expect(result.status()).toBe(202);
    const body = await result.json(),
      requestId = body.data.id;
    const saved = await page.waitForResponse(
      (response) => response.url().endsWith("/api/v1/account/deletion/status/") && response.ok(),
    );
    expect(saved.status()).toBe(200);
    const progress = page.getByLabel("Account deletion progress", { exact: true });
    await webExpect(progress).toContainText("Private account access is disabled.");
    const downloadPromise = page.waitForEvent("download");
    await progress.getByRole("button", { name: "Save deletion receipt", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("rolefoundry-deletion-receipt.txt");
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const code = Buffer.concat(chunks).toString().trim(),
      [rid, secret] = code.split(".");
    expect(rid).toBe(requestId);
    requests.push({ id: rid, secret });
    await nodeWorker();
    retired.add(user.id);
    await progress.getByRole("button", { name: "Refresh deletion progress", exact: true }).click();
    await webExpect(progress).toContainText("Removal status: completed");
    await progress.evaluate((node) => node.scrollIntoView({ block: "start" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "docs/assets/account-deletion-mobile.png" });
    await page.reload();
    const checker = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Check an existing deletion receipt" }) });
    await checker.locator("summary").click();
    await checker.getByLabel("Private deletion receipt", { exact: true }).fill(code);
    await checker.getByRole("button", { name: "Check deletion receipt", exact: true }).click();
    await webExpect(checker).toContainText("Removal status: completed");
    await context.close();
  } finally {
    await browser.close();
  }
});
