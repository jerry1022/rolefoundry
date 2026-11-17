# Authorized ingestion — implementation in progress

Module 10 is not complete. The repository now implements a tested parsing/normalization core, an approved-feed network boundary and a durable provider-delay extension. The batch/review database, production import execution store, routes, administrator UI, publication provenance and source scheduler still need integration and real-stack acceptance. There is no running catalog import endpoint or scheduled external feed on this checkpoint. This guide tracks that full remaining scope rather than treating a core interface as a finished service.

## Implemented core

`src/modules/ingestion` owns source/snapshot/output schemas, submission/authorization/execution ports, a bounded JSON/CSV parser, permission filtering, pure review planning and stable source/external identity keys. Domain code has no database, Next, document-library or provider SDK dependency. The consuming module owns its ports; concrete hashing/network adapters remain outside the core.

A JSON file has `{records: [{externalId, url, state, fields}]}`. `state` is `active` or `closed`; `fields` is a partial metadata object. CSV uses `externalId,url`, optional `state`, and the same field names as headers. Nested arrays/objects use JSON; durations accept minute counts or explicit supported units. A quoted CSV cell supports doubled quotes and embedded line breaks, following the [CSV quoting format](https://www.rfc-editor.org/rfc/rfc4180). A malformed header/quoting envelope fails safely; invalid individual rows do not discard valid rows. CSV formulas remain literal strings; nothing is evaluated or exported to a spreadsheet.

Limits are centralized: 2 MiB input, 100 rows, 64 KiB per row, nesting depth 16, 8 MiB context and 4 MiB planned output. Unknown or unpermitted fields reject the row without retaining their values in the sanitized result. The submission use case authorizes before reading source configuration or parsing/persisting input. Replaced execution stores must revalidate this authority under their own transaction locks.

An absent JSON field or empty CSV cell means **retain the curated value**. Explicit JSON null or the literal CSV cell `null` means clear that field; non-nullable cleared values remain blocking review issues. No salary/currency, duration, skill, level or track is invented. Salary intervals and explicit numeric/duration units normalize without currency conversion or assumed working hours. New optional values can remain unknown. Required metadata missing from a new record becomes a review issue.

Explicit canonical IDs or reviewed bilingual aliases resolve against a pinned dictionary snapshot. Ambiguous/unmapped terms remain visible in the permitted source fields and issue list; they do not become new canonical concepts automatically. Cross-source suggestions are separate candidate IDs and require review. A source/external ID is stable across batches; a similar title does not authorize an automatic merge. Existing target version/revision and original source URL are retained so changed links/content produce a diff rather than silently replacing curated values. Missing records never imply closure. An explicit closure requires the source's closure capability.

## Approved-feed boundary

`StaticFeedRegistry` is constructed from deployment-owned definitions containing an ID, kind, format, exact initial HTTPS URL and exact redirect-host allowlist. It produces immutable definitions with a SHA-256 configuration revision. The future administrator API selects an ID; it must never accept an administrator-provided worker URL, proxy option, header, TLS override or filesystem path. No live feed is configured by these classes alone.

`SafeFeedReader` and the Node HTTPS transport implement:

- HTTPS, exact host membership, no credentials/custom ports/fragments, and bounded redirects with loop detection.
- Every-hop DNS resolution, rejection of mixed public/private answers and non-global/reserved address ranges, and passing the validated address to the actual socket lookup. The transport retains the original host/TLS server name and certificate verification; checking an address and then resolving it again is not the contract.
- No service cookies/keys or browser headers; no shared credentialed fetch client; no automatically followed redirect outside this boundary.
- Identity encoding, supported JSON/CSV media, strict UTF-8, header/body bounds, socket timeout, overall deadline and cancellation. It does not decompress arbitrary remote archives or scrape HTML/login pages.
- At most three attempts with bounded short waits. Longer valid `Retry-After` values are returned as structured delay metadata instead of sleeping under a worker lease. Values exceeding one day require manual retry/pause handling; they must not be shortened into an automatic one-day retry.

The Node adapter uses [HTTPS request options](https://nodejs.org/api/https.html) and an explicit pinned lookup. The tests inject DNS/transport responses to exercise decision boundaries and also reject a private address at the raw transport entry. They do not establish that a particular live source permits copying, that a live offering exists, or that a production network sandbox is configured.

## Configured retry foundation

Migration `20261114100000_ingestion_retry_authority.sql` adds service-only `task_fail_after`. It preserves the existing task failure/attempt limit and owner/lease checks, releases the lease, and persists the requested bounded wait in both `tasks.next_run_at` and the actual pgmq message visibility. A stale/expired lease cannot extend or shorten a newer retry. Queue visibility does not shorten the original exponential backoff. Existing handlers keep their original `task_fail` path when no provider delay is supplied.

The local project stack has this migration applied. No hosted database was changed. Apply reviewed migrations to the intended hosted project through the established deployment workflow; previews do not migrate production implicitly. No new credential is needed for the processing core or retry authority.

## Required integration still to implement

1. Add source import settings with explicit upload/fetch/closure capabilities, reviewed policy revisions, refresh intervals and approved feed IDs. A revoke/reactivate cycle must invalidate old import authority. Preserve the existing job/course source permissions and provider URL rules.
2. Persist sanitized `import_batches`, source/external `source_records`, versioned `review_items` and publication-origin/audit records. Repeated source/batch IDs and actor/request keys must return the original result or reject changed content. Never persist forbidden raw file fields or put payloads in queue messages.
3. Connect `catalog.import` to the actual independent worker. Load and recheck active administrator/source authority, seal parsed feed input once, retrieve producer-owned current drafts/cross-source suggestions and a dictionary snapshot, then publish bounded review results under the task lease. A replaced adapter must not publish forged/foreign target references.
4. Implement per-record review/rebase/rejection and existing job/course producer publication contracts. Compare the exact target revision and source/dictionary authority again. New/changed metadata requires explicit review; a stale diff must not overwrite newer curation. Every published version must link to its batch, source record and reviewer. Historical course plans and application snapshots remain unchanged.
5. Add source-specific due scheduling with idempotent window IDs, bounded retries and explicit closure handling. Network errors mark prior known records uncertain, not closed; missing rows never retire records. Long provider waits persist in the queue. A wait beyond the supported retry bound pauses automatic retrieval until an operator acts.
6. Add bounded administrator routes and forms for source settings, JSON/CSV uploads, batch counts/issues/diffs, duplicate decisions, stale rebase and publication. Non-admin/anonymous/raw-table access must fail closed. Keep the existing public provenance inspector/local reset clearly separate.
7. Exercise actual Auth/PostgREST/PostgreSQL/pgmq/Node/browser behavior, source revocation during execution, lease loss during publication, retries, partial failures, duplicate batches/cross-source records, missing versus removed fields, malformed CSV, undisclosed salary, explicit closure, stale records and publication provenance. Update README/API/data/HLD/configuration guides and open the complete module PR only after that path is verified.

## Verification at this checkpoint

Nineteen new core cases cover JSON/CSV partial failures, quoted content, forbidden-field erasure, bounds/prototype keys, salary/work-mode normalization, partial curated updates and changed URLs, bilingual/ambiguous skills, cross-source suggestions, course duration/provider paths, closure capability and authorization-before-persistence; approved feed IDs, non-global/mixed DNS, pinned address flow, redirects, media/UTF-8/compression/body limits, bounded retries/long waits and cancellation. An additional worker test proves delay handoff without sleeping under the lease. Three real database/queue cases verify persisted delay/visibility, expired/foreign/duplicate lease behavior and service-only authority.

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/ingestion-retry.integration.test.ts
```

The complete module 10 review/import/scheduler workflow is not proven by these core checks. [The design audit](IMPLEMENTATION_AUDIT.md) retains it, along with modules 11–13, real-source rights/content, provider evaluation and hosted operations gates.
