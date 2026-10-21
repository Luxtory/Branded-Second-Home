# 0007. Ambientes antes do lançamento: sem staging (decisão D3 adiada)

- **Date**: 2026-09-26
- **Status**: Accepted
- **Deciders**: Luxtory (decisão D3 do plano), Engenharia
- **Tags**: infra, database, security, ci

## Context

O plano (`docs/plan/implementation-waves.md` → Decisões, D3) recomendava um segundo projeto Supabase Free como staging
antes da W1, para Previews com banco e validação de migrations em um Supabase real. Fatos em 2026-09-26: não há
slot gratuito disponível; a Luxtory não foi lançada e não tem clientes, dados pessoais nem operação econômica; a CI
já prova toda migration (up → down → up) e todo comportamento de banco num PostgreSQL 17 real (ADR-0005, ADR-0006).

## Decision

**D3 fica adiada, não descartada.** Até o primeiro evento de reavaliação:

1. O projeto Supabase atual é o **banco canônico**. Não se cria staging, branching nem schema paralelo.
2. PRs e CI validam migrations e comportamento de banco com o PostgreSQL real dos testes (`npm test`, `db:check`).
3. **Previews não recebem credenciais do Supabase principal.** `DATABASE_URL` existe só no ambiente Production da
   Vercel. Funções que dependem de banco ficam indisponíveis em Preview e Development da Vercel até o merge, com
   erro explícito. O código reforça a regra: com `VERCEL_ENV` diferente de `production`, a conexão é recusada antes
   de abrir socket (defesa contra marcar Preview por engano no formulário da Vercel).
4. Depois do merge em `main`, as migrations são aplicadas direto no Supabase atual pelos gates existentes (preflight
   → `migrate` → `deploy`, ADR-0004/0006). Falha interrompe o pipeline e é corrigida sem contornar gate.

**Reavaliação obrigatória** de staging antes do primeiro destes eventos:

1. entrada de dados reais de clientes;
2. armazenamento de PII;
3. primeira transação econômica;
4. go-live público.

## Reavaliações

### 2026-09-26 — W2: primeira PII (e-mail de staff)

- **Gatilho acionado.** A W2 cria o primeiro usuário do Supabase Auth (o 1º Super Admin). O e-mail de staff em
  `auth.users` é **dado pessoal**: o gatilho "armazenamento de PII" desta decisão foi acionado. Este registro não
  restringe o gatilho a dados de clientes — ele vale para qualquer PII.
- **Decisão da Luxtory:** continuar temporariamente **sem staging**. Contexto: pré-lançamento, nenhum cliente, e a
  única PII é interna — o e-mail do primeiro membro do staff, guardado pelo Supabase Auth; as tabelas da aplicação
  guardam só o id do usuário.
- **Extensão da regra 3 ao Auth:** o Supabase Auth do projeto canônico só é usado em Production. Previews não recebem
  `NEXT_PUBLIC_SUPABASE_URL` nem `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, e o código recusa o Auth real com `VERCEL_ENV`
  diferente de `production` ([ADR-0008](0008-autenticacao-e-autorizacao-administrativa.md)).
- **Continua obrigatória** nova reavaliação antes do primeiro destes eventos: PII de clientes (W7: party cifrada; W6:
  dados do interesse), primeira transação econômica (W19) ou go-live público.

### 2026-10-20 — W6: estrutura de PII de clientes (contato e pré-qualificação do interesse)

- **Gatilho em preparação.** A W6 cria `interest_contact` e `interest_qualification`
  ([ADR-0018](0018-contato-e-pre-qualificacao-do-interesse.md)), mas nenhuma PII real é persistida: a coleta fica
  fechada em Production (`INTEREST_WRITES` ausente; Aviso de Privacidade `pending`).
- **Decisão do fundador (D3, 2026-10-19):** a W6 reaciona este checkpoint; desenvolvimento e validação seguem em local
  e CI, sem staging, e nenhum staging é criado. A **reavaliação formal** desta decisão é gate do go-live da coleta,
  antes do primeiro contato real gravado (spec [`ownership`](../specs/ownership.md) §14.12).

## Consequences

### Positive

- Nenhuma infraestrutura nem custo extra antes de existir dado a proteger.
- Nenhuma credencial do banco canônico em Previews, que são buildados a partir de qualquer branch.
- Um só caminho de migração para produção, já provado na W0.

### Negative

- A primeira execução de uma migration contra o Supabase real acontece no `migrate` de `main`. Diferenças entre o
  PostgreSQL de teste e o Supabase (extensões, papéis, Supavisor) só aparecem ali; o pipeline para e produção não
  recebe o deploy.
- Previews não exercitam fluxos com banco; a verificação desses fluxos fica nos testes com PostgreSQL real e, depois
  do merge, em produção (ainda sem usuários).

### Neutral / follow-ups

- A guarda de ambiente do item 3 sai quando existir staging (Previews passam a apontar para ele).
- Cada evento de reavaliação entra no checklist da wave que o introduz (W6: dados do interesse; W7: party cifrada;
  W19: primeira cobrança; go-live do R1).

## Alternatives considered

**Segundo projeto Supabase Free (recomendação original).** Fidelidade maior (Supavisor e papéis reais antes do merge),
mas sem slot gratuito disponível e sem dado real a proteger hoje. Reavaliado nos eventos acima.

**Supabase Branching.** Exige plano pago e cria um segundo histórico de migrations, em conflito com o dbmate
(ADR-0006). Rejeitada.

**Schema de staging no projeto atual.** Mistura dados de teste com o banco canônico e expõe a mesma credencial.
Rejeitada.

## References

- Related ADRs: [ADR-0002](0002-plataforma-e-adaptacoes-economicas.md),
  [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md), [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md),
  [ADR-0006](0006-acesso-a-dados.md)
- `docs/plan/implementation-waves.md` → Decisões (D3)
- `03`: TECH-100 (segredos só no servidor), TECH-110 (PostgreSQL real nos testes)
