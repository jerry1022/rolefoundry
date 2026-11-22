# Private account data exports

## Implemented workflow

A signed-in, active account can create, inspect, download and remove its own data archives from `/account/`. This is a personal data portability workflow, not a platform/database backup or a publisher-source export. Administrators use the same owner boundary; their role does not allow downloading another account's archive. No AI provider, analysis allowance, consent grant or new hosted account is required.

An export captures retained career records under the catalog/dictionary/owner locks in one database transaction, then atomically creates its authoritative task and task-ID-only PGMQ delivery. The independent worker builds a ZIP from that sealed snapshot and exact committed files. It validates every file's byte count and SHA-256, registers an artifact reference **before** writing, and publishes only under a current task lease, active owner and unexpired/uninvalidated snapshot. A failed request never silently omits oversized or unavailable committed files.

The module owns its authorization, repository, execution, archive and storage ports. Supabase, ZIP and browser adapters are selected by composition roots. Core rules/handlers import no Next or storage/provider SDK. The ZIP library already used by document tests is now a pinned production dependency so the independent worker image includes it.

## Setup

1. Follow [identity setup](IDENTITY_SETUP.md), apply `20261114105000_account_exports.sql` through the existing reviewed migration procedure, and deploy compatible web/worker code. This creates a private `rolefoundry-account-exports` bucket, two RLS-protected application tables and tightly granted functions.
2. Start the configured web server with `npm run identity:dev` and the actual worker with `npm run worker:local`. Hosted workers use their existing server-only Supabase settings and `Dockerfile.worker`; no new secret is introduced.
3. Sign in at `/account/`, choose **Create private account export**, wait for **ready**, and choose **Download account archive**. A bounded polling loop observes pending work; refresh manually if it stops. Leaving the page does not cancel durable work.
4. **Remove account archive** cancels pending publication and immediately denies new downloads of that archive. Physical cleanup runs in the independent worker; a minimized history entry remains until retention cleanup. Removing an archive does not delete its source records or the account.
5. Run `npm run identity:test -- tests/identity/account-data.integration.test.ts` against the owned local stack for executable acceptance evidence. The suite creates and removes only its own users, records and files.

The repository applies no migration to a hosted database from a pull request. Static/demo builds keep live account controls disabled. Verify private bucket policies, web/worker identity alignment, upload/download transport at intended artifact sizes, expiry and cleanup in the intended hosted environment before a real-person pilot; local streaming transport and a successful preview build do not prove hosted file-size/performance behavior.

## Archive format and scope

The ZIP contains `account.json` with `schemaVersion: 1`, a snapshot timestamp, owner identity, retained records and a file manifest. Auth identity includes only owner contact/verification timestamps, user-supplied metadata and provider identity labels/timestamps. Password hashes, access/refresh tokens, sessions and server/provider credentials are not read. Shared catalogs, third-party editorial/source ingestion data, internal request hashes/keys, lease tokens, upload permits and other accounts' private records are excluded.

The thirty-two record groups cover preferences, consent history, usage reservations, evidence and historical versions, skill mappings/claims, portfolio references, bookmarks, assessment attempts/items/answers/results, matching inputs/results/gaps, learning plans/steps/progress/practice, resume documents/versions/claim links/proposals/export references, applications/events/follow-ups, safe task/analysis history, archive history and owner account activity. Historical content exists only where the source module retains it; export does not reconstruct erased records. Shared question/rubric/dictionary/catalog definitions remain referenced by version/ID rather than copying restricted answer banks or the entire platform.

Committed resume source PDFs/DOCX and completed generated PDFs are copied byte-for-byte to deterministic `files/<document-id>/...` paths. Original filenames remain in document metadata; user filenames never determine archive paths. The manifest contains path, byte count and SHA-256, not internal storage locations or download credentials. Pending/uncommitted uploads are represented by their document state but have no committed file to include. Expired/deleted sources and previous account ZIPs are not recursively packaged.

## Bounds, expiry and privacy

- At most one unexpired pending export and three distinct requests in a rolling 24 hours. Concurrent uses of the same idempotency key return the same request. Removal/failure does not reset the daily limit.
- A snapshot is bounded to 16 MiB of JSON, 100 committed files and 48 MiB of raw files; the final ZIP is bounded to 64 MiB. Bounds reject the whole operation instead of returning an apparently complete partial archive. Large real accounts may require an independently designed multipart/offline portability workflow; no such workflow is claimed here.
- Availability expires 24 hours after request. Every download checks the current owner, expiry, task outcome and invalidation before reading Storage and again before returning bytes, and verifies artifact integrity. Responses stream through the private server with `no-store`; no reusable public URL is issued. Data already downloaded or a response already authorized cannot be recalled.
- Deleting evidence, resume sources, bookmarks, assessments, matching/learning plans, practice, applications or follow-ups invalidates retained archives for that owner. Deactivation/hard owner deletion does the same. Pending snapshots are erased and leases canceled before late publication can succeed. Ordinary edits preserve a dated snapshot; remove an archive explicitly when that copy is no longer wanted.
- Committed archives become due for deletion at expiry/removal. Uncommitted writes retain a reference until their 30-second write window plus a two-minute grace has elapsed. Reference-only cleanup rows survive source/account deletion, lose owner/export FKs and are leased/retried independently. Cleanup requires a running worker and functioning Storage; availability expiry is immediate, physical deletion is eventual.
- Worker cleanup clears expired snapshot payloads and removes history older than 30 days only after its artifact references are gone. Audited request/download/removal actions use existing identity audit metadata. Backup retention/erasure remains a separate [operations recovery gate](OPERATIONS_RECOVERY.md).

## Remaining account lifecycle work

The export flow is implemented; self-service account deletion is still pending. A complete deletion coordinator must durably track work after Auth/profile removal, block new sessions/work immediately, reconcile outstanding writes and file cleanup, remove remaining identifying records and apply a minimized deletion ledger during restore. Existing hard-deletion and deactivation guards plus the new artifact janitor are prerequisites, not a claim that the full lifecycle has been delivered. See [the complete design audit](IMPLEMENTATION_AUDIT.md).

## Browser evidence

The real local acceptance suite captures the [mobile account export controls](assets/account-export-mobile.png) with synthetic accounts/data. Linux worker archive integrity is independently exercised by `node scripts/check-account-worker-image.mjs rolefoundry-worker:ci`; it does not use credentials or contact a provider.
