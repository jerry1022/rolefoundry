# 10 — Ingestion and source governance

## Responsibility

Turn authorized job/course inputs into reviewable catalog records. Preserve provenance, source usage scope and update history. No public-website availability is treated as blanket permission to copy or redistribute content.

## Implemented delivery

The configured server implements authorized JSON/CSV uploads, deployment-approved remote retrieval, source-specific schedules and administrator review/publication. Actual workers use ID-only tasks, source/owner/lease checks and immutable sealed input. Separate upload/feed capabilities, reviewed duplicate targets, partial record failures, canonical skill mapping, source/dictionary/target conflicts and explicit closure retain their producer/version contracts. Network failures preserve prior versions and mark availability uncertain; provider delays survive queue redelivery and a crash before backoff publication. Long/unknown waits pause retrieval and cannot be cleared by an early resume or a definition/interval change.

[Ingestion setup](../INGESTION_SETUP.md) documents the API/browser flow, empty default registry, configuration, boundaries and verification scope. Successful feed responses/DNS in local integration are injected; database/PGMQ/worker engine/Next/browser behavior is real, and the actual Node adapter's network-failure path is exercised. Real source permission/metadata, matching hosted web/worker definitions and an owned successful deployment run remain explicit release gates. The public demo remains authored fixtures and original provider links.

## Target data and contracts

`sources` contains kind, publisher, authorization basis, permitted fields, refresh policy and active status. `import_batches` contains source, input origin, batch ID, immutable input, state and counts. `ingestion_feed_settings` binds a deployment definition/revision, schedule owner, due time and provider wait/pause. `ingestion_feed_runs` binds each exact retrieval task to its sealed batch. `source_records` stores external IDs and permitted snapshots; `review_items` stores normalization/mapping issues. `import(actor, { sourceId, kind, batchId })` is admin-only and enqueues a task.

## Pipeline

1. Validate the source is enabled and its use permits the intended operation.
2. Validate a size-limited JSON/CSV schema or fetch through an approved adapter.
3. Normalize URLs, locations, work modes and salary units without inventing missing values.
4. Deduplicate by source/external ID; propose cross-source matches for review.
5. Map explicit skills through the dictionary; retain unmapped text.
6. Produce a diff rather than overwriting curated fields blindly.
7. Review new/changed records, then publish accepted versions.
8. Check freshness and explicit closure on the source-specific schedule.

Repeated batch IDs return the existing result. Per-record errors do not discard a whole valid batch; report accepted, rejected and pending-review counts. A missing field and a removed field must be distinguishable when applying updates.

## Failure and security

Rate limits trigger bounded backoff. Network failures retain the last known valid version and mark freshness uncertain. Fetch adapters allowlist hosts, block private-network addresses and cap redirects/body size. Never fetch arbitrary administrator-provided URLs through a privileged worker. Course changes do not rewrite completed historical learning plans.

## Acceptance tests

Exercise duplicate batches, cross-source duplicates, partial failures, malformed CSV, undisclosed salary, stale records, revoked source rights, redirects, private-network URLs and explicit closure. Audit every publication back to its batch and reviewer.
