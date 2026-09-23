# Project: meu-projeto

> Project memory. Auto-loaded by Codex at startup.
> Keep concise and up to date. Extensive content goes in `docs/` and is referenced from here.
> For global principles (Spec-Driven Development, Modular Monolith, DDD, Docs as Code,
> ADRs, API-First, Diátaxis, Security by Design, DevSecOps), see `~/.Codex/AGENTS.md`.
> This file only lists what is project-specific or overrides the global.

> **How to instantiate this template:**
> 1. Replace `<project-name>` in the title.
> 2. Fill in `## Stack` with your actual tech and pinned versions.
> 3. Fill in `## Commands` with the commands of your chosen stack.
> 4. Adjust `## Architecture rules` (validators, ORM/DB, secret manager,
>    access control mechanism) to your stack's idioms.
> 5. Adjust `## Conventions > i18n` if your project does not target your default locales.
> 6. Review `## Anti-patterns` and adapt language-specific items (e.g. `any`/`Any`).
> 7. Remove this instantiation block once filled in.

---

## Stack

> List language, framework, and pinned version of every critical component.
> Pinned versions reduce API drift and make Codex's suggestions accurate.

- **Backend**: `<language/framework + version>`
- **Frontend**: `<framework + version>` (omit if not applicable)
- **DB**: `<database + version>`
- **Cache**: `<cache + version>` (omit if not applicable)
- **IaC**: `<tool + version>`
- **CI/CD**: `<pipeline>`
- **Cloud / hosting**: `<provider + region>`

## NOTES.md — living document (mandatory)

`NOTES.md` at the repo root is the project's living working memory. Bootstrap
it from the shipped skeleton: `cp NOTES.example.md NOTES.md` (it is gitignored
by default — local working memory, not repo history). **Always check it and
always keep it updated:**

- **Read it at the start of every session**, before doing anything else — it holds the current project status, the wave roadmap table, active decisions, technical discoveries/gotchas, and pending follow-ups.
- **Update it as the project changes, not only at session end.** Whenever you make a discovery (toolchain gotcha, API quirk, workaround), take or revise a decision, change project status (wave completed, PR merged, milestone reached), or find anything worth recording for future sessions — write it to `NOTES.md` in the appropriate section right away.
- Treat divergence between `NOTES.md` and reality as a bug: if you notice it is stale (status, pendências, roadmap table), fix it in the same session.
- Before ending a session or closing a wave, do a final pass: status table, decisions, gotchas, pendências, and "next steps" must reflect the real current state.
- **Wave lifecycle**: the roadmap table mirrors `docs/plan/implementation-waves.md`
  (source of truth, derived with `/waves`). Each wave ships a Goal command — a wave can
  run as a goal loop and is closed with `/verify` (see `docs/how-to/loops.md`).
  When you mark a wave ✅ in NOTES.md, the
  Stop hook forces this final continuity pass and then suggests `/compact` to the user;
  the PreCompact/SessionStart hooks snapshot git state and restore continuity after the
  compaction automatically — write NOTES.md so it stands alone after that.

## Commands

> Single source of truth for project commands. Definition of Done references this section.
> Use the idiomatic command for your stack (e.g. `pytest`, `go test`, `cargo test`,
> `npm test`, `mvn test`). Keep them runnable as-is from project root.

- Dev: `<dev-command>`
- Test: `<test-command>`
- Lint: `<lint-command>`
- Typecheck: `<typecheck-command>` (omit if language is dynamically typed without checker)
- Coverage: `<coverage-command>` (must fail if below the minimum defined in Architecture rules)
- Deploy staging: `<staging-command>`
- Deploy prod: **CI only** (`<path-to-prod-pipeline>`).
  Local production deploys are forbidden — remote backend / pipeline enforces this.

## Workflow

- **Spec-Driven.** Every non-trivial feature starts with a spec in
  `docs/specs/<feature>.md` (goal, contracts, edge cases, acceptance criteria).
  Spec ships in the same PR as the implementation.
- **Wave planning.** Every non-trivial implementation starts by deriving a
  wave plan in `docs/plan/implementation-waves.md` from the spec (use `/waves`):
  numbered waves with explicit dependencies, each classified as sequential or
  parallelizable (parallel waves can run as subagents in isolated worktrees).
  The NOTES.md roadmap table mirrors this plan.
- **API-First.** REST contracts in `docs/api/openapi.yaml`, async/event
  contracts in `docs/api/asyncapi.yaml`. Update the contract BEFORE touching
  any handler.
- **Quick threat model (STRIDE)** whenever the attack surface changes
  (new public endpoint, third-party integration, new sensitive data).
- **Observability**: structured logs (JSON or equivalent) with a
  `correlation_id` on every request. Metrics exported to the project's
  observability stack. Unhandled errors reported automatically.
  No ad-hoc stdout debugging in production code.

## Folder structure

- `src/features/<feature>/` — one vertical slice per feature
  - `domain/` — entities, value objects, aggregates, repository interfaces
  - `application/` — use cases (commands/queries), DTOs, ports
  - `infrastructure/` — adapters (DB, cache, HTTP clients, queues),
    implementations of `domain/` interfaces
  - `presentation/` — entry points (HTTP handlers, UI components, CLI, workers)
