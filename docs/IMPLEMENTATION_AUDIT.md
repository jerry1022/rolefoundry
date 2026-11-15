# Design implementation audit

This checklist preserves the complete numbered design scope. Passing one module or CI suite does not complete the overall goal. Status refers to implementation, not hosted operations or pilot validation.

## 01 — Identity, access, consent and quotas

- Design: [01-identity-access.md](design/01-identity-access.md).
- Status: Implemented; PR #1, configured-hosting gates remain.
- Required acceptance scope: Reject cross-user reads, role spoofing, expired invitations and duplicate invitation redemption. Verify quota concurrency, idempotent retries, UTC week boundaries, consent version changes and reservation refunds. Verify that unauthenticated users can still browse published jobs and courses.

The integration suite runs against actual local GoTrue, PostgREST, PostgreSQL and the production standalone web build. It includes real email delivery to Mailpit and browser sign-in/sign-out, plus a client-bundle scan for service-role credentials. Unit tests exercise actor forgery, expiry/error handling and UTC boundaries. Hosted configuration remains an operator deployment step, not an implicit change to the existing public demo.

## 02 — Profile and evidence

- Design: [02-profile-evidence.md](design/02-profile-evidence.md).
- Status: Implemented; PR #2, downstream consumers still require integration.
- Required acceptance scope: Round-trip preferences, concurrent edits and version conflicts; confirm that course completion does not change ability; verify evidence source labels and cross-user isolation; invalidate reports after material updates; handle absent, malformed or unavailable browser storage in the scaffold.

## 03 — Job catalog and search

- Design: [03-job-catalog-search.md](design/03-job-catalog-search.md).
- Status: Catalog, source governance and private bookmarks implemented; see [setup and evidence](CATALOG_SETUP.md). Full aliases/personalization/ingestion/application history depend on 04/06/09/10 and remain in this audit.
- Required acceptance scope: Verify bilingual aliases, combined filters, stable pagination, no duplicate canonical openings, undisclosed salaries, source closure and network failure. Check that retired jobs are excluded from recommendations while historical tracking remains readable. Ensure private bookmarks cannot be enumerated by another user.

## 04 — Skill dictionary

- Design: [04-skill-dictionary.md](design/04-skill-dictionary.md).
- Status: Implemented; see [setup and verification scope](SKILL_DICTIONARY_SETUP.md). Consumer source/canonical joins are integrated; future reports must still bind dictionary versions.
- Required acceptance scope: Verify alias normalization, ambiguous input, English/Traditional Chinese labels, cycle rejection, merge redirects, historical dictionary versions and stable references across label changes. Audit mapping changes that materially alter matching results.

## 05 — Assessment

- Design: [05-assessment.md](design/05-assessment.md).
- Status: Fixed-choice production path implemented and locally verified; [setup and evidence](ASSESSMENT_SETUP.md). Expert bank review and future short-answer calibration remain explicit release gates.
- Required acceptance scope: Cover each track, full/partial/invalid submissions, duplicate submission, question version changes, retries, evidence provenance, answer confidentiality and deleted owners. Calibrate short-answer agreement with reviewed examples before enabling it publicly.

## 06 — Matching and gap analysis

- Design: [06-matching-gaps.md](design/06-matching-gaps.md).
- Status: In progress. Pure rule engine and eight unit tests are implemented; persisted snapshots, task execution, private APIs/UI and deletion/version integration are still pending. This is not a completed module.
- Required acceptance scope: Test hard conflicts versus unknowns, mandatory versus preferred requirements, empty profiles, unrelated jobs, duplicate skills, stale versions and deterministic ordering. Human review must confirm that every reported strength or gap has supporting source data.

## 07 — Course catalog and learning plans

- Design: [07-courses-learning.md](design/07-courses-learning.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Verify prerequisite order, no matching resource, completed-course deduplication, limited time budgets, unavailable resources, outdated metadata and source-ID validation. Ensure a course-complete event never promotes ability without separate evidence.

## 08 — Resume studio

- Design: [08-resume-studio.md](design/08-resume-studio.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Test text PDF/DOCX, scanned/empty/oversized documents, malformed content, stale proposals, partial acceptance, fact preservation and private export access. Check that exported content exactly matches the accepted version and that failures never overwrite the source.

## 09 — Application tracking

- Design: [09-application-tracking.md](design/09-application-tracking.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Test idempotent additions, stage transitions, notes across reload, source closure, duplicate cycles, unauthorized access and optimistic conflicts. Verify explicitly that bookmarking, exporting a resume and opening an external page cannot mark an application successful.

## 10 — Ingestion and source governance

- Design: [10-ingestion.md](design/10-ingestion.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Exercise duplicate batches, cross-source duplicates, partial failures, malformed CSV, undisclosed salary, stale records, revoked source rights, redirects, private-network URLs and explicit closure. Audit every publication back to its batch and reviewer.

## 11 — AI Gateway

- Design: [11-ai-gateway.md](design/11-ai-gateway.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Use fake adapters for malformed JSON, absent fact IDs, invented course IDs, quota errors, prompt-injection content, timeouts and deleted owners. Run explicit live-provider evaluation separately after credentials and data use are authorized. No live provider is required to run scaffold tests.

## 12 — Background worker and tasks

- Design: [12-worker-tasks.md](design/12-worker-tasks.md).
- Status: Durable pgmq engine, queue adapter and actual assessment handler implemented/verified with module 05. Remaining domain/provider handlers, invalidation dispatch and hosted telemetry integration are still pending; do not count the entire module complete.
- Required acceptance scope: Simulate duplicate delivery, lease expiry, crash before/after commit, provider timeout, poison payload, stale input, owner deletion and graceful shutdown. Verify that queue age, lease age, retries and terminal failures are observable.

## 13 — Administration and operations

- Design: [13-admin-operations.md](design/13-admin-operations.md).
- Status: Pending implementation and verification.
- Required acceptance scope: Verify non-admin rejection, audit coverage, publication rollback, missing-secret startup behavior, failed-task replay, deletion during execution and database/storage restoration. Confirm that deploys do not migrate production data automatically from an unreviewed pull request.

## Cross-module completion gates

- [ ] All thirteen designs implemented and independently reviewed against their responsibility, data, flow, failure and acceptance sections.
- [ ] End-to-end identity → private evidence → published job → assessment → matching → reviewed learning → confirmed resume → tracking journey uses persistent services.
- [ ] Worker/gateway integration exercises real durable dispatch, retries, authorization/version guards and deletion.
- [ ] Provider adapters and document processing meet their schema/reference/fact-preservation limits.
- [ ] Administration, source permissions, account export/deletion, telemetry and recovery runbooks are executable and tested.
- [ ] README, HLD, API, data/deployment documentation and test evidence match the implemented system.
- [ ] Hosted configuration, source authorization, human content review and live-provider/pilot gates have authoritative evidence; no test fixture is described as a live opening or certified capability.
