# 13 — Administration and operations

## Responsibility

Provide reviewed publication, system visibility and safe operational controls. The admin UI consumes the same domain services as the public app; it is not a privileged database editor.

## Current scaffold

The public inspector displays fixture counts, source provenance and the integration roadmap. A local-only reset requires confirmation and never affects external accounts. It is intentionally labeled as a demo, not secure administration.

## Production interface

Server-authorized `/admin` routes manage catalog review, skills/aliases, question/rubric versions, source policies, invitations, quotas and failed task inspection. `audit_events` records actor, action, resource ID, timestamp and a non-sensitive change summary. Large operations use the task system. Publication changes are versioned and reversible through a new reviewed version.

## Operational design

Use structured logs with request/task IDs, module, version, latency and error code. Track API p95 latency, error rate, oldest queue age, task success/retry rates, per-purpose provider spend, source freshness and invalid course links. Do not log raw resumes, answers, private URLs or provider secrets. Alert on accumulating queue age and repeated auth/provider failures rather than individual transient errors.

Keep development/staging/production data separate. Manage secrets through the deployment provider; public client variables must never contain service-role credentials. Pin dependency resolution with a lockfile. CI runs type checks, unit tests, a production build and browser behavior tests. Deploy code compatible with both pre- and post-migration schemas before applying destructive migrations.

## Deletion and recovery

Owner deletion marks the account unavailable, blocks new work, invalidates queued tasks and removes private records/files/embeddings and derivative reports. Retained operational records are minimized. Document backup expiry and do not promise immediate deletion from immutable backups. Rehearse a restore into an isolated environment before handling real user information. A published stale/incorrect catalog item is retired while retaining application history.

## Acceptance tests

Verify non-admin rejection, audit coverage, publication rollback, missing-secret startup behavior, failed-task replay, deletion during execution and database/storage restoration. Confirm that deploys do not migrate production data automatically from an unreviewed pull request.
