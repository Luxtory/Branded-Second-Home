# Project: Luxtory Branded Second Home

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
>
> **Status (2026-09-24):** instantiated for Luxtory — title, `## Stack`, `## Architecture rules`,
> i18n and docs language filled. `## Commands` is filled in W0 (scaffold), when the scripts exist.
> This block is kept on purpose: see "Instance constraints" (nothing existing is deleted).

---

## Canonical documents (source of truth)

Luxtory's business, product and technical definitions live in three **frozen** documents.
Hierarchy: **01 → 02 → 03 → Software** — a lower level never redefines a higher one; on
conflict, 01 prevails (BR-380, REQ-104).

| Doc | Path | Defines | IDs |
|---|---|---|---|
| 01 — Business Model & Business Rules v10.1 | `docs/specs/canonical/01-business-model-business-rules.md` | what the business is; structural rules | 188 `BR-xxx` |
| 02 — Product Spec v4.1 | `docs/specs/canonical/02-product-spec.md` | functional behavior, invariants, product decisions | 63 `REQ-xxx` · 6 `INV-n` · 11 `PD-xxx` |
| 03 — Technical Spec v3.13 | `docs/specs/canonical/03-technical-spec.md` | how to build: data model, locks, ledgers, API, QA | 49 `TECH-xxx` · `ADR-001…008` |

- **Never edit them.** Changes only via a new version issued by Luxtory, followed by impact
  analysis and traceability update.
- **They are the spec.** Module specs (`docs/specs/<module>.md`), tests and commits cite the IDs
  they implement (e.g. `[REQ-034]`, `[INV-1]`). Reference the canonical text; do not paraphrase
  it into other docs.
- **Nothing is presumed (TECH-001, BR-352).** A missing value, rate, deadline or rule gets no
  technical default: the dependent function is blocked with an explicit error
  (`ERR_PARAMETER_MISSING`, `ERR_POLICY_MISSING`, `ERR_PRL_MISSING`).
- **Scope** = the 02 (including the §15 edge cases). **Out of scope** = 03 §15. New
  functionality enters the 02 first.
- **Guardrails** = 03 §13 — read before every wave. **Terminology** = 02 §1: a Co-Owner holds an
  **Ação** with **Direito de Uso**; never "cota" (or derivatives) and never "diária(s)" for
  Co-Owner (REQ-100); no promise of guaranteed return, appreciation, liquidity or income (REQ-101).
- **Gate:** 63/63 REQ · 11/11 PD · 6/6 INV covered by tests (03 §12).

## Instance constraints (Luxtory)

- **Never delete, move or rename existing files.** The template's "Start a new project"
  instructions in `README.md` (e.g. `rm LICENSE NOTICE.md SUPPORT.md README.md`) do **not**
  apply to this repository.
- **Existing content is only extended** (additions, or filling `<placeholders>` /
  `[CUSTOMIZE]` markers) — existing information is never removed.
- **`docs/plan/implementation-waves.md`**: when deriving the Luxtory plan with `/waves`, keep the
  current content verbatim at the end of the file as "Anexo A — plano do template (concluído)".
- **Platform and cost:** [ADR-0002](docs/adr/0002-plataforma-e-adaptacoes-economicas.md) —
  Vercel + Supabase + Upstash; no paid KMS, immutable storage or PITR before go-live
  (economic adaptations to TECH-100, TECH-092 and TECH-101).
- **Pending inputs** — do not invent; build behind replaceable seams:
  - PSP not contracted → `PaymentGateway` port + deterministic fake adapter (TECH-081);
  - brand guide pending → neutral, replaceable design tokens;
  - contact/qualification fields of the interest form are not enumerated in REQ-025 → await
    Luxtory's definition;
  - commercial policies (PD-009), unset parameters and PRL are **operation** prerequisites
    (03 §16), not development blockers.
- **Release order:** R1 public site (Discovery + Interesse) → R2 own use (calendar, Direito de
  Uso) → R3 Luxtory Club (Créditos, Luxchange, Luxplus, external rental) → R4 delinquency,
  transfer, conformity and hardening.

## Stack

> List language, framework, and pinned version of every critical component.
> Pinned versions reduce API drift and make Codex's suggestions accurate.

- **Backend**: TypeScript (strict) — Next.js App Router server code, single app (versions pinned in W0)
- **Frontend**: Next.js App Router + React (same app)
- **DB**: Supabase PostgreSQL (`sa-east-1`) — Kysely (query builder, no schema generation);
  SQL migrations with dbmate in `migrations/`
