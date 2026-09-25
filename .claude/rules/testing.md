---
# Escopo: arquivos de teste
paths:
  - "tests/**/*"
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Testing

## Strategy

Camadas do TECH-110 (`03` §12) — detalhe em ADR-0005:

- `tests/**/*.test.ts` — projeto Vitest `unit` (unit + contratos OpenAPI com Ajv)
- `tests/**/*.db.test.ts` — projeto Vitest `db`: PostgreSQL 17 real (`embedded-postgres`), banco-modelo migrado e
  clonado por teste (`tests/support/test-database.ts`); concorrência com conexões reais e barreira determinística
- `tests/e2e/*.spec.ts` — Playwright + axe sobre o build de produção, com o Chrome do sistema
- Títulos citam o ID que o teste prova, por extenso: `[REQ-034]`, `[INV-1][CONC-1]`, `[PD-003][EC-3]` — lidos por
  `npm run trace` (`[EC-n]` = item n do `02` §15; `[CONC-n]` = par n da lista de concorrência do TECH-110)
- Relógio sempre injetado (`Clock`); nunca `new Date()` em código sob teste

- Unit tests for business logic and utilities
- Integration tests for API endpoints and database operations
- Prefer testing behavior, not implementation details

## Commands

```bash
# Run all tests:
npm test                      # Vitest unit + db e testes do Design System
npm run test:e2e              # next build + Playwright/axe
# Run single test:
npx vitest run tests/features/platform/presentation/lab.test.ts
npx vitest run --project db   # só os testes com PostgreSQL real
npx playwright test tests/e2e/lab.spec.ts   # exige um `next build` antes
# Run with coverage:
npm run coverage              # falha abaixo de 80% em domain/ e application/
# Reset test DB:
# não há estado a limpar: cada execução sobe um PostgreSQL descartável e cada teste clona o banco-modelo
npm run db:check              # up → down → up das migrations
```

## Conventions

- Test files mirror source structure: `src/services/foo.ts` → `tests/services/foo.test.ts`
- Test names describe behavior: `should return 404 when user not found`
- Each test is independent — no shared mutable state between tests
- Use factories/fixtures for test data, not hardcoded objects
- Never mock what you don't own — wrap external deps in adapters, mock the adapter

## Before Committing

- Run the relevant test file after each change, not the full suite
- Full suite runs in CI — locally, focus on the files you changed
