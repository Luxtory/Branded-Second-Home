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
- [x] `/favicon.ico` serve o ícone oficial `icon/moroccan-blue` do kit, byte a byte (sha256 do manifest); zero erros
      de console no Lab e na página 404.

## 7. Edge cases

- `x-correlation-id` ausente, curto, longo ou com quebra de linha → UUID novo.
- `VERCEL_GIT_COMMIT_SHA` ausente → `version: "unknown"` (nada inventado, TECH-001).
- Variável de ambiente fora do catálogo (inclusive `ULTRONPX_PURCHASE_EMAIL`) → ignorada: nem exigida nem removida.
- `/lab/../…`, segmentos iniciados por `.`, pastas ou extensões fora da lista, arquivo inexistente → 404.
- Nenhuma migration em `migrations/` → `db:check`, `db:migrate` e o setup de testes seguem sem erro.
- "Produção" do `/lab` = `VERCEL_ENV=production`, lido a cada request: é o valor que a Vercel injeta, em runtime, no
  deployment com target Production (o job `deploy` da CI usa `--prod`). `next build && next start` local não define
  `VERCEL_ENV` e por isso mantém o Lab, como num preview. Conferido com o mesmo build: `VERCEL_ENV=production` → 404 em
  `/lab`, no HTML e nos assets; `preview` → Lab disponível.

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

---

## W1 — Núcleo de commands

> Extensão da W0 (plano → Wave 1). Mesmo módulo `platform`; as seções abaixo seguem a numeração do template.

### W1.1 Goal

Todo command crítico passa por um único pipeline, idempotente e auditável (TECH-054): autoriza → idempotência →
`BEGIN` → locks na ordem do TECH-053 → revalidação → estados/ledgers/auditoria → `COMMIT` → outbox. Os módulos das
waves seguintes só escrevem o handler; operação, idempotência, auditoria, retry e outbox vêm do núcleo.

### W1.2 Non-goals

- Nenhum command de negócio: o registro do TECH-051 é declarado completo, os handlers chegam com cada wave.
- Guard real, sessão e RLS (W2): o núcleo recebe um `CommandGuard` por injeção.
- Selo da auditoria e ancoragem (W30); alertas do TECH-101 (W30).
- Nenhum endpoint `/v1` novo e nenhuma tela.

### W1.3 Actors

- Titular, Admin, Super Admin e parceiros com `authorization_grant` (TECH-051), identificados pelo guard (W2).
- Sistema: jobs do TECH-090 invocam os mesmos commands (ADR-006) com ator `system`.
- Vercel Cron: chama `/api/jobs/{job}` com `Authorization: Bearer <CRON_SECRET>`.

### W1.4 Contracts

**Registro fechado (TECH-051, TECH-011).** `application/commands/registry.ts` lista os commands críticos da tabela
do TECH-051 com módulo dono, autoridade e exigência de Membership. Um teste compara o registro com a tabela do `03`.
O executor recusa handler de command fora do registro. Os dois comandos de PRL da tabela, sem nome no `03`, recebem
os identificadores `publish_initial_prl` e `change_published_prl`.

**Executor** (`createCommandExecutor`), para cada `execute(handler, { actor, idempotencyKey, correlationId, input })`:

1. valida o input com o schema Zod do handler; inválido → `ERR_VALIDATION`;
2. autoriza pelo `CommandGuard`; negado → `ERR_PERMISSION` (a decisão devolve `authorization_ref`, TECH-002);
3. idempotência (ADR-006): escopo = ator (`user:<id>` ou `system:<job>`); `request_hash` = SHA-256 do JSON estável de
   `{command, acting_party_id, role, input}`. Mesma chave e mesmo hash → replay da resposta gravada; hash diferente →
   `ERR_IDEMPOTENCY_CONFLICT`;
4. transação `READ COMMITTED` (ADR-005) com `SET LOCAL lock_timeout`: reserva a chave (`idempotency_record`), cria
   `operation(pending)`, roda o handler, grava auditoria e eventos, marca `committed` e a resposta, `COMMIT`;
5. `deadlock_detected` ou `lock_not_available` → nova tentativa com a mesma chave, até `COMMAND_MAX_ATTEMPTS`
   (TECH-053); esgotado → `ERR_UNAVAILABLE`, sem nada gravado;
