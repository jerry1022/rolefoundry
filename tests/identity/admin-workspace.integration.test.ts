import { beforeAll, afterAll, it, expect } from "vitest";
import { chromium, expect as webExpect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { utcWeekStart } from "../../src/modules/identity/core";
const id = () => crypto.randomUUID(),
  prefix = `hub-${id()}`,
  skill = `${prefix}-skill`,
  invites: string[] = [],
  emails: string[] = [],
  quotas: string[] = [],
  orphans: string[] = [],
  questions: string[] = [],
  rubrics: string[] = [];
let stack: LocalFixtures, admin: LocalMember, member: LocalMember;
const invitations = "identity/admin/invitations",
  quotaPolicies = "identity/admin/quota-policies";
async function data(response: Response, status = 200) {
  expect(response.status).toBe(status);
  return (await response.json()).data;
}
async function invite(email = `${prefix}-${id()}@identity.test.invalid`) {
  emails.push(email);
  const receipt = await data(
    await stack.request(invitations, admin, "POST", {
      email,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
    201,
  );
  invites.push(receipt.id);
  return { ...receipt, email };
}
async function quotaDate() {
  let date = utcWeekStart(new Date("2092-01-01T00:00:00Z"));
  for (let i = 0; i < 10000; i++) {
    date = new Date(date.getTime() + 7 * 86400000);
    if (
      !(
        await stack.sql.query(
          "select 1 from public.quota_policies where feature='assessment' and effective_from=$1",
          [date.toISOString()],
        )
      ).rowCount
    )
      return date.toISOString().slice(0, 10);
  }
  throw Error("No owned future quota fixture date available.");
}
async function cookie(page: Page, user: LocalMember = admin) {
  await page.context().addCookies(
    user.cookie.split("; ").map((pair) => {
      const at = pair.indexOf("=");
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: stack.origin };
    }),
  );
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
  const rubric = await data(
    await stack.request("admin/assessments/rubrics", admin, "POST", {
      key: `${prefix}-private`,
      version: 1,
      description: "Owned access-loss fixture rubric",
    }),
    201,
  );
  rubrics.push(rubric.id);
  const question = await data(
    await stack.request("admin/assessments/questions", admin, "POST", {
      key: `${prefix}-private`,
      version: 1,
      track: "Engineering & data",
      skillId: "python",
      rubricId: rubric.id,
      prompt: `${prefix} private fixture question`,
      options: ["Measured evidence", "Unsupported guess"],
      correctIndex: 0,
      explanation: `${prefix} private answer context`,
    }),
    201,
  );
  questions.push(question.id);
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((user) => user.id);
  const ownedQuestions = (
    await stack.sql.query("select id from public.question_versions where key like $1", [
      `${prefix}%`,
    ])
  ).rows.map((row) => row.id);
  const ownedRubrics = (
    await stack.sql.query("select id from public.rubric_versions where key like $1", [`${prefix}%`])
  ).rows.map((row) => row.id);
  await stack.sql.query(
    "delete from public.question_publications where question_version_id=any($1::uuid[])",
    [ownedQuestions],
  );
  await stack.sql.query("delete from public.question_versions where id=any($1::uuid[])", [
    ownedQuestions,
  ]);
  await stack.sql.query("delete from public.rubric_versions where id=any($1::uuid[])", [
    ownedRubrics,
  ]);
  for (const orphan of orphans)
    expect((await stack.privileged.auth.admin.deleteUser(orphan)).error).toBeNull();
  await stack.sql.query(
    "delete from public.invitations where id=any($1::uuid[]) or email_hash=any(select public.identity_email_hash(x) from unnest($2::text[]) x)",
    [invites, emails],
  );
  await stack.sql.query(
    "delete from public.quota_policies where id=any($1::bigint[]) and created_by=any($2::uuid[])",
    [quotas, users],
  );
  for (const table of ["identity_audit", "assessment_audit", "dictionary_audit", "catalog_audit"])
    await stack.sql.query(`delete from public.${table} where actor_id=any($1::uuid[])`, [users]);
  const connection = await stack.sql.connect();
  try {
    await connection.query("begin");
    await connection.query(
      "select pg_advisory_xact_lock(hashtextextended('catalog:write',0)),pg_advisory_xact_lock(hashtextextended('dictionary:write',0))",
    );
    await connection.query("delete from public.skill_aliases where skill_id=$1", [skill]);
    await connection.query("delete from public.skill_relations where parent_id=$1 or child_id=$1", [
      skill,
    ]);
    await connection.query("delete from public.track_skills where skill_id=$1", [skill]);
    const removed = await connection.query("delete from public.skills where id=$1", [skill]);
    if (removed.rowCount) {
      await connection.query(
        "with bumped as(update public.dictionary_state set version=version+1 returning version) insert into public.dictionary_versions(version,snapshot) select version,public.dictionary_snapshot() from bumped",
      );
      await connection.query("update public.catalog_state set revision=revision+1");
    }
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
  await stack.close();
});
it("denies anonymous/member directory reads, raw identity tables, revocation and spoofed inputs", async () => {
  const original = await invite();
  expect((await stack.request(invitations)).status).toBe(401);
  for (const path of [invitations, quotaPolicies])
    expect((await stack.request(path, member)).status).toBe(403);
  expect(
    (await stack.request(`${invitations}/${original.id}/revoke`, member, "POST", {})).status,
  ).toBe(403);
  expect(
    (
      await stack.request(
        `${invitations}/${original.id}/revoke`,
        admin,
        "POST",
        {},
        { Origin: "https://other.invalid" },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await stack.request(`${invitations}/${original.id}/revoke`, admin, "POST", {
        actorId: admin.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (await stack.request(`${invitations}/${original.id}/revoke?ignored=1`, admin, "POST", {}))
      .status,
  ).toBe(400);
  for (const [name, args] of [
    ["identity_admin_invitations", {}],
    ["identity_admin_quota_policies", {}],
    ["identity_revoke_invitation", { p_id: original.id }],
  ] as const)
    expect((await member.client.rpc(name, args)).error).toBeTruthy();
  for (const table of ["invitations", "quota_policies"])
    expect((await admin.client.from(table).select("*")).error).toBeTruthy();
  for (const suffix of ["?cursor=bad", "?cursor=a&cursor=b", "?email=private"])
    expect((await stack.request(invitations + suffix, admin)).status).toBe(400);
});
it("paginates tied invitation records without returning contact hashes, user IDs or browser authority", async () => {
  const own = Array.from({ length: 25 }, () => id()),
    contacts = own.map((value) => `${prefix}-${value}@identity.test.invalid`);
  invites.push(...own);
  emails.push(...contacts);
  await stack.sql.query(
    "insert into public.invitations(id,email_hash,expires_at,created_at,issued_by) select x,public.identity_email_hash(e),clock_timestamp()+interval '1 day',date_trunc('second',clock_timestamp())+interval '100 years',$3 from unnest($1::uuid[],$2::text[]) t(x,e)",
    [own, contacts, admin.id],
  );
  const one = await stack.request(invitations, admin);
  expect(one.status).toBe(200);
  expect(one.headers.get("cache-control")).toContain("no-store");
  const first = await one.json();
  expect(first.data).toHaveLength(20);
  const second = await (
    await stack.request(`${invitations}?cursor=${encodeURIComponent(first.nextCursor)}`, admin)
  ).json();
  const ids = [...first.data, ...second.data].map((row) => row.id);
  expect(own.every((value) => ids.includes(value))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  const text = JSON.stringify(first);
  for (const value of [admin.id, member.id, ...contacts]) expect(text).not.toContain(value);
  expect(text).not.toContain("email_hash");
  expect(text).not.toContain("issued_by");
  const hash = (await stack.sql.query("select public.identity_email_hash($1) hash", [contacts[0]]))
    .rows[0].hash;
  expect(text).not.toContain(hash);
  expect(
    (await stack.request(`${quotaPolicies}?cursor=${encodeURIComponent(first.nextCursor)}`, admin))
      .status,
  ).toBe(400);
});
it("preserves exact bigint quota identifiers and audits bounded reads", async () => {
  const base = 9007199254740992n + BigInt(randomBytes(4).readUInt32BE()) * 100n;
  let date = new Date((await quotaDate()) + "T00:00:00Z");
  const own: string[] = [];
  for (let i = 0; i < 25; i++) {
    const value = (base + BigInt(i)).toString();
    while (
      (
        await stack.sql.query(
          "select 1 from public.quota_policies where feature='assessment' and effective_from=$1",
          [date.toISOString()],
        )
      ).rowCount
    )
      date = new Date(date.getTime() + 7 * 86400000);
    await stack.sql.query(
      "insert into public.quota_policies(id,feature,effective_from,weekly_limit,created_by) overriding system value values($1,'assessment',$2,3,$3)",
      [value, date.toISOString(), admin.id],
    );
    quotas.push(value);
    own.push(value);
    date = new Date(date.getTime() + 7 * 86400000);
  }
  const first = await (await stack.request(quotaPolicies, admin)).json();
  expect(first.data).toHaveLength(20);
  expect(first.data.every((row: { id: unknown }) => typeof row.id === "string")).toBe(true);
  const second = await (
    await stack.request(`${quotaPolicies}?cursor=${encodeURIComponent(first.nextCursor)}`, admin)
  ).json();
  expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(
    first.data.length + second.data.length,
  );
  expect(
    own.every((value) => [...first.data, ...second.data].some((row) => row.id === value)),
  ).toBe(true);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.identity_audit where actor_id=$1 and action in ('invitations.listed','quota.policies.listed')",
        [admin.id],
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
});
it("revokes an unused invitation idempotently and rejects activation with an already issued OTP", async () => {
  const original = await invite();
  const created = await stack.privileged.auth.admin.createUser({
    email: original.email,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  orphans.push(created.data.user!.id);
  const link = await stack.privileged.auth.admin.generateLink({
    type: "magiclink",
    email: original.email,
  });
  expect(link.error).toBeNull();
  for (let i = 0; i < 2; i++)
    expect(
      (await stack.request(`${invitations}/${original.id}/revoke`, admin, "POST", {})).status,
    ).toBe(200);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.identity_audit where action='invitation.revoked' and resource_id=$1",
        [original.id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await stack.request("identity/verify", undefined, "POST", {
        email: original.email,
        code: link.data.properties!.email_otp,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await stack.sql.query("select 1 from public.profiles where user_id=$1", [
        created.data.user!.id,
      ])
    ).rowCount,
  ).toBe(0);
  const redeemed = (
    await stack.sql.query("select id from public.invitations where used_by=$1", [member.id])
  ).rows[0].id;
  expect((await stack.request(`${invitations}/${redeemed}/revoke`, admin, "POST", {})).status).toBe(
    409,
  );
});
it("keeps anonymous and member administration free of private editors and bank reads", async () => {
  const browser = await chromium.launch();
  try {
    for (const actor of [undefined, member]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      if (actor) await cookie(page, actor);
      const privateCalls: string[] = [];
      page.on("request", (request) => {
        if (/\/api\/v1\/(admin\/assessments|identity\/admin)/.test(request.url()))
          privateCalls.push(request.url());
      });
      await page.goto(`${stack.origin}/admin/`);
      await webExpect(
        page.getByText("Administration requires a current administrator session.", {
          exact: false,
        }),
      ).toBeVisible();
      await webExpect(page.getByLabel("Skills and aliases", { exact: true })).toHaveCount(0);
      expect(privateCalls).toEqual([]);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
it("authors dictionary concepts and reviewed question versions through the consolidated desktop workspace", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await cookie(page);
    let bankReads = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/admin/assessments")) bankReads++;
    });
    await page.goto(`${stack.origin}/admin/`);
    const dictionary = page.getByLabel("Skills and aliases", { exact: true });
    await webExpect(dictionary).toBeVisible();
    expect(bankReads).toBe(0);
    await dictionary.locator("summary").click();
    await dictionary.getByRole("button", { name: "Add canonical skill", exact: true }).click();
    await dictionary.getByLabel("Stable skill ID", { exact: true }).fill(skill);
    await dictionary.getByLabel("English name", { exact: true }).fill(`${prefix} reviewed concept`);
    await dictionary
      .getByLabel("Traditional Chinese name", { exact: true })
      .fill("整合管理測試概念");
    await dictionary
      .getByLabel("Skill change reason", { exact: true })
      .fill("Owned synthetic workspace acceptance");
    await dictionary.getByRole("button", { name: "Publish new skill", exact: true }).click();
    await webExpect(dictionary.getByRole("status")).toContainText("Dictionary version published");
    expect(await page.locator("h1").count()).toBe(1);
    await dictionary.locator("summary").click();
    const bank = page.getByLabel("Assessment questions and rubrics", { exact: true });
    await bank.locator("summary").click();
    await bank.getByLabel("Rubric key", { exact: true }).fill(prefix);
    await bank
      .getByLabel("Rubric description", { exact: true })
      .fill("Synthetic consolidated review rubric");
    await bank.getByRole("button", { name: "Create rubric version", exact: true }).click();
    await webExpect(bank.getByRole("status")).toContainText("Question bank change saved");
    const rubric = (
      await stack.sql.query("select id from public.rubric_versions where key=$1", [prefix])
    ).rows[0].id;
    rubrics.push(rubric);
    await bank.getByLabel("Question key", { exact: true }).fill(prefix);
    await bank.getByLabel("Question skill", { exact: true }).selectOption(skill);
    await bank.getByLabel("Question rubric", { exact: true }).selectOption(rubric);
    await bank.getByLabel("Question prompt", { exact: true }).fill(`${prefix} measured scenario`);
    await bank
      .getByLabel("Question options", { exact: true })
      .fill("Measure the result\nGuess without evidence");
    await bank.getByLabel("Correct answer", { exact: true }).selectOption("0");
    await bank
      .getByLabel("Question explanation", { exact: true })
      .fill(`${prefix} authored feedback`);
    await bank.getByRole("button", { name: "Create draft question", exact: true }).click();
    const question = bank
      .locator(".assessment-question")
      .filter({ hasText: `${prefix} measured scenario` });
    await webExpect(question).toBeVisible();
    const questionId = (
      await stack.sql.query("select id from public.question_versions where key=$1", [prefix])
    ).rows[0].id;
    questions.push(questionId);
    await bank
      .getByLabel("Question review reason", { exact: true })
      .fill("Synthetic reviewed content");
    await question.getByRole("button", { name: "Review question version", exact: true }).click();
    await webExpect(question).toContainText("Reviewed for selection");
    await question.getByRole("button", { name: "Retire question version", exact: true }).click();
    await webExpect(question).toContainText("Draft or retired");
    await bank.locator("summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/assets/admin-workspace-desktop.png" });
  } finally {
    await browser.close();
  }
});
it("manages invitations, future quotas and eligible refunds on mobile with shared account controls", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    await cookie(page);
    await page.goto(`${stack.origin}/admin/`);
    const panel = page.getByLabel("Invitations and allowances", { exact: true });
    await panel.locator("summary").click();
    const email = `${prefix}-mobile@identity.test.invalid`;
    emails.push(email);
    await panel.getByLabel("Invite email", { exact: true }).fill(email);
    await panel.getByRole("button", { name: "Add invitation", exact: true }).click();
    await webExpect(panel.getByRole("status")).toContainText("Invitation");
    const invitation = (
      await stack.sql.query(
        "select id from public.invitations where email_hash=public.identity_email_hash($1)",
        [email],
      )
    ).rows[0].id;
    invites.push(invitation);
    await webExpect(
      panel.getByRole("button", { name: "Add invitation", exact: true }),
    ).toBeEnabled();
    for (
      let count = 0;
      count < 5 &&
      (await panel
        .getByRole("button", { name: `Revoke unused invitation ${invitation}`, exact: true })
        .count()) === 0;
      count++
    ) {
      await panel.getByRole("button", { name: "Load older invitations", exact: true }).click();
      await webExpect(
        panel.getByRole("button", { name: "Add invitation", exact: true }),
      ).toBeEnabled();
    }
    await panel
      .getByRole("button", { name: `Revoke unused invitation ${invitation}`, exact: true })
      .click();
    await webExpect(panel.getByRole("status")).toContainText("Unused invitation revoked");
    const monday = await quotaDate();
    await panel.getByLabel("Effective Monday (UTC)", { exact: true }).fill(monday);
    await panel.getByLabel("Weekly limit", { exact: true }).fill("4");
    await panel.getByRole("button", { name: "Schedule quota", exact: true }).click();
    await webExpect(panel.getByRole("status")).toContainText("Quota policy scheduled");
    quotas.push(
      (
        await stack.sql.query(
          "select id::text id from public.quota_policies where created_by=$1 and effective_from=$2",
          [admin.id, `${monday}T00:00:00Z`],
        )
      ).rows[0].id,
    );
    const version = (
      await stack.sql.query(
        "select version from public.consent_policies where purpose='assessment'",
      )
    ).rows[0].version;
    expect(
      (
        await member.client.rpc("identity_grant_consent", {
          p_purpose: "assessment",
          p_policy_version: version,
        })
      ).error,
    ).toBeNull();
    const reserved = await stack.privileged.rpc("identity_reserve_analysis", {
      p_user: member.id,
      p_feature: "assessment",
      p_resource_ref: id(),
      p_input_version: "owned-fixture",
      p_idempotency_key: id(),
    });
    expect(reserved.error).toBeNull();
    expect(
      (await stack.privileged.rpc("identity_start_task", { p_task: reserved.data.taskId })).error,
    ).toBeNull();
    expect(
      (
        await stack.privileged.rpc("identity_fail_task", {
          p_task: reserved.data.taskId,
          p_category: "infrastructure",
        })
      ).error,
    ).toBeNull();
    await panel.getByLabel("Task ID", { exact: true }).fill(reserved.data.taskId);
    await panel
      .getByLabel("Refund reason", { exact: true })
      .fill("Owned synthetic infrastructure recovery");
    await panel.getByRole("button", { name: "Record audited refund", exact: true }).click();
    await webExpect(panel.getByRole("status")).toContainText("refund was recorded");
    expect(
      (
        await stack.sql.query("select state from public.usage_reservations where task_id=$1", [
          reserved.data.taskId,
        ])
      ).rows[0].state,
    ).toBe("refunded");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel
      .getByRole("heading", { name: "Administrator controls", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/assets/admin-workspace-mobile.png" });
    await page.goto(`${stack.origin}/account/`);
    await webExpect(page.getByLabel("Identity administration", { exact: true })).toBeVisible();
  } finally {
    await browser.close();
  }
});
it("clears every mounted private editor after role revocation", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    await cookie(page);
    await page.goto(`${stack.origin}/admin/`);
    const bank = page.getByLabel("Assessment questions and rubrics", { exact: true });
    await bank.locator("summary").click();
    await webExpect(
      bank.getByText(`${prefix} private answer context`, { exact: true }),
    ).toBeVisible();
    await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
    try {
      await bank.getByLabel("Rubric key", { exact: true }).fill(`${prefix}-denied`);
      await bank
        .getByLabel("Rubric description", { exact: true })
        .fill("No mutation after role loss");
      await bank.getByRole("button", { name: "Create rubric version", exact: true }).click();
      await webExpect(
        page.getByText("Administration requires a current administrator session.", {
          exact: false,
        }),
      ).toBeVisible();
      await webExpect(
        page.getByText(`${prefix} private answer context`, { exact: true }),
      ).toHaveCount(0);
      await webExpect(page.getByLabel("Invitations and allowances", { exact: true })).toHaveCount(
        0,
      );
    } finally {
      await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
    }
  } finally {
    await browser.close();
  }
});
it("discards a delayed private bank reply after closing its editor and losing administrator access", async () => {
  const browser = await chromium.launch();
  let release = () => {};
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    await cookie(page);
    await page.goto(`${stack.origin}/admin/`);
    let captured!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      loaded = new Promise<void>((resolve) => {
        captured = resolve;
      });
    await page.route("**/api/v1/admin/assessments", async (route) => {
      const response = await route.fetch();
      captured();
      await held;
      await route.fulfill({ response });
    });
    const bank = page.getByLabel("Assessment questions and rubrics", { exact: true });
    await bank.locator("summary").click();
    await Promise.race([
      loaded,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Private bank request was not captured")), 8000),
      ),
    ]);
    await bank.locator("summary").click();
    await webExpect(
      bank.getByRole("heading", { name: "Question bank administration", exact: true }),
    ).toHaveCount(0);
    await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
    try {
      await page
        .getByLabel("Invitations and allowances", { exact: true })
        .locator("summary")
        .click();
      await webExpect(
        page.getByText("Administration requires a current administrator session.", {
          exact: false,
        }),
      ).toBeVisible();
      const delivered = page.waitForResponse((response) =>
        response.url().endsWith("/api/v1/admin/assessments"),
      );
      release();
      await delivered;
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
      );
      await webExpect(
        page.getByText(`${prefix} private answer context`, { exact: true }),
      ).toHaveCount(0);
      await webExpect(page.getByLabel("Skills and aliases", { exact: true })).toHaveCount(0);
    } finally {
      release();
      await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
    }
  } finally {
    release();
    await browser.close();
  }
});
