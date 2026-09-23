# Security Policy

> **Template file.** This is a starter for **your own project's**
> vulnerability disclosure policy — once you ship something to end users
> they need a way to reach you privately. It is **not** the channel for
> issues with the `claude_bootstrap` template itself; for those, see
> [`SUPPORT.md`](SUPPORT.md).
>
> Replace every `[CUSTOMIZE]` and `<owner>/<repo>` placeholder before
> publishing.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately:

- **GitHub**: open a private security advisory at
  `https://github.com/<owner>/<repo>/security/advisories/new`
- **Email**: [CUSTOMIZE] `security@<your-domain>`
- **PGP key**: [CUSTOMIZE] link to public key if you publish one

Include, when possible:

- A description of the vulnerability and the impact
- Steps to reproduce or proof of concept
- The version, commit, or environment where you observed it
- Any mitigating factors you've identified

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial triage** (severity, scope, fix path) within 7 business days.
- **Status updates** at least every 7 days until the report is resolved.
- **Coordinated disclosure**: we agree on a public-disclosure date with the
  reporter once a fix is available.

## Supported versions

[CUSTOMIZE] Replace with the policy that matches your release model.

| Version | Status                  |
|---------|-------------------------|
| latest  | Active — security fixes |
| previous-major | Best-effort fixes |
| older   | No security support     |

## Scope

In scope:
- Code in this repository
- Dependencies pinned in lockfiles within this repository
- Infrastructure-as-code under `infra/`

Out of scope (please report to the relevant vendor):
- Third-party services and SaaS dependencies
- Vulnerabilities in dependencies that have already been disclosed and patched

## Hall of fame

[CUSTOMIZE] If you'd like to credit reporters, list them here with their
permission.
