# Spec: platform

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `platform` do TECH-011 (`src/features/platform/`). Esta versão cobre a fundação da W0; as waves seguintes a
estendem (W1: operação, idempotência, auditoria, outbox, jobs e erros; W30: selo e conciliação).

## 1. Goal

Dar a todas as waves uma base executável e verificável, sem regra de negócio: probes de saúde e versão,
configuração de ambiente validada, logs estruturados com `correlation_id`, relógio injetável, a rota interna do
Design System Lab e o harness de testes com PostgreSQL real (TECH-110).

## 2. Non-goals

- Nenhuma regra de negócio, tabela, command ou job (a partir da W1).
- Autenticação e autorização (W2). Rate limit (W5).
- Página pública e CSP (W4). Preload de fontes (W4, ADR-0004).

## 3. Users / actors

- Visitante anônimo e monitoramento externo: `GET /v1/health`, `GET /v1/version`.
- Equipe (preview/local): `/lab`, referência visual do Design System (ADR-0003).
- CI/CD: gates e deploy (ADR-0004).

## 4. User stories

- Como operador, quero `GET /v1/health` e `GET /v1/version`, para confirmar que o build certo está no ar.
- Como engenheiro, quero `x-correlation-id` em toda resposta e em todo log, para seguir um request de ponta a ponta.
- Como designer ou revisor, quero abrir o Design System Lab num preview, sem que ele exista em produção.

## 5. Contracts

### HTTP API

- `docs/api/openapi.yaml` — operações `getHealth`, `getVersion` (públicas, `security: []`); resposta 500 no schema
  `Error` (TECH-056) com `ERR_INTERNAL`; header `x-correlation-id` de entrada (opcional) e saída.
- `/lab` fica fora do contrato: rota interna de apresentação, não API.

### Events (if any)

- Nenhum. `docs/api/asyncapi.yaml` descreve o outbox (TECH-091); canais a partir da W1.

### Domain model

- `Clock` (port em `application/`): `now(): Date` — todo código dependente do instante recebe um `Clock` (TECH-110).
- `Env` (infraestrutura): só as chaves de `docs/reference/environment.md`, validadas com Zod.

## 6. Acceptance criteria

- [x] `[TECH-056]` `/v1/health` e `/v1/version` respondem conforme o OpenAPI; erro não tratado vira 500 no schema
      `Error`, sem stack trace.
- [x] `[ADR-0003]` `/lab` redireciona para o Lab e serve só `lab/`, `styles/`, `tokens/`, `fonts/`, `brand/` e
      `icons/`, com `noindex`; 404 em produção; axe 0 e sem overflow horizontal de 320 a 1920 px.
- [x] `[TECH-110]` PostgreSQL real sobe, desce e sobe migrations de fixture; `db:check` recusa `down` incompleto.
- [x] `[CONC-12]` duas conexões reais: índice único parcial serializa inserções concorrentes.
- [x] `[REQ-100]` varredura de terminologia cobre `src/` e `docs/api/`.
- [x] `[TECH-100]` logs nunca registram PII nem segredo, mesmo aninhados; a validação de ambiente nunca expõe valores.
- [x] Página 404 em pt-BR com o Design System e axe 0.

## 7. Edge cases

- `x-correlation-id` ausente, curto, longo ou com quebra de linha → UUID novo.
- `VERCEL_GIT_COMMIT_SHA` ausente → `version: "unknown"` (nada inventado, TECH-001).
- Variável de ambiente fora do catálogo (inclusive `ULTRONPX_PURCHASE_EMAIL`) → ignorada: nem exigida nem removida.
- `/lab/../…`, segmentos iniciados por `.`, pastas ou extensões fora da lista, arquivo inexistente → 404.
- Nenhuma migration em `migrations/` → `db:check`, `db:migrate` e o setup de testes seguem sem erro.

## 8. Security considerations

- Authentication: nenhuma nesta versão; `/v1/health` e `/v1/version` são públicos e sem dados sensíveis.
- Authorization: `/lab` só fora de produção; previews ficam sob a Deployment Protection da Vercel.
- Data classification: nenhum dado pessoal. O commit exposto em `/v1/version` não é segredo.
- Threat model: [`docs/security/threats/platform.md`](../security/threats/platform.md).

## 9. Observability

- Logs: JSON por linha (`time`, `level`, `msg`, `correlation_id`, campos); `unhandled route error` e
  `unhandled request error` em nível `error`, com método e caminho sem query string.
- Metrics: Observability nativa da Vercel (requests, erros, latência). Sem métrica própria na W0.
- Alerts: a partir da W1 (TECH-101).

## 10. Rollout plan

- Feature flag: nenhuma.
- Migrations: nenhuma na W0 (`migrations/` vazio).
- Primeiro deploy de produção pela CI após o merge, com os secrets `VERCEL_TOKEN` e `DATABASE_URL_MIGRATIONS`.
- Rollback: `vercel rollback` para o deployment anterior (a W0 não altera dados).

## 11. Open questions

- Nenhuma que bloqueie. Decisões D1–D4 e D6 do plano não afetam a W0.

## 12. References

- Linked ADR(s): `docs/adr/0003-design-system-camada-compartilhada.md`, `docs/adr/0004-toolchain-bibliotecas-e-pipeline.md`,
  `docs/adr/0005-testes-com-postgresql-real-sem-docker.md`, `docs/adr/0006-acesso-a-dados.md`
- Plano: `docs/plan/implementation-waves.md` → Wave 0
- `03`: TECH-010, TECH-011, TECH-056, TECH-100, TECH-110
