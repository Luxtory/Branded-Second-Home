# Implementation waves — Loop engineering primitives

> Source spec: `docs/specs/loop-engineering.md`. This file is the source of
> truth for the wave roadmap; the NOTES.md table mirrors the Status column.
>
> Worked example: this plan was derived with `/waves` and executed wave by wave
> on the template itself.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| 0 | Spec + wave plan + NOTES sync | — | — | ✅ |
| 1 | `/verify` skill | 0 | 2, 3 | ✅ |
| 2 | `/waves` emits per-wave `Goal command` | 0 | 1, 3 | ✅ |
| 3 | `/babysit-pr` skill | 0 | 1, 2 | ✅ |
| 4 | `docs/how-to/loops.md` + generic task-completed gate | 1, 2, 3 | — | ✅ |
| 5 | Sync README + CLAUDE.md + final pass | 1–4 | — | ✅ |

## Wave 0 — Spec + wave plan

- **Goal**: the spec and this plan exist and the NOTES.md roadmap mirrors it.
- **Scope (files)**: `docs/specs/loop-engineering.md`, `docs/plan/implementation-waves.md`, `NOTES.md` (local).
- **Depends on / parallel with**: — (foundation, always sequential).
- **Acceptance criteria**: spec follows `docs/specs/_template.md` sections; this
  plan follows the `/waves` output format; NOTES.md table matches this table.
- **Goal command**: `/goal docs/specs/loop-engineering.md and docs/plan/implementation-waves.md exist and the NOTES.md roadmap table matches the plan table, stop after 2 tries`

## Wave 1 — `/verify` skill (turn-based lever)

- **Goal**: Claude can verify its own change end-to-end instead of the user
  reviewing by eye.
- **Scope (files)**: `.claude/skills/verify/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 2 and 3 (disjoint
  files, no shared interface).
- **Acceptance criteria**: skill has valid frontmatter (`name`, `description`,
  `allowed-tools`); body covers scope → static gates from `CLAUDE.md → ## Commands`
  → behavioral check per project type (`[CUSTOMIZE]`) → evidence rule →
  restart-from-step-1 failure rule; degrades with an explicit warning when
  `## Commands` still has placeholders.
- **Goal command**: `/goal .claude/skills/verify/SKILL.md exists with valid frontmatter and covers all five steps listed in the spec's file contract, stop after 3 tries`

## Wave 2 — `/waves` emits per-wave `Goal command` (goal-based lever)

- **Goal**: every generated wave plan ships a ready-made `/goal` invocation
  derived from that wave's acceptance criteria, cap included.
- **Scope (files)**: `.claude/skills/waves/SKILL.md` (edit).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 3.
- **Acceptance criteria**: Process derives the command from acceptance criteria
  and requires verifiable conditions (command exits green / score / count) plus
  an explicit cap; Output format shows the `**Goal command**` line; Execution
  notes explain running a sequential wave as a goal loop and closing it with
  `/verify`.
- **Goal command**: `/goal .claude/skills/waves/SKILL.md output format includes a Goal command line and the process section requires a verifiable condition with an explicit cap, stop after 3 tries`

## Wave 3 — `/babysit-pr` skill (time-based lever)

- **Goal**: a skill designed for `/loop 5m /babysit-pr <n>` that addresses
  review comments and fixes failing CI, acting only when something changed.
- **Scope (files)**: `.claude/skills/babysit-pr/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 2.
- **Acceptance criteria**: frontmatter has `argument-hint` and
  `disable-model-invocation: true`; body covers PR resolution (argument or
  current branch), state gathering via `gh`, cheap no-change turns, acting on
  review comments and failing CI, merged/closed stop condition, and an explicit
  never-force-push rule; local gates referenced via `## Commands` with
  `[CUSTOMIZE]`.
- **Goal command**: `/goal .claude/skills/babysit-pr/SKILL.md exists and covers resolve/gather/idle/act/stop plus the never-force-push rule, stop after 3 tries`

## Wave 4 — Loops how-to guide + generic quality gate (proactive, doc-only)

- **Goal**: a how-to that maps the four loop types to the template's assets,
  with recipes and cost rules; `task-completed.sh` presented as the
  deterministic stop-condition reference.
- **Scope (files)**: `docs/how-to/loops.md` (new), `.claude/hooks/task-completed.sh`
  (header comment edit), `docs/how-to/README.md` (index, if it lists content).
- **Depends on / parallel with**: depends on 1, 2, 3 (references their names);
  sequential.
- **Acceptance criteria**: guide contains the four-type table with a template
  asset per row, at least three recipes with explicit stop conditions/caps, the
  cost rules, and the composition example; every referenced file exists;
  `task-completed.sh` stays unwired by default.
- **Goal command**: `/goal docs/how-to/loops.md exists, every file it references exists in the repo, and every example carries a stop condition, stop after 3 tries`

## Wave 5 — Sync pass (README, CLAUDE.md, NOTES)

- **Goal**: no divergence between shipped reality and the documents that
  describe it.
- **Scope (files)**: `README.md`, `CLAUDE.md`, this file (statuses → ✅),
  `NOTES.md` (final continuity pass, local).
- **Depends on / parallel with**: depends on 1–4; sequential (touches the files
  the parallel waves deliberately avoided).
- **Acceptance criteria**: README skills tree lists `verify/` and `babysit-pr/`
  and the hooks list reflects the task-completed reframing; CLAUDE.md
  Definition of Done includes end-to-end verification via `/verify`; wave table
  here and in NOTES.md all ✅ and identical.
- **Goal command**: `/goal README tree matches the actual .claude/skills contents and CLAUDE.md Definition of Done mentions /verify, stop after 2 tries`

## Execution notes

- Sequential waves run in the main session, one atomic Conventional Commit per
  wave (this repo is trunk-based on `main`; push only on request).
- Waves 1–3 are parallelizable (disjoint files, no shared public interface) —
  they may run as subagents in isolated worktrees; all README/CLAUDE.md
  touchpoints are deferred to wave 5 precisely to keep 1–3 conflict-free.
- When a wave completes, mark it ✅ here AND in NOTES.md — the Stop hook then
  forces the final NOTES.md continuity pass and suggests /compact.
