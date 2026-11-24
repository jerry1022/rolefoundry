# Private assessments and durable grading

Module 05 runs fixed-choice assessments through private Next APIs, PostgreSQL transactions and a separate Node worker. It uses no external model, sends no answers to a provider and consumes no AI analysis allowance. The original twelve-question browser demo remains available when identity is disabled. Short-answer AI grading and professional calibration are not enabled.

## Run locally

Requires Node 24 and Docker for the local Supabase stack:

```bash
npm ci
npm run identity:start
npx supabase migration up
npm run identity:invite -- developer@example.test
npm run identity:dev
```

Sign in at `http://127.0.0.1:3200/account/`. An administrator must author a rubric and at least three reviewed questions for each supported track in **Question bank administration** at `/assessments/` or the reused **Assessment questions and rubrics** editor at `/admin/`. Use the administrator bootstrap in [identity setup](IDENTITY_SETUP.md). Migrations deliberately publish no assessment content. If a track has fewer than three eligible questions, starting an attempt returns `409 RF_NOT_READY` with a useful message.

In a separate terminal run:

```bash
npm run worker:local
# One bounded acquisition cycle:
npm run worker:local -- --once
# Up to 100 cycles, stopping when an acquisition returns no eligible leases:
npm run worker:local -- --drain
```

The local helper reads ignored, owner-only `.local/identity-env.json` and rejects non-loopback destinations. It never prints credentials. `--drain` is a maintenance/testing aid, not a promise to wait for delayed retries or every message in a mixed-handler queue. The normal worker keeps polling.

Start a private attempt, select answers, wait for **All answers saved**, then submit. The worker publishes complete feedback and three scenario evidence records. Reloading `/assessments/?attempt=<id>` resumes the saved attempt. Retakes create new attempts. A correct response describes only that scenario and never changes self-reported ability. The result suggests explaining the choice and building a small example; personalized courses arrive in module 07.

## Implemented API

