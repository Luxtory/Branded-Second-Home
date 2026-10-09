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
- [02 — Product Spec](canonical/02-product-spec.md) — v4.2 · 65 REQ · 11 PD · 6 INV
- [03 — Technical Spec](canonical/03-technical-spec.md) — v3.14 · 51 TECH · ADR-001…008

**Module specs** (one per `src/features/<module>/`, created in the wave that implements it,
citing the canonical IDs):

- [platform](platform.md) — módulo `platform` (TECH-011): probes `/v1`, ambiente, logs com `correlation_id`, `Clock`, `/lab`, harness de testes
- [identity](identity.md) — módulo `identity`: login do staff, MFA, guard, `staff_role`, `authorization_grant` (W2)
- [admin](admin.md) — módulo `admin`: superfície `/admin` no App Shell (W2, W2B, W3)
- [catalog](catalog.md) — módulo `catalog`: Brand Partner, Concept e versões, Edition, Residence, autorização do Investor (W3); Discovery público B2C (§13) e [B2B Brand Partners (§14)](catalog.md#14-discovery-público-b2b-brand-partners-bp1), com `P-BP-01` resolvida

**Cross-cutting specs** (not a `src/features/` slice):

- [design-system](design-system.md) — Design System Luxtory (LUXURY + STORY): tokens, tipografia, componentes do R1
- [communication](communication.md) — camada de comunicação das páginas públicas — ADR-0011, ADR-0012, ADR-0013.
  Fontes canônicas congeladas por jornada: [Framework B2C](communication/framework-b2c.md) (aplicação
  [`b2c.md`](communication/b2c.md)) e [Framework Brand Partners](communication/framework-brand-partners.md) (aplicação
  [`brand-partners.md`](communication/brand-partners.md)); base transversal [`luxtory.md`](communication/luxtory.md)
