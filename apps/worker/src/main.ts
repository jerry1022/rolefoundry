import {
  AccountDeletionHandler,
  LateDeletionJanitor,
} from "../../../src/modules/account-deletion/handler";
import {
  SupabaseDeletionExecution,
  SupabaseLateDeletionStore,
} from "../../../src/modules/account-deletion/adapters/supabase";
import { SupabaseDeletionDirectory } from "../../../src/modules/account-deletion/adapters/directory";
import { SupabaseDeletionFiles } from "../../../src/modules/account-deletion/adapters/storage";
import {
  AccountExportHandler,
  AccountExportJanitor,
} from "../../../src/modules/account-data/handler";
import {
  SupabaseAccountExportExecution,
  SupabaseAccountExportCleanup,
} from "../../../src/modules/account-data/adapters/supabase";
import { SupabaseAccountArchiveStorage } from "../../../src/modules/account-data/adapters/storage";
import { ZipAccountArchive } from "../../../src/modules/account-data/adapters/archive";
import { InvalidationDispatcher } from "../../../src/modules/invalidation/dispatcher";
import { SupabaseInvalidationStore } from "../../../src/modules/invalidation/adapters/supabase";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { WorkerPresence } from "../../../src/modules/tasks/presence";
import { SupabaseWorkerPresenceStore } from "../../../src/modules/tasks/adapters/presence";
import type { TaskHandler } from "../../../src/modules/tasks/ports";
import type { TaskKind } from "../../../src/modules/tasks/model";
import { TaskWorker } from "../../../src/modules/tasks/worker";
import { declareTaskResources } from "../../../src/modules/tasks/resources";
import { SupabaseTaskQueue } from "../../../src/modules/tasks/adapters/supabase";
import { SupabaseAssessmentGrader } from "../../../src/modules/assessment/adapters/supabase";
import { MatchingHandler } from "../../../src/modules/matching/handler";
import { semanticStageFromEnvironment } from "../../../src/modules/matching/adapters/semantic";
import { SupabaseMatchingExecutionStore } from "../../../src/modules/matching/adapters/supabase";
import { LearningHandler } from "../../../src/modules/learning/handler";
import { SupabaseLearningExecutionStore } from "../../../src/modules/learning/adapters/supabase";
import { RuleLearningGapAnalyzer } from "../../../src/modules/learning/adapters/matching";
import { IsolatedResumeProcessor } from "../../../src/modules/resume/adapters/isolated-process";
import { ConfirmedFactOrderReviser } from "../../../src/modules/resume/adapters/rules";
import {
  SupabaseResumeParseStore,
  SupabaseResumeRevisionStore,
  SupabaseResumeExportStore,
  SupabaseResumeCleanupRepository,
} from "../../../src/modules/resume/adapters/execution";
import {
  SupabaseResumeStorage,
  Sha256ResumeDigest,
} from "../../../src/modules/resume/adapters/storage";
import {
  ResumeParseHandler,
  ResumeRevisionHandler,
  ResumeExportHandler,
} from "../../../src/modules/resume/handler";
import { ResumeStorageJanitor } from "../../../src/modules/resume/cleanup";
import { FeedImportHandler, FeedScheduler } from "../../../src/modules/ingestion/feed-handler";
import { SafeFeedReader } from "../../../src/modules/ingestion/adapters/safe-feed";
import { deploymentFeedRegistry } from "../../../src/modules/ingestion/adapters/feed-config";
import { SupabaseFeedExecutionStore } from "../../../src/modules/ingestion/adapters/feed-store";
import { ImportHandler } from "../../../src/modules/ingestion/handler";
import {
  Sha256ImportKey,
  Sha256ImportDigest,
} from "../../../src/modules/ingestion/adapters/identity";
import { SupabaseImportExecutionStore } from "../../../src/modules/ingestion/adapters/supabase";
const config = z
  .object({
    url: z.url(),
    key: z.string().min(1),
    seconds: z.coerce.number().int().min(5).max(300),
    concurrency: z.coerce.number().int().min(1).max(8),
    documents: z.coerce.number().int().min(0).max(8),
    fetches: z.coerce.number().int().min(0).max(8),
    general: z.coerce.number().int().min(0).max(8),
  })
  .safeParse({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    seconds: process.env.WORKER_LEASE_SECONDS || 30,
    concurrency: process.env.WORKER_CONCURRENCY || 2,
    documents: process.env.WORKER_DOCUMENT_CONCURRENCY || 1,
    fetches: process.env.WORKER_FETCH_CONCURRENCY || 1,
    general: process.env.WORKER_GENERAL_CONCURRENCY || process.env.WORKER_CONCURRENCY || 2,
  });
