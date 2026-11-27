# Design documentation

RoleFoundry is an open-source AI career workspace. This documentation separates the browser-local career scaffold, implemented server identity/private profile/catalog and the remaining production design. All documents are written in English.

## Start here

- [Configuration status and handoff](CONFIGURATION.md): applied local settings, exact start commands and account-bound hosted verification.

- [Ingestion processing core and remaining integration](INGESTION_SETUP.md): bounded parsing, review planning, approved-feed networking and persisted retry authority.

- [Private manual application tracking](APPLICATIONS_SETUP.md): owner cycles, historical snapshots, fixed resume references, UTC follow-ups and event history.

- [Private resume studio](RESUME_SETUP.md): source upload, immutable facts/claims, individual proposals, fixed exports, deletion cleanup and hosted setup.

- [Reviewed courses and private learning](LEARNING_SETUP.md): versioned resources, two-week budgets, prerequisites and independent progress.

- [Skill dictionary](SKILL_DICTIONARY_SETUP.md): bilingual concepts, aliases, immutable versions and reviewed merges.

- [Course link observations](COURSE_LINKS_SETUP.md): opt-in HEAD-only checks, shared host cadence and audited pause recovery.

- [Complete design audit](IMPLEMENTATION_AUDIT.md): full remaining goal and acceptance scope.
- [Catalog setup](CATALOG_SETUP.md): published jobs, source policies, private bookmarks and anonymous SSR.

- [Module delivery and dependency rules](MODULE_DEVELOPMENT.md): ordered progress, replaceable ports/adapters and upgrade contracts.
- [Profile/evidence setup](PROFILE_SETUP.md): implemented module 02, exact API and provenance/invalidation boundaries.

- [AI career classifications](CAREER_PATHS.md): the original nine directions, creative AI work, and their relationship to assessment tracks.
- [Identity setup](IDENTITY_SETUP.md): implemented module 01, local Auth/database tests and hosted configuration.

1. [Product plan](../ai-career-platform-plan.md): audience, scope, capabilities, milestones and acceptance criteria.
2. [High-level design](HLD.md): architecture, deployment, data ownership and technology choices.
3. [Detailed design index](design/README.md): each module's responsibilities, interfaces, flows and failure cases.
4. [API contract](API.md): planned domain resources plus a link to the implemented identity API.
5. [Data model](DATA_MODEL.md): intended relational model, evidence provenance and access rules.
6. [Deployment](DEPLOYMENT.md): local development, Vercel, GitHub Pages and the future worker.
7. [Roadmap](ROADMAP.md): implemented scope and production milestones.
8. [Career playbook](../AI_CAREER_PLAN.md): the user journey that informed the product.

## Status vocabulary

- **Implemented:** executable in the repository and covered by a build or behavior check.
- **Demo:** fictional or editorial data; browser-local state; no external action.
- **Contract:** a TypeScript interface or schema, with no production adapter yet.
- **Planned:** design only. Requires implementation and validation before use.

The public catalog inspector is a demo route, not an administrative security boundary. Identity admin operations live behind server verification in Account & privacy. Private document uploads and manual tracking are implemented in configured deployments. Live job feeds, model calls and external applications remain unconnected. Static exports do not include dynamic identity, profile or catalog APIs.
