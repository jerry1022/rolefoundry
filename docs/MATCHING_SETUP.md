# Private matching and gap reports

Module 06 compares published job requirements with the owner's versioned evidence using the deterministic `rules-v1` recipe. It produces private, cited reports through the same independent task worker as assessments. It uses no model/provider, requires no provider consent and consumes no AI analysis allowance. Coverage is a count of linked evidence, not a competency level or hiring probability.

## Run locally

Follow [identity setup](IDENTITY_SETUP.md), [catalog setup](CATALOG_SETUP.md) and [private profile setup](PROFILE_SETUP.md), then:

```bash
npx supabase migration up
npm run identity:dev
# In another terminal:
npm run worker:local
```

Sign in at `http://127.0.0.1:3200/account/`. Add evidence at `/skills/`, review published roles at `/jobs/` and open `/matches/`. The catalog starts empty and migrations publish no job fixtures. An empty direction returns a completed empty report with a clear message.

Choose all published roles in your profile's direction or one explicit target role, including a role in another direction. The job-details **Compare with my evidence** link opens that target. Workplace preferences come from the profile. Optional relevant years are self-reported; education/work-authorization confirmations apply only to the exact target job version and its listed text. Unanswered or absent information stays unknown. Seniority fit remains explicitly unknown; the system does not infer it from skill overlap or years. The application does not infer these qualifications from skill overlap or decide employment eligibility.

Create a fresh report, wait for the worker, inspect the cited requirements and evidence, and reload the saved report URL later. Report history is private. Failed or stale computations require a fresh report with current inputs; prior history remains separate. UI retries of an uncertain submission reuse the same key and payload. Polling stops after a bounded window and offers a status check. Returning focus to a report rechecks its server state. Delayed reads cannot undo a known invalidation, terminal result or stale-input warning.

The public/static `/matches/` page remains a clearly labelled fictional local-overlap demo. It does not send browser-local evidence to the server.

## API

All paths are under `/api/v1`. Mutations require a same-origin request and verified session; ownership is never a client input. Normal session clients cannot read raw matching tables or execute worker functions.

| Method/path | Input | Result |
| --- | --- | --- |
| POST `/matches` | `{jobId: uuid or null, constraints}` and `Idempotency-Key` header | `202 {data: {runId, taskId, status}}` |
| GET `/matches?cursor=...` | Optional opaque history cursor | `{data, nextCursor}`, 20 owner reports, newest first |
| GET `/matches/{id}?cursor=...` | Owner run ID; optional result cursor | `{data: report}` with 20 ranked results and `nextCursor` |
| GET `/tasks/{id}` | Owner task ID | Safe execution state/error/result reference |

Constraints:

```json
{
  "experienceYears": null,
  "confirmations": [
    {
      "jobVersionId": "11111111-1111-4111-8111-111111111111",
      "field": "education",
      "answer": "unknown"
    }
  ]
}
```

`field` is `education` or `workAuthorization`; `answer` is `confirmed`, `conflict` or `unknown`. Confirmations must refer to selected, currently published versions with actual condition text. UUID spelling is normalized; duplicate version/field confirmations are rejected. `jobId: null` selects the owner's direction; a target selects exactly that published job.

Repeating an idempotency key with the same request returns the original run/task even if inputs subsequently change. Different request content under that key returns `409`. Fresh reports use new keys. The initial recipe rejects analyses over 200 candidate jobs, 500 eligible evidence records or a 1 MiB input snapshot with `409 RF_MATCH_LIMIT`; it never silently truncates a direction-wide analysis. Select a target or reduce evidence if a bound is reached. Responses/published reports are bounded separately; no partial report is exposed as complete.

Reports include source profile/catalog/dictionary versions, saved constraints, candidate count, task status, stale flag and result pages. Each result has the immutable job version, original requirement text/ordinal/priority, canonical skills, evidence version/source/context citations, condition checks, mandatory/preferred covered/total counts, gaps, limitations and an action suggestion. `freshness: "uncertain"` retains the source warning when a network failure cannot prove closure. `available: false` marks a historical role that must not be treated as a current recommendation. Deleted evidence invalidates the run and removes its report data/constraints snapshot.

## Rules and evidence interpretation

The consuming module owns narrow input models and the pure `rankMatches` function. Its order is: fewer explicit conflicts, more confirmed conditions, mandatory skill coverage, preferred coverage, stable job IDs. There is no semantic/model score in this recipe. The required semantic ranking integration remains pending with module 11. Adding it or optional narrative requires a separately versioned recipe and reviewed evaluation; narrative cannot override structured facts.

