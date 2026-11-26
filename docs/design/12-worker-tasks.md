# 12 — Background worker and tasks

## Responsibility

Run slow operations outside request handlers: catalog import, resume parse/revise/export, grading, match refresh and learning-plan generation. Provide durable state and predictable recovery.

## Current implementation

`apps/worker/src/index.ts` parses the task schema and executes one dry-run transition. It does not poll a queue, read credentials or pretend to process a document. `npm run worker:demo` demonstrates the contract only.

Module 05 now implements the required durable core: authoritative tasks, task-ID-only pgmq messages, atomic enqueue, lease/heartbeat/reclaim, three-attempt transient retries, stale/owner publication guards, crash-after-commit archival, bounded handler/transport deadlines, shutdown and safe metrics. `apps/worker/src/main.ts` runs the real independent process through injected queue/handler ports. `assessment.grade`, `matches.refresh`, `learning.plan`, `resume.parse`, `resume.revise`, `resume.export`, `catalog.fetch`, `catalog.import`, `account.export` and `account.delete` are implemented handlers; the reference-only resume Storage janitor also runs in this process and survives source-owner deletion. Module 10 also runs bounded due-source scheduling in this process, with exact deployment definitions, sealed input, source/owner guards and persisted provider waits; see [ingestion execution and scheduling](../INGESTION_SETUP.md). See [resume version, lease and cleanup contracts](../RESUME_SETUP.md); learning snapshots, budgets, independent progress and immediate deletion guards are documented in [learning setup](../LEARNING_SETUP.md); matching snapshots, source validation and deletion guards are documented in [matching setup](../MATCHING_SETUP.md). See [worker setup and test scope](../ASSESSMENT_SETUP.md). [Profile/dictionary invalidation consumers](../INVALIDATION_SETUP.md) now run as bounded worker maintenance through domain-owned matching/learning/resume contracts with atomic fenced receipts and persisted retry. Gateway-backed matching and resume analyses reserve identity allowance inside these handlers; [provider-wide concurrency slots and rolling token budgets](../AI_GATEWAY_SETUP.md) are shared across worker instances. Hosted alert delivery remains a deployment gate; the [owned alert rules and rehearsal](../TELEMETRY_SETUP.md) are local. The [account export handler and artifact janitor](../ACCOUNT_DATA_SETUP.md) add private data portability without model calls or analysis allowance. The worker makes provider calls only through module 11 for opted-in purposes; no provider is configured by default.

The [administrator diagnostics](../OPERATIONS_SETUP.md) now expose queue/ready age, lease/heartbeat age, terminal counts, retries, poison observations and recent worker coverage. The independent process reports bounded, failure-isolated presence through its own port; stale presence never grants or invalidates a task lease. External telemetry/alerts and provider budgets remain pending.

[Accepted erasure tasks](../ACCOUNT_DELETION_SETUP.md) now use a task-owned capability and nullable owner reference to finish after Auth deletion. Other task kinds keep their active-owner/three-attempt guards. Persisted continuations return `deferred`; registered erasure infrastructure failures retry with capped backoff until completion, while terminal faults require an audited new attempt. This is an explicit erasure policy, not a general bypass of owner or retry guards.

## Target task record

Store ID, owner, type, input version, idempotency key, state, attempt count, created/started/finished timestamps, lease expiry, result reference and safe error code. Queue payloads contain task IDs, not full resumes. The task table is authoritative; queue messages are delivery mechanisms.

## Lifecycle

`queued → running → succeeded` or `running → queued` for bounded retry, eventually `failed`. A crashed lease can be reclaimed. Start at a maximum of three attempts with exponential backoff and jitter; distinguish validation/authorization errors from transient infrastructure errors. An operator requeue creates an audited new attempt and preserves history.

Create the domain record, task and queue message in one PostgreSQL transaction. A worker reads a message, atomically acquires a task lease, checks owner/input validity, executes the handler, commits the result and terminal state, then archives the message. Extend a lease for long work. An expired lease can result in redelivery, so every handler must use idempotent result writes and a stable source version.

## Concurrency and shutdown

[Per-instance resource budgets](../WORKER_RESOURCE_SETUP.md) now independently constrain document parsing/PDF/ZIP processing, approved remote retrieval and general handler execution, with shared total limits and resource-aware queue admission. Provider-call concurrency is enforced separately through leased gateway slots. Stop acquiring messages on shutdown, finish bounded in-flight work or release leases, and record heartbeat timestamps. The worker is a container/long-lived process; it is not deployed as an indefinitely running Vercel request.

## Failure handling

If a result commits before message archival and the message returns, the next handler observes success and archives without republishing. A provider call completed before a crash may be billed twice after retry; monitor this rather than promising exactly-once execution. Deleted or revoked-owner tasks are invalidated before side effects and before result publication.

## Acceptance tests

Simulate duplicate delivery, lease expiry, crash before/after commit, provider timeout, poison payload, stale input, owner deletion and graceful shutdown. Verify that queue age, lease age, retries and terminal failures are observable.

[Administrator task recovery](../TASK_REPLAY_SETUP.md) now creates a new audited attempt through domain-owned binding functions, rechecking current owner/input/source authority and preserving old execution history. Explicit HTTP mutations are independent of diagnostics reads and do not resend old queue messages or alter retry counters. Per-instance handler resource budgets, provider-wide concurrency and rolling provider token budgets are implemented. Recovery itself never reserves allowance; opt-in analyses use the reservation made when the owner requested them. Invalidation delivery does not generate analysis or replace synchronous privacy/read/publication guards.
