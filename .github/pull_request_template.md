<!--
  Template note: this PR template ships into your project's GitHub repo
  and shows up automatically when contributors open PRs. Customize freely.
  This comment block is safe to delete once you've reviewed it.
-->

## Summary

<!-- One paragraph: what does this PR do, and why? -->

## Type of change

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — no behavior change
- [ ] docs — documentation only
- [ ] test — tests only
- [ ] chore — tooling, deps, infra
- [ ] sec — security-related change

## Definition of Done

(Mirror of `CLAUDE.md > ## Definition of Done`. Tick everything that applies; strike through anything that doesn't.)

- [ ] Spec in `docs/specs/` updated (if feature is new or changed)
- [ ] ADR created in `docs/adr/` (if there was an architectural decision)
- [ ] OpenAPI / AsyncAPI updated in `docs/api/` (if API contract changed)
- [ ] All tests passing
- [ ] Lint + typecheck green
- [ ] Coverage ≥ 80% in `domain/` and `application/` for the changed slice(s)
- [ ] No secrets, credentials, or PII in logs, commits, or git history
- [ ] CHANGELOG.md updated (if user-facing)
- [ ] Threat model updated in `docs/security/threats/` (if attack surface changed)
- [ ] Diátaxis docs updated in `docs/{tutorials,how-to,reference,explanation}/` (if user-visible behavior changed)
- [ ] UI (if changed): mobile-first with functional parity (ADR-0009) — axe 0 at 390 and 1440 px, no unintended
      horizontal overflow from 320 to 1920 px, main flow run at 390 px with touch; mobile exception only as a
      product decision recorded in the spec
- [ ] Migration rollback tested (if any migration was added)

## Test plan

<!-- How did you verify this works? Bullet list of checks performed. -->

- [ ] ...
- [ ] ...

## Linked issues / specs / ADRs

- Issue: #
- Spec: `docs/specs/<feature>.md`
- ADR: `docs/adr/NNNN-<title>.md`

## Screenshots / recordings

<!-- For UI changes: 390 px and 1440 px captures of each changed screen (review material, not a baseline). -->
