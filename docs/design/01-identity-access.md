# 01 — Identity, access, consent and quotas

## Responsibility

Own invitations, sessions, member/admin roles, consent and per-feature usage budgets. Authentication proves identity; every module still checks authorization for its resources. Email sign-in is the first production method. Employer accounts and billing are outside the initial release.

## Implementation status

Implemented for configured Next.js server deployments: Supabase email OTP, a Before User Created invitation hook, transactionally activated profiles, server-verified roles, owner RLS, versioned consent, weekly reservations, worker authorization guards and audited infrastructure refunds. The Account & privacy screen exposes sign-in, consent, usage and administrator controls. See [setup and API details](../IDENTITY_SETUP.md).

The public static export remains a browser-local demo; its account page explicitly disables live identity. Career profiles, resumes and the other modules retain their existing local demo behavior until their own persistence work is implemented. The public catalog inspector is not an admin security boundary.

## Data and interfaces

The migration creates `profiles`, `invitations`, `consent_policies`, `consents`, `quota_policies`, `usage_reservations`, `identity_tasks`, `identity_task_outbox`, `identity_audit` and the resend-throttle table. Supabase Auth owns credentials and sessions. Business modules never store passwords.

`resolveActor` calls `auth.getUser()` and reads the current role from the database. Runtime authorization accepts only actor instances produced by that verified resolver, so deserializing `{ userId, role }` is insufficient. SQL independently reauthorizes member/admin mutations; browser roles cannot execute task reservation or worker functions.

`authorize(actor, action, resourceOwnerId?)` rejects anonymous actors for private operations, mismatched owners and non-admin catalog writes. An adapter constructs the actor from a verified session. Browser-supplied roles are ignored. Initial quotas are three assessment analyses and five resume analyses per UTC calendar week; administrators can change future limits without rewriting past usage.

## Flow

1. Validate invitation and email sign-in state; consume an invitation transactionally.
2. Create a profile on first confirmed sign-in.
3. Verify the session for each private request and propagate its identity to data access.
4. Before an AI-backed task, check current purpose-specific consent and reserve quota in the same transaction as task creation.
5. Consume a reservation when processing starts. Release a never-started/canceled reservation; infrastructure failures after starting are eligible for an explicit audited refund.

Reservations prevent concurrent submissions from exceeding quotas. Repeated requests with the same idempotency key reuse the task and reservation.

The task and durable outbox row are created in that same transaction; the future module 12 queue consumer is not part of this module. The calling domain must validate its resource ownership before invoking the server-only reservation service. No arbitrary analysis-creation endpoint is exposed to browsers. Future quota edits apply only to future UTC Mondays and cannot alter policies already referenced by usage records.

## Failure and security behavior

Expired sessions return `401`; authenticated forbidden operations return `403`. For private resource identifiers, unauthorized lookup returns `404` to avoid existence disclosure. Admin status is checked server-side. Consent revocation prevents new provider calls; a running call cannot be recalled, so the response is not published if deletion/revocation invalidates the task. Service-role keys remain worker/server-only.

## Acceptance tests

Reject cross-user reads, role spoofing, expired invitations and duplicate invitation redemption. Verify quota concurrency, idempotent retries, UTC week boundaries, consent version changes and reservation refunds. Verify that unauthenticated users can still browse published jobs and courses.

The integration suite runs against actual local GoTrue, PostgREST, PostgreSQL and the production standalone web build. It includes real email delivery to Mailpit and browser sign-in/sign-out, plus a client-bundle scan for service-role credentials. Unit tests exercise actor forgery, expiry/error handling and UTC boundaries. Hosted configuration remains an operator deployment step, not an implicit change to the existing public demo.
