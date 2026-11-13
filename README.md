<div align="center">

<img src="public/icon.svg" width="72" height="72" alt="RoleFoundry sprout mark" />

# RoleFoundry

### Turn AI skills into your next role.

An open-source career workspace that connects **AI jobs → skill evidence → learning → your next move**.

[![CI](https://github.com/jerry1022/rolefoundry/actions/workflows/ci.yml/badge.svg)](https://github.com/jerry1022/rolefoundry/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-214f42.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-202f29?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-547b63?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Explore the demo](https://jerry1022.github.io/rolefoundry/) · [Read the architecture](docs/HLD.md) · [Detailed designs](docs/design/README.md) · [Contribute](CONTRIBUTING.md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjerry1022%2Frolefoundry&project-name=rolefoundry&repository-name=rolefoundry)

</div>

![RoleFoundry career workspace preview](docs/assets/dashboard.png)

## A job board gives you a list. A career workspace gives you a next step.

Finding an interesting AI role is only the beginning. RoleFoundry helps you connect the requirements to your experience, notice where evidence is missing, and choose a useful course or practice task instead of collecting endless playlists.

**Discover a role. Understand the gap. Build something that proves progress.**

## Try it in two minutes

Requires **Node.js 24+**. No API key, account or database needed.

```bash
git clone https://github.com/jerry1022/rolefoundry.git
cd rolefoundry
npm ci
npm run dev
```

Open [localhost:3000](http://127.0.0.1:3000).

1. Explore a role and save it to your shortlist.
2. Adjust your skills, then try a three-question scenario check.
3. Choose a target role and explore relevant DeepLearning.AI resources.
4. Edit a sample resume and add a role to your application board.

Changes stay in your browser. Reset them from **Catalog studio**.

## What you can explore today

| Workspace | Working scaffold behavior |
| --- | --- |
| **Overview** | Recommended sample roles, growth snapshot and a next learning step |
| **Discover roles** | Ten specializations, career guides, keyword/track/workplace filters, bookmarks and role details |
| **My skill profile** | Editable direction, self-report and separate scenario evidence |
| **Skill check** | Twelve authored scenarios across four career tracks |
| **Learning path** | Six official course links, skill-gap ranking, prerequisites and practice prompts |
| **Resume studio** | Local draft editor, fact-focused checklist and text export |
| **Applications** | Manual stages, notes and persistent local state |
| **Catalog studio** | Transparent fixture provenance and a confirmed local reset |
| **Architecture** | An explorable overview of the planned service boundaries |

### Honest by default

This is a **functional product scaffold**, not a live recruiting service. Employers, openings and salaries are fictional. Course summaries and skill mappings are independent editorial metadata; course availability and pricing belong to the provider. RoleFoundry is not affiliated with DeepLearning.AI.

There is no connected authentication, database, job feed, AI model, document upload, PDF export or application submission. The resume checklist and skill overlap are deterministic. Completing a course does **not** verify a skill; overlap does **not** predict hiring. Use sample information in the public demo.

## Architecture that can grow with the product

```mermaid
flowchart LR
    UI[Next.js workspace] --> D[Typed domain modules]
    D --> F[Fixture repositories — today]
    D -.-> DB[(Supabase — planned)]
    D -.-> Q[pgmq + Node worker — planned]
    Q -.-> AI[AI Gateway — planned]
    DB -.-> S[Jobs ↔ skills ↔ evidence ↔ courses]
```

Today: **Next.js · React · TypeScript · Zod · CSS tokens · Lucide · Vitest · Playwright**.

Production design: **Supabase Auth/PostgreSQL/Storage · pgvector · durable task queues · independent worker · schema-validated AI adapters**. The architecture is a modular monolith, with explicit module ports rather than premature microservices.

```text
src/app/             Nine routes and application layout
src/components/      Shared shell and interactive screens
src/lib/             Domain rules, schemas, fixtures and service ports
apps/worker/         Dry-run worker contract
docs/                HLD, 13 module designs, API, data model and deployment
tests/               Domain tests and browser journeys
.github/workflows/   CI and static demo deployment
```

## Design documentation

- [Original AI career classifications and learning pathways](docs/CAREER_PATHS.md)

- [Integrated product plan](ai-career-platform-plan.md)
- [High-level design](docs/HLD.md)
- [All 13 detailed module designs](docs/design/README.md)
- [Production API contract](docs/API.md) and [data model](docs/DATA_MODEL.md)
- [Career journey playbook](AI_CAREER_PLAN.md)
- [Deployment guide](docs/DEPLOYMENT.md) and [roadmap](docs/ROADMAP.md)

All documentation is in English. The initial production market is Taiwan; Traditional Chinese localization is planned.

## Development checks

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run worker:demo
```

The worker command validates a dry-run task. It does not consume a live queue. Browser tests cover discovery, bookmarks, assessment evidence, learning progress, resume export, the tracker, reset and mobile navigation.

## Deploy your own

**Vercel:** use the Deploy button or import this repository as a Next.js project. Keep the default build settings and leave `STATIC_EXPORT` and `NEXT_PUBLIC_BASE_PATH` unset. No credentials are required for the scaffold. Vercel Hobby is limited to personal/non-commercial usage within its quotas; future commercial operation and external services require an appropriate plan.

**Static hosting:** `NEXT_PUBLIC_BASE_PATH=/rolefoundry npm run build:pages` creates `out/` for a project-path deployment. Use an empty base path on a root domain. A GitHub Pages workflow is included.

**Docker:** `docker build -t rolefoundry .` then `docker run --rm -p 3000:3000 rolefoundry`.

See [deployment details](docs/DEPLOYMENT.md). The future long-running worker is deployed separately from Vercel Functions.

## Build the next chapter with us

The next milestones are durable private profiles, authorized job sources, reviewed bilingual skill mappings, deeper learning plans and fact-preserving resume analysis. Contributions to accessibility, source quality, assessment calibration and Traditional Chinese localization are especially welcome.

Read [CONTRIBUTING](CONTRIBUTING.md), open a focused issue, or pick a clearly scoped improvement from the [roadmap](docs/ROADMAP.md). Please do not contribute scraped personal data, copied course content or fabricated job listings presented as live openings.

If this direction is useful to you, **star the repository** to follow its progress and share it with someone building their next chapter in AI.

## License

[MIT](LICENSE) © Jerry Huang. Third-party courses and brands remain the property of their owners. The software license does not grant rights to external course content or job listings.
