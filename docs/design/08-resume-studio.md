# 08 — Resume studio

## Responsibility

Help users express real experience in relation to a target role. Preserve source facts, reviewable changes and version history. Planned capabilities are upload/parse, evidence-based proposals and PDF export.

## Current implementation status

Configured deployments implement private file/paste sources, bounded isolated PDF/DOCX parsing, owner-reviewed immutable facts and unreviewed claim histories, source-grounded order proposals, individual acceptance and verified bilingual fixed-version PDF exports. Actual pgmq/Node handlers enforce owner/input/lease guards; a service-only Storage janitor reclaims abandoned writes and deleted sources. [Setup, exact API, configuration and verification](../RESUME_SETUP.md).

The public/static mode retains its local plain-text editor/checklist/export without automatic import. The deterministic order recipe is not model-assisted rewriting or an ATS score. [Optional AI wording suggestions](../RESUME_SETUP.md#optional-ai-wording-suggestions) run through module 11: each suggestion rewrites one confirmed fact without new facts or numbers, and only becomes a fact when the owner applies it to a draft and confirms a new version. Live provider evaluation, hosted containment/recovery and human review remain release gates.

## Data and contracts

`resume_documents` owns a private file reference. `resume_versions` stores immutable structured sections and confirmed fact references. `revision_proposals` contains per-section before/after text, reason and supporting fact IDs, plus optional wording suggestions (`wording`, state/code and the identity reservation). `resume_exports` links an accepted version to an expiring private download. Service operations `parse`, `revise` and `export` return tasks.

## Flow

1. Validate owner, file type and size before issuing a short-lived upload URL.
2. Store the original in a private bucket and enqueue isolated parsing.
3. Extract text with PDF.js or Mammoth; reject empty/scanned content with a paste-text fallback.
4. Convert to a schema-validated draft, preserving the source span where possible.
5. Ask the owner to confirm extracted facts and linked skills; publish only unreviewed, source-bound resume claims, never verified ability.
6. Produce job-specific change proposals using confirmed facts only.
7. Accept or reject changes individually; acceptance creates a new version.
8. Render a controlled template to PDF and return an owner-bound, expiring application download permit.

No unmeasured metrics, invented credentials or completed-project claims may be added. Current projects remain labeled in progress. A learning goal is not a skill claim. Export refers to a fixed accepted version, so later edits cannot silently alter an existing export.

## Failure and privacy

Parse with resource limits and reject unsupported or oversized files. Sanitize extracted markup; never execute document scripts. If a proposal references absent fact IDs, reject it. A worker crash retains the source version and allows retry. Deleting the document invalidates queued analyses and removes derivatives under the deletion workflow.

## Acceptance tests

Test text PDF/DOCX, scanned/empty/oversized documents, malformed content, stale proposals, partial acceptance, fact preservation and private export access. Check that exported content exactly matches the accepted version and that failures never overwrite the source.
