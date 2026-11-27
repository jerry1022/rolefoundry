# Administrator recovery of failed tasks

## Delivered behavior and setup

A current verified administrator can inspect a task in `/admin/`, explicitly check recovery eligibility, choose a coded reason and create a **new task attempt**. Opening diagnostics, refreshing, checking eligibility and inspecting history never create work. The previous task remains failed with its original ID, attempts, version, error and timestamps. The new queue message contains only the new task ID.

Apply `20261114130000_admin_task_replay.sql` through the existing reviewed migration process, then deploy compatible web and worker code. Local development uses `npm run identity:dev` and `npm run worker:local`. Existing identity/worker secrets are sufficient; no new account, key or AI provider is required. Feed recovery additionally requires the same exact deployment-approved feed definitions on web and worker, as documented in [ingestion setup](INGESTION_SETUP.md).

The HTTP service has a separate `TaskReplayStore` mutation port and injected feed policy. It does not turn the read-only diagnostics store into a privileged database editor. Domain-owned SQL binding functions validate retained input and bind the new execution. Those helpers have no anonymous, authenticated or service-role execution grant; only the administrator coordinator invokes them as its database owner. The coordinator preserves the actual administrator identity and never impersonates the original owner or rewrites JWT claims. Independent existing worker handlers recheck authority, source/input versions and lease tokens before side effects/publication.

## Operator flow

1. Sign in as an administrator, expand **Task and worker diagnostics**, and inspect the failed task UUID.
2. Review its classified error, attempts and service configuration. Choose **Check recovery eligibility**. This produces a fresh observation, not a reservation or authorization token.
3. If available, choose **Operator reviewed**, **Configuration restored**, **Storage restored** or **Directory restored**, then choose **Create new task attempt**. Free-form operational notes and private document content are not accepted.
4. Inspect the newly returned task ID. The original remains available for comparison. Normal workers execute the new task through their existing handlers; no worker is started by the HTTP request.
5. If the acceptance response is lost, use **Retry this recovery request**. The component retains the same request UUID and reason while mounted. After reload, checking the old task exposes its existing next-attempt ID. Neither flow creates another child for the same old task.

Each old task can have at most one administrator-created child, even across administrators, tabs or request UUIDs. A failed child can be inspected separately. Competing owner retry and administrator recovery serialize on the same domain owner locks and source pointer; only one can take over the accepted input. Reusing a request UUID for a different task, actor or reason is a conflict.

## Eligibility rules

Ordinary tasks require `failed`, no committed result, an active original owner without a deletion marker, and `RF_RETRY_EXHAUSTED`. Running/queued/succeeded work, stale/canceled/forbidden/validation failures and orphan ordinary tasks cannot be reset. Fix the domain issue and ask the owner to make a fresh explicit request where needed. An expired lease is not a terminal failure; let the normal worker reclaim it.

At most twenty queued/running tasks may exist for the original owner. Ordinary recovery also respects a maximum of five retained task attempts for the same owner/kind/source, including the original and owner retries. Each new execution inherits the previous task's configured attempt ceiling. It does not create new domain inputs or bypass source/request limits. The accepted-erasure policy is different: an already accepted incomplete deletion can continue with a null owner and has persistent recovery rather than the ordinary five-task limit.

| Kind | Domain checks before rebinding |
| --- | --- |
| `assessment.grade` | Same failed accepted attempt and revision, complete sealed responses, immutable question references, no committed assessment result; increment the execution revision, preserve answers |
| `matches.refresh` | Same queued run/task, exact sealed input hash, current profile/catalog/dictionary/evidence/job versions, no results |
| `learning.plan` | Same queued plan/task/hash, current matching/course/progress revisions and evidence/resources, no output/steps |
| `resume.parse` | Same queued unconfirmed document/task/hash, no parsed draft/current version; pasted text hash or committed retained private file reference/object must exist |
| `resume.revise` | Same queued proposal/task/hash, current confirmed version, job, profile/catalog/dictionary, no published proposal |
| `resume.export` | Same export/task/hash and immutable confirmed version, no committed export object; historical confirmed versions remain valid |
| `catalog.import` | Original producer remains an active administrator, exact source fingerprint/mode/input/task, queued batch without output/reviews; any sealed normalization context must still match |
| `catalog.fetch` | Original producer remains an active administrator, exact source/settings/feed revision, enabled permission, no manual/future provider pause, pending sibling or sealed batch; HTTP checks the deployment registry and the worker repeats that check before network access |
| `account.export` | Same unexpired, uninvalidated sealed snapshot/task, no committed ZIP, retained source-file references/objects; never resnapshot or extend expiry |
| `account.delete` | Existing incomplete accepted request bound to the old erasure grant; delegate to the existing audited deletion recovery operation |

