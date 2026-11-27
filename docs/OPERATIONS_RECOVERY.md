# Operations recovery — local database rehearsal

Module 13 is in progress. The repository now has an executable **local PostgreSQL recovery rehearsal** and a deliberate failure-cleanup check. They establish recovery of the project's database records, authorization configuration and queue state into a disposable database in the same cluster. A separate post-backup deletion mode also runs isolated Auth, REST and file-backed Storage services against the restored database, verifies one controlled PDF and re-applies a newer deletion ledger through the existing erasure handler. These checks do not establish hosted disaster recovery, recovery after losing the cluster, or a general object backup service.

## Run the implemented rehearsal

From the repository root, with Node 24, locked development dependencies and Docker available:

```bash
npm run identity:start
npx supabase migration up
npm run recovery:local
npm run recovery:local -- --verify-failure-cleanup
npm run recovery:local -- --verify-deletion-replay
npm run recovery:local -- --verify-deletion-replay-failure
npm run recovery:test
```

The commands use only the project stack `rolefoundry-identity`: loopback PostgreSQL on port 54322 and the `supabase_db_rolefoundry-identity` container. The connection comes from the ignored local environment file created by the identity helper. Hosted URLs, another database name, a different project ID, symlink environment/destination directories and unsupported arguments are rejected. No model/provider credential is needed.

Run a rehearsal separately from integration tests, migrations and active mutating development work. The exported transaction snapshot keeps table data consistent; PostgreSQL sequence counters are not transactional, so concurrent writers can legitimately advance them and make the strict comparison fail. The normal and external-ledger modes never modify source rows. The deletion-replay modes create and remove one owned synthetic identity/file/request in the source; sequence counters and minimized Auth audit history can advance. No mode stops unrelated containers, resets the project, restores over the source database or changes application connection settings.

## What the tool does

1. Open a read-only repeatable-read transaction and export its snapshot. Capture row counts/content fingerprints, table owners/grants, RLS flags/policies, public routine definitions/owners/grants, constraints, triggers, sequence state and installed extension versions for `public`, `auth`, `storage`, `pgmq` and `supabase_migrations`.
2. Write a custom-format database archive and a separate queue sidecar from that same snapshot. Files live in an ignored, owner-only `.local/recovery/<run-id>/` directory. Credentials and row contents are never printed.
3. Create a uniquely named `rf_restore_<run-id>` database with an ownership marker. Restore with the existing local `supabase_admin` role so original object owners/grants are retained; do not suppress ownership or ACL errors.
4. Recreate the project's logged, non-partitioned `rolefoundry_tasks` queue in the isolated target. Restore metadata, queued/archived rows and its sequence without detaching or altering source extension members.
5. Compare the restored tables and security metadata against the source snapshot. Equivalent ACL entry ordering is normalized. Row fingerprints preserve nested content and duplicate rows. Send and archive a synthetic message only in the restored queue, checking the next message ID and payload round-trip.
6. Close target connections, verify the generated database name and marker, drop only that owned database and remove the database archive and queue sidecars. Retain a metadata-only report with outcome, elapsed time and check counts.

