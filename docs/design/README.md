# Detailed module designs

These designs describe the production target. Modules 01–05 have server implementations; the durable worker core supports assessment grading; remaining modules have the partial/demo status documented in each design. See the [delivery order and dependency contract](../MODULE_DEVELOPMENT.md). The **current scaffold** sections identify executable behavior. Do not interpret a designed endpoint or database table as implemented.

| Design | Module |
| --- | --- |
| [01](01-identity-access.md) | Identity, access, consent and quotas |
| [02](02-profile-evidence.md) | Profile and capability evidence |
| [03](03-job-catalog-search.md) | Job catalog, search and bookmarks |
| [04](04-skill-dictionary.md) | Canonical skills and aliases |
| [05](05-assessment.md) | Assessments, rubrics and scoring |
| [06](06-matching-gaps.md) | Matching and gap analysis |
| [07](07-courses-learning.md) | Course catalog and learning plans |
| [08](08-resume-studio.md) | Resume parsing, revision and export |
| [09](09-application-tracking.md) | Application tracking |
| [10](10-ingestion.md) | Source ingestion and review |
| [11](11-ai-gateway.md) | Model and embedding gateway |
| [12](12-worker-tasks.md) | Background task execution |
| [13](13-admin-operations.md) | Administration, security and operations |

Shared conventions: IDs are opaque strings; stored timestamps are UTC; public publication and private ownership are different access rules. The API namespace is `/api/v1`. All mutating production operations derive the owner from the authenticated session, never from a trusted client-provided user ID. See [API](../API.md) and [data model](../DATA_MODEL.md).
