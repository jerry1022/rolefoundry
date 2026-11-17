# Authorized ingestion — upload and review workflow

Module 10 is still in progress. Its configured backend now accepts authorized JSON/CSV uploads, creates durable `catalog.import` tasks, runs the actual Node worker, preserves immutable review previews and publishes explicitly reviewed job/course versions with origin/reviewer records. Deployment-approved feed networking and provider retry authority are implemented as cores. The administrator browser workflow is connected. Remote feed execution and source scheduling remain required; there is no live scheduled feed on this checkpoint.

## Local setup and authority

The existing project identity/catalog/worker settings are sufficient. Local migrations through `20261114102000_ingestion_reviews.sql` are applied. No new credential or provider key is needed:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
# Separate terminal:
npm run worker:local
```

Use a verified administrator account and an existing source from [job catalog administration](CATALOG_SETUP.md) or [course administration](LEARNING_SETUP.md). Import uploads default to disabled. Explicitly enable uploads and, separately, closure handling for the intended source using its current settings revision. No sample source is left enabled by the tests, and no agreement, hosted migration or real external retrieval is implied by local setup.

Source permission/provider settings have a monotonic policy revision. A revoke/reactivate cycle or changed import settings invalidates previous authority. Every upload, task load/result commit, preview rebase and publication checks the current source policy. Queue execution additionally checks that its original owner is still an active administrator and that its exact task/input/lease remains valid. Other members cannot read batches, configure sources, inspect raw tables or invoke worker helpers.

## Implemented administrator API

Paths below are under `/api/v1/admin/imports`. Mutations require JSON and the configured same origin. Every endpoint derives administrator authority from the verified session. All responses are private/no-store. Dynamic APIs are excluded from static export.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/sources` | None | `{data: sourceSettings[]}` with source name/status, effective policy, import revision and enabled flags |
| PATCH `/sources/{sourceId}` | `{expectedRevision, uploadsEnabled, allowClosure}` | Updated effective source policy |
| GET `/` | Optional cursor | `{data, nextCursor}`; 20 bounded batch summaries without full previews/source payloads |
| POST `/` | `{sourceId, batchId, format, content}` and `Idempotency-Key` | `202 {data: {id, taskId, status}}` |
| GET `/{batchId}` | Batch UUID | Full bounded issues/latest previews, task status and source authority flag |
| GET `/reviews/{reviewId}` | Review UUID | Immutable current preview, source/dictionary/target freshness, source-row recency and publication reference |
| POST `/reviews/{reviewId}/rebase` | `{expectedRevision, targetId: UUID or null}` | New preview version against current permitted source, dictionary and curation |
| POST `/reviews/{reviewId}/decide` | `{expectedRevision, decision, draft, reason, allowNewDuplicate}` and idempotency header | Stable publication/decision receipt |

Decision is `publish`, `reject`, `close` or `confirm`. `publish` takes a complete job/course draft using the existing producer schema; identity/source/key/URL values remain bound to the reviewed source/target. Other decisions require `draft: null`. Reasons are 1–1,000 characters. `allowNewDuplicate` is an explicit acknowledgement when creating a separate record despite duplicate suggestions; it cannot bypass the course provider's unique URL identity rule. Linking to a suggested canonical record requires a rebase selecting that candidate first. An existing source/external binding cannot silently be reassigned.

A repeated source/batch ID or actor/request key returns the prior batch only for the same source fingerprint, sanitized content and SHA-256 fingerprint of the original text. Changed forbidden values or file bytes cannot masquerade as an identical request, while forbidden raw values are never stored. A repeated decision key returns its original receipt, including after an uncertain HTTP response; it cannot publish another version. Conflicts require refreshing/reviewing the current state.

## Administrator browser workflow

Open `/admin/` on the configured local server. The public demo inspector remains clearly labelled; the separate **Source imports and publication review** section checks the verified session before loading private import data. Anonymous and member sessions cannot use its controls or read batch contents. Static/demo deployments retain their original inspector without import controls.

