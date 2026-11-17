# Private resume studio

Module 08 implements private PDF/DOCX sources, bounded parsing, owner-confirmed facts and claim histories, source-grounded order proposals, individual acceptance and fixed-version PDF export. The independent Node worker executes the actual `resume.parse`, `resume.revise` and `resume.export` handlers. It uses no model, provider consent or AI allowance. **Required model-assisted wording remains pending integration/evaluation with module 11**; the implemented deterministic fallback is not described as AI rewriting or an ATS score.

## Run locally — configured by the project

The repository enables local Supabase Storage and starts it through the existing helper. Migration `20261114080000_resume_studio.sql` creates the private `rolefoundry-resumes` bucket, policies, immutable versions and owner RPCs. No cloud credentials or model key are needed:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
# In another terminal:
npm run worker:local
```

Sign in at `http://127.0.0.1:3200/account/`, then open `/resume/`. The local helper supplies the existing identity/catalog configuration; the worker reads the ignored local environment file without printing its keys. Source files and text are not copied from the browser-local demo automatically. Copy/paste is an explicit owner action.

Upload a text PDF/DOCX, or paste a separate text source. Wait for the worker, review statements and source excerpts, choose completion states and linked skills, then confirm. This creates an immutable version. Linked non-learning statements become **unreviewed resume claims**, not scored evidence or verified ability. In-progress statements retain that label; learning goals produce no ability claim. Statements added manually are visibly separate from extracted source blocks.

Choose a published role to request the current exact-statement ordering fallback. Review before/after content and accept changes individually. Rejected sections retain their prior order; acceptance creates a new version without changing fact text. The fact editor preserves unsaved drafts when a newer version appears and asks the owner to load it or explicitly keep their draft for review. A stale baseline never silently overwrites a newer version.

PDF creation selects a fixed confirmed version, including an explicit historical version. Later edits do not change that export. Download requires a fresh, owner-bound, expiring permit. Source history, proposals, accepted choices and versions survive reload. The private skill profile links resume claims back to the exact confirmed source version. Without identity enabled, `/resume/` retains the clearly labelled local editor/text-export demo.

## API and authority

