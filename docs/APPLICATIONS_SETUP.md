# Private application tracking

Module 09 keeps manually reported application cycles, private notes, fixed resume references, immutable event history and dated follow-ups in PostgreSQL. It sends no application, email or calendar message. `Saved` means preparation; the other stages are explicitly user-reported. Bookmarking, opening a source and exporting a resume never call a stage mutation.

## Local setup

The existing identity/catalog settings are sufficient. No new credential, provider, scheduled task or feature flag is needed. Apply migration 09 to the project-specific local stack:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
```

Sign in at `http://127.0.0.1:3200/account/` with an invited local account, then visit `/applications/`. The source-governed published catalog and confirmed resumes come from modules 03/08; follow their setup guides to add reviewed records. No local demo notes are uploaded automatically. The worker is required when preparing resume versions/exports, but ordinary tracking and follow-ups are synchronous owner transactions.

Choose a published role and **Track selected role**. This creates or returns a preparation record, without implying submission. Job details and matching reports link to this preparation screen. Choose a confirmed resume version, add a note/reference and explicitly save a reported stage. The tracker stores a reference to the immutable resume version, not a copy of its statements. Follow-ups use device-local dates/times, are stored as UTC instants, and remain independent of stage changes. Past open tasks are labelled overdue; no response is never automatically treated as rejection.

A selected record has a bookmarkable `?application=<UUID>` URL and survives reload. A newer revision preserves unsaved editor/task drafts; the owner must reload saved fields or explicitly review the draft against the new revision. A conflict never silently overwrites another tab. Closed cycles remain closed. Starting a new cycle is an explicit action and requires the job to be available again. Notes, selected resume and follow-ups are not silently copied to the new cycle.

## API

