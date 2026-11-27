import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { chromium, expect as webExpect } from "@playwright/test";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import PDFDocument from "pdfkit";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { unzip } from "../support/account-archive";
import {
  SupabaseAccountExportExecution,
  SupabaseAccountExportCleanup,
} from "../../src/modules/account-data/adapters/supabase";
import { SupabaseAccountArchiveStorage } from "../../src/modules/account-data/adapters/storage";
import { AccountExportJanitor } from "../../src/modules/account-data/handler";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase";
vi.mock("server-only", () => ({}));
const id = () => crypto.randomUUID(),
  hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex"),
  root = "account/exports";
let stack: LocalFixtures,
  owner: LocalMember,
  other: LocalMember,
  pdf: Buffer,
  sourceKey: string,
  docId: string;
const sourceKeys: string[] = [],
  retired = new Set<string>();
async function request(user = owner, key = id()) {
  const response = await stack.request(root, user, "POST", {}, { "Idempotency-Key": key });
  expect(response.status).toBe(202);
  return (await response.json()).data as { id: string; taskId: string; status: string };
}
async function list(user = owner) {
  const response = await stack.request(root, user);
  expect(response.status).toBe(200);
  return (await response.json()).data as { id: string; status: string }[];
}
async function drain() {
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
      reject(Error("Owned account worker exceeded its deadline."));
    }, 25000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Owned account worker failed."));
    });
  });
}
async function leaseFor(taskId: string) {
  const queue = new SupabaseTaskQueue(stack.privileged);
  const leases = await queue.read(id(), ["account.export"], 30, 8);
  const lease = leases.find((item) => item.taskId === taskId);
  expect(lease).toBeTruthy();
  for (const other of leases) if (other !== lease) await queue.release(other);
  return lease!;
}
async function source(user: LocalMember) {
  const doc = id(),
    key = `${user.id}/${doc}/source/${id()}`;
  sourceKeys.push(key);
  const uploaded = await stack.privileged.storage
    .from("rolefoundry-resumes")
    .upload(key, pdf, { contentType: "application/pdf" });
  expect(uploaded.error).toBeNull();
  await stack.sql.query(
    "insert into public.resume_documents(id,user_id,filename,source_kind,media_type,byte_count,source_key,source_hash,request_key,request_hash,status) values($1,$2,'owned.pdf','file','application/pdf',$3,$4,$5,$6,'private-request-hash','queued')",
    [doc, user.id, pdf.length, key, hash(pdf), id()],
  );
  await stack.sql.query(
    "insert into public.resume_storage_objects(document_id,user_id,object_key,kind) values($1,$2,$3,'source')",
    [doc, user.id, key],
  );
  return { doc, key };
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  owner = await stack.member();
  other = await stack.member();
  const document = new PDFDocument();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  document.text("Authored private resume for account portability.");
  document.end();
  pdf = await done;
  ({ doc: docId, key: sourceKey } = await source(owner));
  expect(
    (
      await stack.privileged.auth.admin.updateUserById(owner.id, {
        user_metadata: { portabilityMarker: "owned metadata" },
      })
    ).error,
  ).toBeNull();
  await stack.sql.query(
    "insert into public.career_preferences(user_id,name) values($1,'Owned portability name'),($2,'Foreign private name') on conflict(user_id) do update set name=excluded.name",
    [owner.id, other.id],
  );
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((user) => user.id);
  const objects = await stack.sql.query(
    "select object_key from public.account_export_objects where user_id=any($1::uuid[]) or split_part(object_key,'/',1)=any($1::text[])",
    [users],
  );
  if (objects.rows.length)
    await stack.privileged.storage
      .from("rolefoundry-account-exports")
      .remove(objects.rows.map((row) => row.object_key));
  await stack.privileged.storage.from("rolefoundry-resumes").remove(sourceKeys);
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
    [users],
  );
  await stack.sql.query(
    "delete from public.account_export_objects where user_id=any($1::uuid[]) or split_part(object_key,'/',1)=any($1::text[])",
    [users],
  );
  await stack.sql.query(
    "delete from public.resume_storage_objects where object_key=any($1::text[])",
    [sourceKeys],
  );
  const removedEmails = stack.users
    .filter((user) => retired.has(user.id))
    .map((user) => user.email);
  await stack.sql.query(
    "delete from public.invitations where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [removedEmails],
  );
  await stack.sql.query(
    "delete from public.identity_otp_requests where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [removedEmails],
  );
  stack.users.splice(0, stack.users.length, ...stack.users.filter((user) => !retired.has(user.id)));
  await stack.close();
});
it("denies anonymous access, cross-user archives, raw records and worker functions", async () => {
  expect((await stack.request(root)).status).toBe(401);
  const run = await request();
  const administrator = await stack.member(true);
  expect((await stack.request(`${root}/${run.id}/download`, administrator)).status).toBe(404);
  expect((await stack.request(`${root}/${run.id}/download`, other)).status).toBe(404);
  expect((await other.client.from("account_exports").select("*")).error).toBeTruthy();
  expect((await owner.client.rpc("account_export_snapshot", { u: other.id })).error).toBeTruthy();
  expect(
    (await owner.client.rpc("account_export_load", { p_task: run.taskId, p_token: id() })).error,
  ).toBeTruthy();
  await stack.sql.query("select public.account_export_invalidate($1)", [owner.id]);
});
it("creates one atomic idempotent request and rejects origin, body and filter spoofing", async () => {
  const user = await stack.member(),
    key = id();
  const responses = await Promise.all([request(user, key), request(user, key)]);
  expect(responses[0].id).toBe(responses[1].id);
  expect(
    (await stack.request(root, user, "POST", { userId: other.id }, { "Idempotency-Key": id() }))
      .status,
  ).toBe(400);
  expect(
    (
      await stack.request(
        root,
        user,
        "POST",
        {},
        { "Idempotency-Key": id(), Origin: "https://foreign.invalid" },
      )
    ).status,
  ).toBe(403);
  expect((await stack.request(`${root}?cursor=a&cursor=b`, user)).status).toBe(400);
  expect((await stack.request(`${root}?cursor=bad-json`, user)).status).toBe(400);
  expect((await stack.request(`${root}?owner=${other.id}`, user)).status).toBe(400);
  await stack.sql.query("select public.account_export_invalidate($1)", [user.id]);
});
it("runs the real Node worker and downloads a complete owner archive with exact PDF bytes", async () => {
  const run = await request();
  await drain();
  expect((await list()).find((row) => row.id === run.id)?.status).toBe("ready");
  const response = await stack.request(`${root}/${run.id}/download`, owner);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-type")).toBe("application/zip");
  const files = await unzip(new Uint8Array(await response.arrayBuffer())),
    data = JSON.parse(files["account.json"].toString());
  expect(files[`files/${docId}/source.pdf`]).toEqual(pdf);
  expect(data.account.id).toBe(owner.id);
  expect(data.account.email).toBe(owner.email);
  expect(data.account.userMetadata.portabilityMarker).toBe("owned metadata");
  expect(data.account.identities[0].provider).toBe("email");
  expect(data.data.preferences[0].name).toBe("Owned portability name");
  expect(Object.keys(data.data)).toHaveLength(32);
  const text = JSON.stringify(data);
  for (const secret of [
    other.id,
    other.email,
    "Foreign private name",
    sourceKey,
    "private-request-hash",
    "upload_token_hash",
    "lease_token",
    "encrypted_password",
    "refresh_token",
  ])
    expect(text).not.toContain(secret);
  expect(data.files[0]).toEqual({
    path: `files/${docId}/source.pdf`,
    sha256: hash(pdf),
    byteCount: pdf.length,
  });
  expect(
    (await stack.sql.query("select payload from public.account_exports where id=$1", [run.id]))
      .rows[0].payload,
  ).toBeNull();
  const audit = await stack.sql.query(
    "select count(*)::int n from public.identity_audit where actor_id=$1 and resource_id=$2 and action='account.export_downloaded'",
    [owner.id, run.id],
  );
  expect(audit.rows[0].n).toBeGreaterThan(0);
});
it("invalidates ready copies immediately when a source is deleted and cleans the physical ZIP", async () => {
  const run = (await list()).find((row) => row.status === "ready")!;
  const before = await stack.sql.query(
    "select object_key from public.account_export_objects where export_id=$1",
    [run.id],
  );
  const deletion = await stack.request(`resumes/${docId}`, owner, "DELETE", {
    expectedRevision: 1,
  });
  expect(deletion.status).toBe(200);
  expect((await stack.request(`${root}/${run.id}/download`, owner)).status).toBe(404);
  expect((await list()).find((row) => row.id === run.id)?.status).toBe("invalidated");
  const janitor = new AccountExportJanitor(
    new SupabaseAccountExportCleanup(stack.privileged),
    new SupabaseAccountArchiveStorage(stack.privileged),
  );
  await janitor.tick(new AbortController().signal);
  expect(
    (
      await stack.privileged.storage
        .from("rolefoundry-account-exports")
        .download(before.rows[0].object_key)
    ).error,
  ).toBeTruthy();
});
it("rejects late publication after a privacy deletion and retains fenced cleanup for orphan writes", async () => {
  const user = await stack.member(),
    item = await source(user),
    run = await request(user),
    lease = await leaseFor(run.taskId),
    store = new SupabaseAccountExportExecution(stack.privileged),
    storage = new SupabaseAccountArchiveStorage(stack.privileged);
  await store.load(lease);
  const key = await store.prepare(lease);
  await stack.request(`resumes/${item.doc}`, user, "DELETE", { expectedRevision: 1 });
  await storage.put(key, Buffer.from("late unreachable archive"), new AbortController().signal);
  await expect(
    store.publish(lease, key, hash(Buffer.from("late unreachable archive")), 24),
  ).rejects.toMatchObject({ status: 409 });
  const registry = await stack.sql.query(
    "select purge_after>now() as guarded from public.account_export_objects where object_key=$1",
    [key],
  );
  expect(registry.rows[0].guarded).toBe(true);
  await stack.sql.query(
    "update public.account_export_objects set write_deadline=now()-interval '3 minutes',purge_after=now()-interval '1 second' where object_key=$1",
    [key],
  );
  await new AccountExportJanitor(new SupabaseAccountExportCleanup(stack.privileged), storage).tick(
    new AbortController().signal,
  );
  expect(
    (await stack.privileged.storage.from("rolefoundry-account-exports").download(key)).error,
  ).toBeTruthy();
});
it("cleans orphan archives after hard owner deletion with nullable owner linkage", async () => {
  const user = await stack.member(),
    run = await request(user);
  await drain();
  const keys = await stack.sql.query(
    "select object_key from public.account_export_objects where export_id=$1",
    [run.id],
  );
  expect(keys.rows).toHaveLength(1);
  const deleted = await stack.privileged.auth.admin.deleteUser(user.id);
  expect(deleted.error).toBeNull();
  retired.add(user.id);
  expect(
    (
      await stack.sql.query(
        "select user_id,export_id from public.account_export_objects where object_key=$1",
        [keys.rows[0].object_key],
      )
    ).rows[0],
  ).toEqual({ user_id: null, export_id: null });
  await new AccountExportJanitor(
    new SupabaseAccountExportCleanup(stack.privileged),
    new SupabaseAccountArchiveStorage(stack.privileged),
  ).tick(new AbortController().signal);
  expect(
    (
      await stack.privileged.storage
        .from("rolefoundry-account-exports")
        .download(keys.rows[0].object_key)
    ).error,
  ).toBeTruthy();
});
it("expires downloads, invalidates deactivated owners and blocks queued processing", async () => {
  const user = await stack.member(),
    run = await request(user);
  await drain();
  await stack.sql.query(
    "update public.account_exports set expires_at=now()-interval '1 second' where id=$1",
    [run.id],
  );
  expect((await stack.request(`${root}/${run.id}/download`, user)).status).toBe(404);
  expect((await list(user)).find((row) => row.id === run.id)?.status).toBe("expired");
  const next = await request(user),
    lease = await leaseFor(next.taskId);
  await stack.sql.query("select public.identity_deactivate_profile($1)", [user.id]);
  await expect(
    new SupabaseAccountExportExecution(stack.privileged).load(lease),
  ).rejects.toMatchObject({ status: 403 });
  expect((await stack.request(root, user)).status).toBe(403);
});
it("enforces the one-pending and three-per-day budgets without truncating requests", async () => {
  const user = await stack.member();
  for (let n = 0; n < 3; n++) {
    const run = await request(user);
    if (n === 0)
      expect(
        (await stack.request(root, user, "POST", {}, { "Idempotency-Key": id() })).status,
      ).toBe(409);
    await stack.sql.query("select public.account_export_invalidate($1)", [user.id]);
    expect(run.status).toBe("queued");
  }
  const response = await stack.request(root, user, "POST", {}, { "Idempotency-Key": id() });
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("RF_ACCOUNT_EXPORT_LIMIT");
  expect(await list(user)).toHaveLength(3);
});
it("fails a large file manifest atomically instead of exporting a partial file set", async () => {
  const user = await stack.member(),
    item = await source(user),
    version = id();
  await stack.sql.query(
    "insert into public.resume_versions(id,document_id,version,content,dictionary_version) values($1,$2,1,'{}',public.dictionary_current_version())",
    [version, item.doc],
  );
  const exportIds = Array.from({ length: 100 }, id);
  await stack.sql.query(
    "insert into public.tasks(id,user_id,kind,source_ref,input_version,idempotency_key,request_hash,status) select x,$2,'resume.export',x,'1',x::text,'fixture','succeeded' from unnest($1::uuid[]) x",
    [exportIds, user.id],
  );
  await stack.sql.query(
    "insert into public.resume_exports(id,document_id,version_id,task_id,request_key,request_hash,input_hash,object_key,sha256,byte_count) select x,$2::uuid,$3::uuid,x,x::text,'fixture','fixture',$4::text||'/'||($2::uuid)::text||'/exports/'||x::text||'/'||x::text||'.pdf',$5,1 from unnest($1::uuid[]) x",
    [exportIds, item.doc, version, user.id, hash(pdf)],
  );
  await stack.sql.query(
    "insert into public.resume_storage_objects(document_id,user_id,object_key,kind) select document_id,$2,object_key,'export' from public.resume_exports where id=any($1::uuid[])",
    [exportIds, user.id],
  );
  const response = await stack.request(root, user, "POST", {}, { "Idempotency-Key": id() });
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("RF_ACCOUNT_EXPORT_LIMIT");
  expect(await list(user)).toEqual([]);
  // These are registered synthetic references only; no 100 actual export objects were uploaded.
  await stack.sql.query(
    "delete from public.resume_storage_objects where document_id=$1 and kind='export'",
    [item.doc],
  );
});
it("removes one archive idempotently without granting cross-user cancellation", async () => {
  const user = await stack.member(),
    run = await request(user);
  expect((await stack.request(`${root}/${run.id}`, other, "DELETE", {})).status).toBe(404);
  const removed = await stack.request(`${root}/${run.id}`, user, "DELETE", {});
  expect(removed.status).toBe(200);
  expect((await removed.json()).data.status).toBe("invalidated");
  expect((await stack.request(`${root}/${run.id}`, user, "DELETE", {})).status).toBe(200);
  expect(
    (await stack.sql.query("select payload from public.account_exports where id=$1", [run.id]))
      .rows[0].payload,
  ).toBeNull();
  expect(
    (await stack.sql.query("select status from public.tasks where id=$1", [run.taskId])).rows[0]
      .status,
  ).toBe("failed");
});
it("paginates tied historical requests without duplicates or owner leakage", async () => {
  const user = await stack.member(),
    history = Array.from({ length: 25 }, id);
  await stack.sql.query(
    "insert into public.account_exports(id,user_id,request_key,created_at,expires_at) select x,$2,x::text,now()-interval '2 days',now()-interval '1 day' from unnest($1::uuid[]) x",
    [history, user.id],
  );
  const firstResponse = await stack.request(root, user),
    first = await firstResponse.json();
  expect(first.data).toHaveLength(20);
  expect(first.nextCursor).toBeTypeOf("string");
  const second = await (
    await stack.request(`${root}?cursor=${encodeURIComponent(first.nextCursor)}`, user)
  ).json();
  expect(second.data).toHaveLength(5);
  expect(second.nextCursor).toBeNull();
  const actual = [...first.data, ...second.data].map((row: { id: string }) => row.id);
  expect(new Set(actual)).toEqual(new Set(history));
});
it("supports private mobile request, polling, download and role-independent owner isolation", async () => {
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
    const panel = page.getByLabel("Your account data export", { exact: true });
    await panel.getByRole("button", { name: "Create private account export", exact: true }).click();
    await webExpect(panel).toContainText("Account archive · queued");
    await drain();
    await panel.getByRole("button", { name: "Refresh account exports", exact: true }).click();
    await webExpect(
      panel.getByRole("button", { name: "Download account archive", exact: true }),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download account archive", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^rolefoundry-account-/);
    await panel.evaluate((node) => node.scrollIntoView({ block: "start" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "docs/assets/account-export-mobile.png" });
    await panel.getByRole("button", { name: "Remove account archive", exact: true }).click();
    await webExpect(panel).toContainText("Account archive · invalidated");
    await webExpect(
      panel.getByRole("button", { name: "Download account archive", exact: true }),
    ).toHaveCount(0);
    await context.close();
  } finally {
    await browser.close();
  }
});
