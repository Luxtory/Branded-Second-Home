---
name: waves
description: Derive or update the implementation wave plan (docs/plan/implementation-waves.md) from a feature spec — decompose the work into waves, classify each as sequential or parallelizable, and sync the NOTES.md roadmap table. Use after a spec exists and before implementation starts.
argument-hint: "[path-to-spec]"
allowed-tools: Read, Write, Edit, Glob, Grep
---

Derive the implementation wave plan for: $ARGUMENTS

## Input

- If `$ARGUMENTS` is a path, use that spec. Otherwise look for `SPEC.md` at
  the repo root, then the most recently modified file in `docs/specs/`.
- If no spec exists, stop and suggest running `/spec` first — a wave plan
  without a spec violates Spec-Driven Development.
- Read `NOTES.md` (if present) for current status and any existing roadmap.

## Process

1. **Decompose** the spec into waves:
   - **Wave 0 — foundation**: scaffold, domain types, config, CI, API
     contracts, ADRs. Always first and always sequential.
   - Each subsequent wave is one vertical slice (or coherent increment)
     independently shippable behind a PR: spec section → contract → domain →
     application → infrastructure → presentation → tests.
   - A wave should fit one focused session/PR (~≤400 diff lines guideline).
2. **Map dependencies**: for each wave, list which waves must be merged first
   (shared types, contracts, migrations, auth).
3. **Classify parallelism.** Two waves are parallelizable ONLY if they:
   - (a) have no dependency between them,
   - (b) touch disjoint slices/files (no shared migrations, contracts, or
     config), and
   - (c) do not both alter a shared public interface.
   When in doubt, mark sequential — a false "parallel" costs merge conflicts.
4. **Derive a Goal command** for each wave from its acceptance criteria: a
   `/goal` invocation whose condition is verifiable (a command that exits
   green, a score threshold, a count) plus an explicit safety cap
   (`stop after <N> tries`). A vague criterion ("make it better", "done")
   breaks the goal loop — the evaluator can't judge it, so the loop either
   stops too early or never. If a criterion can't be made verifiable, rewrite
   the acceptance criteria until it can.
5. **Write** `docs/plan/implementation-waves.md` in the format below
   (create `docs/plan/` if missing). This file is the roadmap's source of truth.
6. **Sync** the roadmap table in `NOTES.md` ("Current status" section) so the
   two never diverge.

## Output format (docs/plan/implementation-waves.md)

```markdown
# Implementation waves — <feature/project>

> Source spec: <path>. This file is the source of truth for the wave
> roadmap; the NOTES.md table mirrors the Status column.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| 0 | <foundation> | — | — | ⬜ |
| 1 | <slice A> | 0 | 2 | ⬜ |
| 2 | <slice B> | 0 | 1 | ⬜ |
| 3 | <integration of A+B> | 1, 2 | — | ⬜ |

## Wave <n> — <name>

- **Goal**: <one sentence>
- **Scope (slices/files)**: <what it touches>
- **Depends on / parallel with**: <waves + one-line why>
- **Acceptance criteria**: <observable checks — commands to run, behavior to see>
- **Goal command**: `/goal <acceptance criteria as a verifiable condition>, stop after <N> tries`

## Execution notes

- Sequential waves run in the main session, one branch/PR per wave
  (squash merge, Conventional Commits).
- A sequential wave can run as a **goal loop**: invoke its Goal command and let
  the evaluator hold the session to the acceptance criteria instead of trusting
  "looks done". Close the wave with `/verify` before marking it ✅.
- Parallel groups can run as subagents in isolated worktrees — one wave per
  agent, results merged one PR at a time.
- When a wave completes, mark it ✅ here AND in NOTES.md — the Stop hook then
  forces the final NOTES.md continuity pass and suggests /compact.
```

## Success criteria

The plan file exists, every wave has explicit dependencies and acceptance
criteria, parallelism is justified (not assumed), and the NOTES.md roadmap
table matches the plan.
