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

[CUSTOMIZE] List specs as you add them, e.g.:

- [orders](orders.md) — order placement, payment, fulfillment
- [auth](auth.md) — sign-in, sign-up, password reset
