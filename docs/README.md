# Design documentation

RoleFoundry is an open-source AI career workspace. This documentation separates the **working browser-local scaffold** from the **planned production system**. All documents are written in English.

## Start here

1. [Product plan](../ai-career-platform-plan.md): audience, scope, capabilities, milestones and acceptance criteria.
2. [High-level design](HLD.md): architecture, deployment, data ownership and technology choices.
3. [Detailed design index](design/README.md): each module's responsibilities, interfaces, flows and failure cases.
4. [API contract](API.md): proposed production endpoints; these are not deployed API handlers.
5. [Data model](DATA_MODEL.md): intended relational model, evidence provenance and access rules.
6. [Deployment](DEPLOYMENT.md): local development, Vercel, GitHub Pages and the future worker.
7. [Roadmap](ROADMAP.md): implemented scope and production milestones.
8. [Career playbook](../AI_CAREER_PLAN.md): the user journey that informed the product.

## Status vocabulary

- **Implemented:** executable in the repository and covered by a build or behavior check.
- **Demo:** fictional or editorial data; browser-local state; no external action.
- **Contract:** a TypeScript interface or schema, with no production adapter yet.
- **Planned:** design only. Requires implementation and validation before use.

The public catalog inspector is a demo route, not an administrative security boundary. No live job feeds, authentication, model calls, file uploads, or external applications are connected.
