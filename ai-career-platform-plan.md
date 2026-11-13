# RoleFoundry — Integrated Product Plan

This English document consolidates the original platform plan and career playbook. Technical detail lives in [HLD](docs/HLD.md) and [module designs](docs/design/README.md).

## Product promise

Turn a promising AI role into a clear next action: discover jobs, understand capability gaps, choose relevant learning, create evidence, improve a truthful resume and track applications.

**Discover → assess → compare gaps → learn and practice → update evidence → refine resume → apply and review.** Browsing does not require an assessment. Learning and applications can happen in parallel.

## Audience and market

The initial production market is Taiwan, with Traditional Chinese localization planned. The first open-source scaffold is English. Serve four tracks: engineering/data, product/strategy, marketing/operations, and design/content. Search can include LLM application, ML, data science, data engineering, MLOps, computer vision, research, AI PM, consulting, automation and creative roles. Foundational assessments are scoped to the four broad tracks, not every specialist role.

Distinguish core AI development, applied AI work and roles where AI is only a preferred skill. Include relevant classical ML and computer vision rather than treating all AI work as generative AI. Do not claim complete coverage of the job market.

## User experience

| Area | First production capability |
| --- | --- |
| Career overview | Target direction, relevant roles, gaps and next actions |
| Job discovery | Keywords, track, location, workplace, seniority, salary, bookmarks and original application links |
| Profile | Resume claims, preferences, skills, portfolio references and evidence |
| Assessment | Self-report plus reviewed track-specific scenarios and explanations |
| Matching | Required/preferred conditions, supporting evidence, unknowns and gaps |
| Learning | DeepLearning.AI resources, prerequisites, practice and a two-week plan |
| Resume studio | Confirmed facts, role-specific proposals, reviewable versions and PDF export |
| Applications | Manual stages, selected resume, interview/follow-up dates and notes |
| Administration | Source/catalog review, skill mappings, question/rubric versions, invitations and quotas |

## Evidence and matching principles

Separate resume claims, self-report, scenario performance and portfolio evidence. Unknown is not incapable. A course completion is not verified ability. Show the requirement text, personal evidence and reason for each gap. Match conditions first, distinguish mandatory and preferred requirements, then sort with a versioned recipe. Explain overlap without representing it as hiring probability.

Suggested action groups: explore/apply now, strengthen evidence first, longer-term target and explicit condition conflict. Missing source information remains pending clarification. A user may proceed even when the platform has incomplete evidence.

## Job catalog

Launch with 100–200 current, authorized or manually curated jobs. Preserve source URL, source identifier, usage basis, first/last observed dates and status. Separate canonical openings from multiple source postings. Review artificial duplicates, unknown salary and ambiguous skill mappings. Expired roles stop appearing in recommendations while historical application snapshots remain readable.

Evaluate integrations with company career sites, 104, LinkedIn, Cake and Yourator only within their supported access/usage scope. A website being public does not establish permission to copy its complete catalog. External partnership work does not block the initial product.

## DeepLearning.AI learning

Start with 30–50 editorially reviewed course references. Store official title/link, skill outcomes, prerequisites, difficulty, language, official duration where available, access conditions and review date. No lesson mirroring, assumed provider API or private progress integration.

For each target gap, explain why a resource fits, what should be learned first and what practice will demonstrate progress. Prefer one main resource per stage. If no suitable course exists, say so rather than inventing one. Cover AI-common skills across tracks without pretending a single provider covers every design, marketing or industry skill.

A two-week plan uses the learner's available hours and includes a tangible outcome. Reported course completion updates progress only. Practice, a new scenario or reviewed work supplies separate capability evidence.

## Resume and application integrity

Only confirmed experience may be rewritten. Never invent employers, measured outcomes, credentials or finished projects. Keep in-progress work labeled. Preserve a master resume and role-specific versions. Distinguish original text, proposed revision and accepted version.

The first production upload formats are text PDF and DOCX, with a paste-text fallback for unsupported/scanned input. Application tracking is manual. Opening an external page does not confirm submission; no response does not mean rejection. Automatic applications are outside the initial release.

## Twelve-week development plan

| Weeks | Work | Deliverable |
| --- | --- | --- |
| 1–2 | Flows, prototype, skills, source policy, rubric design | Agreed scope and initial reviewed content |
| 3–4 | Identity, profiles, jobs, bookmarks, ingestion admin | Usable discovery foundation |
| 5–6 | Resume parsing, confirmation, scenario evidence | Personal capability report |
| 7–8 | Matching, gaps, course catalog and learning tasks | Job-to-learning journey |
| 9–10 | Resume revisions, exports, application tracker, recovery | Invitation-ready MVP |
| 11–12 | Review, security, mobile and pilot fixes | Small-scale launch |

Assume two engineers and one product/content contributor. Source and question preparation run in parallel with engineering. If content is delayed, reduce launch volume while preserving the full journey. This is a product-development estimate, not a promise about how long a learner needs to change careers.

## Acceptance

A user can move from a job to confirmed skills, assessment, gap explanation, real course references, practice, a truthful resume and a tracked application. All four tracks have reviewed foundational content. Source expiry, no matching course, model timeouts, unavailable files and storage failures have recoverable states. Private records are owner-scoped. Consent precedes provider processing; deletion covers source and derived data.

## Pilot and operation

Invite 20–30 people across the four tracks. Initial hypotheses: 60% complete the first profile/assessment, 70% find a useful role in their first five recommendations, and 50% accept a fact-preserving resume improvement. Review at least five assessment cases per track. Measure whether recommended learning produces practice evidence, not only course clicks. These are validation targets, not outcome guarantees.

Start invitation-only without billing. Initial weekly analysis budgets: three full assessments and five resume revisions per account. Keep existing results readable without recharging analysis quota. Observe failures, waiting time and per-task costs.

## Scope after the scaffold

Authentication, database persistence, authorized feeds, larger reviewed catalogs, provider-backed analysis, private document processing, localization and production operations remain future work. Employer search, bidirectional recruiting, certification, code execution, billing and autonomous applications are later or excluded capabilities.
