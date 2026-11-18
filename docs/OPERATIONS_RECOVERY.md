# Operations recovery — local database rehearsal

Module 13 is in progress. The repository now has an executable **local PostgreSQL recovery rehearsal** and a deliberate failure-cleanup check. They establish recovery of the project's database records, authorization configuration and queue state into a disposable database in the same cluster. They do not establish hosted disaster recovery, recovery after losing the cluster, or restoration of Storage object bytes.

## Run the implemented rehearsal

From the repository root, with Node 24, locked development dependencies and Docker available:

```bash
npm run identity:start
npx supabase migration up
npm run recovery:local
npm run recovery:local -- --verify-failure-cleanup
```

The commands use only the project stack `rolefoundry-identity`: loopback PostgreSQL on port 54322 and the `supabase_db_rolefoundry-identity` container. The connection comes from the ignored local environment file created by the identity helper. Hosted URLs, another database name, a different project ID, symlink environment/destination directories and unsupported arguments are rejected. No model/provider credential is needed.

Run a rehearsal separately from integration tests, migrations and active mutating development work. The exported transaction snapshot keeps table data consistent; PostgreSQL sequence counters are not transactional, so concurrent writers can legitimately advance them and make the strict comparison fail. The tool does not stop unrelated containers, reset the project, restore over the source database or change application connection settings.

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

No running Auth, API, application worker or feed scheduler is pointed at the restored database. The queue probe invokes only PostgreSQL send/archive functions; it does not execute a restored task or contact a publisher/model.

## Results and failures

A successful command exits zero and prints a private report path. The normal report records the checks that actually passed. The `--verify-failure-cleanup` command intentionally fails after creating/marking the disposable database, then returns success only if cleanup completed; its report is labelled `cleanup-verified`, not a successful restore.

A real restore/comparison/cleanup failure exits nonzero. A host crash or forced process kill can interrupt cleanup; inspect the private run directory and exact database ownership marker before removing only that run’s artifacts, and keep restored services disconnected. Comparison diagnostics contain only table/section names, changed metadata categories and counts. Raw database diagnostics can contain sensitive information and remain in owner-only ignored files; never upload that directory to CI artifacts or a public issue. Archives/sidecars are removed on both normal and error exits. A cleanup error is reported rather than hidden. If cleanup cannot verify ownership, it leaves the target for operator inspection instead of dropping a guessed database. Never apply a generic `rf_restore_*` purge to other people's environments.

The local checkpoint recovered **135 tables, 19 policies and 272 public routines**, including actual queue archives, and passed the isolated send/archive probe and failure-cleanup mode. Counts change as migrations evolve. Elapsed time in the report describes this local run, not a production recovery-time promise. CI runs both commands after the identity integration suite while its owned stack is still running.

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

A queue archive is delivery history, not permission to re-run a task. Production replay must use an audited domain operation that preserves history and revalidates current authority. The administrator replay interface, full account export/deletion lifecycle, telemetry/alerts and hosted object/recovery rehearsal are still module 12/13 work; this local command does not mark those requirements complete. Pull-request CI changes no hosted database and never deploys migrations to production.
