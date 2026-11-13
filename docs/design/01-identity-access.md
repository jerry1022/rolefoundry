# 01 — Identity, access, consent and quotas

## Responsibility

Own invitations, sessions, member/admin roles, consent and per-feature usage budgets. Authentication proves identity; every module still checks authorization for its resources. Email sign-in is the first production method. Employer accounts and billing are outside the initial release.

## Current scaffold

The application uses a fictional local profile with no login. `Actor` and `IdentityService` are contracts in `src/lib/services.ts`. The public catalog inspector is not protected and cannot mutate server data.

## Data and interfaces

Target records: `profiles(user_id, role, invited_at)`, `invitations(email_hash, expires_at, used_at)`, `consents(user_id, purpose, policy_version, granted_at, revoked_at)` and `usage_reservations(user_id, feature, task_id, period_start, state)`. Supabase Auth owns credentials and sessions. Business modules never store passwords.

`authorize(actor, action, resourceOwnerId?)` rejects anonymous actors for private operations, mismatched owners and non-admin catalog writes. An adapter constructs the actor from a verified session. Browser-supplied roles are ignored. Initial quotas are three assessment analyses and five resume analyses per UTC calendar week; administrators can change future limits without rewriting past usage.

## Flow

1. Validate invitation and email sign-in state; consume an invitation transactionally.
2. Create a profile on first confirmed sign-in.
3. Verify the session for each private request and propagate its identity to data access.
4. Before an AI-backed task, check current purpose-specific consent and reserve quota in the same transaction as task creation.
5. Consume a reservation when processing starts. Release a never-started/canceled reservation; infrastructure failures after starting are eligible for an explicit audited refund.

Reservations prevent concurrent submissions from exceeding quotas. Repeated requests with the same idempotency key reuse the task and reservation.

## Failure and security behavior

Expired sessions return `401`; authenticated forbidden operations return `403`. For private resource identifiers, unauthorized lookup returns `404` to avoid existence disclosure. Admin status is checked server-side. Consent revocation prevents new provider calls; a running call cannot be recalled, so the response is not published if deletion/revocation invalidates the task. Service-role keys remain worker/server-only.

## Acceptance tests

Reject cross-user reads, role spoofing, expired invitations and duplicate invitation redemption. Verify quota concurrency, idempotent retries, UTC week boundaries, consent version changes and reservation refunds. Verify that unauthenticated users can still browse published jobs and courses.
