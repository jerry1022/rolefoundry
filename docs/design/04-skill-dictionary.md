# 04 — Skill dictionary

## Responsibility

Provide stable shared identifiers for jobs, claims, questions, course outcomes and practice evidence. This is the primary join layer of the platform; free-text similarity alone must not become the source of truth.

## Implementation status

Implemented for configured deployments: public bilingual dictionary and historical snapshots, exact normalized ID/alias resolution, ambiguity handling, administrator-reviewed label/alias/relationship/track operations, cycle rejection and historical-safe merges. The `/dictionary/` screen supports public browsing/resolution and role-verified administrator controls. See [setup and API](../SKILL_DICTIONARY_SETUP.md).

Profile/job production IDs are extensible and validated against the database registry; their UI/read models consume runtime labels. Immutable versions retain source IDs and dictionary versions; mutable canonical join projections migrate transactionally on merge. Profile/catalog cursors detect dictionary changes. Original demo storage keeps its seed-only enum.

## Static demo compatibility

Nine canonical skill IDs and English display names live in `src/modules/skills/catalog.ts`, with compatibility re-exports from `domain.ts`. Module 02 seeds the same stable IDs in `skills` for evidence foreign keys. The public dictionary now adds aliases, relations, immutable versions and admin operations. The static union protects demo storage, while production schemas validate extensible ID shapes and relational existence separately. `SkillDictionaryService.get/resolve` and the administration service use replaceable repository ports.

## Target data

`skills(id, name_en, name_zh_tw, description, status)`, `skill_aliases(skill_id, locale, normalized_alias)`, `skill_relations(parent_id, child_id, relation)` and `track_skills(track_id, skill_id, priority)`. Skill IDs never change when labels change. Aliases have a unique normalized locale/key pair; ambiguous terms can remain unresolved for review.

## Resolution flow

1. Normalize whitespace, case and supported punctuation without discarding meaningful symbols.
2. Resolve a direct canonical ID or exact alias.
3. Return unresolved/ambiguous terms for review rather than guessing.
4. Use semantic suggestions only to assist administrators.
5. Publish approved mappings with a dictionary version.

Initial relationship kinds are broader-than and prerequisite. Do not infer that knowing a parent skill proves every child skill. Prevent prerequisite cycles. A skill merge retains old identifiers as redirects and migrates canonical join projections and mutable mappings transactionally. Original immutable source links and historical dictionary snapshots stay intact; deprecation preserves those historical inputs. New reports record their dictionary version and must satisfy the later module publication/deletion gates.

## Administration and failure behavior

Only administrators may create aliases or merge concepts. Reject duplicate aliases, unknown relation types and cycles. A new imported skill phrase can be stored as unmapped source text until review, so ingestion is not forced to invent an identifier. Course outcomes are editorial mappings and should retain review provenance.

## Acceptance tests

Verify alias normalization, ambiguous input, English/Traditional Chinese labels, cycle rejection, merge redirects, historical dictionary versions and stable references across label changes. Audit mapping changes that materially alter matching results.
