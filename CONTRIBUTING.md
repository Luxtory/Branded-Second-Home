# Contributing

> **Template file.** This document is a starter for **your own project's**
> contributor guide. It's not about contributing to `claude_bootstrap`
> itself — `claude_bootstrap` is a private, single-buyer template; see
> [`SUPPORT.md`](SUPPORT.md) for help with the template.
>
> If your project is solo / closed-source and won't accept external
> contributors, you can delete this file entirely. Otherwise, work through
> the `[CUSTOMIZE]` markers below.

Thanks for your interest in contributing. This project follows
Spec-Driven Development, Vertical Slice + DDD architecture, and DevSecOps
practices defined in [`CLAUDE.md`](CLAUDE.md). Please skim that document
before opening a non-trivial PR.

## Local setup

[CUSTOMIZE] List the steps to get a local environment running. See
`CLAUDE.md > ## Commands` for the canonical command list.

```bash
# 1. Clone
git clone https://github.com/<owner>/<repo>.git
cd <repo>

# 2. Install dependencies
# [CUSTOMIZE] e.g. pnpm install / pip install -e .[dev] / go mod download

# 3. Run the tests
# [CUSTOMIZE] e.g. pnpm test / pytest / go test ./...

# 4. Make hooks executable (one-time)
chmod +x .claude/hooks/*.sh
```

## Workflow

1. **Open or claim an issue** before significant work. For bugs, use the
   bug report template; for features, use the feature request template.
2. **Branch** from `main`: `feat/<slug>`, `fix/<slug>`, `sec/<slug>`,
   `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`.
3. **Spec first** for non-trivial features. Add `docs/specs/<feature>.md` in
   the same PR as the implementation.
4. **API contract first** if you're touching public endpoints or events.
   Update `docs/api/openapi.yaml` (or `asyncapi.yaml`) before the handler.
5. **Threat model** if the attack surface changes — add or update
   `docs/security/threats/<feature>.md`.
6. **Open the PR as a draft.** Push commits until CI is green; then mark
   ready for review.
7. **Definition of Done** is in [`CLAUDE.md`](CLAUDE.md#definition-of-done).
   The PR template mirrors it.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <imperative summary>

<body>

<footers>
```

Allowed types: `feat`, `fix`, `chore`, `sec`, `refactor`, `test`, `docs`,
`build`, `ci`, `perf`, `revert`.

Each commit must build and not break existing functionality.

## Code style

- Code, identifiers, and comments in **English**.
- Strict typing — no escape-hatch types (`any`, `Any`, `interface{}`)
  without a comment justifying the exception.
- Service layer holds business logic; routes/controllers stay thin.
- See [`.claude/rules/code-style.md`](.claude/rules/code-style.md) for the
  full rule set.

## Tests

- Mirror source structure under `tests/`.
- Cover behavior, not implementation details.
- Coverage minimum: **80%** in `domain/` and `application/`.
- See [`.claude/rules/testing.md`](.claude/rules/testing.md).

## Security

- Never commit secrets, tokens, API keys, or PII. The `block-secrets` hook
  blocks the most common patterns, but the responsibility is yours.
- Report vulnerabilities privately via [`SECURITY.md`](SECURITY.md), not as
  a public issue.

## Working with Claude Code

This repo is a Claude Code template. If you're using Claude Code:

- The shared configuration lives in [`.claude/settings.json`](.claude/settings.json).
- Personal overrides go in `.claude/settings.local.json` (gitignored).
- Subagents under `.claude/agents/` and skills under `.claude/skills/` are
  auto-discovered.
- Slash commands under `.claude/commands/` are available as `/<command>`.

## Code of conduct

Be respectful. Disagree on substance, not on people. Assume good faith on
inbound contributions.
