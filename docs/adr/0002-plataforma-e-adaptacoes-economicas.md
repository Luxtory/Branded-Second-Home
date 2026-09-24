# 0002. Plataforma (Vercel + Supabase + Upstash) e adaptações econômicas ao 03

- **Date**: 2026-09-24
- **Status**: Accepted
- **Deciders**: Luxtory (responsável pelo produto); Engenharia
- **Tags**: architecture, infra, security, cost

## Context

O `03 — Technical Spec` v3.13 (`docs/specs/canonical/03-technical-spec.md`) define
princípios e decisões técnicas (ADR-001 a ADR-008 do 03, TECH-001 a TECH-110), mas deixa
em aberto a escolha concreta de plataforma e de ferramentas (TECH-010). Além disso:

- a Luxtory definiu como plataforma **Vercel, Supabase e Upstash**;
- a Luxtory é uma startup e exige **operação econômica**: não contratar agora
  serviços pagos adicionais que o texto do 03 pressupõe (KMS, storage imutável,
  PITR);
- o repositório já estabelece convenções próprias: migrations reversíveis em
  `migrations/` e slices em `src/features/` (ver `CLAUDE.md`).

Os ADR-001 a ADR-008 do 03 continuam válidos **por referência** e não são reescritos aqui.

## Decision

### Plataforma e ferramentas

| Tema | Decisão | Base |
|---|---|---|
| App e hosting | **Next.js (App Router)**, app único, **TypeScript strict**, hospedado na **Vercel** (região `gru1`). Rotas em `src/app/` apenas delegam a `src/features/<módulo>/presentation` | TECH-010, ADR-001 do 03 |
| Dados, Auth e arquivos | **Supabase** (região `sa-east-1`): PostgreSQL, Auth (MFA obrigatório para Admin/Super Admin) e Storage privado | TECH-010, TECH-050, TECH-100 |
| Escrita | Commands só no servidor, por conexão PostgreSQL direta/pool. PostgREST/`supabase-js` nunca executam mutações críticas | ADR-002 do 03 |
| Acesso a dados | **Kysely** (query builder **sem geração de schema**), com transações e locks explícitos | TECH-010, TECH-053 |
| Migrations | SQL versionado e **reversível** (`-- migrate:up` / `-- migrate:down`) em **`migrations/`**, com **dbmate**. Em produção, aplicado **somente pela CI** | TECH-010, `CLAUDE.md` |
| Jobs | **Vercel Cron** chamando endpoints protegidos que invocam os mesmos domain commands. Cadências ficam no runbook | TECH-090, TECH-001 |
| Upstash | **Redis apenas para rate limit.** Nunca decide disponibilidade, saldo, preço ou autorização | TECH-100, ADR-001 do 03 |

As demais escolhas de biblioteca (UI, validação, e-mail, testes, observabilidade) são
feitas e registradas em ADR na W0, dentro dos princípios do 03.

### Adaptações econômicas ao 03

| Requisito do 03 | Adaptação adotada agora | Gatilho de upgrade |
|---|---|---|
| TECH-100: chaves em KMS | Criptografia de CPF/CNPJ e documentos na aplicação (AES-256-GCM), com chaves em **Vercel Sensitive Environment Variables** e `key_id` gravado em cada valor cifrado. HMAC de busca com segredo **separado**. Chaves nunca no banco, no código ou em logs | Quando houver orçamento ou exigência regulatória, trocar para KMS. O `key_id` permite rotação e migração sem mudar o modelo de dados |
| TECH-092: último hash ancorado em storage imutável | Cadeia `audit_seal` mantida integralmente (JCS RFC 8785 + SHA-256). Ancoragem periódica **gratuita** via **OpenTimestamps**, com a prova `.ots` guardada junto do selo | Trocar ou acrescentar storage com retenção imutável quando houver orçamento |
| TECH-101: PITR com restore testado | Backups diários gerenciados + **teste de restauração obrigatório e documentado** | **Ativar PITR no go-live das operações econômicas** (Créditos, pagamentos, reservas de terceiros) |

Todas as demais exigências do 03 permanecem integrais.

## Consequences

### Positive

- Nenhuma decisão de plataforma fica para a IA implementadora inventar.
- Custo inicial mínimo: sem KMS, sem storage imutável e sem PITR pagos antes do go-live.
- Migrations seguem a convenção do repositório (`migrations/`, com rollback).

### Negative

- Chaves em variáveis de ambiente têm proteção menor que um KMS dedicado. A mitigação é
  restringir o acesso ao projeto Vercel, usar segredos separados e manter a rotação por `key_id`.
- Sem PITR, a janela de perda de dados antes do go-live é a do último backup diário.
- Ancoragem via OpenTimestamps depende de serviço público gratuito, sem SLA.

### Neutral / follow-ups

- **Recomendação à Luxtory:** registrar estas adaptações na próxima versão do `03`
  (hierarquia 01 → 02 → 03).
- O runbook de go-live deve incluir a ativação do PITR.

## Alternatives considered

- **KMS gerenciado (AWS KMS / Google Cloud KMS) + storage imutável (S3 Object Lock / GCS
  Bucket Lock):** atende ao texto literal do 03, mas adiciona fornecedor e custo recorrente
  antes da receita. Adiado.
- **Supabase CLI migrations (`supabase/migrations`):** não suportam `down` e fogem da pasta
  `migrations/` do repositório.
- **ORM com geração de schema:** vedado pela TECH-010.
- **Upstash QStash para jobs:** adiciona um serviço sem necessidade. Os jobs do 03 são
  idempotentes e o Vercel Cron basta.

## References

- `docs/specs/canonical/03-technical-spec.md`: ADR-001…008, TECH-001, TECH-010, TECH-053, TECH-090, TECH-092, TECH-100, TECH-101
- `docs/adr/0001-record-architecture-decisions.md`
- OpenTimestamps: https://opentimestamps.org/
- dbmate: https://github.com/amacneil/dbmate
