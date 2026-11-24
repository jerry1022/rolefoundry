# Production API contract

**Mixed implementation status.** The identity endpoints under `/api/v1/identity` are implemented for configured server deployments; see [their exact API and setup](IDENTITY_SETUP.md). Profile/evidence endpoints are also implemented: see [their exact inputs, versions and pagination](PROFILE_SETUP.md). Published job/bookmark APIs and source/lifecycle administration are also implemented: see [catalog API](CATALOG_SETUP.md). Public/versioned skill reads and role-verified dictionary mutations are implemented: see [dictionary API](SKILL_DICTIONARY_SETUP.md). Private assessment/task APIs and question-bank administration are implemented: see [assessment API](ASSESSMENT_SETUP.md). Private versioned matching/report APIs are implemented: see [matching API](MATCHING_SETUP.md). Public reviewed course/private plan/progress and course administration APIs are implemented: see [exact learning API](LEARNING_SETUP.md). Private resume/source/confirmation/proposal/export/download APIs are implemented: see [exact resume API](RESUME_SETUP.md). Private application tracking APIs are implemented: see [exact cycle/history/follow-up API](APPLICATIONS_SETUP.md). Administrator upload/feed/schedule/review/publication APIs are implemented: see [the workflow contract and deployment gates](INGESTION_SETUP.md). Other resource contracts below remain planned. The public static demo excludes all dynamic identity handlers.

## Conventions

- Base path: `/api/v1`; JSON request/response bodies; opaque string IDs; UTC ISO timestamps.
- Public catalog reads require no session. Private operations require a verified session. Admin writes additionally require the server-derived admin role.
- Derive ownership from the session. Never accept a client user ID as authorization.
- List responses: `{ data: [...], nextCursor: string | null }`; single resources: `{ data: {...} }`.
- Errors: `{ error: { code, message, requestId, fieldErrors? } }`. No stack traces or raw provider content.
- Use `400` for invalid input, `401` for absent session, `403` for forbidden actions, `404` for unavailable/private resources, `409` for version conflicts, and `429` for limits.
- Long operations return `202` with `{ data: { taskId, status: "queued" } }`. Clients poll the owner-scoped task endpoint with bounded backoff.
- Task-creating POSTs accept `Idempotency-Key`. The scope is actor + operation + key; a conflicting payload under the same key returns `409`.
- Versioned edits carry the last-read resource version. A mismatch returns `409` with refresh guidance.

## Resources

