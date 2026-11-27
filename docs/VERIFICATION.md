# Verification

This document records the scope of local verification for the demo and module 01. CI reports the current branch status independently.

| Check | Local result | Scope |
| --- | --- | --- |
| TypeScript | Passed | Generated Next route types and strict type checking |
| Vitest | 20 tests passed | Original career paths, combined filters, bilingual aliases, overlap/gaps, prerequisites, fixed scoring, fixture isolation, state validation, verified actors and UTC weeks |
| Playwright Chromium | 11 journeys passed | All specializations and empty-category guides, all ten routes, hydration-safe editing, bookmarks, evidence, learning, resume content export, tracker, reset, account demo isolation and mobile navigation |
| Next production build | Passed | All ten application routes plus not-found output |
| Static export | Passed | Project base path `/rolefoundry`; dynamic identity handlers excluded |
| Local identity integration | 18 tests passed | Real GoTrue/PostgREST/PostgreSQL and production Next server: invitation OTP, verified sessions, RLS, consent versions/revocation, concurrent independent budgets, idempotency, worker guards, audited refunds, admin APIs and client secret exclusion |
| Worker dry run | Passed | Task schema and transition only; no live queue |
| Visual review | Reviewed | Actual dashboard desktop/mobile screenshots; no horizontal overflow on inspected routes |
| Documentation | Checked | English Markdown and resolvable local links |

Screenshots in `docs/assets` come from the running app using `scripts/capture-demo.mjs`, not generated visual mockups. Mobile behavior was checked at 390 × 844; desktop captures used 1440 × 1100. Screenshots do not establish production accessibility conformance.

Not verified or implemented: live job availability, provider course access, hosted Auth configuration, a production database, model accuracy, real document parsing/PDF export, external application success, Docker runtime, provider integrations or performance under load. The local identity stack is verified; hosted SMTP, hooks, secrets and schema deployment remain operator steps described in [Identity setup](IDENTITY_SETUP.md). Other design documents describe future acceptance gates. Course pages can apply bot protection, so the demo does not claim automated availability validation.
