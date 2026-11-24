# 06 — Matching and gap analysis

## Responsibility

Help a job seeker prioritize opportunities and choose the next useful action. Return explanations grounded in requirement text and personal evidence. Do not decide employment eligibility or describe overlap as hiring probability.

## Current scaffold

`matchJob` computes covered and missing canonical skills against self-report. `searchJobs` sorts by overlap with stable ID tie-breaking. Percentages mean required fixture skill coverage only. The UI exposes this limitation explicitly.

## Current private implementation

Configured deployments now expose `/matches/` and private APIs backed by immutable inputs/results, general tasks and a real `matches.refresh` worker handler. Explicit conditions, mandatory/preferred coverage, original requirement text and evidence-version citations remain visible. Profile/catalog/dictionary changes mark old reports stale and block pending publication. Evidence deletion atomically purges copied inputs/results/gaps and prevents late restoration. See [setup, exact API, lock order and verification](../MATCHING_SETUP.md).

The consuming module owns narrow source projections and the pure `rules-v1` engine. It counts canonical skills once, retains provenance, separates unknown conditions from conflicts and never infers education/work authorization. Self-reports and portfolio/resume references stay explicitly unverified. Incorrect scenarios suggest practice and do not count as positive support; learning-only claims do not cover requirements. [Opt-in semantic ordering](../MATCHING_SETUP.md#optional-semantic-ordering) (`semantic-rank-v1`) may only replace the final job-ID tiebreak inside structurally equal results; strengths, gaps and conditions stay rule-based, and reports record which ordering applied. Live provider quality evaluation remains pending. Human relevance review remains a release gate.

## Target data and interface

`match_runs` stores owner, profile/evidence version, catalog version and ranking recipe. `match_results` links jobs to condition checks, supporting evidence and gaps. `gap_items` distinguish missing evidence, short-term learning, longer-term experience and unknown information. `refresh(actor, jobId?)` enqueues a versioned computation.

## Algorithm

1. Retrieve published jobs in the selected direction.
2. Check explicit user constraints, separating matches, conflicts and unknowns.
3. Separate mandatory requirements from preferences.
4. Join canonical skills to evidence, retaining provenance and context.
5. Rank by confirmed conditions, mandatory coverage, preferred coverage and then semantic relevance; use stable IDs for ties.
6. Assign explainable action suggestions: explore now, strengthen evidence, longer-term target or explicit condition conflict.
7. Generate optional narrative explanations from structured results; the narrative cannot change the ranking facts.

Missing education, authorization or seniority information remains unknown. A preferred skill does not become a mandatory blocker. Human-readable reasons include requirement text, evidence references and the rule applied. Production ranking is evaluated on reviewed examples before launch.

## Failure and invalidation

Fall back to rule-only explanations if model output fails. Refuse to publish results based on mismatched input versions. Mark old results stale after relevant changes; do not erase past reports used for tracking. Never use sensitive personal attributes to boost or penalize candidates.

## Acceptance tests

Test hard conflicts versus unknowns, mandatory versus preferred requirements, empty profiles, unrelated jobs, duplicate skills, stale versions and deterministic ordering. Human review must confirm that every reported strength or gap has supporting source data.
