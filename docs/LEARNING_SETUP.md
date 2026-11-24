# Reviewed courses and private learning plans

Module 07 implements an anonymous course catalog, administrator source/review workflow and private two-week plans. DeepLearning.AI is the initial registered provider. The deterministic `learning-rules-v1` planner consumes `rules-v1` gaps through a replaceable adapter. It uses no external model, provider consent or AI allowance. RoleFoundry is independent of course providers.

## Run locally

Follow [identity setup](IDENTITY_SETUP.md), [catalog setup](CATALOG_SETUP.md) and [profile setup](PROFILE_SETUP.md), then:

```bash
npx supabase migration up
npm run identity:dev
# In another terminal:
npm run worker:local
```

Sign in at `/account/`. Administrators can create a course source policy, author metadata, request review and publish at `/learning/`. Each source requires a documented authorization basis, a public rights summary, an explicit host subset and permission for all twelve stored metadata fields. A policy entry records an operator decision; it does not itself grant third-party rights. Migrations register the provider but publish no courses. Real metadata and the planned 30–50 reviewed resources remain content-release gates.

Members choose a published target role and weekly hours. Links from job details and matching reports select the target. The worker creates the plan; its saved URL and history support reload. Progress is explicitly self-reported. Saving an HTTPS practice reference stores an independently authored private URL/summary; it does not fetch that page or create verified skill evidence. Step completion, whole-course completion and capability evidence are distinct records.

The same catalog flags as jobs enable public course reads: `ROLEFOUNDRY_CATALOG_ENABLED=true` at build/runtime, with the public Supabase URL/key. Next configuration derives the corresponding `NEXT_PUBLIC_CATALOG_ENABLED` browser flag during the build. Public reads use an anonymous database adapter and need no service key or identity backend. Private UI requires `ROLEFOUNDRY_IDENTITY_ENABLED=true` during the build (which derives `NEXT_PUBLIC_IDENTITY_ENABLED`) and the configured identity backend at runtime. A public-only deployment displays a read-only catalog. With catalog disabled, `/learning/` retains the clearly labelled six-link browser-local demo. Static exports contain no API routes.

## Planning behavior

The plan seals one published target job, exact profile/evidence versions, dictionary and catalog revisions, relevant reviewed course versions, prior course progress, weekly hours and optional owner duration estimates. It derives gaps directly; a previous assessment or matching run is not required.

- Mandatory gaps precede preferred gaps. One course can address several gaps without duplicate assignments.
- Course prerequisites and prerequisite skills are separate. Missing foundations come before dependent content; cycles are rejected during publication and guarded again by the planner. Already completed courses are not assigned again, but completion never verifies a prerequisite skill or capability.
- Weekly capacity is `floor(weeklyHours * 60)` minutes, for two weeks. Zero schedules no steps. Study and practice both consume capacity. Partial resources show their remaining minutes and cannot be mistaken for an entire course completion.
- Duration precedence is an owner's plan-specific estimate, then reviewed official duration, then a visibly labelled editorial estimate. Unknown durations are withheld until estimated. Catalog facts are not overwritten by owner estimates.
- Sparse coverage, completed resources without supporting evidence, unknown durations, blocked prerequisites and insufficient time produce explicit issues. Conditions such as experience are not presented as course-solvable gaps.
- Only available resources are planned. A review older than 90 days or a network-failure report means uncertain, not closed. Explicit retirement or source revocation prevents new recommendations while historical references/progress remain private and readable with availability warnings.

Candidates are courses linked to target skills, their transitive course/skill foundations and explicitly estimated resources. The snapshot rejects more than 200 relevant candidates, 500 evidence items or 2 MiB with `409 RF_LEARNING_LIMIT`; it never silently truncates the catalog. Plans contain at most 40 steps with a visible limit issue; practice references are limited to 100 per plan. History and public catalog pages contain 20 records with opaque cursors. A changed catalog/dictionary invalidates a public cursor and requires reload.

## API

