# Resume studio implementation

Module 08 is **in progress**. The browser still uses the local text editor. The private storage/database, owner APIs, persistent task adapters and connected UI are not implemented on this branch yet. Do not treat the processing core or its passing tests as an enabled private resume service.

## Implemented processing core

The consuming module owns parser, renderer, reviser and execution-store ports. Pure schemas/rules contain no Next/database/document-library imports. The actual parser and PDF renderer run in disposable child processes; document libraries and fonts never enter browser/domain modules. The worker image includes these runtime assets, but its queue registry still runs only assessment, matching and learning handlers until the resume persistence adapters are connected.

- Upload metadata allows PDF/DOCX only, matching filename extensions and a 5 MiB size bound.
- PDF extraction uses the [PDF.js data API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html). It limits pages/text, disables evaluation and exposes a password-protected/empty-text path. Scanned documents require a later paste-text fallback rather than invented extraction.
- DOCX uses [Mammoth raw-text extraction](https://github.com/mwilliamson/mammoth.js#basic-conversion), with buffer input and its default disabled external file access. A preceding ZIP pass bounds both advertised and actual decompressed sizes and rejects duplicate/unsafe names, encrypted entries, macros/embedded objects and XML DTD/entity declarations. HTML conversion and linked images are unused.
- Drafts retain normalized extracted text and exact UTF-16 source offsets/page references. Extraction is a draft for owner review, not confirmation or capability evidence.
- Confirmed facts have explicit completion/learning states and canonical skill references. Every fact belongs to exactly one section. The deterministic `resume-order-v1` fallback can reorder exact confirmed statements for target skills and ask about missing evidence. It cannot add metrics, credentials or project claims. Model-assisted wording remains pending module 11; it is not silently replaced by this fallback.
- Proposals cite the exact source version, job version, section and fact IDs. Validation rejects invented or omitted statements, foreign references and stale baselines. Individual acceptance returns a new content value, retaining rejected sections and the source unchanged; database immutability/concurrency still needs the persistent adapter.
- The controlled PDF template renders accepted headings/statements with visible **In progress** and **Learning goal** labels. [PDFKit](https://pdfkit.org/docs/text.html) embeds a bundled Noto Sans CJK TC subset; its [license and pinned source](../assets/fonts/README.md) are retained. Unsupported glyphs fail explicitly. Export execution independently reparses the PDF and compares content tokens, preserving Latin word boundaries while tolerating layout whitespace around Han characters. No ATS score or PDF accessibility conformance is claimed.

Limits are centralized in `src/modules/resume/limits.json`: 5 MiB source/export, 20 MiB inflated ZIP, 512 ZIP entries, 20 source/export pages, 50,000 text characters, 250 facts/blocks, 40 sections and a 20-second processing deadline per child. The execution handler validates sealed file length and schemas, rejects replaced-adapter output and checks cancellation before publication. Persistent stores must enforce active ownership, source/version freshness and the task lease again at commit.

The child has a minimal environment without inherited runtime credentials, bounded protocol output, a 192 MiB V8 heap limit and narrow Node filesystem-read permissions. It has no JS filesystem-write/subprocess permission; document inputs do not supply filesystem paths. Native canvas support needed by PDF.js means Node permissions are **not an OS sandbox for malicious native code**. The actual Linux smoke test additionally uses a read-only filesystem, no network, memory/CPU/PID bounds, dropped capabilities and no-new-privileges. Production containment must preserve the deployment's appropriate operating-system controls; the configured queue worker still needs network access to its database/storage.

## Run the current checks

```bash
npm run typecheck
npm test
npm run resume:test
npm run architecture:check
docker build -f Dockerfile.worker -t rolefoundry-worker:resume .
node scripts/check-resume-worker-image.mjs rolefoundry-worker:resume
```

The seven actual-process cases cover text PDF/DOCX and bilingual content, empty/scanned/malformed/encrypted/disguised files, page/size/inflation limits and active XML/archive content, exact accepted-text and multipage export, unsupported glyphs and cancellation/deadlines. Unit tests cover source spans, strict upload/confirmation models, target-specific ordering, fact preservation, partial acceptance and replaced execution adapters. CI runs the document suite and isolated Linux image check.

The authored bilingual sample PDF is an ignored test artifact, not a user resume or a shipped product download. Its actual rendered page was reviewed with Poppler; source text was separately compared after extraction. Passing these checks does not prove private storage access, API ownership, durable publication/deletion or the connected browser flow.

## Remaining module 08 delivery

1. Configure private local storage and document the corresponding hosted settings.
2. Add immutable document/source/draft/confirmed/proposal/export records with owner-authorized RPCs, optimistic revisions and audited deletion/cleanup.
3. Add expiring upload/download authority, safe source verification and isolated task adapters. Deletion must block reads and late workers immediately and remove stored derivatives.
4. Connect parse/confirm/revise/individual acceptance/export/reload flows to the existing UI, retaining labelled local mode and a paste fallback.
5. Verify real storage/database/worker authorization, stale/conflicting proposals, retries, owner deletion/deactivation, exact fixed-version exports, mobile workflows and source retention on failure; then update status and open the stacked module PR.

The full thirteen-design objective remains in the [implementation audit](IMPLEMENTATION_AUDIT.md). Hosted configuration, source/content review, model evaluation and recovery/pilot gates remain separate from local engineering checks. Settings that can be configured safely will be set and verified; any account-bound setup will have exact locations, purpose and validation steps in the final setup documentation.