| Method and path | Input | Output / authorization |
| --- | --- | --- |
| GET `/jobs` | q, track, specialization, workplace, location, level, cursor | Published active jobs; public |
| GET `/jobs/{id}` | Job ID | Job, requirements, permitted source metadata; public |
| PUT/DELETE `/bookmarks/{jobId}` | Job ID | Idempotent owner bookmark mutation |
| GET/PATCH `/profile` | Name, direction, workplace preferences, weekly hours | Owner profile and version |
| GET `/evidence` | Cursor, skill ID | Owner evidence with provenance |
| POST `/evidence` | Self-report or portfolio reference plus profile revision | Owner evidence; cannot forge scored evidence |
| GET/PATCH/DELETE `/evidence/{id}` | Evidence ID; expected profile/evidence versions for writes | Owner immutable history, new version or full deletion |
| POST `/profile/import` | Explicitly reviewed preferences/claims, revision 0 | Import only into a new owner profile |
| GET `/assessments` | Optional cursor | Owner attempt history |
| POST `/assessments` | Track | Attempt with public question fields |
| PATCH `/assessments/{id}/answers` | Expected revision and partial answers | Owner draft autosave |
| POST `/assessments/{id}/submit` | Expected revision, full answers and idempotency header | Fixed-choice grading task; no provider allowance |
| POST `/assessments/{id}/retry` | Prior task ID and idempotency header | Retry exhausted infrastructure failure with sealed answers |
| GET `/assessments/{id}` | Attempt ID | Owner attempt and published result |
| POST `/matches` | Target job ID or null, explicit constraints and idempotency header | Versioned private run and task |
| GET `/matches` | History cursor | Owner report history |
| GET `/matches/{id}` | Owner run ID, result cursor | Cited results/gaps, input versions, stale/availability flags |
| GET `/courses` | Skill, difficulty, cursor | Published editorial metadata; public |
| POST `/learning-plans` | Target job ID, weekly hours, duration overrides and idempotency header | Private plan generation task |
| GET `/learning-plans` | Optional history cursor | Owner plan history |
| GET `/learning-progress` | None | Owner whole-course progress and revision |
| PATCH `/learning-progress/courses/{id}` | Expected revision and completed flag | Owner progress; no ability promotion |
| GET `/learning-plans/{id}` | Plan ID | Owner steps, resources, practice and versions |
| PATCH `/learning-plans/{id}/steps/{stepId}` | User-reported progress | Updated step, without skill promotion |
| POST `/learning-plans/{id}/steps/{stepId}/practice` | Expected revision, HTTPS URL and summary | Independent private practice reference |
| DELETE `/learning-plans/{id}/practice/{submissionId}` | Expected revision | Owner reference removal, including invalidated plans |
| POST `/resumes/upload-intents` | Filename, media type, byte count | Short-lived private upload intent |
| POST `/resumes/{id}/parse` | Exhausted prior task and idempotency header | New task for the same immutable source |
| GET `/resumes` | Optional cursor | Owner source history |
| POST `/resumes/paste` | Text and idempotency header | Separate private source and parse task |
| PUT `/resumes/{id}/source` | Binary, exact content type and upload-token header | Verified private source; automatically enqueues parsing |
| GET/DELETE `/resumes/{id}` | Owner ID; expected revision for deletion | Private source/versions or deletion/cleanup status |
| POST `/resumes/{id}/confirm` | Expected document revision and confirmed fact/section content | New immutable version and unreviewed claims |
| GET `/resume-versions/{id}` | Version ID | Exact owner source and dictionary history |
| POST `/resumes/{id}/revisions` | Current version, target job, expected revision and idempotency header | Grounded order-proposal task |
| GET `/resume-revisions/{id}` | Owner proposal ID | Versioned changes, stale state and accepted choices |
| POST `/resume-revisions/{id}/accept` | Selected change IDs and expected document revision | New immutable version; identical repeated choices reuse it |
| POST `/resumes/{id}/exports` | Selected confirmed version and idempotency header | Fixed-version PDF task |
| POST `/resume-exports/{id}/download-intents` | Owner export ID | 60-second owner-bound permit |
| GET `/resume-downloads/{id}` | Permit ID and owner session | Verified PDF attachment with no-store headers |
| GET/POST `/applications` | Cursor for reads; `{jobId}` and idempotency header for creation | Owner cycle history or Saved/existing cycle |
| GET/PATCH `/applications/{id}` | Full stage/note/resume/reference fields and expected revision for writes | Owner snapshot, fixed version reference, follow-ups and updated event |
| POST `/applications/{id}/new-cycle` | Expected revision and idempotency header | Explicit new Saved cycle for an available role after closure |
| GET `/applications/{id}/events` | Optional cursor | Owner immutable event history |
| GET `/applications/resume-choices` | Optional cursor | Minimal owner confirmed-version references |
| POST `/applications/{id}/follow-ups` | Expected revision, title, UTC/offset due time and idempotency header | Owner next-action creation |
| PATCH/DELETE `/applications/{id}/follow-ups/{taskId}` | Expected revision; title/due time/completed flag for edit | Updated record |
| DELETE `/applications/{id}` | Expected revision | Owner cycle, note, event and follow-up deletion |
| GET `/tasks/{id}` | Task ID | Owner status, safe error, result reference |
| GET/POST `/admin/imports` | History cursor, or source/batch/format/content and idempotency header | Administrator-only batch history or review-planning task |
| PATCH `/admin/imports/sources/{id}` | See exact source settings contract | Source import authority; collection GET is `/admin/imports/sources` |
| GET `/admin/imports/{id}` | Batch UUID | Bounded issues and latest immutable previews |
| GET `/admin/imports/reviews/{id}` | Review UUID | Preview, scope/freshness and publication reference |
| POST `/admin/imports/reviews/{id}/rebase` | Expected revision and selected target | New immutable preview against current authority/curation |
| POST `/admin/imports/reviews/{id}/decide` | Reviewed decision/metadata/reason and idempotency header | Audited publication/closure/confirmation/rejection receipt |
| POST `/admin/reviews/{id}/publish` | Reviewed version | Admin-only publication |
| POST `/account/deletion` | Explicit confirmed request | Deletion workflow reference |

## Compatibility

The first production API is versioned independently from browser storage. Migrate demo data only through an explicit user-approved importer; do not silently upload local drafts. Preserve immutable question/resume/input versions across releases. Additive fields are preferred; breaking wire changes require a new API version.

