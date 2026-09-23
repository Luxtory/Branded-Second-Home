# Spec: Loop engineering primitives

> Spec-Driven Development: this document was written **before** the implementation.
> It ships in the same PR/commit series as the implementation. Update it whenever
> the contract or scope changes.
>
> This spec is also a **worked example**: it is the template's own workflow
> (spec → `/waves` → implementation waves → NOTES.md continuity) applied to the
> template itself. Derived plan: `docs/plan/implementation-waves.md`.

## 1. Goal

Give the template first-class support for the four loop types the Claude Code
team defines (turn-based, goal-based, time-based, proactive): a self-executable
verification skill, a bridge from wave acceptance criteria to `/goal` stop
conditions, a PR-babysitting skill designed for `/loop`, and a how-to guide for
composing loops with explicit cost controls. Foundation principle: a check made
with a tool is evidence; a check without a tool is an opinion. Today the
template encodes *process* (spec, waves, review, security-scan) but nothing
that lets Claude verify its own work or run unattended with a verifiable stop
condition.

## 2. Non-goals

- **No shipped `/schedule` routines.** Routines run on Anthropic's cloud
  infrastructure and are in research preview; the template documents the
  pattern but ships nothing that executes on a schedule by itself.
- **Nothing stack-specific.** All commands and behavioral checks are
  `[CUSTOMIZE]` markers or references to `CLAUDE.md → ## Commands`.
- **No automation without user opt-in.** No hook or skill starts a loop on its
  own; loops are always invoked by the user (`/loop`, `/goal`, `/schedule`).
- **No changes to the delivery/release tooling** (seller-side worker).

## 3. Users / actors

- **Template buyer (developer)** instantiating a project: invokes `/verify`,
  `/babysit-pr`, `/goal`, `/loop` and reads the how-to guide.
- **Claude Code session** in the instantiated project: proactively invokes
  `/verify` before reporting work done; follows the wave plan's Goal commands.

## 4. User stories

- As a developer, I want Claude to verify its own change end-to-end before
  reporting it done, so that I stop being the manual review bottleneck
  (turn-based).
- As a developer, I want each implementation wave to come with a ready-made
  `/goal` command derived from its acceptance criteria, so that a wave can run
  as a goal loop with a verifiable stop condition and a safety cap (goal-based).
- As a developer, I want a `/babysit-pr` skill I can run under `/loop 5m`, so
  that review comments and CI failures on my PR are handled without me polling
  GitHub (time-based).
- As a developer, I want a guide that maps the four loop types to the
  template's assets with cost rules, so that I can compose proactive pipelines
  without burning budget (proactive).

## 5. Contracts

### HTTP API / Events

N/A — developer-tooling feature; no runtime API surface. `docs/api/*` unchanged.

### File contracts

| File | Change | Contract |
|------|--------|----------|
| `.claude/skills/verify/SKILL.md` | new | Skill frontmatter (`name: verify`, `description`, `allowed-tools: Read, Bash, Grep, Glob`); model-invocable (no `disable-model-invocation`); body = scope → static gates (`## Commands`) → behavioral check (`[CUSTOMIZE]` per project type) → evidence rule → restart-on-failure rule |
| `.claude/skills/waves/SKILL.md` | edit | Output format gains a per-wave `**Goal command**` line (`/goal <verifiable condition>, stop after <N> tries`); Process derives it from acceptance criteria; Execution notes explain running a wave as a goal loop |
| `.claude/skills/babysit-pr/SKILL.md` | new | Skill frontmatter (`name: babysit-pr`, `argument-hint`, `disable-model-invocation: true`, `allowed-tools: Read, Write, Edit, Bash, Grep, Glob`); body = resolve PR → gather state via `gh` → cheap idle turn → act (review comments, failing CI) → stop when merged/closed; never force-push |
| `docs/how-to/loops.md` | new | Diátaxis how-to: loop-type table mapped to template assets, recipes, cost rules, composition example |
| `.claude/hooks/task-completed.sh` | edit | Header comment generalized: deterministic quality gate / stop condition (Agent Teams hook + reference implementation for goal/proactive loops); stays unwired by default |
| `README.md`, `CLAUDE.md` | edit | Trees and Definition of Done updated (sync wave) |