if (!config.success)
  throw new Error("Worker configuration is missing or invalid; no credentials are printed.");
const target = new URL(config.data.url);
if (
  target.protocol !== "https:" &&
  !(target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
)
  throw new Error("Worker URL must use HTTPS except for loopback.");
const client = createClient(config.data.url, config.data.key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(10_000),
        ]),
      }),
  },
});
const resumeProcessor = new IsolatedResumeProcessor(),
  resumeStorage = new SupabaseResumeStorage(client),
  resumeDigest = new Sha256ResumeDigest();
const resumeJanitor = new ResumeStorageJanitor(
  new SupabaseResumeCleanupRepository(client),
  resumeStorage,
);
const accountStorage = new SupabaseAccountArchiveStorage(client),
  accountJanitor = new AccountExportJanitor(
    new SupabaseAccountExportCleanup(client),
    accountStorage,
  );
const deletionJanitor = new LateDeletionJanitor(
  new SupabaseLateDeletionStore(client),
  new SupabaseDeletionFiles(client),
);
const matchingStore = new SupabaseMatchingExecutionStore(client);
const controller = new AbortController();
const invalidationDispatcher = new InvalidationDispatcher(new SupabaseInvalidationStore(client));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
const feedRegistry = deploymentFeedRegistry(),
  feedStore = new SupabaseFeedExecutionStore(client),
  feedScheduler = new FeedScheduler(feedStore, feedRegistry);
let nextFeedScheduleAt = 0;
const handlers = {
  "account.delete": new AccountDeletionHandler(
    new SupabaseDeletionExecution(client),
    new SupabaseDeletionDirectory(client),
    new SupabaseDeletionFiles(client),
  ),
  "account.export": new AccountExportHandler(
    new SupabaseAccountExportExecution(client),
    accountStorage,
    new ZipAccountArchive(),
  ),
  "catalog.fetch": new FeedImportHandler(
    feedStore,
    feedRegistry,
    new SafeFeedReader(),
    new Sha256ImportDigest(),
  ),
  "catalog.import": new ImportHandler(
    new SupabaseImportExecutionStore(client),
    new Sha256ImportKey(),
  ),
  "resume.parse": new ResumeParseHandler(
    new SupabaseResumeParseStore(client, resumeStorage, resumeDigest),
    resumeProcessor,
  ),
  "resume.revise": new ResumeRevisionHandler(
    new SupabaseResumeRevisionStore(client),
    new ConfirmedFactOrderReviser(),
  ),
  "resume.export": new ResumeExportHandler(
    new SupabaseResumeExportStore(client, resumeStorage, resumeDigest),
    resumeProcessor,
    resumeProcessor,
  ),
  "assessment.grade": new SupabaseAssessmentGrader(client),
  "matches.refresh": new MatchingHandler(
    matchingStore,
    semanticStageFromEnvironment(client, matchingStore),
  ),
  "learning.plan": new LearningHandler(
    new SupabaseLearningExecutionStore(client),
    new RuleLearningGapAnalyzer(),
  ),
} satisfies Partial<Record<TaskKind, TaskHandler>>;
const resourceLimits = {
  documents: config.data.documents,
  fetch: config.data.fetches,
  general: config.data.general,
};
const declaration = declareTaskResources(Object.keys(handlers) as TaskKind[], resourceLimits);
const workerId = crypto.randomUUID(),
  presence = new WorkerPresence(
    new SupabaseWorkerPresenceStore(client),
    {
      id: workerId,
      kinds: declaration.kinds,
      leaseSeconds: config.data.seconds,
      concurrency: config.data.concurrency,
    },
    () =>
      console.error(
        JSON.stringify({ event: "worker.presence_unavailable", code: "RF_UNAVAILABLE" }),
      ),
  );
