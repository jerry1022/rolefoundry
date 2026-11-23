# Persistent career journey acceptance

The cross-module journey verifies that the implemented deterministic career workflow works for one real local account across domain boundaries. It complements individual module suites; it does not complete AI Gateway, hosted deployment or human content-review acceptance.

## Run

Use Node 24 and the existing project-specific local Supabase stack:

```bash
npm ci
npm run identity:start
npx supabase migration up
npm run identity:test -- tests/identity/career-journey.integration.test.ts
```

The integration command builds the actual production Next server and starts it on its owned test port. Do not run another Next build, type generation or static export concurrently. No new secret, provider access or manual catalog population is needed. The local fixture helper creates verified synthetic accounts through real GoTrue OTP verification and removes only its owned records after the suite.

## Verified flow

| Stage | Executed behavior and assertions |
| --- | --- |
| Identity and private profile | A real verified owner session updates persistent preferences and adds an unreviewed private portfolio reference. |
| Published role | An administrator creates a synthetic source policy and job, then explicitly reviews and publishes it. Anonymous reads retrieve the published record; the owner can bookmark it. |
| Assessment | An administrator authors and reviews fixed-choice question/rubric versions. The owner submits a sealed attempt; the production grading handler publishes scenario evidence. Matching cites the same evidence IDs returned by that completed attempt. Test-only administrator access supplies known answers; owner responses do not expose bank answers before grading. |
| Matching | The production matching handler builds a source-bound private report for that job. Scenario observations and the unreviewed portfolio reference retain distinct provenance; missing retrieval evidence remains a gap. |
| Reviewed learning | A reviewed synthetic course under the configured `deeplearning-ai` provider is selected for the retrieval gap, with a Python prerequisite and the exact permitted source URL. Reporting course completion changes neither the profile revision nor capability evidence. |
| Confirmed resume | Pasted text is parsed by the actual processor. Parsing alone creates no evidence. Explicit owner confirmation creates an immutable version and an unreviewed resume claim. Existing matching/learning snapshots become stale after that profile change. |
| Fixed PDF | The actual PDF processor writes a private export of the selected immutable version. The owner downloads it with an authorized permit; the test reparses the returned bytes and checks the confirmed text. |
| Manual tracking | Tracking begins at `Saved`. The owner selects the exact confirmed version, writes an independent note, explicitly reports `Applied` and creates a UTC follow-up. Exporting and bookmarking cannot imply submission. |
| Fresh mobile browser | A new Chromium context reads the same session and persisted assessment, matching, learning, resume and tracker records through real pages. A tracker reload retains its stage and note; the inspected 390 × 844 page has no horizontal overflow. No browser API response is stubbed. |
| Isolation and privacy changes | Every captured private reference rejects a different account and an anonymous request. Deleting the original evidence immediately removes dependent matching/learning content. Deleting the resume denies its version/download and unlinks the tracker's resume while preserving the independently authored stage, note and follow-up. |

## Task and fixture boundaries

Each accepted asynchronous request commits a real task-ID-only pgmq message. The test executes only explicitly owned task IDs through the shared fixture executor and the existing production assessment/matching/learning/resume handlers, Supabase adapters and isolated document processor. It checks terminal success and queue archival. Task acquisition is a controlled owned-fixture lease rather than a new independent polling process, so this suite cannot claim independent worker acquisition, presence, shutdown, concurrent delivery or provider dispatch coverage. Those behaviors retain their separate module tests and remaining gates.

Synthetic jobs, questions and course metadata are created through the existing administrator APIs and publication transitions. In particular, the `deeplearning.ai` URL is an authored test reference: the suite makes no external provider request and establishes no live course offering, availability or metadata rights. Correct-answer comparisons verify narrow fixed-choice behavior, not professional mastery or expert assessment calibration.

Fixtures track their accounts, public sources/jobs/courses/question versions and task IDs. Cleanup removes their private Storage objects and queue records, cascades their own accounts, then removes their public publications after private references are gone. It does not reset the database, drain unrelated queued work or delete other worker registrations. Running the suite against a configured hosted database is rejected by the existing local-only fixture boundary.

## Evidence and remaining gates

The three cross-module cases live in `tests/identity/career-journey.integration.test.ts`; setup and scoped cleanup live in `tests/support/career-journey.ts`. The mobile screenshot is generated under ignored `.local/career-journey-tracking-mobile.png`. It is a running-app capture, not a mockup.

See [current verification](VERIFICATION.md) for results and CI evidence. This local persistent journey establishes the deterministic integration path. Semantic/model matching, model-assisted wording, AI provider consent/budgets/concurrency, successful live-provider retrieval, hosted operation, representative recovery and human usefulness/calibration review remain explicit gates in the [complete design audit](IMPLEMENTATION_AUDIT.md).
