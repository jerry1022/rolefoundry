# Course link observations

An optional, independent checker sends one bounded HTTPS `HEAD` request at a time to published course links from deployment-approved sources. It records a minimal observation category and status code. It never reads response bodies, follows links outside the approved host set, refreshes editorial review, rewrites course versions or changes learner progress/evidence.

A failed observation moves an `available` published course to `uncertain` and records an audited catalog event (`course.link_uncertain`). Only a human reviewer can restore availability through the existing reviewed course editor. A successful observation never promotes availability or extends `last_reviewed_at`.

## Configure

Apply `20261114180000_course_link_checks.sql` after the prior migrations. It adds two service-only tables (`course_link_hosts`, `course_link_checks`) with RLS enabled and no client grants, the service-role `course_links_claim`/`course_links_complete` RPCs, administrator `course_links_admin`/`course_links_resume` RPCs and course-link fields in the existing telemetry snapshot.

| Environment | Bounds/default | Meaning |
| --- | --- | --- |
| `ROLEFOUNDRY_COURSE_LINK_SOURCES` | JSON array, at most 20 entries/32 KiB; default `[]` | `{ "sourceId": "<uuid>", "allowedHosts": ["learn.example.com"] }` per approved course source |
| `SUPABASE_URL` | HTTPS, or HTTP only on loopback | Same project as the web/worker hosts |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret manager only | Service role; never a browser variable |

The empty default performs no network check. The policy is authoritative: the database also requires an active source whose own allowed hosts and the provider's allowed hosts both contain every listed host, so a deployment policy cannot widen reviewed source permissions. Duplicate source IDs, malformed hostnames and oversized JSON fail closed before client construction; error messages never print configuration.

Run locally against the fixture stack (it refuses non-loopback credentials):

```bash
npm run identity:start
npx supabase migration up
ROLEFOUNDRY_COURSE_LINK_SOURCES='[{"sourceId":"<reviewed source uuid>","allowedHosts":["learn.example.com"]}]' npm run courses:check:local -- --once
```

Without `--once` the process ticks every five seconds until `SIGINT`/`SIGTERM`. For a hosted deployment, build `Dockerfile.course-links` and run one long-lived container with the settings above. It is separate from the web server and task worker so a provider slowdown cannot occupy worker slots. CI builds the image and verifies both the missing-configuration guard and empty-policy startup.

## Request safety

- Only `https://` URLs on an approved host, without userinfo, port, query, fragment, IP literal, trailing dot or local/internal suffix, are eligible. Validation happens before DNS.
- Every resolved address must be public; mixed public/private, IPv4-mapped/special IPv6, empty or more than 64 results are blocked. The connection is pinned to the checked address with TLS verification against the original hostname, so no second unpinned lookup occurs.
- Requests send no cookie or authorization header, use `Accept-Encoding: identity`, a fixed user agent, an 8 KiB header limit, a 5-second socket deadline and a 10-second total deadline. The response is destroyed immediately after status/`Location`/`Retry-After` are read.
- At most three redirects are followed. Each target is revalidated and resolved again; loops, escapes to unapproved hosts and overlong chains are recorded as `redirect`/`blocked`. There is no fallback to `GET`. A final redirect URL is never stored.

Status mapping: 2xx `ok`; 404/410 `not-found`; 405/501 `unsupported`; 401/403 `access-denied`; 429 `rate-limit`; 5xx `server-error`; other `http-error`; malformed status `invalid-response`; deadline `timeout`; transport failure `network`.

## Cadence and concurrency

Admission is shared in PostgreSQL rather than per process. Each claim locks the requested hosts in sorted order and is refused while any host is paused or inside its next-probe window (at least 60 seconds after any claim/completion). Course rows are selected with `skip locked` and a 30-second lease token. Completion repeats the same publication locks as human course edits, and discards the observation (with a one-hour back-off) when the lease expired, the course was retired or revised, the published version changed or the source was withdrawn. Successful observations recheck after 24 hours.

`Retry-After` on 429/5xx is persisted to both the course and host; a later human revision never shortens it. A date beyond the representable range or an unparseable wait sets an administrator-visible manual pause instead of retrying early. The checker rotates source admission so one continuously due source cannot starve the others.

## Administration and monitoring

The private `/admin/` workspace (API `GET /api/v1/admin/courses/link-checks` and `POST /api/v1/admin/courses/link-checks/resume`) shows a **Course link observations** section: up to 50 published-version observations and 50 hosts per page with independent cursors, current reason/status/check times and host waits. An administrator can clear a manual pause with a reason and expected revision; the action is audited in `course_audit`, conflicts on concurrent changes and never shortens a provider wait. The panel clears when administrator access is lost.

The telemetry exporter adds `rolefoundry_course_link_metrics_available` plus `rolefoundry_course_links_{checked,uncertain,unprobed,paused_hosts,oldest_check_seconds}`. Alert rules `RoleFoundryCourseLinkReviewNeeded` (uncertain observations for 10 minutes) and `RoleFoundryCourseLinkHostPaused` (paused hosts for 5 minutes) are covered by `ops/observability/alerts.test.yml`. These are observation counts, not editorial review.

## Verify

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/course-links.integration.test.ts
```

Twelve unit cases exercise address pinning, pre-DNS rejection, mixed/special DNS results, redirect revalidation/loops/limits, status categories, long and unrepresentable `Retry-After`, hung DNS/HEAD deadlines, cancellation, overlapping ticks, policy authority over replacement stores and fair source rotation. Eight integration cases use real PostgREST/PostgreSQL and the production web build: raw/client claim denial and administrator protection, shared host admission across concurrent instances with forged/duplicate result rejection, expired lease reclamation without late overwrite, the real checker/store against an injected HEAD transport with immutable content, discard after withdrawal/retirement/revision, persisted waits and audited recovery, mobile administrator rendering with access-loss clearing, and bounded pagination.

No test contacts a real course provider. Running against a real provider requires its permission and reviewed source records; hosted scheduling, notification ownership and real catalog review remain [release gates](IMPLEMENTATION_AUDIT.md).
