# Configuration status and handoff

This guide distinguishes settings applied by the project from account-bound hosted setup. It is updated with each module. Current implemented module coverage is 01–10; the [complete audit](IMPLEMENTATION_AUDIT.md) retains remaining implementation, provider, operations and release gates.

## Configured and verified locally

| Setting | Where it lives | How to verify |
| --- | --- | --- |
| Node 24, locked npm dependencies | `package.json`, lockfile, CI and container definitions | `node --version`, `npm ci`, `npm run typecheck` |
| Local Auth/PostgreSQL/OTP delivery | `supabase/config.toml`, migrations, `scripts/local-identity.mjs` | `npm run identity:start`; run the real integration suite |
| Auth admission hook, roles and owner RPC/RLS | Identity migration and setup | Invite a local test account; verify OTP and cross-user rejection |
| Private source Storage and 5 MiB limit | Storage configuration and migration 08 | Local Storage container healthy; published resume tests include actual PDF/DOCX and denied raw access |
| Private resume bucket/policies | `rolefoundry-resumes`, created by migration 08 | Bucket stays private; member SDK/public-object downloads fail |
| Local web identity/catalog settings | `scripts/dev-identity.mjs`, ignored `.local/identity-env.json` | `npm run identity:dev`; browse jobs and private workspace at port 3200 |
| Durable queue and registered handlers | pgmq migrations, `apps/worker/src/main.ts` | `npm run worker:local`; complete assessment/matching/learning/resume and catalog review-planning tasks |
| Authorized import workflow | Migrations `20261114101000_ingestion_batches.sql`, `20261114102000_ingestion_reviews.sql` and `20261114103000_ingestion_feeds.sql` | Real upload/feed/scheduler/worker/review/publication APIs and administrator browser journeys pass; capabilities default disabled and the deployment feed registry defaults empty |
| Durable provider retry delay | Migration `20261114100000_ingestion_retry_authority.sql` | Real queue tests verify stored delay/visibility and lease rejection; integrated feed handling also rechecks persisted waits before network access |
| Private application tracking | Migration 09, existing identity/catalog settings | Track/reload a manual cycle, select an owner version and verify UTC follow-up/conflict/deletion behavior |
| Private object cleanup | Resume registry and service-only janitor | Delete a synthetic source; verify download denial and drained cleanup rows |
| Processor/font runtime | `Dockerfile.worker`, isolated processor and pinned font assets | Build the image; run `scripts/check-resume-worker-image.mjs` |
| Live account deletion and recovery | Existing identity/worker settings; apply the deletion migration | No new key/account; [private receipts, operator recovery, ledger export and retention boundaries](ACCOUNT_DELETION_SETUP.md) |
| Private account exports | Existing identity and worker settings, private bucket created by migration | No new secret/account; [setup, format, expiry and hosted transport checks](ACCOUNT_DATA_SETUP.md) |
| Administrator task/worker diagnostics | Private `/admin/`, existing administrator session and worker configuration | Apply the operations migration; [setup, read authorization and heartbeat/retention behavior](OPERATIONS_SETUP.md); no additional account/key required |
| Local isolated database recovery | `npm run recovery:local` and `--verify-failure-cleanup` | Same-snapshot data/security/queue comparison, isolated send/archive and owned-resource cleanup; [scope and remaining gates](OPERATIONS_RECOVERY.md) |
| Private operations telemetry | Optional web observation, service-only aggregate RPCs and independent Node exporter | [Setup, private token, local scrape/alert/recovery rehearsal and hosted gates](TELEMETRY_SETUP.md) |
| Course link observations | Optional `Dockerfile.course-links` process, `ROLEFOUNDRY_COURSE_LINK_SOURCES` (default `[]`) | [Setup, request safety, shared cadence and alerts](COURSE_LINKS_SETUP.md); empty policy sends no request |
| Automated repository checks | GitHub Actions | PR checks cover types, unit/process/browser/database tests and worker image |

Local test keys are generated and stored only in the ignored, owner-readable local environment file. They are not hosted credentials. Tests start their own web/worker processes and stop them when finished; a passing suite does not mean a private web server or production worker was left running. The local database/Auth/Storage services remain available for development.

## Start the configured local workspace

Docker must be running. These commands use the project-specific stack and preserve its database volumes:

