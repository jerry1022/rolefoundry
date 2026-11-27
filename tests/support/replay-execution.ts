import type { SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";
import { SupabaseTaskQueue } from "../../src/modules/tasks/adapters/supabase";
import type { TaskLease, TaskKind } from "../../src/modules/tasks/model";
import type { TaskHandler } from "../../src/modules/tasks/ports";
import { SupabaseAssessmentGrader } from "../../src/modules/assessment/adapters/supabase";
import { MatchingHandler } from "../../src/modules/matching/handler";
import { SupabaseMatchingExecutionStore } from "../../src/modules/matching/adapters/supabase";
import { LearningHandler } from "../../src/modules/learning/handler";
import { SupabaseLearningExecutionStore } from "../../src/modules/learning/adapters/supabase";
import { RuleLearningGapAnalyzer } from "../../src/modules/learning/adapters/matching";
import { IsolatedResumeProcessor } from "../../src/modules/resume/adapters/isolated-process";
import { ConfirmedFactOrderReviser } from "../../src/modules/resume/adapters/rules";
import {
  SupabaseResumeParseStore,
  SupabaseResumeRevisionStore,
  SupabaseResumeExportStore,
} from "../../src/modules/resume/adapters/execution";
import {
  SupabaseResumeStorage,
  Sha256ResumeDigest,
} from "../../src/modules/resume/adapters/storage";
import {
  ResumeParseHandler,
  ResumeRevisionHandler,
  ResumeExportHandler,
} from "../../src/modules/resume/handler";
import { ImportHandler } from "../../src/modules/ingestion/handler";
import { SupabaseImportExecutionStore } from "../../src/modules/ingestion/adapters/supabase";
import { FeedImportHandler } from "../../src/modules/ingestion/feed-handler";
import { SupabaseFeedExecutionStore } from "../../src/modules/ingestion/adapters/feed-store";
import { deploymentFeedRegistry } from "../../src/modules/ingestion/adapters/feed-config";
import { Sha256ImportKey, Sha256ImportDigest } from "../../src/modules/ingestion/adapters/identity";
import { AccountExportHandler } from "../../src/modules/account-data/handler";
import { SupabaseAccountExportExecution } from "../../src/modules/account-data/adapters/supabase";
import { SupabaseAccountArchiveStorage } from "../../src/modules/account-data/adapters/storage";
import { ZipAccountArchive } from "../../src/modules/account-data/adapters/archive";
import { AccountDeletionHandler } from "../../src/modules/account-deletion/handler";
import { SupabaseDeletionExecution } from "../../src/modules/account-deletion/adapters/supabase";
import { SupabaseDeletionDirectory } from "../../src/modules/account-deletion/adapters/directory";
import { SupabaseDeletionFiles } from "../../src/modules/account-deletion/adapters/storage";
/** Executes only explicitly owned task IDs; never acquires unrelated developer work. */
export class ReplayExecution {
  private readonly queue: SupabaseTaskQueue;
  private readonly handlers: Record<TaskKind, TaskHandler>;
  constructor(
    private readonly sql: pg.Pool,
    client: SupabaseClient,
    private readonly owned: Set<string>,
  ) {
    this.queue = new SupabaseTaskQueue(client);
    const storage = new SupabaseResumeStorage(client),
      digest = new Sha256ResumeDigest(),
      processor = new IsolatedResumeProcessor();
    this.handlers = {
      "assessment.grade": new SupabaseAssessmentGrader(client),
      "matches.refresh": new MatchingHandler(new SupabaseMatchingExecutionStore(client)),
      "learning.plan": new LearningHandler(
        new SupabaseLearningExecutionStore(client),
        new RuleLearningGapAnalyzer(),
      ),
      "resume.parse": new ResumeParseHandler(
        new SupabaseResumeParseStore(client, storage, digest),
        processor,
      ),
      "resume.revise": new ResumeRevisionHandler(
        new SupabaseResumeRevisionStore(client),
        new ConfirmedFactOrderReviser(),
      ),
      "resume.export": new ResumeExportHandler(
        new SupabaseResumeExportStore(client, storage, digest),
        processor,
        processor,
      ),
      "catalog.import": new ImportHandler(
        new SupabaseImportExecutionStore(client),
        new Sha256ImportKey(),
      ),
      // Controlled authorized fixture transport: no live publisher endpoint is contacted.
      "catalog.fetch": new FeedImportHandler(
        new SupabaseFeedExecutionStore(client),
        deploymentFeedRegistry(),
        { read: async () => JSON.stringify({ records: [] }) },
        new Sha256ImportDigest(),
      ),
      "account.export": new AccountExportHandler(
        new SupabaseAccountExportExecution(client),
        new SupabaseAccountArchiveStorage(client),
        new ZipAccountArchive(),
      ),
      "account.delete": new AccountDeletionHandler(
        new SupabaseDeletionExecution(client),
        new SupabaseDeletionDirectory(client),
        new SupabaseDeletionFiles(client),
      ),
    };
  }
  async claim(taskId: string): Promise<TaskLease> {
    if (!this.owned.has(taskId)) throw Error("Only an owned fixture task can be executed.");
    const connection = await this.sql.connect(),
      token = crypto.randomUUID(),
      worker = crypto.randomUUID();
    try {
      await connection.query("begin");
      const row = (
        await connection.query(
          "update public.tasks set status='running',attempt_count=attempt_count+1,worker_id=$2,lease_token=$3,lease_expires_at=clock_timestamp()+interval '30 seconds',heartbeat_at=clock_timestamp(),started_at=coalesce(started_at,clock_timestamp()) where id=$1 and status='queued' returning kind,queue_message_id::text message",
          [taskId, worker, token],
        )
      ).rows[0];
      if (!row) throw Error("Owned fixture task was not queued.");
      await connection.query("select pgmq.set_vt('rolefoundry_tasks',$1,30)", [row.message]);
      await connection.query(
        "insert into public.task_events(task_id,worker_id,event) values($1,$2,'task.claimed')",
        [taskId, worker],
      );
      await connection.query("commit");
      return { taskId, kind: row.kind, messageId: row.message, token, leaseSeconds: 30 };
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  }
  async exhaust(taskId: string, category: "infrastructure" | "validation" = "infrastructure") {
    for (let i = 0; i < (category === "infrastructure" ? 3 : 1); i++) {
      const lease = await this.claim(taskId);
      const outcome = await this.queue.fail(lease, category);
      await this.sql.query("update public.tasks set next_run_at=clock_timestamp() where id=$1", [
        taskId,
      ]);
      await this.sql.query(
        "select pgmq.set_vt('rolefoundry_tasks',queue_message_id,0) from public.tasks where id=$1",
        [taskId],
      );
      if (outcome.status === "failed") break;
    }
  }
  async execute(taskId: string) {
    const lease = await this.claim(taskId);
    const result = await this.handlers[lease.kind].execute(lease, AbortSignal.timeout(20000));
    if (result !== "deferred") await this.queue.acknowledge(lease);
    return lease;
  }
}