1. Register a job source using the publisher, private authorization basis, public rights summary, lowercase allowed hostnames and explicitly permitted metadata fields. Mark synthetic metadata as demonstration content. Registration calls the existing job producer contract and leaves uploads disabled. For course sources, open **Course administration** on `/learning/` and choose the provider there.
2. Expand **Authorized source settings**. Enable uploads for that source; enable explicit closure separately only when intended. Revoked sources cannot accept uploads. Save settings against the displayed revision; a conflict requires reloading current settings.
3. Choose the source, enter a stable batch identifier and upload a JSON/CSV file or paste its content. The browser checks the 2 MiB limit; the server independently checks all limits and rights. Queue the batch and run the independent worker. Status polling stops after 60 checks; **Refresh selected batch** resumes it.
4. Open a batch and **Review row**. Rejected rows show bounded issues separately. Compare previous values with the source proposal and inspect the original source link. For a duplicate suggestion, choose a catalog target and explicitly rebuild the preview before deciding. Candidate UUIDs are stable catalog identities; suggestions never merge automatically.
5. Correct publication metadata in structured fields. Canonical identity, provider, source and original URL remain bound to the reviewed source. Skill inputs accept canonical IDs; inspect `/dictionary/` for reviewed concepts. No raw JSON replacement is needed for editorial review. Unknown values remain empty. The server independently validates complete producer drafts.
6. Explain the decision and publish, reject, confirm unchanged metadata or confirm an explicit source closure. Creating a separate record despite duplicate suggestions requires explicit acknowledgement. A conflict preserves unsaved editorial input. **Rebuild preview** and **Reload review** explicitly discard those edits; a superseded row cannot be rebased or published. Completed decisions show their saved publication reference and remain available after reload.

The injected `ImportAdminClient` owns browser operations. Only its HTTP adapter chooses routes; screens do not import a database client or privileged credentials. File contents and editorial drafts stay in component memory rather than browser storage. Retried identical submissions/decisions reuse their request key until acknowledged.

## Input, normalization and review

