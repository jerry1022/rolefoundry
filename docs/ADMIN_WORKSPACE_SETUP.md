# Consolidated administrator workspace

## Delivered behavior

Configured `/admin/` now provides one verified workspace for skills/aliases, immutable assessment questions/rubrics, invitations/allowances/refunds, authorized source review, task diagnostics/recovery and accepted account-deletion recovery. Each panel uses an independently replaceable domain client. Skills and assessments reuse their existing editors and validation services; invitations and allowances share the same component with `/account/`. The static public demo retains its existing fixture inspector.

## Setup and operator flow

Use the existing [identity setup and administrator bootstrap](IDENTITY_SETUP.md). No new hosted account, provider key or browser secret is needed:

```bash
npm run identity:start
npx supabase migration up
npm run identity:dev
```

The new migration is `20261114140000_identity_admin_directory.sql`. It adds bounded administrative reads, unused-invitation revocation and a paging index. Hosted deployments require the reviewed migration/deployment procedure; PR builds do not migrate production. Existing URL/anon/service settings remain documented in [configuration](CONFIGURATION.md). Run the existing worker separately for [background task recovery](TASK_REPLAY_SETUP.md), imports or erasure; editing the dictionary/question bank or managing an invitation does not start a worker.

Sign in as a verified administrator and open `/admin/`:

| Panel | Operations and safeguards |
| --- | --- |
| Skills and aliases | Reused bilingual dictionary editor, exact lookup, historical snapshots, canonical labels/status, aliases, DAG relationships, track mappings and reviewed merges/removals; expected dictionary version and audit reason remain mandatory |
| Assessment questions and rubrics | Reused immutable authoring, correct-answer review, explicit review/retirement for future selection; existing attempts keep their source versions and answers remain administrator-only until owner feedback completes |
| Invitations and allowances | Create/reissue an unused invitation, inspect minimized paged records, revoke an unused invitation, inspect/schedule future Monday quotas and refund eligible consumed infrastructure failures |
| Task and worker diagnostics | Metadata observations, task/event history, worker presence and explicit domain recovery; reads do not enqueue work |
| Account deletion recovery | Resume only an already accepted incomplete erasure through its persistent capability |
| Source/import administration | Existing source permissions, approved feeds, immutable previews and explicit reviewed publication |

The three new editor panels mount when expanded and unmount when closed. Closing a panel discards that editor's unsaved local draft; reopen it to load current domain versions. The skills editor's embedded presentation omits the public page heading while retaining its dictionary/history safeguards. `/dictionary/`, `/assessments/` and the account administration controls remain available through the same components and APIs.

## Access loss and asynchronous replies

The workspace verifies the current role through the uncached identity API before mounting private panels. A role check has a ten-second bound. Anonymous/member sessions see an account link and no private editors. The browser gate controls presentation only: domain HTTP/services and database entry points remain authoritative for every operation.

An administrator client receiving 401/403 rechecks the current session. Confirmed access loss unmounts all private panels, including any visible answer keys, invitation form input and cached metadata. A domain-specific 403 does not automatically remove a still-valid administrator: the current session decides. An unavailable verification also withholds the panels and offers an explicit retry. Generation/unmount guards ignore older session/list replies; a delayed bank response cannot reopen a closed or unauthorized panel. The reused bank clears private answer state on authentication rejection on its original page as well.

## Invitation records and revocation

Invitation directory rows contain only UUID, created/expiry timestamps and `available`, `expired` or `redeemed` status. They exclude email, contact hash, issuing/receiving user IDs and credentials. The issue receipt identifies the saved record; the recipient signs in through the existing invitation-aware flow. Issuing an invitation creates permission, not an email delivery operation.

Revocation expires an unused invitation immediately and records `invitation.revoked`. Repeating revocation of an expired unused record is idempotent. Expired status covers natural expiry and explicit revocation; the audit event distinguishes them. A redeemed invitation returns conflict: this control does not deactivate an existing account or initiate an unrequested erasure. Already issued OTPs still face the atomic activation invitation check and cannot activate a newly revoked invitation. An administrator can explicitly reissue an unused expired invitation through the existing email/expiry operation.

## Quotas and refunds

Quota records list feature, weekly limit, effective Monday, creation time and exact decimal-string policy ID. Identifiers remain precise beyond JavaScript's safe integer range. Schedule changes for a future Monday at 00:00 UTC; existing usage/reservations stay bound to their original policy. The existing service permits a future feature/date correction only while the policy is unused. These controls do not consume analysis allowance or call a model.

Refund uses the existing verified domain operation. Only a consumed analysis that failed because of infrastructure is eligible, with a required bounded audit reason. The form never edits a usage counter directly. Write a short operational explanation and avoid copying private resume/answer content into the audit reason. General deterministic task IDs and provider-reservation task IDs are different contracts; inspect the appropriate workflow before requesting a refund.

## API additions and replacement contracts

All routes below require a current administrator independently at service and database boundaries, return `no-store`/Cookie variance, and use the existing request-ID/safe-error convention:

| Method/path | Contract |
| --- | --- |
| GET `/api/v1/identity/admin/invitations` | Optional opaque `cursor`; `{data: invitation[],nextCursor}`, fixed 20, descending `(createdAt,id)` |
| GET `/api/v1/identity/admin/quota-policies` | Optional opaque `cursor`; `{data: quotaPolicy[],nextCursor}`, fixed 20, descending exact bigint ID |
| POST `/api/v1/identity/admin/invitations/{id}/revoke` | Same-origin strict empty JSON, maximum 128 bytes; `{data:{revoked:true}}`; only unused records |

Unknown/duplicate query parameters, malformed/cross-kind/oversized cursors and forged body fields are rejected. Cursor state is a navigation hint, not authority. Boundaries derive from the same bounded result page; concurrent changes can appear on refresh and pagination is not a snapshot transaction. Reads write minimized `invitations.listed`/`quota.policies.listed` identity audit events. Revocation serializes with the invitation row used during activation. Raw identity tables remain unavailable to browser roles. No new email/hash/search endpoint or role-promotion endpoint is added.

`IdentityAdminDirectoryService` depends on an authorization port and `IdentityAdminDirectoryStore`. Its Supabase adapter owns RPC/cursor details; `IdentityAdminClient` owns the browser contract used by the shared widget. `AdminWorkspace` composes domain clients with the presentation access guard; it imports no privileged SDK. Other domain editors retain their independent API/SQL validation, immutable history, conflict and audit semantics. Replacement adapters must retain these contracts, including role rechecks, bounds and minimization.

## Verification and remaining gates

`npm run identity:test -- tests/identity/admin-workspace.integration.test.ts` exercises actual Next/GoTrue/PostgREST/PostgreSQL and browser flows: member/anonymous/raw/origin/body denial, tied paging, exact bigint IDs, audit reads, idempotent revocation and already-issued OTP rejection, lazy private editors, desktop skill/question authoring/review/retirement, mobile invitation/quota/refund controls, account-component reuse, role-loss clearing and a delayed private response after close/revocation. Fixtures own only their records, publish a consistent current dictionary after cleanup and retain immutable synthetic historical snapshots. No provider is contacted. Three unit cases verify authorization/validation before store access and separate permissions.

Actual application captures: [desktop workspace](assets/admin-workspace-desktop.png), [mobile identity controls](assets/admin-workspace-mobile.png). Provider integration, external telemetry, hosted/off-host recovery and the remaining [cross-module release gates](IMPLEMENTATION_AUDIT.md) are separate work; this consolidation does not mark the whole project complete.
