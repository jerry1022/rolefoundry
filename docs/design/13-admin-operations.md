# 13 — Administration and operations

## Responsibility

Provide reviewed publication, system visibility and safe operational controls. The admin UI consumes the same domain services as the public app; it is not a privileged database editor.

## Current implementation

The public static-demo inspector displays fixture counts, source provenance and the integration roadmap. A local-only reset requires confirmation and never affects external accounts. It is intentionally labeled as a demo, not secure administration.

The private `/admin/` workspace now composes domain source administration with [administrator-only task/worker diagnostics](../OPERATIONS_SETUP.md). Independent service and database role checks guard every read. Fixed-size, stable task/event pages expose only minimized operational metadata; reads are audited. The independent worker reports active/draining/stopped presence and the UI distinguishes stale reports. Queue/lease observations and threshold notices are implemented; no replay or external alert delivery is implied.

The [local database recovery rehearsal](../OPERATIONS_RECOVERY.md) is now executable. It restores a consistent project database/queue snapshot into an owned disposable database, compares content and authorization metadata, probes the restored queue and verifies cleanup on both success and an intentional failure. This is a partial operational delivery; hosted/clean-cluster and Storage-object recovery, authoritative off-host ledger delivery/hosted application, generic task replay and consolidated administration remain pending.

The [private account export workflow](../ACCOUNT_DATA_SETUP.md) now seals retained records and committed resume files, builds an integrity-checked ZIP through the task worker, authorizes owner-only download/removal, invalidates copies on privacy deletion and reclaims artifacts after expiry or owner removal. The [live deletion coordinator](../ACCOUNT_DELETION_SETUP.md) now blocks access, drains files, removes Auth/private records and completes through erasure grants that survive owner removal. Private receipts, delayed continuation, persistent retries, late-file reclamation and audited terminal recovery are implemented. A guarded local ledger overlay and actual isolated Auth/REST/Storage erasure rehearsal now verify post-backup deletion of a controlled identity/PDF. Authoritative off-host ledger delivery, hosted cutover and representative full-environment recovery remain pending.

## Production interface

Server-authorized `/admin` routes manage catalog review, skills/aliases, question/rubric versions, source policies, invitations, quotas and failed task inspection. `audit_events` records actor, action, resource ID, timestamp and a non-sensitive change summary. Large operations use the task system. Publication changes are versioned and reversible through a new reviewed version.

## Operational design

Use structured logs with request/task IDs, module, version, latency and error code. Track API p95 latency, error rate, oldest queue age, task success/retry rates, per-purpose provider spend, source freshness and invalid course links. Do not log raw resumes, answers, private URLs or provider secrets. Alert on accumulating queue age and repeated auth/provider failures rather than individual transient errors.

Keep development/staging/production data separate. Manage secrets through the deployment provider; public client variables must never contain service-role credentials. Pin dependency resolution with a lockfile. CI runs type checks, unit tests, a production build and browser behavior tests. Deploy code compatible with both pre- and post-migration schemas before applying destructive migrations.

## Deletion and recovery

Owner deletion marks the account unavailable, blocks new work, invalidates queued tasks and removes private records/files/embeddings and derivative reports. Retained operational records are minimized. Document backup expiry and do not promise immediate deletion from immutable backups. Rehearse a restore into an isolated environment before handling real user information. A published stale/incorrect catalog item is retired while retaining application history.

## Acceptance tests

Verify non-admin rejection, audit coverage, publication rollback, missing-secret startup behavior, failed-task replay, deletion during execution and database/storage restoration. Confirm that deploys do not migrate production data automatically from an unreviewed pull request.
