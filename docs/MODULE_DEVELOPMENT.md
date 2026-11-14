# Incremental module development

Implement the numbered designs in reviewable increments. Each module must have executable behavior, authorization/error handling, appropriate tests, an updated README and an accurate implementation status before its PR is considered ready. A completed contract is not a completed integration. Hosted deployment, source agreements, reviewed content and live-provider evaluation remain explicit release gates.

See the [complete requirement audit](IMPLEMENTATION_AUDIT.md) before claiming the overall goal complete.

## Delivery order and status

| Module | Status on this branch | Next acceptance gate |
| --- | --- | --- |
| 01 Identity/access | Implemented; base PR #1 | Hosted hook/SMTP/secrets and migration review |
| 02 Profile/evidence | Implemented on top of 01 | Review migration/API/UI and local integration results |
| 03 Jobs/search | Published catalog, source governance and private bookmarks implemented | Later dictionary/matching/ingestion/application integrations |
| 04 Skill dictionary | Bilingual snapshots, aliases, DAGs, admin review, historical-safe merges and runtime IDs implemented | Human mapping review and later report/version integration |
| 05 Assessment | Local preview only | Immutable questions/rubrics, private attempts, scoring and evidence integration |
| 06 Matching | Local overlap only | Versioned inputs, conditions/unknowns, stale/deleted evidence handling |
| 07 Courses/learning | Editorial local demo only | Reviewed catalog, two-week plans, prerequisites and owner progress |
| 08 Resume studio | Plain-text local demo only | Private sources, isolated parsing, confirmed facts and immutable exports |
| 09 Tracking | Local board only | Private versioned applications, events and historical source snapshots |
| 10 Ingestion | Planned | Authorized adapters, reviewable batches and publication provenance |
| 11 AI Gateway | Port only | Replaceable adapters, bounded execution, output/reference validation and evaluation |
| 12 Workers | Identity/profile outboxes; worker dry run | Leases, retries, delivery recovery, handler registry and invalidation processing |
| 13 Operations | Identity admin controls only | Reviewed publication, recovery, deletion and telemetry |

Work follows the document sequence, but dependencies are explicit. Modules 05–08 may establish producers and deterministic domain rules before 11/12. They cannot be described as running asynchronous AI features until the gateway/worker integration passes its own checks. Module 02 seeded the initial foreign-key registry; module 04 now adds versioned administration and runtime IDs. Keep each new module's review focused; use a stacked PR base if its predecessor is still open, without silently merging it.

## Dependency rules

Use a modular monolith and ports/adapters. A module is not a separate deployment merely because it has a folder.

```mermaid
flowchart LR
    View[Form and evidence components] --> Client[ProfileClient port]
    Client --> HTTP[HTTP client adapter]
    HTTP --> Route[Thin Next route]
    Route --> Root[Composition root]
    Root --> Service[Profile use cases]
    Service --> Auth[Authorization port]
    Service --> Repo[Repository port]
    Root --> Adapter[Supabase adapter]
    Adapter --> DB[(Owner RPCs and RLS)]
    DB --> Outbox[Reference-only invalidation outbox]
```

- `model.ts`: schemas, value types, safe domain errors and pure rules. No Next, database SDK, fixture or adapter imports.
- `ports.ts`: narrow interfaces owned by the consuming module. Prefer explicit operations to generic database access.
- `service.ts`: use cases and authorization through injected ports. No environment reads, SDK constructors or HTTP requests.
- `adapters/`: transport and persistence details. A database/provider replacement changes the adapter and composition root, while preserving the domain contract and its tests.
- `server.ts`: request-scoped wiring of verified identity, repository and use cases. Never share a user-specific repository between requests.
- `http.ts` and `route.ts`: bounded input parsing, same-origin checks, wire envelopes and safe error responses. Routes delegate to the service.
- UI forms/cards own drafts and presentation. The screen orchestrates an injected `ProfileClient`; only the entry component selects its concrete browser adapter. Components never import privileged clients.
- Cross-module mutations use public service ports or a deliberately granted database transaction boundary. Do not reach into another module's internal tables from presentation code.
- Keep existing demo APIs as compatibility exports where necessary; new production modules must not depend on the demo workspace shape.

`npm run architecture:check` enforces the profile/job/skill core and profile/job UI import boundaries with the TypeScript parser. Extend its coverage when adding modules. It supplements behavior tests; it does not prove runtime security or transactional correctness.

## Dictionary concurrency and historical joins

Dictionary writes lock catalog, then dictionary exclusively. Link inserts use a shared dictionary lock. Merge updates canonical join projections without taking owner locks; immutable source IDs/content remain unchanged. Reports must record both dictionary and profile/input versions. See [dictionary integration](SKILL_DICTIONARY_SETUP.md).

## Version and deletion contracts

All module 02 mutations commit an aggregate revision with their change event under the same owner lock used by identity revocation/deactivation. Evidence edits append immutable versions. A write carries its last-read aggregate revision and, for evidence edits/deletion, the evidence version. Conflicts require a reload, never a silent overwrite.

Future matching/learning/resume reports must store the profile revision and exact evidence version IDs used. Check current inputs at publication and at read time. A changed revision makes a result stale. An `evidence.deleted` event contains the removed version IDs so dependent modules can remove reports/embeddings without retaining deleted content. Those modules must implement their purge/read guard before exposing derived personal data; module 02 cannot delete stores that do not yet exist. The durable event remains available for module 12 dispatch/retry; it is not a running event bus today.

Use additive migrations first. Do not rename canonical IDs or remove historical versions during an adapter upgrade. Run the same behavior/authorization suite against each replacement adapter before switching the composition root. Keep provider credentials and deployment-specific configuration outside the domain and browser.
