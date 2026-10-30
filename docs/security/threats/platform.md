# Threat Model: platform (W0 — fundação)

- **Date**: 2026-09-25
- **Author(s)**: Engenharia
- **Status**: Accepted
- **Scope**: `GET /v1/health`, `GET /v1/version`, rota interna `/lab`, logs, pipeline CI/CD e cadeia de dependências
- **Linked spec**: `docs/specs/platform.md`
- **Linked ADR(s)**: ADR-0003, ADR-0004, ADR-0005, ADR-0006

## 1. Overview

A W0 publica dois probes públicos sem dados, uma rota interna que serve arquivos estáticos do Design System fora de
produção e o pipeline que leva código a produção. Não há autenticação, banco em uso pelo app nem dado pessoal.
O maior valor a proteger nesta fase é o **caminho até produção** (segredos da CI e integridade do deploy).

## 2. Assets

- Secrets da CI: `VERCEL_TOKEN`, `DATABASE_URL_MIGRATIONS` (credencial do dono do schema no Supabase).
- Integridade do deployment de produção e do schema do banco.
- Arquivos do repositório fora do Design System (código, configuração).
- Disponibilidade dos probes.

## 3. Actors

| Actor                     | Trust level | Notes                                              |
|---------------------------|-------------|----------------------------------------------------|
| Anonymous user            | untrusted   | acessa `/v1/health`, `/v1/version`                 |
| Colaborador com push      | medium      | GitHub Free não protege `main`                     |
| Contribuidor via fork/PR  | low         | PRs não recebem secrets                            |
| GitHub Actions / Vercel   | high        | executam build e deploy                            |
| Attacker (external)       | hostile     |                                                    |

## 4. Data flow diagram

```mermaid
flowchart LR
  user[Visitante] -.trust boundary.-> app[Next.js na Vercel]
  app --> ds[(src/design-system, só leitura)]
  dev[Push / PR] -.trust boundary.-> ci[GitHub Actions]
  ci -.trust boundary.-> db[(Supabase PostgreSQL)]
  ci -.trust boundary.-> vercel[Vercel produção]
```

## 5. STRIDE analysis

| Component | S | T | R | I | D | E | Notes |
|-----------|---|---|---|---|---|---|-------|
| `/v1/health`, `/v1/version` | — | — | — | T-001 | T-005 | — | sem entrada além do header de correlação |
| `/lab` | — | — | — | T-002, T-003 | T-005 | — | só GET de arquivos estáticos |
| Logs | T-004 | T-004 | — | T-004 | — | — | JSON com `correlation_id` |
| Pipeline CI/CD | T-006 | T-006 | — | T-007 | — | T-006 | segredos e deploy |
| Dependências | — | T-008 | — | — | — | T-008 | npm e actions |

Repúdio não se aplica à W0: não há mutation. A trilha de auditoria chega na W1 (TECH-092).

## 6. Threats (prioritized)

### T-006 [HIGH] Tampering/Elevation — deploy ou migração não autorizados em produção

- **Vector**: push direto em `main` (sem branch protection no GitHub Free) ou deploy automático da integração Git
  publicando código que não passou pelos gates; migração aplicada fora de ordem.
- **Likelihood**: Medium · **Impact**: High · **Risk**: High
- **Mitigation**:
  - Config: `vercel.json` desliga o deploy Git de `main`; produção só pelo job `deploy`, que depende de `migrate`,
    que depende de todos os gates. `dbmate --strict` recusa migração fora de ordem.
  - Process: toda mudança entra por PR (`CLAUDE.md`); `concurrency: production` impede dois deploys simultâneos.
  - Residual: quem tem push em `main` ainda dispara a CI de produção — aceito até haver plano pago do GitHub.
- **Owner**: Engenharia · **Tracking**: W0

### T-007 [HIGH] Information disclosure — vazamento de segredos da CI