- `docs/specs/` — feature specs (Spec-Driven)
- `docs/plan/` — implementation wave roadmap (`implementation-waves.md`, see `/waves`)
- `docs/adr/` — Architecture Decision Records (Michael Nygard format)
- `docs/api/` — OpenAPI / AsyncAPI contracts
- `docs/security/` — threat models and security-related docs
- `docs/tutorials/`, `docs/how-to/`, `docs/reference/`, `docs/explanation/` — Diátaxis
- `infra/` (or `terraform/`, `pulumi/`, etc.) — IaC; state directories are off-limits
- `migrations/` — DB migrations; applied migrations are immutable (create a new one)

> Adapt source layout to your language's idioms (e.g. `cmd/` + `internal/` for Go,
> `app/` + `lib/` for Rails) but preserve the slice + DDD layer separation.

## Architecture rules

- **Vertical Slice** per feature in `src/features/<feature>/`.
- **DDD layers** with inward dependency: `presentation` → `application`
  → `domain`. `infrastructure` implements `domain` interfaces. `domain`
  imports nothing from outside.
- **Boundaries are law.** Slices do not import each other's internals —
  communicate via public use cases or domain events.
- **Security by Design (project-specific)**: never log PII; secrets only
  via your stack's secret manager or env vars (never in code); input
  validation at every boundary using your stack's idiomatic validator;
  row-level access control at the DB layer when supported; least
  privilege on all service accounts and credentials.
- **Minimum coverage**: 80% in `domain/` and `application/`.

## Anti-patterns (do not do)

- ❌ Domain logic in `presentation/` (HTTP handlers, UI components, CLI commands)
- ❌ DB driver / ORM client in `domain/` or `application/`
- ❌ Importing directly from another slice — use public use cases or domain events
- ❌ Generic catch-all error handlers swallowing errors without structured logging
- ❌ Dynamic / escape-hatch types (`any`, `Any`, `interface{}`, `dynamic`)
  without a justifying comment
- ❌ Manual DB changes via console — always versioned migration files
- ❌ Hardcoded user-facing strings — always go through the i18n layer
- ❌ Calling production deploy commands from a local machine

## Conventions

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `sec:`, `refactor:`,
  `test:`, `docs:` (`sec:` is a project extension for security-related changes).
- **Branches**: `feat/<slug>`, `fix/<slug>`, `sec/<slug>`
- **PRs**: open as draft first, CI green before requesting review.
  Spec/ADR ship in the same PR as the change.
- **i18n**: `<default-locale>` is default, `<fallback-locale>` is fallback.
  All user-facing strings go through the i18n layer — never hardcoded in
  responses, templates, or components.
- **Code in English** (variables, functions, comments) — docs and specs
  in `<docs-language>`.
- **Migrations**: use the project's migration tool. Always reversible
  (include `down` / rollback). Test rollback before opening PR.

## Files & paths to ignore

- Do not touch IaC state directories (e.g. `terraform/state/**`, `.pulumi/`)
- Do not edit applied `migrations/` (create a new migration instead)
- Do not modify dependency lockfiles manually (`*.lock`, `package-lock.json`,
  `poetry.lock`, `Cargo.lock`, etc.)
- Never run production deploys locally — CI only

## Domain glossary

- **Slice**: end-to-end feature unit (all DDD layers)
- **Bounded Context**: coherent group of slices with their own ubiquitous language
- **Aggregate**: transactional root of the domain
- **Use case**: command/query handler in `application/`
- **ADR**: Architecture Decision Record (`docs/adr/NNNN-title.md`)
- **Spec**: feature document (`docs/specs/<feature>.md`)
- **Threat model**: STRIDE document in `docs/security/threats/<feature>.md`

## Checklist before starting a task

1. Does a spec exist in `docs/specs/`? If not, write it first (`/spec` interviews and drafts it).
2. Is there a wave plan in `docs/plan/implementation-waves.md`? If the task is a
   non-trivial implementation and there is none, derive it with `/waves` before coding.
3. Which slice / bounded context does this belong to? If creating a new one, justify.
4. Is there an architectural decision involved? If so, ADR in `docs/adr/`.
5. Is there a new or changed API contract? Update `docs/api/openapi.yaml`
   (or `asyncapi.yaml`) before the handler.
6. New attack surface? Quick threat model (STRIDE) and adjust authz,
   validation, rate limiting, and DB-level access control.

## Definition of Done

Stack-agnostic — concrete commands live in `## Commands`. The criteria
below apply to any language or framework.

Before marking a PR as ready for review:

- [ ] Spec in `docs/specs/` updated (if feature is new or changed)
- [ ] ADR created (if there was an architectural decision)
- [ ] OpenAPI/AsyncAPI updated (if API contract changed)
- [ ] All tests passing (see `## Commands`)
- [ ] Lint + typecheck green (see `## Commands`)
- [ ] Change verified end-to-end with `/verify` (gates + behavioral check, not just green edits)
- [ ] Coverage ≥ 80% in `domain/` and `application/` (see `## Commands`)
- [ ] No secrets, credentials, or PII in logs, commits, or git history
- [ ] CHANGELOG.md updated (if user-facing)
- [ ] Threat model updated (if attack surface changed)
- [ ] Diátaxis docs updated (if it affects public usage of the feature)
- [ ] Migration rollback tested (if any migration was added)
