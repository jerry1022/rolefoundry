# 03 — Job catalog and search

## Responsibility

Publish discoverable, source-traceable AI-related roles. Keep source records distinct from canonical jobs so duplicate postings can share a single opening without losing provenance. Support browsing without a profile.

## Current scaffold

Eight fictional openings demonstrate four career tracks, workplace filters, AND keyword search, local bookmarks, detail dialogs and skill-overlap sorting. Employers, salaries and posting labels are explicitly illustrative. `FixtureJobRepository` returns cloned records to prevent accidental fixture mutation.

## Data and interfaces

Jobs have both a broad assessment `track` and a primary `specialization` with a stable ID from the career-path catalog. The original nine specializations remain browsable even with no openings; design/content adds a tenth direction. Each has a work description, learning sequence, evidence suggestions and a project example. Keyword search includes canonical specialization names and reviewed bilingual aliases. See [career classifications](../CAREER_PATHS.md).

Target records: `companies`, `jobs`, `job_sources`, `job_requirements`, `job_skill_links` and owner-scoped `bookmarks`. Store source job ID, original link, rights basis, first/last observation, last successful validation and status. Salary amount, currency and interval are separate fields; undisclosed salary is null, never zero. Requirements distinguish mandatory from preferred.

`GET /jobs` accepts `q`, `track`, `workplace`, location, level and cursor. `GET /jobs/{id}` returns only published content. Bookmark operations require identity. Search results include source freshness and do not claim complete market coverage.

## Search flow

1. Filter to published, active jobs.
2. Apply explicit structured conditions; unknown values remain distinguishable.
3. Normalize skill aliases and search role/company/content fields.
4. Retrieve semantic candidates when embeddings are available.
5. Rank deterministically with stable ID tie-breaking, or use the matching service for personalized ranking.
6. Return cursor pagination and applied-filter metadata.

The production ranking recipe is versioned. Chinese relevance is evaluated on a bilingual dataset before selecting additional text-search extensions. Embedding failure falls back to lexical and structured search.

## Lifecycle and failures

Statuses are draft, review, published, expired and rejected. A source fetch failure marks freshness uncertain; explicit closure or reviewed expiry retires a job. Historical application records retain their title/source snapshot after closure. A missing original salary or work-authorization field is labeled unknown. No automatic application is triggered by viewing or bookmarking.

## Acceptance tests

Verify bilingual aliases, combined filters, stable pagination, no duplicate canonical openings, undisclosed salaries, source closure and network failure. Check that retired jobs are excluded from recommendations while historical tracking remains readable. Ensure private bookmarks cannot be enumerated by another user.
