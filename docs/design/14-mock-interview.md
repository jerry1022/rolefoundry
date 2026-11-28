# 14 — AI mock interview and learning feedback

## Status and outcome

**Proposed, not implemented.** Add a private practice interview that turns a target role and the learner's actual answers into an evidence-linked feedback report, a short learning plan and a focused retake. The existing fixed-choice skill check remains a separate activity.

The first release is a text conversation in English, Traditional Chinese or Japanese. A learner selects the interview language independently of the interface language. Start with AI/LLM application engineering; expand to data/ML, product/consulting and automation after each track's rubric and examples have been reviewed. Voice is a later phase.

## Learner journey

1. **Prepare.** Choose a published role or a reviewed role template, level and interview language. Optionally select one confirmed resume version. Show the skills covered, expected 15–20 minute duration, bounded question count, AI recipients and allowance before starting. Do not upload a full resume by default.
2. **Practice.** Ask five core questions: a short introduction/project example, two technical or domain questions, one scenario/tradeoff question, and one collaboration/behavioral example. Allow at most one follow-up per core question and ten questions total. Follow-ups clarify the learner's answer within the selected skills. Autosave answers, show the remaining scope and allow pause/resume, skip and early finish.
3. **Generate feedback.** Seal the submitted answer revision and queue an asynchronous report. Keep the transcript accessible while processing. A timeout or retry must never require answering again or overwrite a previous report.
4. **Act.** Show the three highest-priority improvement areas with answer excerpts, a concrete practice task, selected DeepLearning.AI resources and a two-week time budget.
5. **Retake.** Offer new equivalent questions on the same rubric and selected weak areas. Keep both attempts and distinguish a full interview from a targeted retake.

In interview mode, feedback appears after finishing. A later coaching mode may offer hints during the conversation, but its results must be marked assisted and compared only with similarly assisted attempts.

## Report contract

| Part | Required content |
| --- | --- |
| Session context | Target role/template version, learner-selected level, interview language, question/rubric/model versions, completed and skipped questions |
| Coverage | Skills and dimensions actually observed; mark unasked or insufficiently evidenced dimensions as **not enough evidence** |
| Dimension feedback | Technical correctness, reasoning/tradeoffs, practical application, answer structure and concrete examples, with 0–4 rubric anchors only where evidence is sufficient |
| Strengths | Specific observed behavior, with question ID and a validated answer excerpt |
| Improvement areas | What is missing or incorrect, why it matters to the selected role, priority, actionable next practice and linked answer evidence |
| Per-answer review | Question, submitted answer, supported feedback, missing points and a suggested answer structure; label hypothetical examples and never invent personal accomplishments |
| Learning recommendations | Canonical gap skill IDs, approved course version IDs, official URLs, why selected, prerequisites, known language, editorial time estimate and a practice outcome |
| Next two weeks | Workload within the learner's selected weekly hours; one main resource and one practice outcome per priority where feasible |
| Limits | Unobserved skills, assisted/skipped answers, uncertain judgments and course coverage gaps |

Use an anchored 0–4 scale: incorrect/unsafe reasoning, fragmented understanding, workable basics, well-supported application, and strong reasoning with tested tradeoffs. Each dimension needs its own reviewed examples; these general anchors alone are insufficient to enable scoring. Missing answers and lack of coverage are not scored as zero.

Do not turn the report into a hiring probability, personality judgment or certification. Score communication for the answer's structure and specificity, without penalizing accent or assuming native-language fluency. Language coaching, if requested later, is a separate dimension. Prefer a dimension/coverage view over a single overall score, especially for incomplete sessions.

## DeepLearning.AI course selection

Use the existing reviewed course catalog in module 07. Map each gap to canonical skill IDs, retrieve only published resources, then rank using relevance, prerequisites, level, prior reported completion, availability and the learner's time budget. The model can explain a retrieved recommendation but cannot invent course IDs, URLs or completion claims.

Candidate mappings for editorial review:

| Observed gap | Candidate resource | Suggested original practice |
| --- | --- | --- |
| Retrieval/citation debugging | [Retrieval Augmented Generation](https://www.deeplearning.ai/courses/retrieval-augmented-generation) | Compare two retrievers on ten held-out questions and explain citation failures |
| Agent tool use, boundaries and recovery | [Agentic AI](https://www.deeplearning.ai/courses/agentic-ai/) | Build a bounded workflow with an approval step and three failure tests |
| Evaluating agent improvements | [Evaluating AI Agents](https://www.deeplearning.ai/short-courses/evaluating-ai-agents/) | Compare a baseline and revision using a fixed set and human-checked evaluation criteria |
| Product scoping and realistic AI expectations | [AI for Everyone](https://www.deeplearning.ai/courses/ai-for-everyone/) | Write a one-page problem, baseline, success metric and adoption proposal |

The [official catalog](https://www.deeplearning.ai/courses) is the reference for resource discovery. Before publishing recommendations, reviewers must verify the exact resource, current link, content-to-skill mapping, language and prerequisites. UI translations do not imply Japanese or Chinese course delivery. Availability and prices are provider-controlled. Store metadata and official references, not copied lessons, paid material or unsupported course-section timestamps. When no relevant course exists, say so and offer an original practice exercise; do not force a recommendation for behavioral skills.

Course completion remains self-reported learning progress. A retake or independently reviewed practice provides separate observations; it never silently promotes a verified skill level.

## Architecture and ownership

Add `src/modules/interview` with framework-free models, schemas, ports, use cases and replaceable adapters. The module owns interview sessions, turns and feedback, while existing modules retain their data and authorization responsibilities.

- **01 identity:** verified actors, independent `interview` consent version, allowed recipients, weekly reservations and audited refunds.
- **02 profile / 04 skills:** selected evidence and version-pinned skill IDs; store interview observations with explicit provenance only after the learner elects to add them.
- **03 jobs / 08 resume:** read only the selected role snapshot and optionally approved confirmed facts through module ports.
- **05 assessment:** reuse rubric concepts and calibration methods without storing conversations as fixed-choice attempts or exposing assessment answer keys.
- **07 learning:** retrieve published courses and create a budgeted plan with reviewed course versions.
- **11 gateway:** separate purposes for follow-up generation and report analysis, schema/reference validation, current consent checks, token and deadline limits, injection-resistant separation of instructions from answer text, provider usage records and no arbitrary tool execution.
- **12 tasks:** durable `interview.next-turn` and `interview.report` handlers, leases, idempotency, retries, cancellation, authorization before each provider call and atomic publication.
- **13 operations/privacy:** audited metadata diagnostics, content-free cost metrics, account export/deletion integration and restore deletion markers. Transcripts and reports remain private owner records.

Conceptual records: `interview_sessions`, `interview_turns`, `interview_question_versions`, `interview_rubric_versions`, `interview_reports` and `interview_report_evidence`. A report binds an immutable session revision, role/template version, dictionary version, rubric version, prompt recipe and model identity. Course suggestions bind reviewed course versions.

Conceptual API under `/api/v1/interviews`: create/list sessions, read an owned session, revision-checked answer autosave, request the next turn, seal/finish, read report/history, cancel/delete and create a retake. Start/finish/next-turn mutations require idempotency keys. Requests derive the owner from the verified session. The client cannot supply the model endpoint, arbitrary course URLs or another user's references.

Suggested lifecycle: `draft → active → sealed → analyzing → completed`; paused sessions retain the active state plus a pause marker. Cancelled, failed and invalidated states have explicit recovery rules. Retrying report generation reuses the sealed transcript; a retake creates a new session. Deletion invalidates pending work and removes transcripts, excerpts and derived reports before any later publication.

## Delivery phases

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 1 Product and content | Text flow, report UI prototype, first engineering track, reviewed question/rubric examples in EN/zh-TW/ja | Reviewer-approved examples and source-grounded report format |
| 2 Private service | Durable sessions, autosave, bounded follow-ups, gateway report, owner history | Duplicate/retry/deletion/isolation tests pass; no fabricated evidence accepted |
| 3 Learning loop | Reviewed DeepLearning.AI mappings, time-budgeted plan, practice references, focused retake | All course IDs and links validate; missing resources explicit; no automatic ability promotion |
| 4 Pilot | Small invitation cohort, multilingual evaluation, quality/cost/latency review | Human agreement and usefulness meet thresholds set before live calibration |
| Later Voice | Opt-in recording, transcription with editable transcript, audio retention/deletion | Separate consent, cost and multilingual transcription evaluation |

Engineering estimate: roughly 3–4 weeks for one engineer working with a content reviewer, after a working hosted backend/worker and an approved model route are available. This is a planning estimate, not a committed delivery date. Limit the first track before reducing rubric quality or privacy coverage.

## Acceptance and release gates

- Verify pause/reload/mobile autosave, revision conflicts, skipped answers, early finish, question limits, duplicate finish and task retry without duplicate reports.
- Every judgment must reference an existing question and a literal excerpt within the sealed answer revision. Reject invalid offsets, invented quotes, unsupported competence claims and hallucinated resource IDs.
- Evaluate reviewed multilingual examples for rubric agreement, unsupported negative feedback, factual preservation, useful actions and cross-language consistency. Test equivalent paraphrases and insufficient evidence. Set reviewer agreement thresholds before running the calibration; require editorial sign-off for each enabled track/language.
- Keep scores comparable only under the same or explicitly equated rubric and comparable coverage. New questions should test transfer rather than memorized repetition. Report changes in scope before showing progress comparisons.
- Test prompt injection in job descriptions, resumes and answers; model content cannot change permissions, fetch URLs, publish sources or update a learner's skill claims.
- Verify owner RLS, foreign IDs, revoked consent, cancelled/deleted sessions, account deletion during generation, exports and backup deletion replay.
- Record per-session and per-purpose token caps and actual usage; include provider concurrency, whole-session budget, timeouts, terminal errors and retry cost. Reserve allowance once per session and enforce a separate bounded call budget for follow-ups and the report.
- A provider failure preserves the transcript and shows an explicit retryable state. A demo or unavailable provider never produces a fabricated completed AI report.

## Current dependencies

The hosted Supabase project exists, but migrations, Auth settings, Vercel environment wiring and the independent worker still need completion and verification. The gateway has no approved live model route by default. These are implementation dependencies for the interview service, not reasons to block the UI prototype or content design.