### Approved remote feeds (administrator)

These private/no-store routes derive the verified administrator and use the same-origin mutation rules. Source settings default disabled; definitions come from the server/worker deployment registry and expose only ID/kind/format/revision to the browser.

| Method/path | Contract |
| --- | --- |
| GET `/api/v1/admin/imports/feeds` | `{data:{settings,definitions}}`; no privileged feed URL or transport settings |
| PATCH `/api/v1/admin/imports/feeds/{sourceId}` | `{expectedRevision,feedId,enabled,intervalMinutes,resume}`; interval 15–10,080 minutes, exact deployment definition revision bound server-side |
| POST `/api/v1/admin/imports/feeds/{sourceId}/fetch` | Empty JSON object and `Idempotency-Key` (8–120 chars); `202 {data:feedRun}`; one pending run per source/configuration |
| GET `/api/v1/admin/imports/feed-runs` | `{data:feedRun[]}`; twenty most recent bounded run summaries |
| GET `/api/v1/admin/imports/feed-runs/{id}` | `{data:feedRun}`; source/definition/task IDs, fetch status, safe error, created time and optional sealed batch ID |

A successful fetch means its immutable batch and normalization task committed; it does not publish catalog records. Open that batch through the existing import API and review each proposal. Empty valid feeds create zero-row review batches without inferring closure. Scheduled windows use a service-only bounded worker operation, not a public cron route. Revoked/inactive owners, unavailable definitions, pending work and persisted provider waits are skipped. Early resume and stale source/definition/target writes return conflicts. See [ingestion setup](INGESTION_SETUP.md).

## Administrator operations diagnostics

All endpoints are read-only, require a current administrator session at both HTTP and database boundaries, audit successful reads, and return `Cache-Control: no-store`. Raw tables and producer helpers are service-only. See [setup and exact DTO/retention scope](OPERATIONS_SETUP.md).

| Method and path | Contract |
| --- | --- |
| GET `/api/v1/admin/operations` | `{data: summary}`: observed timestamp, per-kind queue/ready/running/terminal/retry/lease ages, fresh active coverage, delivery/poison counts |
| GET `/api/v1/admin/operations/tasks` | Optional `kind`, `status`, opaque `cursor`; `{data: task[], nextCursor}`; fixed 20, descending `(created_at,id)` |
| GET `/api/v1/admin/operations/tasks/{id}` | `{data: task}`; safe metadata and result-present boolean; missing UUID returns 404 |
| GET `/api/v1/admin/operations/tasks/{id}/events` | Optional opaque `cursor`; `{data: event[], nextCursor}`; fixed 20, descending bigint sequence |
| GET `/api/v1/admin/operations/workers` | `{data: {observedAt,data: worker[],truncated}}`; latest 100, active/draining/stopped/stale observations |

