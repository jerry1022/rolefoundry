# Production API contract

**Mixed implementation status.** The identity endpoints under `/api/v1/identity` are implemented for configured server deployments; see [their exact API and setup](IDENTITY_SETUP.md). Profile/evidence endpoints are also implemented: see [their exact inputs, versions and pagination](PROFILE_SETUP.md). Published job/bookmark APIs and source/lifecycle administration are also implemented: see [catalog API](CATALOG_SETUP.md). Public/versioned skill reads and role-verified dictionary mutations are implemented: see [dictionary API](SKILL_DICTIONARY_SETUP.md). Private assessment/task APIs and question-bank administration are implemented: see [assessment API](ASSESSMENT_SETUP.md). Private versioned matching/report APIs are implemented: see [matching API](MATCHING_SETUP.md). Public reviewed course/private plan/progress and course administration APIs are implemented: see [exact learning API](LEARNING_SETUP.md). Private resume/source/confirmation/proposal/export/download APIs are implemented: see [exact resume API](RESUME_SETUP.md). Other resource contracts below remain planned. The public static demo excludes all dynamic identity handlers.

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
| GET/POST `/applications` | Job ID, optional resume version | Owner tracker records |
| PATCH `/applications/{id}` | Stage, note, next action and version | Updated record and event |
| DELETE `/applications/{id}` | Record version | Owner deletion |
| GET `/tasks/{id}` | Task ID | Owner status, safe error, result reference |
| POST `/admin/imports` | Source, kind, batch reference | Admin-only import task |
| POST `/admin/reviews/{id}/publish` | Reviewed version | Admin-only publication |
| POST `/account/deletion` | Explicit confirmed request | Deletion workflow reference |

## Compatibility

The first production API is versioned independently from browser storage. Migrate demo data only through an explicit user-approved importer; do not silently upload local drafts. Preserve immutable question/resume/input versions across releases. Additive fields are preferred; breaking wire changes require a new API version.
