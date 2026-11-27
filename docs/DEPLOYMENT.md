# Development and deployment

## Local quick start

Requirements: Node.js 24+, npm and a modern browser. No database or API key is required.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. State is stored under `rolefoundry.workspace.v1` in this browser. Use the Catalog studio reset action to restore the initial sample profile. Do not enter sensitive information into a public demo.

```bash
npm run typecheck
npm test
npm run build
npm start
```

The standard build uses Next.js standalone output. Browser tests start their own local development server:

```bash
npx playwright install chromium
npm run test:e2e
npm run worker:demo
```

`worker:demo` is a dry run only. Configured assessment grading uses `npm run worker:local` locally or `npm run worker:start` with hosted secrets; see [assessment/worker setup](ASSESSMENT_SETUP.md).

Browser tests start their own server on port 3100, avoiding unrelated development services on port 3000. Set `E2E_PORT` to choose another test port. An occupied test port is an error; the suite never silently reuses an unknown server.

For optional invitation-only authentication, local Supabase setup, runtime secrets and hosted configuration, follow [Identity setup](IDENTITY_SETUP.md). See [Profile setup](PROFILE_SETUP.md) for module 02 private preferences/evidence. Module 03 adds the [published catalog and bookmarks](CATALOG_SETUP.md) behind `ROLEFOUNDRY_CATALOG_ENABLED`; public reads need no service key. The [versioned skill dictionary](SKILL_DICTIONARY_SETUP.md) uses the same configuration and adds `/dictionary/`. [Reviewed courses and private learning plans](LEARNING_SETUP.md) use the same catalog/identity configuration and require the independent worker for plan generation. Source metadata must be reviewed and published separately; migrations seed no courses. [Private resume workflows](RESUME_SETUP.md) use the existing identity keys, a private Storage bucket created by migration 08 and the same worker. Local Storage is enabled automatically; hosted bucket/policy/worker checks are documented in that guide. [Private application tracking](APPLICATIONS_SETUP.md) uses persistent owner-scoped services when identity is configured; the static demo retains its local board.

[Administrator task/worker diagnostics](OPERATIONS_SETUP.md) use the same private identity and worker settings after the operations migration. No extra telemetry account/key is required. The separate [local database/queue recovery rehearsal](OPERATIONS_RECOVERY.md) requires the owned Docker/Supabase stack; the optional deletion mode verifies one controlled PDF and actual isolated Auth/REST/Storage cleanup, while general object backup and hosted restore remain pending.

[Private account archives](ACCOUNT_DATA_SETUP.md) add a private bucket and background handler through the account export migration. Use the same worker secrets; validate hosted archive transport/expiry/cleanup separately from the preview build.

[Live account removal](ACCOUNT_DELETION_SETUP.md) uses the same Auth/Storage/worker configuration after its migration. Keep a long-lived worker available for cleanup/retries, verify intended hosted behavior, and protect deletion ledgers outside the database backup before relying on restored-environment erasure.

## Vercel

Import `jerry1022/rolefoundry` into Vercel, select Next.js, keep the repository root as Root Directory, and use the default install/build settings (`npm ci`, `npm run build`). Choose Node.js 24. No environment variables are needed for the demo. Leave `STATIC_EXPORT` and `NEXT_PUBLIC_BASE_PATH` unset. The repository's Deploy button opens this import flow; it does not imply that a deployment already exists.

Vercel Hobby is free within its quotas for personal/non-commercial usage. A commercial career platform must use a suitable plan. Fees for a future database, worker or model provider are separate. See [Hobby](https://vercel.com/docs/plans/hobby) and [function limitations](https://vercel.com/docs/functions/limitations).

The long-lived Node grading/matching/learning/resume worker is hosted separately using `Dockerfile.worker` or Node 24. Do not keep a Vercel request open indefinitely as a queue consumer. An API request should persist a task and return its identifier.

## Static export / GitHub Pages

```bash
NEXT_PUBLIC_BASE_PATH=/rolefoundry npm run build:pages
```

The output is `out/`. All twelve routes are pre-rendered; interactions execute locally after hydration. The base path is needed for project-hosted GitHub Pages, but should be empty for a custom domain/root site. GitHub Actions builds and publishes the export when Pages is configured to use Actions. Static hosting excludes all dynamic handlers and cannot supply authorization or a worker.

## Docker

```bash
docker build -t rolefoundry .
docker run --rm -p 3000:3000 rolefoundry
```

The image runs as a non-root user and serves the standard standalone build. No secrets are built into it. Production provider credentials belong in the hosting secret manager, not Docker build arguments or `NEXT_PUBLIC_*` variables.

## Future production deployment

Deploy web, worker and managed Supabase as separate components. Keep regions close and environment data isolated. Authenticate all private endpoints, apply owner RLS, validate consent, and complete authorization/deletion/recovery tests before real personal data is accepted. Monitor queue age, provider failures and costs. Ship backward-compatible schema changes before code that depends on them.

## Fonts and external resources

The design uses Google Fonts with system fallbacks. If external fonts are blocked, the interface remains usable. A privacy-focused deployment can self-host licensed fonts later. The demo makes no AI, job-feed or course-progress requests; official course links open only when clicked.

[Administrator task recovery](TASK_REPLAY_SETUP.md) requires `20261114130000_admin_task_replay.sql` plus compatible web/worker code. Reuse existing secrets and matching approved feed definitions; deploy through the reviewed procedure. The HTTP request does not start a worker, reset an old task or apply migrations.

The [consolidated administrator workspace](ADMIN_WORKSPACE_SETUP.md) requires the identity directory migration for paged invitation/quota reads and unused-invitation revocation. Existing identity/source/recovery settings remain sufficient; it adds no browser credential or privileged database editor.

[Durable invalidation delivery](INVALIDATION_SETUP.md) requires the additive dispatch migration and compatible worker code. Review catch-up sizing for retained producer events in staging before hosted application. Existing secrets are sufficient. Failure-isolated maintenance leaves ordinary task processing and existing synchronous privacy/version guards in place; verify backlog, stale queued cancellation and safe retry after rollout.

[Per-instance worker resource budgets](WORKER_RESOURCE_SETUP.md) require the additive resource-reader migration before compatible worker rollout. The legacy reader delegates to the same lease/owner/erasure implementation. Restart workers with reviewed per-pool settings and verify safe `worker.resources` startup metadata and queue progress. Limits scale per instance; they do not establish provider-wide admission or host capacity.
