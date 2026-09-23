# Security Documentation

This directory holds security-related documentation for the project.

## Layout

- [`threats/`](threats/) — feature-level threat models (STRIDE)
  - [`_template.md`](threats/_template.md) — copy this to start a new threat model
- `policies/` — [CUSTOMIZE] add as needed (data retention, access control, incident response)
- `runbooks/` — [CUSTOMIZE] add as needed (security incident playbooks)

## When to write a threat model

Per the project's CLAUDE.md, run a quick STRIDE pass whenever the **attack
surface changes**:

- New public endpoint
- New third-party integration
- New sensitive data category (PII, PCI, credentials)
- New trust boundary
- Significant change to authn/authz flow

The `threat-modeler` subagent (`.claude/agents/threat-modeler.md`) can guide the
process. Save the output here as `docs/security/threats/<feature>.md`.

## See also

- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure policy
- [`.claude/rules/security.md`](../../.claude/rules/security.md) — security rules Claude must follow