```bash
npm ci
npm run identity:start
npx supabase migration up
npm run identity:invite -- developer@example.test
npm run identity:dev
```

Open `http://127.0.0.1:3200/account/`; view the OTP in local Mailpit at port 54324. In another terminal run:

```bash
npm run worker:local
```

The helper enables the published catalog/dictionary and private career modules. Catalogs start empty until authorized records are reviewed/published. Existing browser-local demo data is not uploaded automatically. Use the source/bank guides linked below for controlled fixture/content setup; do not describe sample records as real openings or verified provider courses.

For visual PDF QA, this development environment also has Poppler installed. `pdfinfo` checks generated files and `pdftoppm` renders them for inspection. Poppler is a verification tool, not a web/worker runtime dependency.

## Hosted settings still require the intended accounts

The repository provides deployable web/worker code and migrations. A Vercel preview with no private environment remains the public demo; it is not a hosted private database or a long-running worker. Do not copy loopback URLs or local service keys into a hosted environment.

| Setting | Action / location | Verification |
| --- | --- | --- |
| Intended Supabase project and schema | Apply reviewed migrations to the selected project; follow [identity setup](IDENTITY_SETUP.md) | Check hook/schema/bucket presence using synthetic accounts |
| Hosted OTP/SMTP and redirects | Configure Auth using the intended mail provider and exact application origin in the identity guide | Deliver a real test OTP, reject an uninvited account and verify sign-out/revocation |
| Web server secrets and build flags | Hosting environment settings: existing Supabase URL/anon/service-role values, `ROLEFOUNDRY_APP_ORIGIN`, identity/catalog flags | Rebuild after flag changes; anonymous jobs remain readable and private endpoints require the owner |
| Persistent worker host | Deploy `Dockerfile.worker` outside Vercel Functions; store the matching project's server credentials in its secret manager | Tasks finish without an open web request; monitor retries, queue age and cleanup |
| Private source Storage | Migration 08 creates a private PDF/DOCX bucket and restrictive policies; project-wide limit must allow at least 5 MiB | Cross-user/public downloads fail; fixed owner download, expiry and deletion pass |
| Authorized catalogs and expert content | Record source permissions, reviewed metadata and question/rubric review in the implemented admin UIs | Audit provenance and inspect representative results; fixtures do not satisfy real-content review |
| Backups, alerts and restore deletion replay | Live erasure, ledger export and local isolated overlay/service erasure are implemented; hosted/off-host recovery remains in progress | Store a protected ledger outside snapshots, then validate reapplication and object restoration before a real-person pilot |
| Model-assisted ranking/wording | Required module 11 integration and evaluation are still pending | Complete the gateway/provider/data-use evaluation before claiming AI features |

No new model key is needed for current fixed-choice scoring, rule-based matching/learning or exact-statement resume ordering. Any later provider setup will be documented with its actual chosen integration and verification, without placing secrets in tracked files or browser variables.

## Planned LunaRoute fallback

