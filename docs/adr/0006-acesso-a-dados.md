# 0006. Acesso a dados: schemas, papéis, migrations e leituras sob RLS

- **Date**: 2026-09-25
- **Status**: Accepted
- **Deciders**: Engenharia
- **Tags**: architecture, database, security

## Context

O `03` fixa os princípios: PostgreSQL como fonte de verdade (ADR-001), escritas só no servidor por conexão direta
(ADR-002), leituras protegidas por RLS e ledgers/auditoria só de inserção (TECH-052), query builder sem geração de
schema (TECH-010). O ADR-0002 fixou Supabase, dbmate e Kysely. Falta decidir **onde** ficam os objetos, **com qual
papel** cada caminho acessa o banco e **como** as migrations chegam à produção.

Fatos do Supabase que pesam na decisão: o schema `public` é exposto pela Data API (PostgREST) e recebe privilégios
padrão para `anon` e `authenticated`; a conexão direta é só IPv6, e o pooler (Supavisor) oferece modo sessão e modo
transação em IPv4; funções serverless da Vercel abrem muitas conexões curtas.

## Decision

1. **Schema `app`** para todas as tabelas, funções e tipos da aplicação. Nada da aplicação em `public`. SQL de
   migration sempre qualifica o schema (`app.booking`), sem depender de `search_path`.
2. **Migrations com dbmate** em `migrations/`, sempre com `-- migrate:up` e `-- migrate:down`. O histórico fica em
   **`dbmate.schema_migrations`** (schema criado pelo próprio dbmate), fora de `public` e de `app`, sem privilégio
   para os papéis de API. As flags vivem num só lugar (`scripts/lib/dbmate.mjs`): `--strict` (ordem),
   `--no-dump-schema`. Migration aplicada é imutável: correção = nova migration.
3. **Prova de rollback.** `npm run db:check` sobe tudo, desce tudo, compara o catálogo com o estado inicial e sobe
   de novo, em PostgreSQL real (ADR-0005). Roda em toda CI.
4. **Produção só pela CI.** O job `migrate` aplica as migrations com `DATABASE_URL_MIGRATIONS` (pooler em modo
   sessão, IPv4, papel dono dos objetos) em push para `main`, antes do `deploy`. Nenhuma migration é aplicada por
   console, MCP ou máquina local. Antes de aplicar, um **preflight** (`dbmate status`: mesmo cliente e mesmas regras
   de TLS das migrations, só leitura do histórico, sem criar schema, tabela nem banco) conecta no banco-alvo — uma URL
   ausente ou inválida (host, porta, credencial, banco) derruba o job já no primeiro push, mesmo sem migrations.
5. **Papel de aplicação** (criado na W1): `LOGIN`, sem DDL, sem `UPDATE`/`DELETE` em ledgers, snapshots, versões e
   `audit_log` (TECH-052), com só os privilégios que cada command usa. Conecta pelo Supavisor em **modo transação**
   (IPv4, adequado a serverless): nada de estado de sessão entre transações; configurações só com `SET LOCAL` dentro
   da transação.
6. **Leituras no servidor sob RLS.** Cada leitura de dado de usuário roda numa transação com
   `SET LOCAL ROLE authenticated` e `set_config('request.jwt.claims', <claims verificadas no servidor>, true)`; as
   políticas usam `auth.uid()`. O servidor nunca confia em claims vindas do navegador sem verificar a assinatura.
7. **Data API desligada** no Supabase (runbook da W1). `supabase-js` só para Auth (ADR-002 do `03`).
8. **Tipos do Kysely** gerados do banco já migrado (`kysely-codegen`), nunca o inverso (TECH-010).

## Consequences

### Positive

- Nenhuma tabela da aplicação nem o histórico de migrations fica exposto pela Data API por engano.
- Menor privilégio verificável em teste: o papel de aplicação simplesmente não consegue alterar ledgers e auditoria.
- Toda migration tem `down` provado; produção recebe migrations numa ordem e num caminho só.

### Negative

- Modo transação impede prepared statements nomeados e estado de sessão; o driver e o Kysely são configurados para
  isso.
- `SET LOCAL ROLE` por leitura acrescenta um passo a cada transação de leitura.

### Neutral / follow-ups

- W1: papéis, schema `app`, senha do papel de aplicação (runbook) e desligamento da Data API.
- W2: políticas RLS e testes de autorização com `SET LOCAL ROLE` + claims (TECH-052).

## Alternatives considered

**Tabelas em `public` com RLS em tudo.** Funciona, mas depende de nunca esquecer uma política: uma tabela nova sem
RLS fica legível e gravável pela Data API. Schema próprio falha fechado.

**Migrations pelo Supabase CLI ou pelo MCP (`apply_migration`).** Criaria um segundo histórico
(`supabase_migrations`) paralelo ao do dbmate e exigiria Docker para o fluxo local. Rejeitada (`CLAUDE.md`).

**Aplicação conectando como dona dos objetos.** Mais simples, mas qualquer bug poderia reescrever ledgers e
auditoria, contra o TECH-052. Rejeitada.

## References

- Related ADRs: [ADR-0002](0002-plataforma-e-adaptacoes-economicas.md),
  [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md), [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md)
- `docs/specs/canonical/03-technical-spec.md`: ADR-001, ADR-002, TECH-010, TECH-052, TECH-053, TECH-054
