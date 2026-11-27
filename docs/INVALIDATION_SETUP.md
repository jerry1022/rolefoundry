# Durable invalidation dispatch

The independent worker now consumes the existing profile and dictionary outboxes through a replaceable invalidation store. Matching, learning and resume own their version projections. Delivery cancels obsolete **queued** matching/learning/revision tasks before processing; it does not generate new analysis, change completed history, revoke a running task lease or make a provider call.

Immediate evidence-deletion purges, publication fencing and read-time freshness checks remain authoritative. This maintenance path is not a substitute for those privacy and version boundaries.

## Setup

Apply `20261114150000_invalidation_dispatch.sql` after the preceding migrations, then use the existing worker settings:

```bash
npm run identity:start
npx supabase migration up
npm run worker:local
```

There is no new secret, public route, provider or scheduler account. The normal worker polls this maintenance path before each task acquisition cycle. `--once`/`--drain` perform bounded maintenance alongside their existing task-queue acquisition limits; they do not promise to exhaust the invalidation backlog. Keep a normal worker running for eventual catch-up.

Review and apply hosted migrations separately from unreviewed PR deployment. This additive migration creates three delivery rows per existing profile/dictionary event and installs insert triggers for future events; inspect event counts and migration duration in staging before a large historical catch-up. The web's existing freshness/privacy boundaries continue to work while worker code or this migration is being rolled out. A missing/unavailable dispatch store logs a fixed unavailable code and does not prevent ordinary task processing.

## Delivery protocol

1. A producer commits its reference-only outbox event and three consumer receipts in the same transaction. Catch-up inserts are unique per event/consumer. There is no sequence watermark that can skip a lower ID committed after a higher one.
2. The service-only claim operation uses `FOR UPDATE SKIP LOCKED`, takes at most four eligible receipts and returns only UUID delivery IDs and opaque lease tokens. Each lease lasts 60 seconds. Producer owner IDs, evidence references and private content stay inside the database.
3. The dispatcher calls an independently owned consumer contract. Each consumer selects at most twenty obsolete queued tasks, with task-row locks and `SKIP LOCKED`. Profile events compare the exact owner and sealed profile revision; dictionary events compare the sealed dictionary version. Equality and newer versions are preserved.
4. The task-owned transition records `failed / RF_STALE_INPUT` and a safe `task.failed` event without incrementing execution attempts. It preserves sealed domain inputs and old completed results. Already-running tasks keep their lease and repeat existing source/version checks before publication. Assessment, parse, fixed-version PDF, ingestion and account tasks are outside these subscriptions.
5. The consumer effects and receipt completion commit together. Expiry is checked again after consumer execution; an expired lease rolls back both task changes and receipt state. A lost response cannot publish duplicate failure events: committed receipts are no longer claimable, and a repeated old token conflicts.
6. A locked queued task or a full partial batch leaves its receipt pending, releases its token and schedules another pass after one second. Infrastructure failure persists a safe `RF_UNAVAILABLE` retry with capped exponential backoff, at most 300 seconds. Attempts are retained; maintenance retries continue until completion rather than silently dropping an invalidation after three failures. Process crashes/cancellation leave outstanding claims to expire and be reclaimed with a new token.

Canceled queue messages remain task-ID-only and are archived by the normal terminal-task read path. The dispatcher does not acquire queue-message locks while holding task locks. Completing a delivery therefore establishes its domain cancellation, not immediate queue exhaustion. Owners must intentionally create a fresh request against current input; dispatch never silently restarts analysis.

## Replaceable boundaries and authority

`src/modules/invalidation` contains the lease/result schemas, narrow `InvalidationStore` port and injected `InvalidationDispatcher`. Only the Supabase adapter knows RPC names or SDK details. It validates bounded responses and uses a five-second deadline per RPC. The worker composition root selects that adapter. Domain/UI dependency checks cover the new core.

`matching_consume_invalidation`, `learning_consume_invalidation` and `resume_consume_invalidation` own their source joins and version comparisons. A task-owned private helper performs the terminal transition. These implementation helpers are not executable by browser or service roles directly; the security-definer delivery operation is the deliberate transaction boundary.

Only the worker service role can call `invalidation_claim`, `invalidation_apply` and `invalidation_retry`. All raw delivery-table grants are revoked, including service-role direct table access. Anonymous users, members and application administrators gain no new read/replay authority. The optional claim scope `p_ids` accepts one to four delivery UUIDs for controlled operator/integration runs, never as application request input; apply/retry still require a current fenced lease.

The receipt stores a source reference, consumer, attempts, availability/lease/completion timestamps and one safe error code. It copies no evidence text, URL, resume statement or contact data. Profile receipts cascade with their producer event on owner deletion; dictionary receipts follow dictionary-event history. Existing producer retention remains authoritative. Do not log tokens or owner/event references. Worker logs contain only `invalidation.dispatched` aggregate completion/cancellation counts or `invalidation.unavailable / RF_UNAVAILABLE`.

## Operator checks

Use an authorized database operator session, not browser credentials, for aggregate backlog inspection:

```sql
select consumer,
 count(*) filter (where completed_at is null) as pending,
 count(*) filter (where completed_at is null and lease_expires_at > now()) as leased,
 count(*) filter (where completed_at is null and safe_error is not null) as retrying,
 max(now() - created_at) filter (where completed_at is null) as oldest_pending
from public.invalidation_deliveries group by consumer;
```

If retries accumulate, check the reviewed migration, worker configuration and database health, then let the normal retry/expiry path recover. Do not reset attempts, delete unrelated receipts or bypass task/source checks to force completion. External metric export, alert routing, provider budgets/concurrency and future consumer/index integrations remain separate acceptance work.

## Verification

```bash
npm run typecheck
npm test
npm run architecture:check
npm run identity:test -- tests/identity/invalidation.integration.test.ts
npm run identity:test
```

Six injected-port unit cases cover bounded batches, aggregate outcomes, partial work, failure/retry persistence and cancellation. Ten actual local integration cases cover anonymous/member/admin/raw/helper denial, transactional rollback and late commits, all three domain cancellations, retained completed/current work, competing claims, null/wrong/expired/superseded tokens, persisted retry, locked-row partial delivery, a running publication guard, lease expiry during a deliberately delayed transaction, dictionary routing and owner-removal cascade. Dictionary-wide cancellation assertions run inside an explicitly rolled-back transaction so the test does not commit cancellations to unrelated developer work. The worker composition is also exercised by the existing real-process integration/image checks. See [verification scope](VERIFICATION.md) and the [remaining design gates](IMPLEMENTATION_AUDIT.md).
