import { ZipFile } from "yazl";
import { chromium, expect as webExpect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import PDFDocument from "pdfkit";
import { LocalFixtures, type LocalMember } from "../support/local-fixtures";
import { resumeDocumentSchema, proposalSchema } from "../../src/modules/resume/model";
import type { ResumeDocument, ConfirmedResume, ResumeMedia } from "../../src/modules/resume/model";
import { extractedText } from "../../src/modules/resume/rules";
import { publicationFields } from "../../src/modules/jobs/model";
const id = () => crypto.randomUUID(),
  prefix = `rf-resume-${id()}`;
let stack: LocalFixtures, owner: LocalMember, other: LocalMember, admin: LocalMember, jobId: string;
const retiredUsers: string[] = [];
const conceptIds: string[] = [];
const documents: string[] = [],
  sources: string[] = [],
  jobs: string[] = [];
function checked(error: { message: string } | null) {
  if (error) throw Error(error.message);
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
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Owned resume worker exceeded its test deadline."));
    }, 25000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(Error("Owned resume worker failed; no source diagnostics are printed."));
    });
  });
}
async function get(documentId: string, user = owner) {
  const response = await stack.request(`resumes/${documentId}`, user);
  expect(response.status).toBe(200);
  return resumeDocumentSchema.parse((await response.json()).data);
}
async function paste(
  text = `Authored resume ${prefix}\n\nA project is in progress.`,
  user = owner,
  key = id(),
) {
  const response = await stack.request(
    "resumes/paste",
    user,
    "POST",
    { text },
    { "Idempotency-Key": key },
  );
  expect(response.status).toBe(202);
  const data = (await response.json()).data;
  documents.push(data.documentId);
  return data as { documentId: string; taskId: string };
}
async function pdf(text: string) {
  const document = new PDFDocument(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  if (text) document.text(text);
  document.end();
  return done;
}
async function upload(
  bytes: Buffer,
  name = "resume.pdf",
  user = owner,
  mediaType: ResumeMedia = "application/pdf",
) {
  const intent = await stack.request(
    "resumes/upload-intents",
    user,
    "POST",
    { filename: name, mediaType, byteCount: bytes.length },
    { "Idempotency-Key": id() },
  );
  expect(intent.status).toBe(201);
  const authority = (await intent.json()).data;
  documents.push(authority.documentId);
  const result = await fetch(`${stack.origin}/api/v1/resumes/${authority.documentId}/source`, {
    method: "PUT",
    headers: {
      Cookie: user.cookie,
      Origin: stack.origin,
      "Content-Type": mediaType,
      "X-Upload-Token": authority.uploadToken,
    },
    body: new Blob([new Uint8Array(bytes).buffer], { type: mediaType }),
  });
  expect(result.status).toBe(200);
  return { authority, document: resumeDocumentSchema.parse((await result.json()).data) };
}
function content(document: ResumeDocument): ConfirmedResume {
  const facts = [
    {
      id: id(),
      text: "Maintained documentation for a team.",
      kind: "experience" as const,
      state: "completed" as const,
      skillIds: ["content"],
      sourceBlockId: document.draft!.blocks[0].id,
    },
    {
      id: id(),
      text: "Building a retrieval prototype with Python; evaluation is in progress.",
      kind: "project" as const,
      state: "in-progress" as const,
      skillIds: ["rag", "python"],
      sourceBlockId: document.draft!.blocks[0].id,
    },
    {
      id: id(),
      text: "Plan to study agent orchestration.",
      kind: "other" as const,
      state: "learning" as const,
      skillIds: ["agents"],
      sourceBlockId: null,
    },
    {
      id: id(),
      text: "Completed an authored Python exercise.",
      kind: "project" as const,
      state: "completed" as const,
      skillIds: ["python"],
      sourceBlockId: null,
    },
  ];
  return {
    facts,
    sections: [
      { id: id(), heading: "Projects / 專案", factIds: [facts[0].id, facts[1].id] },
      { id: id(), heading: "Other experience", factIds: [facts[2].id, facts[3].id] },
    ],
  };
}
async function confirm(document: ResumeDocument, value = content(document)) {
  const response = await stack.request(`resumes/${document.id}/confirm`, owner, "POST", {
    expectedRevision: document.revision,
    content: value,
  });
  expect(response.status).toBe(200);
  return resumeDocumentSchema.parse((await response.json()).data);
}
async function confirmed() {
  const created = await paste();
  await worker();
  return confirm(await get(created.documentId));
}
async function revise(document: ResumeDocument) {
  const response = await stack.request(
    `resumes/${document.id}/revisions`,
    owner,
    "POST",
    { versionId: document.currentVersion!.id, jobId, expectedRevision: document.revision },
    { "Idempotency-Key": id() },
  );
  expect(response.status).toBe(202);
  return (await response.json()).data as { id: string; taskId: string };
}
async function createJob() {
  const source = await stack.request("admin/catalog/sources", admin, "POST", {
    name: prefix,
    publisher: "Authored fixture",
    authorizationBasis: "Synthetic metadata only",
    rightsSummary: "Not a real opening",
    allowedHosts: ["jobs.test.invalid"],
    permittedFields: publicationFields,
    isDemo: true,
  });
  expect(source.status).toBe(201);
  const sourceId = (await source.json()).data.id;
  sources.push(sourceId);
  const response = await stack.request("admin/catalog/jobs", admin, "POST", {
    job: {
      canonicalKey: prefix,
      company: prefix,
      title: "Authored target role",
      track: "Engineering & data",
      specialization: "ai-llm-applications",
      location: null,
      workplace: null,
      level: null,
      salary: null,
      summary: "Fictional source for resume testing",
      responsibilities: [],
      requirements: [
        {
          text: "Demonstrate a retrieval prototype",
          priority: "mandatory",
          skills: ["rag", "python"],
        },
      ],
      conditions: { workAuthorization: null, education: null, experienceYears: null },
      expiresAt: null,
    },
    source: { sourceId, externalId: prefix, url: `https://jobs.test.invalid/${prefix}` },
  });
  expect(response.status).toBe(201);
  let record = (await response.json()).data;
  jobs.push(record.id);
  for (const status of ["review", "published"]) {
    const result = await stack.request(`admin/catalog/jobs/${record.id}/status`, admin, "POST", {
      expectedRevision: record.revision,
      status,
    });
    expect(result.status).toBe(200);
    record = (await result.json()).data;
  }
  return record.id as string;
}
beforeAll(async () => {
  stack = await LocalFixtures.open();
  owner = await stack.member();
  other = await stack.member();
  admin = await stack.member(true);
  jobId = await createJob();
  await writeFile(
    `.local/${prefix}-fixtures.json`,
    JSON.stringify({
      prefix,
      users: stack.users.map((user) => ({ id: user.id, email: user.email })),
      sources,
      jobs,
    }),
    { mode: 0o600 },
  );
});
afterAll(async () => {
  if (!stack) return;
  const users = stack.users.map((user) => user.id);
  const objects = await stack.sql.query(
    "select object_key from public.resume_storage_objects where user_id=any($1::uuid[]) or document_id=any($2::uuid[]) or split_part(object_key,'/',1)=any($3::text[])",
    [users, documents, retiredUsers],
  );
  if (objects.rows.length) {
    const result = await stack.privileged.storage
      .from("rolefoundry-resumes")
      .remove(objects.rows.map((row) => row.object_key));
    checked(result.error);
  }
  await stack.sql.query(
    "delete from public.resume_storage_objects where user_id=any($1::uuid[]) or document_id=any($2::uuid[]) or split_part(object_key,'/',1)=any($3::text[])",
    [users, documents, retiredUsers],
  );
  await stack.sql.query(
    "select pgmq.archive('rolefoundry_tasks',queue_message_id) from public.tasks where user_id=any($1::uuid[]) and queue_message_id is not null",
    [users],
  );
  await stack.sql.query("delete from public.resume_audit where actor_id=any($1::uuid[])", [users]);
  await stack.sql.query("delete from public.resume_documents where user_id=any($1::uuid[])", [
    users,
  ]);
  await stack.sql.query("delete from public.match_runs where user_id=any($1::uuid[])", [users]);
  await stack.sql.query("delete from public.learning_plans where user_id=any($1::uuid[])", [users]);
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
  await stack.sql.query("delete from public.sources where id=any($1::uuid[])", [sources]);
  await stack.sql.query("delete from public.companies where name=$1", [prefix]);
  if (conceptIds.length) {
    const connection = await stack.sql.connect();
    try {
      await connection.query("begin");
      await connection.query(
        "select pg_advisory_xact_lock(hashtextextended('catalog:write',0)),pg_advisory_xact_lock(hashtextextended('dictionary:write',0))",
      );
      // A reviewed merge transfers aliases to the target concept. Remove only our
      // unique authored labels as well as aliases still owned by fixture concepts.
      await connection.query(
        "delete from public.skill_aliases where skill_id=any($1::text[]) or alias=any($2::text[])",
        [conceptIds, [`${prefix} legacy skill`, `${prefix} local label`]],
      );
      await connection.query(
        "delete from public.skill_relations where parent_id=any($1::text[]) or child_id=any($1::text[])",
        [conceptIds],
      );
      await connection.query("delete from public.track_skills where skill_id=any($1::text[])", [
        conceptIds,
      ]);
      await connection.query("delete from public.skills where id=any($1::text[])", [conceptIds]);
      await connection.query(
        "with bumped as(update public.dictionary_state set version=version+1 returning version) insert into public.dictionary_versions(version,snapshot) select version,public.dictionary_snapshot() from bumped",
      );
      await connection.query("update public.catalog_state set revision=revision+1");
      await connection.query("commit");
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }
  await stack.close();
});
describe("private resume services", () => {
  it("stores a real private PDF, runs actual parsing and prevents member/raw-bucket access", async () => {
    const { document } = await upload(
      await pdf(`Authored resume ${prefix}\nBuilding a Python prototype.`),
    );
    await worker();
    const parsed = await get(document.id);
    expect(parsed.status).toBe("parsed");
    expect(parsed.draft!.text).toContain(prefix);
    const key = (
      await stack.sql.query("select source_key from public.resume_documents where id=$1", [
        document.id,
      ])
    ).rows[0].source_key;
    expect(
      (await owner.client.storage.from("rolefoundry-resumes").download(key)).error,
    ).not.toBeNull();
    expect(
      (await other.client.storage.from("rolefoundry-resumes").download(key)).error,
    ).not.toBeNull();
    const publicResponse = await fetch(
      `${stack.env.API_URL}/storage/v1/object/public/rolefoundry-resumes/${key}`,
    );
    expect(publicResponse.ok).toBe(false);
    for (const table of [
      "resume_documents",
      "resume_versions",
      "revision_proposals",
      "resume_exports",
      "resume_storage_objects",
      "resume_downloads",
      "resume_claim_links",
    ])
      expect((await owner.client.from(table).select("*")).error).not.toBeNull();
    expect(
      (await owner.client.rpc("resume_parse_load", { p_task: parsed.taskId, p_token: id() })).error,
    ).not.toBeNull();
    expect((await stack.request(`resumes/${document.id}`, other)).status).toBe(404);
  });
  it("seals concurrent idempotent paste requests and never puts resume text into queue messages", async () => {
    const key = id(),
      text = `Concurrent authored source ${prefix}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        stack.request("resumes/paste", owner, "POST", { text }, { "Idempotency-Key": key }),
      ),
    );
    for (const response of results) expect(response.status).toBe(202);
    const records = await Promise.all(results.map((response) => response.json()));
    const documentId = records[0].data.documentId;
    documents.push(documentId);
    expect(new Set(records.map((record) => record.data.documentId)).size).toBe(1);
    const row = (
      await stack.sql.query(
        "select q.message from pgmq.q_rolefoundry_tasks q join public.tasks t on q.msg_id=t.queue_message_id where t.id=$1",
        [records[0].data.taskId],
      )
    ).rows[0];
    expect(row.message).toEqual({ taskId: records[0].data.taskId });
    const conflict = await stack.request(
      "resumes/paste",
      owner,
      "POST",
      { text: text + " changed" },
      { "Idempotency-Key": key },
    );
    expect(conflict.status).toBe(409);
    await worker();
    expect((await get(documentId)).draft!.text).toBe(text);
  });
  it("keeps failed source files and exposes a safe empty/scanned-file error with a working paste fallback", async () => {
    const { document } = await upload(await pdf(""));
    await worker();
    const failed = await get(document.id);
    expect(failed.status).toBe("failed");
    expect(failed.processingError).toBe("empty-text");
    expect(failed.draft).toBeNull();
    const key = (
      await stack.sql.query("select source_key from public.resume_documents where id=$1", [
        document.id,
      ])
    ).rows[0].source_key;
    expect(
      (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).data,
    ).not.toBeNull();
    const pasted = await paste("Manually pasted authored replacement, original source retained.");
    await worker();
    expect((await get(pasted.documentId)).status).toBe("parsed");
  });
  it("confirms immutable versions and publishes only unreviewed, source-bound resume claims", async () => {
    const created = await paste();
    await worker();
    const parsed = await get(created.documentId),
      value = content(parsed);
    const before = await stack.request("profile", owner);
    const profile = await before.json();
    const evidence = await (await stack.request("evidence", owner)).json();
    const results = await Promise.all(
      [1, 2].map(() =>
        stack.request(`resumes/${parsed.id}/confirm`, owner, "POST", {
          expectedRevision: parsed.revision,
          content: value,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const confirmed = await get(parsed.id),
      versionId = confirmed.currentVersion!.id;
    expect((await stack.request(`resume-versions/${versionId}`, other)).status).toBe(404);
    const update = await stack.sql.query(
      "select 1 as present from public.resume_versions where id=$1",
      [versionId],
    );
    expect(update.rowCount).toBe(1);
    await expect(
      stack.sql.query("update public.resume_versions set content='{}' where id=$1", [versionId]),
    ).rejects.toMatchObject({ message: "RF_IMMUTABLE" });
    const afterProfile = await (await stack.request("profile", owner)).json();
    expect(afterProfile.data.revision).toBeGreaterThan(profile.data.revision);
    for (const field of ["name", "track", "workplaces", "weeklyHours"])
      expect(afterProfile.data[field]).toEqual(profile.data[field]);
    const afterEvidence = await (await stack.request("evidence?limit=50", owner)).json();
    expect(afterEvidence.data.length).toBe(evidence.data.length + 3);
    for (const claim of afterEvidence.data) {
      expect(claim.source).toBe("resume-claim");
      expect(claim.reviewState).toBe("unreviewed");
      expect(claim.claimedLevel).toBeNull();
      expect(claim.context).not.toContain("Plan to study agent orchestration.");
    }
    expect(confirmed.confirmedClaimCount).toBe(3);
    expect(
      (
        await owner.client.rpc("profile_append_resume_claim", {
          p_user: owner.id,
          p_evidence: null,
          p_data: {},
        })
      ).error,
    ).not.toBeNull();
  });
  it("publishes grounded target proposals and accepts changes independently without changing facts", async () => {
    const document = await confirmed(),
      original = structuredClone(document.currentVersion!),
      run = await revise(document);
    await worker();
    const response = await stack.request(`resume-revisions/${run.id}`, owner);
    expect(response.status).toBe(200);
    const proposal = proposalSchema.parse((await response.json()).data);
    expect(proposal.status).toBe("succeeded");
    expect(proposal.output!.changes).toHaveLength(2);
    expect((await stack.request(`resume-revisions/${run.id}`, other)).status).toBe(404);
    const accepted = await stack.request(`resume-revisions/${run.id}/accept`, owner, "POST", {
      expectedRevision: document.revision,
      changeIds: [proposal.output!.changes[0].id],
    });
    expect(accepted.status).toBe(200);
    const next = resumeDocumentSchema.parse((await accepted.json()).data);
    expect(next.currentVersion!.content.facts).toEqual(original.content.facts);
    expect(next.currentVersion!.content.sections[1]).toEqual(original.content.sections[1]);
    expect(next.currentVersion!.content.sections[0].factIds).toEqual(
      proposal.output!.changes[0].factIds,
    );
    const historical = await stack.request(`resume-versions/${original.id}`, owner);
    expect((await historical.json()).data).toEqual(original);
  });
  it("exports a fixed historical version, authorizes expiring downloads and deletes stored derivatives", async () => {
    const document = await confirmed(),
      version = document.currentVersion!;
    const result = await stack.request(
      `resumes/${document.id}/exports`,
      owner,
      "POST",
      { versionId: version.id },
      { "Idempotency-Key": id() },
    );
    expect(result.status).toBe(202);
    const exported = (await result.json()).data;
    const edited = structuredClone(version.content);
    edited.facts[0].text = "Later confirmed content is separate.";
    const newer = await confirm(document, edited);
    await worker();
    const intent = await stack.request(
      `resume-exports/${exported.id}/download-intents`,
      owner,
      "POST",
      {},
    );
    expect(intent.status).toBe(201);
    const permit = (await intent.json()).data;
    const file = await stack.request(`resume-downloads/${permit.id}`, owner);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect(file.headers.get("content-disposition")).toContain(version.id);
    expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await stack.request(`resume-downloads/${permit.id}`, other)).status).toBe(404);
    const keys = (
      await stack.sql.query(
        "select object_key from public.resume_storage_objects where document_id=$1",
        [document.id],
      )
    ).rows.map((row) => row.object_key);
    expect(keys.length).toBeGreaterThan(0);
    const removed = await stack.request(`resumes/${document.id}`, owner, "DELETE", {
      expectedRevision: newer.revision,
    });
    expect(removed.status).toBe(200);
    expect((await stack.request(`resume-downloads/${permit.id}`, owner)).status).toBe(404);
    expect((await stack.request(`resumes/${document.id}`, owner)).status).toBe(404);
    await worker();
    for (const key of keys)
      expect(
        (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
      ).not.toBeNull();
    expect(
      (
        await stack.sql.query(
          "select count(*)::integer n from public.resume_storage_objects where document_id=$1",
          [document.id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

async function claim(taskId: string) {
  const result = await stack.privileged.rpc("task_read", {
    p_worker: id(),
    p_kinds: ["resume.parse", "resume.revise", "resume.export"],
    p_seconds: 30,
    p_quantity: 1,
  });
  checked(result.error);
  expect(result.data).toHaveLength(1);
  expect(result.data[0].taskId).toBe(taskId);
  return result.data[0] as { taskId: string; token: string; messageId: string };
}
async function releaseToWorker(taskId: string) {
  await stack.sql.query(
    "update public.tasks set lease_expires_at=clock_timestamp()-interval '1 second',next_run_at=clock_timestamp() where id=$1 and status='running'",
    [taskId],
  );
  await stack.sql.query(
    "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
    [taskId],
  );
}
describe("resume concurrency, source and deletion guards", () => {
  it("expires upload authority, rotates an expired attempt and refuses another owner or a foreign origin", async () => {
    const bytes = await pdf("Authored source for expiring authority."),
      metadata = {
        filename: "authority.pdf",
        mediaType: "application/pdf",
        byteCount: bytes.length,
      },
      key = id();
    const response = await stack.request("resumes/upload-intents", owner, "POST", metadata, {
      "Idempotency-Key": key,
    });
    expect(response.status).toBe(201);
    const first = (await response.json()).data;
    documents.push(first.documentId);
    const send = (user: LocalMember, token: string, origin = stack.origin) =>
      fetch(`${stack.origin}/api/v1/resumes/${first.documentId}/source`, {
        method: "PUT",
        headers: {
          Cookie: user.cookie,
          Origin: origin,
          "Content-Type": "application/pdf",
          "X-Upload-Token": token,
        },
        body: new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
      });
    expect((await send(other, first.uploadToken)).status).toBe(404);
    expect((await send(owner, id())).status).toBe(409);
    expect((await send(owner, first.uploadToken, "https://foreign.test.invalid")).status).toBe(403);
    await stack.sql.query(
      "update public.resume_documents set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [first.documentId],
    );
    expect((await send(owner, first.uploadToken)).status).toBe(409);
    const renewed = await stack.request("resumes/upload-intents", owner, "POST", metadata, {
      "Idempotency-Key": key,
    });
    expect(renewed.status).toBe(201);
    const second = (await renewed.json()).data;
    expect(second.documentId).toBe(first.documentId);
    expect(second.uploadToken).not.toBe(first.uploadToken);
    expect((await send(owner, first.uploadToken)).status).toBe(409);
    expect((await send(owner, second.uploadToken)).status).toBe(200);
    expect((await send(owner, second.uploadToken)).status).toBe(200);
    expect(
      (
        await stack.sql.query(
          "select count(*)::integer n from public.tasks where source_ref=$1 and kind='resume.parse'",
          [first.documentId],
        )
      ).rows[0].n,
    ).toBe(1);
    await worker();
  });
  it("rejects forged draft spans and rolls back publication if its lease expires during the transaction", async () => {
    const text = "Authored source with 😀 Unicode provenance.",
      task = await paste(text),
      lease = await claim(task.taskId),
      draft = extractedText([{ text, page: null }], id);
    const forged = structuredClone(draft);
    forged.blocks[0].source.start = 1;
    expect(
      (
        await stack.privileged.rpc("resume_parse_publish", {
          p_task: lease.taskId,
          p_token: lease.token,
          p_draft: forged,
        })
      ).error?.message,
    ).toBe("RF_INVALID_INPUT");
    const trigger = `resume_delay_${id().replaceAll("-", "")}`;
    try {
      await stack.sql.query(
        `create function public.${trigger}() returns trigger language plpgsql as $$ begin perform pg_sleep(0.15);return new;end $$`,
      );
      await stack.sql.query(
        `create trigger ${trigger} before update on public.resume_documents for each row when(new.id='${task.documentId}'::uuid and new.status='parsed') execute function public.${trigger}()`,
      );
      await stack.sql.query(
        "update public.tasks set lease_expires_at=clock_timestamp()+interval '0.08 seconds' where id=$1",
        [task.taskId],
      );
      const result = await stack.privileged.rpc("resume_parse_publish", {
        p_task: lease.taskId,
        p_token: lease.token,
        p_draft: draft,
      });
      expect(result.error?.message).toBe("RF_CONFLICT");
      const row = (
        await stack.sql.query("select draft,status from public.resume_documents where id=$1", [
          task.documentId,
        ])
      ).rows[0];
      expect(row.draft).toBeNull();
      expect(row.status).toBe("queued");
    } finally {
      await stack.sql.query(`drop trigger if exists ${trigger} on public.resume_documents`);
      await stack.sql.query(`drop function if exists public.${trigger}()`);
    }
    await releaseToWorker(task.taskId);
    await worker();
    expect((await get(task.documentId)).draft!.text).toBe(text);
  });
  it("retains claim history after edits and synchronously purges dependent reports after source deletion", async () => {
    const document = await confirmed(),
      rootIds = (
        await stack.sql.query(
          "select evidence_id from public.resume_claim_links where document_id=$1 order by evidence_id",
          [document.id],
        )
      ).rows.map((row) => row.evidence_id);
    const matches = await stack.request(
      "matches",
      owner,
      "POST",
      { jobId, constraints: { experienceYears: null, confirmations: [] } },
      { "Idempotency-Key": id() },
    );
    expect(matches.status).toBe(202);
    const match = (await matches.json()).data;
    const learning = await stack.request(
      "learning-plans",
      owner,
      "POST",
      { jobId, weeklyHours: 1, durationOverrides: [] },
      { "Idempotency-Key": id() },
    );
    expect(learning.status).toBe(202);
    const plan = (await learning.json()).data;
    await worker();
    const changed = structuredClone(document.currentVersion!.content);
    changed.facts[1].text =
      "Building the retrieval prototype; a later evaluation remains in progress.";
    const edited = await confirm(document, changed);
    expect(edited.confirmedClaimCount).toBe(3);
    const linked = (
      await stack.sql.query(
        "select evidence_id from public.resume_claim_links where document_id=$1 order by evidence_id",
        [document.id],
      )
    ).rows.map((row) => row.evidence_id);
    expect(linked).toEqual(rootIds);
    const history = await stack.request(`evidence/${rootIds[0]}`, owner);
    expect((await history.json()).data).toHaveLength(2);
    const priorMatch = await stack.request(`matches/${match.runId}`, owner);
    expect((await priorMatch.json()).data.stale).toBe(true);
    expect(
      (
        await stack.sql.query(
          "select input_snapshot is not null present from public.match_runs where id=$1",
          [match.runId],
        )
      ).rows[0].present,
    ).toBe(true);
    const deleted = await stack.request(`resumes/${document.id}`, owner, "DELETE", {
      expectedRevision: edited.revision,
    });
    expect(deleted.status).toBe(200);
    expect(
      (
        await stack.sql.query(
          "select count(*)::integer n from public.evidence where id=any($1::uuid[])",
          [rootIds],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await stack.sql.query("select input_snapshot, status from public.match_runs where id=$1", [
          match.runId,
        ])
      ).rows[0],
    ).toMatchObject({ input_snapshot: null, status: "invalidated" });
    expect(
      (
        await stack.sql.query(
          "select input_snapshot,output,status from public.learning_plans where id=$1",
          [plan.planId],
        )
      ).rows[0],
    ).toMatchObject({ input_snapshot: null, output: null, status: "invalidated" });
  });
  it("rejects stale proposals and late parsing after source deletion or owner deactivation", async () => {
    const document = await confirmed(),
      run = await revise(document);
    await worker();
    const profile = (await (await stack.request("profile", owner)).json()).data;
    expect(
      (
        await stack.request("profile", owner, "PATCH", {
          expectedRevision: profile.revision,
          name: profile.name,
          track: profile.track,
          workplaces: profile.workplaces,
          weeklyHours: profile.weeklyHours + 1,
        })
      ).status,
    ).toBe(200);
    const result = await stack.request(`resume-revisions/${run.id}`, owner);
    expect((await result.json()).data.stale).toBe(true);
    expect(
      (
        await stack.request(`resume-revisions/${run.id}/accept`, owner, "POST", {
          expectedRevision: document.revision,
          changeIds: [],
        })
      ).status,
    ).toBe(409);
    const task = await paste("Authored private source to be deleted during execution."),
      lease = await claim(task.taskId),
      current = await get(task.documentId);
    expect(
      (
        await stack.request(`resumes/${task.documentId}`, owner, "DELETE", {
          expectedRevision: current.revision,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await stack.privileged.rpc("resume_parse_publish", {
          p_task: lease.taskId,
          p_token: lease.token,
          p_draft: extractedText(
            [{ text: "Authored private source to be deleted during execution.", page: null }],
            id,
          ),
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await stack.sql.query("select source_text,draft from public.resume_documents where id=$1", [
          task.documentId,
        ])
      ).rows[0],
    ).toEqual({ source_text: null, draft: null });
    const inactive = await stack.member(),
      pending = await paste("An authored inactive-owner source.", inactive),
      activeLease = await claim(pending.taskId);
    checked(
      (await stack.privileged.rpc("identity_deactivate_profile", { p_user: inactive.id })).error,
    );
    expect(
      (
        await stack.privileged.rpc("resume_parse_load", {
          p_task: activeLease.taskId,
          p_token: activeLease.token,
        })
      ).error?.message,
    ).toBe("RF_FORBIDDEN");
    await stack.sql.query("select pgmq.archive('rolefoundry_tasks',$1::bigint)", [
      activeLease.messageId,
    ]);
  });
  it("cleans real private source objects after hard owner deletion and expires download intents", async () => {
    const document = await confirmed(),
      run = await stack.request(
        `resumes/${document.id}/exports`,
        owner,
        "POST",
        { versionId: document.currentVersion!.id },
        { "Idempotency-Key": id() },
      );
    expect(run.status).toBe(202);
    const exported = (await run.json()).data;
    await worker();
    const permitResponse = await stack.request(
      `resume-exports/${exported.id}/download-intents`,
      owner,
      "POST",
      {},
    );
    expect(permitResponse.status).toBe(201);
    const permit = (await permitResponse.json()).data;
    await stack.sql.query(
      "update public.resume_downloads set expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [permit.id],
    );
    expect((await stack.request(`resume-downloads/${permit.id}`, owner)).status).toBe(404);
    const removed = await stack.member(),
      source = await upload(
        await pdf("Authored source for account deletion."),
        "deleted.pdf",
        removed,
      ),
      lease = await claim(source.document.taskId!);
    retiredUsers.push(removed.id);
    const key = (
      await stack.sql.query("select source_key from public.resume_documents where id=$1", [
        source.document.id,
      ])
    ).rows[0].source_key;
    checked((await stack.privileged.auth.admin.deleteUser(removed.id)).error);
    stack.users.splice(
      stack.users.findIndex((user) => user.id === removed.id),
      1,
    );
    expect(
      (
        await stack.privileged.rpc("resume_parse_load", {
          p_task: lease.taskId,
          p_token: lease.token,
        })
      ).error?.message,
    ).toBe("RF_NOT_FOUND");
    await worker();
    expect(
      (await stack.privileged.storage.from("rolefoundry-resumes").download(key)).error,
    ).not.toBeNull();
    expect(
      (
        await stack.sql.query(
          "select count(*)::integer n from public.resume_storage_objects where object_key=$1",
          [key],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

it("retries an exhausted parse against the same immutable source with a new idempotent task", async () => {
  const original = await paste(
      "Authored immutable source to recover after infrastructure failure.",
    ),
    lease = await claim(original.taskId);
  await stack.sql.query(
    "update public.tasks set status='failed',safe_error='RF_RETRY_EXHAUSTED',lease_token=null,lease_expires_at=null where id=$1",
    [lease.taskId],
  );
  const key = id();
  const wrong = await stack.request(
    `resumes/${original.documentId}/parse`,
    owner,
    "POST",
    { previousTaskId: id() },
    { "Idempotency-Key": id() },
  );
  expect(wrong.status).toBe(409);
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      stack.request(
        `resumes/${original.documentId}/parse`,
        owner,
        "POST",
        { previousTaskId: original.taskId },
        { "Idempotency-Key": key },
      ),
    ),
  );
  for (const response of attempts) expect(response.status).toBe(202);
  const results = await Promise.all(attempts.map((response) => response.json()));
  expect(new Set(results.map((result) => result.data.taskId)).size).toBe(1);
  expect(results[0].data.taskId).not.toBe(original.taskId);
  await worker();
  expect((await get(original.documentId)).draft!.text).toBe(
    "Authored immutable source to recover after infrastructure failure.",
  );
});

async function browserContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  user?: LocalMember,
) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
async function twoPagePdf() {
  const document = new PDFDocument(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  document.text("Maintained documentation for a team.");
  document.addPage().text("Building a retrieval prototype with Python. Evaluation is in progress.");
  document.end();
  return done;
}
it("runs the actual mobile upload, confirmation, partial acceptance, fixed download and source-link journey", async () => {
  const browser = await chromium.launch({ headless: true }),
    context = await browserContext(browser, owner),
    page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${stack.origin}/resume/?job=${jobId}`);
    await webExpect(
      page.getByRole("button", { name: "Upload private resume", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Resume file", { exact: true }).setInputFiles({
      name: `${prefix}-browser.pdf`,
      mimeType: "application/pdf",
      buffer: await twoPagePdf(),
    });
    const stored = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/resumes/") &&
        response.url().endsWith("/source/"),
    );
    await page.getByRole("button", { name: "Upload private resume", exact: true }).click();
    expect((await stored).status()).toBe(200);
    await worker();
    await webExpect(page.getByLabel("Statement 1", { exact: true })).toBeVisible();
    await webExpect(page.getByLabel("Statement 2", { exact: true })).toBeVisible();
    await page
      .getByLabel("Resume section heading", { exact: true })
      .first()
      .fill("Projects / 專案");
    await page.getByLabel("Completion state 1", { exact: true }).selectOption("completed");
    await page.getByLabel("Linked skills 1", { exact: true }).selectOption(["content"]);
    await page.getByLabel("Statement type 2", { exact: true }).selectOption("project");
    await page.getByLabel("Completion state 2", { exact: true }).selectOption("in-progress");
    await page.getByLabel("Linked skills 2", { exact: true }).selectOption(["python", "rag"]);
    await page
      .getByRole("button", { name: "Confirm facts and linked claims", exact: true })
      .click();
    await webExpect(
      page.getByRole("heading", { name: "Targeted review and fixed exports" }),
    ).toBeVisible();
    await page.getByLabel("Resume target role", { exact: true }).selectOption(jobId);
    await page.getByRole("button", { name: "Suggest a fact-preserving order" }).click();
    await worker();
    await webExpect(page.getByLabel("Accept this change")).toHaveCount(1);
    await page.getByLabel("Accept this change").check();
    await page.getByRole("button", { name: "Save selected changes as a new version" }).click();
    await webExpect(
      page.getByText("Your individual choices were saved as a new version."),
    ).toBeVisible();
    await page.getByRole("button", { name: "View version 2", exact: true }).click();
    await webExpect(
      page.getByRole("heading", { name: "Confirmed version 2", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create a fixed PDF export", exact: true }).click();
    await worker();
    await webExpect(
      page.getByRole("button", { name: "Download fixed PDF", exact: true }).first(),
    ).toBeEnabled();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download fixed PDF", exact: true }).first().click();
    const downloaded = await download;
    await downloaded.saveAs(".local/resume-browser-mobile.pdf");
    expect((await readFile(".local/resume-browser-mobile.pdf")).subarray(0, 5).toString()).toBe(
      "%PDF-",
    );
    const selected = new URL(page.url()).searchParams.get("document")!;
    const saved = await get(selected);
    expect(saved.currentVersion!.version).toBe(2);
    expect(saved.confirmedClaimCount).toBe(2);
    expect(
      saved.currentVersion!.content.facts.find((fact) => fact.state === "in-progress")!.text,
    ).toContain("Evaluation is in progress.");
    await page.reload();
    await webExpect(
      page.getByRole("heading", { name: "Confirmed version 2", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .getByRole("heading", { name: "Review and confirm the facts", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".local/resume-editor-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".local/resume-private-desktop.png" });
    await page.goto(`${stack.origin}/skills/`);
    await page
      .getByRole("link", { name: "View confirmed resume source", exact: true })
      .first()
      .click();
    await webExpect(page).toHaveURL(/\/resume\/\?.*version=/);
    await webExpect(
      page.getByRole("heading", { name: /Confirmed version \d/ }).first(),
    ).toBeVisible();
    await page.goto(`${stack.origin}/resume/?document=${selected}`);
    await webExpect(
      page.getByRole("button", { name: "Delete this private resume", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete this private resume", exact: true }).click();
    await page.getByRole("button", { name: "Delete source and derived data", exact: true }).click();
    await webExpect(
      page
        .getByRole("status")
        .filter({ hasText: "Resume access and derived claims were removed." }),
    ).toBeVisible();
    expect((await stack.request(`resumes/${selected}`, owner)).status).toBe(404);
    await worker();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
it("offers a real paste fallback after an empty file and hides private controls from anonymous visitors", async () => {
  const browser = await chromium.launch({ headless: true }),
    context = await browserContext(browser, owner),
    page = await context.newPage();
  try {
    await page.goto(`${stack.origin}/resume/`);
    await page.getByLabel("Resume file", { exact: true }).setInputFiles({
      name: `${prefix}-empty.pdf`,
      mimeType: "application/pdf",
      buffer: await pdf(""),
    });
    await page.getByRole("button", { name: "Upload private resume", exact: true }).click();
    await webExpect(
      page.getByRole("button", { name: "Check resume status", exact: true }),
    ).toBeVisible();
    await worker();
    await webExpect(
      page.getByText(
        "No extractable text was found. Scanned documents can use the paste-text option.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByText("Paste text instead", { exact: true }).click();
    await page
      .getByLabel("Paste resume text", { exact: true })
      .fill("A learning goal for an authored test.\n\nAn owner-added statement for review.");
    await page.getByRole("button", { name: "Create a private text draft", exact: true }).click();
    await worker();
    await webExpect(page.getByLabel("Statement 1", { exact: true })).toBeVisible();
    await page.getByLabel("Completion state 1", { exact: true }).selectOption("learning");
    await page.getByLabel("Linked skills 1", { exact: true }).selectOption(["python"]);
    await page
      .getByRole("button", { name: "Confirm facts and linked claims", exact: true })
      .click();
    await webExpect(
      page.getByRole("heading", { name: "Targeted review and fixed exports" }),
    ).toBeVisible();
    const selected = new URL(page.url()).searchParams.get("document")!;
    expect((await get(selected)).confirmedClaimCount).toBe(0);
    const anonymous = await browserContext(browser);
    try {
      const visitor = await anonymous.newPage();
      await visitor.goto(`${stack.origin}/resume/?document=${selected}`);
      await webExpect(
        visitor.getByRole("link", { name: "Sign in to your private workspace" }),
      ).toBeVisible();
      await webExpect(
        visitor.getByRole("button", { name: "Upload private resume", exact: true }),
      ).toHaveCount(0);
      await webExpect(visitor.getByLabel("Statement 1", { exact: true })).toHaveCount(0);
    } finally {
      await anonymous.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }
});

it("uses actual DOCX storage and parsing with retained Unicode source spans", async () => {
  const archive = new ZipFile(),
    chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    archive.outputStream.on("data", (chunk) => chunks.push(chunk));
    archive.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  const files = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml":
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Authored DOCX source &amp; private facts.</w:t></w:r></w:p><w:p><w:r><w:t>工作中的專案。</w:t></w:r></w:p></w:body></w:document>',
  };
  for (const [name, text] of Object.entries(files)) archive.addBuffer(Buffer.from(text), name);
  archive.end();
  const { document } = await upload(
    await done,
    "source.docx",
    owner,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  await worker();
  const parsed = await get(document.id);
  expect(parsed.status).toBe("parsed");
  expect(parsed.draft!.text).toContain("Authored DOCX source & private facts.");
  expect(parsed.draft!.text).toContain("工作中的專案。");
  for (const block of parsed.draft!.blocks)
    expect(parsed.draft!.text.slice(block.source.start, block.source.end)).toBe(block.text);
});
it("pins dictionary history and resolves reviewed canonical merges without rewriting confirmed source facts", async () => {
  let version = (await (await stack.request("skills")).json()).data.version;
  const from = `${prefix}-legacy`;
  const created = await stack.request("admin/skills", admin, "POST", {
    id: from,
    nameEn: `${prefix} legacy skill`,
    nameZhTw: `${prefix} local label`,
    description: "Isolated resume canonical projection",
    expectedVersion: version,
    reason: "Authored resume integration fixture",
  });
  expect(created.status).toBe(201);
  conceptIds.push(from);
  version = (await created.json()).data.version;
  const task = await paste();
  await worker();
  const draft = await get(task.documentId),
    facts = content(draft);
  facts.facts[1].skillIds = [from];
  const original = await confirm(draft, facts),
    source = structuredClone(original.currentVersion!);
  const merged = await stack.request("admin/skills/merge", admin, "POST", {
    fromId: from,
    toId: "python",
    expectedVersion: version,
    reason: "Reviewed synthetic alias for this source fixture",
  });
  expect(merged.status).toBe(200);
  const run = await revise(original),
    snapshot = (
      await stack.sql.query("select input_snapshot from public.revision_proposals where id=$1", [
        run.id,
      ])
    ).rows[0].input_snapshot;
  expect(snapshot.version).toEqual(source);
  expect(snapshot.canonicalSkillIds[from]).toBe("python");
  expect(snapshot.dictionaryVersion).toBeGreaterThan(source.dictionaryVersion!);
  await worker();
  const proposal = await stack.request(`resume-revisions/${run.id}`, owner);
  expect((await proposal.json()).data.output.changes[0].factIds[0]).toBe(
    source.content.facts[1].id,
  );
  expect((await (await stack.request(`resume-versions/${source.id}`, owner)).json()).data).toEqual(
    source,
  );
});