## 6. Acceptance criteria

- [ ] Every new skill has valid frontmatter (`name`, `description`) matching
      the conventions of existing skills.
- [ ] Every cross-reference in the new/edited files points at a file that
      exists in the repo.
- [ ] `[CUSTOMIZE]` markers appear wherever a stack assumption is made;
      concrete commands are only ever referenced via `CLAUDE.md → ## Commands`.
- [ ] All shipped content is in English (template language policy).
- [ ] README file tree and CLAUDE.md Definition of Done reflect the new files.
- [ ] Every documented loop example carries an explicit stop condition and,
      where applicable, a safety cap ("stop after N tries").

## 7. Edge cases

- **`## Commands` still has placeholders** (project not instantiated yet):
  `/verify` must say which gates it skipped and why, and must not report the
  change as fully verified.
- **`gh` missing or unauthenticated**: `/babysit-pr` stops with a clear
  instruction (`gh auth login`) instead of failing mid-loop.
- **PR merged or closed**: `/babysit-pr` reports and tells the user to stop
  the `/loop` — the skill cannot cancel the loop itself.
- **Merge conflict on the PR branch**: report only; never resolve via
  force-push.
- **Nothing changed since last check**: `/babysit-pr` ends the turn cheaply
  ("no change") — acting on every tick is the main cost failure mode.
- **Vague goal criteria**: the waves skill instructs translating "better/done"
  into a command that exits green, a score threshold, or a count — otherwise
  the evaluator can't judge and the loop stops too early or never.
- **No live PR available for testing** in this repo: `gh` invocations in
  `/babysit-pr` are validated against `gh` help/manual syntax, not a live run.

## 8. Security considerations

- Authentication/authorization: N/A (no runtime surface). `gh` uses the
  developer's existing CLI auth; the skill never reads or prints tokens.
- `/babysit-pr` never force-pushes and never bypasses the `block-secrets.sh`
  PreToolUse hook; local gates from `## Commands` run before any push.
- `/verify` only runs commands declared in `CLAUDE.md → ## Commands` (plus
  read-only inspection) — it must not invent destructive commands.
- The how-to guide's proactive examples require explicit caps and small-slice
  pilots before large runs (resource-exhaustion / cost DoS is the realistic
  threat here; STRIDE beyond that unchanged — no new attack surface).

## 9. Observability

Runtime logs/metrics: N/A. Cost observability is part of the deliverable: the
how-to documents `/usage`, `/goal` (no args) and `/workflows` as the loop
consumption dashboards, and the rule of matching polling intervals to the real
change frequency of the observed system.

## 10. Rollout plan

- Implementation in 6 atomic conventional commits (waves 0–5), per
  `docs/plan/implementation-waves.md`.
- Reaches buyers through the normal template release process (annotated tag,
  zip rebuild, upload, delivery version bump) — **out of scope here**, tracked
  as a follow-up.
- Backwards compatibility: purely additive; existing skills/hooks keep working.
  The `/waves` format change only adds a line — previously generated plans stay
  valid. Rollback = revert the commit series.

## 11. Open questions

- Should the `verify` skill eventually gain per-stack presets (web/API/CLI)
  as separate reference files instead of one `[CUSTOMIZE]` block? Deferred
  until real-project usage shows which presets earn their keep.
- Whether to ship a `/schedule` routine example as an executable asset once
  routines leave research preview.

## 12. References

- Linked plan: `docs/plan/implementation-waves.md`
- Anthropic, "Getting started with loops" (Claude Code blog, 2026-06-30) —
  taxonomy source: turn-based / goal-based / time-based / proactive.
- Related assets already in the template: `.claude/agents/code-reviewer.md`
  (fresh-context reviewer), `.claude/hooks/stop-notes-reminder.sh` +
  `pre-compact-snapshot.sh` + `session-start-compact-resume.sh` (continuity
  that makes long-running loops survivable), `.claude/skills/waves/SKILL.md`.
