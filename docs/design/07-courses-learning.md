# 07 — Course catalog and learning plans

## Responsibility

Translate important job gaps into manageable learning and practice. DeepLearning.AI is the initial curated provider. RoleFoundry is independent and does not imply a partnership, official endorsement or course completion integration.

## Current scaffold

Six official links have authored summaries, skill outcomes, prerequisites and practice prompts. `recommendCourses` filters to requested gaps, prioritizes fewer missing prerequisites, then greater gap coverage. Users choose a target role and manually mark completion. Completion does not create skill evidence.

## Target data and API

`courses`, `course_versions`, `course_skill_links`, `course_prerequisites`, `learning_plans`, `learning_steps`, `learning_progress` and `practice_submissions`. Store official title/URL, provider, language, difficulty, format, official duration if known, availability and last review. Prices and access conditions are provider-controlled, time-sensitive metadata; unknown values are not described as free.

`GET /courses` serves published metadata. `plan(actor, jobId, weeklyHours)` returns a task. Progress operations are owner-scoped and explicitly user-reported. A course may address multiple gaps without duplicating the same learning step.

## Planning flow

1. Read a versioned target job and gap snapshot.
2. Retrieve reviewed, available resources linked to important gaps.
3. Check prerequisites; order missing foundations before dependent content.
4. Respect the user's weekly time budget. Where official duration is unavailable, label the estimate as editorial and request adjustment.
5. Choose one main resource per stage and attach a concrete practice outcome.
6. Produce an initial two-week plan with completion criteria.
7. Ask for practice evidence or a new assessment before updating capability observations.

For sparse coverage, say that no suitable resource is available. Non-engineering domain skills may not be covered by this provider. Later providers can use the same catalog contract.

## Failures and content boundaries

Do not fabricate course IDs, titles or URLs. Validate model references against retrieved catalog IDs. Course links are allowlisted and stored as references; do not mirror lessons or fetch private progress. Temporarily unavailable links become uncertain, not automatically deleted. Preserve historical plan references after a course retires.

## Acceptance tests

Verify prerequisite order, no matching resource, completed-course deduplication, limited time budgets, unavailable resources, outdated metadata and source-ID validation. Ensure a course-complete event never promotes ability without separate evidence.
