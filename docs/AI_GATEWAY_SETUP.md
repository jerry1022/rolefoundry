# AI Gateway core

Module 11 now has an executable, provider-neutral core in `src/modules/gateway`. It implements the [design](design/11-ai-gateway.md) execution flow: domain authority checks, minimized and delimited input, deployment routing policy, bounded retries with at most one approved transient fallback, strict structured-output validation, one bounded repair, reference/fact checks and a publication guard. Every call is recorded as an attempt with provider, configured and reported model, latency, usage and fallback reason.

**Status:** the core, adapters, a fixed bilingual evaluation set, [identity-backed admission with reviewed recipients and durable attempt records](#identity-backed-authority-and-records), and provider-wide concurrency and token budgets are implemented and tested with fake adapters and the real local database. The matching and resume workers use it for opt-in tie ordering and wording suggestions, with consent and allowance reserved through identity. No provider is selected and no credentials are configured, so with the default empty policy every request falls back to the deterministic recipes. Live provider evaluation and the remaining [audit gates](IMPLEMENTATION_AUDIT.md) are still required before enabling a route.

## Components

| File | Responsibility |
| --- | --- |
| `model.ts` | Closed purposes (`matching.semantic-rank`, `resume.wording`), strict request schema, result states, attempts and `ProviderFailure` kinds |
| `policy.ts` | Deployment routing policy per purpose: primary/fallback target, recipients, deadline, attempts, input/output limits and concurrency |
| `prompt.ts` | Contact-detail minimization and JSON data envelope with security rules |
| `service.ts` | `AIGateway.execute` orchestration, per-adapter concurrency gate and validation |
| `recipes.ts` | Versioned templates and output specs, including the fact-preservation check |
| `embeddings.ts` | Embedding-space identity and mixed-space/dimension rejection |
| `evaluation.ts` | Eight synthetic English/Traditional Chinese wording cases and a content-free score report |
| `adapters/openai-compatible.ts` | OpenAI-shaped Chat Completions/Embeddings transport with bearer or `LUNAROUTE-API-KEY` header dialects |
| `adapters/fake.ts`, `adapters/registry.ts` | Scripted offline adapter; environment-based adapter construction |

Domain modules implement the `GatewayAuthority` port: `admit` verifies the owner, task lease, quota reservation and purpose consent for **every recipient on the route** before any request is sent; `stillCurrent` rechecks owner, input version and lease immediately before publication.

## Execution and failure semantics

1. Reject malformed requests, unknown or mismatched template versions and purposes without a route (`RF_GATEWAY_DISABLED`, the default).
2. Start one deadline that covers admission, every attempt, backoff, fallback, repair and publication.
3. `admit` with the sorted recipient set. A disabled fallback's recipients are excluded; an enabled one's (including any reviewed upstream) are included.
4. Remove email addresses, URLs and 9–15-digit phone numbers. Years, ranges and amounts are kept. Oversized input is rejected, never silently truncated.
5. Send the template plus security rules as the system message and all external text as a JSON `data` array, so quotes, fences or fake role markers cannot close the envelope.
6. Retry `timeout`, `throttled` and `unavailable` up to `primaryAttempts`, honouring `Retry-After` unless it would pass the deadline. Then, only if the fallback is enabled, make exactly one fallback call. Quota, credential, permission, unsupported-model and request rejections are never retried or failed over.
7. Parse strict JSON and validate the Zod schema. Invalid JSON or schema gets one repair call on the same provider that sends issue paths and codes only, never output text. Invalid output never switches providers.
8. Reject any reference outside `allowedRefs`, and any recipe `verify` failure, as `invalid-reference` with no repair or fallback. Wording suggestions must rewrite exactly one cited fact and may contain only numbers present in that fact (NFKC-normalized, so full-width digits match). Rankings must cite job refs and supporting evidence refs, and positive scores need evidence.
9. `stillCurrent` false returns `stale`. Cancellation returns `cancelled`. In both cases no output is returned.

Result codes: `RF_INVALID_INPUT`, `RF_TEMPLATE_MISMATCH`, `RF_GATEWAY_DISABLED`, `RF_GATEWAY_INPUT_TOO_LARGE`, authority codes such as `RF_CONSENT_REQUIRED`, `RF_GATEWAY_INVALID_OUTPUT`, `RF_GATEWAY_INVALID_REFERENCE`, `RF_PROVIDER_{QUOTA,CONFIGURATION,UNSUPPORTED,REJECTED,TIMEOUT,UNAVAILABLE}`, `RF_STALE` and `RF_CANCELLED`. Adapter errors never carry provider text.

Known limit: fact checks compare against the owner-confirmed fact text. If a confirmed fact itself contains an instruction-like sentence with a number, that number counts as present. Confirmation review, not the gateway, is responsible for what a fact says.

## Configure

All settings are server/worker-only. No browser variable is introduced.

| Environment | Meaning |
| --- | --- |
| `ROLEFOUNDRY_AI_POLICY` | Routing policy JSON, at most 32 KiB; empty disables every purpose |
| `OPENAI_API_KEY`, optional `ROLEFOUNDRY_OPENAI_BASE_URL` | Enables adapter `openai` (default `https://api.openai.com/v1`) |
| `LUNAROUTE_API_KEY`, `ROLEFOUNDRY_LUNAROUTE_BASE_URL` | Enables adapter `lunaroute`; the base URL has no default and must be confirmed against the provider's API reference |

Example policy (fallback disabled until its route and data use are reviewed):

```json
{
  "routes": {
    "resume.wording": {
      "primary": { "adapter": "openai", "model": "<reviewed model id>", "recipients": ["openai"] },
      "fallback": { "adapter": "lunaroute", "model": "<reviewed route>", "recipients": ["lunaroute", "<upstream>"], "enabled": false },
      "deadlineMs": 30000,
      "primaryAttempts": 2,
      "maxInputChars": 24000,
      "maxOutputTokens": 1200,
      "concurrency": 2
    }
  }
}
```

**Provider-wide concurrency:** add `"providerLimits": { "openai": { "concurrency": 4 } }` to cap simultaneous calls to a provider across every worker instance and purpose. Migration `20261114240000_gateway_provider_slots.sql` stores leased slots (`gateway_slot_acquire`/`gateway_slot_release`, service role only). A call waits with backoff for a free slot within the route's shared deadline, so a full provider yields `RF_PROVIDER_TIMEOUT` rather than an unbounded queue. Leases last the route deadline plus five seconds, so a crashed worker's slot frees itself, and release requires the exact token, so a late worker cannot free a reassigned slot. The per-process `concurrency` on each route still applies. The gateway refuses to start with limits but no shared slot store.

**Provider token budgets:** add `dailyTokens` to a provider limit (for example `{ "openai": { "concurrency": 4, "dailyTokens": 2000000 } }`) to cap a rolling 24-hour token total across all workers. Migration `20261114250000_gateway_provider_budgets.sql` reserves an estimate (input characters / 4 + `maxOutputTokens`) before each call and settles once with provider-reported usage. A failed call keeps its estimate, because the provider may have charged for it. An exhausted budget is a `quota` failure (`RF_PROVIDER_QUOTA`): no provider call, no retry and no failover. Rows older than two days are pruned during reservation. Currency cost is not modeled; tokens are the shared unit.

The policy rejects unknown fields and purposes, a fallback on the same adapter, recipients that omit their own provider, and out-of-range limits. The gateway refuses to start if a route names an adapter without credentials. Provider base URLs must be HTTPS without credentials, query or fragment, and requests use `redirect: "error"`.

## Evaluate

```bash
npm run gateway:eval                       # offline deterministic baseline, no network
ROLEFOUNDRY_AI_EVAL_CONFIRM=synthetic-only ROLEFOUNDRY_AI_POLICY='…' OPENAI_API_KEY=… npm run gateway:eval -- --live
```

The report contains counts, per-case state/code, zh-TW script match, p50/max latency and token usage. It never prints suggestions or input. Live mode sends only the fixed synthetic set and requires the confirmation variable. Compare candidate providers on the same set before choosing one, and add reviewed rubric/skill-extraction cases before enabling other purposes. Passing the offline baseline does not evaluate any provider.

## Verify

```bash
npm run typecheck
npm test -- tests/unit/gateway.test.ts
npm run architecture:check
```

Twenty-four unit cases cover: the disabled default; minimization and the envelope; prompt injection with fabricated citations; one successful and one failed repair; absent fact IDs and invented numbers; quota, credential, permission, request and unsupported errors without retry or failover; transient retry plus exactly one fallback; disabled-fallback consent scope; consent denial before any call; stale and deleted owners; hung-provider deadlines; cancellation; Retry-After bounded by the deadline; request, template and size rejection; per-adapter concurrency; ranking references; strict policy parsing; minimization that keeps facts; embedding-space isolation; adapter header dialects, strict schema requests and error normalization; unsafe configuration; malformed embeddings; and the bilingual evaluation against faithful and fabricating adapters.

## Identity-backed authority and records

Migration `20261114190000_gateway_authority.sql` connects the gateway to module 01 consent and weekly quotas:

- `SupabaseGatewayAuthority` (service role) calls `gateway_admit`. It admits only an identity task that is **started** (budget consumed through `identity_start_task`) for the asserted owner, the mapped consent feature (`resume.wording` → `resume`, `matching.semantic-rank` → `matching`; unmapped purposes return `RF_NOT_CONFIGURED`) and the exact input version, while the owner is active and consent unrevoked. Every route recipient must be approved for the owner's consent **version** (`RF_RECIPIENT_NOT_APPROVED`). `gateway_current` repeats the owner/version/status/consent checks before publication, so a revocation during a provider call returns `stale`.
- `ai_recipient_approvals` is reviewed per consent purpose and version and is empty by default. Administrators manage it at `GET/POST/DELETE /api/v1/identity/admin/ai-recipients` or the **AI recipients** section of `/admin/`; each change needs a reason and writes `identity_audit`. A new consent version starts with no recipients. Approval alone sends nothing: the routing policy, provider credentials and owner consent are still required.
- `SupabaseGatewayRecorder` stores one content-free `gateway_results` row and ordered `gateway_attempts` per identity task (state, code, versions, provider/model, latency, tokens, fallback reason). Replays of the same result are idempotent and a different replay conflicts. Rows cascade with the identity task and its owner. No prompt, input or output text is stored.
- The telemetry snapshot adds a `gateway` section, built by wrapping the previous snapshot function rather than copying it. The exporter emits `rolefoundry_ai_{calls,failures,fallbacks,input_tokens,output_tokens}_24h{provider}`, with providers limited to approved recipients.

All gateway tables have RLS enabled and no client grants. Member and administrator sessions cannot call the service RPCs.

Five integration cases run against the real local stack: administrator-only, audited approval with raw-table denial; admission for the exact started task, owner, version and approved recipients (including unapproved upstreams and queued tasks); a consent revocation during the call that blocks publication; idempotent content-free recording with attempt order, telemetry usage and cascade; and recipient revocation blocking later admission.

## Remaining gates

- Provider selection from live evaluation with authorized credentials, plus reviewed retention/data-use terms for every recipient before approval.
- [Semantic matching](MATCHING_SETUP.md#optional-semantic-ordering) (tie-only ordering) and [resume wording suggestions](RESUME_SETUP.md#optional-ai-wording-suggestions) (owner-applied, fact-preserving) are integrated through one shared `runOptionalAnalysis` lifecycle.
- Provider cost in currency (tokens are recorded) and an embedding index with isolated reindexing.