Each canonical skill counts once. A skill appearing in mandatory requirements is not counted again as preferred. A self-report above the learning-only level and an unreviewed portfolio/resume claim may supply explicitly labelled support; none becomes verified mastery. Trusted assessment observations retain their question/rubric version. A correct scenario is scoped support; an incorrect one becomes a practice gap and does not count as positive support. A later positive claim does not erase an earlier practice observation. Learning-only claims do not cover a requirement. An unmapped textual requirement remains an information gap.

Experience below a stated minimum produces a longer-term-experience gap. Other explicit conflicts receive a condition-conflict suggestion. Missing supporting evidence suggests strengthening evidence, never inability. Even an explore suggestion retains unknown conditions and source limitations. No protected/sensitive attribute is used as a ranking feature. Education and authorization checks are explicit owner responses to actual source text, not inferred personal attributes.

## Persistence, replacement and recovery

Migration `20261114060000_matching.sql` creates immutable `match_runs`, ranked `match_results`, normalized `gap_items`, reference links and audit records. Refresh snapshots the exact current profile revision, current evidence versions, catalog/dictionary revisions and published job versions, then creates the run, general task and task-ID-only pgmq message in one transaction. No provider reservation ledger is used.

`MatchingService` authorizes through an injected port. UI components use `MatchingClient`, `CatalogClient`, `ProfileClient` and `SkillClient`; the entry component selects browser adapters. `MatchingHandler` loads a sealed input through `MatchingExecutionStore`, calls the pure rules and publishes through the store. Supabase details stay in adapters/composition roots; replacing transport or storage must preserve these contracts and rerun the authorization/recovery suite. The worker registry now includes `matches.refresh` and `assessment.grade`.

SQL projections form an explicit transaction boundary with catalog/profile/assessment producers. They use canonical skill joins, minimal private source fields and structured assessment observations. They do not parse feedback prose into a positive/negative result. Session clients cannot supply snapshots, generated results or evidence IDs as trusted inputs. Publication validates job/requirement identities and cited evidence fields against the sealed snapshot, checks active ownership and input freshness, and requires a valid lease at commit.

Lock order is shared catalog → shared dictionary → owner → task → run. Catalog/dictionary writes and owner profile changes cannot race the sealed-input checks. Expiry or a changed profile/catalog/dictionary rejects publication; source closure and wall-clock expiry also reject it. Complete results, gaps and task success commit atomically; a lease expiring during publication rolls all derived rows back. A delivery after a committed result is archived without duplicate reports. The worker's existing retry, heartbeat, timeout and shutdown controls apply; see [worker setup](ASSESSMENT_SETUP.md).

Ordinary edits retain historical reports and mark them stale on read. A deleted evidence version cascades its matching-owned FK link; the link's deletion trigger cancels pending work, erases the copied input, deletes results/gaps and retains only invalidated metadata. This happens in the evidence-deletion transaction, without waiting for an outbox consumer. Late workers cannot restore deleted report content. Hard account deletion cascades matching records; deactivation prevents further publication. A user's previously downloaded copy cannot be recalled, so the UI rechecks the report on status refresh/focus and the server reauthorizes every read.

## Verification and release gates

The unit suite covers deterministic rules, explicit conflict/unknown distinctions, mandatory/preferred deduplication, source citations, negative observations, empty/unrelated evidence, stable ordering, strict confirmations, authorization before persistence and injected cancellation.

The real local integration suite uses actual Auth/PostgREST/PostgreSQL, a production Next server, Node worker and Chromium. It covers concurrent idempotency, ID-only messages, owner isolation/raw-table restrictions, forged references/requirements, complete publication, empty directions/cross-direction targets, profile/catalog/dictionary changes, immediate evidence-deletion purge, source closure/time expiry, stale leases, crash-after-commit redelivery, mid-publication lease expiry rollback, owner deactivation/deletion, result/history pagination and mobile create/poll/reload/stale/delete behavior.

Passing these checks does not establish expert relevance review, load capacity, semantic/model quality, hosted recovery or pilot outcomes. Before release, a human reviewer must inspect representative jobs/evidence and confirm every reported strength/gap and the usefulness of ordering. Keep those gates in the [full audit](IMPLEMENTATION_AUDIT.md); no fixture is presented as a real opening or a certified capability.
