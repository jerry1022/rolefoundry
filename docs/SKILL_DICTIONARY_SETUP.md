# Versioned skill dictionary

Module 04 implements stable canonical concepts, English/Traditional Chinese labels, exact aliases, independent prerequisite/broader-than DAGs, career-track priorities, redirects and immutable public snapshots. The dictionary is shared by profile/evidence and job requirements; adding a production skill no longer requires editing their frontend enums.

## Run and configure

Follow [Identity setup](IDENTITY_SETUP.md), apply pending migrations, then start the local app:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
```

Open `/dictionary/` for anonymous browsing, exact lookup and historical snapshots. A verified administrator sees the editor, aliases/relationships/track mapping forms and reviewed merge/removal controls. Use Account & privacy for sign-in and the documented local admin bootstrap. No first-user-is-admin endpoint exists.

The dictionary is available when either configured identity or the published catalog is enabled. Anonymous reads use only the URL/anon key and never need the service key. Private mutations reuse identity verification. Static export shows a clearly labeled, read-only seed vocabulary and does not call missing APIs.

Review/apply `20261114040000_skill_dictionary.sql` after 01–03. Deploy the readers that support extensible IDs before enabling authoring of new concepts. Old deployed readers that assume the original nine-ID enum must be upgraded/refreshed before new concepts are used; the local demo storage format intentionally keeps that strict original enum. Migrations do not run automatically on hosted projects during builds.

## Public API

| Method/path | Behavior |
| --- | --- |
| GET `/api/v1/skills` | Current `{data: {version, createdAt, skills, aliases, relations, trackSkills}}` |
| GET `/api/v1/skills?version={n}` | Exact immutable historical snapshot; missing version 404 |
| GET `/api/v1/skills/resolve?term={text}&locale={optional}&version={optional}` | Exact ID/alias resolution at a published version |

Skill entries include `id`, `nameEn`, `nameZhTw`, `description`, `status` and nullable `redirectTo`. Production IDs are lowercase stable strings of up to 64 characters; editing a label never changes an ID. The initial nine concepts remain available, and administrators can add reviewed concepts at runtime. Foreign keys/registry validation reject unknown IDs; string-shape validation alone is not proof that a concept exists.

Normalization applies NFKC, case folding for the supported labels, collapsed/trimmed whitespace and supported dash normalization. Meaningful symbols in C++, C# and .NET are retained. Direct canonical IDs take precedence, including retained merge redirects. Exact aliases are unique per `en`/`zh-TW` language/key. An unqualified cross-language term can be ambiguous; a language-qualified lookup can resolve it. A deprecated concept remains in snapshots/history but is not accepted as a new active claim.

A resolution returns `{version, normalizedTerm, status, skillId, candidates, redirectedFrom}`. `status` is resolved/unresolved/ambiguous. Unresolved phrases remain reviewable source text; no fabricated ID, fuzzy fallback, proficiency claim or silent semantic confirmation is added. Historical resolution uses historical mappings, not current redirects.

## Administrator API

All mutation bodies require `expectedVersion` and a nonempty `reason`; stale dictionaries return 409 and must be reloaded. Requests require the configured same origin, verified administrator and bounded JSON. Unknown fields are rejected. Database entry points independently reauthorize the role.

| Method/path under `/api/v1/admin/skills` | Additional input |
| --- | --- |
| POST `/` | `id`, `nameEn`, `nameZhTw`, `description` |
| PATCH `/{id}` | `nameEn`, `nameZhTw`, `description`, `status` (active/deprecated) |
| POST `/aliases` | `skillId`, `locale`, `alias` |
| DELETE `/aliases` | `locale`, `alias` |
| POST `/relations` | `parentId`, `childId`, `relation` (prerequisite/broader-than) |
| DELETE `/relations` | `parentId`, `childId`, `relation` |
| POST `/tracks` | `track`, `skillId`, `priority` (1–100; 1 highest) |
| DELETE `/tracks` | `track`, `skillId` |
| POST `/merge` | `fromId`, `toId` (distinct active concepts) |

Every successful mutation returns the new `{data: {version}}`, publishes an immutable snapshot, writes a private reason/actor audit record, bumps the catalog revision and creates a dictionary-change outbox reference. English/Traditional Chinese labels are approved aliases on creation/update; former aliases remain resolvable unless explicitly removed. A duplicate language/key, alias contradicting a canonical ID, unsupported relation or cycle is rejected transactionally.

Both relation kinds are acyclic independently. Neither a broader concept nor its prerequisites imply that a person possesses another skill. Merging collapses equivalent concepts, moves active aliases/track mappings/relations, keeps the highest track priority, deduplicates edges and rejects any resulting cycle. The source ID remains a permanent redirect; subsequent target merges retain a resolvable chain. There is no destructive delete-concept operation or silent unmerge that rewrites history.

## Consumer and history contract

`evidence_skill_links.skill_id` and `job_skill_links.skill_id` retain original source IDs. Their `canonical_skill_id` columns are derived current joins. A private migration-owned projection registry lets new/replacement domain adapters register their derived join columns without changing merge logic. A merge updates the registered canonical projections and mutable dictionary mappings in one transaction, while original links, source content, rubric versions and historical dictionary snapshots remain unchanged. Incoming legacy merged IDs can still map to the active target; unknown/deprecated new inputs fail.

Evidence/job versions record their source `dictionary_version`. Evidence responses add `canonicalSkills`, `dictionaryVersion` and historical `skillLabels`; editing starts from the current canonical IDs. Job requirements add `sourceSkills` and current `skillLabels`; job responses distinguish current `dictionaryVersion` from `sourceDictionaryVersion`. A label update therefore cannot change the historical name used to describe a prior source observation.

Profile evidence cursors bind **both** the profile revision and dictionary version. Catalog cursors are invalidated by dictionary changes, and lexical search includes approved bilingual skill aliases through canonical projections. New profile/assessment/matching/learning/resume reports must store their exact dictionary version alongside their other inputs, reject stale publication/read and process dictionary invalidations. The outbox is durable; dispatch and downstream report/embedding processing remain module 12 and their owning modules' work.

Dictionary administration takes the catalog advisory lock, then an exclusive dictionary lock. Source-link inserts take a shared dictionary lock before resolving their canonical projection. Merge does not acquire owner locks or modify owner aggregate/history roots. This avoids an owner/dictionary lock cycle while serializing new links against merge. Future multi-module transactions must preserve the documented ordering rather than composing arbitrary nested mutations.

## Structure and checks

`SkillDictionaryService` and `SkillAdministrationService` depend on repository/authorization ports. Their Supabase/browser adapters and composition roots isolate provider details. Profile UI consumes a `SkillClient` for runtime choices; job detail labels arrive with the public projection. The static demo retains compatibility exports and its original vocabulary.

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test
npm run test:e2e
npm run build
NEXT_PUBLIC_BASE_PATH=/rolefoundry npm run build:pages
```

Tests cover JavaScript/SQL normalization, ambiguous and language-qualified lookup, bilingual snapshots, admin/owner isolation, alias conflicts, independent DAGs, immutable labels, optimistic races, cyclic merge rollback, redirects/track migration, source-versus-canonical links, deprecated history, dictionary-bound pagination, catalogue alias search and concurrent evidence/merge, and a registered replacement projection. Actual desktop/mobile browser checks create a runtime concept through admin UI, use it in private evidence and resolve it anonymously. Local fixture cleanup removes only its own current entries; historical snapshots remain immutable.

This implementation does not claim that editorial mappings have been validated by an industry panel or that semantic model suggestions are connected. Human review, live model evaluation and later end-to-end recommendation gates remain in the [complete audit](IMPLEMENTATION_AUDIT.md).
