# NOTES.md — <project-name> (living document)

> **How to use this file:** copy it to `NOTES.md` at the repo root
> (`cp NOTES.example.md NOTES.md`) when instantiating the template.
> `NOTES.md` is **gitignored by default** — it is your project's local working
> memory, read by Claude Code at the start of every session and kept updated
> as the project evolves (see `CLAUDE.md` → "NOTES.md — living document").
> The entries below are illustrative — replace them with your project's
> reality and delete this banner.
>
> Last updated: 20XX-XX-XX (example: post-Wave 0 — repo scaffolded, CI green)

---

## 1. Current status

- **Wave 0 (foundation) DONE and merged to `main`** via PR #1 (squash merge),
  CI green on first run.
- Working tree clean; feature branch deleted (local + remote).
- Next up: **Wave 1 — <first vertical slice>**.
- Full roadmap: `docs/plan/implementation-waves.md` (source of truth).

| Wave | Deliverable | Status |
|------|-------------|--------|
| 0 | Scaffold, domain types, config, CI, ADRs | ✅ 20XX-XX-XX |
| 1 | <first slice, e.g. auth + onboarding> | ⬜ next |
| 2 | <second slice, e.g. billing integration> | ⬜ |
| 3 | <...> | ⬜ |

## 2. What already exists (inventory)

- **Repo layout**: `src/features/<feature>/` vertical slices (see CLAUDE.md →
  Folder structure); `docs/` skeleton (specs, ADRs, API contracts, Diátaxis).
- **CI**: lint, typecheck, test, build, dependency audit, secret scan.
- **Tests**: <N> passing (<what they cover>).
- <List every reusable piece a fresh session should NOT rebuild: shared
  utilities, schemas, clients, scripts.>

## 3. Active decisions (beyond the formal ADRs)

> Promote anything architectural to a proper ADR in `docs/adr/`.

1. 20XX-XX-XX — <decision> — <why, in one line>.
2. 20XX-XX-XX — <workflow decision, e.g. "one branch/PR per wave, squash
   merge, Conventional Commits">.

## 4. Technical discoveries (gotchas — do not rediscover)

- <Toolchain quirk + the fix, e.g. "library X v4 changed `.default()`
  semantics → use `.prefault({})`; already applied in config schema.">
- <Environment trap, e.g. "hooks created via editor lack the exec bit →
  `chmod +x .claude/hooks/*.sh`.">
- <Anything that cost >15 minutes to figure out.>

## 5. Pending / follow-ups

- [ ] <Concrete item, with exact command/file when possible.>
- [ ] <CI/deps chores to batch into the next wave branch.>
- [x] ~~<Resolved item>~~ → resolved 20XX-XX-XX (see decision §3.<n>).

## 6. Next wave — plan for the next session

Suggested branch: `feat/<slug>`. Before coding: write the slice spec in
`docs/specs/<feature>.md` (ships in the same PR).

1. <Step 1 of the wave.>
2. <Step 2.>
3. Acceptance: <observable criteria — commands to run, behavior to see.>

New dependencies expected: <list or "none">.

## 7. Quick references

- Roadmap: `docs/plan/implementation-waves.md`
- ADRs: `docs/adr/`
- Specs: `docs/specs/`
- Standard verification: `<typecheck && lint && test && build>` (see
  CLAUDE.md → Commands)
