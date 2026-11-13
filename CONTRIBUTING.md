# Contributing to RoleFoundry

Thank you for helping people turn learning into a useful next step.

## Before changing code

Read the [HLD](docs/HLD.md), [module designs](docs/design/README.md) and [roadmap](docs/ROADMAP.md). Open an issue for changes that affect data ownership, source rights, assessment meaning or service boundaries. Small fixes can go straight to a pull request.

Use Node.js 24 and `npm ci`. Keep changes focused and follow the existing TypeScript and design-token conventions. The scaffold intentionally works without external credentials. New integrations must not silently transmit local demo information or turn a planned capability into an unlabeled mock.

## Validation

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Add meaningful tests for changed domain rules or user journeys. Check a narrow mobile viewport, keyboard navigation and empty/failure states for UI changes. Include screenshots when behavior or layout changes. Describe which checks you actually ran.

## Content and provenance

Use English for code comments and project documentation. Add language support through an explicit localization design. Keep fixture companies clearly fictional. Course links must point to official pages and summaries must be independently authored. Do not submit credentials, personal resumes, copied lessons, unauthorized job datasets or unsupported outcome claims.

## Pull requests

Explain the user-visible problem, resulting behavior and validation. Update the relevant design when a contract changes. Keep facts distinct from self-report and inference: course completion does not certify ability, job overlap does not predict an offer, and opening an external page does not confirm an application.

## Community

Be constructive, specific and respectful. Review ideas on their merits. Do not post other people's private information. Security issues should follow [SECURITY.md](SECURITY.md), not a public issue with exploit details.