- **Vector**: secret impresso em log, exposto a PR de fork ou versionado por engano.
- **Likelihood**: Low · **Impact**: High · **Risk**: Medium
- **Mitigation**:
  - Config: secrets só nos jobs `migrate` e `deploy`, que rodam apenas em push para `main` (PRs não os recebem);
    `permissions: contents: read`.
  - Code: `scripts/lib/dbmate.mjs` passa a URL por variável de ambiente (fora de `argv`) e mascara credenciais em
    mensagens de erro; `loadEnv` nunca inclui valores em erros.
  - Infra: gitleaks em toda execução, com o histórico completo.
- **Owner**: Engenharia · **Tracking**: W0

### T-003 [MEDIUM] Information disclosure — path traversal em `/lab`

- **Vector**: `/lab/../../.env.local` ou variações codificadas para ler arquivos fora do Design System.
- **Likelihood**: Medium · **Impact**: High · **Risk**: Medium
- **Mitigation**:
  - Code: lista fechada de pastas (`lab`, `styles`, `tokens`, `fonts`, `brand`, `icons`) e extensões; segmentos
    validados (sem `.` inicial nem `..`); caminho resolvido verificado sob a raiz; testes com os vetores.
  - Config: 404 em produção; o bundle de produção só inclui essas pastas (`outputFileTracingIncludes`).
- **Owner**: Engenharia · **Tracking**: `tests/features/platform/presentation/lab.test.ts`

### T-004 [MEDIUM] Spoofing/Tampering/Information disclosure — logs

- **Vector**: `x-correlation-id` forjado para injetar linhas ou confundir a investigação; PII registrada por engano.
- **Likelihood**: Medium · **Impact**: Medium · **Risk**: Medium
- **Mitigation**:
  - Code: id de correlação aceito só com 8–128 caracteres seguros, senão UUID; logs em JSON (sem injeção de
    linha); chaves sensíveis (`cpf`, `email`, `nome`, `token`, …) redigidas mesmo aninhadas; caminho sem query string.
- **Owner**: Engenharia · **Tracking**: `logger.test.ts`, `route.test.ts`

### T-008 [MEDIUM] Tampering — cadeia de dependências

- **Vector**: pacote npm ou action comprometidos.
- **Likelihood**: Low · **Impact**: High · **Risk**: Medium
- **Mitigation**:
  - Config: versões exatas e lockfile; `npm ci`; `npm audit --omit=dev --audit-level=high`; Semgrep CE; actions
    fixadas por SHA completo; Dependabot com `cooldown` de 7 dias; `.npmrc` `min-release-age=7` (npm ≥ 11.10).
- **Owner**: Engenharia · **Tracking**: ADR-0004

### T-002 [LOW] Information disclosure — Lab indexado ou exposto em produção

- **Mitigation**: 404 com `VERCEL_ENV=production`; `X-Robots-Tag: noindex, nofollow` e `<meta name="robots">`;
  previews sob Deployment Protection da Vercel. O conteúdo do Lab não é sigiloso.

### T-001 [LOW] Information disclosure — `/v1/version` revela o commit

- **Mitigation**: aceito. O sha não é segredo e é necessário para verificar o deploy (`/deploy`).

### T-005 [LOW] Denial of service — probes e Lab

- **Mitigation**: respostas estáticas e baratas, `cache-control: no-store` só nos probes; proteção de borda da Vercel.
  Rate limit de escrita chega na W5. (W5, 2026-10-19: aplicado à escrita pública de interesse — STRIDE
  [`ownership`](ownership.md); probes e Lab seguem sem limitador da aplicação, com a proteção de borda da Vercel.)

## 7. Abuse cases

