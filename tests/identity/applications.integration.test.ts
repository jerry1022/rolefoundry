import { beforeAll, afterAll, it, expect } from "vitest";
import { chromium, expect as webExpect, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { publicationFields } from "../../src/modules/jobs/model";
import {
  applicationSchema,
  applicationPageSchema,
  eventPageSchema,
  type Application,
} from "../../src/modules/applications/model";
const id = () => crypto.randomUUID(),
  prefix = `rf-tracker-${id()}`;
let stack: LocalFixtures,
  owner: LocalMember,
  other: LocalMember,
  admin: LocalMember,
  sourceId: string,
  jobId: string,
  alternateId: string;
const jobs: string[] = [];
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
async function createJob(suffix: string) {
  const response = await stack.request("admin/catalog/jobs", admin, "POST", {
    job: {
      canonicalKey: `${prefix}-${suffix}`,
      company: prefix,
      title: `Authored role ${suffix}`,
      track: "Engineering & data",
      specialization: "ai-llm-applications",
      location: null,
      workplace: null,
      level: null,
      salary: null,
      summary: "Synthetic opening for tracker tests",
      responsibilities: [],
      requirements: [
        { text: "Authored Python requirement", priority: "mandatory", skills: ["python"] },
      ],
      conditions: { workAuthorization: null, education: null, experienceYears: null },
      expiresAt: null,
    },
    source: { sourceId, externalId: suffix, url: `https://jobs.test.invalid/${prefix}/${suffix}` },
  });
  expect(response.status).toBe(201);
  let job = (await response.json()).data;
  jobs.push(job.id);
  for (const status of ["review", "published"]) {
    const result = await stack.request(`admin/catalog/jobs/${job.id}/status`, admin, "POST", {
      expectedRevision: job.revision,
      status,
    });
    expect(result.status).toBe(200);
    job = (await result.json()).data;
  }
  return job.id as string;
}
async function find(applicationId: string, user = owner) {
  const result = await stack.request(`applications/${applicationId}`, user);
  expect(result.status).toBe(200);
  return applicationSchema.parse((await result.json()).data);
}
async function track(job = jobId, user = owner, key = id()) {
  const result = await stack.request(
    "applications",
    user,
    "POST",
    { jobId: job },
    { "Idempotency-Key": key },
  );
  expect(result.status).toBe(201);
  return applicationSchema.parse((await result.json()).data);
}
function fields(app: Application, changes: Record<string, unknown> = {}) {
  return {
    expectedRevision: app.revision,
    stage: app.stage,
    note: app.note,
    resumeVersionId: app.resume?.id ?? null,
    confirmationReference: app.confirmationReference,
    ...changes,
  };
}
async function edit(app: Application, changes: Record<string, unknown> = {}, user = owner) {
  const result = await stack.request(`applications/${app.id}`, user, "PATCH", fields(app, changes));
  expect(result.status).toBe(200);
  return applicationSchema.parse((await result.json()).data);
}
async function fresh(job = jobId, user = owner) {
  const old = await track(job, user);
  if (old.stage !== "Closed") await edit(old, { stage: "Closed" }, user);
  const closed = await find(old.id, user);
  const response = await stack.request(
    `applications/${closed.id}/new-cycle`,
    user,
    "POST",
    { expectedRevision: closed.revision },
    { "Idempotency-Key": id() },
  );
  expect(response.status).toBe(201);
  return applicationSchema.parse((await response.json()).data);
}
async function worker() {
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
      reject(Error("Owned tracker fixture worker exceeded deadline."));
    }, 25000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Owned tracker worker failed."));
    });
  });
}
async function resume(user = owner) {
  const response = await stack.request(
    "resumes/paste",
    user,
    "POST",
    { text: `${prefix}\nAuthored resume source` },
    { "Idempotency-Key": id() },
  );
  expect(response.status).toBe(202);
  const documentId = (await response.json()).data.documentId;
  await worker();
  const document = (await (await stack.request(`resumes/${documentId}`, user)).json()).data;
  const fact = id();
  const confirm = await stack.request(`resumes/${documentId}/confirm`, user, "POST", {
    expectedRevision: document.revision,
    content: {
      facts: [
        {
          id: fact,
          text: "Building an authored project.",
          kind: "project",
          state: "in-progress",
          skillIds: [],
          sourceBlockId: null,
        },
      ],
      sections: [{ id: id(), heading: "Projects", factIds: [fact] }],
    },
  });
  expect(confirm.status).toBe(200);
  return (await confirm.json()).data;
}
async function browserContext(browser: Browser, user?: LocalMember) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Taipei",
  });
  if (user)
    await context.addCookies(
      user.cookie.split("; ").map((cookie) => {
        const separator = cookie.indexOf("=");
        return {
          name: cookie.slice(0, separator),
          value: cookie.slice(separator + 1),
          url: stack.origin,
          httpOnly: true,
          sameSite: "Lax" as const,
        };
      }),
    );
  return context;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  owner = await stack.member();
  other = await stack.member();
  admin = await stack.member(true);
  const result = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Authored fixtures",
    authorizationBasis: "Synthetic test metadata",
    rightsSummary: "Fictional opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(result.status).toBe(201);
  sourceId = (await result.json()).data.id;
  jobId = await createJob("primary");
  alternateId = await createJob("alternate");
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((user) => user.id);
  await stack.sql.query("delete from public.bookmarks where user_id=any($1::uuid[])", [users]);
  const objects = await stack.sql.query(
    "select object_key from public.resume_storage_objects where user_id=any($1::uuid[])",
    [users],
  );
  if (objects.rows.length)
    checked(
      (
        await stack.privileged.storage
          .from("rolefoundry-resumes")
          .remove(objects.rows.map((row) => row.object_key))
      ).error,
    );
  await stack.sql.query("delete from public.resume_storage_objects where user_id=any($1::uuid[])", [
    users,
  ]);
  await stack.sql.query("delete from public.applications where user_id=any($1::uuid[])", [users]);
  await stack.sql.query("delete from public.application_audit where actor_id=any($1::uuid[])", [
    users,
  ]);
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
    [users],
  );
  await stack.sql.query("delete from public.resume_documents where user_id=any($1::uuid[])", [
    users,
  ]);
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[])))",
    [jobs],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=any($1::uuid[]))",
    [jobs],
  );
  await stack.sql.query("delete from public.job_sources where job_id=any($1::uuid[])", [jobs]);
  await stack.sql.query("delete from public.job_versions where job_id=any($1::uuid[])", [jobs]);
  await stack.sql.query("delete from public.jobs where id=any($1::uuid[])", [jobs]);
  await stack.sql.query("delete from public.sources where id=$1", [sourceId]);
  await stack.sql.query("delete from public.companies where name=$1", [prefix]);
  await stack.close();
});
it("concurrently tracks once as Saved, with an immutable snapshot and no submission side effects", async () => {
  const key = id();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      stack.request("applications", owner, "POST", { jobId }, { "Idempotency-Key": key }),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
  const records = await Promise.all(
    responses.map(async (response) => applicationSchema.parse((await response.json()).data)),
  );
  expect(new Set(records.map((record) => record.id)).size).toBe(1);
  expect(records[0].stage).toBe("Saved");
  expect(records[0].cycle).toBe(1);
  expect(records[0].sources[0].isDemo).toBe(true);
  expect((await track()).id).toBe(records[0].id);
  expect(
    (
      await stack.sql.query(
        "select count(*)::int n from public.application_events where application_id=$1",
        [records[0].id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await stack.request(
        "applications",
        owner,
        "POST",
        { jobId: alternateId },
        { "Idempotency-Key": key },
      )
    ).status,
  ).toBe(409);
});
it("rejects anonymous, cross-owner, raw-table and producer/helper bypasses", async () => {
  const app = await track();
  await expect(
    stack.sql.query(
      "update public.application_events set stage='Applied' where application_id=$1",
      [app.id],
    ),
  ).rejects.toMatchObject({ message: "RF_IMMUTABLE" });
  await expect(
    stack.sql.query("update public.applications set job_snapshot='{}'::jsonb where id=$1", [
      app.id,
    ]),
  ).rejects.toMatchObject({ message: "RF_IMMUTABLE" });
  expect((await stack.request("applications")).status).toBe(401);
  for (const suffix of ["", "/events"]) {
    expect((await stack.request(`applications/${app.id}${suffix}`, other)).status).toBe(404);
  }
  expect(
    (
      await stack.request(
        `applications/${app.id}`,
        other,
        "PATCH",
        fields(app, { note: "foreign" }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await stack.request(`applications/${app.id}`, other, "DELETE", {
        expectedRevision: app.revision,
      })
    ).status,
  ).toBe(404);
  for (const table of [
    "applications",
    "application_events",
    "follow_up_tasks",
    "application_requests",
    "application_audit",
  ]) {
    expect((await other.client.from(table).select("*")).error).not.toBeNull();
  }
  expect((await owner.client.rpc("application_json", { p_id: app.id })).error).not.toBeNull();
  expect(
    (await owner.client.rpc("application_create", { p_user: other.id, p_job: jobId })).error,
  ).not.toBeNull();
  expect(
    (await owner.client.rpc("resume_tracking_reference", { p_version: id(), p_owner: other.id }))
      .error,
  ).not.toBeNull();
});
it("records all five manual stages, references and private notes across reload without silently reopening Closed", async () => {
  let app = await track();
  for (const stage of ["Applied", "Interview", "Offer", "Closed"]) {
    app = await edit(app, {
      stage,
      note: `Authored note at ${stage}`,
      confirmationReference: `My ${stage} reference`,
    });
  }
  const reloaded = await find(app.id);
  expect(reloaded.note).toBe("Authored note at Closed");
  expect(reloaded.stage).toBe("Closed");
  const events = eventPageSchema.parse(
    await (await stack.request(`applications/${app.id}/events`, owner)).json(),
  );
  expect(events.data.filter((event) => event.kind === "stage").map((event) => event.stage)).toEqual(
    ["Closed", "Offer", "Interview", "Applied"],
  );
  expect(events.data.every((event) => event.actorId === owner.id)).toBe(true);
  expect(
    (await stack.request(`applications/${app.id}`, owner, "PATCH", fields(app, { stage: "Saved" })))
      .status,
  ).toBe(409);
  expect((await track()).id).toBe(app.id);
});
it("requires an explicit new cycle, rejects concurrent duplicates and reuses the same cycle request", async () => {
  const prior = await track(),
    key = id();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      stack.request(
        `applications/${prior.id}/new-cycle`,
        owner,
        "POST",
        { expectedRevision: prior.revision },
        { "Idempotency-Key": key },
      ),
    ),
  );
  expect(responses.every((response) => response.status === 201)).toBe(true);
  const records = await Promise.all(
    responses.map(async (response) => (await response.json()).data),
  );
  expect(new Set(records.map((record) => record.id)).size).toBe(1);
  const next = applicationSchema.parse(records[0]);
  expect(next.cycle).toBe(prior.cycle + 1);
  expect(next.stage).toBe("Saved");
  expect(next.note).toBe("");
  expect(
    (
      await stack.request(
        `applications/${prior.id}/new-cycle`,
        owner,
        "POST",
        { expectedRevision: prior.revision },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await stack.request(
        `applications/${next.id}/new-cycle`,
        owner,
        "POST",
        { expectedRevision: next.revision },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(409);
});
it("uses optimistic revisions for concurrent edits, rejects forged fields and preserves uncertain drafts", async () => {
  const app = await track();
  const responses = await Promise.all(
    ["First authored edit", "Second authored edit"].map((note) =>
      stack.request(`applications/${app.id}`, owner, "PATCH", fields(app, { note })),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const saved = await find(app.id);
  expect(["First authored edit", "Second authored edit"]).toContain(saved.note);
  for (const changes of [
    { userId: other.id },
    { note: null },
    { stage: "Hired automatically" },
    { confirmationReference: 42 },
    { resumeVersionId: "not-a-uuid" },
  ]) {
    expect(
      (await stack.request(`applications/${app.id}`, owner, "PATCH", fields(saved, changes)))
        .status,
    ).toBe(400);
  }
  const bypass = await owner.client.rpc("application_edit", {
    p_id: app.id,
    p_data: fields(saved, { note: null }),
  });
  expect(bypass.error?.message).toBe("RF_INVALID_INPUT");
  expect(
    (
      await stack.request(`applications/${app.id}`, owner, "PATCH", fields(saved), {
        Origin: "https://foreign.invalid",
      })
    ).status,
  ).toBe(403);
});
it("stores follow-ups in UTC, retries once, edits/completes/removes without promoting application state", async () => {
  let app = await track(),
    key = id();
  const input = {
    expectedRevision: app.revision,
    title: "Prepare authored walkthrough",
    dueAt: "2026-12-01T09:30:00+08:00",
  };
  for (let index = 0; index < 2; index++) {
    const response = await stack.request(
      `applications/${app.id}/follow-ups`,
      owner,
      "POST",
      input,
      { "Idempotency-Key": key },
    );
    expect(response.status).toBe(201);
    app = applicationSchema.parse((await response.json()).data);
  }
  expect(app.followUps).toHaveLength(1);
  expect(new Date(app.followUps[0].dueAt).toISOString()).toBe("2026-12-01T01:30:00.000Z");
  expect(app.stage).toBe("Saved");
  const followUp = app.followUps[0];
  const editResponse = await stack.request(
    `applications/${app.id}/follow-ups/${followUp.id}`,
    owner,
    "PATCH",
    {
      expectedRevision: app.revision,
      title: "Reviewed next step",
      dueAt: followUp.dueAt,
      completed: true,
    },
  );
  expect(editResponse.status).toBe(200);
  app = applicationSchema.parse((await editResponse.json()).data);
  expect(app.followUps[0].completed).toBe(true);
  expect(
    (
      await stack.request(`applications/${app.id}/follow-ups/${followUp.id}`, other, "DELETE", {
        expectedRevision: app.revision,
      })
    ).status,
  ).toBe(404);
  const removed = await stack.request(
    `applications/${app.id}/follow-ups/${followUp.id}`,
    owner,
    "DELETE",
    { expectedRevision: app.revision },
  );
  expect(removed.status).toBe(200);
  app = applicationSchema.parse((await removed.json()).data);
  expect(app.followUps).toHaveLength(0);
  expect(
    (
      await stack.request(`applications/${app.id}/follow-ups`, owner, "POST", input, {
        "Idempotency-Key": key,
      })
    ).status,
  ).toBe(409);
  for (const dueAt of ["2026-12-01T09:30:00", "not-a-date", "2200-01-01T00:00:00Z"]) {
    expect(
      (
        await stack.request(
          `applications/${app.id}/follow-ups`,
          owner,
          "POST",
          { ...input, expectedRevision: app.revision, dueAt },
          { "Idempotency-Key": id() },
        )
      ).status,
    ).toBe(400);
  }
});
it("retains historical snapshots and notes after source closure and refuses a new cycle until availability returns", async () => {
  let app = await track(alternateId);
  app = await edit(app, { note: "Keep my historical note", stage: "Closed" });
  const link = (
    await stack.sql.query("select id from public.job_sources where job_id=$1", [alternateId])
  ).rows[0].id;
  expect(
    (
      await stack.request(`admin/catalog/observations/${link}/record`, admin, "POST", {
        event: "confirmed_closed",
      })
    ).status,
  ).toBe(200);
  const archived = await find(app.id);
  expect(archived.available).toBe(false);
  expect(archived.sources[0].available).toBe(false);
  expect(archived.note).toBe(app.note);
  expect(archived.title).toBe(app.title);
  expect(
    (
      await stack.request(
        `applications/${app.id}/new-cycle`,
        owner,
        "POST",
        { expectedRevision: app.revision },
        { "Idempotency-Key": id() },
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await stack.request(`admin/catalog/observations/${link}/record`, admin, "POST", {
        event: "confirmed_active",
      })
    ).status,
  ).toBe(200);
  for (const status of ["review", "published"]) {
    const revision = (
      await stack.sql.query("select revision from public.jobs where id=$1", [alternateId])
    ).rows[0].revision;
    expect(
      (
        await stack.request(`admin/catalog/jobs/${alternateId}/status`, admin, "POST", {
          expectedRevision: Number(revision),
          status,
        })
      ).status,
    ).toBe(200);
  }
  expect((await find(app.id)).available).toBe(true);
});
it("selects an exact owner resume version and atomically unlinks it on source deletion without copying statements", async () => {
  const document = await resume(),
    foreign = await resume(other);
  let app = await track();
  const originalVersion = document.currentVersion.id;
  app = await edit(app, { resumeVersionId: originalVersion });
  expect(app.resume?.id).toBe(originalVersion);
  expect(
    (
      await stack.request(
        `applications/${app.id}`,
        owner,
        "PATCH",
        fields(app, { resumeVersionId: foreign.currentVersion.id }),
      )
    ).status,
  ).toBe(404);
  const choices = await stack.request("applications/resume-choices", owner);
  expect(choices.status).toBe(200);
  const refs = (await choices.json()).data;
  expect(refs.some((item: { id: string }) => item.id === originalVersion)).toBe(true);
  expect(refs.some((item: { id: string }) => item.id === foreign.currentVersion.id)).toBe(false);
  expect(JSON.stringify(refs)).not.toContain("Building an authored project.");
  const deleted = await stack.request(`resumes/${document.id}`, owner, "DELETE", {
    expectedRevision: document.revision,
  });
  expect(deleted.status).toBe(200);
  const after = await find(app.id);
  expect(after.resume).toBeNull();
  expect(after.revision).toBe(app.revision + 1);
  expect(after.note).toBe(app.note);
  const events = eventPageSchema.parse(
    await (await stack.request(`applications/${app.id}/events`, owner)).json(),
  );
  expect(events.data[0].kind).toBe("resume-removed");
  expect(JSON.stringify(events)).not.toContain(originalVersion);
  expect(JSON.stringify(after)).not.toContain("Building an authored project.");
  expect(
    (
      await stack.request(
        `applications/${app.id}`,
        owner,
        "PATCH",
        fields(app, { note: "Stale after source removal" }),
      )
    ).status,
  ).toBe(409);
});
it("does not change stages or create tracking records when bookmarking or exporting a resume", async () => {
  const app = await track(),
    document = await resume();
  expect((await stack.request(`bookmarks/${jobId}`, owner, "PUT", {})).status).toBe(200);
  const exported = await stack.request(
    `resumes/${document.id}/exports`,
    owner,
    "POST",
    { versionId: document.currentVersion.id },
    { "Idempotency-Key": id() },
  );
  expect(exported.status).toBe(202);
  const task = (await exported.json()).data;
  await worker();
  expect((await (await stack.request(`tasks/${task.taskId}`, owner)).json()).data.status).toBe(
    "succeeded",
  );
  expect((await find(app.id)).stage).toBe("Saved");
  expect((await find(app.id)).revision).toBe(app.revision);
});
it("paginates event history and application cycles without leaking another owner's records", async () => {
  let app = await fresh(alternateId);
  for (let index = 0; index < 21; index++)
    app = await edit(app, { note: `Authored event ${index}` });
  const first = eventPageSchema.parse(
    await (await stack.request(`applications/${app.id}/events`, owner)).json(),
  );
  expect(first.data).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  const second = eventPageSchema.parse(
    await (
      await stack.request(
        `applications/${app.id}/events?cursor=${encodeURIComponent(first.nextCursor!)}`,
        owner,
      )
    ).json(),
  );
  expect(second.data).toHaveLength(2);
  expect(new Set([...first.data, ...second.data].map((item) => item.id)).size).toBe(22);
  for (let index = 0; index < 21; index++) app = await fresh(alternateId);
  const page = applicationPageSchema.parse(
    await (await stack.request("applications", owner)).json(),
  );
  expect(page.data).toHaveLength(20);
  expect(page.nextCursor).not.toBeNull();
  const later = applicationPageSchema.parse(
    await (await stack.request(`applications?cursor=${page.nextCursor}`, owner)).json(),
  );
  expect(later.data.length).toBeGreaterThan(0);
  expect(new Set([...page.data, ...later.data].map((item) => item.id)).size).toBe(
    page.data.length + later.data.length,
  );
  const foreign = applicationPageSchema.parse(
    await (await stack.request(`applications?cursor=${page.nextCursor}`, other)).json(),
  );
  expect(foreign.data).toHaveLength(0);
  expect((await stack.request("applications?cursor=malformed", owner)).status).toBe(400);
});
it("deletes owned events and follow-ups, prevents request-key resurrection and rejects inactive sessions", async () => {
  const key = id();
  let app = await track(jobId, other, key);
  const response = await stack.request(
    `applications/${app.id}/follow-ups`,
    other,
    "POST",
    { expectedRevision: app.revision, title: "Private follow-up", dueAt: "2026-12-01T00:00:00Z" },
    { "Idempotency-Key": id() },
  );
  expect(response.status).toBe(201);
  app = applicationSchema.parse((await response.json()).data);
  expect(
    (
      await stack.request(`applications/${app.id}`, other, "DELETE", {
        expectedRevision: app.revision - 1,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await stack.request(`applications/${app.id}`, other, "DELETE", {
        expectedRevision: app.revision,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await stack.sql.query(
        "select (select count(*) from public.follow_up_tasks where application_id=$1)+(select count(*) from public.application_events where application_id=$1) n",
        [app.id],
      )
    ).rows[0].n,
  ).toBe("0");
  expect(
    (await stack.request("applications", other, "POST", { jobId }, { "Idempotency-Key": key }))
      .status,
  ).toBe(409);
  const inactive = await stack.member();
  await track(jobId, inactive);
  checked(
    (await stack.privileged.rpc("identity_deactivate_profile", { p_user: inactive.id })).error,
  );
  expect((await stack.request("applications", inactive)).status).toBe(403);
});
it("runs the actual mobile track, report, follow-up, resume selection, reload, conflict and deletion flow", async () => {
  const browser = await chromium.launch(),
    context = await browserContext(browser, owner),
    page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${stack.origin}/applications/?job=${jobId}`);
    await webExpect(
      page.getByRole("button", { name: "Track selected role", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Track selected role", exact: true }).click();
    await webExpect(page.getByLabel("Application note")).toBeVisible();
    const choices = (await (await stack.request("applications/resume-choices", owner)).json()).data;
    await page.getByLabel("Confirmed resume version", { exact: true }).selectOption(choices[0].id);
    await page.getByLabel("Application stage").selectOption("Applied");
    await page.getByLabel("Application note").fill("Mobile authored note");
    await page.getByRole("button", { name: "Save application record", exact: true }).click();
    await webExpect(page.getByLabel("Selected application record")).toContainText(
      "Applied (user-reported)",
    );
    await page.getByLabel("Next step", { exact: true }).fill("Prepare mobile walkthrough");
    await page.getByLabel("Due date and time", { exact: true }).fill("2026-12-02T09:00");
    await page.getByRole("button", { name: "Add follow-up", exact: true }).click();
    await webExpect(page.getByLabel("Follow-up tasks")).toContainText("Prepare mobile walkthrough");
    await page.reload();
    await page
      .getByRole("button", { name: /Authored role primary/ })
      .first()
      .click();
    await webExpect(page.getByLabel("Application note")).toHaveValue("Mobile authored note");
    await webExpect(page.getByLabel("Confirmed resume version", { exact: true })).toHaveValue(
      choices[0].id,
    );
    await page.getByLabel("Application note").fill("Keep this unsaved draft");
    const app = await track();
    await edit(app, { note: "Concurrent saved note" });
    await page.getByRole("button", { name: "Refresh tracked roles", exact: true }).click();
    await webExpect(
      page.getByText("This record changed. Your unsaved draft is retained.", { exact: false }),
    ).toBeVisible();
    await webExpect(page.getByLabel("Application note")).toHaveValue("Keep this unsaved draft");
    await page.getByRole("button", { name: "Load latest saved fields", exact: true }).click();
    await webExpect(page.getByLabel("Application note")).toHaveValue("Concurrent saved note");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".local/tracking-private-mobile.png", fullPage: true });
    await page
      .getByLabel("Edit tracked role", { exact: true })
      .screenshot({ path: ".local/tracking-editor-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".local/tracking-private-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Delete this record", exact: true }).click();
    await page.getByRole("button", { name: "Confirm record deletion", exact: true }).click();
    await webExpect(page.getByLabel("Selected application record")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
it("preserves owned notes and snapshots after the catalog record is physically removed", async () => {
  const job = await createJob("removed-catalog");
  let app = await track(job);
  app = await edit(app, { note: "Keep this independent history" });
  await stack.sql.query(
    "delete from public.job_skill_links where requirement_id in(select id from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=$1))",
    [job],
  );
  await stack.sql.query(
    "delete from public.job_requirements where job_version_id in(select id from public.job_versions where job_id=$1)",
    [job],
  );
  await stack.sql.query("delete from public.job_sources where job_id=$1", [job]);
  await stack.sql.query("delete from public.job_versions where job_id=$1", [job]);
  await stack.sql.query("delete from public.jobs where id=$1", [job]);
  const history = await find(app.id);
  expect(history.available).toBe(false);
  expect(history.title).toBe(app.title);
  expect(history.note).toBe(app.note);
  expect(history.sources[0].available).toBe(false);
  expect((await edit(history, { note: "Historical note remains editable" })).note).toBe(
    "Historical note remains editable",
  );
});
it("cascades tracking and follow-ups when an owner with a selected resume is deleted", async () => {
  const member = await stack.member(),
    document = await resume(member);
  let app = await track(jobId, member);
  app = await edit(app, { resumeVersionId: document.currentVersion.id }, member);
  const follow = await stack.request(
    `applications/${app.id}/follow-ups`,
    member,
    "POST",
    {
      expectedRevision: app.revision,
      title: "Authored deletion follow-up",
      dueAt: "2026-12-01T00:00:00Z",
    },
    { "Idempotency-Key": id() },
  );
  expect(follow.status).toBe(201);
  checked((await stack.privileged.auth.admin.deleteUser(member.id)).error);
  expect(
    (
      await stack.sql.query(
        "select (select count(*) from public.applications where user_id=$1)+(select count(*) from public.application_events where application_id=$2)+(select count(*) from public.follow_up_tasks where application_id=$2) n",
        [member.id, app.id],
      )
    ).rows[0].n,
  ).toBe("0");
  stack.users.splice(
    stack.users.findIndex((user) => user.id === member.id),
    1,
  );
  await stack.sql.query(
    "delete from public.invitations where email_hash=public.identity_email_hash($1)",
    [member.email],
  );
  await stack.sql.query(
    "delete from public.identity_otp_requests where email_hash=public.identity_email_hash($1)",
    [member.email],
  );
});
it("opens an actual source popup without changing Saved and hides private controls from anonymous visitors", async () => {
  const app = await fresh(),
    browser = await chromium.launch(),
    context = await browserContext(browser, owner),
    page = await context.newPage();
  try {
    await context.route("https://jobs.test.invalid/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>Authored source fixture</h1>",
      }),
    );
    await page.goto(`${stack.origin}/applications/?application=${app.id}`);
    await webExpect(page.getByLabel("Application stage")).toHaveValue("Saved");
    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Visit original source ↗", exact: true }).click();
    const original = await popup;
    await webExpect(original.locator("h1")).toHaveText("Authored source fixture");
    await original.close();
    expect((await find(app.id)).stage).toBe("Saved");
    expect((await find(app.id)).revision).toBe(app.revision);
    const another = await track(jobId, other);
    await edit(another, { note: "Different owner private note" }, other);
    await context.addCookies(
      other.cookie.split("; ").map((cookie) => {
        const separator = cookie.indexOf("=");
        return {
          name: cookie.slice(0, separator),
          value: cookie.slice(separator + 1),
          url: stack.origin,
          httpOnly: true,
          sameSite: "Lax" as const,
        };
      }),
    );
    await page.getByRole("button", { name: "Refresh tracked roles", exact: true }).click();
    await webExpect(page.getByLabel("Selected application record")).toHaveCount(0);
    await page
      .getByRole("button", { name: /Authored role primary/ })
      .first()
      .click();
    await webExpect(page.getByLabel("Application note")).toHaveValue(
      "Different owner private note",
    );
    const anonymous = await browserContext(browser);
    try {
      const visitor = await anonymous.newPage();
      await visitor.goto(`${stack.origin}/applications/`);
      await webExpect(
        visitor.getByRole("heading", { name: "Sign in for your private tracker" }),
      ).toBeVisible();
      await webExpect(
        visitor.getByRole("button", { name: "Track selected role", exact: true }),
      ).toHaveCount(0);
      await webExpect(visitor.getByLabel("Application note")).toHaveCount(0);
    } finally {
      await anonymous.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }
});