- **Cache**: Upstash Redis — rate limiting only (never decides state)
- **IaC**: none for now — Vercel/Supabase/Upstash configured in their consoles; `infra/` reserved
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) + Vercel Git integration
- **Cloud / hosting**: Vercel (`gru1`) + Supabase Auth/PostgreSQL/private Storage (`sa-east-1`) + Upstash
- **Jobs**: Vercel Cron → protected endpoints invoking the same domain commands (TECH-090)
- Rationale and economic adaptations: [ADR-0002](docs/adr/0002-plataforma-e-adaptacoes-economicas.md)

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

> Luxtory: the commands above are filled in W0 (scaffold), when the scripts exist.

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
  - Luxtory modules (03 TECH-011): `identity` · `catalog` · `ownership` · `calendar` ·
    `inventory` · `booking` · `luxchange` · `credits` · `pricing` · `billing` · `admin` · `platform`
- `src/app/` — Next.js routes only (presentation shell); delegate to `src/features/<module>/presentation`
- `docs/specs/` — feature specs (Spec-Driven)
- `docs/specs/canonical/` — frozen canonical documents 01/02/03 (see above)
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
- **Critical commands (03)**: every economic or critical-state mutation carries an `operation_id`
  (TECH-002) and follows TECH-054 — authorize → idempotency → `BEGIN` → locks in the TECH-053
  total order → full revalidation → states/ledgers/snapshot/audit → `COMMIT` → outbox.
- **Writes server-side only**, via direct PostgreSQL connection; **reads protected by RLS**
  (ADR-002 of 03, TECH-052). Frontend, cache, jobs and external providers never decide
  availability, balance, price, authorization or economic effect (ADR-001 of 03).

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
- ❌ Anything in the 03 §13 Guardrails (e.g. economics decided in the frontend, critical writes
  via PostgREST/`supabase-js`, a second mutable source of availability, rewriting economic or
  audit history, inventing a missing value)
- ❌ Floating point for money or Créditos — money is `bigint` minor units + currency, Créditos
  are exact `numeric` (TECH-033)
- ❌ "cota" or "diária(s)" for Co-Owner, or any promise of guaranteed return (REQ-100, REQ-101)

## Conventions

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `sec:`, `refactor:`,
  `test:`, `docs:` (`sec:` is a project extension for security-related changes).
- **Branches**: `feat/<slug>`, `fix/<slug>`, `sec/<slug>`
- **PRs**: open as draft first, CI green before requesting review.
  Spec/ADR ship in the same PR as the change.
- **i18n**: `pt-BR` is default, `pt-BR` is fallback (single locale — the 02 defines no other).
  All user-facing strings go through the i18n layer — never hardcoded in
  responses, templates, or components.
- **Code in English** (variables, functions, comments) — docs and specs
  in `pt-BR`. Exception: enum literals defined in the 03 (`spe_pool`, `reserved_right`,
  `forfeited_right`, `alta`, `media`, `leap`, …) are kept verbatim in the DB and in code.
- **Migrations**: use the project's migration tool. Always reversible
  (include `down` / rollback). Test rollback before opening PR.

## Files & paths to ignore

- Do not touch IaC state directories (e.g. `terraform/state/**`, `.pulumi/`)
- Do not edit applied `migrations/` (create a new migration instead)
- Do not modify dependency lockfiles manually (`*.lock`, `package-lock.json`,
  `poetry.lock`, `Cargo.lock`, etc.)
- Never run production deploys locally — CI only
- **`activate-ultronpx.mjs` (ultron)** — never edit, move, rename, format, lint, type-check or
  execute it, and never change the `ULTRONPX_PURCHASE_EMAIL` variable it reads. In W0, add the
  file to the ignore lists of Prettier, ESLint, TypeScript, coverage and any other tool; env
  validation must neither require nor strip that variable.
- `docs/specs/canonical/**` — frozen canonical documents (never edit)

## Domain glossary

- **Slice**: end-to-end feature unit (all DDD layers)
- **Bounded Context**: coherent group of slices with their own ubiquitous language
- **Aggregate**: transactional root of the domain
- **Use case**: command/query handler in `application/`
- **ADR**: Architecture Decision Record (`docs/adr/NNNN-title.md`)
- **Spec**: feature document (`docs/specs/<feature>.md`)
- **Threat model**: STRIDE document in `docs/security/threats/<feature>.md`
- **Luxtory business terms**: 01 §2 (canonical concepts) and 02 §1 (mandatory terminology).
  03 identifiers: Ação = `stake`, Titular's link to a Residence = `holding`,
  Data-Residence = `residence_date`, Créditos em Garantia = `held`

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
7. Which canonical IDs (BR/REQ/INV/PD/TECH) does this implement? Cite them in the spec,
   tests and commits.

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