Unknown/duplicate query parameters, malformed identifiers/cursors, or cursor reuse across filters/tasks return 400. Cursors do not convey authority; every page rechecks the current role. Inputs, owner identities, source/result references, lease tokens, messages and untrusted classification strings are excluded. The separate [task recovery endpoints](TASK_REPLAY_SETUP.md#api-and-failure-behavior) require explicit administrator intent and repeat domain checks; diagnostic reads never replay work.

## Private account archives

All endpoints derive the current owner from the verified session and repeat database authorization. An administrator cannot download another account's archive. See [format, bounds and cleanup](ACCOUNT_DATA_SETUP.md).

| Method and path | Contract |
| --- | --- |
| POST `/api/v1/account/exports` | Empty JSON body, same-origin and `Idempotency-Key` (8–120 alphanumeric/underscore/hyphen characters); `202 {data: export}`; one pending and three requests/24 hours |
| GET `/api/v1/account/exports` | Optional opaque `cursor`; `{data: export[],nextCursor}`; fixed 20, descending `(created_at,id)` |
| GET `/api/v1/account/exports/{id}/download` | Owner-only integrity-checked ZIP stream, attachment filename and `no-store`; checks access before/after Storage read; missing/expired/invalidated/foreign resource is 404 |
| DELETE `/api/v1/account/exports/{id}` | Empty JSON, same-origin; `{data: export}` with `invalidated` state; idempotently cancels publication/denies downloads and schedules physical artifact cleanup |

Export metadata contains ID, task ID, status (`queued`, `running`, `ready`, `failed`, `expired`, `invalidated`), request/expiry timestamps and optional byte count. It excludes the sealed payload and private object keys. Unknown/duplicate parameters, malformed IDs/cursors and owner/body spoofing are rejected. Internal snapshot/worker/cleanup functions and raw application tables are service-only. Live removal is documented below.

## Account deletion and private progress

All requests use `no-store`. Mutations require the configured same-origin header. Receipt secrets are accepted only in bounded JSON bodies; query parameters are rejected. See [flow, recovery and retention](ACCOUNT_DELETION_SETUP.md).

| Method and path | Contract |
| --- | --- |
| POST `/api/v1/account/deletion` | Verified owner; strict `{id: UUID,secret: 64 lowercase hex characters,confirmation: "DELETE"}`; `202 {data: status}`. An existing valid receipt recovers its already accepted request after sign-out; it cannot create a different operation. |
| POST `/api/v1/account/deletion/status` | Strict `{id,secret}`; no active session required; `{data: status}`; missing/wrong receipt is uniformly 404. |
| GET `/api/v1/admin/account-deletions/tasks/{taskId}` | Current administrator; `{data: status}` for an accepted request associated with that task; no subject/contact/secret is returned. |
| POST `/api/v1/admin/account-deletions/{id}/resume` | Current administrator; `{reason}` from `storage-restored`, `directory-restored`, `configuration-restored`, `operator-reviewed`; `202 {data: status}` for a new audited attempt. Only an existing terminal/missing task of an accepted incomplete request is recoverable. |

Status contains request ID, status (`queued`, `cleaning-files`, `removing-account`, `completed`, `needs-attention`), request/completion/retry timestamps and service-failure count. It excludes subject UUIDs, receipt/contact digests, paths and raw diagnostics. Raw erasure tables and execution/cleanup helpers remain service-only; normal account role cannot forge task capabilities. Normal task metadata may include `retryPolicy: bounded | until-complete`; the latter is reported only for registered erasure history. Durable `task.deferred` events are allowlisted in administrator event history.

### Recovery-only ledger RPC

`recovery_apply_deletion_ledger(p_run text,p_ledger jsonb)` is not an application/browser endpoint. Its service-only ACL and exact disposable database/run/comment check reject live databases and browser roles. The version-1 input, atomic conflict rules, minimized result/digests, missing-receipt-hash behavior and rehearsal commands are specified in [the recovery protocol](OPERATIONS_RECOVERY.md#apply-newer-deletion-intent-before-reconnecting-users). Live and restored erasure share a service-only audit minimization helper; neither operation restores sign-in access.

### Administrator task recovery

GET `/api/v1/admin/operations/tasks/{taskId}/replay` returns minimized eligibility and an existing child task ID. POST to the same path accepts only `{requestId: UUID,reason}` with the four coded recovery reasons, same-origin JSON and a 512-byte bound, returning `202 {data: {previousTaskId,taskId}}`. Current administrator authorization is repeated in the service and database; failed eligibility/conflicting request identity is 409. The mutation atomically creates a new task and rebinds the original accepted domain input without resetting the previous attempt. See [per-kind checks, idempotency, privacy and limits](TASK_REPLAY_SETUP.md).

## Identity administration directory

GET `/api/v1/identity/admin/invitations` and GET `/api/v1/identity/admin/quota-policies` accept only an optional opaque cursor and return `{data,nextCursor}`, fixed 20. Invitations omit email/hashes/actor IDs; quota IDs are exact decimal strings. POST `/api/v1/identity/admin/invitations/{id}/revoke` accepts a same-origin strict empty JSON body (128 bytes), expires only an unused invitation and is idempotent for already expired unused records. Every route independently verifies administrator authority in the service and SQL, and successful reads/revocation are audited. See [directory schemas, paging, revocation and retained old controls](ADMIN_WORKSPACE_SETUP.md).

## Worker-only invalidation RPCs

There is no browser invalidation endpoint. The worker service role alone can execute `invalidation_claim(p_ids uuid[] default null)` (up to four opaque `{id,token}` leases), `invalidation_apply(p_id uuid,p_token uuid)` (`{completed,canceled}`) and `invalidation_retry(p_id uuid,p_token uuid)` (persisted backoff). Optional claim scope is bounded to four IDs for controlled operator/integration runs. Raw receipts and private consumer/task helpers are not granted even to the service role. Every apply/retry requires a current fenced lease. See [transaction, scope and retry contracts](INVALIDATION_SETUP.md).