LunaRoute is recorded as an alternative provider in the [AI Gateway design](design/11-ai-gateway.md#provider-candidates-and-fallback-policy). This documentation change creates no credential, makes no provider request and enables no fallback. Primary-provider selection remains unresolved.

The planned adapter uses a separate server/worker secret named `LUNAROUTE_API_KEY`, a deployment-approved gateway URL, and reviewed model IDs per purpose. Exact runtime configuration will be added with the adapter; these are planned requirements, not working application settings. Do not place provider keys in browser variables or silently forward another provider's key. Before activation, verify model/schema capabilities, recipient/data-use consent, shared quota/deadline handling and bilingual evaluation. Embedding replacement requires an isolated index/reindex. Official references: [API](https://docs.lunaroute.com/api/), [authentication](https://docs.lunaroute.com/getting-started/authentication/), [models](https://docs.lunaroute.com/api/models/).

## Detailed guides

- [Identity, invitations, Auth hooks, hosted settings and admin bootstrap](IDENTITY_SETUP.md)
- [Private profile/evidence and provenance](PROFILE_SETUP.md)
- [Source-governed jobs and bookmarks](CATALOG_SETUP.md)
- [Dictionary snapshots and reviewed merges](SKILL_DICTIONARY_SETUP.md)
- [Assessment banks and independent worker](ASSESSMENT_SETUP.md)
- [Matching inputs, reports and source deletion](MATCHING_SETUP.md)
- [Reviewed courses and private learning plans](LEARNING_SETUP.md)
- [Resume storage, permits, facts, exports and cleanup](RESUME_SETUP.md)
- [Manual application cycles, history and UTC follow-ups](APPLICATIONS_SETUP.md)
- [Ingestion feeds, schedules, review and deployment configuration](INGESTION_SETUP.md)
- [Live account deletion, receipts and recovery](ACCOUNT_DELETION_SETUP.md)
- [Private account exports and cleanup](ACCOUNT_DATA_SETUP.md)
- [Administrator diagnostics and worker presence](OPERATIONS_SETUP.md)
- [Local database recovery rehearsal and remaining hosted/object recovery gates](OPERATIONS_RECOVERY.md)
- [Web/static/container deployment](DEPLOYMENT.md)

Configuration that can be completed with the available project/account authority is applied and tested as work proceeds. Unavailable account-bound steps remain explicit here with their purpose and verification. Hosted setup is not claimed complete from local tests or an unconfigured preview.

## Approved feed deployment settings

`ROLEFOUNDRY_APPROVED_FEEDS` is server/worker only and defaults to `[]`. Set the identical bounded definition JSON on the web host and independent worker, then restart/redeploy both. It selects exact HTTPS URLs/hosts by ID and revision; administrators can select IDs but cannot supply worker URLs. [The ingestion guide](INGESTION_SETUP.md) gives the template, setup locations and verification steps. `identity:dev` uses Next environment loading; `worker:local` inherits the shell environment, so configuring only `.env.local` is insufficient for that process.

No real feed or schedule has been enabled automatically because no publisher authorization/feed definition has been supplied. Local migrations, queue execution, administrator forms and synthetic fixture verification are applied; source permission, real metadata and a hosted end-to-end run remain operator/editorial gates. The test server's authored `.invalid` definitions are confined to `scripts/test-identity.mjs` and do not configure the demo or deployed worker.

## Administrator task recovery

Apply the task-replay migration and deploy compatible web/worker code using existing identity/worker settings. Feed recovery reuses the exact deployment-approved feed registry; no browser-supplied URL is accepted. No new account/key is needed. See [operator flow, per-kind authority checks and recovery bounds](TASK_REPLAY_SETUP.md). This does not activate an AI provider or apply a hosted migration automatically.

## Consolidated administration

Apply `20261114140000_identity_admin_directory.sql` and use the existing verified administrator bootstrap and identity settings. No new account/key or model call is required. [The setup guide](ADMIN_WORKSPACE_SETUP.md) describes shared editor controls, invitation revocation, future quotas, refunds and the role-loss boundary. Hosted schema changes remain reviewed operator actions.

## Invalidation dispatch

Apply `20261114150000_invalidation_dispatch.sql` and run compatible worker code using existing Supabase worker settings. No new secret, browser flag or model call is introduced. The normal worker performs bounded profile/dictionary maintenance before task acquisition; producer/privacy/version guards remain independently effective during rollout. Review historical event counts before hosted catch-up. See [setup, retry/lease behavior and operator checks](INVALIDATION_SETUP.md).

## Worker resource limits

Apply `20261114160000_worker_resource_budgets.sql`, then use compatible worker code. `WORKER_DOCUMENT_CONCURRENCY` and `WORKER_FETCH_CONCURRENCY` default to 1; `WORKER_GENERAL_CONCURRENCY` defaults to total `WORKER_CONCURRENCY`. Pool values are integers 0–8; total remains integer 1–8, default 2. No new credential or table is required. Local helpers inherit shell settings; independent workers do not automatically read Next env files. See [group membership, pause behavior and verification](WORKER_RESOURCE_SETUP.md). Provider-wide concurrency remains pending.

## Course link observations

Apply `20261114180000_course_link_checks.sql`. Set `ROLEFOUNDRY_COURSE_LINK_SOURCES` only on the independent checker host, using reviewed source IDs and hosts already allowed by both the source and its provider; the default `[]` makes no network request. Reuse the existing Supabase URL/service-role secret. See [request bounds, cadence and administrator recovery](COURSE_LINKS_SETUP.md).