Current assessment, matching, learning and resume transformations are deterministic and make no AI calls. These recovery checks do not implement the pending provider reservation/consent/budget integration; adding model-backed handlers must preserve and extend the same authority checks before activation. Retrying a feed does not waive provider waits or source rights, and preparing an import never publishes catalog records automatically.

## API and failure behavior

| Method and path | Contract |
| --- | --- |
| GET `/api/v1/admin/operations/tasks/{taskId}/replay` | `{data: {available,reason,nextTaskId}}`; current administrator; no query parameters |
| POST same path | Strict `{requestId: UUID,reason}` using one of the four coded reasons above; same-origin JSON, maximum 512 bytes; `202 {data: {previousTaskId,taskId}}` |

Every request rechecks the current administrator at HTTP/service and database boundaries. Preview replies contain only eligibility and the existing child task ID; they exclude source/owner IDs, feed configuration, input/output text, object keys, receipt/lease secrets and idempotency hashes. The internal SQL context exposes feed ID/revision/kind only to the authorized server/admin role; it contains no URL or credential. Direct administrator RPCs do not confer deployment registry authority: the worker always rejects an absent/changed definition before external access.

Preview reasons are `not-terminal`, `permanent`, `owner-unavailable`, `source-stale`, `limit`, `deployment-unavailable` or `already-replayed`; available results have `reason: null`. Input errors are 400, oversized bodies 413, anonymous access 401, member/origin rejection 403, missing tasks 404, and changed/ineligible/conflicting mutations 409. All success/error responses are `no-store` and vary on Cookie. File eligibility checks retained references and Storage metadata; the worker verifies actual bytes/hash before processing or publication. Preview is not a Storage health check. A previously available preview can become invalid before submission; the transaction repeats checks and returns conflict rather than enqueueing stale work.

Enqueue, source binding, recovery linkage and audit commit atomically. A failure rolls all of them back, including the new queue row. The old terminal delivery may be moved into its queue archive as history; it is never resent. PostgreSQL sequence counters may advance on a rolled-back transaction. A committed result cannot be replayed as new work. New leases prevent the old worker token from publishing to the rebound source.

`task_replays` stores request UUID, old/new task IDs, nullable administrator FK, coded reason and time. Raw reads/writes deny browser roles; the service role has read access only. Successful inspection/mutation also records minimized `operations_audit` events; domain audit records identify the action without copying private input. Ordinary owner/task deletion cascades recovery linkage, while accepted erasure history retains its minimized capability/ledger records. This is operational history, not a new private content store or owner-export payload.

## Verification and remaining work

`npm run identity:test -- tests/identity/task-replay.integration.test.ts` runs actual Next/GoTrue/PostgREST/PostgreSQL/Storage with scoped synthetic fixtures. It covers all ten kinds, real domain handlers and PDF/ZIP processing, source/owner/revision/cap denial, repeated/lost responses, competing operators/owner retry, atomic failure rollback, actual mobile recovery and a lost browser response. The feed transport returns controlled synthetic content; it does not establish live publisher permission or availability. The fixture executor claims only explicitly owned task IDs and never drains unrelated developer work. Five unit cases verify injected authorization/policy, minimization and mutation identity.

The [mobile recovery control](assets/task-replay-mobile.png) is captured from the actual configured app with synthetic data. Consolidated domain management, external telemetry/alerts, provider integration and hosted/off-host recovery remain separate [delivery gates](IMPLEMENTATION_AUDIT.md).
