import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, expect as browserExpect } from "@playwright/test";
import { resolveActor, assertAuthorized, utcWeekStart } from "../../src/modules/identity/core";

type Fixture = { id: string; email: string; client: SupabaseClient };
let env: Record<string, string>, sql: pg.Pool, service: SupabaseClient, admin: Fixture;
const fixtures: Fixture[] = [];
const emails: string[] = [];
const origin = process.env.ROLEFOUNDRY_TEST_ORIGIN!;
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
function freshClient() {
  return createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function fixture(
  options: { activate?: boolean; admin?: boolean; spoofRole?: boolean } = {},
): Promise<Fixture> {
  const email = `rf-${crypto.randomUUID()}@identity.test.invalid`;
  emails.push(email);
  await sql.query(
    "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),now()+interval '1 day')",
    [email],
  );
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: options.spoofRole ? "admin" : "member" },
  });
  fail(created.error);
  const client = freshClient();
  const link = await service.auth.admin.generateLink({ type: "magiclink", email });
  fail(link.error);
  const verified = await client.auth.verifyOtp({
    email,
    token: link.data.properties!.email_otp,
    type: "email",
  });
  fail(verified.error);
  const result = { id: created.data.user!.id, email, client };
  fixtures.push(result);
  if (options.activate !== false) {
    const active = await client.rpc("identity_activate");
    fail(active.error);
  }
  if (options.admin)
    await sql.query("update public.profiles set role='admin' where user_id=$1", [result.id]);
  return result;
}
async function grant(member: Fixture, purpose = "assessment") {
  const { rows } = await sql.query("select version from public.consent_policies where purpose=$1", [
    purpose,
  ]);
  const result = await member.client.rpc("identity_grant_consent", {
    p_purpose: purpose,
    p_policy_version: rows[0].version,
  });
  fail(result.error);
  return result.data;
}
async function reserve(
  member: Fixture,
  feature = "assessment",
  key = crypto.randomUUID(),
  resource = crypto.randomUUID(),
  version = "v1",
) {
  return service.rpc("identity_reserve_analysis", {
    p_user: member.id,
    p_feature: feature,
    p_resource_ref: resource,
    p_input_version: version,
    p_idempotency_key: key,
  });
}
async function task(member: Fixture, feature = "assessment") {
  const result = await reserve(member, feature);
  fail(result.error);
  return result.data.taskId as string;
}
async function call(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; requestOrigin?: string } = {},
) {
  return fetch(`${origin}/api/v1/identity/${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json", Origin: options.requestOrigin || origin }
        : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}
async function cookieFor(member: Fixture) {
  const link = await service.auth.admin.generateLink({ type: "magiclink", email: member.email });
  fail(link.error);
  const response = await call("verify", {
    method: "POST",
    body: { email: member.email, code: link.data.properties!.email_otp },
  });
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  return { cookie: cookies.map((value) => value.split(";")[0]).join("; "), cookies };
}
async function receivedCode(email: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(
      `${env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const list = await response.json();
    const message = list.messages?.find((item: { To: { Address: string }[] }) =>
      item.To.some((to) => to.Address === email),
    );
    if (message) {
      const body = await (await fetch(`${env.MAILPIT_URL}/api/v1/message/${message.ID}`)).json();
      const code = `${body.Text || ""} ${body.HTML || ""}`.match(/\b\d{6}\b/)?.[0];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The local test mailbox did not receive a sign-in code.");
}
beforeAll(async () => {
  env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  for (const key of ["API_URL", "DB_URL", "MAILPIT_URL"])
    expect(["localhost", "127.0.0.1"]).toContain(new URL(env[key]).hostname);
  if (!origin || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
    throw new Error("Run through scripts/test-identity.mjs against the local stack only.");
  sql = new pg.Pool({ connectionString: env.DB_URL, max: 16 });
  service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  admin = await fixture({ admin: true });
});
afterAll(async () => {
  if (!sql) return;
  const owned = await sql.query("select id from auth.users where email=any($1::text[])", [emails]);
  const ids = owned.rows.map((row) => row.id as string);
  await sql.query("delete from public.quota_policies where created_by=any($1::uuid[])", [ids]);
  await sql.query(
    "delete from public.identity_audit where actor_id=any($1::uuid[]) or subject_id=any($1::uuid[])",
    [ids],
  );
  for (const id of ids) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error && !result.error.message.includes("not found"))
      throw new Error("Unable to remove a local fixture user.");
  }
  await sql.query(
    "delete from public.invitations where email_hash=any(select public.identity_email_hash(unnest($1::text[])))",
    [emails],
  );
  await sql.query(
    "delete from public.identity_otp_requests where email_hash=any(select public.identity_email_hash(unnest($1::text[])))",
    [emails],
  );
  await sql.end();
});

describe.sequential("module 01 against real local Auth, PostgREST and PostgreSQL", () => {
  it("redeems an invitation once under concurrent sign-in and ignores metadata roles", async () => {
    const member = await fixture({ activate: false, spoofRole: true });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => member.client.rpc("identity_activate")),
    );
    expect(results.every((result) => !result.error && result.data.role === "member")).toBe(true);
    const used = await sql.query(
      "select count(*)::int n from public.identity_audit where subject_id=$1 and action='invitation.redeemed'",
      [member.id],
    );
    expect(used.rows[0].n).toBe(1);
    const actor = await resolveActor(member.client);
    expect(actor.role).toBe("member");
    expect(() => assertAuthorized(actor, "catalog:write")).toThrow();
    const duplicate = await admin.client.rpc("identity_create_invitation", {
      p_email: member.email,
      p_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(duplicate.error?.message).toBe("RF_CONFLICT");
  });
  it("blocks uninvited direct Auth signup and expired invitations", async () => {
    const email = `rf-${crypto.randomUUID()}@identity.test.invalid`;
    emails.push(email);
    const direct = await freshClient().auth.signInWithOtp({ email });
    expect(Boolean(direct.error)).toBe(true);
    const uninvited = await sql.query("select count(*)::int n from auth.users where email=$1", [
      email,
    ]);
    expect(uninvited.rows[0].n).toBe(0);
    const pending = await fixture({ activate: false });
    await sql.query(
      "update public.invitations set expires_at=now()-interval '1 second' where email_hash=public.identity_email_hash($1)",
      [pending.email],
    );
    const denied = await pending.client.rpc("identity_activate");
    expect(denied.error?.message).toBe("RF_INVITATION_REQUIRED");
    const state = await sql.query(
      "select used_at from public.invitations where email_hash=public.identity_email_hash($1)",
      [pending.email],
    );
    expect(state.rows[0].used_at).toBeNull();
  });
  it("enforces owner RLS and prevents direct role writes or status enumeration", async () => {
    const first = await fixture(),
      second = await fixture();
    const visible = await first.client.from("profiles").select("user_id");
    fail(visible.error);
    expect(visible.data?.map((row) => row.user_id)).toEqual([first.id]);
    const other = await admin.client.from("profiles").select("user_id").eq("user_id", second.id);
    fail(other.error);
    expect(other.data).toEqual([]);
    const spoof = await first.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("user_id", first.id);
    expect(Boolean(spoof.error)).toBe(true);
    const status = await first.client.rpc("identity_is_active", { p_user: second.id });
    fail(status.error);
    expect(status.data).toBe(false);
    const invite = await first.client.rpc("identity_create_invitation", {
      p_email: "someone@identity.test.invalid",
      p_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(invite.error?.message).toBe("RF_FORBIDDEN");
  });
  it("reserves at most three assessments under twelve concurrent requests, atomically", async () => {
    const member = await fixture();
    await grant(member);
    const results = await Promise.all(Array.from({ length: 12 }, () => reserve(member)));
    expect(results.filter((result) => !result.error)).toHaveLength(3);
    expect(results.filter((result) => result.error?.message === "RF_QUOTA_EXCEEDED")).toHaveLength(
      9,
    );
    const rows = await sql.query(
      "select (select count(*)::int from public.identity_tasks where user_id=$1) tasks, (select count(*)::int from public.usage_reservations where user_id=$1) reservations, (select count(*)::int from public.identity_task_outbox o join public.identity_tasks t on t.id=o.task_id where t.user_id=$1) messages",
      [member.id],
    );
    expect(rows.rows[0]).toEqual({ tasks: 3, reservations: 3, messages: 3 });
    await grant(member, "resume");
    const resumes = await Promise.all(Array.from({ length: 8 }, () => reserve(member, "resume")));
    expect(resumes.filter((result) => !result.error)).toHaveLength(5);
    expect(resumes.filter((result) => result.error?.message === "RF_QUOTA_EXCEEDED")).toHaveLength(
      3,
    );
  });
  it("reuses concurrent idempotency keys and rejects a changed payload without extra usage", async () => {
    const member = await fixture();
    await grant(member);
    const key = crypto.randomUUID(),
      resource = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserve(member, "assessment", key, resource)),
    );
    expect(results.every((result) => !result.error)).toBe(true);
    expect(new Set(results.map((result) => result.data.taskId)).size).toBe(1);
    const conflict = await reserve(member, "assessment", key, resource, "v2");
    expect(conflict.error?.message).toBe("RF_CONFLICT");
    const count = await sql.query(
      "select count(*)::int n from public.usage_reservations where user_id=$1",
      [member.id],
    );
    expect(count.rows[0].n).toBe(1);
  });
  it("requires current, purpose-specific consent and invalidates outdated policy versions", async () => {
    const member = await fixture();
    expect((await reserve(member)).error?.message).toBe("RF_CONSENT_REQUIRED");
    await grant(member, "resume");
    expect((await reserve(member)).error?.message).toBe("RF_CONSENT_REQUIRED");
    const outdated = await member.client.rpc("identity_grant_consent", {
      p_purpose: "assessment",
      p_policy_version: "outdated",
    });
    expect(outdated.error?.message).toBe("RF_CONSENT_VERSION");
    await grant(member);
    const id = await task(member);
    const { rows } = await sql.query(
      "select version from public.consent_policies where purpose='assessment'",
    );
    try {
      await sql.query(
        "update public.consent_policies set version='test-new-policy' where purpose='assessment'",
      );
      const start = await service.rpc("identity_start_task", { p_task: id });
      fail(start.error);
      expect(start.data.status).toBe("failed");
      expect((await reserve(member)).error?.message).toBe("RF_CONSENT_REQUIRED");
      const state = await sql.query(
        "select state from public.usage_reservations where task_id=$1",
        [id],
      );
      expect(state.rows[0].state).toBe("released");
    } finally {
      await sql.query("update public.consent_policies set version=$1 where purpose='assessment'", [
        rows[0].version,
      ]);
    }
  });
  it("releases unstarted work but never publishes a result after consent revocation", async () => {
    const member = await fixture();
    await grant(member);
    const queued = await task(member),
      running = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: running })).error);
    fail((await member.client.rpc("identity_revoke_consent", { p_purpose: "assessment" })).error);
    const finished = await service.rpc("identity_finish_task", {
      p_task: running,
      p_result_ref: crypto.randomUUID(),
    });
    fail(finished.error);
    expect(finished.data.status).toBe("failed");
    const authorized = await service.rpc("identity_task_authorized", { p_task: running });
    fail(authorized.error);
    expect(authorized.data).toBe(false);
    const rows = await sql.query(
      "select task_id,state from public.usage_reservations where task_id=any($1::uuid[]) order by state",
      [[queued, running]],
    );
    expect(rows.rows.find((row) => row.task_id === queued)?.state).toBe("released");
    expect(rows.rows.find((row) => row.task_id === running)?.state).toBe("consumed");
    const result = await sql.query("select result_ref from public.identity_tasks where id=$1", [
      running,
    ]);
    expect(result.rows[0].result_ref).toBeNull();
  });
  it("distinguishes cancellation from an audited infrastructure refund and prevents double credit", async () => {
    const member = await fixture();
    await grant(member);
    const queued = await task(member);
    fail((await service.rpc("identity_release_reservation", { p_task: queued })).error);
    fail((await service.rpc("identity_release_reservation", { p_task: queued })).error);
    const running = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: running })).error);
    expect(
      (await service.rpc("identity_release_reservation", { p_task: running })).error?.message,
    ).toBe("RF_CONFLICT");
    fail(
      (await service.rpc("identity_fail_task", { p_task: running, p_category: "infrastructure" }))
        .error,
    );
    expect(
      (
        await member.client.rpc("identity_refund_reservation", {
          p_task: running,
          p_reason: "test failure",
        })
      ).error?.message,
    ).toBe("RF_FORBIDDEN");
    fail(
      (
        await admin.client.rpc("identity_refund_reservation", {
          p_task: running,
          p_reason: "Verified local infrastructure failure",
        })
      ).error,
    );
    expect(
      (
        await admin.client.rpc("identity_refund_reservation", {
          p_task: running,
          p_reason: "Repeated refund",
        })
      ).error?.message,
    ).toBe("RF_CONFLICT");
    const audit = await sql.query(
      "select count(*)::int n from public.identity_audit where resource_id=$1 and action='quota.refunded'",
      [running],
    );
    expect(audit.rows[0].n).toBe(1);
    const usage = await member.client.rpc("identity_usage");
    fail(usage.error);
    expect(
      usage.data.find((item: { feature: string }) => item.feature === "assessment").consumed,
    ).toBe(0);
    const invalid = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: invalid })).error);
    fail(
      (await service.rpc("identity_fail_task", { p_task: invalid, p_category: "validation" }))
        .error,
    );
    expect(
      (
        await admin.client.rpc("identity_refund_reservation", {
          p_task: invalid,
          p_reason: "Not an infrastructure failure",
        })
      ).error?.message,
    ).toBe("RF_CONFLICT");
  });
  it("uses UTC Monday boundaries and schedules new policies without rewriting old usage", async () => {
    const times = ["2026-11-15T23:59:59.999Z", "2026-11-16T00:00:00Z", "2027-01-01T00:00:00Z"];
    for (const time of times) {
      const result = await sql.query("select public.identity_week_start($1::timestamptz) t", [
        time,
      ]);
      expect(result.rows[0].t.toISOString()).toBe(utcWeekStart(new Date(time)).toISOString());
    }
    const member = await fixture();
    await grant(member);
    const id = await task(member);
    const next = new Date(utcWeekStart(new Date()).getTime() + 7 * 86400000).toISOString();
    fail(
      (
        await admin.client.rpc("identity_set_quota_policy", {
          p_feature: "assessment",
          p_weekly_limit: 1,
          p_effective_from: next,
        })
      ).error,
    );
    fail(
      (
        await admin.client.rpc("identity_set_quota_policy", {
          p_feature: "assessment",
          p_weekly_limit: 2,
          p_effective_from: next,
        })
      ).error,
    );
    const current = await member.client.rpc("identity_usage");
    fail(current.error);
    expect(
      current.data.find((item: { feature: string }) => item.feature === "assessment").limit,
    ).toBe(3);
    const snapshot = await sql.query(
      "select limit_snapshot from public.usage_reservations where task_id=$1",
      [id],
    );
    expect(snapshot.rows[0].limit_snapshot).toBe(3);
    const past = await admin.client.rpc("identity_set_quota_policy", {
      p_feature: "assessment",
      p_weekly_limit: 1,
      p_effective_from: utcWeekStart(new Date()).toISOString(),
    });
    expect(past.error?.message).toBe("RF_INVALID_INPUT");
    await sql.query(
      "update public.usage_reservations set period_start=period_start-interval '7 days' where task_id=$1",
      [id],
    );
    const fresh = await member.client.rpc("identity_usage");
    fail(fresh.error);
    expect(
      fresh.data.find((item: { feature: string }) => item.feature === "assessment").reserved,
    ).toBe(0);
  });
  it("does not allow browser roles to reserve or execute worker tasks", async () => {
    const member = await fixture();
    await grant(member);
    const id = await task(member);
    const reserveDenied = await member.client.rpc("identity_reserve_analysis", {
      p_user: member.id,
      p_feature: "assessment",
      p_resource_ref: crypto.randomUUID(),
      p_input_version: "v1",
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(reserveDenied.error?.code).toBe("42501");
    const startDenied = await member.client.rpc("identity_start_task", { p_task: id });
    expect(startDenied.error?.code).toBe("42501");
    const other = await fixture();
    const privateTask = await other.client.from("identity_tasks").select("id").eq("id", id);
    fail(privateTask.error);
    expect(privateTask.data).toEqual([]);
  });
  it("invalidates queued/running work on deactivation and rejects deleted-owner publication", async () => {
    const member = await fixture();
    await grant(member);
    const id = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: id })).error);
    fail((await service.rpc("identity_deactivate_profile", { p_user: member.id })).error);
    const finish = await service.rpc("identity_finish_task", {
      p_task: id,
      p_result_ref: crypto.randomUUID(),
    });
    fail(finish.error);
    expect(finish.data.status).toBe("failed");
    expect((await member.client.rpc("identity_current_actor")).error?.message).toBe("RF_FORBIDDEN");
    const privateRows = await member.client.from("usage_reservations").select("id");
    fail(privateRows.error);
    expect(privateRows.data).toEqual([]);
    const deleted = await fixture();
    await grant(deleted);
    const deletedTask = await task(deleted);
    fail((await service.auth.admin.deleteUser(deleted.id)).error);
    const denied = await service.rpc("identity_finish_task", {
      p_task: deletedTask,
      p_result_ref: crypto.randomUUID(),
    });
    expect(denied.error?.message).toBe("RF_NOT_FOUND");
  });
  it("serializes revocation against result publication", async () => {
    const member = await fixture();
    await grant(member);
    const id = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: id })).error);
    const results = await Promise.all([
      member.client.rpc("identity_revoke_consent", { p_purpose: "assessment" }),
      service.rpc("identity_finish_task", { p_task: id, p_result_ref: crypto.randomUUID() }),
    ]);
    results.forEach((result) => fail(result.error));
    const state = await sql.query(
      "select t.status,t.result_ref,t.finished_at,c.revoked_at from public.identity_tasks t join public.consents c on c.id=t.consent_id where t.id=$1",
      [id],
    );
    if (state.rows[0].status === "succeeded")
      expect(state.rows[0].finished_at.getTime()).toBeLessThanOrEqual(
        state.rows[0].revoked_at.getTime(),
      );
    else expect(state.rows[0].result_ref).toBeNull();
  });
  it("returns uniform sign-in responses, rejects cross-origin writes and expires invalid sessions", async () => {
    const member = await fixture();
    const eligible = await call("signin", { method: "POST", body: { email: member.email } });
    const absent = await call("signin", {
      method: "POST",
      body: { email: `missing-${crypto.randomUUID()}@identity.test.invalid` },
    });
    expect(eligible.status).toBe(202);
    expect(absent.status).toBe(202);
    expect(await eligible.json()).toEqual(await absent.json());
    const denied = await call("signin", {
      method: "POST",
      body: { email: member.email },
      requestOrigin: "https://untrusted.invalid",
    });
    expect(denied.status).toBe(403);
    expect((await call("session")).status).toBe(401);
    expect(
      (await call("session", { cookie: "sb-127-auth-token=base64-invalid-expired-session" }))
        .status,
    ).toBe(401);
    const suppliedRole = await call("verify", {
      method: "POST",
      body: { email: member.email, code: "123456", role: "admin" },
    });
    expect(suppliedRole.status).toBe(400);
  });
  it("verifies real Auth cookies, current roles and private-resource non-disclosure through HTTP", async () => {
    const member = await fixture({ spoofRole: true }),
      other = await fixture();
    await grant(other);
    const id = await task(other);
    const auth = await cookieFor(member);
    expect(
      auth.cookies.every(
        (cookie) =>
          cookie.toLowerCase().includes("httponly") &&
          cookie.toLowerCase().includes("samesite=lax"),
      ),
    ).toBe(true);
    const session = await call("session", { cookie: auth.cookie });
    expect(session.status).toBe(200);
    expect((await session.json()).data.role).toBe("member");
    expect(session.headers.get("cache-control")).toBe("no-store");
    expect((await call(`tasks/${id}`, { cookie: auth.cookie })).status).toBe(404);
    expect((await call(`tasks/${crypto.randomUUID()}`, { cookie: auth.cookie })).status).toBe(404);
    const invite = await call("admin/invitations", {
      method: "POST",
      cookie: auth.cookie,
      body: {
        email: "not-admin@identity.test.invalid",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });
    expect(invite.status).toBe(403);
    fail((await service.rpc("identity_deactivate_profile", { p_user: member.id })).error);
    expect((await call("consents", { cookie: auth.cookie })).status).toBe(403);
  });
  it("provides real admin invitation/refund endpoints and rejects oversized request bodies", async () => {
    const auth = await cookieFor(admin);
    const email = `rf-${crypto.randomUUID()}@identity.test.invalid`;
    emails.push(email);
    const response = await call("admin/invitations", {
      method: "POST",
      cookie: auth.cookie,
      body: { email, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    });
    expect(response.status).toBe(201);
    const member = await fixture();
    await grant(member);
    const id = await task(member);
    fail((await service.rpc("identity_start_task", { p_task: id })).error);
    fail(
      (await service.rpc("identity_fail_task", { p_task: id, p_category: "infrastructure" })).error,
    );
    const refunded = await call("admin/refunds", {
      method: "POST",
      cookie: auth.cookie,
      body: { taskId: id, reason: "Verified infrastructure failure through the admin API" },
    });
    expect(refunded.status).toBe(200);
    const large = await call("consents", {
      method: "POST",
      cookie: auth.cookie,
      body: { purpose: "resume", policyVersion: "x".repeat(9000) },
    });
    expect(large.status).toBe(413);
  });
  it("completes email delivery, browser sign-in, consent, usage and logout without cloud credentials", async () => {
    // A genuinely new invitation: no generated link or prior OTP to trigger a resend limit.
    const email = `rf-${crypto.randomUUID()}@identity.test.invalid`;
    emails.push(email);
    await sql.query(
      "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),now()+interval '1 day')",
      [email],
    );
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${origin}/account/`);
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Send sign-in code" }).click();
      const code = await receivedCode(email);
      await page.getByLabel("Sign-in code", { exact: true }).fill(code);
      await page.getByRole("button", { name: "Verify and sign in" }).click();
      await browserExpect(
        page.getByRole("heading", { name: "Signed in as a member" }),
      ).toBeVisible();
      await page.getByRole("heading", { name: "Signed in as a member" }).waitFor();
      await page.getByRole("button", { name: "I agree to this policy" }).first().click();
      await page.getByRole("button", { name: "Revoke permission", exact: true }).waitFor();
      expect(await page.locator(".account-usage .stat-card").count()).toBe(2);
      expect(await page.getByRole("heading", { name: "Administrator controls" }).count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole("button", { name: "Revoke permission", exact: true }).click();
      await page.getByRole("button", { name: "I agree to this policy" }).first().waitFor();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("heading", { name: "Sign in with an invitation." }).waitFor();
      expect((await page.request.get(`${origin}/api/v1/identity/session`)).status()).toBe(401);
    } finally {
      await browser.close();
    }
  });
  it("keeps public job and course browsing available without a session", async () => {
    expect((await fetch(`${origin}/jobs/`)).status).toBe(200);
    expect((await fetch(`${origin}/learning/`)).status).toBe(200);
  });
  it("never embeds the service-role credential in browser assets", async () => {
    const files = await readdir(".next/static", { recursive: true });
    for (const file of files.filter((path) => /\.(js|map)$/.test(path))) {
      const content = await readFile(`.next/static/${file}`, "utf8");
      expect(content.includes(env.SERVICE_ROLE_KEY)).toBe(false);
    }
  });
});
