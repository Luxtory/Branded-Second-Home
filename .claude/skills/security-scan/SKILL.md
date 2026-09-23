---
name: security-scan
description: Run a DevSecOps audit on the project — secrets, SAST, dependencies, IaC, containers. Use when the user asks for a security scan, audit, vulnerability check, or before a release/deploy.
allowed-tools: Bash, Read, Grep, Glob
---

# Security Scan

DevSecOps audit pipeline. Detect what tooling is available, run it, aggregate findings by severity, return an actionable report.

## Tool detection (run only what is installed)

For each tool below, check `command -v <tool>` first. If absent, skip and list it under "tools not available" in the final report. **Do not** silently install anything.

## Scan order

1. **Secrets** — `gitleaks detect --no-banner --redact -v`
   (alternative: `trufflehog filesystem .`)
2. **SAST — Python** — `bandit -r src/ -f json -o /tmp/bandit.json -ll`
3. **SAST — JS/TS** — `npx --no-install semgrep --config=auto --json -o /tmp/semgrep.json src/`
4. **SAST — Go** — `gosec ./...`
5. **SAST — generic / multi-language** — `semgrep --config=auto --json -o /tmp/semgrep.json .`
6. **Dependencies — Python** — `pip-audit --format json` (or `uv pip audit`)
7. **Dependencies — JS** — `npm audit --json --audit-level=moderate` (or `pnpm audit --json`)
8. **Dependencies — Go** — `govulncheck ./...`
9. **Dependencies — Rust** — `cargo audit --json`
10. **Dependencies — Ruby** — `bundle audit check --update`
11. **Generic SCA** — `osv-scanner --recursive .`
12. **IaC** — `tfsec <iac-dir>` and/or `checkov -d <iac-dir>`
13. **Container** — `trivy fs --severity HIGH,CRITICAL --format json -o /tmp/trivy.json .`

[CUSTOMIZE] Trim this list down to what your project actually uses. The above
is a menu, not a checklist — running tools that don't apply produces noise.

## Output format

For each finding:

```
[SEVERITY] tool · file:line
└─ rule: <id>
└─ msg:  <description>
└─ fix:  <concrete suggested action>
```

Order by severity: **CRITICAL → HIGH → MEDIUM → LOW → INFO**

## Rules

- If a tool is not installed, **skip and continue** — note it at the end
- Never expose the actual value of a secret (use `[REDACTED]`)
- If zero findings: return ✓ green with the list of tools that ran
- If any CRITICAL: tag the report with `🚨 BLOCK RELEASE` at the top
- Persist machine-readable outputs under `/tmp/<tool>.json` when possible so
  they can be reused by CI uploaders

## Additional reference

See `reference.md` in this same directory for per-tool tuning, accepted suppression patterns and severity mapping.
