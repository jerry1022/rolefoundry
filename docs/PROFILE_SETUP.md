# Profile and evidence module

Module 02 adds private career preferences, self-reported claims, portfolio references and immutable evidence history to the identity foundation. It runs in configured server deployments. Static hosting retains the existing browser-local skill profile.

## Run and verify

Follow [Identity setup](IDENTITY_SETUP.md) for Docker, local email OTP and account bootstrap. A fresh local stack applies both migrations. For an existing local stack, apply only pending migrations after reviewing them:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
```

Open `/account/` to sign in, then `/skills/` to edit the private account profile. No sample name or claims are uploaded automatically. Other career pages still use their labeled local demo until their own modules are implemented. An optional import on a new profile previews only the saved demo name, direction and selected skill claims, and requires explicit approval. It excludes resumes, scenario results, applications and bookmarks. Import is unavailable after the first account mutation.

```bash
npx playwright install chromium
npm run typecheck
npm test
npm run architecture:check
npm run identity:test
npm run test:e2e
```

The shared local integration command builds the production standalone server and runs both identity and profile suites against real Auth/PostgREST/PostgreSQL. It includes private mobile-browser editing. No model or external portfolio request runs in these tests. Local fixtures and screenshots stay under ignored `.local`.

For hosted deployments, review and apply `20261114020000_profile_evidence.sql` after module 01. The migration creates new tables and a minimal canonical skill registry; check for colliding table/function names before applying it to an existing unrelated database. Use the same server configuration as module 01; there is no new public or privileged browser key. Migrations are not applied automatically by Next builds or CI to a hosted database.

## API

| Method/path | Input and response |
| --- | --- |
| GET `/api/v1/profile` | `{data: {name, track, workplaces, weeklyHours, revision, updatedAt}}`; starts blank at revision 0 |
| PATCH `/api/v1/profile` | Full preference fields plus `expectedRevision`; returns updated profile |
| POST `/api/v1/profile/import` | `{expectedRevision: 0, preferences, skills}`; only a new profile; returns profile |
| GET `/api/v1/evidence` | Optional canonical `skill`, `limit` (1–50), opaque `cursor`; `{data, nextCursor, revision}` |
| POST `/api/v1/evidence` | `{expectedRevision, evidence}`; returns `{data: {evidence, revision}}` |
| GET `/api/v1/evidence/{id}` | Owner-only history, newest first: `{data: [evidenceVersion, ...]}` |
| PATCH `/api/v1/evidence/{id}` | `{expectedRevision, expectedVersion, evidence}`; appends a version |
| DELETE `/api/v1/evidence/{id}` | `{expectedRevision, expectedVersion}`; removes all versions and returns revision |

Preferences use the four stable assessment tracks, zero to eighty weekly learning hours, and an explicit subset of Remote/Hybrid/On-site. Empty workplace preferences mean unspecified. Name/context are plain text, never HTML. The initial nine canonical IDs remain available; the [versioned dictionary](SKILL_DICTIONARY_SETUP.md) now provides runtime concepts, bilingual labels and editorial administration.

Browser-writable evidence has common fields `label`, `context`, `observedAt` (UTC timestamp, not future-dated), and one or more canonical `skills`. Source-specific fields:

- `self-report`: `claimedLevel` from 0–3; always unreviewed.
- `portfolio-reference`: an HTTPS `url` without embedded credentials; always unreviewed. The server never fetches it.

Every returned evidence version includes IDs, version, source, observation/creation timestamps, skills, source/rubric versions, review state, optional outcome, self-reported level and portfolio URL. Additional metadata retains the source dictionary version, historical skill labels and current canonical skill IDs. Clients cannot submit owner IDs, review state, scored outcomes or trusted source references through the public API. Type changes are rejected. Portfolio references are not reviewed artifacts; scenario results describe a narrow observation rather than overall mastery.

Private endpoints verify an active session and derive ownership from it. Mutations require the configured same origin and JSON, reject unknown fields and limit bodies to 8 KiB. Unauthorized access is 401; inactive/forbidden operations 403; other/missing evidence IDs 404; stale edits 409. Cursors bind the filter, aggregate revision and dictionary version: restart pagination after a material edit. There is a 500-evidence public creation cap per account. The initial history API returns all owner versions; retention/pagination can be added compatibly before a high-volume rollout.

## Integration ports

`ProfileService` depends on `ProfileRepository` and `ProfileAuthorization`; its domain tests run with replacement ports. `SupabaseProfileRepository` implements the persistence contract using session-scoped RPCs. The browser uses `ProfileClient` with a fetch adapter; form/card components do not know the database provider.

`InternalEvidenceWriter.record(ownerId, input)` is a trusted server boundary for modules 05 and 08. The caller must validate source ownership and the immutable source version first. The Supabase writer validates the input and invokes a service-only RPC; it is never exposed as a browser endpoint. A scenario requires a rubric version and records `scored`; a confirmed resume source remains an unreviewed claim. Repeating the same owner/source reference/version with identical input reuses the record, while changed input conflicts. The producer must not call this before source confirmation or successful grading.

`career_preferences.revision` is the aggregate invalidation token. Every mutation and `profile_change_outbox` event commit atomically; the owner lock serializes edits with identity deactivation. Future consumers retain profile/evidence input versions, reject stale publication and process source-deletion references before serving dependent data. See the [module development contract](MODULE_DEVELOPMENT.md).

## Storage and limits

The migration creates `career_preferences`, `evidence`, `evidence_versions`, `evidence_skill_links`, `skill_claims`, `portfolio_references`, `profile_change_outbox` and the minimal `skills` registry. Private tables have RLS; members cannot write directly or forge roles/provenance. Administrators do not gain access to other members' private evidence. Auth owner deletion cascades private profile/evidence records. A deleted evidence root cascades its versions/claims/links and emits a reference-only invalidation event.

No resume parser, assessment engine, derived report store, embedding index or outbox consumer is added by this module. Their later implementations must satisfy source ownership, version and deletion contracts before being enabled. Account export/deletion orchestration and backup recovery remain module 13 work. Do not describe local testing as a hosted production privacy review.

The [invalidation worker](INVALIDATION_SETUP.md) now consumes profile events through matching/learning/resume contracts and cancels older queued requests with `RF_STALE_INPUT`. Receipts commit with the producer event, retry safely and cascade on owner removal. Synchronous evidence purges, read-time freshness and publication fencing remain authoritative; completed history and running leases are not overwritten.
