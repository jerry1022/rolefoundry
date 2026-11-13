# Security policy

RoleFoundry v0.1 is a browser-local demo. It has no production authentication, private backend, live provider or job submission service. The public catalog inspector is not an authenticated admin panel. Do not enter sensitive information into a hosted demo.

Please report suspected vulnerabilities through GitHub's private vulnerability reporting for this repository when available. Otherwise open an issue asking for a private reporting channel without including secrets, personal information or exploit details. Never paste tokens or resumes into a public issue.

Keep local environment files untracked. Never expose a Supabase service key through a `NEXT_PUBLIC_*` variable. Production deployments must implement the authorization, consent, deletion and recovery gates described in the [HLD](docs/HLD.md) before handling real personal data.

Only the latest scaffold release is maintained initially. A security fix does not imply that the planned production integrations have been implemented or audited.