- Varredura automatizada de caminhos em `/lab` procurando `.env*`, `package.json` ou código-fonte → 404 (T-003).
- PR de fork tentando exfiltrar secrets pela CI → jobs com secrets não rodam em PR (T-007).
- Push direto em `main` para pular a revisão → gates continuam obrigatórios antes de `migrate` e `deploy` (T-006).
- Cabeçalhos de segurança adicionais (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`)
  em todas as respostas; CSP entra com a primeira página pública (W4).

---

## W1 — núcleo de commands, jobs e banco da aplicação (2026-09-26)

- **Scope**: pipeline de commands (TECH-054), `GET /api/jobs/{job}` (Vercel Cron), outbox, conexão do app ao Supabase
  como `luxtory_app`, verificador SCRAM, schema `app`.
- **Linked**: `docs/specs/platform.md` → W1; ADR-0006, ADR-0007; runbook `docs/how-to/operacao.md`.

### STRIDE (W1)

| Component | S | T | R | I | D | E | Notes |
|-----------|---|---|---|---|---|---|-------|
| `/api/jobs/{job}` | T-101 | — | — | T-101 | T-105 | — | público na internet, protegido por segredo |
| Executor de commands | — | T-103 | T-102 | — | T-105 | T-103 | nenhum command de negócio exposto na W1 |
| `audit_log` / `operation` | — | T-102 | T-102 | T-104 | — | — | trilha só de inserção |
| Conexão app → Supabase | T-106 | T-106 | — | T-106 | — | T-103 | TLS e credencial do papel de aplicação |
| Outbox / notificações | — | — | — | T-104 | T-105 | — | entrega ao menos uma vez |

### T-106 [HIGH] Spoofing/Information disclosure — credencial ou conexão do banco canônico

- **Vector**: `DATABASE_URL` marcada também para Preview (qualquer branch lê o banco canônico); TLS sem verificação
  (MITM entre Vercel e Supavisor); senha do papel em texto puro no SQL Editor ou nos logs do Supabase.
- **Mitigation**:
  - Code: `getDatabase` recusa conexão com `VERCEL_ENV` diferente de `production` antes de abrir socket (ADR-0007);
    `sslmode` só `verify-full` (CA raiz do Supabase fixada no código, host conferido) ou `disable` (local);
    mensagens de erro nunca incluem a URL.
  - Process: senha definida por verificador SCRAM gerado localmente (`npm run db:password-verifier`); fingerprint da
    CA conferido no runbook.
- **Owner**: Engenharia · **Tracking**: `connection.test.ts`, `app-core.db.test.ts`

### T-102 [HIGH] Repudiation/Tampering — adulteração da trilha de auditoria

- **Vector**: bug ou credencial do app reescrevendo `audit_log` ou o estado de `operation`.
- **Mitigation**:
  - DB: `luxtory_app` só tem `INSERT` em `audit_log`; gatilhos recusam `UPDATE`/`DELETE`/`TRUNCATE` até para o dono;
    `operation` só avança de estado e nunca é apagada; resposta de idempotência gravada uma vez.
  - Code: command sem registro de auditoria não comita (REQ-015). O selo encadeado chega na W30 (TECH-092).
- **Owner**: Engenharia · **Tracking**: `app-core.db.test.ts`, `commands.db.test.ts`

### T-103 [MEDIUM] Elevation/Tampering — privilégio excessivo ou command fora do registro

- **Vector**: handler que escreve estado crítico sem passar pelo pipeline; papel de aplicação com DDL.
- **Mitigation**: registro fechado do TECH-051 (executor recusa handler não registrado); `luxtory_app` sem DDL, sem
  acesso a `dbmate` e só com os `UPDATE` de coluna do núcleo; guard obrigatório por injeção (W2 entrega o real).
- **Owner**: Engenharia · **Tracking**: `registry.test.ts`, `executor.test.ts`, `app-core.db.test.ts`

### T-101 [MEDIUM] Spoofing/Information disclosure — chamada não autorizada de jobs

- **Vector**: terceiro chamando `/api/jobs/outbox` repetidamente, adivinhando o segredo ou enumerando nomes de job.
- **Mitigation**: `Authorization: Bearer <CRON_SECRET>` comparado em tempo constante (hash dos dois lados); segredo
  com ao menos 32 caracteres; autenticação antes de resolver o nome (401 não revela se o job existe); sem segredo
  configurado → 503 (endpoint desligado). Execuções repetidas são idempotentes (TECH-090).
- **Owner**: Engenharia · **Tracking**: `jobs.test.ts`

### T-104 [MEDIUM] Information disclosure — PII em auditoria, eventos ou erros de consumidor

- **Mitigation**: antes/depois e payloads passam pela mesma redação de chaves sensíveis dos logs; `last_error` do
  outbox e logs de consumidor guardam só o nome do erro; snapshots identificam entidades por id.
- **Owner**: Engenharia · **Tracking**: `executor.test.ts`, `commands.db.test.ts`, `outbox.db.test.ts`

### T-105 [LOW] Denial of service — contenção de locks e varreduras

- **Mitigation**: `lock_timeout` local e tentativas limitadas (runbook); varredura com `FOR UPDATE SKIP LOCKED`, um
  evento por transação e lote limitado; rate limit de escrita na W5. (W5: só a escrita pública de interesse recebeu o
  limitador; os commands críticos seguem atrás do guard e do `lock_timeout`.)

### Abuse cases (W1)

- Replay de uma mutation com a mesma `Idempotency-Key` e outro corpo → `ERR_IDEMPOTENCY_CONFLICT`, sem efeito.
- Dois retries simultâneos do cliente → uma única operação; o segundo recebe a mesma resposta (CONC-12).
- Preview de branch maliciosa tentando ler o banco → sem credencial e conexão recusada pelo código (ADR-0007).

---

## W4 — Content Security Policy (2026-09-29)

- **Scope**: `src/proxy.ts` (CSP com nonce por requisição, composta com a renovação de sessão) · ADR-0014
- **Mitigação** de XSS e injeção de script em todas as páginas HTML (públicas, `/entrar`, `/admin`): `default-src
  'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'`; `img-src 'self' blob: data:`;
  `font-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`;
  `upgrade-insecure-requests`. Nonce novo a cada requisição (`crypto.randomUUID`). Fora do matcher: `/lab` (interno),
  `/brand/logo` (CSP própria mais restrita), `/v1`, `/api`, `_next`, `favicon.ico`.
- **Verificação**: E2E com zero erro de console (uma violação de CSP aparece como erro) em todas as telas públicas e
  do Admin; teste unitário do cabeçalho e do matcher.
- **Residual**: `'unsafe-eval'` só em `next dev` (desenvolvimento local), nunca no build servido.

## W10 — selagem, custódia e alerta operacional (2026-10-29)

Superfície nova: um job (`open_exercise`) na rota existente `/api/jobs/{job}`, um command de sistema, o disparo
pós-commit da formalização, três tabelas de estado crítico (noite, custódia, ocupação) e uma integração de saída
(e-mail de alerta pelo Resend, fornecedor já contratado). Nenhum endpoint, segredo ou papel novo em Production.
Decisão: ADR-0024.

### T-1001 [HIGH] Elevation/Tampering — operação forjada pelo papel da aplicação

- **Vector**: código (ou SQL injetado) rodando como `luxtory_app` insere uma operação `pending` com o command de sistema
  e grava custódia ou ocupação sem passar pelo guard.
- **Mitigation**: a raiz é autorizada pelos fatos — primeira custódia da noite, modalidade da aquisição, noite selada,
  classificação e check-in canônicos —, então uma operação forjada só obtém a selagem que o sistema faria; operação já
  encerrada é recusada; sem `UPDATE` em `date_custody` e sem `INSERT`/`UPDATE` em
  `date_occupancy` e com o gate `app.assert_inventory_transition_enabled` (recusa todo papel exceto o dono do schema,
  mesmo com privilégio concedido), nenhuma transição ou ocupação é executável pela aplicação na W10; selagem limitada
  pelo banco ao exercício corrente e ao seguinte (relógio do servidor, nas duas pontas) e `sealed_at` carimbado pelo
  banco; SQL só parametrizado (Kysely, Semgrep). Uma operação `pending` comitada pelo próprio papel é reutilizável — sem
  capacidade além da de inserir uma nova. A falta
  da trilha do executor é sinal de anomalia, não prova: `luxtory_app` também grava `idempotency_record` e `audit_log`.
- **Residual**: o banco não prova que o guard rodou — fronteira de confiança no servidor da aplicação, como em todos os
  commands desde a W1; a trilha não é independente do mesmo papel até a W30. Efeito máximo na W10: selar, de forma
  canônica, um exercício já devido antes do cron, sem efeito econômico — aceito pelo fundador em 2026-10-30,
  estritamente limitado a essa selagem estrutural e condicionado (ADR-0024, "Aceitação do risco residual da W10"). Condição de resolução: antes da primeira wave
  que habilitar cada transição, decidir com o fundador a autorização no banco, implementá-la, verificá-la e só então
  substituir o gate. Superusuário contorna gatilhos (D5, até a W30).
- **Owner**: Engenharia · **Tracking**: `tests/migrations/inventory.db.test.ts` (privilégios e operação forjada)

### T-1002 [MEDIUM] Tampering — reescrita do histórico ou da classificação

- **Vector**: UPDATE/DELETE em noite selada ou custódia; reclassificação de temporada; bifurcação da cadeia.
- **Mitigation**: noite selada sem UPDATE/DELETE/TRUNCATE; custódia só fecha, uma vez, por operação `pending`;
  `UNIQUE(parent_custody_id)`; `CHECK` de temporada canônica (validação na escrita, sem coluna gerada que uma correção
  futura recalcularia); mesmas regras para o superusuário (gatilhos).
- **Owner**: Engenharia · **Tracking**: `inventory.db.test.ts`

### T-1003 [MEDIUM] Denial of service / Repudiation — selagem que não acontece

- **Vector**: cron não entregue (Hobby: sem retry, entrega best effort), falha de item, configuração ausente, função
  interrompida no teto de 300 s.
- **Mitigation**: `after()` logo após a formalização + cron diário; idempotente por item e retomável; orçamento de 240 s;
  alerta `open_exercise_failure` fora do outbox (log sempre; e-mail quando configurado); operação sobre noite não selada
  falha fechada (FK), nunca presume disponibilidade.
- **Residual**: a ausência de execução do cron não é detectável pelo próprio job — reconciliação da W30 ou Vercel Pro (D1).
- **Owner**: Engenharia · **Tracking**: `open-exercise.db.test.ts`, `open-exercise-job.test.ts`, `job-dispatch.test.ts`

### T-1004 [LOW] Information disclosure — conteúdo do alerta

- **Vector**: e-mail de alerta com PII, payload de usuário ou resposta bruta do provedor.
- **Mitigation**: o alerta só carrega ids técnicos, anos e códigos de erro; destinatário e remetente vêm do servidor;
  credencial própria por finalidade (`OPS_ALERT_RESEND_API_KEY`); a resposta do provedor nunca é logada.
- **Owner**: Engenharia · **Tracking**: `operational-alert.test.ts`

## W11 — Direito de Uso, janelas e rotações (2026-10-30)

Superfície nova: um job (`close_exercise`) na rota existente `/api/jobs/{job}`, um command de sistema, o passo
`leap_day` do `open_exercise`, dois eventos e dois consumidores do outbox, a projeção `use_right_balance` e uma função
`SECURITY DEFINER` (manutenção da projeção). Nenhum endpoint, segredo, variável ou papel novo; nenhum dado pessoal novo.
Decisão: ADR-0025.

### T-1101 [HIGH] Elevation/Tampering — Direito de Uso forjado pelo papel da aplicação

- **Vector**: código (ou SQL injetado) rodando como `luxtory_app` insere no ledger, com operação `pending` forjada,
  concessão extra, 29/02 para outra Ação, expiração antecipada (dano ao Titular), consumo, restauração ou correção.
- **Mitigation**: cada movimento é conferido pelos fatos num gatilho INVOKER — concessão só do `open_exercise`, só
  Co-Owner, só exercício selado posterior ao primeiro, quantidade igual ao limite da configuração, única por Ação,
  exercício e bucket; 29/02 só com a noite selada, para a Ação da lista bissexta (função SQL equivalente à do
  TypeScript), uma vez por Second Home e ano e antes do fim efetivo; expiração só do `close_exercise`, depois do fim
  efetivo pelo relógio do servidor e exatamente sobre o restante, com o instante canônico carimbado pelo banco;
  `consume`/`restore` recusados a todo papel exceto o dono do schema, mesmo com o INSERT concedido; `correction`
  recusada a todos. Operação de outra transação é recusada (consistência, não autenticidade).
- **Residual (pendente de ratificação, ADR-0025)**: efeito máximo de uma operação forjada — selar um exercício devido
  com as concessões canônicas; conceder o 29/02 à Ação canônica no máximo uma execução antes do job; registrar a
  expiração exata de saldo já inutilizável. Fronteira de confiança no servidor, como desde a W1; superusuário contorna
  gatilhos (D5, até a W30). Antes de habilitar consumo/restauração (W12/W13) e correção (W13): regra de autorização no
  banco decidida com o fundador.
- **Owner**: Engenharia · **Tracking**: `tests/migrations/use-right.db.test.ts` (privilégios reais e operação forjada)

### T-1102 [MEDIUM] Elevation — abuso da função SECURITY DEFINER do saldo

- **Vector**: reutilizar `app.use_right_balance_apply()` (dono do schema) para escrever saldos arbitrários — por exemplo,
  criando um gatilho próprio que a chame com uma linha forjada —, ou contornar o gate de dentro dela.
- **Mitigation**: sem `EXECUTE` para ninguém (requisito para criar gatilho com a função); `luxtory_app` sem `CREATE` em
  esquema algum; a função confere que roda como gatilho AFTER INSERT ROW de `app.use_right_ledger`, deriva o efeito só
  da linha já validada, não tem parâmetro nem SQL dinâmico e usa `search_path` vazio; gate e validações ficam em
  funções INVOKER (o gate decide por `current_user`); `granted` e chave imutáveis na projeção (inclusive para o dono);
  sem INSERT/UPDATE/DELETE no saldo para `luxtory_app`.
- **Owner**: Engenharia · **Tracking**: `use-right.db.test.ts`

### T-1103 [MEDIUM] Denial of service / Repudiation — concessão, 29/02 ou expiração que não acontecem

- **Vector**: cron não entregue (Hobby), sorteio atrasado (beacon, outbox), falha de item, orçamento esgotado.
- **Mitigation**: passos por estado, uma transação cada, chave por passo e por execução, idempotentes e retomáveis; o
  passo `leap_day` é descoberto também em exercício selado antes; `close_exercise` varre todo exercício com saldo,
  de qualquer ano; validade não depende do job — o banco recusa uso depois do fim efetivo e nenhuma outra Ação usa o
  29/02 pendente; falhas do `open_exercise` alertam (`open_exercise_failure`), as do `close_exercise` vão ao log
  estruturado (o TECH-101 não tem alerta deste job).
- **Residual**: 29/02 vencido antes de o sorteio terminar não é concedido (D5); o log `leap_day_lapsed` só cobre o
  horizonte do job, e o vencimento de qualquer exercício é reconstruível dos fatos (consulta do runbook). Falha geral do
  `close_exercise` → 500 com log estruturado, sem efeito parcial. Ausência do cron não é detectável pelo próprio job
  (W30 / Vercel Pro, D1).
- **Owner**: Engenharia · **Tracking**: `tests/features/calendar/use-rights.db.test.ts`

### T-1104 [LOW] Information disclosure — notificações e eventos

- **Vector**: payload de evento ou notificação com dado pessoal; notificação a quem não é mais titular.
- **Mitigation**: só ids, exercício, posição e instantes; destinatários resolvidos na entrega pelos titulares vigentes da
  Ação; leitura do saldo e dos novos movimentos fechada a `authenticated`/`anon` (o Titular continua só com concessões).
- **Residual**: o papel da aplicação já grava `notification` desde a W1 — uma notificação forjada não cria direito
  (REQ-097).
- **Owner**: Engenharia · **Tracking**: `use-rights.db.test.ts`