Paths are under `/api/v1`. Every endpoint requires a verified active session. Mutations require the configured same origin. The server derives ownership; request bodies cannot choose a user or actor. Raw tables and internal helpers are not granted to members.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/applications` | Optional cursor | `{data, nextCursor}`; 20 owner cycles by creation sequence |
| POST `/applications` | `{jobId}` and `Idempotency-Key` | `201` current active cycle, latest closed cycle, or a new `Saved` record |
| GET `/applications/{id}` | Owner record UUID | `{data: record}` including snapshot, current availability, selected resume reference and bounded follow-ups |
| PATCH `/applications/{id}` | `{expectedRevision, stage, note, resumeVersionId, confirmationReference}` | Updated record and event; unchanged values do not create an event |
| POST `/applications/{id}/new-cycle` | `{expectedRevision}` and idempotency header | `201` new `Saved` cycle only from a closed record with no active cycle |
| GET `/applications/{id}/events` | Optional cursor | `{data, nextCursor}`; 20 immutable events, newest first |
| GET `/applications/resume-choices` | Optional cursor | `{data, nextCursor}`; 20 owner confirmed-version references, stable UUID order |
| POST `/applications/{id}/follow-ups` | `{expectedRevision, title, dueAt}` and idempotency header | `201` updated record with one new follow-up |
| PATCH `/applications/{id}/follow-ups/{taskId}` | `{expectedRevision, title, dueAt, completed}` | Updated record; tasks are scoped to the same application |
| DELETE `/applications/{id}/follow-ups/{taskId}` | `{expectedRevision}` | Updated record; no change when the task is already absent |
| DELETE `/applications/{id}` | `{expectedRevision}` | `{data: {deleted: true}}`; removes notes, events and follow-ups |

Single-record responses use `{data: record}`. All responses are `no-store` and vary on the session cookie. Records and tracker list pages identify the server-derived owner; the screen clears prior-account records/drafts when a refreshed page belongs to a different account. This response identity is never accepted as request authorization. Unknown fields, malformed IDs, offset-free timestamps, invalid dates and extra queries are rejected. Notes support 4,000 UTF-16 code units, references 300, and follow-up titles 200. A title cannot be blank. Due dates must include an offset and fall in UTC years 2000–2100. The browser rejects nonexistent local times normalized by daylight-saving transitions; valid times use the browser's timezone conversion.

Edits, cycle creation and follow-up changes carry the last-read aggregate revision. Reads cannot overwrite a newer successful mutation in the client. Repeated creation requests reuse the actor/operation/key and verify their fingerprint. A deleted record leaves a reference-only idempotency tombstone, so replaying the old key cannot recreate it. A new intentional tracking action may use a new key. The account limit is 500 retained cycles, 2,000 creation request keys and 50 follow-ups per cycle. At 500 events, new manual edits/additions are blocked; owners can still remove follow-ups or delete the cycle. Source-removal privacy operations remain possible regardless of that limit. Lists/events are paginated rather than silently losing older history.

## Ownership and history

`applications` owns a minimal published job snapshot, original canonical job identity, cycle, revision, stage, private fields and optional resume-version FK. `application_events` stores the prior/new stage, owner actor, UTC timestamp, action kind and optional owner-provided stage reference. It does not duplicate notes, source text or resume statements. `follow_up_tasks` owns next-step titles, UTC due dates and completion. `application_requests` stores idempotency hashes/references; `application_audit` records ID-only operation metadata for operators.

A unique partial index and shared owner lock allow one active cycle per owner/job. Tracking the same job is idempotent even under concurrent requests. A closed record cannot be reopened by editing its stage; a deliberate new cycle preserves prior history. Source expiry, confirmed closure, revoked rights or a missing catalog row cannot delete the user's independent historical note. Snapshot title/company/source metadata remain labelled historical. Live links are offered only while the recorded source link is still permitted and available; a failed network check does not by itself prove closure. Re-publication still requires the catalog's review transition.

Resume selection uses producer-owned minimal reference contracts. Deleting a resume source nulls its FK, advances the application revision and adds a `resume-removed` event in the same database transaction. No source filename/text/version is retained in that event. Existing independent notes and follow-ups remain. Deleting a tracker record does not delete its independent resume. Hard owner deletion cascades cycles/events/follow-ups/requests; audit identity is anonymized through its FK. Full account export/deletion orchestration, retention and recovery remain module 13 gates.

## Replaceable boundaries

The application core contains schemas, pure delayed-read/time helpers, repository/authorization ports and injected use cases. Request-scoped composition chooses the Supabase adapter; HTTP and route handlers perform bounded transport/origin checks. The browser screen uses an injected `ApplicationClient`; editor, follow-up and history components own their presentation/drafts. Only entry components construct concrete clients. The architecture checker includes this module.

Catalog and resume producers expose narrow SQL contracts for snapshots, source availability, version references and owner version choices. These deliberate transaction boundaries avoid a browser-side service-role client or copying resume facts into another store. A replacement adapter must retain owner isolation, optimistic updates, idempotency, immutable snapshots/events, deletion behavior and timezone tests.

## Hosted setup and checks

Apply reviewed migration 09 after modules 01–08 to the intended hosted project. Keep the existing server identity/catalog settings and exact app origin. There is no additional model key, worker handler, cron registration or mail setting for module 09. The public unconfigured/static demo retains the local board; it is not proof of hosted private persistence. Follow [configuration status](CONFIGURATION.md) for account-bound deployment and [identity setup](IDENTITY_SETUP.md) for OTP/SMTP.

Verify with authored data first: track a role, select a fixed resume, report a stage, add a dated task and reload. Use a second owner to verify denial, and a second tab to verify conflicts. Close/republish the source and confirm historical notes remain. Delete the resume source and verify immediate unlink/revision change; delete the tracker record and verify event/task removal. Opening a source, saving a bookmark and exporting a resume must leave the tracker stage unchanged.

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/applications.integration.test.ts
npm run identity:test
```

Tests use actual local Auth/PostgREST/PostgreSQL, the production Next server, Node resume workers and Chromium with an Asia/Taipei browser timezone. Authored test content and ignored screenshots are not real applications, employers or user data. They do not establish hosted operations, external submission confirmation or hiring outcomes. See the [complete implementation audit](IMPLEMENTATION_AUDIT.md) for remaining modules and release gates.
