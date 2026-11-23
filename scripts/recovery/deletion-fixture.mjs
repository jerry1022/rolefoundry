import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";
import { AccountDeletionHandler } from "../../src/modules/account-deletion/handler.ts";
import { SupabaseDeletionExecution } from "../../src/modules/account-deletion/adapters/supabase.ts";
import { SupabaseDeletionDirectory } from "../../src/modules/account-deletion/adapters/directory.ts";
import { SupabaseDeletionFiles } from "../../src/modules/account-deletion/adapters/storage.ts";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase.ts";
import { readDeletionLedger, applyDeletionLedger } from "./deletion-ledger.mjs";
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const checked = ({ data, error }) => {
  if (error) throw Error("Controlled recovery fixture service operation failed.");
  return data;
};
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** Uses only its own synthetic identity and request; never drains the source queue/janitors. */
export function deletionFixture(env, source, runDirectory) {
  const origin = new URL(env.API_URL);
  if (
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    origin.port !== "54321" ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw Error("Recovery fixtures accept only this project's loopback API on port 54321.");
  let subject, owner, bytes, accessToken;
  const audit = randomUUID(),
    assessmentAudit = randomUUID(),
    invitation = randomUUID(),
    doc = randomUUID(),
    reference = randomUUID(),
    request = randomUUID();
  const secret = randomBytes(32).toString("hex"),
    email = `rf-recovery-${randomUUID()}@identity.test.invalid`;
  const ledgerPath = path.join(runDirectory, "deletion-ledger.json");
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options);
  let key;
  async function cleanReference(sql, client) {
    // Claim just the fixture reference; the ordinary janitor would affect unrelated source users.
    const token = randomUUID();
    const claimed = await sql.query(
      "update public.resume_storage_objects set cleanup_token=$2,cleanup_expires_at=clock_timestamp()+interval '30 seconds' where id=$1 and purge_after<=clock_timestamp() and (cleanup_expires_at is null or cleanup_expires_at<=clock_timestamp()) returning id",
      [reference, token],
    );
    if (claimed.rowCount) {
      checked(await client.storage.from("rolefoundry-resumes").remove([key]));
      checked(await client.rpc("resume_cleanup_ack", { p_id: reference, p_token: token }));
    }
  }
  async function execute(sql, client) {
    const token = randomUUID(),
      worker = randomUUID();
    let task;
    await sql.query("begin");
    try {
      const row = (
        await sql.query(
          "select t.id,t.queue_message_id::text message from public.account_deletions d join public.tasks t on t.id=d.task_id join public.task_erasure_grants g on g.task_id=t.id where d.id=$1 and d.subject_id=$2 and g.active and g.subject_id=d.subject_id and g.request_id=d.id and t.kind='account.delete' and t.source_ref=d.id and t.status='queued' for update of t",
          [request, subject],
        )
      ).rows[0];
      assert(row, "Owned recovery erasure task was not available.");
      await sql.query(
        "update public.tasks set status='running',attempt_count=attempt_count+1,worker_id=$2,lease_token=$3,lease_expires_at=clock_timestamp()+interval '30 seconds',heartbeat_at=clock_timestamp(),started_at=coalesce(started_at,clock_timestamp()) where id=$1",
        [row.id, worker, token],
      );
      await sql.query("select pgmq.set_vt('rolefoundry_tasks',$1,30)", [row.message]);
      await sql.query(
        "insert into public.task_events(task_id,worker_id,event) values($1,$2,'task.claimed')",
        [row.id, worker],
      );
      task = {
        taskId: row.id,
        messageId: row.message,
        kind: "account.delete",
        token,
        leaseSeconds: 30,
      };
      await sql.query("commit");
    } catch (error) {
      await sql.query("rollback");
      throw error;
    }
    const handler = new AccountDeletionHandler(
      new SupabaseDeletionExecution(client),
      new SupabaseDeletionDirectory(client),
      new SupabaseDeletionFiles(client),
    );
    const outcome = await handler.execute(task, AbortSignal.timeout(15000));
    assert(outcome !== "deferred", "Controlled erasure unexpectedly deferred.");
    await new SupabaseTaskQueue(client).acknowledge(task);
    assert(
      (await sql.query("select phase from public.account_deletions where id=$1", [request])).rows[0]
        ?.phase === "completed",
      "Erasure was not durably completed.",
    );
  }
  return {
    async prepare() {
      await source.query(
        "insert into public.invitations(id,email_hash,expires_at) values($1,public.identity_email_hash($2),clock_timestamp()+interval '1 day')",
        [invitation, email],
      );
      const created = checked(await admin.auth.admin.createUser({ email, email_confirm: true }));
      subject = created.user.id;
      const link = checked(await admin.auth.admin.generateLink({ type: "magiclink", email }));
      owner = createClient(env.API_URL, env.ANON_KEY, options);
      const verified = checked(
        await owner.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" }),
      );
      accessToken = verified.session.access_token;
      checked(await owner.rpc("identity_activate"));
      await source.query(
        "insert into public.identity_audit(id,actor_id,subject_id,action,reason) values($1,$2,$2,'recovery.fixture','Synthetic private audit context')",
        [audit, subject],
      );
      await source.query(
        "insert into public.assessment_audit(id,actor_id,action,reason) values($1,$2,'recovery.fixture','Synthetic private assessment context')",
        [assessmentAudit, subject],
      );
      await source.query(
        "insert into public.career_preferences(user_id,name) values($1,'Controlled recovery fixture') on conflict(user_id) do update set name=excluded.name",
        [subject],
      );
      const pdf = new PDFDocument({ size: "A4" });
      const chunks = [];
      const done = new Promise((resolve, reject) => {
        pdf.on("data", (part) => chunks.push(part));
        pdf.once("end", resolve);
        pdf.once("error", reject);
      });
      pdf.text("Synthetic RoleFoundry recovery fixture. No real person data.");
      pdf.end();
      await done;
      bytes = Buffer.concat(chunks);
      key = `${subject}/${doc}/source/${randomUUID()}`;
      checked(
        await admin.storage
          .from("rolefoundry-resumes")
          .upload(key, bytes, { contentType: "application/pdf" }),
      );
      await source.query(
        "insert into public.resume_documents(id,user_id,filename,source_kind,media_type,byte_count,source_key,request_key,request_hash,status) values($1,$2,'recovery.pdf','file','application/pdf',$3,$4,$5,'controlled-recovery','uploading')",
        [doc, subject, bytes.length, key, randomUUID()],
      );
      await source.query(
        "insert into public.resume_storage_objects(id,document_id,user_id,object_key,kind,purge_after) values($1,$2,$3,$4,'source',clock_timestamp()+interval '1 day')",
        [reference, doc, subject, key],
      );
    },
    async afterBackup() {
      checked(
        await owner.rpc("account_deletion_request", {
          p_id: request,
          p_secret: secret,
          p_confirmation: "DELETE",
        }),
      );
      await cleanReference(source, admin);
      await execute(source, admin);
      assert(
        !(await source.query("select 1 from auth.users where id=$1", [subject])).rowCount,
        "Source fixture identity was not deleted.",
      );
      const entries = (
        await source.query(
          `select id as "requestId",subject_id as "subjectId",to_char(requested_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "requestedAt",to_char(completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "completedAt" from public.account_deletions where id=$1`,
          [request],
        )
      ).rows;
      await writeFile(
        ledgerPath,
        JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    },
    async verify(restored, services, runId) {
      const client = createClient("http://recovery.invalid", env.SERVICE_ROLE_KEY, {
        ...options,
        global: { fetch: services.fetch },
      });
      const oldOwner = createClient("http://recovery.invalid", env.ANON_KEY, {
        ...options,
        global: { fetch: services.fetch, headers: { Authorization: `Bearer ${accessToken}` } },
      });
      assert(
        checked(await client.auth.admin.getUserById(subject)).user.id === subject,
        "Restored Auth did not contain the pre-deletion fixture.",
      );
      assert(
        checked(await oldOwner.from("career_preferences").select("name")).length === 1,
        "Old fixture token did not reproduce pre-overlay access.",
      );
      // Object backups are independent of pg_dump. Seed only this controlled object's bytes.
      checked(
        await client.storage
          .from("rolefoundry-resumes")
          .upload(key, bytes, { contentType: "application/pdf", upsert: true }),
      );
      const recovered = checked(await client.storage.from("rolefoundry-resumes").download(key));
      assert(
        hash(Buffer.from(await recovered.arrayBuffer())) === hash(bytes),
        "Controlled restored object byte hash differed.",
      );
      const { ledger, fileDigest } = await readDeletionLedger(ledgerPath);
      // Service privileges do not bypass source/ownership guards.
      let rejected = false;
      try {
        await applyDeletionLedger(source, runId, ledger);
      } catch (error) {
        rejected = error.message.includes("RF_RECOVERY_TARGET_REQUIRED");
      }
      assert(rejected, "Recovery overlay accepted the live source database.");
      for (const invalid of [
        null,
        [],
        {},
        { ...ledger, version: 2 },
        { ...ledger, entries: [...ledger.entries, ...ledger.entries] },
        { ...ledger, entries: [{ ...ledger.entries[0], requestedAt: "2026-02-30T00:00:00Z" }] },
      ]) {
        rejected = false;
        try {
          await restored.query("select public.recovery_apply_deletion_ledger($1,$2::jsonb)", [
            runId,
            JSON.stringify(invalid),
          ]);
        } catch (error) {
          rejected = error.message.includes("RF_INVALID_LEDGER");
        }
        assert(rejected, "Database ledger validation accepted an invalid payload.");
      }
      rejected = false;
      try {
        await applyDeletionLedger(restored, "0".repeat(32), ledger);
      } catch (error) {
        rejected = error.message.includes("RF_RECOVERY_TARGET_REQUIRED");
      }
      assert(rejected, "Recovery overlay accepted another run identifier.");
      const acl = (
        await restored.query(
          "select has_function_privilege('anon','public.recovery_apply_deletion_ledger(text,jsonb)','EXECUTE') a,has_function_privilege('authenticated','public.recovery_apply_deletion_ledger(text,jsonb)','EXECUTE') b",
        )
      ).rows[0];
      assert(!acl.a && !acl.b, "Recovery overlay was exposed to browser roles.");
      const anonymous = createClient("http://recovery.invalid", env.ANON_KEY, {
        ...options,
        global: { fetch: services.fetch },
      });
      for (const browser of [anonymous, oldOwner]) {
        const denied = await browser.rpc("recovery_apply_deletion_ledger", {
          p_run: runId,
          p_ledger: ledger,
        });
        assert(denied.error, "A browser role executed the recovery overlay through REST.");
      }
      const collisionSubject = "ffffffff-ffff-4fff-afff-ffffffffffff",
        collisionRequest = randomUUID();
      await restored.query(
        "insert into public.account_deletions(id,subject_id,requested_at) values($1,$2,$3)",
        [collisionRequest, collisionSubject, ledger.entries[0].requestedAt],
      );
      rejected = false;
      try {
        await applyDeletionLedger(restored, runId, {
          ...ledger,
          entries: [
            ...ledger.entries,
            { ...ledger.entries[0], subjectId: collisionSubject, requestId: randomUUID() },
          ],
        });
      } catch (error) {
        rejected = error.message.includes("RF_LEDGER_CONFLICT");
      }
      assert(
        rejected &&
          !(await restored.query("select 1 from public.account_deletions where id=$1", [request]))
            .rowCount &&
          (await restored.query("select 1 from public.profiles where user_id=$1", [subject]))
            .rowCount === 1,
        "Conflicting ledger partially changed the target.",
      );
      await restored.query("delete from public.account_deletions where id=$1", [collisionRequest]);
      const first = await applyDeletionLedger(restored, runId, ledger),
        again = await applyDeletionLedger(restored, runId, ledger);
      assert(
        (
          await restored.query(
            "select count(*)::int n from public.recovery_deletion_overlays where run_id=$1",
            [runId],
          )
        ).rows[0].n === 1,
        "Ledger application audit was missing or duplicated.",
      );
      assert(
        first.entries[0].action === "queued" &&
          again.entries[0].action === "unchanged" &&
          first.entries[0].taskId === again.entries[0].taskId,
        "Ledger overlay was not idempotent.",
      );
      assert(
        checked(await oldOwner.from("career_preferences").select("name")).length === 0,
        "Old fixture token regained private data after overlay.",
      );
      // A new invitation cannot bypass the retained marker when no profile exists.
      await restored.query(
        "insert into public.invitations(email_hash,expires_at) values(public.identity_email_hash($1),clock_timestamp()+interval '1 day') on conflict(email_hash) do update set used_at=null,used_by=null",
        [email],
      );
      const activation = await oldOwner.rpc("identity_activate");
      assert(
        activation.error?.message.includes("RF_FORBIDDEN"),
        "Restored deleted identity could reactivate.",
      );
      assert(
        !(await restored.query("select 1 from public.profiles where user_id=$1", [subject]))
          .rowCount,
        "Restored private profile survived overlay.",
      );
      assert(
        (
          await restored.query("select user_id from public.tasks where id=$1", [
            first.entries[0].taskId,
          ])
        ).rows[0]?.user_id === null,
        "Recovery erasure did not survive profile removal.",
      );
      assert(
        (
          await restored.query(
            "select reason,actor_id,subject_id from public.identity_audit where id=$1",
            [audit],
          )
        ).rows.some(
          (row) => row.reason === null && row.actor_id === null && row.subject_id === null,
        ),
        "Restored identity audit retained private context.",
      );
      assert(
        (
          await restored.query("select reason,actor_id from public.assessment_audit where id=$1", [
            assessmentAudit,
          ])
        ).rows.some((row) => row.reason === null && row.actor_id === null),
        "Restored assessment audit retained private context.",
      );
      await cleanReference(restored, client);
      await execute(restored, client);
      for (const [table, column] of [
        ["auth.users", "id"],
        ["auth.sessions", "user_id"],
        ["auth.identities", "user_id"],
        ["public.profiles", "user_id"],
        ["public.career_preferences", "user_id"],
      ])
        assert(
          !(await restored.query(`select 1 from ${table} where ${column}=$1`, [subject])).rowCount,
          "Restored identity or private records survived erasure.",
        );
      assert(
        !(
          await restored.query(
            "select 1 from storage.objects where bucket_id='rolefoundry-resumes' and name=$1",
            [key],
          )
        ).rowCount,
        "Restored file metadata survived erasure.",
      );
      assert(
        !(
          await restored.query("select 1 from public.resume_storage_objects where id=$1", [
            reference,
          ])
        ).rowCount,
        "Restored file reference survived erasure.",
      );
      assert(
        (await client.storage.from("rolefoundry-resumes").download(key)).error,
        "Restored file remained downloadable after erasure.",
      );
      assert(
        (await applyDeletionLedger(restored, runId, ledger)).entries[0].action === "unchanged",
        "Completed clean replay was not idempotent.",
      );
      return {
        ledgerFileDigest: fileDigest,
        ledgerDigest: first.ledgerDigest,
        entries: 1,
        postBackupSourceDeletion: true,
        preOverlayAccessReproduced: true,
        oldTokenPrivateAccessBlocked: true,
        reactivationBlocked: true,
        controlledObjectBytesVerified: true,
        authAndStorageServiceErasure: true,
        orphanErasureCompleted: true,
        idempotentOverlay: true,
        sourceAndOwnershipGuard: true,
        browserRoleDenial: true,
        invalidLedgerDenial: true,
        atomicConflictRollback: true,
        auditContextMinimizedBeforeCascade: true,
      };
    },
    async cleanup() {
      if (subject) {
        if (key) checked(await admin.storage.from("rolefoundry-resumes").remove([key]));
        await source.query("delete from public.resume_storage_objects where id=$1", [reference]);
        if ((await source.query("select 1 from auth.users where id=$1", [subject])).rowCount)
          checked(await admin.auth.admin.deleteUser(subject));
        const tasks = (
          await source.query(
            "select t.id from public.tasks t left join public.task_erasure_grants g on g.task_id=t.id where t.source_ref=$1 or g.subject_id=$2",
            [request, subject],
          )
        ).rows.map((row) => row.id);
        await source.query("delete from public.account_deletions where subject_id=$1 and id=$2", [
          subject,
          request,
        ]);
        await source.query(
          "delete from pgmq.q_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
          [tasks],
        );
        await source.query(
          "delete from pgmq.a_rolefoundry_tasks where message->>'taskId'=any($1::text[])",
          [tasks],
        );
        await source.query("delete from public.tasks where id=any($1::uuid[])", [tasks]);
        await source.query("delete from public.resume_storage_objects where id=$1", [reference]);
        await source.query(
          "delete from public.identity_audit where resource_id=$1 or subject_id=$2 or actor_id=$2",
          [invitation, subject],
        );
      }
      await source.query("delete from public.identity_audit where id=$1", [audit]);
      await source.query("delete from public.assessment_audit where id=$1", [assessmentAudit]);
      await source.query(
        "delete from public.invitations where id=$1 and email_hash=public.identity_email_hash($2)",
        [invitation, email],
      );
      await rm(ledgerPath, { force: true });
    },
  };
}
