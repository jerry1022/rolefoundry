# Published job catalog and private bookmarks

Module 03 adds persistent, source-traceable AI roles, server-rendered public browsing and owner-scoped bookmarks. The ten original specializations and their learning/evidence guides remain available even when no job is published in a category. The static demo keeps its eight explicitly fictional fixtures.

## Setup

Use [Identity setup](IDENTITY_SETUP.md), then review/apply the pending local migration:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
```

The local development helper enables identity and the catalog. `/jobs/` now reads the database, initially empty; it does not silently publish fictional fixtures as live jobs. Tests create clearly labeled fictional listings in the isolated local stack and remove only their own records.

For a hosted Next deployment, apply `20261114030000_job_catalog.sql` after modules 01–02 and set `ROLEFOUNDRY_CATALOG_ENABLED=true` at build/runtime. Public reads need only `SUPABASE_URL` and `SUPABASE_ANON_KEY`; they work with identity disabled and without a service key. Private bookmarks and administration additionally use the existing identity configuration and verified session. Rebuild after changing feature flags. Static export forces both live features off and excludes their handlers.

Sources, drafts and permission documents are not anonymous-readable tables. Public RPCs return only published records and allowed source metadata. No cloud migration, live source agreement or external fetch is executed automatically. The [module 10 upload/review backend](INGESTION_SETUP.md) now connects source-governed inputs to reviewed publication; remote scheduling/import UI and the full module 13 admin controls remain; the admin API below is executable now.

## Public API

| Method/path | Contract |
| --- | --- |
| GET `/api/v1/jobs` | Optional `q`, `track`, `specialization`, `workplace`, `location`, `level`, `limit` (1–50), `cursor` |
| GET `/api/v1/jobs/{id}` | Current published job version; draft/review/retired/unknown IDs return 404 |

Lists return `{data, nextCursor, revision, recipe, appliedFilters, counts}`. Keyword search is AND-based, case-insensitive and includes role/company/content, requirement text, canonical skill IDs, reviewed bilingual dictionary aliases/labels and the original specialization aliases. `%`, SQL-looking text and other symbols are literal text, never SQL or wildcard instructions. Supported full-width query characters are normalized. The lexical recipe is `lexical-v1`; UUID ordering provides deterministic tie-breaking. Cursor tokens bind the original normalized filters and catalog revision. Mutations require restarting stale pagination; naturally elapsed expiry is always rechecked so expired jobs cannot leak through an old cursor. Counts include all ten categories and reflect the other applied filters.

A job retains its company/title/version, requirements with mandatory/preferred priority, canonical skills, explicit conditions and source freshness. Missing location, workplace, level, salary, experience or authorization remain null/unknown. Salary stores positive bounds, currency and hour/month/year separately; undisclosed is null. This catalog does not imply market completeness, employer eligibility or hiring probability.

## Private bookmarks

| Method/path | Contract |
| --- | --- |
| GET `/api/v1/bookmarks` | Owner list; `limit` (1–50), opaque `cursor`; `{data, nextCursor, revision}` |
| PUT `/api/v1/bookmarks/{jobId}` | Idempotent save of a published job; optional empty JSON body |
| DELETE `/api/v1/bookmarks/{jobId}` | Idempotent removal; optional empty JSON body |

Mutations require the configured same origin. Lists and writes require an active verified session. The owner is never accepted from the client. A bookmark snapshots the title, company, source link and immutable job-version ID. Retired jobs remain readable in the owner's saved list with `available: false`; a different member cannot create a new bookmark for that retired job. Duplicate saves/removals do not increment the owner's bookmark revision. Bookmark pages are bound to that owner and revision. Bookmarks neither change profile evidence nor submit an application.

## Administrator API

Use a verified administrator session and JSON. All routes below are under `/api/v1/admin/catalog`. Bodies are limited to 64 KiB; private identity/profile mutations retain their 8 KiB default. Unknown fields are rejected at the service boundary, and database entry points independently reauthorize the admin role.

| Method/path | Input/result |
| --- | --- |
| POST `/sources` | `{name, publisher, authorizationBasis, rightsSummary, allowedHosts, permittedFields, isDemo}` → source ID |
| POST `/sources/{id}/status` | `{status: "active" | "revoked"}` |
| POST `/jobs` | `{job, source: {sourceId, externalId, url}}` → `{id, revision}` draft |
| PATCH `/jobs/{id}` | `{expectedRevision, job}` → immutable new content version |
| POST `/jobs/{id}/sources` | `{sourceId, externalId, url}` → attach another authorized source |
| POST `/jobs/{id}/status` | `{expectedRevision, status}` → reviewed lifecycle transition |
| POST `/jobs/{id}/translations` | `{versionId, locale: "zh-TW", title, summary, responsibilities, reviewNote}` → reviewed translation of the current version |
| POST `/jobs/{id}/translations/remove` | `{versionId, locale}` → remove that translation |
| POST `/observations/{jobSourceId}/record` | `{event: "confirmed_active" | "confirmed_closed" | "network_failure"}` |

The job draft schema is defined in `src/modules/jobs/model.ts`. It contains a stable `canonicalKey`, company/title, assessment track, specialization, nullable location/workplace/level/salary, summary, responsibilities, structured requirements/conditions and optional expiry. Canonical keys prevent duplicate openings. Source/external IDs cannot be attached to two different canonical jobs. Multiple permitted sources produce one job result while retaining their own provenance.

A source's `authorizationBasis` is private operational text; `rightsSummary` is explicitly public. Never put secrets or private agreement terms in that summary. `permittedFields` explicitly names allowed publication fields; publishing requires a valid active source covering every populated public field. Source URLs require HTTPS, no embedded credentials and an exact allowlisted hostname. Module 03 records links only and never fetches arbitrary URLs. Later network adapters need additional DNS/private-network/redirect defenses.

Lifecycle: draft → review → published; review can return to draft or reject; published can return to review or expire; expired must return to review; rejected can return to draft. Published content edits return the job to review and preserve its former content version. Concurrent stale edits return 409. A revoked final authorized source immediately hides the job and returns it to review. Re-enabling rights never silently republishes it.

A network failure preserves the last successful validation and marks an active source uncertain. It cannot reopen a source already confirmed closed. Closing one of several sources retains the job while another permitted source remains available; closing the final one expires it. Explicit expiry is checked at every public read. Admin actions and catalog revisions commit together with an audit reference; no job description or private permission document enters the audit row.

### Reviewed translations

Administrators add reviewed Traditional Chinese text in the **Job translations** section of `/admin/` (migration `20261114320000`). The rules:

- A translation belongs to one immutable job version (`job_version_translations`). Saving requires the current `versionId`, so a stale form returns 409. A later revision hides the translation until someone reviews the new version, which means readers never see text that describes an older listing.
- Only fields that the version itself publishes can be translated: the title, summary and responsibilities. Publication already requires every source to permit those fields, so a translation never exceeds the source's rights. Each published responsibility needs exactly one translated line.
- Every save needs a review note and records the reviewer. Saves and removals write `catalog_audit` (`job.translated`, `job.translation_removed`) without any job text.
- Public job responses carry `translations["zh-TW"]` (title, summary, responsibilities, reviewedAt) for the current version only. `localizedJobText` in `src/modules/jobs/model.ts` uses it for zh-TW viewers and sets `lang="zh-Hant"`. Job details note that the text is a reviewed translation. Everyone else, and any version without an aligned translation, sees the English source.

Requirement text, company names, search and bookmark snapshots stay in the source language. Lexical search does not index translations yet.

## Architecture and verification

`JobCatalogService` is independent of Auth; private bookmark/admin services consume an authorization port. Repositories and browser clients are replaceable adapters. The public composition root uses an anonymous client; the private root uses a request-scoped verified session. The shared canonical skill schema lives in the skill module, not profile persistence. The specialization module has compatibility exports for the original local demo.

Run:

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test
npm run test:e2e
npm run build
NEXT_PUBLIC_BASE_PATH=/rolefoundry npm run build:pages
```

The integration suite covers anonymous/SSR reads, no-service-key operation, bilingual combined filters, deduplication, permission withdrawal, network failure versus closure, immutable/conflicting edits, stable cursors, private concurrent bookmarks, retired snapshots and actual mobile browsing/saving. Dictionary aliases and historical canonical projections are integrated in module 04; personalized ranking, real ingestion and application-history integration are tracked in modules 06/09/10; lexical search is the working fallback while embeddings are unavailable.
