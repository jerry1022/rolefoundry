# 05 — Assessment

## Responsibility

Offer lightweight, role-sensitive scenarios and record the reasoning behind feedback. The initial product assesses foundational judgment, not professional certification or candidate eligibility.

## Current scaffold

Twelve authored multiple-choice questions cover four tracks. Each three-question preview uses fixed answers and explanations. Submit is disabled until all answers are present. The browser contains answers because this is an open-book demo, not a secure examination. Results create scenario evidence without changing self-reported skills.

## Target records and interfaces

Use immutable `question_versions` and `rubric_versions`, plus `assessment_attempts`, `attempt_items`, `responses` and `assessment_results`. Each attempt snapshots its items and applicable rubric. `start(actor, track)` returns public question fields only. `submit(actor, attemptId, answers)` seals the response version and returns a grading task. Duplicate submit keys return the same task.

## Production grading

1. Select reviewed questions for the track; avoid recently repeated questions when possible.
2. Autosave owner-scoped draft responses.
3. Validate completion and accepted answer ranges.
4. Grade fixed answers deterministically.
5. For future short answers, use a reviewed rubric with evidence citations and human calibration; keep the model and rubric version.
6. Publish per-skill observations, limitations and next steps.

A scored level describes the observed scenario only. It is not interchangeable with years of experience or independent work ability. Unsupported model judgments are withheld and routed for review. Retakes create new attempts rather than overwriting history.

## Failure behavior

Reject stale attempt submissions, extra item IDs and invalid answers. Preserve sealed responses when grading times out so the user can retry without re-answering. Never show a partially generated result as final. Production correct-answer fields remain server-only until completion. Account deletion prevents grading results from being republished.

## Acceptance tests

Cover each track, full/partial/invalid submissions, duplicate submission, question version changes, retries, evidence provenance, answer confidentiality and deleted owners. Calibrate short-answer agreement with reviewed examples before enabling it publicly.
