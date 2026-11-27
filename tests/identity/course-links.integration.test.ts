import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect as webExpect } from "@playwright/test";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { courseFields } from "../../src/modules/learning/model";
import {
  linkTargetSchema,
  type LinkTarget,
  type LinkPolicy,
} from "../../src/modules/course-links/model";
import { CourseLinkChecker } from "../../src/modules/course-links/service";
import {
  SafeCourseLinkProbe,
  type HeadNetwork,
} from "../../src/modules/course-links/adapters/head";
import { SupabaseCourseLinkStore } from "../../src/modules/course-links/adapters/supabase";
vi.mock("server-only", () => ({}));
let stack: LocalFixtures, admin: LocalMember, member: LocalMember;
const courses: string[] = [],
  sources: string[] = [],
  providers: string[] = [],
  hosts: string[] = [];
beforeAll(async () => {
  stack = await LocalFixtures.open();
  admin = await stack.member(true);
  member = await stack.member();
});
afterAll(async () => {
  if (!stack) return;
  await stack.sql.query("delete from public.course_link_checks where course_id=any($1::uuid[])", [
    courses,
  ]);
  await stack.sql.query("delete from public.course_link_hosts where hostname=any($1::text[])", [
    hosts,
  ]);
  await stack.sql.query(
    "delete from public.course_audit where actor_id=$1 or resource_id=any($2::uuid[])",
    [admin?.id, courses],
  );
  await stack.sql.query(
    "delete from public.course_skill_links where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courses],
  );
  await stack.sql.query(
    "delete from public.course_prerequisites where course_version_id in(select id from public.course_versions where course_id=any($1::uuid[]))",
    [courses],
  );
  await stack.sql.query("delete from public.course_url_registry where course_id=any($1::uuid[])", [
    courses,
  ]);
  await stack.sql.query("delete from public.course_versions where course_id=any($1::uuid[])", [
    courses,
  ]);
  await stack.sql.query("delete from public.courses where id=any($1::uuid[])", [courses]);
  await stack.sql.query(
    "delete from public.course_source_providers where source_id=any($1::uuid[])",
    [sources],
  );
  await stack.sql.query("delete from public.sources where id=any($1::uuid[])", [sources]);
  await stack.sql.query("delete from public.course_providers where id=any($1::text[])", [
    providers,
  ]);
  await stack.close();
});
async function fixture() {
  const id = crypto.randomUUID(),
    provider = `link-${id}`,
    host = `link-${id}.example.invalid`;
  providers.push(provider);
  hosts.push(host);
  await stack.sql.query(
    "insert into public.course_providers(id,name,allowed_hosts)values($1,'Owned fictional provider',$2)",
    [provider, [host]],
  );
  const response = await stack.request("admin/courses/sources", admin, "POST", {
    providerId: provider,
    name: provider,
    publisher: "Owned fixture",
    authorizationBasis: "Fictional metadata and injected HEAD transport only",
    rightsSummary: "No real provider request or offering",
    allowedHosts: [host],
    permittedFields: courseFields,
    isDemo: true,
  });
  expect(response.status).toBe(201);
  const sourceId = (await response.json()).data.id as string;
  sources.push(sourceId);
  const created = await stack.request("admin/courses", admin, "POST", {
    key: provider,
    providerId: provider,
    sourceId,
    title: "Fictional link-check course",
    url: `https://${host}/courses/owned/`,
    summary: "Owned metadata for lease and review tests",
    skills: ["content"],
    prerequisiteSkills: [],
    prerequisiteCourseIds: [],
    language: "en",
    difficulty: "Beginner",
    format: "Course",
    officialMinutes: 30,
    editorialMinutes: null,
    durationNote: "Fictional test duration",
    practice: {
      prompt: "Create an example",
      completionCriteria: "Keep reproducible evidence",
      minutes: 15,
    },
  });
  expect(created.status).toBe(201);
  const course = (await created.json()).data as { id: string; revision: number };
  courses.push(course.id);
  for (const action of ["review", "publish"]) {
    const changed = await stack.request(`admin/courses/${course.id}/transition`, admin, "POST", {
      expectedRevision: course.revision,
      action,
      reason: "Owned synthetic content review",
    });
    expect(changed.status).toBe(200);
    course.revision++;
  }
  return { course, policy: { sourceId, allowedHosts: [host] } satisfies LinkPolicy, host };
}
async function claim(policy: LinkPolicy) {
  const result = await stack.privileged.rpc("course_links_claim", {
    p_source: policy.sourceId,
    p_hosts: policy.allowedHosts,
  });
  expect(result.error).toBeNull();
  return result.data === null ? null : linkTargetSchema.parse(result.data);
}
function args(
  target: LinkTarget,
  reason = "ok",
  status = 200,
  wait: string | null = null,
  manual = false,
) {
  return {
    p_course: target.id,
    p_lease: target.lease,
    p_reason: reason,
    p_status: status,
    p_not_before: wait,
    p_manual: manual,
  };
}
async function complete(
  target: LinkTarget,
  reason = "ok",
  status = 200,
  wait: string | null = null,
  manual = false,
) {
  const result = await stack.privileged.rpc(
    "course_links_complete",
    args(target, reason, status, wait, manual),
  );
  expect(result.error).toBeNull();
  return result.data;
}
async function state(id: string) {
  return (
    await stack.sql.query(
      "select c.*,v.metadata from public.courses c join public.course_versions v on v.course_id=c.id and v.version=c.published_version where c.id=$1",
      [id],
    )
  ).rows[0];
}
it("denies raw/client claims and keeps administrator metadata and recovery role protected", async () => {
  const anonymous = createClient(stack.env.API_URL, stack.env.ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const client of [anonymous, member.client, admin.client]) {
    expect(
      (
        await client.rpc("course_links_claim", {
          p_source: crypto.randomUUID(),
          p_hosts: ["www.deeplearning.ai"],
        })
      ).error,
    ).toBeTruthy();
    expect(
      (
        await client.rpc(
          "course_links_complete",
          args({ id: crypto.randomUUID(), lease: crypto.randomUUID() } as LinkTarget),
        )
      ).error,
    ).toBeTruthy();
    for (const table of ["course_link_checks", "course_link_hosts"])
      expect((await client.from(table).select("*")).error).toBeTruthy();
  }
  for (const table of ["course_link_checks", "course_link_hosts"])
    expect((await stack.privileged.from(table).select("*")).error).toBeTruthy();
  expect((await stack.privileged.rpc("course_links_metrics")).error).toBeTruthy();
  expect((await stack.request("admin/courses/link-checks")).status).toBe(401);
  expect((await stack.request("admin/courses/link-checks", member)).status).toBe(403);
  expect((await stack.request("admin/courses/link-checks?cursor=bad", admin)).status).toBe(400);
  expect((await stack.request("admin/courses/link-checks?cursor=x&cursor=y", admin)).status).toBe(
    400,
  );
});
it("shares host admission across concurrent instances and rejects forged/duplicate results", async () => {
  const { policy, course } = await fixture();
  const granted = await Promise.all([claim(policy), claim(policy)]),
    target = granted.find(Boolean)!;
  expect(granted.filter(Boolean)).toHaveLength(1);
  expect(await complete({ ...target, lease: crypto.randomUUID() })).toBe(false);
  expect(
    (await stack.privileged.rpc("course_links_complete", args(target, admin.email, 200))).error,
  ).toBeTruthy();
  const before = await state(course.id);
  expect(await complete(target)).toBe(true);
  expect(await complete(target)).toBe(false);
  const after = await state(course.id);
  expect(after.last_reviewed_at).toEqual(before.last_reviewed_at);
  expect(after.metadata).toEqual(before.metadata);
  expect(after.revision).toBe(before.revision);
  expect(await claim(policy)).toBeNull();
});
it("reclaims expired leases without allowing a late worker to overwrite a new observation", async () => {
  const { policy, host } = await fixture(),
    old = (await claim(policy))!;
  await stack.sql.query(
    "update public.course_link_checks set lease_expires_at=now()-interval '1 second' where course_id=$1",
    [old.id],
  );
  await stack.sql.query(
    "update public.course_link_hosts set next_probe_at=now()-interval '1 second' where hostname=$1",
    [host],
  );
  const replacement = (await claim(policy))!;
  expect(replacement.lease).not.toBe(old.lease);
  expect(await complete(old, "not-found", 404)).toBe(false);
  expect(await complete(replacement)).toBe(true);
});
it("runs the real checker/store against an injected HEAD transport and preserves immutable content", async () => {
  const { policy, course } = await fixture(),
    before = await state(course.id);
  const transport: HeadNetwork = {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    head: vi.fn(async () => ({ status: 404 })),
    now: () => Date.now(),
  };
  const checker = new CourseLinkChecker(
    new SupabaseCourseLinkStore(stack.privileged),
    new SafeCourseLinkProbe(transport),
    [policy],
  );
  expect(await checker.tick(new AbortController().signal)).toBe(1);
  const after = await state(course.id);
  expect(after.availability).toBe("uncertain");
  expect(after.retired).toBe(false);
  expect(after.metadata).toEqual(before.metadata);
  expect(after.published_version).toBe(before.published_version);
  expect(after.last_reviewed_at).toEqual(before.last_reviewed_at);
  expect((await stack.request(`courses/${course.id}`)).status).toBe(200);
  const snapshot = await stack.privileged.rpc("telemetry_snapshot");
  expect(snapshot.error).toBeNull();
  expect(snapshot.data.courseLinks.uncertain).toBeGreaterThan(0);
  const audit = await stack.sql.query(
    "select reason from public.course_audit where resource_id=$1 and action='course.link_uncertain'",
    [course.id],
  );
  expect(audit.rows[0].reason).not.toContain(policy.allowedHosts[0]);
});
it("discards results after source withdrawal, retirement or a human revision", async () => {
  for (const change of ["source", "retire", "confirmed_active"]) {
    const { policy, course } = await fixture(),
      target = (await claim(policy))!;
    const response =
      change === "source"
        ? await stack.request(`admin/courses/sources/${policy.sourceId}/status`, admin, "POST", {
            status: "revoked",
            reason: "Owned revocation",
          })
        : await stack.request(`admin/courses/${course.id}/transition`, admin, "POST", {
            expectedRevision: course.revision,
            action: change,
            reason: "Owned intervening review",
          });
    expect(response.status).toBe(200);
    expect(await complete(target, "not-found", 404)).toBe(false);
    const row = await stack.sql.query(
      "select checked_at,lease_token from public.course_link_checks where course_id=$1",
      [course.id],
    );
    expect(row.rows[0]).toEqual({ checked_at: null, lease_token: null });
    if (change !== "retire") expect((await state(course.id)).availability).toBe("available");
  }
});
it("persists provider waits across human revisions and permits audited manual-pause recovery without shortening them", async () => {
  const { policy, course, host } = await fixture(),
    target = (await claim(policy))!,
    notBefore = new Date(Date.now() + 90000 * 1000).toISOString();
  expect(await complete(target, "rate-limit", 429, notBefore, true)).toBe(true);
  const current = await state(course.id);
  expect(
    (
      await stack.request(`admin/courses/${course.id}/transition`, admin, "POST", {
        expectedRevision: Number(current.revision),
        action: "confirmed_active",
        reason: "Owned editorial check",
      })
    ).status,
  ).toBe(200);
  expect(await claim(policy)).toBeNull();
  const listing = await stack.request("admin/courses/link-checks", admin),
    data = (await listing.json()).data;
  const limit = data.hosts.find((value: { host: string }) => value.host === host);
  expect(limit.manualPause).toBe(true);
  const body = {
    host,
    expectedRevision: limit.revision,
    reason: "Reviewed unsupported provider wait",
  };
  expect(
    (await stack.request("admin/courses/link-checks/resume", member, "POST", body)).status,
  ).toBe(403);
  expect(
    (
      await stack.request("admin/courses/link-checks/resume", admin, "POST", {
        ...body,
        expectedRevision: limit.revision + 1,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await stack.request("admin/courses/link-checks/resume", admin, "POST", body, {
        Origin: "https://evil.invalid",
      })
    ).status,
  ).toBe(403);
  expect(
    (await stack.request("admin/courses/link-checks/resume", admin, "POST", body)).status,
  ).toBe(200);
  expect(await claim(policy)).toBeNull();
  const after = await stack.sql.query(
    "select manual_pause,next_probe_at from public.course_link_hosts where hostname=$1",
    [host],
  );
  expect(after.rows[0].manual_pause).toBe(false);
  expect(after.rows[0].next_probe_at.getTime()).toBeGreaterThanOrEqual(Date.parse(notBefore));
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.course_audit where actor_id=$1 and action='course.links_resume'",
        [admin.id],
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
});
it("shows private course observations on mobile and clears the panel on access loss", async () => {
  const { policy } = await fixture(),
    target = (await claim(policy))!;
  await complete(target, "unsupported", 405);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.context().addCookies(
      admin.cookie.split("; ").map((value) => {
        const at = value.indexOf("=");
        return { name: value.slice(0, at), value: value.slice(at + 1), url: stack.origin };
      }),
    );
    await page.goto(`${stack.origin}/admin/`);
    await page.locator('details[aria-label="Course link observations"] > summary').click();
    await webExpect(page.getByRole("region", { name: "Course link observations" })).toBeVisible();
    await webExpect(
      page.getByText("Status check unsupported (405)", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: ".local/course-links-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: ".local/course-links-desktop.png", fullPage: true });
    await stack.sql.query("update public.profiles set role='member' where user_id=$1", [admin.id]);
    await page.getByRole("button", { name: "Refresh link observations" }).click();
    await webExpect(page.getByRole("region", { name: "Course link observations" })).toHaveCount(0);
  } finally {
    await stack.sql.query("update public.profiles set role='admin' where user_id=$1", [admin.id]);
    await browser.close();
  }
});
it("paginates bounded course and host observations without duplicates or hidden trailing records", async () => {
  const { course, policy } = await fixture(),
    base = await state(course.id),
    expected: string[] = [],
    expectedHosts: string[] = [];
  for (let index = 0; index < 51; index++) {
    const id = crypto.randomUUID(),
      version = crypto.randomUUID(),
      host = `page-${crypto.randomUUID()}.example.invalid`;
    courses.push(id);
    hosts.push(host);
    expected.push(id);
    expectedHosts.push(host);
    await stack.sql.query(
      "insert into public.courses(id,provider_id,canonical_key,published_version,stage,availability,last_reviewed_at)values($1,$2,$3,1,'published','available',now())",
      [id, base.provider_id, `owned-page-${id}`],
    );
    await stack.sql.query(
      "insert into public.course_versions(id,course_id,version,source_id,metadata,dictionary_version)values($1,$2,1,$3,$4,public.dictionary_current_version())",
      [version, id, policy.sourceId, base.metadata],
    );
    await stack.sql.query(
      "insert into public.course_link_checks(course_id,version_id,course_revision,allowed_hosts)values($1,$2,1,$3)",
      [id, version, policy.allowedHosts],
    );
    await stack.sql.query("insert into public.course_link_hosts(hostname)values($1)", [host]);
  }
  for (const kind of ["checks", "hosts"] as const) {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const key = kind === "checks" ? "cursor" : "hostCursor";
      const response = await stack.request(
        `admin/courses/link-checks${cursor ? `?${key}=${encodeURIComponent(cursor)}` : ""}`,
        admin,
      );
      expect(response.status).toBe(200);
      const data = (await response.json()).data;
      expect(data[kind].length).toBeLessThanOrEqual(50);
      seen.push(
        ...data[kind].map((row: { id: string; host: string }) =>
          kind === "checks" ? row.id : row.host,
        ),
      );
      cursor = kind === "checks" ? data.nextCursor : data.nextHostCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect((kind === "checks" ? expected : expectedHosts).every((id) => seen.includes(id))).toBe(
      true,
    );
  }
});
