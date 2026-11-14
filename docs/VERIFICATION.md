# Verification

This document records the scope of local verification for the demo and modules 01–03. CI reports the current branch status independently.

| Check | Local result | Scope |
| --- | --- | --- |
| TypeScript | Passed | Generated Next route types and strict type checking |
| Vitest | 35 tests passed | Original career paths, combined filters, bilingual aliases, overlap/gaps, prerequisites, fixed scoring, fixture isolation, state validation, verified actors, UTC weeks, injected profile ports, source validation and stale snapshots |
| Playwright Chromium | 11 journeys passed | All specializations and empty-category guides, all ten routes, hydration-safe editing, bookmarks, evidence, learning, resume content export, tracker, reset, account demo isolation and mobile navigation |
| Next production build | Passed | All ten application routes plus not-found output |
| Static export | Passed | Project base path `/rolefoundry`; dynamic identity/profile handlers excluded |
| Local identity/profile integration | 43 tests passed | Real GoTrue/PostgREST/PostgreSQL and production Next server: invitation OTP, verified sessions, RLS, consent versions/revocation, concurrent independent budgets, idempotency, worker guards, audited refunds, admin APIs, client secret exclusion, public/SSR job catalog, no-service-key public reads, source rights/lifecycle/freshness, deduplication, private bookmarks, retirement snapshots, private profile revision conflicts, immutable evidence, pagination, source-only scoring, deletion invalidations, mobile editing and explicit demo import |
| Worker dry run | Passed | Task schema and transition only; no live queue |
| Visual review | Reviewed | Actual dashboard, private-profile and catalog desktop/mobile screenshots; no horizontal overflow on inspected routes |
| Architecture | Passed | TypeScript import checks protect profile/job/skill domain and UI dependency boundaries |
| Documentation | Checked | English Markdown and resolvable local links |

Screenshots in `docs/assets` come from the running app using `scripts/capture-demo.mjs`, not generated visual mockups. Mobile behavior was checked at 390 × 844; desktop captures used 1440 × 1100. Screenshots do not establish production accessibility conformance.

Not verified or implemented: live job availability, provider course access, hosted Auth configuration, a production database, model accuracy, real document parsing/PDF export, external application success, Docker runtime, provider integrations or performance under load. The local identity stack is verified; hosted SMTP, hooks, secrets and schema deployment remain operator steps described in [Identity setup](IDENTITY_SETUP.md). Other design documents describe future acceptance gates. Course pages can apply bot protection, so the demo does not claim automated availability validation.