All paths below are under `/api/v1`. Private reads are uncached and owner-scoped. Mutations enforce same-origin requests, bounded JSON and strict schemas. Ownership and role are derived from the verified session, then rechecked by SQL/RLS.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/assessments?cursor=...` | Optional opaque cursor | `{data, nextCursor}`, 20 attempts per page |
| POST `/assessments` | `{track}` | `201` attempt with public question fields |
| GET `/assessments/{id}` | Owner attempt ID | Saved answers, revision, status and completed result if available |
| PATCH `/assessments/{id}/answers` | `{expectedRevision, answers: {itemId: optionIndex}}` | New draft revision; partial answers allowed |
| POST `/assessments/{id}/submit` | Same body; `Idempotency-Key` header, 8–200 characters | `202 {data: {taskId, status}}`; complete answers required |
| POST `/assessments/{id}/retry` | `{previousTaskId}` and a new `Idempotency-Key` | New audited task for exhausted infrastructure/timeout failure; sealed answers retained |
| GET `/tasks/{id}` | Owner task ID | Safe state, attempts/timestamps, result reference/error code; no lease token |
| GET `/admin/assessments` | Admin | Private question/rubric bank including answer keys |
| POST `/admin/assessments/rubrics` | `{key, version, description}` | `201` immutable rubric |
| POST `/admin/assessments/questions` | `{key, version, track, skillId, rubricId, prompt, options, correctIndex, explanation}` | `201` immutable draft question |
| POST `/admin/assessments/questions/{id}/review` | `{reason}` | Reviewed for future selection; older reviewed versions of that key retire |
| POST `/admin/assessments/questions/{id}/retire` | `{reason}` | Removed from future selection; historical attempts retained |

Tracks are the four values from the skill catalog. Questions have 2–10 options, zero-based answer indices and an existing active skill. Review validates the current canonical skill. Questions retain their original skill ID and dictionary version; canonical projections follow reviewed dictionary merges. Correct answer fields are unavailable to members until their own result completes. An administrator can inspect the bank to review it; this is a learning preview, not an examination security boundary against administrators.

Draft edits use optimistic revisions; conflicting tabs must reload. Submission atomically seals responses, increments the attempt revision, creates an authoritative task and sends a task-ID-only pgmq message. Repeating a key with the same request returns the same task; changed input returns `409`. There are at most ten open drafts and twenty pending general tasks per owner. These protect the application independently of provider budgets.

## Storage and consistency

Migration `20261114050000_assessment_worker.sql` adds immutable question/rubric content, separate publication records, owner attempts/items/responses/results, general tasks/events and review/retry audit. Session clients cannot mutate raw tables or read the private bank. Assessment results include the `mcq-v1` recipe and exact question/rubric references; scenario evidence carries those references plus the original dictionary version. Long prompts/explanations are excerpted only in profile evidence, with a pointer back to full assessment feedback.

The grading transaction takes the shared dictionary lock, owner lock, task row and attempt row in that order. It validates active ownership, the sealed revision, task association and lease token/expiry before grading **and immediately before commit**. Result, evidence and terminal task state commit together. Expiry during grading rolls the entire transaction back. Deactivation uses the same owner lock and cancels draft/submitted work; hard deletion cascades private records. A late or duplicate delivery cannot republish evidence.

## Worker replacement and operations

`TaskWorker` depends only on `TaskQueue` and a handler registry. `SupabaseTaskQueue` owns RPC transport; `SupabaseAssessmentGrader` owns the transactional grading adapter. `apps/worker/src/main.ts` is the environment/composition root. Domain services and UI components import narrow ports rather than concrete privileged clients. Run `npm run architecture:check` after replacing an adapter.

Current production handlers: `assessment.grade` and `matches.refresh`; the latter is documented in [matching setup](MATCHING_SETUP.md). Other task kinds remain reserved contracts, not working handlers. Identity analysis reservations and profile/dictionary invalidation outboxes still need module 12 dispatch integration. No AI request is executed by this worker.

The authoritative task table controls state and retries. pgmq is only delivery. Leases are 5–300 seconds; concurrency is 1–8, default 2. Heartbeat runs at about one third of the lease. Three transient attempts use exponential backoff plus jitter. Validation, forbidden, stale and cancellation failures are terminal. Poison deliveries are archived with a safe code. Each acquisition scans at most 64 deliveries, one at a time, and claims no more than its concurrency budget. A crash before commit is reclaimed after expiry; a crash after commit is archived on redelivery without creating more evidence.

The engine's handler deadline defaults to 60 seconds (injectable 100–300,000 ms). It stops waiting on aborted/unresponsive handlers, releases shutdown work and stops heartbeats. Every replacement handler must honor cancellation and guard its result writes with a valid lease; abort alone cannot undo external side effects. Supabase transport requests have a 10-second deadline, combined with the caller's cancellation signal. Safe logs contain event/task IDs and codes, never answers or keys. `task_metrics()` is a service/admin RPC for state counts, expired leases, oldest queued age and retry totals. Hosted alerting remains module 13 work.

Hosted worker variables:

- `SUPABASE_URL`: HTTPS, except loopback development.
- `SUPABASE_SERVICE_ROLE_KEY`: private server credential; never use a `NEXT_PUBLIC_` name.
- `WORKER_LEASE_SECONDS`: optional 5–300, default 30.
- `WORKER_CONCURRENCY`: optional integer 1–8, default 2.
- `WORKER_DOCUMENT_CONCURRENCY`: optional integer 0–8, default 1.
- `WORKER_FETCH_CONCURRENCY`: optional integer 0–8, default 1.
- `WORKER_GENERAL_CONCURRENCY`: optional integer 0–8, defaults to total concurrency.

Apply the [worker resource migration and configuration](WORKER_RESOURCE_SETUP.md) before enabling these limits. Pools constrain one worker instance; provider-wide concurrency remains a separate Gateway gate.

```bash
npm run worker:start
docker build -f Dockerfile.worker -t rolefoundry-worker .
# Supply private environment through your deployment secret manager:
docker run --rm --env-file /private/path/worker.env rolefoundry-worker
```

The worker image installs runtime dependencies, uses a non-root user and is independent of the web image. Node's `react-server` condition resolves the server-only marker outside Next. Vercel hosts web/API only; deploy the long-running worker separately. Apply additive migrations through a reviewed deployment process before enabling the server configuration. Do not apply schema changes to hosted databases from an unreviewed PR.

## Verification and remaining gates

`npm run identity:test` runs actual local Auth/PostgREST/PostgreSQL, a production Next server, a real Node worker and Chromium. Assessment coverage includes all tracks/repeat avoidance, stale/partial/invalid drafts, concurrent idempotent submit, RLS/confidentiality, immutable question versions, scenario provenance, real grading, retries, expired/stale leases, crash-after-commit, owner deactivation/deletion, stale input, poison messages, safe metrics, mobile autosave/resume/polling and administrator author/review/retire. Unit tests exercise injected service authorization, scoring and worker cancellation/timeouts.

These tests do not establish expert content calibration, accessibility certification, load capacity, hosted credentials/recovery or short-answer/model agreement. An operator must populate and review suitable questions before releasing the preview. AI short answers remain gated on module 11, explicit provider consent/budget reservation and a separately reviewed evaluation set.

Queue references: [Supabase pgmq guide](https://supabase.com/docs/guides/queues/pgmq), [Queues API](https://supabase.com/docs/guides/queues/api).