6. rejeição do handler (`CommandRejection` com código TECH-056) → `ROLLBACK`; numa transação própria grava
   `operation(failed)` e a resposta `rejected` para o replay;
7. depois do commit, o chamador HTTP agenda o disparo do outbox (`after()` do Next).

O handler recebe `input`, `actor`, `operationId`, `now` (do `Clock`), a transação, uma `LockSequence` e os coletores
`audit(...)` e `emit(...)`. **Sem ao menos um registro de auditoria o commit é recusado** (REQ-015 para todo command,
presente e futuro).

**Ordem de locks (TECH-053).** `LockSequence.claim(classe, chaves)` devolve as chaves em ordem crescente e lança
`LockOrderViolation` se a classe vier antes de uma já travada, ou se chaves da mesma classe não forem crescentes em
relação às já travadas. É erro de programação: vira `ERR_INTERNAL` e `ROLLBACK`.

**Erros (TECH-056, REQ-098).** Códigos mínimos do TECH-056 + `ERR_INTERNAL`, `ERR_VALIDATION`, `ERR_UNAUTHENTICATED`,
`ERR_NOT_FOUND` e `ERR_UNAVAILABLE`, com mensagem pt-BR por código (`presentation/i18n/pt-br.ts`) e status HTTP. Cada
causa do REQ-098 aponta para ao menos um código. Violação de constraint vira código pelo prefixo do nome da constraint:
`occupancy_` → `ERR_BOOKING_CONFLICT`; `custody_` → `ERR_CAPACITY_UNAVAILABLE`; `balance_` → `ERR_USE_RIGHT_BALANCE`;
`credits_` → `ERR_CREDITS_INSUFFICIENT`; outras → `ERR_INTERNAL`.

**HTTP.** `docs/api/openapi.yaml`: enum `ErrorCode`; `GET /api/jobs/{job}` (fora de `/v1`, esquema `cronSecret`).
Mutations futuras usam `POST` + header `Idempotency-Key` (1 a 255 caracteres visíveis) pelo adaptador
`presentation/commands.ts`.

**Eventos.** `docs/api/asyncapi.yaml`: envelope do outbox (`id`, `type`, `dedup_key`, `operation_id`, `occurred_at`,
`payload`). Entrega ao menos uma vez; consumidor idempotente por `outbox_receipt(event_id, consumer)`; falha de entrega
não desfaz o domínio (TECH-091). Evento sem consumidor registrado é marcado entregue.

**Jobs (TECH-090).** Registro de jobs separado do registro de consumidores do outbox; só nomes do TECH-090. W1 entrega
o job `outbox` (varredura com `FOR UPDATE SKIP LOCKED`, até `OUTBOX_BATCH_SIZE` eventos). Nome fora do registro → 404.

**Modelo de dados** (schema `app`, ADR-0006; migrations em `migrations/`):

| Tabela | Regra |
|---|---|
| `operation` | colunas do TECH-002; estado `pending → committed \| failed`, `committed → compensated`; demais colunas imutáveis; sem `DELETE` |
| `idempotency_record` | PK `(scope, idempotency_key)`; hash, operação e resposta; resposta gravada uma vez |
| `audit_log` | só inserção (`UPDATE`/`DELETE`/`TRUNCATE` falham, até para o dono); `event_type` `command` exige `operation_id` |
| `outbox` | `dedup_key UNIQUE`; `attempts`, `last_error` (só o nome do erro), `delivered_at` |
| `outbox_receipt` | PK `(event_id, consumer)` |
| `notification` | notificação dentro do app; `UNIQUE (event_id, recipient_party_id, kind)` |

Papel `luxtory_app` (ADR-0006 §5): `LOGIN` sem senha na migration (senha pelo runbook), sem DDL, com só `SELECT`,
`INSERT` e os `UPDATE` de coluna que o núcleo usa; nada em `audit_log` além de `INSERT`.

**Configuração (TECH-001: valores do runbook `docs/how-to/operacao.md`).** `DATABASE_URL`, `CRON_SECRET`,
`COMMAND_MAX_ATTEMPTS`, `COMMAND_LOCK_TIMEOUT_MS`, `OUTBOX_BATCH_SIZE`. Ausente → a função dependente falha com erro
explícito que nomeia a chave; nenhum default.

### W1.5 Acceptance criteria

