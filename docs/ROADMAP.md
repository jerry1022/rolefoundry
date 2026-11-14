# Roadmap

## v0.1 — Explore the product (implemented scaffold)

- [x] Responsive nine-route workspace and shared navigation.
- [x] Eight fictional roles, search, filters, details and bookmarks.
- [x] Editable local profile and self-reported skills.
- [x] Twelve scenarios across four career tracks.
- [x] Deterministic overlap, gaps and prerequisite-aware course ranking.
- [x] Six curated DeepLearning.AI course links and practice prompts.
- [x] Local resume editor, review prompts and text export.
- [x] Manual application stages, notes and local persistence.
- [x] Provenance inspector, architecture view and confirmed demo reset.
- [x] HLD, thirteen module designs, API/data/deployment documents.
- [x] Type checks, unit and browser tests; reproducible build configuration.

## v0.2 — Durable, private foundation

- [x] Module 01 Supabase identity migration, invitations and email OTP sign-in.
- [x] Identity owner RLS, consent, quota reservations, worker guards and audited refunds.
- [x] Module 02 private preferences, immutable evidence, owner RLS and optimistic revisions.
- [x] Explicit preview/approval import of demo preferences and self-reported skills only.
- [x] Profile change/deletion outbox and revision contract for later derived data.
- [x] Repository/client ports, request-scoped adapters and dependency checks.
- [ ] Migration/persistence for other demo career modules.
- [ ] Private storage, delete/export account workflows and recovery tests.
- [x] Identity task ledger and transactional outbox.
- [ ] Module 12 pgmq adapter, real worker leases and telemetry.

See [module-by-module delivery status](MODULE_DEVELOPMENT.md); module 05 is the next implementation.

## v0.3 — Real catalogs and reviewed evidence

- [x] Module 03 source policies, reviewed publication/expiry, anonymous catalog and private bookmarks.
- [ ] Module 10 authorized live source adapters and reviewed content population.
- [x] Module 04 bilingual dictionary/aliases, immutable versions, relation DAGs and reviewed admin merges.
- [ ] External editorial calibration of skill mappings and assessment rubrics.
- [ ] Curated catalog of 30–50 courses with source review dates.
- [ ] Larger foundational question bank with expert calibration.
- [ ] Traditional Chinese UI and locale-aware formatting.

## v0.4 — Production analysis

- [ ] Approved model adapter and fixed bilingual evaluation set.
- [ ] Isolated PDF/DOCX parsing and confirmed resume facts.
- [ ] Grounded revision proposals, immutable versions and PDF export.
- [ ] Structured short-answer grading and explainable match snapshots.
- [ ] Two-week learning plans and practice evidence.

## v1.0 — Invitation pilot

Run a 20–30-person pilot across four tracks. Prepare 100–200 authorized, current jobs; inspect every first-run failure; review evidence quality and recommendation usefulness. Initial product targets: 60% first-assessment completion, 70% finding a useful result in their first five recommendations, and 50% accepting at least one fact-preserving resume improvement. These are hypotheses, not guarantees.

The 12-week MVP estimate assumes two engineers plus a product/content contributor working in parallel. Source acquisition, provider selection and privacy validation are real dependencies. Reduce initial content volume before sacrificing the complete journey.

## Later, after evidence of value

Employer self-service, deeper portfolio review, mock interviews, authorized progress/application integrations and billing. No automatic applications, certification claims or hiring probability promises are included in the initial release.
