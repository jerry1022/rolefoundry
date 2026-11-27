# Production API contract

**Mixed implementation status.** The identity endpoints under `/api/v1/identity` are implemented for configured server deployments; see [their exact API and setup](IDENTITY_SETUP.md). The resource contracts below describe the remaining production modules and are not deployed handlers. The public static demo excludes all dynamic identity handlers.

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
| POST `/evidence` | Self-report or portfolio reference | Owner reference; cannot forge scored evidence |
| POST `/assessments` | Track | Attempt with public question fields |
| POST `/assessments/{id}/submit` | Attempt version and answers | Grading task |
| GET `/assessments/{id}` | Attempt ID | Owner attempt and published result |
| POST `/matches` | Optional target job ID | Match refresh task |
| GET `/matches` | Run ID, cursor | Owner results, reasons, gaps and input versions |
| GET `/courses` | Skill, difficulty, cursor | Published editorial metadata; public |
| POST `/learning-plans` | Target job ID, weekly hours | Plan generation task |
| GET `/learning-plans/{id}` | Plan ID | Owner steps, resources, practice and versions |
| PATCH `/learning-plans/{id}/steps/{stepId}` | User-reported progress | Updated step, without skill promotion |
| POST `/resumes/upload-intents` | Filename, media type, byte count | Short-lived private upload intent |
| POST `/resumes/{id}/parse` | Uploaded source version | Parsing task |
| POST `/resumes/{id}/confirm` | Confirmed draft facts and version | New confirmed resume version |
| POST `/resume-revisions` | Resume version and target job | Proposal generation task |
| POST `/resume-revisions/{id}/accept` | Accepted change IDs and version | New immutable resume version |
| POST `/resumes/{id}/exports` | Confirmed version, PDF format | Export task; private expiring result |
| GET/POST `/applications` | Job ID, optional resume version | Owner tracker records |
| PATCH `/applications/{id}` | Stage, note, next action and version | Updated record and event |
| DELETE `/applications/{id}` | Record version | Owner deletion |
| GET `/tasks/{id}` | Task ID | Owner status, safe error, result reference |
| POST `/admin/imports` | Source, kind, batch reference | Admin-only import task |
| POST `/admin/reviews/{id}/publish` | Reviewed version | Admin-only publication |
| POST `/account/deletion` | Explicit confirmed request | Deletion workflow reference |

## Compatibility

The first production API is versioned independently from browser storage. Migrate demo data only through an explicit user-approved importer; do not silently upload local drafts. Preserve immutable question/resume/input versions across releases. Additive fields are preferred; breaking wire changes require a new API version.