Paths are under `/api/v1`. All operations require an active verified session. Mutations require the configured same origin. Single resources use `{data: value}`; source history uses `{data, nextCursor}`. Unknown fields, malformed IDs, invalid media and version conflicts are rejected. No client owner ID is trusted. Raw private tables and worker/cleanup/profile-producer functions are not granted to member roles.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/resumes` | Optional opaque `cursor` | 20 owner sources, newest first |
| POST `/resumes/upload-intents` | `{filename, mediaType, byteCount}` and `Idempotency-Key` | `201 {documentId, uploadToken, expiresAt}` |
| PUT `/resumes/{id}/source` | Binary file, exact `Content-Type`, `X-Upload-Token` header | Size/hash-verified source and atomically queued parse; returns document |
| POST `/resumes/paste` | `{text}` and idempotency header | `202 {documentId, taskId, status}` |
| POST `/resumes/{id}/parse` | `{previousTaskId}` and idempotency header | Retry exhausted infrastructure failure against the same immutable source |
| GET `/resumes/{id}` | Source UUID | Private status/error, extracted draft, current confirmed version and bounded history |
| POST `/resumes/{id}/confirm` | `{expectedRevision, content: {facts, sections}}` | New immutable version, source-bound unreviewed claims and updated document |
| GET `/resume-versions/{id}` | Version UUID | Exact owner source version and its dictionary version |
| POST `/resumes/{id}/revisions` | `{versionId, jobId, expectedRevision}` and idempotency header | `202 {id, taskId, status}` |
| GET `/resume-revisions/{id}` | Proposal UUID | Source/job version, stale flag, before/after changes and accepted choices |
| POST `/resume-revisions/{id}/accept` | `{expectedRevision, changeIds}` | New version containing only accepted order changes |
| POST `/resumes/{id}/exports` | `{versionId}` and idempotency header | `202 {id, taskId, status}` for that fixed version |
| POST `/resume-exports/{id}/download-intents` | No content | `201 {id, expiresAt}`; requires same-origin POST |
| GET `/resume-downloads/{id}` | Download permit UUID and owner session | Verified PDF attachment; `Cache-Control: no-store` |
| DELETE `/resumes/{id}` | `{expectedRevision}` | `{deleted: true, cleanupPending}`; repeated deletion remains idempotent |
| GET `/tasks/{id}` | Owner task UUID | Safe task state/error/reference |

The upload URL is the application source endpoint, not a public or long-lived object-store URL. Its header token expires after five minutes and is bound to the authenticated owner and recorded metadata. Renewing an unfinished intent rotates its authority and object path; old attempts remain registered for cleanup. The server reads a bounded body, checks the stored byte count, uploads without overwriting another object, downloads it to verify SHA-256 and rechecks ownership/write authority before enqueue. Ready source metadata, the task and the task-ID-only pgmq message commit together after storage verification; registered-object cleanup covers the separate external write. Browser clients receive no privileged Storage key or direct bucket authority.

Download permit IDs last 60 seconds and also require the same owner session. The server checks access before and after fetching the object and verifies its stored size/hash. No public/CDN signed URL is returned. Deletion therefore revokes new application reads even if an older permit has not yet expired. Previously downloaded copies cannot be recalled.

Idempotency is actor + operation + key. Repeating an identical request returns its prior record/task; changed content under that key returns `409`. An uncertain UI submission reuses its key. Confirmation/acceptance carry the document revision. Repeating the same accepted choices returns the prior accepted version; different choices conflict. Parsing retries require the exact failed task with `RF_RETRY_EXHAUSTED`, retain the original source and are capped at five parse tasks per source. Unsupported/scanned/encrypted input uses a fresh source or paste fallback, not an unbounded retry loop.

## Models and planning rules

`content.facts` contains `{id, text, kind, state, skillIds, sourceBlockId}`; `content.sections` contains `{id, heading, factIds}`. Every fact belongs to exactly one nonempty section. `sourceBlockId` is a block from this source's extraction or null for an owner-added statement. Kinds are `experience`, `project`, `education`, `credential`, `skill-claim`, `contact`, `other`. States are `completed`, `in-progress`, `learning`, `unspecified`. Completion is always owner-reported.

Extraction stores normalized text with exact UTF-16 offsets and optional page references. The original file never changes. Skill source IDs remain in immutable versions; the stored dictionary version supports historical labels. A new proposal separately seals the current canonical-ID map and target skill IDs. Reviewed merges therefore affect new ranking without rewriting earlier confirmed facts or their dictionary context.

`resume-order-v1` moves exact confirmed statements linked to target skills earlier within their section. It asks about missing evidence instead of adding a requirement as a claim. Validation checks source/job/version/section/fact identities, before/after text, complete fact membership and unique changes. A replaced reviser cannot introduce metrics, credentials, completed-project claims or missing fact IDs. Model-assisted wording needs a separately versioned, evaluated recipe and gateway integration.

Confirmed facts with linked skills produce private `resume-claim` evidence. The profile-owned internal append contract retains old evidence versions; original labels/context/outcomes remain unreviewed. Source contexts are marked excerpts with a link to the full confirmed version. Skills are grouped within the profile contract's nine-skill bound; confirmation respects the 500-evidence creation budget. Ordinary fact edits append claim versions and mark downstream reports stale. Removing a linked statement or changing it to a learning goal removes that derived claim. Merely accepting an unchanged fact order does not change ability evidence. Deleting an individual profile claim does not delete the independent resume text; an explicit later fact confirmation can recreate it.

## Isolated processing and limits

The consuming module owns parser, renderer, reviser, repository, storage, digest and execution-store ports. UI forms use an injected `ResumeClient`; only the entry/composition roots select adapters. Pure schemas/rules/handlers have no Next, database SDK, document-library or fixture imports. A transport, storage or processor replacement must preserve the authorization/version/fact tests.

- PDF extraction uses the [PDF.js data API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html) with data bytes, evaluation disabled and page/text limits. Empty/raster-only and password-protected documents receive safe, specific errors.
- DOCX uses [Mammoth raw-text extraction](https://github.com/mwilliamson/mammoth.js#basic-conversion), buffer input and default disabled external-file access. A ZIP pass checks advertised and actual inflation, unsafe/duplicate names, encrypted entries, macros/embedded objects and XML DTD/entity/null-byte content. No HTML conversion, linked-image fetch or file extraction occurs.
- The [PDFKit template](https://pdfkit.org/docs/text.html) renders accepted headings/statements with explicit in-progress/learning labels. It embeds a bundled Noto Sans CJK TC subset with its [pinned source and OFL license](../assets/fonts/README.md). Unsupported glyphs fail instead of disappearing. Export execution independently reparses and compares content tokens, preserving Latin word boundaries and tolerating layout whitespace around Han characters. No PDF accessibility conformance is claimed.

`src/modules/resume/limits.json` centralizes 5 MiB source/export, 20 MiB inflated ZIP, 512 ZIP entries, 20 pages, 50,000 text characters, 250 facts/blocks, 40 sections and a 20-second deadline per processor child. Statements are limited to 4,000 characters; long extracted statements can be split explicitly in the UI. Accounts have 100 active sources; each document has at most 100 confirmed versions, proposals and exports. History is bounded, never silently described as an unlimited analysis.

The child receives no inherited runtime credentials, bounded stdin/stdout, a 192 MiB V8 heap limit and narrow Node filesystem-read permissions. It has no JS filesystem-write/subprocess permission and no document-supplied filesystem path. Native canvas support means Node permissions are **not an OS sandbox for malicious native code**. The Linux smoke test adds read-only filesystem, no network, memory/CPU/PID bounds, dropped capabilities and no-new-privileges. Apply appropriate container controls in hosted operation; the parent queue worker still needs database/storage network access.

## Publication, deletion and cleanup

Migrations create `resume_documents`, immutable `resume_versions`, `resume_claim_links`, `revision_proposals`, `resume_exports`, `resume_downloads`, `resume_storage_objects` and audit records. The private bucket has a restrictive member policy as well as private visibility. Only the service adapter accesses objects; authenticated roles cannot bypass owner RPCs through raw tables or the bucket.

Lock order is shared catalog → shared dictionary → owner → task → domain record. Worker load/publication checks active ownership, source hash, task/input identity and lease. Proposals also recheck current document, profile, catalog, dictionary and job versions/availability. Exports remain tied to their selected immutable version, so later edits do not invalidate that version's requested output. The final lease check, result rows and task success commit atomically; expiry during publication rolls back all generated state. Redelivery after commit archives without republishing.

Every object path is registered before an external write. Uncommitted export paths include the task lease token, preventing a reclaimed attempt from overwriting a prior output. Final publication verifies the stored size/hash and ownership again. Losing the lease or owner leaves a registered orphan rather than a downloadable result.

Deletion immediately tombstones the source, cancels work, erases pasted/extracted text, confirmed versions, proposals, permits and exports, and removes linked resume evidence. Existing matching/learning evidence-version guards synchronously purge copied reports in the same transaction. Late workers cannot restore them. Hard owner deletion cascades records and schedules objects even after their owner reference disappears.

The independent worker's service-only janitor claims due reference rows with short leases, removes Storage objects and acknowledges successful cleanup. Storage failures retain work for retry; duplicate cleanup is safe. Ready objects become due on deletion. In-flight writes receive their recorded write deadline plus a two-minute safety window; abandoned intents expire and are reclaimed. Access is revoked immediately while physical cleanup can remain pending. This is not a guaranteed deletion deadline during a Storage outage. The janitor also expires download permits and does not require an active source owner.

## Hosted setup and verification

The local settings above are configured and tested. Hosted services are separate operator/account-bound steps; the application does not migrate an unrelated or production database during deployment.

1. Apply migrations 01–08, in order, to the intended Supabase project after review. Confirm the `rolefoundry-resumes` bucket is **private**, allows PDF/DOCX only and has a 5 MiB bucket limit. The project-wide Storage limit must be at least 5 MiB. Review broad policies; the restrictive bucket policy must remain in place. See [Supabase access control](https://supabase.com/docs/guides/storage/security/access-control).
2. Use the existing server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ROLEFOUNDRY_APP_ORIGIN` and identity/catalog flags from [identity setup](IDENTITY_SETUP.md). Enable `ROLEFOUNDRY_IDENTITY_ENABLED=true` during the web build/runtime; Next derives its browser flag. Catalog/dictionary-enabled builds also expose target roles and skill choices. Never put a service key in a `NEXT_PUBLIC_*` variable.
3. Deploy `Dockerfile.worker` separately from Vercel Functions with the same project's URL/service key in the host's secret manager. Its non-root image includes parsers, fonts and the registered domain handlers. Run the worker continuously; observe task and `resume.cleanup`/`resume.cleanup_unavailable` events without logging source content. Source parsing does not run inside a long-lived web request.
4. Use synthetic content first: upload/paste, confirm, create/accept a proposal, export, reload the fixed version and delete it. Verify cross-user denial, expired permits, removed claim evidence and drained cleanup rows. Rehearse Storage/database recovery and configure alerts before accepting real personal data; module 13 retains those operational gates.

```bash
npm run typecheck
npm test
npm run resume:test
npm run architecture:check
npm run identity:test
docker build -f Dockerfile.worker -t rolefoundry-worker:resume .
node scripts/check-resume-worker-image.mjs rolefoundry-worker:resume
```

The seven process cases verify real document parsing/rendering and the Linux container round-trip. Sixteen full-stack resume cases exercise actual Auth/PostgREST/PostgreSQL/Storage, production Next, Node workers and Chromium: private PDF/DOCX, Unicode source spans, idempotency and ID-only messages, version/claim provenance, reviewed canonical merges, partial acceptance, fixed historical downloads, expiry, stale/foreign/forged sources, mid-publication lease rollback/reclaim, exhausted retries, deactivated/deleted owners, immediate report purge and physical cleanup. Mobile browser cases cover upload → review → confirm → accept → PDF → reload → source link → deletion, plus paste fallback and anonymous isolation.

Authored test files and screenshots are ignored local artifacts, not real user resumes. Actual desktop/mobile views and bilingual/multipage PDF renders were inspected. Passing these checks does not establish hosted availability/recovery, model quality, real source rights or pilot outcomes. The [full audit](IMPLEMENTATION_AUDIT.md) preserves all remaining modules and gates.
