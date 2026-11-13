# Scaffold verification

This document records the scope of local verification for v0.1. CI reports the current branch status independently.

| Check | Local result | Scope |
| --- | --- | --- |
| TypeScript | Passed | Generated Next route types and strict type checking |
| Vitest | 9 tests passed | Filters, overlap/gaps, prerequisites, fixed scoring, fixture isolation and state validation |
| Playwright Chromium | 7 journeys passed | All nine routes, bookmarks, evidence, learning, resume content export, tracker, reset and mobile navigation |
| Next production build | Passed | All nine application routes plus not-found output |
| Static export | Passed | Project base path `/rolefoundry` |
| Worker dry run | Passed | Task schema and transition only; no live queue |
| Visual review | Reviewed | Actual dashboard desktop/mobile screenshots; no horizontal overflow on inspected routes |
| Documentation | Checked | English Markdown and resolvable local links |

Screenshots in `docs/assets` come from the running app using `scripts/capture-demo.mjs`, not generated visual mockups. Mobile behavior was checked at 390 × 844; desktop captures used 1440 × 1100. Screenshots do not establish production accessibility conformance.

Not verified or implemented: live job availability, provider course access, authentication/RLS, a production database, model accuracy, real document parsing/PDF export, external application success, Docker runtime, provider integrations or performance under load. Design documents describe those future acceptance gates. Course pages can apply bot protection, so the demo does not claim automated availability validation.