A JSON file has `{records: [{externalId, url, state, fields}]}`. `state` is `active` or `closed`; `fields` is a partial metadata object. CSV uses `externalId,url`, optional `state` and the same metadata field names as headers. Nested arrays/objects use JSON; durations accept minute counts or supported explicit units. [CSV quoting](https://www.rfc-editor.org/rfc/rfc4180) supports doubled quotes and embedded line breaks. Malformed headers/quoting fail safely; bad individual records do not discard valid rows. Formulas stay literal text and are never executed or exported to a spreadsheet.

Limits: 2 MiB input, 100 rows, 64 KiB per row, nesting depth 16, 8 MiB planning context and 4 MiB planned output. The HTTP upload envelope is separately bounded to allow JSON escaping. Each source retains at most 200 batches; each review retains at most 20 preview versions. Forbidden fields reject the row without retaining their values. Rejected rows store bounded identity/issue metadata only. The submission use case authorizes before source reads/parsing/persistence; database RPCs independently validate the permitted field names, identities, URL scope, positions and bounds.

An absent field or empty CSV cell retains approved curation. Explicit JSON null or literal CSV `null` clears it; clearing required metadata remains a blocking issue until the reviewer supplies valid metadata. Partial salary/condition/practice objects preserve omitted curated members. No salary/currency, duration, skill, level or track is invented. New optional values remain unknown. Explicit numeric/work-mode/duration units normalize without currency conversion or assumed work hours.

Explicit canonical IDs and reviewed bilingual aliases resolve against a pinned dictionary. Ambiguous/unmapped terms remain visible in the permitted source fields and issues, without creating concepts automatically. Cross-source suggestions are candidate IDs rather than automatic merges. Missing feed rows never imply closure; an explicit closure needs the source's closure capability. Unknown closed IDs cannot create fake catalog entries.

The actual `catalog.import` handler loads a sealed source/dictionary/current-target context, runs pure review planning and commits source observations/previews plus terminal task success atomically. Its queue message contains only the task ID. Rechecking authority at the end of publication makes mid-commit lease loss roll back every generated review row. A forged source ID, target version or candidate reference is rejected. Unrelated later processing cannot replace the immutable input/context or original preview.

The latest observed source row is ordered by batch creation sequence, including when workers finish out of order. An older source row cannot overwrite or be published after a newer observed row; it may be rejected with an audit record. For a current row whose target curation/dictionary/policy changed, an explicit rebase appends a preview version and preserves prior previews. Rebase retains the original permitted source patch and applies it to current curation; it does not silently overwrite unsaved operator edits.

Publishing calls the existing job/course producer validation, immutable version creation and review/publication transitions in one database transaction. Each decision links the review, preview version, batch, source record, reviewer and resulting resource/version. A changed URL is reviewed explicitly. Course edits retain prior versions and saved plans. Source closure preserves application snapshots and notes; it only changes the relevant catalog availability. Unchanged records can be explicitly confirmed without inventing a metadata change. A rejection remains available even when source authority has become stale.

## Replaceable implementation boundaries

The consuming ingestion module owns source/input/context/output schemas, submission/administration/review/execution/authorization/digest ports and pure parsing/planning. Core code has no Next, database/provider SDK or environment reads. Request-scoped composition chooses the Supabase and hashing adapters. HTTP/routes handle bounded transport and origin checks. The worker uses the same validated pure planner behind a lease-aware execution port.

Producer-owned read/link contracts expose current job/course drafts and reviewed link changes. Source/external binding, live policy, target versions and publication audit remain database transaction boundaries; controllers do not reach directly into another domain's tables. Immutable `ingestion_review_versions` preserve the original and rebased previews. `ingestion_publications` links each processed review to its actual result/reviewer; `ingestion_decisions` retains reference-only idempotent receipts. Upgrade/replacement tests must preserve these contracts, not just schema compatibility.

## Approved-feed core and retry authority

`StaticFeedRegistry` accepts deployment-owned definitions: ID, kind, format, exact initial HTTPS URL and exact redirect-host allowlist. Definitions are immutable and have a SHA-256 configuration revision. The eventual API selects an ID; it must not accept arbitrary worker URLs, proxy options, headers, TLS overrides or paths. No live registry or automatic retrieval is configured yet.

`SafeFeedReader` uses [Node HTTPS request options](https://nodejs.org/api/https.html) with an explicit pinned socket lookup. It checks HTTPS/host membership, credentials/ports/fragments, redirects/loops, each-hop DNS and all resolved addresses. Private/reserved or mixed answers fail closed. It sends no service cookies/keys; it retains the original TLS host/certificate check and never checks one address then re-resolves a different one. Media/identity encoding/UTF-8/header/body/deadline/cancellation bounds exclude arbitrary HTML/login scraping or compressed archives.

At most three short attempts are made; a valid longer `Retry-After` is returned as structured metadata. A delay beyond one day requires a manual pause, not a shortened one-day retry. Service-only `task_fail_after` releases the task lease and persists supported waits in both `tasks.next_run_at` and actual pgmq visibility. Stale/expired leases cannot reschedule work, and visibility does not shorten existing backoff. The integrated remote execution/scheduler must consume this authority before being described as live.

## Remaining module 10 delivery gates

- Connect approved registry IDs/revisions to feed-capable source settings, the actual worker and sealed-once remote input. Never refetch changed bytes under a previously sealed attempt.
- Add idempotent source-specific due scheduling, bounded provider waits/manual pauses, freshness uncertainty and explicit closure handling. Network failure must preserve prior metadata and never infer closure.
- Verify the complete upload and remote/scheduled browser/worker paths, malformed/stale/revoked/redirect/private-network/rate-limit cases and every publication's origin before opening the completed module PR.

## Verification

The processing core has nineteen tests covering JSON/CSV/permission erasure/bounds/partial patches/normalization/dictionary ambiguity/duplicates/provider paths/closure and approved-feed DNS/redirect/media/body/retry/cancellation decisions. A worker test covers persisted-delay handoff. Three actual database/queue cases cover backoff visibility and lease/service authority. Seventeen new real-stack cases cover configured administrator APIs, actual Node job/course/CSV processing, ID-only dispatch, source revoke/reactivate, source/target/lease guards, immutable inputs/previews, reviewed publication/provenance/idempotence, current-policy rebase, different-source duplicates, course closure and superseded source rows; real mobile/desktop browsers additionally register sources, upload files, retain editorial edits on conflicts, rebuild previews, publish job/course corrections, reload decisions, save source settings and deny anonymous/member controls. Actual screenshots: [mobile](assets/ingestion-mobile.png), [desktop](assets/ingestion-desktop.png). The worker Docker image builds and resolves the new handler imports; missing configuration fails closed.

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/ingestion-batches.integration.test.ts
npm run identity:test
```

Authored fixtures are removed after tests. No live offering, copying permission, hosted worker, network sandbox, model quality or human editorial review is established by those fixtures. Keep [configuration status](CONFIGURATION.md) and the [complete implementation audit](IMPLEMENTATION_AUDIT.md) as the authoritative remaining goal/release checklist.
