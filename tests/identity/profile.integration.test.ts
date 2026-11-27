import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, expect as webExpect } from "@playwright/test";
import { initialWorkspace } from "../../src/lib/domain";

type Member = { id: string; email: string; client: SupabaseClient; cookie: string };
let env: Record<string, string>, sql: pg.Pool, privileged: SupabaseClient;
const members: Member[] = [];
const emails: string[] = [];
const origin = process.env.ROLEFOUNDRY_TEST_ORIGIN!;
const preferences = {
  name: "Taylor",
  track: "Engineering & data",
  workplaces: ["Remote"],
  weeklyHours: 6,
};
const claim = {
  source: "self-report",
  label: "Reporting work",
  context: "Used Python on an internal tool",
  observedAt: "2026-11-01T00:00:00Z",
  skills: ["python"],
  claimedLevel: 2,
};
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
async function request(
  path: string,
  member?: Member,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}/api/v1/${path}`, {
    method,
    headers: {
      ...(member ? { Cookie: member.cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function member(admin = false): Promise<Member> {
  const email = `rf-profile-${crypto.randomUUID()}@identity.test.invalid`;
  emails.push(email);
  await sql.query(
    "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),now()+interval '1 day')",
    [email],
  );
  const created = await privileged.auth.admin.createUser({ email, email_confirm: true });
  check(created.error);
  const link = await privileged.auth.admin.generateLink({ type: "magiclink", email });
  check(link.error);
  const code = link.data.properties!.email_otp;
  const response = await request("identity/verify", undefined, "POST", { email, code });
  expect(response.status).toBe(200);
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const second = await privileged.auth.admin.generateLink({ type: "magiclink", email });
  check(second.error);
  const verified = await client.auth.verifyOtp({
    email,
    token: second.data.properties!.email_otp,
    type: "email",
  });
  check(verified.error);
  const value = {
    id: created.data.user!.id,
    email,
    client,
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  };
  members.push(value);
  if (admin)
    await sql.query("update public.profiles set role='admin' where user_id=$1", [value.id]);
  return value;
}
async function add(owner: Member, revision = 0, evidence: Record<string, unknown> = claim) {
  const response = await request("evidence", owner, "POST", {
    expectedRevision: revision,
    evidence,
  });
  expect(response.status).toBe(201);
  return (await response.json()).data;
}
beforeAll(async () => {
  env = JSON.parse(await readFile(".local/identity-env.json", "utf8"));
  for (const url of [origin, env.API_URL, env.DB_URL])
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error("Local fixtures only.");
  sql = new pg.Pool({ connectionString: env.DB_URL, max: 12 });
  privileged = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});
afterAll(async () => {
  if (!sql) return;
  for (const user of members) {
    await sql.query("delete from public.identity_audit where actor_id=$1 or subject_id=$1", [
      user.id,
    ]);
    const result = await privileged.auth.admin.deleteUser(user.id);
    check(result.error);
  }
  await sql.query(
    "delete from public.invitations where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [emails],
  );
  await sql.query(
    "delete from public.identity_otp_requests where email_hash=any(select public.identity_email_hash(x) from unnest($1::text[]) x)",
    [emails],
  );
  await sql.end();
});

describe("module 02 through real session APIs and owner transactions", () => {
  it("starts empty, round-trips preferences and rejects anonymous or owner-spoofed writes", async () => {
    const owner = await member();
    const empty = await request("profile", owner);
    expect(empty.headers.get("cache-control")).toBe("no-store");
    expect((await empty.json()).data).toMatchObject({ name: "", revision: 0 });
    expect((await request("profile")).status).toBe(401);
    const saved = await request("profile", owner, "PATCH", { ...preferences, expectedRevision: 0 });
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ ...preferences, revision: 1 });
    expect(
      (
        await request("profile", owner, "PATCH", {
          ...preferences,
          expectedRevision: 1,
          userId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "profile",
          owner,
          "PATCH",
          { ...preferences, expectedRevision: 1 },
          { Origin: "https://other.invalid" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("profile", owner, "PATCH", {
          ...preferences,
          name: "x".repeat(9000),
          expectedRevision: 1,
        })
      ).status,
    ).toBe(413);
  });
  it("serializes concurrent preference edits and returns one conflict without lost updates", async () => {
    const owner = await member();
    const results = await Promise.all(
      ["First", "Second"].map((name) =>
        request("profile", owner, "PATCH", { ...preferences, name, expectedRevision: 0 }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = (await (await request("profile", owner)).json()).data;
    expect(current.revision).toBe(1);
    expect(["First", "Second"]).toContain(current.name);
    expect(
      (
        await sql.query(
          "select count(*)::int count from public.profile_change_outbox where user_id=$1",
          [owner.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("preserves immutable evidence history, source labels and optimistic versions", async () => {
    const owner = await member();
    const created = await add(owner);
    expect(created.evidence).toMatchObject({
      source: "self-report",
      reviewState: "unreviewed",
      claimedLevel: 2,
      version: 1,
    });
    const updated = await request(`evidence/${created.evidence.id}`, owner, "PATCH", {
      expectedRevision: 1,
      expectedVersion: 1,
      evidence: { ...claim, context: "A later context" },
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data).toMatchObject({ revision: 2, evidence: { version: 2 } });
    const history = (await (await request(`evidence/${created.evidence.id}`, owner)).json()).data;
    expect(history.map((v: { context: string }) => v.context)).toEqual([
      "A later context",
      claim.context,
    ]);
    expect(
      (
        await request(`evidence/${created.evidence.id}`, owner, "PATCH", {
          expectedRevision: 2,
          expectedVersion: 1,
          evidence: claim,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`evidence/${created.evidence.id}`, owner, "PATCH", {
          expectedRevision: 2,
          expectedVersion: 2,
          evidence: { ...claim, source: "portfolio-reference", url: "https://example.com" },
        })
      ).status,
    ).toBe(400);
  });
  it("accepts portfolio links as references only and never fetches their contents", async () => {
    const owner = await member();
    const evidence = {
      source: "portfolio-reference",
      label: "Private project reference",
      context: "Not reviewed",
      observedAt: claim.observedAt,
      skills: ["rag"],
      url: "https://no-network-request.test.invalid/project",
    };
    const created = await add(owner, 0, evidence);
    expect(created.evidence).toMatchObject({
      reviewState: "unreviewed",
      url: evidence.url,
      claimedLevel: null,
    });
    for (const url of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com/project",
    ])
      expect(
        (
          await request("evidence", owner, "POST", {
            expectedRevision: 1,
            evidence: { ...evidence, url },
          })
        ).status,
      ).toBe(400);
  });
  it("isolates current and historical evidence and child records even from administrators", async () => {
    const owner = await member();
    const other = await member(true);
    const created = await add(owner);
    for (const table of [
      "career_preferences",
      "evidence",
      "evidence_versions",
      "evidence_skill_links",
      "skill_claims",
      "portfolio_references",
    ]) {
      const result = await other.client.from(table).select("*");
      check(result.error);
      expect(result.data).toEqual([]);
    }
    for (const id of [created.evidence.id, crypto.randomUUID()]) {
      expect((await request(`evidence/${id}`, other)).status).toBe(404);
      expect(
        (
          await request(`evidence/${id}`, other, "DELETE", {
            expectedRevision: 0,
            expectedVersion: 1,
          })
        ).status,
      ).toBe(404);
    }
    const forged = await other.client
      .from("evidence")
      .insert({ user_id: other.id, source: "scenario" });
    expect(forged.error !== null).toBe(true);
    const mutated = await owner.client
      .from("evidence_versions")
      .update({ review_state: "scored" })
      .eq("id", created.evidence.versionId);
    expect(mutated.error !== null).toBe(true);
  });
  it("rejects unknown skills, course promotion, browser scores and direct privileged RPC calls", async () => {
    const owner = await member();
    for (const evidence of [
      { ...claim, skills: ["unknown"] },
      { ...claim, source: "course-completion" },
      { ...claim, source: "scenario" },
      { ...claim, reviewState: "scored" },
      { ...claim, sourceRef: crypto.randomUUID() },
    ])
      expect(
        (await request("evidence", owner, "POST", { expectedRevision: 0, evidence })).status,
      ).toBe(400);
    const direct = await owner.client.rpc("profile_create_evidence", {
      p_expected: 0,
      p_data: { ...claim, skills: ["unknown"] },
    });
    expect(direct.error?.message).toBe("RF_INVALID_INPUT");
    const privilegedCall = await owner.client.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: {},
    });
    expect(privilegedCall.error !== null).toBe(true);
    for (const name of ["profile_bump", "profile_put_version", "profile_evidence_json"]) {
      const result = await owner.client.rpc(name, {});
      expect(result.error !== null).toBe(true);
    }
    expect((await (await request("profile", owner)).json()).data.revision).toBe(0);
  });
  it("records idempotent server-authored scenario evidence with immutable rubric provenance", async () => {
    const owner = await member();
    const evidence = {
      source: "scenario",
      sourceRef: crypto.randomUUID(),
      sourceVersion: "question-3-v2",
      rubricVersion: "rubric-v4",
      outcome: "Incorrect in this scenario; review retrieval grounding.",
      label: "Grounding scenario",
      context: "A narrow observed response",
      observedAt: claim.observedAt,
      skills: ["rag"],
    };
    const first = await privileged.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: evidence,
    });
    check(first.error);
    expect(first.data.evidence).toMatchObject({
      source: "scenario",
      reviewState: "scored",
      rubricVersion: "rubric-v4",
      outcome: evidence.outcome,
    });
    const retry = await privileged.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: evidence,
    });
    check(retry.error);
    expect(retry.data.evidence.id).toBe(first.data.evidence.id);
    expect(retry.data.revision).toBe(1);
    const conflict = await privileged.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: { ...evidence, outcome: "Different" },
    });
    expect(conflict.error?.message).toBe("RF_CONFLICT");
    expect(
      (
        await request(`evidence/${first.data.evidence.id}`, owner, "PATCH", {
          expectedRevision: 1,
          expectedVersion: 1,
          evidence: claim,
        })
      ).status,
    ).toBe(403);
    const noRubric = await privileged.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: { ...evidence, sourceRef: crypto.randomUUID(), rubricVersion: null },
    });
    expect(noRubric.error?.message).toBe("RF_INVALID_INPUT");
  });
  it("deletes all evidence versions and child records and emits reference-only invalidation", async () => {
    const owner = await member();
    const created = await add(owner);
    const edit = await request(`evidence/${created.evidence.id}`, owner, "PATCH", {
      expectedRevision: 1,
      expectedVersion: 1,
      evidence: { ...claim, label: "Changed" },
    });
    expect(edit.status).toBe(200);
    const deleted = await request(`evidence/${created.evidence.id}`, owner, "DELETE", {
      expectedRevision: 2,
      expectedVersion: 2,
    });
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data.revision).toBe(3);
    const versions = await sql.query(
      "select count(*)::int count from public.evidence_versions where evidence_id=$1",
      [created.evidence.id],
    );
    expect(versions.rows[0].count).toBe(0);
    const { rows } = await sql.query(
      "select * from public.profile_change_outbox where user_id=$1 and kind='evidence.deleted'",
      [owner.id],
    );
    expect(rows[0].deleted_version_ids).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(claim.context);
    for (const table of ["evidence_skill_links", "skill_claims"]) {
      const result = await owner.client.from(table).select("*");
      check(result.error);
      expect(result.data).toEqual([]);
    }
    expect((await request(`evidence/${created.evidence.id}`, owner)).status).toBe(404);
  });
  it("imports reviewed demo preferences and claims once without accepting drafts or scored results", async () => {
    const owner = await member();
    const input = { expectedRevision: 0, preferences, skills: ["python", "sql"] };
    expect(
      (await request("profile/import", owner, "POST", { ...input, resume: "Private draft" }))
        .status,
    ).toBe(400);
    const imported = await request("profile/import", owner, "POST", input);
    expect(imported.status).toBe(201);
    expect((await imported.json()).data.revision).toBe(1);
    const evidence = (await (await request("evidence", owner)).json()).data;
    expect(evidence).toHaveLength(2);
    expect(
      evidence.every(
        (item: { source: string; reviewState: string }) =>
          item.source === "self-report" && item.reviewState === "unreviewed",
      ),
    ).toBe(true);
    expect((await request("profile/import", owner, "POST", input)).status).toBe(409);
  });
  it("paginates a stable revision, filters canonical skills and rejects stale or mismatched cursors", async () => {
    const owner = await member();
    for (let revision = 0; revision < 3; revision++)
      await add(owner, revision, { ...claim, label: `Claim ${revision}` });
    const first = await (await request("evidence?limit=2&skill=python", owner)).json();
    expect(first.data).toHaveLength(2);
    expect(typeof first.nextCursor).toBe("string");
    const next = await (
      await request(`evidence?limit=2&skill=python&cursor=${first.nextCursor}`, owner)
    ).json();
    expect(next.data).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.data, ...next.data].map((item) => item.id)).size).toBe(3);
    expect((await request(`evidence?skill=sql&cursor=${first.nextCursor}`, owner)).status).toBe(
      400,
    );
    expect((await request("evidence?cursor=malformed", owner)).status).toBe(400);
    await add(owner, 3);
    expect((await request(`evidence?skill=python&cursor=${first.nextCursor}`, owner)).status).toBe(
      409,
    );
    expect((await request("evidence?limit=1000", owner)).status).toBe(400);
  });
  it("blocks private profile access and trusted writes after deactivation", async () => {
    const owner = await member();
    await add(owner);
    const deactivated = await privileged.rpc("identity_deactivate_profile", { p_user: owner.id });
    check(deactivated.error);
    expect((await request("profile", owner)).status).toBe(403);
    const raw = await owner.client.from("evidence_versions").select("*");
    check(raw.error);
    expect(raw.data).toEqual([]);
    const written = await privileged.rpc("profile_record_internal_evidence", {
      p_user: owner.id,
      p_data: {},
    });
    expect(written.error?.message).toBe("RF_FORBIDDEN");
  });
  it("edits the private profile and evidence in a real mobile browser while keeping local drafts separate", async () => {
    const owner = await member();
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies(
        owner.cookie.split("; ").map((entry) => {
          const index = entry.indexOf("=");
          return {
            name: entry.slice(0, index),
            value: entry.slice(index + 1),
            url: origin,
            httpOnly: true,
            sameSite: "Lax" as const,
          };
        }),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (workspace) => localStorage.setItem("rolefoundry.workspace.v1", JSON.stringify(workspace)),
        { ...initialWorkspace, name: "Local-only name", resume: "Local-only resume" },
      );
      await page.goto(`${origin}/skills/`);
      await webExpect(page.getByLabel("Display name", { exact: true })).toHaveValue("");
      await page.getByLabel("Display name", { exact: true }).fill("Private Taylor");
      await page.getByRole("button", { name: "Save preferences", exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText("Preferences saved");
      await page.reload();
      await webExpect(page.getByLabel("Display name", { exact: true })).toHaveValue(
        "Private Taylor",
      );
      await page.getByRole("button", { name: "Add claim or reference", exact: true }).click();
      await page.getByLabel("Evidence label", { exact: true }).fill("A browser claim");
      await page.getByLabel("Context", { exact: true }).fill("Built a private reporting tool");
      await page.getByRole("checkbox", { name: "Python", exact: true }).check();
      await page.getByRole("button", { name: "Add evidence", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "A browser claim", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Edit evidence", exact: true }).click();
      await page.getByLabel("Context", { exact: true }).fill("More recent project context");
      await page.getByRole("button", { name: "Save evidence version", exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText("Evidence saved");
      await page.getByRole("button", { name: "View history", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "Evidence history", exact: true }),
      ).toBeVisible();
      await webExpect(page.locator(".profile-history")).toContainText(
        "Built a private reporting tool",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("rolefoundry.workspace.v1")!).resume,
        ),
      ).toBe("Local-only resume");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/profile-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Delete evidence", exact: true }).click();
      await page.getByRole("button", { name: "Confirm deletion", exact: true }).click();
      await webExpect(
        page.getByRole("heading", { name: "No evidence recorded yet", exact: true }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
  it("previews demo data and requires explicit browser approval before any import", async () => {
    const owner = await member();
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies(
        owner.cookie.split("; ").map((entry) => {
          const index = entry.indexOf("=");
          return {
            name: entry.slice(0, index),
            value: entry.slice(index + 1),
            url: origin,
            httpOnly: true,
            sameSite: "Lax" as const,
          };
        }),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.addInitScript(
        (workspace) => localStorage.setItem("rolefoundry.workspace.v1", JSON.stringify(workspace)),
        {
          ...initialWorkspace,
          name: "Reviewed demo name",
          resume: "Excluded resume",
          evidence: [{ skill: "python", source: "scenario", level: 3, updatedAt: "2026-11-01" }],
        },
      );
      await page.goto(`${origin}/skills/`);
      await webExpect(page.getByLabel("Display name", { exact: true })).toHaveValue("");
      expect((await (await request("profile", owner)).json()).data.revision).toBe(0);
      await page.getByRole("button", { name: "Preview demo import", exact: true }).click();
      await webExpect(page.getByText("Reviewed demo name", { exact: true })).toBeVisible();
      await webExpect(
        page.getByRole("button", { name: "Import reviewed data", exact: true }),
      ).toBeDisabled();
      expect((await (await request("evidence", owner)).json()).data).toHaveLength(0);
      await page
        .getByRole("checkbox", {
          name: "I approve uploading these preferences and self-reported skills to my account.",
        })
        .check();
      await page.getByRole("button", { name: "Import reviewed data", exact: true }).click();
      await webExpect(page.getByRole("status")).toContainText(
        "Reviewed demo preferences and skill claims imported",
      );
      await webExpect(page.getByLabel("Display name", { exact: true })).toHaveValue(
        "Reviewed demo name",
      );
      await webExpect(
        page.getByRole("button", { name: "Preview demo import", exact: true }),
      ).toHaveCount(0);
      const evidence = (await (await request("evidence", owner)).json()).data;
      expect(evidence).toHaveLength(initialWorkspace.knownSkills.length);
      expect(evidence.every((item: { source: string }) => item.source === "self-report")).toBe(
        true,
      );
      expect(JSON.stringify(evidence)).not.toContain("Excluded resume");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".local/profile-desktop.png",
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await browser.close();
    }
  });
});
