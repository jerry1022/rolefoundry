# Worker resource budgets

The independent process has separate handler-execution limits for document processing, approved remote retrieval and general work, alongside its existing total concurrency limit. The queue adapter passes currently available slots to PostgreSQL; the worker core repeats admission checks so a replacement queue cannot bypass its handler limits.

These are limits for one worker instance. Multiple instances each have their own slots. Provider-wide rate/concurrency limits, shared cost reservations and AI dispatch remain Gateway integration work; deterministic matching/learning/revision tasks are not described as provider calls.

## Configure

Apply `20261114160000_worker_resource_budgets.sql` after the prior migrations, then run compatible worker code. The old `task_read` RPC remains compatible and delegates to the same owner/lease/retry implementation. New workers call `task_read_resources` with bounded remaining-resource counts. No new secret, table, hosted account or browser setting is required.

| Environment | Bounds/default | Meaning |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | Integer 1–8; default 2 | Maximum active task processing in this worker |
| `WORKER_DOCUMENT_CONCURRENCY` | Integer 0–8; default 1 | `resume.parse`, `resume.export`, `account.export` |
| `WORKER_FETCH_CONCURRENCY` | Integer 0–8; default 1 | `catalog.fetch` approved remote metadata retrieval |
| `WORKER_GENERAL_CONCURRENCY` | Integer 0–8; defaults to total concurrency | Fixed-choice grading, deterministic matching/learning/revision, catalog review planning and account erasure |

The effective count is bounded by both the pool ceiling and remaining total slots. Zero pauses new execution in that pool. In particular, pausing general work also pauses new account-erasure execution; accepted deletion still immediately blocks access through its independent service. Resource changes do not mutate already issued storage leases; normal shutdown/deadline behavior still applies. Apply resource changes by restarting the worker; malformed, fractional or out-of-range configuration fails closed before client construction and prints no credential.

Local helpers read existing ignored identity credentials and inherit shell resource settings:

```bash
npm run identity:start
npx supabase migration up
WORKER_CONCURRENCY=3 WORKER_DOCUMENT_CONCURRENCY=1 WORKER_FETCH_CONCURRENCY=1 WORKER_GENERAL_CONCURRENCY=2 npm run worker:local
```

For a hosted worker, set these values in its deployment environment alongside the existing Supabase settings. `.env.example` lists the defaults; the independent worker does not automatically load Next's `.env.local`. Startup emits a safe `worker.resources` record containing only numeric ceilings. Administrator presence advertises enabled task kinds and total concurrency. A fully paused worker reports the non-acquiring `draining` state while retaining its capability list for maintenance; it contributes no active task coverage. There is no new resource-policy editor. The public demo does not run this process or prove hosted configuration.

## Acquisition and execution

`TaskQueue.read` accepts optional `TaskResourceLimits`; existing callers can keep their four-argument contract. `SupabaseTaskQueue` selects the resource-aware RPC when those limits are supplied. The three-key JSON object is validated independently in SQL; negative, fractional, string-valued, missing or extra fields are rejected. Only the service role can execute the new reader. The kind-to-pool helper remains private.

The database inspects queue/task metadata to select eligible visible deliveries before using pgmq's normal conditional read. It filters paused/full pools and not-yet-ready or already-leased tasks, so a paused document backlog does not obstruct eligible general work. Standard poison/missing/terminal handling and all owner, erasure-grant, retry ceiling and lease-token checks remain in the shared implementation. Malformed payloads are checked before containment filtering, including the empty-object wildcard case. At most 64 deliveries are handled per acquisition, with at most eight new leases. The adapter's pgmq-specific metadata access stays behind the queue port and requires the reviewed project queue schema; replacing the queue must preserve these behavior tests.

A capacity-blocked task receives no new attempt, execution lease or retry backoff. Any selected-but-blocked duplicate/noncanonical delivery is restored to immediate visibility at the end of the transaction. A replacement adapter that returns excess leases causes the worker to promptly release them through the normal durable release operation, restoring attempt counts and visibility. The core does not wait under a task lease for another handler's resource slot.

Within the worker, acquisition is serialized and all admitted slots are reserved before handlers start. Slot accounting is shared across overlapping `tick` calls. Total and pool capacity remain held until each bounded processing path settles, including acknowledgment/failure/release. Shutdown, lease loss, timeouts and errors restore local capacity; rejected release operations are observed without abandoning already accepted handlers. Resource limits govern active worker executions, not physical work from a replacement handler that ignores cancellation after timeout. Actual document processing retains its isolated-process cancellation/deadline boundary and all publication writes still require current storage ownership.

The limits do not change visibility into private source data, consume an AI allowance or automatically recalculate analysis. Resume PDF and account ZIP exports remain fixed-version/private operations; course completion and parsing retain their existing evidence semantics. A resource pool is execution scheduling, not provider-purpose consent or quota authorization.

## Verify and operate

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/worker-resources.integration.test.ts
npm run identity:test
```

Ten unit cases exercise complete kind mapping, bounds, enabled/non-acquiring presence declarations, replacement-queue admission, overlapping execution/acquisition, paused pools, timeout recovery and transport/release failure. Five integration cases check anonymous/member/admin denial and strict SQL validation, actual pgmq admission without attempt/visibility loss, a paused backlog larger than the former 64-message lookahead, legacy acquisition, real private parsing/matching with durable excess-lease release, and independent-process invalid configuration. SQL admission fixtures run in rolled-back transactions; real handler tests execute only their explicitly owned task IDs. Existing actual-process/image checks exercise the production composition.

Watch the existing [ready/lease/worker diagnostics](OPERATIONS_SETUP.md) while sizing worker instances and host CPU/memory. Per-instance defaults are not a load-capacity or latency promise. `--drain` retains its bounded acquisition semantics and does not wait for paused pools, active leases or delayed retries. Resume [local recovery procedures](OPERATIONS_RECOVERY.md) and hosted containment/load validation remain separate release checks. See the [complete design audit](IMPLEMENTATION_AUDIT.md) for pending provider reservation/concurrency, telemetry and hosted/human-review gates.