const worker = new TaskWorker(new SupabaseTaskQueue(client), handlers, {
  workerId,
  leaseSeconds: config.data.seconds,
  concurrency: config.data.concurrency,
  resourceLimits,
  log: (event) => console.log(JSON.stringify(event)),
});
console.log(
  JSON.stringify({
    event: "worker.resources",
    total: config.data.concurrency,
    documents: config.data.documents,
    fetch: config.data.fetches,
    general: config.data.general,
  }),
);
const once = process.argv.includes("--once"),
  drain = process.argv.includes("--drain");
let batches = 0;
const draining = () => void presence.report("draining");
controller.signal.addEventListener("abort", draining, { once: true });
if (controller.signal.aborted) draining();
await presence.report(declaration.state);
const presenceTimer = setInterval(() => void presence.report(declaration.state), 10000);
try {
  while (!controller.signal.aborted) {
    try {
      try {
        const result = await invalidationDispatcher.tick(controller.signal);
        if (result.completed || result.canceled)
          console.log(JSON.stringify({ event: "invalidation.dispatched", ...result }));
      } catch {
        if (!controller.signal.aborted)
          console.error(
            JSON.stringify({ event: "invalidation.unavailable", code: "RF_UNAVAILABLE" }),
          );
      }
      if (Date.now() >= nextFeedScheduleAt) {
        nextFeedScheduleAt = Date.now() + 60000;
        try {
          const queued = await feedScheduler.tick(controller.signal);
          if (queued) console.log(JSON.stringify({ event: "feed.scheduled", queued }));
        } catch {
          if (!controller.signal.aborted)
            console.error(
              JSON.stringify({ event: "feed.schedule_unavailable", code: "RF_UNAVAILABLE" }),
            );
        }
      }
      try {
        const removed = await resumeJanitor.tick(controller.signal);
        if (removed) console.log(JSON.stringify({ event: "resume.cleanup", removed }));
      } catch {
        if (!controller.signal.aborted)
          console.error(
            JSON.stringify({ event: "resume.cleanup_unavailable", code: "RF_UNAVAILABLE" }),
          );
      }
      try {
        await accountJanitor.tick(controller.signal);
      } catch {
        if (!controller.signal.aborted)
          console.error(
            JSON.stringify({ event: "account.cleanup_unavailable", code: "RF_UNAVAILABLE" }),
          );
      }
      try {
        await deletionJanitor.tick(controller.signal);
      } catch {
        if (!controller.signal.aborted)
          console.error(
            JSON.stringify({
              event: "account.erasure_cleanup_unavailable",
              code: "RF_UNAVAILABLE",
            }),
          );
      }
      const count = await worker.tick(controller.signal);
      batches++;
      if (once || (drain && (count === 0 || batches >= 100))) break;
      if (!count)
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 1000);
          controller.signal.addEventListener("abort", done, { once: true });
        });
    } catch {
      console.error(JSON.stringify({ event: "worker.unavailable", code: "RF_UNAVAILABLE" }));
      if (once || drain) {
        process.exitCode = 1;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} finally {
  clearInterval(presenceTimer);
  controller.signal.removeEventListener("abort", draining);
  await presence.report("stopped");
}
console.log(JSON.stringify({ event: "worker.stopped" }));