The installed local PGMQ version omits queue tables/data from an ordinary `pg_dump`, including a table-selected dump. The rehearsal detected this omission and explicitly supplements it. This behavior must be rechecked when upgrading the extension; the queue adapter refuses unfamiliar queue names, unlogged queues or partitioned layouts rather than pretending they were restored. PostgreSQL documents that extension members and their configuration data need deliberate backup handling: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [extension configuration relations](https://www.postgresql.org/docs/17/extend-extensions.html). Queue APIs are documented by [Supabase PGMQ](https://supabase.com/docs/guides/queues/pgmq).

Code boundaries:

- `scripts/recovery/local-rehearsal.mjs`: local target checks, backup/restore orchestration and owned-resource cleanup.
- `scripts/recovery/postgres-snapshot.mjs`: comparable database/security metadata and content fingerprints.
- `scripts/recovery/queue-snapshot.mjs`: version-scoped queue export/restore behind a separate boundary.
- `scripts/recovery/deletion-ledger.mjs`: bounded private-file validation and a narrow ledger application port.
- `scripts/recovery/isolated-services.mjs`: installed image reuse, target-only DB connections, loopback ports, fresh file storage and ownership-checked cleanup.
- `scripts/recovery/deletion-fixture.mjs`: owned synthetic source deletion and actual restored-service acceptance checks.

The normal/external-ledger modes start no restored services. The deletion-replay modes start only three newly owned services against the disposable target and execute only the fixture's accepted erasure. They never start a feed scheduler, general worker, publisher or model client, and never drain unrelated restored or source tasks.

## Results and failures

A successful command exits zero and prints a private report path. The normal report records the checks that actually passed. The `--verify-failure-cleanup` command intentionally fails after creating/marking the disposable database, then returns success only if cleanup completed; its report is labelled `cleanup-verified`, not a successful restore.

A real restore/comparison/cleanup failure exits nonzero. A host crash or forced process kill can interrupt cleanup; inspect the private run directory and exact database ownership marker before removing only that run’s artifacts, and keep restored services disconnected. Comparison diagnostics contain only table/section names, changed metadata categories and counts. Raw database diagnostics can contain sensitive information and remain in owner-only ignored files; never upload that directory to CI artifacts or a public issue. Archives/sidecars are removed on both normal and error exits. A cleanup error is reported rather than hidden. If cleanup cannot verify ownership, it leaves the target for operator inspection instead of dropping a guessed database. Never apply a generic `rf_restore_*` purge to other people's environments.

The pre-overlay checkpoint recovered **142 tables, 19 policies and 311 public routines**, including actual queue archives, and passed the isolated send/archive probe and failure-cleanup mode. The current overlay checkpoint recovers **144 tables, 19 policies and 328 public routines** and additionally verifies the controlled service deletion path. Counts change as migrations evolve. Elapsed time in the report describes this local run, not a production recovery-time promise. CI runs normal recovery, both failure-cleanup modes and the post-backup deletion check after the identity integration suite while its owned stack is still running.

## Apply newer deletion intent before reconnecting users

Apply `20261114120000_restore_deletion_ledger.sql` through the reviewed migration process. A trusted operator may rehearse an externally retained version-1 ledger:

```bash
npm run account:ledger -- --output .local/deletion-ledger/ledger-2026-11-23.json
npm run recovery:local -- --deletion-ledger .local/deletion-ledger/ledger-2026-11-23.json
```

This validates the selected ledger and applies it **after** comparing the restored snapshot, in a newly owned disposable target. It does not overwrite the source, connect users or run those queued erasures. The report distinguishes overlay counts/digests from executed erasure. The target is removed at the end, so this is a rehearsal rather than a production cutover command. Use `--verify-deletion-replay` for actual end-to-end cleanup of a controlled fixture.

The file must be an owned, single-link regular file with private permissions, inside a private directory without symlink components. The parser rejects unknown fields, duplicate request/subject IDs, invalid timestamps/chronology, more than 10,000 entries and files larger than 8 MiB. SQL repeats validation and applies the whole ledger atomically. Conflicting request/subject history rejects the complete overlay; do not silently discard conflicts or split a ledger to evade bounds. Larger production retention requires an explicitly designed import protocol.

`recovery_apply_deletion_ledger` is service-only and additionally requires an exact generated database name, run ID and database ownership comment. Even service/root calls on the live local database fail. This local ownership guard is not a hosted import capability or authentication of a ledger's contents: the operator must independently establish provenance, completeness and integrity. The report records both the file SHA-256 and PostgreSQL-normalized ledger digest. The target retains one minimized `recovery_deletion_overlays` audit row per run/digest and coded request/task events.

Each affected restored subject is blocked by its deletion marker, old ordinary tasks are invalidated and an audited erasure task/grant survives profile removal. Private profile/business records cascade immediately. The live and restored paths share one audit minimization helper, invoked before FK links disappear, so private free-form audit reasons are cleared. File references are detached while preserving canonical cleanup keys, persisted write grace is retained, and Auth/Storage are removed through their actual service APIs. Restored workers and users must remain disconnected until all accepted erasures finish; an `unchanged` overlay result can still mean an already pending erasure, not completed cleanup. Completed markers remain completed only when Auth, profiles and registered/canonical or owner-linked objects are absent.

A pre-request backup has no receipt hash. The minimal ledger intentionally excludes that hash and cannot restore private receipt status for such requests. Use the audited operator task/request status; do not invent a new owner secret or allow account reactivation. A ledger already present in the snapshot preserves its existing receipt digest.

### What the controlled service rehearsal proves

1. Create only a synthetic local Auth identity, activate it, store private preferences and register a generated PDF. Capture the database/queue snapshot before deletion.
2. After the archive is complete, accept and finish that fixture's live deletion through actual service adapters. Save its newer minimal ledger separately from the archive.
3. Restore and compare the original snapshot. Start the installed GoTrue/PostgREST/Storage images with rewritten target-only database URLs, disabled external providers/hooks/SMTP, random loopback host ports and a new anonymous file-storage volume. Source volumes are never mounted.
4. Reproduce the old token's private read and restored Auth user. Upload only the controlled backed-up PDF into the isolated store and verify the downloaded byte hash.
5. Reject source/wrong-run application, browser-role execution, invalid ledgers and a conflicting batch; verify that conflict rolls back all earlier entries. Apply twice and confirm a single pending task/audit record, immediate old-token RLS denial, profile/private cascade and forbidden reactivation even with a new invitation.
6. Clean only the fixture's references, execute its erasure with a current lease through actual Auth/Storage/REST adapters, and verify removed Auth users/sessions/identities, private records, metadata/references and download access. Reapplication to the clean completed target is idempotent.
7. Remove owned services/anonymous storage volumes **before** dropping the marked target, and remove private env/archive/ledger files on success and failure. Only owned source fixtures are removed. Service cleanup failures preserve the disconnected target for inspection.

`--verify-deletion-replay-failure` deliberately interrupts after service startup and succeeds only after owned service/database/file cleanup. Reports retain counts/checks/digests, not subject IDs, JWTs, keys or file content. An uncatchable host/process failure still needs the manual owned-resource inspection above. This single controlled PDF establishes the tested deletion path, not backup completeness or a general production object restore procedure.

## Storage and full-environment recovery gates

Database restoration recovers Storage **metadata**, not private PDFs/DOCX or exported PDF bytes. Supabase explicitly distinguishes these in its [backup documentation](https://supabase.com/docs/guides/platform/backups). A complete recovery procedure still needs an independently protected object backup, an object/version manifest, an isolated restore test and validation of private download/deletion behavior.

Before a real-person pilot, complete and record these remaining gates:

| Gate | Required evidence |
| --- | --- |
| Intended hosted target | Separate staging/production ownership, selected backup method, encrypted off-site retention, restore access and configured backup expiry |
| Recovery objectives | Agreed acceptable data loss (RPO) and downtime (RTO), with measured rehearsals at representative database/object sizes |
| Clean environment | Extension versions, cluster roles/global settings, role passwords, Auth/SMTP redirects/hooks, secrets and network configuration restored in a separate environment |
| Database and objects | A consistent database/object recovery point, byte/manifest checks, private bucket policies and owner-only export/download behavior |
| Deletion after the backup | A minimized deletion/revocation ledger outside the restored snapshot, applied before users or workers regain access; backup expiry documented without promising immediate removal from immutable copies |
| Queue and source safety | Workers/schedules initially disabled; authoritative task/owner/source/input states checked; completed, deleted-owner and stale tasks cannot be replayed as new work |
| Operational acceptance | Synthetic sign-in, consent/revocation, profile/evidence, reviewed catalog, fixed resume export, deletion/cleanup and audit checks against the restored environment |

A queue archive is delivery history, not permission to re-run a task. Production replay must use an audited domain operation that preserves history and revalidates current authority. [Audited domain recovery](TASK_REPLAY_SETUP.md) now creates a guarded new execution without resending old deliveries. Authoritative off-host ledger delivery/hosted application, telemetry/alerts and representative object/recovery rehearsal remain module 12/13 work; this local command does not mark those requirements complete. Pull-request CI changes no hosted database and never deploys migrations to production.

[Live account deletion](ACCOUNT_DELETION_SETUP.md) now completes through the actual Auth/Storage/task workflow and can export minimized local deletion markers. The retained ledger must be protected outside the restored snapshot and replayed before reconnecting users/workers. The local overlay and controlled service rehearsal above are implemented; authoritative off-host durability and hosted cutover remain unproven.
