# 0005. Testes com PostgreSQL real, sem Docker

- **Date**: 2026-09-25
- **Status**: Accepted
- **Deciders**: Engenharia
- **Tags**: testing, database

## Context

O TECH-110 exige PostgreSQL real, concorrência, autorização/RLS, falhas e tempo. Invariantes, locks e ledgers do
`03` só são provados no banco de verdade: mocks não servem.

O ambiente de desenvolvimento (WSL) não tem Docker, Podman, `psql` nem `sudo` não interativo, e `/mnt/c` é drvfs
sem permissões POSIX (o PostgreSQL recusa pasta de dados sem `0700`). A CI (`ubuntu-latest`) tem Docker, mas testes
que só rodam na CI quebram a paridade local/CI.

## Decision

Usaremos **`embedded-postgres`** (binários oficiais do PostgreSQL 17, mesmo major do Supabase) em processo local:

1. **Servidor por execução, em processo filho.** O projeto `db` do Vitest sobe um PostgreSQL em porta livre, com a
   pasta de dados em `os.tmpdir()` (ext4/tmpfs), descartada no fim (`tests/support/postgres-global-setup.ts`). O
   servidor roda em `scripts/pg-server.mjs`, nunca no processo do Vitest: o `embedded-postgres` registra
   `async-exit-hook` ao ser importado, que chama `process.exit(0)` no `beforeExit` e fazia o Vitest sair com 0 mesmo
   com testes falhando. O setup falha se algum módulo registrar `beforeExit` no processo do Vitest.
2. **Banco-modelo.** O setup cria `luxtory_template`, aplica a compatibilidade Supabase e roda `dbmate up` com as
   migrations do repositório. Cada teste clona o modelo (`CREATE DATABASE … TEMPLATE`), em isolamento total
   (`tests/support/test-database.ts`).
3. **Compatibilidade Supabase** (`scripts/lib/supabase-compat.sql`, idempotente, nunca aplicada no Supabase real):
   papéis `anon`, `authenticated` e `service_role`; schema `auth` com `auth.uid()`, `auth.role()` e `auth.jwt()`
   com as mesmas definições do Supabase; schema `extensions`.
4. **Concorrência.** Várias conexões reais com barreira determinística: o teste espera, via `pg_stat_activity`, o
   backend concorrente ficar bloqueado aguardando lock antes de liberar o primeiro (`[CONC-n]`).
5. **Migrations.** `npm run db:check` sobe, desce tudo e sobe de novo, e compara o catálogo (schemas, relações,
   funções, tipos, extensões, papéis) antes e depois: um `down` incompleto falha.
6. **E2E.** Playwright sobre `next build && next start`, com o Chrome do sistema (`channel: 'chrome'`: sem download de
   navegador). O PostgreSQL entra no servidor de E2E quando o app passar a usar o banco (W1).
7. **Autenticação de teste** (W2): emissor de JWT de teste com `AUTH_MODE=test`, recusado quando `VERCEL_ENV` existe.
8. **Desenvolvimento.** `npm run db:start` sobe um PostgreSQL persistente em `~/.local/share/luxtory/pg-dev`
   (porta 54329) com as migrations aplicadas.

## Consequences

### Positive

- Mesmo comando e mesmo banco local e na CI; nenhum serviço externo nem credencial nos testes.
- Isolamento por banco clonado: testes independentes e paralelizáveis entre arquivos.
- `down` de migration é verificado de verdade, não por inspeção.

### Negative

- GoTrue (Auth), Supavisor (pooler) e PostgREST não existem localmente: login real, pooler em modo transação e a
  Data API desligada só são verificados em preview/staging (decisão D3).
- A versão da biblioteca é `beta` no npm (a numeração acompanha o PostgreSQL 17.10); fixada e verificada pela CI.
- Extensões do Supabase ausentes no binário oficial precisariam de tratamento quando uma migration as usar.

### Neutral / follow-ups

- Tempo (TECH-110) chega na W8 com `Clock` injetável; checagens de INV-1…INV-6 após todo teste `db` a partir da W10.

## Alternatives considered

**Docker/Testcontainers ou Supabase CLI local.** Ambos exigem Docker, ausente no ambiente de desenvolvimento;
restringir à CI quebraria a paridade.

**PGlite (PostgreSQL em WASM).** Uma conexão por instância: não reproduz locks nem concorrência entre sessões,
que são o núcleo do `03` (TECH-053, TECH-110).

**Projeto Supabase remoto para testes.** Rede, estado compartilhado entre execuções, pausa do plano gratuito e
credenciais nos testes. Fica para verificação de staging, não para a suíte.

## References

- Related ADRs: [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md), [ADR-0006](0006-acesso-a-dados.md)
- `docs/specs/canonical/03-technical-spec.md`: TECH-053, TECH-110, §12
