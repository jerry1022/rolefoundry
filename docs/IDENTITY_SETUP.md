# Identity module setup

Module 01 implements invitation-only email OTP sign-in, verified sessions, member/admin authorization, purpose/version-specific consent, weekly quota reservations and audited refunds. It does not connect AI providers. [Module 02](PROFILE_SETUP.md) adds private preferences/evidence and an explicitly approved, limited demo importer; other career workspace data remains local.

## Local development

Requirements: Node.js 24, npm, Docker and free ports 54320–54324. Everything below uses an isolated project named `rolefoundry-identity`; email is delivered to its local Mailpit service, not external recipients.

```bash
npm ci
npm run identity:start
npx supabase migration up
npm run identity:invite -- developer@example.test
npm run identity:dev
```

Open `http://127.0.0.1:3200/account/`. Request a code and read the message in Mailpit at `http://127.0.0.1:54324`. Enter the code in the account page. The invitation is consumed only after Auth confirms the email and the profile transaction commits.

To bootstrap a local administrator, complete the first sign-in, then run:

```bash
npm run identity:invite -- developer@example.test --admin
```

Reload Account & privacy. Role changes come from the database, not email metadata or client state. The helper only accepts the ignored local stack configuration and refuses hosted database URLs.

```bash
npx playwright install chromium
npm run identity:test
npm run identity:stop
```

The integration suite creates and removes its own fixture users. It exercises actual GoTrue, PostgREST, PostgreSQL transactions/RLS and the production standalone Next.js account API. It uses the local mailbox for browser sign-in. The production build avoids interference between the test runner's file transforms and Next development hot reload. The test web server is owned by the runner and stopped afterward; the Supabase development volumes remain available until explicitly stopped.

Local test credentials are written with owner-only permissions to ignored `.local/identity-env.json`. Startup and web logs also stay under `.local`; do not publish those logs or copy the fixture credentials into a hosted deployment. `IDENTITY_TEST_PORT` and `IDENTITY_DEV_PORT` can override port 3200. Do not run multiple Next development servers against the same build directory simultaneously.

## Hosted Supabase and Next.js

Use a dedicated Supabase project and review/apply the migration in `supabase/migrations`. Do not apply it blindly to a project with unrelated `profiles` or other colliding tables. Configure these **server-side** environment variables in the hosting secret manager:

```text
ROLEFOUNDRY_IDENTITY_ENABLED=true
ROLEFOUNDRY_APP_ORIGIN=https://your-domain.example
SUPABASE_URL=<your Supabase project URL>
SUPABASE_ANON_KEY=<your publishable/anon API key>
SUPABASE_SERVICE_ROLE_KEY=<your server-only service-role API key>
```

Never prefix the service key with `NEXT_PUBLIC_`. Missing configuration fails closed with `503`; it never falls back to trusting the demo profile. Restart/rebuild after enabling identity so the account UI flag matches the server configuration. The app origin must be an exact origin without a path or trailing slash. HTTPS is required except for loopback development.

In Supabase Auth:

1. Enable email sign-in and email confirmation. Leave signup enabled so invited addresses can be created.
2. Enable the **Before User Created** PostgreSQL hook and select `public.identity_before_user_created`. This blocks bypassing the app to create an uninvited account directly through Auth.
3. Configure the confirmation and magic-link email templates to show `{{ .Token }}`; this implementation uses a code entered into a POST form, not credentials in callback URLs.
4. Set an appropriate OTP expiry, resend limits, global rate limits and production SMTP configuration. The larger limits in `supabase/config.toml` are local test settings, not production recommendations.

The application verifies sessions with `auth.getUser()` on each private API request, obtains the role from `profiles` and stores session cookies as HttpOnly/SameSite=Lax (Secure on HTTPS). Route Handlers refresh cookies; private API responses are `no-store`. No authorization decision uses `getSession()` payloads or `user_metadata.role`.

## First hosted administrator

There is no public first-user-is-admin endpoint. A trusted database operator first seeds an invitation through the Supabase SQL editor:

```sql
insert into public.invitations(email_hash, expires_at)
values (public.identity_email_hash('operator@example.test'), now() + interval '7 days');
```

The invited operator signs in and confirms their email. Then the database operator explicitly promotes that confirmed profile:

```sql
update public.profiles
set role = 'admin'
where user_id = (
  select id from auth.users
  where lower(email) = 'operator@example.test' and email_confirmed_at is not null
);
```

An administrator can then use the account page to invite members, schedule future quotas and record infrastructure-failure refunds. These actions are reauthorized by the API and database even when the browser displays admin controls.

## API surface

All routes below are under `/api/v1/identity`:

| Method/path | Behavior |
| --- | --- |
| GET `/policies` | Public current consent descriptions and versions |
| POST `/signin` | Generic invitation-aware OTP response; resend throttle |
| POST `/verify` | Verify email code, atomically activate profile, set session cookies |
| POST `/signout` | Clear this device's session |
| GET `/session` | Current verified member/admin identity |
| GET/POST/DELETE `/consents` | Read, grant a current version, or revoke a purpose |
| GET `/usage` | Current UTC-week limits, reserved and consumed counts |
| GET `/tasks/{id}` | Owner-only task state; other/missing IDs both return 404 |
| POST `/admin/invitations` | Create/reissue an unused invitation |
| POST `/admin/quota-policies` | Schedule a future Monday quota |
| POST `/admin/refunds` | Refund consumed infrastructure failures with an audit reason |

Mutations require `Content-Type: application/json` and an `Origin` matching the configured app origin. Bodies are limited to 8 KiB and reject unknown fields. Invalid sessions use 401, disallowed actions 403, private/missing resources 404, conflicts 409 and exhausted analysis quotas 429. Request IDs and safe error codes are returned without raw provider messages.

## Domain and worker integration

Call `resolveActor` through the server identity service; never deserialize an actor from a request. `SupabaseIdentityService.reserveAnalysis` accepts only a verified actor. The calling domain must validate its resource ownership and immutable input version before requesting a reservation. There is deliberately no browser endpoint that creates arbitrary analysis work.

A single PostgreSQL transaction creates the task, reservation and durable outbox row. Reservation RPCs and worker transitions are granted only to the server service role. An owner-scoped advisory lock serializes budget changes, consent revocation and result publication. Initial limits are three assessment analyses and five resume analyses per Monday-based UTC week.

`IdentityWorkerGuard` starts work, checks authorization immediately before a provider call, and checks again when publishing a result. Unstarted work can be released; started work consumes budget. Only an administrator can refund a consumed infrastructure failure, with a reason and an immutable audit event. Revocation cannot recall an external call already made, but it prevents subsequent publication. Profile deactivation and hard deletion also prevent publication.

The identity durable outbox remains a handoff to module 12; the identity module does not itself execute an AI request. Module 05 separately runs fixed-choice grading through general tasks/pgmq with no external provider, so it requires neither provider consent nor AI allowance. Modules 02/05/08/11 must attach their own resource validation, result records and provider execution to these boundaries.

## Static demo compatibility

Pages and layouts use `.tsx`; dynamic Route Handlers use `route.ts`. The GitHub Pages export includes only `.tsx` routing entries, excluding server handlers, and forces the account UI into a clearly labeled demo state. Normal Next/Vercel builds include both extensions and the dynamic API. Both builds are checked; the static deployment never contains service credentials or a pretend authentication endpoint.

## References

- [Supabase server-side session verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
