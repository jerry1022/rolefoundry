# 04 — Skill dictionary

## Responsibility

Provide stable shared identifiers for jobs, claims, questions, course outcomes and practice evidence. This is the primary join layer of the platform; free-text similarity alone must not become the source of truth.

## Current scaffold

Nine canonical skill IDs and English display names live in `src/modules/skills/catalog.ts`, with compatibility re-exports from `domain.ts`. Module 02 seeds the same stable IDs in `skills` for evidence foreign keys; aliases, relations, dictionary versions and admin workflows remain planned. The union type prevents arbitrary identifiers from silently entering state. The skill catalog service has `resolveAlias` and `list` ports, without a production adapter.

## Target data

`skills(id, name_en, name_zh_tw, description, status)`, `skill_aliases(skill_id, locale, normalized_alias)`, `skill_relations(parent_id, child_id, relation)` and `track_skills(track_id, skill_id, priority)`. Skill IDs never change when labels change. Aliases have a unique normalized locale/key pair; ambiguous terms can remain unresolved for review.

## Resolution flow

1. Normalize whitespace, case and supported punctuation without discarding meaningful symbols.
2. Resolve a direct canonical ID or exact alias.
3. Return unresolved/ambiguous terms for review rather than guessing.
4. Use semantic suggestions only to assist administrators.
5. Publish approved mappings with a dictionary version.

Initial relationship kinds are broader-than and prerequisite. Do not infer that knowing a parent skill proves every child skill. Prevent prerequisite cycles. A skill merge retains old identifiers as redirects and migrates links transactionally; deprecation preserves historical reports.

## Administration and failure behavior

Only administrators may create aliases or merge concepts. Reject duplicate aliases, unknown relation types and cycles. A new imported skill phrase can be stored as unmapped source text until review, so ingestion is not forced to invent an identifier. Course outcomes are editorial mappings and should retain review provenance.

## Acceptance tests

Verify alias normalization, ambiguous input, English/Traditional Chinese labels, cycle rejection, merge redirects, historical dictionary versions and stable references across label changes. Audit mapping changes that materially alter matching results.
