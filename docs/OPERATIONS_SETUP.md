# Administrator task and worker diagnostics

## Delivered scope

In a private configured deployment, `/admin/` combines authorized import administration with **Task and worker diagnostics**. The static public demo retains its fixture inspector. The diagnostics panel reads current persisted metadata; opening it, filtering, looking up a task and refreshing never enqueue or replay work.

The operations module owns its read/authorization ports and DTOs. Its Supabase adapter calls administrator-authorized database functions; its browser adapter uses the private HTTP API. UI components receive the client port. Worker presence has a separate write-only port, so replacing the telemetry backend does not replace task execution or expose service authority to the browser.

## Local setup

1. Follow [identity setup](IDENTITY_SETUP.md) and apply the checked-in migrations, including `20261114104000_operations_observability.sql`. Use the established administrator bootstrap; the diagnostics page does not promote users.
2. Run `npm run identity:dev`, sign in as an administrator, and open `/admin/`.
3. In another terminal run `npm run worker:local`. This is an actual queue consumer, not a telemetry simulator. Use only the intended local project.
4. Expand **Task and worker diagnostics**. Select a kind/state, inspect a task UUID, page through older tasks/events, or refresh explicitly. There is no background UI polling.
5. Use `npm run identity:test -- tests/identity/operations.integration.test.ts` for the actual local database/API/browser/process acceptance suite. It creates and removes scoped fixtures; it never resets the developer database.

No additional hosted account, provider key or alert destination is needed for this feature. Hosted operators must apply the migration and deploy compatible web/worker code through their reviewed deployment procedure. The project does not silently migrate a hosted database from a pull request. Existing worker URL/service-key and identity configuration remain documented in [configuration](CONFIGURATION.md).

## Observations and thresholds

The summary covers all ten task kinds, including the implemented `account.delete` erasure kind. Counts distinguish:

- Queued tasks from **ready** tasks whose `next_run_at` is due. Delayed retries do not imply a worker outage.
- Running tasks from expired or absent task leases. Queue delivery count is physical PGMQ delivery count, not the number of runnable domain tasks.
- Successes, terminal failures and retry events during the previous 24 hours. Retries count events, so one task may contribute more than once.
- Oldest ready age from the due timestamp; maximum running heartbeat age from heartbeat/start/creation. Empty populations have `null` ages.
- Workers reporting `active` within the last 45 seconds and registering the relevant handler kind. This is an observation, not proof of successful processing or authorization.

Diagnostic notices are computed from the observed summary: ready age at least 300 seconds, ready work without recent worker coverage, expired running leases, at least 10% failures among at least ten terminal tasks in 24 hours, and any invalid delivery observed in 24 hours. These notices **do not send external alerts**. API latency, provider spend, source freshness and course-link monitoring remain separate pending work.

## Worker lifecycle

The independent worker registers one random process UUID and its actual ten handler kinds. It reports immediately, every ten seconds, on graceful draining, and on stop. States advance `active → draining → stopped`; stale reports cannot move a stopped instance back to active. A hard crash cannot report stop; the UI marks an active/draining record stale after 45 seconds. Stopped records remain stopped.

Presence writes are serialized, redundant slow pulses coalesce, and failures emit only a safe unavailability event. A failed report does not fail a task or prevent subsequent processing/shutdown; transport requests have ten-second bounds. Task heartbeat/lease fencing remains authoritative and independent. Presence is self-reported service metadata, never a new access-control input.

Registry maintenance occurs on reports: records unseen for 30 days and stopped records unseen for seven days are removed. New registrations are capped at 1,000; reads return the latest 100 with an explicit truncation flag. This is a bounded recent-process registry, not permanent telemetry history.

## Authorization, pagination and minimization

HTTP and database reads independently require a current administrator session. No browser role flag or service key grants access. Raw registry/audit tables and helper functions are unavailable to anonymous/authenticated roles. Only the worker service role writes presence. Each successful diagnostics read records actor ID, action, optional task UUID and timestamp in `operations_audit`; no filters, cursor, source text or error body is retained. Reads remove audit entries older than 90 days. This cleanup is opportunistic, not a scheduled retention guarantee; no-history periods require operator maintenance.

Task/event pages have a fixed size of 20. Task order is `(created_at, id)` descending, event order is bigint sequence descending. Opaque base64url cursors validate shape and bind to the current task filters or event task ID. They are navigation hints, not signed authorization tokens; every page repeats current authorization. Concurrent inserts can appear on refresh; pagination is not a snapshot transaction.

Responses contain task IDs/kinds/state, attempts/timestamps, safe allowlisted error/event classifications, worker UUIDs and only a result-present boolean. They exclude owner identity, source/result references, request hashes, idempotency keys, lease tokens, inputs, messages and credentials. Unknown event classifications become `event.unclassified`; unknown error codes become `null`. Private responses use `Cache-Control: no-store`.

## Recovery and remaining controls

See [the executable isolated database/queue recovery rehearsal](OPERATIONS_RECOVERY.md). Diagnostics reads create no work. The separate [task recovery mutation port](TASK_REPLAY_SETUP.md) now creates an audited **domain** attempt, revalidates current owner/input/source permissions and preserves the original attempt. Never reset a task row or resend a queue message as an operational shortcut.

[Consolidated skills/question/invitation/quota administration](ADMIN_WORKSPACE_SETUP.md) is implemented through reused domain components and current-role gates. Module 13 remains partial: authoritative off-host ledger delivery/hosted cutover, external telemetry/alerts, and hosted/clean-cluster/Storage-object restore are outstanding. Source administration remains available through its [existing domain workflow](INGESTION_SETUP.md).

## Browser evidence

The local acceptance suite captures the actual private administrator workspace with synthetic task metadata: [desktop queue/lease observations](assets/operations-admin-desktop.png) and [mobile task detail](assets/operations-admin-mobile.png). These are application screenshots, not live job/provider or production availability evidence.

Private `account.export` jobs and their resumable artifact janitor are now implemented; see [account data setup](ACCOUNT_DATA_SETUP.md). [Accepted account erasure](ACCOUNT_DELETION_SETUP.md) now has an executable handler and a separate administrator recovery panel. It uses persistent retry policy; other tasks remain bounded. At least three erasure retry events/24 hours produce a diagnostic notice.

The [local recovery overlay](OPERATIONS_RECOVERY.md) now applies newer deletion intent to an ownership-checked disposable database and verifies actual isolated Auth/REST/Storage erasure of one controlled identity/PDF. This does not reconnect general workers or establish hosted backup delivery.