- [x] `[REQ-015][PD-011]` todo command registrado grava `operation` e `audit_log` com ator, parte representada, papel,
      instante, objeto, operation, base e antes/depois, sem dado pessoal bruto; command sem auditoria não comita.
- [x] `[TECH-052]` `UPDATE`/`DELETE`/`TRUNCATE` em `audit_log` falham como dono e como `luxtory_app`.
- [x] `[ADR-006]` mesma chave e payload repetem a resposta; payload diferente → `ERR_IDEMPOTENCY_CONFLICT`.
- [x] `[ADR-005]` a transação do command roda em `READ COMMITTED` com locks explícitos.
- [x] `[TECH-053]` lock fora da ordem é rejeitado; deadlock/timeout refaz com a mesma chave até o limite.
- [x] `[CONC-12]` chamadas e jobs em paralelo com a mesma chave ou o mesmo evento produzem um único efeito.
- [x] `[TECH-091]` outbox entrega ao menos uma vez, o consumidor ignora duplicatas e falha de entrega não desfaz o
      domínio.
- [x] `[REQ-098]` cada causa do REQ-098 tem código TECH-056 e mensagem pt-BR.
- [x] `[TECH-051]` o registro é exatamente a tabela do TECH-051; `[TECH-090]` jobs só com nomes do TECH-090.
- [x] `[TECH-056]` `ErrorCode` do código = enum do OpenAPI; constraint → código pelo prefixo.
- [x] `[ADR-0007]` sem `DATABASE_URL`, ou com `VERCEL_ENV` diferente de `production`, nenhuma conexão é aberta.

### W1.6 Edge cases

- Duas chamadas simultâneas com a mesma chave: a segunda espera a reserva da primeira e devolve a mesma resposta.
- Chave reutilizada por outro ator: escopos independentes. Mesma chave em outro command: `ERR_IDEMPOTENCY_CONFLICT`.
- Rejeição concorrente com sucesso da mesma chave: vale o que comitou primeiro; o outro devolve o replay.
- Handler que trava fora de ordem ou não audita: `ROLLBACK`, nenhuma `operation` fica gravada.
- Consumidor que falha: `attempts + 1`, `last_error`, evento pendente; a operação continua `committed`.
- Duas varreduras do outbox em paralelo: cada evento é processado por uma; efeito do consumidor uma vez só.
- `CRON_SECRET` ausente: `/api/jobs/*` responde 503 e registra a chave ausente; segredo errado → 401.
- `DATABASE_URL` com `sslmode` diferente de `verify-full` (Supabase) ou `disable` (PostgreSQL local) → recusada.

### W1.7 Security considerations

- Segredos só em Vercel Production (Sensitive) — D3/ADR-0007; o código recusa conexão fora de `production`.
- TLS `verify-full` com a CA raiz do Supabase fixada no repositório (`Supabase Root 2021 CA`, válida até 2031-04-26;
  SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`).
- Senha do `luxtory_app` definida por verificador SCRAM gerado localmente (`npm run db:password-verifier`): o texto
  puro nunca chega ao SQL Editor nem aos logs do Supabase.
- Comparação do `CRON_SECRET` em tempo constante. `last_error` e logs sem PII (TECH-100).
- Threat model: [`docs/security/threats/platform.md`](../security/threats/platform.md) → seção W1.

### W1.8 Observability

- Logs: `command committed`, `command rejected`, `command retry` (nome do command, `operation_id`, tentativa, código),
  `outbox delivery failed` (evento, consumidor, nome do erro), `job completed`/`job failed`; sempre com
  `correlation_id`.

### W1.9 Rollout plan

- Migrations aplicadas pelo job `migrate` depois do merge; o deploy só roda com elas aplicadas.
- Runbook (`docs/how-to/operacao.md`): Data API desligada, senha do `luxtory_app`, variáveis em Production,
  redeploy pela CI. Até lá o job do outbox responde erro explícito e nenhum command é exposto.
- Rollback: `vercel rollback`; as migrations desta wave só criam objetos novos.

### W1.10 References

- ADRs: 0004, 0005, 0006, 0007. `03`: TECH-001, TECH-002, TECH-011, TECH-051, TECH-052, TECH-053, TECH-054,
  TECH-056, TECH-090, TECH-091, TECH-092, ADR-005, ADR-006. `02`: REQ-015, REQ-098, PD-011.
