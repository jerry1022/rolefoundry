# 12 — Background worker and tasks

## Responsibility

Run slow operations outside request handlers: catalog import, resume parse/revise/export, grading, match refresh and learning-plan generation. Provide durable state and predictable recovery.

## Current implementation

`apps/worker/src/index.ts` parses the task schema and executes one dry-run transition. It does not poll a queue, read credentials or pretend to process a document. `npm run worker:demo` demonstrates the contract only.

Module 05 now implements the required durable core: authoritative tasks, task-ID-only pgmq messages, atomic enqueue, lease/heartbeat/reclaim, three-attempt transient retries, stale/owner publication guards, crash-after-commit archival, bounded handler/transport deadlines, shutdown and safe metrics. `apps/worker/src/main.ts` runs the real independent process through injected queue/handler ports. `assessment.grade`, `matches.refresh`, `learning.plan`, `resume.parse`, `resume.revise`, `resume.export`, `catalog.fetch` and `catalog.import` are implemented handlers; the reference-only resume Storage janitor also runs in this process and survives source-owner deletion. Module 10 also runs bounded due-source scheduling in this process, with exact deployment definitions, sealed input, source/owner guards and persisted provider waits; see [ingestion execution and scheduling](../INGESTION_SETUP.md). See [resume version, lease and cleanup contracts](../RESUME_SETUP.md); learning snapshots, budgets, independent progress and immediate deletion guards are documented in [learning setup](../LEARNING_SETUP.md); matching snapshots, source validation and deletion guards are documented in [matching setup](../MATCHING_SETUP.md). See [worker setup and test scope](../ASSESSMENT_SETUP.md). Other domain handlers, identity provider reservation dispatch, invalidation outbox consumers, provider concurrency limits and operational alerting remain module 12 integration work. The worker does not make AI calls.

## Target task record

Store ID, owner, type, input version, idempotency key, state, attempt count, created/started/finished timestamps, lease expiry, result reference and safe error code. Queue payloads contain task IDs, not full resumes. The task table is authoritative; queue messages are delivery mechanisms.

## Lifecycle

`queued → running → succeeded` or `running → queued` for bounded retry, eventually `failed`. A crashed lease can be reclaimed. Start at a maximum of three attempts with exponential backoff and jitter; distinguish validation/authorization errors from transient infrastructure errors. An operator requeue creates an audited new attempt and preserves history.

Create the domain record, task and queue message in one PostgreSQL transaction. A worker reads a message, atomically acquires a task lease, checks owner/input validity, executes the handler, commits the result and terminal state, then archives the message. Extend a lease for long work. An expired lease can result in redelivery, so every handler must use idempotent result writes and a stable source version.

## Concurrency and shutdown

Configure separate concurrency budgets for document parsing and provider calls. Stop acquiring messages on shutdown, finish bounded in-flight work or release leases, and record heartbeat timestamps. The worker is a container/long-lived process; it is not deployed as an indefinitely running Vercel request.

## Failure handling

If a result commits before message archival and the message returns, the next handler observes success and archives without republishing. A provider call completed before a crash may be billed twice after retry; monitor this rather than promising exactly-once execution. Deleted or revoked-owner tasks are invalidated before side effects and before result publication.

## Acceptance tests

Simulate duplicate delivery, lease expiry, crash before/after commit, provider timeout, poison payload, stale input, owner deletion and graceful shutdown. Verify that queue age, lease age, retries and terminal failures are observable.