Paths are under `/api/v1`. Public list responses are `{data, nextCursor, revision, dictionaryVersion}`; private history is `{data, nextCursor}`. Single resources use `{data: value}`. Mutations require same-origin requests and a verified session. Ownership is derived from that session. Standard errors are safe application envelopes; `409` requires reloading the changed resource.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/courses` | Optional `skill`, `difficulty`, `cursor` | Anonymous reviewed metadata; excludes drafts, retired/revoked sources and private permission documents |
| GET `/courses/{id}` | Course UUID | Current published metadata |
| POST `/learning-plans` | `{jobId, weeklyHours, durationOverrides}` plus `Idempotency-Key` | `202 {data: {planId, taskId, status}}` |
| GET `/learning-plans` | Optional history `cursor` | Owner history, newest first |
| GET `/learning-plans/{id}` | Owner plan UUID | Task state, stale flag, output, steps, private references and progress revision |
| PATCH `/learning-plans/{id}/steps/{stepId}` | `{expectedRevision, completed}` | Updated plan; no ability promotion |
| POST `/learning-plans/{id}/steps/{stepId}/practice` | `{expectedRevision, url, summary}` | `201`, updated plan with private reference |
| DELETE `/learning-plans/{id}/practice/{submissionId}` | `{expectedRevision}` | Updated plan; also allowed after derived-content invalidation |
| GET `/learning-progress` | None | Owner aggregate `{revision, data}` |
| PATCH `/learning-progress/courses/{courseId}` | `{expectedRevision, completed}` | Updated whole-course progress aggregate |
| GET `/admin/courses` | None | Role-verified provider/source/current-draft bank |
| POST `/admin/courses/sources` | Source policy | Created source ID |
| POST `/admin/courses/sources/{id}/status` | `{status: "active" or "revoked", reason}` | Audited source transition |
| POST `/admin/courses` | Course draft | Created immutable version and revision |
| PATCH `/admin/courses/{id}` | `{course, expectedRevision}` | New immutable draft; prior published version remains visible |
| POST `/admin/courses/{id}/translations` | `{versionId, locale: "zh-TW", summary, practicePrompt, completionCriteria, reviewNote}` | Reviewed translation of the published version |
| POST `/admin/courses/{id}/translations/remove` | `{versionId, locale, reason}` | Audited removal |
| POST `/admin/courses/{id}/transition` | `{expectedRevision, action, reason}` | Audited review/publication/retirement/revalidation |
| GET `/admin/courses/link-checks` | Optional `cursor`, `hostCursor` | Bounded [course link observations](COURSE_LINKS_SETUP.md) and host waits |
| POST `/admin/courses/link-checks/resume` | `{host, expectedRevision, reason}` | Audited manual-pause clearance; never shortens a provider wait |
| GET `/tasks/{id}` | Owner task UUID | Safe execution status/error/result reference |

`weeklyHours` is 0–80. `durationOverrides` is required (use `[]`) and contains unique `{courseId, minutes}` entries, at most 100, with integer minutes 1–50,000. Same key and request return the original plan even after inputs change; a conflicting request under that key returns `409`. A fresh plan needs a new key. The UI retries uncertain submissions with the original key, polls for a bounded window and offers manual status checks. Delayed responses cannot undo known invalidation or newer progress/reference edits.

A source policy has `providerId, name, publisher, authorizationBasis, rightsSummary, allowedHosts, permittedFields, isDemo`. The twelve required fields are `title, url, provider, summary, skills, prerequisites, duration, practice, language, difficulty, format, availability`.

A draft has `key, providerId, sourceId, title, url, summary, skills, prerequisiteSkills, prerequisiteCourseIds, language, difficulty, format, officialMinutes, editorialMinutes, durationNote, practice`. Practice has `prompt, completionCriteria, minutes`. Use canonical dictionary IDs and course UUIDs. Difficulty is `Beginner`, `Intermediate`, `Advanced` or `Unknown`; missing duration/language are null. Revision PATCH wraps this draft in `{course, expectedRevision}`. Transition actions are `review`, `publish`, `retire`, `confirmed_active`, `network_failure`; explicit reasons are mandatory. Review precedes publication. The role-verified UI exposes these forms without asking users to compose API payloads.

### Reviewed course translations

The **Course translations** section of `/admin/` stores reviewed Traditional Chinese text for RoleFoundry's editorial fields (migration `20261114330000`): the summary, the practice prompt and the completion criteria. Official course titles, provider names and URLs stay in the provider's language because they name the linked page.

- A translation belongs to the **published** course version (`course_version_translations`). Saving with any other `versionId` returns 409. Publishing a new version hides it until someone reviews the new version, while a pending draft leaves the published translation in place.
- Saves need a review note, which becomes the `course_audit` reason (`course.translated`). Removal needs its own reason (`course.translation_removed`).
- Public course JSON carries `translations["zh-TW"]`. `localizedCourseText` in `src/modules/learning/model.ts` uses it for zh-TW viewers, with `lang="zh-Hant"` and a note that it is a reviewed translation.

Learning-plan steps keep the text snapshotted when the plan was built, and plan JSON adds the reviewed translation of the **exact** course version each step was planned from (migration `20261114360000`). A later course version's translation never rewrites an earlier plan. zh-TW viewers see the translated practice prompt, and the translated completion criteria for full-resource steps. Partial steps keep the planner's own wording. The planner's stored sentences (issues, notes, generated practice text) render through UI messages (`src/components/learning/planner-text.ts`), and `tests/unit/planner-text.test.ts` fails if the planner gains a sentence without a translation.

## Source policy and replacement boundaries

Provider records own exact allowed hosts, allowed path prefixes and URL identity rules. The initial provider permits bare/www DeepLearning.AI hosts under `/courses/` and `/short-courses/`; policies select an explicit subset of those hosts. HTTPS URLs cannot contain credentials or custom ports. Query strings, fragments and trailing slashes do not create duplicate courses. A provider can use `path` identity to unify host aliases or `origin-path` to keep hosts distinct. A reviewed migration registers additional providers; the planning core and UI contracts do not change. Tests register a second provider with a different path and identity rule.

Metadata is versioned rather than overwritten. Publishing a revised draft changes the current pointer; saved plans retain their original version. Dictionary merges update canonical join projections, preserving original source metadata. The editor resolves redirects when authoring a new version. Raw lesson content, syllabus mirrors, login scraping and provider private-progress requests are outside this module.

The consuming learning module owns `CourseCatalog`, `LearningRepository`, `LearningAdministration`, `LearningExecutionStore` and `LearningGapAnalyzer`. `LearningService` authorizes before persistence. UI forms receive client ports; only entry/composition files select concrete adapters. `LearningHandler` loads a validated sealed snapshot, awaits a cancelable injected gap analyzer, calls the pure planner, validates output and publishes through the store. The default analyzer adapts the public matching rules. SDK, HTTP and Next dependencies stay outside the core. A new semantic recipe requires versioned schema/validation and evaluation work with module 11, not a silent replacement of historical recipes.

## Persistence, deletion and recovery

Migration `20261114070000_courses_learning.sql` owns provider/source associations, catalog state, immutable course versions/links/prerequisites, URL identity registry/audit, learning plans/evidence references/steps, course progress/revisions and independently authored practice submissions. Session roles cannot read raw private tables or execute worker functions. Owner RPCs reauthorize every read/write; administrator RPCs verify the stored role.

Lock order is catalog → dictionary → course catalog → owner → task → plan. Private operations take shared catalog/dictionary/course locks; course administration takes exclusive catalog/course locks and a shared dictionary lock. Source/dictionary updates therefore cannot race publication guards. Starting a plan atomically seals inputs and writes a general task plus a task-ID-only pgmq message. The worker rechecks ownership, source availability/expiry, input revisions and lease validity on load and publication. Output references, prerequisites, duration bases, week budgets and totals are checked against the sealed input. Steps, output and terminal task success commit together; expiry during publication rolls everything back. Redelivery after commit archives without duplicating results. Existing task retry, heartbeat, cancellation and shutdown rules apply; see [worker setup](ASSESSMENT_SETUP.md).

Ordinary source/profile/progress edits mark historical plans stale. Deleting a referenced evidence version synchronously cancels pending work, erases copied inputs/output and removes generated steps in the same evidence-deletion transaction. The plan retains an invalidated tombstone. Independently authored practice references remain owner-controlled, with their deleted step link set to null, and can be individually removed; they contain no generated evidence copy. Hard account deletion cascades all owner records. Deactivation/deletion blocks late publication. No pending module 12 outbox consumer is needed to enforce this immediate privacy boundary.

## Verification and release gates

Local verification adds ten unit tests and eighteen real-stack integration tests: pure prerequisite/budget/sparse-coverage rules, duration precedence, source validation, authorization-before-persistence, injected async gap replacement/cancellation, and delayed-read guards; anonymous published-only reads, alternate-provider configuration, immutable reviewed versions, deduplication/DAG rejection, concurrent idempotency, ID-only messages, actual Node planning, owner isolation, optimistic progress, unchanged capability evidence, profile/course/progress freshness, retirement/review expiry/source revocation, dictionary merge history, forged references, evidence purge with private-reference retention, mid-publication lease rollback, redelivery and deleted/deactivated owners. Chromium tests cover mobile create/poll/reload/progress/practice and administrator source/draft/review/publish/retire workflows.

The test bank is authored synthetic metadata marked as demonstration content, never a verified provider offering. Passing the suite does not validate live course access/prices, source rights, a real 30–50-resource catalog, editorial usefulness, hosted worker operation or recovery under load. Official pages can restrict automated retrieval; a retrieval failure is not closure evidence. Those content, operations and pilot gates remain open in the [complete audit](IMPLEMENTATION_AUDIT.md).

## Demo catalog

The public demo's `/learning/` page (no backend) uses 30 DeepLearning.AI courses from `src/lib/fixtures.ts`. Their titles, levels, formats and canonical URLs were checked against the official catalog on the `reviewedAt` date shown on each card. Skill mappings, summaries and practice exercises are RoleFoundry editorial content pending human review. Gap recommendations show the six best matches (fewest missing prerequisites first), and **All resources** lists the full set. A unit test enforces unique IDs and URLs, canonical `deeplearning.ai/courses|specializations/<slug>/` links and review dates. The configured database catalog is separate: it starts empty and publishes only reviewed source records.
