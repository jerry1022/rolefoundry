# Configuration status and handoff

This guide distinguishes settings applied by the project from account-bound hosted setup. It is updated with each module. Current coverage is modules 01–08; the [complete audit](IMPLEMENTATION_AUDIT.md) retains remaining implementation, provider, operations and release gates.

## Configured and verified locally

| Setting | Where it lives | How to verify |
| --- | --- | --- |
| Node 24, locked npm dependencies | `package.json`, lockfile, CI and container definitions | `node --version`, `npm ci`, `npm run typecheck` |
| Local Auth/PostgreSQL/OTP delivery | `supabase/config.toml`, migrations, `scripts/local-identity.mjs` | `npm run identity:start`; run the real integration suite |
| Auth admission hook, roles and owner RPC/RLS | Identity migration and setup | Invite a local test account; verify OTP and cross-user rejection |
| Private source Storage and 5 MiB limit | Storage configuration and migration 08 | Local Storage container healthy; published resume tests include actual PDF/DOCX and denied raw access |
| Private resume bucket/policies | `rolefoundry-resumes`, created by migration 08 | Bucket stays private; member SDK/public-object downloads fail |
| Local web identity/catalog settings | `scripts/dev-identity.mjs`, ignored `.local/identity-env.json` | `npm run identity:dev`; browse jobs and private workspace at port 3200 |
| Durable queue and all six implemented handlers | pgmq migrations, `apps/worker/src/main.ts` | `npm run worker:local`; complete assessment/matching/learning/resume tasks |
| Private object cleanup | Resume registry and service-only janitor | Delete a synthetic source; verify download denial and drained cleanup rows |
| Processor/font runtime | `Dockerfile.worker`, isolated processor and pinned font assets | Build the image; run `scripts/check-resume-worker-image.mjs` |
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
| Backups, alerts and full account export/deletion operation | Module 13 runbooks and executable controls remain in progress | Rehearse an isolated restoration and deletion replay before a real-person pilot |
| Model-assisted ranking/wording | Required module 11 integration and evaluation are still pending | Complete the gateway/provider/data-use evaluation before claiming AI features |

No new model key is needed for current fixed-choice scoring, rule-based matching/learning or exact-statement resume ordering. Any later provider setup will be documented with its actual chosen integration and verification, without placing secrets in tracked files or browser variables.

## Detailed guides

- [Identity, invitations, Auth hooks, hosted settings and admin bootstrap](IDENTITY_SETUP.md)
- [Private profile/evidence and provenance](PROFILE_SETUP.md)
- [Source-governed jobs and bookmarks](CATALOG_SETUP.md)
- [Dictionary snapshots and reviewed merges](SKILL_DICTIONARY_SETUP.md)
- [Assessment banks and independent worker](ASSESSMENT_SETUP.md)
- [Matching inputs, reports and source deletion](MATCHING_SETUP.md)
- [Reviewed courses and private learning plans](LEARNING_SETUP.md)
- [Resume storage, permits, facts, exports and cleanup](RESUME_SETUP.md)
- [Web/static/container deployment](DEPLOYMENT.md)

Configuration that can be completed with the available project/account authority is applied and tested as work proceeds. Unavailable account-bound steps remain explicit here with their purpose and verification. Hosted setup is not claimed complete from local tests or an unconfigured preview.
