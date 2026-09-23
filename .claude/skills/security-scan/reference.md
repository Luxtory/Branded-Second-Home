# Security Scan — Reference

Operational details loaded on demand by the `security-scan` skill.

## Per-tool tuning

### Bandit (Python SAST)
- Confidence threshold: `-ll` (low+low) for release; `-iii` for fast CI
- Acceptable skips: `B101` (assert) only inside `tests/`
- Config: `pyproject.toml` `[tool.bandit]`

### Semgrep (multi-language SAST)
- Use `--config=auto` for curated default rules
- Specific rulesets: `p/owasp-top-ten`, `p/security-audit`, `p/secrets`
- Custom rules under `.semgrep/`

### Gitleaks (secret detection)
- Config: `.gitleaks.toml` at repo root
- Allowlist for known false positives (test fixtures, doc examples)
- Recommended pre-commit: `gitleaks protect --staged`

### gosec / govulncheck (Go)
- Run on every package: `gosec ./...`, `govulncheck ./...`
- Failures block the build at HIGH and above

### cargo-audit / cargo-deny (Rust)
- Run with `--deny warnings` to fail on any advisory
- Pin advisories database via vendored `advisory-db/` if reproducibility matters

### Trivy (containers / filesystem)
- Severities to fail the build: `HIGH,CRITICAL`
- Ignore via `.trivyignore` (with justifying comment + expiration date)

### tfsec / Checkov (IaC)
- tfsec is lighter-weight; Checkov has broader rule coverage
- Severities to fail the build: `CRITICAL,HIGH`

## Accepted suppressions

Every suppression must have:
1. `# nosec`, `// nosemgrep`, `// gosec:disable`, etc., **with the explicit rule id**
2. A comment with technical justification
3. A linked issue/ticket
4. Reviewer approval on the PR

Example:
```python
# nosec B608 — query is parameterized; bandit false positive on f-string
# tracking: SEC-142
query = f"SELECT * FROM {table} WHERE id = %s"
```

## Severity mapping (internal)

| Tool        | CRITICAL | HIGH    | MEDIUM | LOW      |
|-------------|----------|---------|--------|----------|
| Bandit      | HIGH+H   | HIGH+M  | MED+H  | MED+M    |
| Semgrep     | ERROR    | WARNING | INFO   | —        |
| Trivy       | CRITICAL | HIGH    | MEDIUM | LOW      |
| tfsec       | CRITICAL | HIGH    | MEDIUM | LOW/INFO |
| gosec       | HIGH     | MEDIUM  | LOW    | —        |
| cargo-audit | critical | high    | medium | low      |

## CI integration

In CI (`.github/workflows/security.yml`, GitLab CI, CircleCI, Cloud Build, etc.):

- A `security-scan` job should fail on any **HIGH** or above
- Findings should upload to your code host's security tab via SARIF when supported
- [CUSTOMIZE] Notify your team channel on CRITICAL (Slack, Teams, Discord, etc.)
