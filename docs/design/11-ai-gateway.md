# 11 — AI Gateway

## Responsibility

Provide one controlled interface for model and embedding providers. Domain modules own business decisions; the gateway owns request policy, validation, provider errors, usage and traceability. It is not an autonomous agent.

## Current scaffold

The [gateway core](../AI_GATEWAY_SETUP.md) in `src/modules/gateway` implements this flow with a deployment routing policy, OpenAI-compatible (OpenAI/LunaRoute header dialects) and fake adapters, bounded retry/fallback/repair, reference and fact-preservation checks, embedding-space isolation and a fixed bilingual evaluation set. The default policy disables every purpose and no domain worker calls the gateway yet; all visible analyses remain deterministic and labelled accordingly. The legacy demo `AIProvider.analyze<T>` port is unchanged.

## Request and result design

Each production request includes task ID, purpose, owner scope, input version, template version, minimized text and output schema. Each result records validated structured output, provider/model identifier, latency, usage and result state. Store sensitive raw input only in the authorized domain record, not generic telemetry.

Provider selection requires a reviewed set of Traditional Chinese and English examples. Measure factual preservation, skill extraction, rubric agreement, latency and cost before locking a model. Embeddings carry a model/version/dimension identifier; changing it requires a separate reindex, not mixed vectors in one index.

## Provider candidates and fallback policy

LunaRoute is an explicitly requested fallback candidate. This records a design choice, not an active integration or a decision to replace the primary provider. Primary-provider selection and credentials remain unresolved; no provider request or automatic failover is enabled.

| Role | Candidate | Delivery status |
| --- | --- | --- |
| Primary candidate | Direct OpenAI integration | [OpenAI-compatible adapter](../AI_GATEWAY_SETUP.md) implemented (bearer header); credential/provider decision and live evaluation pending |
| Fallback candidate | LunaRoute through its own gateway adapter | Same adapter with the `LUNAROUTE-API-KEY` dialect implemented; base URL, credentials and capability/quality evaluation pending |
| Current executable behavior | Existing deterministic domain rules | Available as currently labelled; never presented as a successful model response |

According to the [official API reference](https://docs.lunaroute.com/api/), LunaRoute serves OpenAI-shaped Chat Completions and Responses endpoints, plus embeddings and rerank, at `https://gw.lunaroute.com`. Its [authentication guide](https://docs.lunaroute.com/getting-started/authentication/) recommends a dedicated `LUNAROUTE-API-KEY` header. The future adapter should read a separate server/worker-only `LUNAROUTE_API_KEY`; do not repurpose `OPENAI_API_KEY` or forward an upstream key implicitly. Available chat model IDs and capabilities must be checked through the [Models API](https://docs.lunaroute.com/api/models/). An advertised endpoint does not establish support for every model, strict output schema or embedding configuration needed here.

The consuming domains continue to call the same gateway port. Separate provider adapters own authentication, dialect mapping, usage/error normalization and capability checks. A deployment-owned routing policy selects reviewed provider/model combinations per purpose; request bodies cannot choose arbitrary URLs or bypass the policy. Record provider, actual model/route when available, template/input versions and fallback reason on each attempt.

Fallback remains disabled until both the route and intended data use have been reviewed. Once enabled, only a policy-approved transient failure (timeout, throttling or temporary service failure) may trigger one alternative-provider attempt after bounded primary retries. All attempts share the task deadline, quota/cost reservation and concurrency limits. Authentication, authorization, consent, quota rejection and invalid references do not trigger cross-provider retries. Schema repair stays bounded; invalid output cannot be accepted by switching providers or weakening validation.

Before sending minimized resume/evidence content to LunaRoute, verify the configured model route and any additional upstream recipient, retention and data-use terms, and bind the approved recipients to purpose-specific consent. Both adapters must pass the same Traditional Chinese/English factual-preservation, reference-validation and prompt-injection tests. Evaluate structured outputs, refusal behavior, latency, usage/cost reporting, cancellation and retry semantics independently; protocol compatibility alone is insufficient. Never combine embeddings from different provider/model/version/dimension spaces: a replacement needs an isolated index and reindex before activation.

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

Fallback acceptance additionally covers unavailable LunaRoute models/features, exhausted shared deadlines/budgets, recipient consent, no failover for invalid credentials or fabricated references, a single permitted transient failover, cancellation, duplicate publication and embedding-space isolation. Live evaluation requires separately authorized credentials and synthetic or explicitly authorized data.
