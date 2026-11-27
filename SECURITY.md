# Security policy

The public static RoleFoundry demo is browser-local. Configured server deployments implement Supabase identity, invitation admission, verified roles, owner RLS, versioned consent and weekly quotas. The other career modules still use local demo data; no live AI provider or application submission service is connected. The public catalog inspector is not an authenticated admin panel. Do not enter sensitive information into the public demo.

Please report suspected vulnerabilities through GitHub's private vulnerability reporting for this repository when available. Otherwise open an issue asking for a private reporting channel without including secrets, personal information or exploit details. Never paste tokens or resumes into a public issue.

Keep local environment files untracked. Never expose a Supabase service key through a `NEXT_PUBLIC_*` variable. Follow [identity setup](docs/IDENTITY_SETUP.md), including the Auth hook and production SMTP/rate limits. The database guards deactivation and deletion during identity tasks; full career-data deletion/storage recovery remains a later module gate described in the [HLD](docs/HLD.md).

Only the latest scaffold release is maintained initially. A security fix does not imply that the planned production integrations have been implemented or audited.
