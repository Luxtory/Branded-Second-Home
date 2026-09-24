# Specs

Spec-Driven Development. Every non-trivial feature has a spec **here** before
or alongside its implementation.

## How to add a new spec

1. Copy `_template.md` to `docs/specs/<feature-name>.md`.
2. Fill in goal, contracts, edge cases, acceptance criteria.
3. Open the implementation PR with the spec included.
4. Update the spec whenever the contract or scope changes.

## Naming

`<feature-name>.md` — kebab-case, matches the slice name under `src/features/`.

## Index

**Canonical documents** (frozen, source of truth; see `CLAUDE.md`):

- [01 — Business Model & Business Rules](canonical/01-business-model-business-rules.md) — v10.1 · 188 BR
- [02 — Product Spec](canonical/02-product-spec.md) — v4.1 · 63 REQ · 11 PD · 6 INV
- [03 — Technical Spec](canonical/03-technical-spec.md) — v3.13 · 49 TECH · ADR-001…008

**Module specs** (one per `src/features/<module>/`, created in the wave that implements it,
citing the canonical IDs):

[CUSTOMIZE] List specs as you add them, e.g.:

- [orders](orders.md) — order placement, payment, fulfillment
- [auth](auth.md) — sign-in, sign-up, password reset
