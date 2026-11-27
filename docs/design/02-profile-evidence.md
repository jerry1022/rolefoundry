# 02 — Profile and evidence

## Responsibility

Store career direction, preferences and capability evidence without collapsing claims into verified mastery. Evidence connects a canonical skill to a source, context and timestamp. A job recommendation must be explainable from the evidence snapshot used to produce it.

## Implementation status

Configured server deployments implement owner preferences and revision conflicts, private self-reports/portfolio references, immutable evidence history, a service-only source writer and a transactional invalidation outbox. The `/skills/` UI uses an injected client port; domain use cases use repository/authorization ports. See [setup and API](../PROFILE_SETUP.md) and [dependency rules](../MODULE_DEVELOPMENT.md).

A minimal stable `skills` registry is seeded for foreign keys; the full module 04 dictionary remains planned. Resume confirmation, scored assessment production, derived report stores/embeddings and event dispatch belong to their later modules. No fake production integration is implied. Evidence deletion removes local versions/children and records removed version references; future consumers must enforce the documented stale/deletion contract before serving derived data.

## Static/demo compatibility

The skill profile edits a name, one career track and self-reported skills. Scenario results are recorded separately in versioned localStorage. Zod rejects incompatible stored shapes. No raw resume file or remote portfolio content is fetched.

All workspace form controls are disabled in server-rendered HTML until client hydration and local state restoration finish. This prevents early input from racing with saved values. Persistence starts only after restoration, including the unavailable-storage fallback.

## Data and contracts

Production records: `career_preferences`, `skill_claims`, `evidence`, `evidence_skill_links` and `portfolio_references`. Evidence fields include owner, source type, skill, observed result, source version, reviewer state and date. Source types are resume claim, self-report, scenario response and portfolio reference. A portfolio URL alone is not a reviewed artifact.

`ProfileService.update(actor, input)` writes a complete preference draft against `expectedRevision`; `create/edit/remove` manage browser-writable evidence with optimistic versions. `InternalEvidenceWriter.record(ownerId, input)` accepts source-authorized immutable evidence from trusted producers. Public APIs expose only the actor's profile and evidence. An internal assessment operation, rather than the browser, creates scored scenario evidence.

## Flow and invariants

1. Collect target track, workplace preferences and learning time.
2. Accept self-reported skills as claims.
3. Extract resume suggestions into a draft and ask the owner to confirm them.
4. Link completed scenarios to their immutable question/rubric version.
5. Save a new evidence version instead of overwriting the historical basis of a report.
6. Mark downstream recommendations stale after relevant profile changes.

Course completion never creates verified evidence. A wrong scenario answer means the scenario is worth revisiting; it does not erase prior experience. Missing evidence means unknown, not incapable. Role-specific context and evidence age are visible in production reports.

## Failure and privacy

Reject unknown skill IDs and ownership mismatches. Sanitize labels and render all text as text. Accept portfolio links only as references in the first release; fetching them later requires an SSRF-safe retrieval service. Delete all owned evidence versions/children on source deletion and emit removed version IDs transactionally. Later derived-report/embedding modules must register these dependencies, reject deleted inputs at read/publication and purge their records when handling deletion events. Do not publish private profiles by default.

## Acceptance tests

Round-trip preferences, concurrent edits and version conflicts; confirm that course completion does not change ability; verify evidence source labels and cross-user isolation; invalidate reports after material updates; handle absent, malformed or unavailable browser storage in the scaffold.
