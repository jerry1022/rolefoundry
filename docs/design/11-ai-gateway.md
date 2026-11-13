# 11 — AI Gateway

## Responsibility

Provide one controlled interface for model and embedding providers. Domain modules own business decisions; the gateway owns request policy, validation, provider errors, usage and traceability. It is not an autonomous agent.

## Current scaffold

`AIProvider.analyze<T>` is a TypeScript port with a Zod output schema. No SDK, API key lookup, provider request or hidden fallback is connected. All visible analyses are deterministic and labeled accordingly.

## Request and result design

Each production request includes task ID, purpose, owner scope, input version, template version, minimized text and output schema. Each result records validated structured output, provider/model identifier, latency, usage and result state. Store sensitive raw input only in the authorized domain record, not generic telemetry.

Provider selection requires a reviewed set of Traditional Chinese and English examples. Measure factual preservation, skill extraction, rubric agreement, latency and cost before locking a model. Embeddings carry a model/version/dimension identifier; changing it requires a separate reindex, not mixed vectors in one index.

## Execution flow

1. Verify task authorization, quota reservation and purpose-specific consent.
2. Build input only from the versions named by the task.
3. Minimize unnecessary contact details and delimit external text as data.
4. Apply token, time and concurrency limits.
5. Call the selected adapter.
6. Parse and validate the structured output.
7. Validate referenced facts/course IDs against the allowed input set.
8. Publish only if owner/input state is still valid.

The gateway cannot execute tools, send applications or grant permissions. Model output never controls SQL, authorization or arbitrary file paths. Missing facts result in an explicit unknown value or review item.

## Failure semantics

Retry transient throttling/timeouts with a bounded policy; do not retry invalid credentials as if they were transient. Allow one bounded schema-repair attempt, preserving the original failure record. If repair fails, expose a useful task error without publishing partial output. A retry may incur additional provider cost; deduplicate result publication, not presumed external execution.

## Acceptance tests

Use fake adapters for malformed JSON, absent fact IDs, invented course IDs, quota errors, prompt-injection content, timeouts and deleted owners. Run explicit live-provider evaluation separately after credentials and data use are authorized. No live provider is required to run scaffold tests.
