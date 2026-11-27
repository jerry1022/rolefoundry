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
- [x] Private persistence for the implemented career modules 01–09, including manual tracking.
- [ ] Private storage, delete/export account workflows and recovery tests.
- [x] Identity task ledger and transactional outbox.
- [x] Durable pgmq adapter, independent grading/matching/learning/resume worker, leases/retries and safe task metrics.
- [ ] Remaining module 12 handlers, provider reservation/invalidation dispatch and hosted alerts.

See [module-by-module delivery status](MODULE_DEVELOPMENT.md); module 10 is the next implementation.

## v0.3 — Real catalogs and reviewed evidence

- [x] Module 03 source policies, reviewed publication/expiry, anonymous catalog and private bookmarks.
- [ ] Module 10 authorized live source adapters and reviewed content population.
- [x] Module 04 bilingual dictionary/aliases, immutable versions, relation DAGs and reviewed admin merges.
- [x] Private versioned assessments, reviewed bank UI, autosave and deterministic grading/evidence.
- [ ] External editorial calibration of skill mappings and assessment rubrics.
- [ ] Curated catalog of 30–50 courses with source review dates. The demo now lists 30 official DeepLearning.AI courses whose titles, levels, formats and URLs were checked against the official catalog (dated per course); RoleFoundry's skill mappings, summaries and exercises still need human editorial review, and the database catalog still needs reviewed publication.
- [ ] Larger foundational question bank with expert calibration.
- [ ] Traditional Chinese UI and locale-aware formatting. The [shell, demo, connected and administration screens are bilingual](LOCALIZATION.md) with `Intl` formatting and CI key checks; skill names now follow the locale on connected screens from the reviewed dictionary translations; administrators can add [reviewed job translations](CATALOG_SETUP.md#reviewed-translations) bound to a published version; [reviewed course translations](LEARNING_SETUP.md#reviewed-course-translations) cover editorial course text; question text remains English pending reviewed per-locale fields.

## v0.4 — Production analysis

- [ ] Approved model adapter and fixed bilingual evaluation set. The [gateway core, OpenAI-compatible adapter and synthetic bilingual set](AI_GATEWAY_SETUP.md) are implemented; provider approval and live evaluation remain.
- [x] Private PDF/DOCX sources, isolated parsing and confirmed resume facts/claim history.
- [x] Grounded order proposals, individual acceptance, immutable versions and verified PDF export.
- [ ] Evaluated model-assisted wording from confirmed facts through module 11. Owner-applied, fact-preserving [wording suggestions](RESUME_SETUP.md#optional-ai-wording-suggestions) are integrated; live evaluation remains.
- [x] Source-grounded private matching snapshots, explicit conditions and immediate deletion purge.
- [ ] Structured short-answer grading and reviewed semantic/model match recipe. The [grounded grading core and calibration gate](ASSESSMENT_SETUP.md#short-answer-calibration-not-enabled) exist; semantic ordering is integrated; live calibration and enablement remain.
- [x] Reviewed course catalog, two-week budgeted plans/prerequisites and private progress/practice references.
- [ ] Human review of real course mappings, prerequisites and practice outcomes.

## v1.0 — Invitation pilot

Run a 20–30-person pilot across four tracks. Prepare 100–200 authorized, current jobs; inspect every first-run failure; review evidence quality and recommendation usefulness. Initial product targets: 60% first-assessment completion, 70% finding a useful result in their first five recommendations, and 50% accepting at least one fact-preserving resume improvement. These are hypotheses, not guarantees.

The 12-week MVP estimate assumes two engineers plus a product/content contributor working in parallel. Source acquisition, provider selection and privacy validation are real dependencies. Reduce initial content volume before sacrificing the complete journey.

## Later, after evidence of value

Employer self-service, deeper portfolio review, mock interviews, authorized progress/application integrations and billing. No automatic applications, certification claims or hiring probability promises are included in the initial release.
