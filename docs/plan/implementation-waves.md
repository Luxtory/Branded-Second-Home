# Implementation waves — Luxtory Branded Second Home

> Fonte de verdade do roadmap de implementação; a tabela de `NOTES.md` espelha a coluna Status.
> Derivado com `/waves`. O plano original do template foi preservado verbatim no
> [Anexo A](#anexo-a--plano-do-template-concluído).
>
> Specs-fonte do plano Luxtory: canônicos `01` v10.1 → `02` v4.1 → `03` v3.13 (`docs/specs/canonical/`,
> congelados). Plano W0–W30 aprovado em 2026-09-25 e revisado com evidência no mesmo dia (achados F1–F20, ver
> "Registro da revisão"). As seções **Design System (DS)** (concluída) e **Anexo A** abaixo permanecem inalteradas.

## Plano Luxtory — W0…W30

### Premissas verificadas (2026-09-25)

- Canônicos: 63 REQ · 11 PD · 6 INV · 49 TECH · ADR-001…ADR-008 do `03`. Escopo = `02` (inclui §15); fora de
  escopo = `03` §15; guardrails = `03` §13; terminologia = `02` §1.
- Repo: Design System completo (DS-0…DS-7); sem `package.json`; CI stub (`echo` + gitleaks); OpenAPI e AsyncAPI
  com placeholders.
- Máquina: Node 22.22.1, npm 9.2.0; sem Docker, Podman, `psql` nem sudo não interativo. Os binários do
  `embedded-postgres` (PostgreSQL 17.10) e o `dbmate` 2.36.0 executam nativamente no WSL. `/mnt/c` é drvfs sem
  `metadata`: a pasta de dados do PG fica no disco Linux (ext4).
- Plataforma: Supabase PG 17.6 `sa-east-1` Free (sem backup gerenciado; pausa após 7 dias de baixa atividade);
  Vercel Hobby (uso comercial vedado; cron 1×/dia, ±59 min); GitHub privado Free (sem branch protection).
- Versões no npm em 2026-09-25: Next 16.3.6, React 19.3.0, TypeScript 6.0.3 (o 7.x não é aceito pelo
  typescript-eslint, que exige `<6.1`).

### Regras de execução

- Ordem de releases (`CLAUDE.md`): R1 → R2 → R3 → R4. Uma wave só começa depois da última wave do release
  anterior, salvo paralelismo marcado. W0–W2 são a base do R1, com a W2B (fundação de UI de produto) antes da W3.
- 1 wave = 1 branch `feat/w<n>-<slug>` = 1 PR (draft → CI verde → squash, Conventional Commits).
- **Dona** de um ID = a wave que entrega o comportamento decisivo e o teste nomeado. Waves posteriores só
  acrescentam casos à mesma suíte.
- Tags de teste lidas pelo `npm run trace`: IDs canônicos sempre por extenso (`[REQ-034]`, `[TECH-044]`);
  `[EC-n]` = item n da lista do `02` §15; `[CONC-n]` = par n da lista de concorrência do TECH-110, na ordem do
  `03`: 1 reserva×reserva · 2 bucket×bucket · 3 adjacência · 4 aceite×aceite · 5 aceite×retirada/expiração ·
  6 confirmação×rental_offer · 7 Direct×Luxplus · 8 mesmos Créditos · 9 Request×Direct · 10 depósito×cancelamento ·
  11 seleção Luxtory×reserva · 12 retries/jobs paralelos.
- Aceite comum a toda wave: `npm run verify` (lint, typecheck, testes unit/db/contrato com cobertura ≥ 80% em
  `domain/` e `application/`, testes do DS, migrations up → down → up, build) + `npm run test:e2e` +
  `npm run trace -- --expect <IDs>` (conta só testes **aprovados** cujo título traz a tag).
- Paralelismo só entre waves sem nenhum arquivo em comum (migrations, contratos, registros, `package.json`,
  `vercel.json`, `CHANGELOG.md`). O Status deste plano e a tabela do `NOTES.md` são atualizados pela sessão
  principal depois do merge, nunca dentro do PR da wave.
- Specs por módulo em `docs/specs/<módulo>.md`, criadas ou estendidas pela wave: citam IDs, não parafraseiam os
  canônicos. STRIDE em `docs/security/threats/` quando a superfície de ataque muda. Rollback testado em toda
  migration.
- Nada é presumido (TECH-001): valor ausente → erro explícito (`ERR_PARAMETER_MISSING`, `ERR_POLICY_MISSING`,
  `ERR_PRL_MISSING`) ou wave bloqueada (⛔).

### Roadmap

| Wave | Deliverable | Slice(s) | IDs (dona) | Depends on | Parallel with | Release | Status |
|------|-------------|----------|------------|------------|---------------|---------|--------|
| 0 | Fundação: scaffold, harness TECH-110, CI/CD, ADRs 0004–0006, `## Commands` | platform | — | — | — | R1·base | ✅ |
| 1 | Núcleo de commands: operação, idempotência, auditoria, outbox, jobs, erros | platform | REQ-015, REQ-098 | 0 | — | R1·base | ✅ |
| 2 | Acesso administrativo: Auth, MFA, staff, guard, grants, RLS | identity, admin | REQ-014 | 1 | — | R1·base | ✅ |
| 2B | Fundação de UI de produto (mobile-first): app shell, layout focado, padrão de página e estados | design-system, admin, identity (presentation) | — | 2 | — | R1·base | ✅ |
| 3 | Catálogo + Admin | catalog, admin | REQ-020, REQ-027 | 2B | — | R1 | ✅ |
| 3B | Camada de comunicação: Framework Mestre + preenchimentos B2C e Brand Partners (ADR-0011) | docs (sem slice) | — | 3 | — | R1 | ✅ |
| 3C | Framework B2C como fonte canônica da comunicação B2C (ADR-0012) | docs + catalog (domain) | — | 3B | — | R1 | ✅ |
| 3D | Framework Brand Partners como fonte canônica da comunicação Brand Partners (ADR-0013) | docs + catalog (domain) | — | 3C | — | R1 | ✅ |
| 4 | Discovery público + componentes React do DS | catalog | REQ-100, REQ-101 | 3, 3C | — | R1 | ✅ (CP2, #32, `ba1dc8d`) |
| 5 | Interesse — núcleo | ownership | REQ-023 | 3 | — | R1 | ⬜ |
| 6 | Interesse — formulário público | ownership | — | 4, 5 | — | R1 | ⛔ P-3 |
| 7 | Titulares: party cifrada, delegação, Área do Titular | identity | — | 2 | — | R2 | ⬜ |
| 8 | Formalização e calendário civil | ownership, calendar | REQ-010, REQ-022, REQ-024, REQ-025, REQ-026, PD-003 | 3, 7 | — | R2 | ⬜ |
| 9 | Sorteio auditável | ownership | PD-011 | 8 | 10 | R2 | ⬜ |
| 10 | Custódia e selagem | calendar, inventory | REQ-040, INV-2, INV-3 | 8 | 9 | R2 | ⬜ |
| 11 | Direito de Uso, janelas e rotações | calendar | REQ-030, REQ-031, REQ-032, REQ-033, REQ-039, PD-004, INV-4, INV-5 | 9, 10 | — | R2 | ⬜ |
| 12 | Reserva de uso próprio | booking | REQ-034, REQ-035, REQ-037, PD-002, INV-1 | 11 | — | R2 | ⬜ |
| 13 | Cancelamento, no-show, recuperação e exceção | booking, inventory | REQ-080, REQ-081, REQ-083, PD-010 | 12 | — | R2 | ⬜ |
| 14 | Seleção Luxtory, parâmetros e convidados | calendar, admin, booking | REQ-016, REQ-036, REQ-092, REQ-095 | 12 | — | R2 | ⬜ |
| 15 | Membership | identity | REQ-011, REQ-050, PD-001 | 7 | — | R3 | ⬜ |
| 16 | PRL, parâmetros econômicos e snapshot | pricing | REQ-013, REQ-052 | 10, 14 | — | R3 | ⬜ |
| 17 | Créditos e Carteira | credits | REQ-053, REQ-054, PD-008, INV-6 | 15 | — | R3 | ⬜ |
| 18 | Políticas comerciais | pricing | REQ-082, REQ-104, PD-009 | 16 | — | R3 | ⬜ |
| 19 | Pagamentos, Fee e settlement | billing | REQ-094 | 16 | — | R3 | ⬜ |
| 20 | Luxchange — depósito | luxchange | REQ-051, REQ-060 | 13, 16, 17 | — | R3 | ⬜ |
| 21 | Request — envio | luxchange | REQ-062, PD-005, PD-007 | 18, 19, 20 | — | R3 | ⬜ |
| 22 | Request — aceite e recusa | luxchange | REQ-061, REQ-063, REQ-064, REQ-096, PD-006 | 21 | — | R3 | ⬜ |
| 23 | Luxchange Direct | luxchange | REQ-065 | 22 | — | R3 | ⬜ |
| 24 | Luxplus | booking, billing | REQ-066, REQ-070 | 23 | — | R3 | ⬜ |
| 25 | Locação externa | booking, billing | REQ-012, REQ-041, REQ-042, REQ-043, REQ-071, REQ-072 | 22 | — | R3 | ⬜ |
| 26 | Fechamento do R3: testes transversais | transversal | REQ-073, REQ-102, REQ-103 | 24, 25 | — | R3 | ⬜ |
| 27 | Inadimplência | billing, booking | REQ-090 | 26 | — | R4 | ⬜ |
| 28 | Transferência | ownership | REQ-093 | 26 | — | R4 | ⬜ |
| 29 | Conformidade e parceiros | catalog | REQ-021, REQ-038, REQ-091 | 27 | — | R4 | ⬜ |
| 30 | Hardening e gate final | platform | REQ-097 | 28, 29 | — | R4 | ⬜ |

Paralelismo: só **W9 ∥ W10**. A W9 toca a migration `draw`, o módulo `ownership`, o pacote `drand-client`, um
canal do AsyncAPI, telas e `CHANGELOG.md`, e o STRIDE do beacon. A W10 toca migrations de `calendar`/`inventory`,
a entrada `open_exercise` em `vercel.json` e no registro de jobs, e o port de alerta; não tem tela, endpoint,
pacote novo nem entrada de CHANGELOG. Nenhum arquivo em comum. Todas as outras waves são sequenciais porque
compartilham `openapi.yaml`, o registro de commands, `vercel.json`, `package.json` ou `CHANGELOG.md`.

> **2026-10-06:** a W4 é executada como **CP2** do [Core Design System Luxtory](#core-design-system-luxtory--cp1cp5-2026-10-06)
> (CP1 Core + Lab → GATE-COPY-W4 → CP2 = W4); Auth e Admin migram depois (CP3, CP4) e não bloqueiam a W4.

### Wave 0 — Fundação

- **Goal**: base executável e verificável, sem nenhuma regra de negócio.
- **IDs**: TECH-010 · TECH-011 · TECH-100 (SAST, dependências, segredos) · TECH-110 (camadas de teste) · ADR-001 ·
  ADR-0002 · ADR-0003.
- **Scope (slices/files)**:
  - Scaffold com versões exatas (`save-exact`), lockfile commitado e `engines.node: "22.x"`: `next` 16.3.6 ·
    `react`/`react-dom` 19.3.0 · `typescript` 6.0.3 · `@types/node` 22.20.4 · `@types/react`/`@types/react-dom`
    19.3.0 · `eslint` 10.11.0 + `eslint-config-next` 16.3.6 · `prettier` 3.9.9 · `vitest` e
    `@vitest/coverage-v8` 5.0.2 · `@playwright/test` 1.63.0 + `@axe-core/playwright` 4.13.0 · `zod` 4.6.5 ·
    `dbmate` 2.36.0 · `embedded-postgres` 17.10.0-beta.17 (só testes) · `pg` 8.23.0 · `yaml` 2.9.1 + `ajv` 8.20.0 +
    `ajv-formats` 3.0.1.
  - `src/app/` (rotas só delegam a `src/features/<módulo>/presentation`): layout com o CSS do DS e fontes via
    `next/font/local`; `GET /v1/health` e `GET /v1/version` (já no OpenAPI); rota interna `/lab` com `noindex`, 404
    com `VERCEL_ENV=production`, servindo só arquivos permitidos de `src/design-system/` (ADR-0003).
  - `src/features/platform/`: validação de env (Zod, lê só chaves conhecidas), logger JSON com `correlation_id`,
    relógio injetável (`Clock`). Os módulos do TECH-011 nascem como slices em `src/features/` na wave que os usa.
  - `tests/` espelhando `src/`; `scripts/trace.mjs` (tags REQ/PD/INV/TECH/EC/CONC, relatórios JSON do Vitest e do
    Playwright); `migrations/` vazia.
  - Contratos: placeholders de `docs/api/openapi.yaml` e `docs/api/asyncapi.yaml` preenchidos — um arquivo de
    contrato cada (`CLAUDE.md`).
  - `## Commands` preenchido em `CLAUDE.md` e `AGENTS.md`; `[CUSTOMIZE]` preenchidos em
    `.github/workflows/ci.yml`, `.claude/rules/testing.md`, na tabela do `/verify` e no `/deploy`.
  - `docs/reference/environment.md`; `docs/security/threats/platform.md` (STRIDE de `/v1/*`, `/lab` e pipeline);
    ADRs 0004–0006 e índice `docs/adr/README.md`.
  - CI/CD, ignores e camadas de teste descritos nas subseções abaixo.
- **Depends on / parallel with**: — (fundação, sempre sequencial).
- **Acceptance criteria**:
  - `[TECH-110] PG embutido sobe, desce e sobe migrations de fixture`;
    `[CONC-12] duas conexões: índice único parcial serializa inserções concorrentes`;
    `[TECH-056] /v1/health e /v1/version conformes ao OpenAPI`;
    `[ADR-0003] /lab com axe 0, sem overflow de 320 a 1920 px e 404 em produção`;
    `[REQ-100] varredura de terminologia cobre src/ e docs/api`.
  - `npm ci && npm run verify && npm run test:e2e` verdes localmente e na CI do PR.
  - `## Commands` do `CLAUDE.md` sem `<placeholder>`;
    `git diff --stat origin/main -- docs/specs/canonical activate-ultronpx.mjs` vazio.
- **Goal command**: `/goal npm ci && npm run verify && npm run test:e2e exit 0, gh pr checks for the W0 PR are all green, CLAUDE.md ## Commands has no <placeholder>, and git diff --stat origin/main -- docs/specs/canonical activate-ultronpx.mjs is empty, stop after 5 tries`
- **Desvios da execução (2026-09-25, com evidência — ADR-0004)**: ESLint **9.39.5** em vez de 10.11.0 (os plugins do
  `eslint-config-next` 16.3.6 só aceitam ESLint ≤ 9; o `create-next-app` 16.3.6 instala `^9`); fontes pelo
  `fonts.css` do Design System, sem `next/font/local` (evita família duplicada; preload na W4); jobs da CI com os
  nomes do esqueleto (`lint`, `typecheck`, `test`, `security`) + `e2e`, `migrate`, `deploy`, em vez de `quality`
  (conteúdo existente só é estendido).
- **Status**: ✅ concluída em 2026-09-26 — PR #3, squash `d4cbc87` em `main`; pipeline de `main` verde (`migrate` com
  preflight, `deploy` em Production `gru1`); smoke tests em https://branded-second-home.vercel.app: `/v1/health` 200,
  `/v1/version` = `d4cbc87`, `/lab` 404, `/favicon.ico` 200.

#### W0 — `## Commands` (CLAUDE.md e AGENTS.md)

| Comando | Script |
|---|---|
| Dev | `npm run dev` (PG local com `npm run db:start`) |
| Test | `npm test` — unit + db (PG real) + contratos + DS |
| E2E | `npm run test:e2e` |
| Lint | `npm run lint` — ESLint + `prettier --check` |
| Typecheck | `npm run typecheck` |
| Coverage | `npm run coverage` — falha abaixo de 80% em `src/features/**/{domain,application}/**` |
| Migrations | `npm run db:new -- <nome>` · `npm run db:check` (sobe, desce tudo, sobe de novo) |
| Trace | `npm run trace -- --expect <IDs>` · `npm run trace -- --gate` |
| Verify | `npm run verify` = lint + typecheck + coverage + DS + db:check + build |
| Deploy staging | push de branch → Preview da Vercel |
| Deploy prod | **só pela CI**: `.github/workflows/ci.yml`, jobs `migrate` → `deploy` em `main` |

#### W0 — CI/CD

- `quality` (PR e `main`): `npm ci` → `npm run verify`.
- `e2e` (PR e `main`): `npm run test:e2e` com `channel: 'chrome'` (Chrome já vem no `ubuntu-latest` e está no
  WSL: sem download de browser).
- `security` (PR e `main`): gitleaks (mantido) + `npm audit --omit=dev --audit-level=high` + Semgrep CE (SAST
  gratuito em repo privado; CodeQL exige GitHub Advanced Security).
- `migrate` (push em `main`, depois dos três): `dbmate up` com o secret `DATABASE_URL_MIGRATIONS` (pooler em modo
  sessão, IPv4). Secret ausente → falha explícita.
- `deploy` (depois do `migrate`): `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod` com o
  secret `VERCEL_TOKEN` (org e project IDs como variáveis não secretas).
- `vercel.json`: `git.deploymentEnabled.main = false` (produção só pela CI, sem corrida migração × deploy e sem
  depender de branch protection) e `regions: ["gru1"]`.
- Orçamento de minutos (repo privado Free: 2.000 min/mês): 3 jobs por push, cache do npm, `cancel-in-progress`.

#### W0 — Ignores do `activate-ultronpx.mjs`

- Entra em `.prettierignore`, `ignores` do `eslint.config.mjs`, `exclude` do `tsconfig.json`, `test.exclude` e
  `coverage.exclude` do `vitest.config.ts`, `testIgnore` do `playwright.config.ts`, `.semgrepignore`,
  `.gitleaks.toml` (regras padrão + exceção do caminho), `.vercelignore` e na varredura de terminologia
  (`CLAUDE.md`: "any other tool"). Nenhum script o importa ou executa.
- A validação de env não exige nem remove `ULTRONPX_PURCHASE_EMAIL`.
- O `.prettierignore` também cobre `*.md`, `docs/`, `src/design-system/` e `migrations/`: o hook de formatação ao
  salvar não reformata canônicos, `CLAUDE.md`, `NOTES.md` nem o Anexo A.

#### W0 — Catálogo de variáveis de ambiente (só nomes; `docs/reference/environment.md`)

| Nome | Onde | Wave |
|---|---|---|
| `DATABASE_URL_MIGRATIONS`, `VERCEL_TOKEN` | secrets do GitHub (+ `DATABASE_URL_MIGRATIONS_STAGING` se D3) | W0 |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | Vercel, só leitura | W0 |
| `DATABASE_URL`, `CRON_SECRET` | Vercel (Production, Preview, Development) → **só Production** desde a decisão D3 (2026-09-26, [ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)) | W1 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | W2 |
| `AUTH_MODE` (`supabase` ou `test`; `test` é recusado se `VERCEL_ENV` existir) | local e CI | W2 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel (sensitive) | W5 |
| `SUPABASE_SECRET_KEY`, `PII_ENCRYPTION_KEYRING`, `PII_ENCRYPTION_ACTIVE_KEY_ID`, `PII_HMAC_KEY` | Vercel (sensitive, só servidor) | W7 |
| `NEXT_PUBLIC_SITE_URL` | Vercel | W7 |
| `PAYMENT_GATEWAY` (`fake`, recusado em produção) | Preview, Development, CI | W19 |
| `ULTRONPX_PURCHASE_EMAIL` | fora do catálogo: nem exigida nem removida | — |

`.env.example` está ignorado pelo `.gitignore` (regra `.env*`), por isso o catálogo versionado vive em
`docs/reference/environment.md`.

#### W0 — Camadas de teste (TECH-110)

| Camada | Como | Estreia |
|---|---|---|
| Unit | Vitest (projeto `unit`) | W0 |
| PostgreSQL real | Vitest (projeto `db`) + `embedded-postgres` 17.10: pasta de dados em ext4; banco-modelo migrado e clonado por arquivo de teste; script de compatibilidade Supabase (papéis `anon`/`authenticated`, `auth.uid()`) | W0 |
| Contratos API/PSP/webhook | Ajv contra `docs/api/openapi.yaml`; PSP e webhook contra o port e o fake | W0 / W19 |
| E2E | Playwright + axe sobre `next build && next start` com PG embutido; login por emissor de JWT de teste a partir da W2 | W0 |
| Concorrência | N conexões reais com barreira determinística | W0 / W1 |
| Autorização/RLS | `SET LOCAL ROLE` + claims em PG real | W2 |
| Falhas | fakes com falha injetada (outbox, beacon, PSP, queda entre etapas) | W1 / W9 / W19 |
| Tempo | `Clock` injetável + casos do TECH-110 | W8 |
| INV transversais | consultas SQL de INV-1…INV-6 após todo teste `db`; reusadas pela conciliação da W30 | W10 |

#### W0 — ADRs

- **0004 — Toolchain, bibliotecas e pipeline**: tabela decisão · versão · justificativa de 1 linha. Cobre Node 22.x;
  UI (classes `lx-*` + componentes React finos, sem biblioteca de componentes); validação (Zod); e-mail (só o do
  Supabase Auth; e-mail transacional aguarda D4; notificações dentro do app); observabilidade (logs JSON com
  `correlation_id` + Observability nativa da Vercel para métricas e erros não tratados, sem fornecedor extra —
  ADR-0002); Storage (não usado enquanto nenhum requisito armazenar arquivo; quando usado, privado — TECH-100);
  contrato único OpenAPI/AsyncAPI; i18n por dicionário tipado por slice; outbox disparado após o commit via
  `after()` + varredura por cron; jobs em `/api/jobs/*` fora de `/v1` (o Vercel Cron só faz GET); deploy só pela
  CI; Semgrep.
- **0005 — Testes com PostgreSQL real sem Docker**: PG embutido, banco-modelo clonado, compatibilidade Supabase,
  autenticação de teste, `channel: 'chrome'`. Limite assumido: GoTrue e Supavisor só em staging/preview.
- **0006 — Acesso a dados**: schema `app`; papel de aplicação sem UPDATE/DELETE em ledgers, snapshots, versões e
  auditoria (TECH-052); migrations como owner só pela CI; aplicação via Supavisor em modo transação (IPv4);
  leituras no servidor sob RLS (`SET LOCAL ROLE` + claims verificados); Data API do Supabase desligada (ADR-002 do
  `03`).

#### W0 — Bibliotecas das waves seguintes (fixadas no ADR-0004, instaladas só na wave que as usa)

- W1: `kysely` 0.29.6, `kysely-codegen` 0.20.0 (tipos gerados do banco migrado, nunca o contrário),
  `@vercel/functions` 3.9.9.
- W2: `@supabase/ssr` 0.12.7 e `@supabase/supabase-js` 2.117.2, só para Auth.
- W5: `@upstash/ratelimit` 2.2.0 e `@upstash/redis` 1.39.0.
- W8: `temporal-polyfill` 1.0.5 · W9: `drand-client` 1.4.2 · W16: `decimal.js` 10.6.0 · W30: `canonicalize` 5.1.0.
- OpenTimestamps chamado direto por HTTP (o pacote npm está sem manutenção desde 2022).

### Wave 1 — Núcleo de commands

- **Goal**: todo command passa por um único pipeline, idempotente e auditável (TECH-054).
- **IDs (dona)**: REQ-015, REQ-098. **TECH**: TECH-002, TECH-011, TECH-051, TECH-053, TECH-054, TECH-056, TECH-090,
  TECH-091, TECH-092, ADR-005, ADR-006.
- **Scope (slices/files)**: `platform`.
  - Migrations: schema `app` e papéis (ADR-0006); `operation` (TECH-002), `idempotency_record` (ADR-006),
    `audit_log` só-inserção sem dado pessoal bruto (TECH-092; o selo fica na W30), `outbox` (TECH-091),
    `notification` (notificação dentro do app).
  - `executeCommand` segue o TECH-054 em READ COMMITTED (ADR-005), trava na ordem do TECH-053 e refaz com a mesma
    chave em deadlock/timeout.
  - Registro fechado de commands (TECH-051) organizado pelos módulos do TECH-011; códigos TECH-056 com causas
    funcionais em pt-BR (REQ-098) pela camada i18n por slice; mapeamento constraint → código (TECH-056).
  - Jobs em `/api/jobs/*` protegidos por `CRON_SECRET`, com registro de jobs separado do registro de consumidores
    do outbox; job `outbox` (disparo pós-commit + varredura).
  - AsyncAPI do outbox; runbook `docs/how-to/operacao.md` (cadências e segredos, TECH-001). Sem telas.
- **Depends on / parallel with**: W0; sequencial (base de todos os commands).
- **Acceptance criteria**: `[REQ-015][PD-011] todo command registrado grava operation e audit_log com ator, parte
  representada, papel, instante, objeto, operation, base e antes/depois, sem dado pessoal bruto` (cobre
  automaticamente os commands futuros) · `[TECH-052] UPDATE/DELETE em audit_log falha` · `[ADR-006] mesma chave e
  payload repetem a resposta; payload diferente → ERR_IDEMPOTENCY_CONFLICT` · `[ADR-005] a transação do command
  roda em READ COMMITTED com locks explícitos` · `[TECH-053] lock fora da ordem é rejeitado` · `[CONC-12] jobs e
  retentativas em paralelo produzem um único efeito` · `[TECH-091] outbox entrega ao menos uma vez, o consumidor
  ignora duplicatas e falha de entrega não desfaz o domínio` · `[REQ-098] cada causa listada no REQ-098 tem código
  TECH-056 e mensagem pt-BR`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-015,REQ-098 exits 0, stop after 5 tries`
- **Status**: ✅ concluída em 2026-09-26 — PR #11, squash `d29bca7` em `main`, com as correções #12 (`7313248`,
  `db:password-verifier`) e #13 (`14d869d`, `DATABASE_URL` malformada → 503 nos jobs); `migrate` aplicou as 4
  migrations no Supabase; runbook pós-merge validado em Production (`dpl_GuKNeteuk3vd5FHdrBTKAmoHmY8n`, commit
  `14d869d`): cron `/api/jobs/outbox` 200 `job completed` (delivered 0, failed 0), sem erros nos logs, login do
  `luxtory_app` por SCRAM com TLS `verify-full`, zero grants para `anon`/`authenticated`/`service_role`.

### Wave 2 — Acesso administrativo

- **Goal**: staff entra com MFA e nada roda fora do guard.
- **IDs (dona)**: REQ-014. **TECH**: TECH-050, TECH-051, TECH-052, TECH-092, TECH-100, ADR-002.
- **Scope (slices/files)**: `identity`, `admin`.
  - Supabase Auth via `@supabase/ssr`, login por código enviado por e-mail (`proxy.ts` renova a sessão); MFA TOTP
    obrigatório (AAL2) para Admin e Super Admin (TECH-050).
  - `staff_role` criado por script de operação auditado, sem tela (BR-181).
  - Guard que nega por padrão (`user → party_delegation → party → holding | authorization_grant`, TECH-050/051);
    `authorization_grant` + `POST /v1/admin/authorization-grants` (REQ-014).
  - Leituras no servidor sob RLS; leitura administrativa auditada (TECH-052/092); CSRF por origem (TECH-100);
    emissor de JWT de teste (ADR-0005), recusado quando `VERCEL_ENV` existe.
  - Telas: login, MFA e estrutura do Admin. STRIDE `identity-admin`.
- **Depends on / parallel with**: W1; sequencial.
- **Acceptance criteria**: `[REQ-014] quem não tem grant válido (escopo e vigência) é negado` · `[TECH-050] Admin
  sem MFA (AAL1) é negado` · `[TECH-052] anon/authenticated não leem staff e grants` · `[TECH-100] POST com origem
  inválida → 403` · E2E de login com autenticação de teste e axe 0. Login real verificado em preview/staging (D3).
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-014 exits 0, stop after 4 tries`
- **Decisões de execução (aprovadas em 2026-09-26)**:
  - D-W2-1 — `authorization_grant.grantee_party_id` nasce `uuid` **sem FK**, como dívida transitória deliberada e
    fail-closed (não é o modelo definitivo): nenhum grant produtivo pode ser criado enquanto `party` não existir; a
    **W7 adiciona e valida a FK**. O grant nasce revogável, com revogação operacional auditada; revogação por API
    fica fora da W2.
  - D-W2-2 — sem hierarquia presumida entre Admin e Super Admin: um usuário pode ter os dois papéis e o guard registra
    o papel exercido.
  - D-W2-3 — Auth real só em Production enquanto a D3 estiver adiada; Previews sem variáveis do Supabase canônico. A
    ausência delas não quebra o build: a recusa ocorre quando o Auth real é usado. Autenticação de teste só local e na
    CI (ADR-0005 §7).
  - D-W2-4 — e-mail de staff em `auth.users` é PII: a W2 aciona a reavaliação da D3; decisão da Luxtory: continuar sem
    staging (registrada no [ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)).
  - `CRITICAL_COMMANDS` permanece exatamente a tabela fechada do TECH-051; operações não críticas (REQ-095) ficam em
    registro separado.
  - `@supabase/supabase-js` **2.116.0** em vez de 2.117.2 (cooldown de 7 dias do `.npmrc`; ADR-0004).
- **Status**: ✅ concluída em 2026-09-27 — PR #14 (squash `3d9b6b2`) e PR #15 (`13befad`: cadastro do TOTP guiado em
  três passos e "Reenviar código"); `migrate` aplicou `staff_role`, `authorization_grant` e `rls_reader_membership`;
  1º login real em Production (código por e-mail + TOTP → `/admin` com Admin e Super Admin) validado pela Luxtory;
  conferência só leitura: 1 fator TOTP verificado criado depois do deploy e nenhum não verificado, sessão AAL2,
  2 `assign_staff_role` com `audit_log` correspondente, logs sem e-mail, código ou token.

### Wave 2B — Fundação de UI de produto (mobile-first)

- **Goal**: toda superfície de produto nasce mobile-first, com paridade funcional, sobre um shell e padrões únicos —
  o Admin é o primeiro consumidor, não o limite ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)).
- **IDs (dona)**: nenhum (sem REQ novo, migration, API ou regra de negócio). **TECH**: TECH-100 (sem mudança de
  superfície de ataque), ADR-0003, ADR-0009.
- **Scope (slices/files)**: `src/design-system/` (CSS `lx-app-*`, `lx-page-header`, wrappers React finos só para o
  que tem comportamento ou estrutura repetida), `admin` e `identity` (só `presentation`), docs e testes.
  - Regra global: mobile-first com paridade funcional (toda função alcançável e concluível a partir de 320 px);
    exceção só como decisão explícita de produto registrada na spec. `check-hardcodes` recusa `@media (max-width…)`
    de largura; helper de E2E responsivo compartilhado.
  - Shell das áreas logadas (`lx-app-*`): abaixo de `lg`, barra superior (logo oficial e botão de menu; o título fica
    no cabeçalho da página) e gaveta (`lx-mobile-nav`); a partir de `lg`, navegação lateral. O shell recebe `navItems` por composição na camada de
    apresentação, não conhece regra de negócio, e nenhum slice importa internals de outro.
  - Layout focado para `/entrar` e `/entrar/mfa` (só visual); padrão de página; estados vazio, erro, acesso negado,
    indisponível e carregando.
  - **Consumer-driven**: painel, selo, estado ou token novo só entra se `/admin`, o Auth ou a demonstração necessária
    no Lab o consumirem. Tabela, filtros, formulários de produto, barras de ação, stepper, calendário, gráficos,
    toasts e navegação inferior ficam para a wave que os usar (tabela e formulários: W3).
- **Depends on / parallel with**: W2; sequencial. A W3 depende da W2B.
- **Checkpoints**: (1) regra global, documentação, shell e início do Admin → capturas 390/1440 px com a navegação em
  `night` e em `paper` → aprovação visual da Luxtory antes de seguir; (2) layout focado, estados, smoke Playwright
  WebKit e gates → PR com CI verde, parado antes do merge.
- **Acceptance criteria**: toda tela da W2B com axe 0 a 390 e 1440 px, sem overflow horizontal não intencional do
  documento de 320 a 1920 px, zero erro de console e fluxo principal executado a 390 px com toque · shell correto a
  1023 e 1024 px; gaveta aberta fecha ao cruzar o `lg` e o foco volta a um lugar válido · teclado (skip link, foco
  visível, foco preso e devolvido pela gaveta, `aria-current`), alvos ≥ 44 px, movimento reduzido · smoke
  Playwright WebKit do shell e do login · testes do DS verdes e nenhum `max-width` em media query · E2E de login, MFA
  e acesso ao Admin sem regressão.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and the W2B acceptance criteria in docs/plan/implementation-waves.md pass, stop after 4 tries`
- **Status**: ✅ concluída em 2026-09-27 — PR #16 (squash `9d6e3c7`): ADR-0009, App Shell (`lx-app`), cabeçalho e
  seção de página, layout focado (`lx-focused`) para login, segundo fator e estados, navegação `night` aprovada no
  checkpoint 1, smoke Playwright WebKit na CI; `migrate` sem pendência (`Applied: 7 / Pending: 0`); Production
  verificada (`/entrar`, `/entrar/mfa`, `/admin` e os 6 logos por chave do manifest), sem mudança no banco.

### Wave 3 — Catálogo + Admin

- **Goal**: vincular corretamente Brand Partner, Concept (com versões), Edition e Residence, com Investor só sob
  autorização.
- **IDs (dona)**: REQ-020, REQ-027. **TECH**: TECH-051.
- **Scope (slices/files)**: `catalog`, `admin`.
  - Migrations: `brand_partner`; `concept_version` (elementos essenciais, especificação para apresentação comercial
    — BR-013, `approval_refs`, estados do REQ-096); `edition` (região, modalidade, condições comerciais registradas
    — BR-031, trava de estrutura); `residence` (versão do Concept imutável, fuso IANA, Investor com autorização
    registrada — BR-310).
  - Commands Admin sob guard e auditoria (REQ-095); encerramento de Brand Partner bloqueia Concepts e Editions
    novos (BR-021); exposição pública só com autorização registrada (BR-015, P-8); textos registrados passam pela
    checagem de terminologia (REQ-100/101).
  - API `POST /v1/admin/{brand-partners,concept-versions,editions,residences}` + `approve` e `terminate`; telas
    Admin; componente de tabela entra no DS (spec + Lab + teste).
- **Depends on / parallel with**: W2B (shell e padrões de página); sequencial.
- **Acceptance criteria**: `[REQ-020] Residence sem Concept aprovado é recusada; oferta só existe via Edition` ·
  `[REQ-027] Residence de Investor sem autorização registrada é recusada; com autorização, existe sem adquirente e
  a Edition aceita Owner, Co-Owner ou ambas enquanto aberta` · `[BR-025] nova versão do Concept não altera
  Residence existente` · `[BR-021] Brand Partner encerrada bloqueia Concept e Edition novos` · `[REQ-100] texto com
  termo vedado é recusado` · contratos OpenAPI.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-020,REQ-027 exits 0, stop after 4 tries`
- **Decisões de execução (aprovadas em 2026-09-27;
  [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md), spec [`catalog`](../specs/catalog.md))**:
  - BR-025: `register_residence` é o evento de aprovação comercial — grava o instante e fixa a versão vigente do
    Concept; a versão fixada nunca muda.
  - D-W3-1 — `investor_authorization` próprio, sem dado pessoal: Concept, referência estável do instrumento,
    vigência e revogação; a Residence referencia `investor_authorization_id`; a **W7** acrescenta o vínculo com a
    `party` sem reescrever registros.
  - D-W3-2 — lista de registros (`lx-record-list`) em vez de tabela; sem filtros (nenhum consumidor na W3).
  - D-W3-3 — autorização de exposição da marca (BR-015, P-8) registrada por Brand Partner, uma vez; o encerramento não
    a apaga (histórico preservado); a W4 a consome.
  - D-W3-4 — depois de `terminated_effective_at`, novos usos da marca são recusados (Concept, versão, aprovação,
    Edition, autorização de Investor, Residence, exposição). Direitos sobreviventes não modelados → fechado para
    falhas como **limitação temporária**, não regra nova; BR-022/023 não são redefinidas.
  - D-W3-5 — fechamento em Production sem dados fictícios (catálogo append-only, sem staging).
  - Checagem de terminologia lexical = defesa complementar; o gate editorial é a aprovação humana da versão.
  - Entrada única dos commands do Admin (API e Server Actions) com papel exercido explícito e auditado, sem hierarquia
    entre Admin e Super Admin (ADR-0008).
  - Alteração de modalidade e trava da estrutura da Edition ficam na W8 (dona do REQ-022); a W3 cria a Edition com a
    modalidade.
- **Status**: ✅ concluída — PR #17 (squash `e221082`) e PR #18 (`b1cf06a`, correção do teste de `lock_timeout`).

### Wave 3B — Camada de comunicação

- **Goal**: toda página pública nasce de uma estratégia de comunicação aprovada — Framework Mestre e preenchimentos por
  Protagonista —, sem inventar fatos nem reinterpretar a estratégia a cada página
  ([ADR-0011](../adr/0011-camada-de-comunicacao-publica.md), spec [`communication`](../specs/communication.md)).
- **IDs**: nenhum dono (sem REQ novo, migration, API ou tela). Guardrails citados: BR-373, BR-374, REQ-100…REQ-104,
  `03` §13; nos preenchimentos, fatos só por ID.
- **Scope (slices/files)**: `docs/specs/communication.md` (contrato); `docs/specs/communication/` (`framework-mestre.md`,
  `luxtory.md`, `b2c.md`, `brand-partners.md`); ADR-0011; `tests/communication.test.ts`; ponteiros em `CLAUDE.md`,
  `AGENTS.md`, índices de `docs/`, `docs/reference/design-system.md` §2/§11 e skill `frontend-design`.
  - Jornadas B2C e Brand Partners separadas, sem links entre si; B2C é um único Protagonista (Owner e Co-Owner como
    modalidades).
  - Páginas e CTA de Brand Partners não existem no `02` §2: entram no `02` antes de qualquer código B2B (`P-BP-01` em
    `docs/specs/communication/brand-partners.md`).
- **Depends on / parallel with**: W3; sequencial (fecha antes da W4).
- **Checkpoint**: decisões estratégicas propostas com recomendação e aprovadas pela Luxtory antes do fechamento —
  realizado em 2026-09-29 (todas as `D-*` aprovadas).
- **Acceptance criteria**: `[ADR-0011]` IDs canônicos citados existem · referências D/H/P definidas nos registros ·
  seções mínimas presentes · links internos resolvem · todas as `D-*` registradas como aprovadas · canônicos e
  `activate-ultronpx.mjs` intactos · `npm run verify` verde.
- **Goal command**: `/goal npm run verify exits 0 including tests/communication.test.ts, every D-* decision in docs/specs/communication/ is recorded as approved, and git diff --stat origin/main -- docs/specs/canonical activate-ultronpx.mjs is empty, stop after 3 tries`
- **Status**: ✅ concluída — PR #19 (squash `846b2e8`).

### Wave 3C — Framework B2C como fonte canônica da comunicação B2C

- **Goal**: o Framework Mestre de Estratégia de Comunicação B2C, entregue pela Luxtory em 2026-09-30, é a fonte
  canônica principal da comunicação B2C; todo documento ou código divergente é ajustado ou substituído, sem alterar o
  modelo de negócio ([ADR-0012](../adr/0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md), spec
  [`communication`](../specs/communication.md)).
- **IDs**: nenhum dono. Guardrails citados: BR-373, BR-374, BR-380, REQ-100, REQ-101, REQ-104, `03` §13.
- **Scope (slices/files)**: `docs/specs/communication/framework-b2c.md` (cópia byte a byte, congelada);
  `docs/specs/communication/b2c.md` (substituído pela aplicação: limites L1–L9, objeções com IDs, mapa de páginas,
  registro); contrato `docs/specs/communication.md`; escopo de `luxtory.md` §1–§3, `framework-mestre.md` e `D-LX-07`
  a Brand Partners até o Framework B2B (`P-LX-05`); ADR-0012; `tests/communication.test.ts`; guardas lexicais
  (`src/features/catalog/domain/terminology.ts`, `tests/terminology.test.ts`, teste de terminologia do DS); ponteiros em
  `CLAUDE.md`, `AGENTS.md`, índices, DS ref §2/§11, skill `frontend-design`; CTA do Lab.
- **Depends on / parallel with**: W3B; sequencial (fecha antes da W4).
- **Checkpoint**: decisões aprovadas pelo fundador em 2026-09-30 (Framework como fonte canônica; `D-B2C-12`) e
  2026-10-01 (`D-B2C-13`, `D-B2C-14`, `D-B2C-15`).
- **Acceptance criteria**: `[ADR-0012]` sha256 do Framework B2C igual ao recebido · toda referência ao Framework
  resolve · nenhuma decisão ou hipótese substituída citada fora dos registros · `b2c.md` sem decisões só de Brand
  Partners · `[REQ-101]` guarda de disponibilidade ou uso sem limite · canônicos e `activate-ultronpx.mjs` intactos ·
  `npm run verify` verde.
- **Goal command**: `/goal npm run verify exits 0 including tests/communication.test.ts and tests/terminology.test.ts, docs/specs/communication/framework-b2c.md matches the pinned sha256, no superseded D-* or H-* is cited outside a register row, and git diff --stat origin/main -- docs/specs/canonical activate-ultronpx.mjs is empty, stop after 3 tries`
- **Status**: ✅ concluída — PR #21 (squash `7818aab`).

### Wave 3D — Framework Brand Partners como fonte canônica da comunicação Brand Partners

- **Goal**: o Framework Mestre de Estratégia de Comunicação Brand Partners, entregue pela Luxtory em 2026-10-01, é a
  fonte canônica da comunicação Brand Partners, com o mesmo arranjo do B2C, sem alterar o modelo de negócio
  ([ADR-0013](../adr/0013-framework-brand-partners-fonte-canonica.md), spec [`communication`](../specs/communication.md)).
- **IDs**: nenhum dono. Guardrails citados: BR-010…BR-025, BR-040…BR-043, BR-350, BR-374, BR-380, REQ-101, REQ-104,
  `03` §13.
- **Scope (slices/files)**:
  - Framework e aplicação:
    - `docs/specs/communication/framework-brand-partners.md` — cópia byte a byte, congelada;
    - `docs/specs/communication/brand-partners.md` — substituído pela aplicação: limites L1–L10, 12 objeções com IDs,
      mapa de páginas, registro.
  - Base e método:
    - `luxtory.md` fica só com guardrails, fatos e nomenclatura; Mentor, personalidade e tom passam aos Frameworks;
      `D-LX-02` a `D-LX-05` e `D-LX-07` substituídas; `P-LX-05` resolvida;
    - `framework-mestre.md` substituído.
  - Decisões: contrato generalizado; ADR-0013.
  - Testes: `tests/communication.test.ts` com os dois Frameworks; guarda lexical de receita, demanda ou remuneração
    garantidas no catálogo e nas varreduras.
  - Ponteiros em `CLAUDE.md`, `AGENTS.md`, índices, DS ref §2/§11 e skill `frontend-design`.
  - Páginas e CTA Brand Partners seguem fora do escopo de qualquer wave até a superfície entrar no `02` (`P-BP-01`).
- **Depends on / parallel with**: W3C; sequencial.
- **Checkpoint**: Framework entregue e "mesmos passos do B2C" pedidos pelo fundador em 2026-10-01 (`D-BP-11`,
  `D-BP-12` pelo mesmo critério do B2C).
- **Acceptance criteria**:
  - `[ADR-0013]`:
    - sha256 de cada Framework igual ao recebido;
    - toda referência aos Frameworks resolve;
    - cada aplicação cita só o próprio Framework;
    - nenhuma decisão ou hipótese substituída é citada fora dos registros.
  - `[REQ-101]`: a guarda recusa receita, demanda ou remuneração garantidas.
  - Canônicos e `activate-ultronpx.mjs` intactos.
  - `npm run verify` verde.
- **Goal command**: `/goal npm run verify exits 0 including tests/communication.test.ts and tests/terminology.test.ts, both frameworks match their pinned sha256, no superseded D-* or H-* is cited outside a register row, and git diff --stat origin/main -- docs/specs/canonical activate-ultronpx.mjs is empty, stop after 3 tries`
- **Status**: ✅ concluída — PR #23 (squash `95f83fe`).

### Wave 4 — Discovery público

- **Goal**: o visitante percorre Coleção → Concept → Edition/oferta, só com leitura.
- **IDs (dona)**: REQ-100, REQ-101. **TECH**: ADR-001, ADR-0003.
- **Scope (slices/files)**: `catalog` (presentation); `src/design-system/` (componentes React finos sobre `lx-*`,
  ADR-0003). Páginas renderizadas no servidor, lidas como `anon` sob RLS (as políticas de leitura pública do
  catálogo entram nesta wave). Exibem só a especificação do Concept e as condições comerciais da Edition registradas
  pela Luxtory — nenhum preço ou número calculado pelo software (ADR-001). Frame tipográfico sem fotografia (P-1);
  `ConceptCredit` só com autorização; metadata. Sem endpoint novo; o botão de interesse entra na W6.
  - Comunicação (W3C): fonte canônica = Framework B2C (`docs/specs/communication/framework-b2c.md`, ADR-0012);
    páginas, papéis, conscientização e estágios dos 5Ps vêm do mapa de `docs/specs/communication/b2c.md` §8, que
    inclui Home e "Como funciona" — a W4 ajusta o próprio escopo a partir dele e decide o conteúdo público de cada
    Concept. A Home segue estritamente o Brief Narrativo do Framework (§12); CTA conforme `D-B2C-13`; limites L1–L9 de
    `b2c.md` §2. Brief de cada página em `docs/specs/catalog.md`; checklist de `docs/specs/communication.md` no aceite.
- **Depends on / parallel with**: W3, W3C; sequencial.
- **Acceptance criteria**: `[REQ-100] nenhum termo vedado nem preço por dia para Co-Owner` · `[REQ-101] nenhuma
  promessa de rentabilidade, valorização, liquidez ou renda` · `[REQ-022] Concept sem Edition aparece sem oferta` ·
  E2E com axe 0 em 390 e 1440 px e sem overflow de 320 a 1920 px.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-100,REQ-101 exits 0, stop after 4 tries`
- **Escopo e decisões de execução (aprovados em 2026-10-01;
  [ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md), spec [`catalog`](../specs/catalog.md)
  §13)**:
  - Páginas: Home (`/`, Unaware → Product Aware, arco completo, PICTURE = Hero), Como funciona (`/como-funciona`,
    PROOF → PUSH), Coleção (`/colecao`, PROOF → PUSH) e Concept (`/colecao/[conceptId]`, PUSH + prova necessária), com
    as Editions e a oferta dentro do Concept. Interesse (W6) e páginas Brand Partners (`P-BP-01`) fora.
  - CTA da Home e do Como funciona por disponibilidade (`D-B2C-13`, `D-B2C-16`): Edition publicada → "Conheça as
    Residence Editions" (primeira oferta da Coleção); só Concepts → "Conheça os Residence Concepts"; nenhum Concept →
    sem CTA para a Coleção; dados indisponíveis → estado desconhecido, nunca tratado como "sem Edition".
  - Coleção em dois grupos sem repetição: Residence Editions (Concepts com Edition) primeiro, Residence Concepts (ainda
    sem Edition) depois. Configurações canônicas do Co-Owner (`01` §8.1) só no Como funciona, no PROOF, como detalhe
    secundário. Tríade do Framework com Patrimônio → Posse; no Co-Owner, sempre Ação da SPE proprietária + Direito de
    Uso (L1, `P-LX-03`).
  - Técnica mantida das decisões de 2026-09-29: Concept público = versão aprovada + exposição da marca autorizada +
    antes da eficácia do encerramento (limitação temporária que não redefine BR-021/022/023); menor conteúdo público
    (sem elementos essenciais nem premissas); URL por uuid e ordem de registro; portão `PUBLIC_SITE` fechado em
    Production (Data API desligada, sem rota externa ao catálogo); CSP com nonce; sem cache; Frames tipográficos (P-1);
    Admin identifica o conteúdo publicado.
- **Checkpoints**: (1) Checkpoint Visual — Home, Como funciona, Coleção, Concept com e sem Edition, menu do celular
  aberto e Admin com "Público no site", a 390 e 1440 px, sem push → aprovação de copy, narrativa, hierarquia, layout e
  estética; (2) gates, E2E, trace e PR draft com CI verde, parado antes do merge.

### Wave 5 — Interesse (núcleo)

- **Goal**: registrar o interesse com os campos canônicos, sem gerar direito.
- **IDs (dona)**: REQ-023. **TECH**: TECH-100.
- **Scope (slices/files)**: `ownership`.
  - Migration `interest` (`03` §3.1): Concept, Edition opcional, modalidade, região em texto, `approx_days` só para
    Co-Owner (inteiro positivo, sem teto presumido), origem e parceiro autorizado opcional.
  - `POST /v1/interests` público: Idempotency-Key, validação Zod, limite de requisições (port + adapter Upstash;
    sem Redis a escrita é recusada).
  - Lista Admin agrupada por Concept, região e modalidade (BR-062). STRIDE `interest`.
- **Depends on / parallel with**: W3; sequencial.
- **Acceptance criteria**: `[REQ-023] origem e parceiro registrados sem prerrogativa` · `[REQ-025] approx_days nunca
  vira Ação nem Direito de Uso` · `[REQ-022] interesse sem Edition é aceito` · `[TECH-100] excesso de requisições →
  429 sem efeito` · contrato OpenAPI.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-023 exits 0, stop after 4 tries`

### Wave 6 — Interesse: formulário público ⛔ P-3

- **Goal**: publicar o formulário (composição do Lab) com os campos e o consentimento definidos pela Luxtory.
- **IDs**: complementa REQ-022, REQ-024, REQ-025, REQ-100, REQ-101.
- **Scope (slices/files)**: `ownership` (presentation). Campos de contato e qualificação de P-3 (nenhum presumido),
  aviso de privacidade e consentimento com o texto da Luxtory, rota pública e botão na página do Concept, dados
  pessoais fora dos logs.
- **Depends on / parallel with**: W4, W5 e P-3; sequencial — entra na fila quando P-3 chegar.
- **Acceptance criteria**: E2E `[REQ-025] campo de dias só para Co-Owner, apresentado como preferência` ·
  `[REQ-024] a confirmação não sugere aquisição` · axe 0.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and the interest form E2E passes with 0 axe violations, stop after 3 tries`

### Wave 7 — Titulares

- **Goal**: o Titular existe como party cifrada e acessa sua área por delegação.
- **IDs**: TECH-050, TECH-052, TECH-100, ADR-0002.
- **Scope (slices/files)**: `identity`.
  - Migrations `party` (CPF/CNPJ em AES-256-GCM + `key_id`; HMAC normalizado `UNIQUE` com segredo separado —
    ADR-0002; sem campo de nome, que o `03` não prevê) e `party_delegation`.
  - Admin cadastra a party e convida o usuário pela Admin API do Supabase; login do Titular por código; estrutura
    da Área do Titular; RLS por party; leitura administrativa mascarada e auditada.
  - API `POST /v1/admin/parties` e `POST /v1/admin/parties/{id}/delegations`. STRIDE `titular-pii`.
  - **Obrigação herdada da W2 (D-W2-1)**: adicionar e validar a FK `authorization_grant.grantee_party_id → party`
    (constraint validada, sem `NOT VALID` pendente) e encerrar a dívida transitória no spec `identity`.
- **Depends on / parallel with**: W2; sequencial.
- **Acceptance criteria**: `[TECH-100] CPF/CNPJ nunca em claro no banco, nos logs nem no audit_log; HMAC barra
  duplicidade` · `[TECH-050] sem delegação vigente não há acesso` · `[TECH-052] Titular A não lê dados do Titular
  B` · `[ADR-0002] valor cifrado com key_id antigo continua legível após rotação`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect TECH-050,TECH-100 exits 0, stop after 4 tries`

### Wave 8 — Formalização e calendário civil

- **Goal**: `formalize_acquisition` é o único ato que cria titularidade, Ação e Direito de Uso, com a alocação
  inicial validada contra o calendário civil.
- **IDs (dona)**: REQ-010, REQ-022, REQ-024, REQ-025, REQ-026, PD-003. **TECH**: TECH-020, TECH-026, TECH-040,
  TECH-041, TECH-051.
- **Scope (slices/files)**: `ownership`, `calendar`, `catalog`.
  - Classificação civil pura no módulo `calendar`: temporadas por mês, Carnaval (TECH-041), 29/02 como Média/Baixa,
    exercício = ano civil local da noite, fuso IANA (TECH-040; `temporal-polyfill`). Usada pela validação da
    alocação inicial e pela selagem da W10.
  - Carga imutável de `residence_configuration` com as 4 configurações do `01` §8.1 (TECH-026).
  - `residence_administration` com cobertura obrigatória do Co-Owner em operação (TECH-020).
  - `edition_initial_allocation` com as validações do TECH-020, sem fórmula presumida.
  - `formalize_acquisition` (TECH-051): Owner → `holding` de 100%; Co-Owner → `spe` + N `stake` iguais + `holding`s,
    exige a alocação no exercício parcial e agenda o sorteio. Trava da estrutura da Edition; o adquirente final
    segue as mesmas regras (complemento do REQ-027).
  - API `POST /v1/admin/acquisitions`, `POST /v1/admin/editions/{id}/initial-allocation`,
    `POST /v1/admin/residences/{id}/administration`; tela Admin.
- **Depends on / parallel with**: W3, W7; sequencial.
- **Acceptance criteria**: `[PD-003][EC-3] Carnaval começa na sexta anterior (01/02 se cair em janeiro) e seleciona
  as 10 primeiras datas válidas, ignorando 29/02 e meses já Alta` · `[TECH-110] Carnaval até 2100, 31/01, 2100 não
  bissexto, fusos` · `[REQ-010] a mesma party é Owner em A e Co-Owner em B` · `[REQ-024] Owner com 2 adquirentes é
  recusado; a formalização Owner cria holding de 100%; não existe cadastro de imóvel sem Concept (nem preexistente)`
  · `[REQ-025] não existe Ação nem Direito de Uso antes da formalização` · `[REQ-026] Ação, Direito de Uso, reserva
  e Crédito são entidades distintas; Ações iguais (base da divisão de despesas pela Ação; cobrança fora de escopo,
  03 §15); configuração imutável` · `[REQ-022] modalidade não muda após a trava` · `[TECH-110] Co-Owner em operação
  sem administração válida falha; alocação com data passada, desigual ou com distribuição sazonal inválida falha`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-010,REQ-022,REQ-024,REQ-025,REQ-026,PD-003 exits 0, stop after 5 tries`

### Wave 9 — Sorteio auditável

- **Goal**: ordem inicial das Ações por sorteio verificável (TECH-093).
- **IDs (dona)**: PD-011 (fecha aqui; a metade de auditoria vem da W1). **TECH**: TECH-093.
- **Scope (slices/files)**: `ownership`.
  - Migration `draw`: participantes congelados, compromisso `SHA-256(seed)`, rodada futura do beacon, seed, valor do
    beacon, algoritmo `fy-v1` e resultado (posição inicial por Ação) — passos 1–7 do TECH-093.
  - Port `RandomnessBeacon`: adaptador drand (quicknet, com verificação de assinatura) e fake determinístico.
  - Conclusão do sorteio agendado pelo `formalize_acquisition` (TECH-020) feita pelo consumidor do outbox — sem
    command nem job novo (TECH-051, TECH-090).
  - Evidência na Área do Titular e no Admin; notificação do resultado (REQ-097); STRIDE do beacon.
- **Depends on / parallel with**: W8; paralela com W10 (nenhum arquivo em comum, ver "Paralelismo").
- **Acceptance criteria**: `[PD-011] a evidência mostra participantes, método ou insumo de aleatoriedade e
  resultado` · `[TECH-093] vetor fixo reproduz exatamente fy-v1; índice uniforme por rejection sampling, sem viés de
  módulo` · `[TECH-110] beacon fora do ar deixa o sorteio pendente, sem resultado parcial`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect PD-011 exits 0, stop after 4 tries`

### Wave 10 — Custódia e selagem

- **Goal**: toda noite de Residence em operação fica selada com exatamente uma custódia ativa.
- **IDs (dona)**: REQ-040, INV-2, INV-3. **TECH**: ADR-003, ADR-004, TECH-021, TECH-022, TECH-023, TECH-042,
  TECH-056, TECH-090, TECH-101.
- **Scope (slices/files)**: `calendar`, `inventory`.
  - Migrations `residence_date` (ADR-003), `date_custody` e `date_occupancy` com o DDL do `03` §3.2 (ADR-004).
  - Triggers das barreiras do TECH-021, da cadeia de origem do TECH-022 e da matriz do TECH-023, completas aqui
    para as waves seguintes só usarem.
  - Job `open_exercise`: mantém selados o exercício corrente e o seguinte, porque a posição 1 abre em 15/09 do ano
    anterior (TECH-042); cria a custódia raiz `owner`/`spe_pool` (TECH-021).
  - Check-in às 14:00 e check-out às 10:00 locais (ADR-003).
  - Consultas de INV-1/INV-2/INV-3 após todo teste `db`; alerta `open_exercise_failure` (log estruturado +
    notificação de staff, fora do outbox — TECH-101). Sem telas.
- **Depends on / parallel with**: W8; paralela com W9.
- **Acceptance criteria**: `[TECH-110] Data-Residence selada sem custódia ativa falha` · `[TECH-041] a selagem exige
  103 + 262 datas (+29/02); data selada não é reclassificada` · `[INV-3] quarta origem falha` · `[INV-2] par
  ocupação/custódia fora da matriz falha com ERR_CAPACITY_UNAVAILABLE` · `[REQ-040] entrada no Inventário Luxtory
  sem origem, autorização ou tratamento econômico é recusada; reversão só volta à custódia pai` · `[REQ-024]
  open_exercise cria a custódia owner da Residence Owner formalizada` · `[TECH-110] check-in 14:00 e check-out
  10:00 locais convertidos em UTC`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-040,INV-2,INV-3 exits 0, stop after 5 tries`

### Wave 11 — Direito de Uso, janelas e rotações

- **Goal**: saldos por Ação, exercício e categoria, e janelas cumulativas conforme o `01`, com folga zero.
- **IDs (dona)**: REQ-030, REQ-031, REQ-032, REQ-033, REQ-039, PD-004, INV-4, INV-5. **TECH**: TECH-026, TECH-027,
  TECH-042, TECH-051, TECH-090.
- **Scope (slices/files)**: `calendar`.
  - Migrations `use_right_ledger` (só-inserção: grant · consume · restore · expire · correction) e
    `use_right_balance` (TECH-026); concessões só da configuração ou da alocação inicial.
  - Saldo próprio do 29/02 (`leap`) e lista bissexta própria (TECH-027/042); janelas e rotação (TECH-042, BR-101).
  - Job `close_exercise`; `correct_use_right` em `POST /v1/admin/use-right-corrections`.
  - Consultas de INV-4/INV-5 após todo teste `db`; notificações de abertura anual e de direito ao 29/02 (REQ-097).
- **Depends on / parallel with**: W9, W10; sequencial.
- **Acceptance criteria**: `[INV-4] limites somados + Luxtory = capacidade de cada categoria; excesso ou categoria
  errada falha` · `[INV-5] saldo do ano N não atende N+1` · `[REQ-030] categorias não se compensam; saldo
  insuficiente → ERR_USE_RIGHT_BALANCE` · `[REQ-031] lista bissexta nunca é recalculada` · `[TECH-110] o 29/02 é
  Média/Baixa e consome só o saldo leap, nunca o ordinário` · `[REQ-032] rotação e abertura cumulativa` ·
  `[REQ-033] exercício parcial usa só a alocação da Edition; janelas contam da formalização` · `[PD-004][EC-4] o
  29/02 abre em 15/09 ou na formalização e expira sem transporte nem Inventário` · `[REQ-039] capacidade não
  reservada fica coletiva até o fim do exercício` · `[TECH-110] correção nunca altera concessão`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-030,REQ-031,REQ-032,REQ-033,REQ-039,PD-004,INV-4,INV-5 exits 0, stop after 5 tries`

### Wave 12 — Reserva de uso próprio

- **Goal**: Owner e Co-Owner reservam dentro de janelas, saldos e limites de permanência.
- **IDs (dona)**: REQ-034, REQ-035, REQ-037, PD-002, INV-1. **TECH**: TECH-023, TECH-045, TECH-051, TECH-055.
- **Scope (slices/files)**: `booking`.
  - Migration `booking`; `create_own_use_booking` em `POST /v1/bookings` (sem Membership). Co-Owner: `spe_pool →
    use_right/reserved_right` + consume + ocupação `own_use`. Owner: ocupação sobre `owner`, sem janela nem rotação.
  - Reserva sobre `reserved_right` já devolvido da mesma Ação não consome de novo (TECH-023; testado na W22).
  - Validação noite a noite; permanência e adjacência (TECH-045); o 29/02 conta para permanência (REQ-031).
  - Telas renderizadas no servidor: calendário do Titular (disponibilidade, saldos, janelas), reservas e central de
    notificações; componente de calendário entra no DS.
- **Depends on / parallel with**: W11; sequencial.
- **Acceptance criteria**: `[INV-1][CONC-1] reservas concorrentes na mesma noite → exatamente uma; a outra recebe
  ERR_BOOKING_CONFLICT` · `[CONC-2][CONC-3] saldo contra saldo e adjacência sob concorrência` · `[PD-002] de 10 a
  12/03 consome 10 e 11/03` · `[TECH-110] reserva de 1 noite é aceita; 0 noites é recusada` ·
  `[REQ-034][EC-1][EC-2] período que cruza categoria ou exercício é validado noite a noite; adjacentes acima de 14
  noites são recusadas` · `[REQ-031][EC-4] o 29/02 conta para permanência e adjacência` · `[REQ-035] o limite vale
  só no uso próprio do Co-Owner` · `[REQ-037] Owner sem janela nem rotação` · E2E com axe 0.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-034,REQ-035,REQ-037,PD-002,INV-1 exits 0, stop after 5 tries`

### Wave 13 — Cancelamento, no-show, recuperação e exceção

- **Goal**: reversões devolvem à origem econômica certa e exceções não criam efeito econômico.
- **IDs (dona)**: REQ-080, REQ-081, REQ-083, PD-010. **TECH**: TECH-043, TECH-046, TECH-055, TECH-060, TECH-090.
- **Scope (slices/files)**: `booking`, `inventory`.
  - `cancel_own_use_booking` (TECH-043, contado no fuso da Residence) com classificação gravada; tardio → noites
    futuras `forfeited_right`; Owner permanece `owner`.
  - `declare_no_show` (TECH-046) + job `flag_no_show_candidates`; `recover_future_capacity`; job
    `advance_booking_states` (TECH-055).
  - `open_exception`/`resolve_exception` sobre reserva de uso próprio (mecanismos do Club na W18).
  - API `POST /v1/bookings/{id}/cancel`, `POST /v1/admin/bookings/{id}/{no-show,recover-future-capacity,exceptions}`,
    `POST /v1/admin/exceptions/{id}/resolve`; telas do Titular e do Admin; notificações.
- **Depends on / parallel with**: W12; sequencial.
- **Acceptance criteria**: `[REQ-080] com 15 dias o saldo volta; com 14 o consumo fica; a classificação gravada não
  é recalculada` · E2E `[REQ-080] a consequência aparece antes de confirmar` · `[EC-10] após início parcial, só as
  noites futuras viram forfeited_right e são recuperáveis` · `[REQ-081] cancelamento do Owner não gera Inventário
  Luxtory` · `[TECH-060] forfeited_right não é reservável, depositável nem locável` · `[PD-010][REQ-083][EC-12]
  exceção sem restituição, Crédito ou compensação; resolução auditada`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-080,REQ-081,REQ-083,PD-010 exits 0, stop after 4 tries`

### Wave 14 — Seleção Luxtory, parâmetros e convidados

- **Goal**: a Luxtory seleciona seu quantitativo por categoria; parâmetros ganham autoridade e vigência; o Titular indica
  convidado.
- **IDs (dona)**: REQ-016, REQ-036, REQ-092, REQ-095. **TECH**: TECH-022, TECH-023, TECH-030, TECH-051.
- **Scope (slices/files)**: `calendar`, `admin`, `booking`.
  - `select_luxtory_capacity`: janela N+1, finalidade por data, `inventory ⇔ annual_allocation`; finalidade
    diferente de `inventory` cria reserva e ocupação `luxtory_use` (TECH-023); manutenção só a partir da janela.
  - Migration `parameter` (TECH-030: só-inserção, vigências sem sobreposição, autoridade, `authorization_ref`) +
    `set_parameter`.
  - `guest_rules` = texto versionado por Residence, exibido e aceito na indicação; nenhuma regra executável
    presumida (conteúdo em P-5).
  - `nominate_guest`: sem `guest_rules` publicado → `ERR_PARAMETER_MISSING`; dados do convidado ⛔ P-6 (registra só
    a indicação e a versão aceita).
  - Registro fechado dos commands Admin. API `POST /v1/admin/residences/{id}/luxtory-selection`,
    `POST /v1/admin/parameters`, `POST /v1/bookings/{id}/guests`; telas.
- **Depends on / parallel with**: W12; sequencial depois da W13 (compartilha `openapi.yaml` e o registro de
  commands).
- **Acceptance criteria**: `[REQ-016][EC-5] capacidade da Luxtory preservada com Co-Owners sem saldo` · `[CONC-11] seleção
  Luxtory contra reserva` · `[TECH-110] seleção para Inventário exige annual_allocation` · `[REQ-036] cada data
  selecionada tem finalidade; finalidade diferente de inventory ocupa com luxtory_use; manutenção antes da janela é
  recusada` · `[REQ-095] parâmetro sem autoridade ou vigência é recusado; vigências não se sobrepõem` · `[REQ-092]
  indicar convidado não consome Direito de Uso nem cria direito; sem guest_rules → ERR_PARAMETER_MISSING`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-016,REQ-036,REQ-092,REQ-095 exits 0, stop after 4 tries`

### Wave 15 — Membership

- **Goal**: Membership condiciona os mecanismos do Club, verificado no instante da ação, sem tocar direitos
  patrimoniais.
- **IDs (dona)**: REQ-011, REQ-050, PD-001. **TECH**: TECH-030, TECH-050, TECH-055.
- **Scope (slices/files)**: `identity`. Migrations `membership` (`party_id UNIQUE`, estados TECH-055) e
  `membership_plan_version` (opcional; nenhum plano, benefício ou prioridade presumidos — TECH-030; prioridade por
  plano em P-5); ciclo de vida pelo Admin sob guard e auditoria, efeitos só para o futuro (BR-320/321);
  elegibilidade por mecanismo (TECH-050) verificada no instante da ação; notificação de mudança de elegibilidade;
  API `POST /v1/admin/memberships…`; visão do Titular.
- **Depends on / parallel with**: W7; sequencial.
- **Acceptance criteria**: `[PD-001] segundo Membership para o mesmo CPF/CNPJ é recusado` · `[REQ-011] suspensão
  entre duas ações bloqueia a segunda` · `[REQ-050] suspensão e encerramento preservam direitos e compromissos;
  mudar o Membership não cria nem altera Taxa, despesas, Ação, Direito de Uso ou rotação` · `[REQ-032] plano não
  altera janela nem rotação` · `[TECH-055] transição inválida → ERR_STATE_TRANSITION`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-011,REQ-050,PD-001 exits 0, stop after 4 tries`

### Wave 16 — PRL, parâmetros econômicos e snapshot

- **Goal**: PRL e parâmetros econômicos versionados, com snapshot do que formou cada operação.
- **IDs (dona)**: REQ-013, REQ-052. **TECH**: TECH-030, TECH-031, TECH-033.
- **Scope (slices/files)**: `pricing`. Migration `prl` por (Residence, data) versionado (TECH-030): inicial por Admin
  ou Super Admin, publicado só o Super Admin altera, efeitos só para o futuro. Tipos de parâmetro: Membership
  (valor-base), Taxa de Administração (sem cobrança — `03` §15), multiplicador, validade dos Créditos, Fee, prazo da
  Request, descontos Luxplus, taxas e comissões de locação. Os valores iniciais do TECH-030 são publicados pelo
  runbook, nunca como padrão no código. Snapshot (TECH-031); `decimal.js` com HALF_UP (TECH-033); API
  `POST /v1/admin/prl` e `POST /v1/admin/prl/changes`; telas.
- **Depends on / parallel with**: W10, W14; sequencial.
- **Acceptance criteria**: `[REQ-013] Admin não altera PRL publicado; Super Admin altera` · `[REQ-052] operação
  formada preserva o PRL; data sem PRL não é ofertável` · `[TECH-001] parâmetro ausente → ERR_PARAMETER_MISSING;
  zero nunca presumido` · `[TECH-033] HALF_UP uma única vez no valor final`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-013,REQ-052 exits 0, stop after 4 tries`

### Wave 17 — Créditos e Carteira

- **Goal**: Créditos por lote com ledger imutável, consumo FEFO e Carteira não monetária.
- **IDs (dona)**: REQ-053, REQ-054, PD-008, INV-6. **TECH**: ADR-007, TECH-025, TECH-044, TECH-051, TECH-070,
  TECH-071, TECH-072, TECH-090.
- **Scope (slices/files)**: `credits`. Migrations `credit_lot` e `credit_entry` (ADR-007); movimentos do TECH-070;
  FEFO e Garantia (TECH-071); validade por adição calendárica em UTC (TECH-044); uso só antes de `expires_at` + job
  `expire_credit_lots` (TECH-072); `reverse_credit`; Carteira e extrato (estados do REQ-096); consultas de INV-6
  após todo teste `db`; aviso de expiração próxima ⛔ P-7.
- **Depends on / parallel with**: W15; sequencial.
- **Acceptance criteria**: `[INV-6] gasto duplo, transferência ou origem inválida falham` · `[TECH-025] retry não
  duplica o lote` · `[PD-008] consome o lote que vence antes; empate pela originação mais antiga` · `[TECH-044]
  31/08 + 24 meses → 31/08; 29/02 + 12 meses → 28/02; job atrasado não prorroga a validade` · `[CONC-8] mesmos
  Créditos sob concorrência` · `[TECH-070] reversão após a expiração vira expired` · `[REQ-053] Membership
  inelegível bloqueia uso sem pausar validade; reativação restabelece saldo válido; a Carteira não usa formato
  monetário nem oferece venda ou cessão` · `[REQ-054] extrato com data, tipo, quantidade, lote e operação`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-053,REQ-054,PD-008,INV-6 exits 0, stop after 4 tries`

### Wave 18 — Políticas comerciais

- **Goal**: nenhum mecanismo confirma sem política vigente e nenhuma política contorna regra estrutural.
- **IDs (dona)**: REQ-082, REQ-104, PD-009. **TECH**: TECH-032, TECH-051.
- **Scope (slices/files)**: `pricing`. Migration `commercial_policy` versionada com estrutura fechada por mecanismo
  (TECH-032); efeitos limitados a `capacity · credits · fee · money · remuneration` e validados contra BR-163 e os
  INV; `publish_policy`; avaliação por snapshot + evento. Eventos com command: no-show (`declare_no_show`) e exceção
  (`open_exception`/`resolve_exception`); o evento de cancelamento é avaliado só no domínio até P-11. Componente de
  aceite da política; `ERR_POLICY_MISSING`; API `POST /v1/admin/policies`.
- **Depends on / parallel with**: W16; sequencial.
- **Acceptance criteria**: `[PD-009] sem política vigente nada confirma; a política aceita fica vinculada à
  operação` · `[REQ-082] nenhum tratamento econômico por padrão` · `[REQ-104] política ou parâmetro que contrarie
  BR-163 ou um INV é recusado` · `[PD-010] exceção em mecanismo com política aplica só os efeitos da política
  vinculada`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-082,REQ-104,PD-009 exits 0, stop after 4 tries`

### Wave 19 — Pagamentos, Fee e settlement

- **Goal**: pagamento nunca reserva capacidade e todo efeito financeiro é único, monotônico e separado por categoria.
- **IDs (dona)**: REQ-094. **TECH**: ADR-006, ADR-008, TECH-025, TECH-080, TECH-081, TECH-082, TECH-083, TECH-090,
  TECH-101.
- **Scope (slices/files)**: `billing`. Port `PaymentGateway` com fake determinístico (recusado em produção,
  TECH-001); `payment` monotônico, `fee_charge`, `refund`, `webhook_inbox` (TECH-025, ADR-006); sequência do
  TECH-080; Fee = maior entre o percentual do PRL do período e o mínimo publicados (`01` §24, BR-230, BR-232);
  `settlement` por categoria (TECH-083); conciliação de pagamentos no job `reconciliation` e alerta
  `payment_without_outcome`; `POST /v1/webhooks/psp/{provider}`; relatório Admin por categoria. STRIDE `payments`.
- **Depends on / parallel with**: W16; sequencial.
- **Acceptance criteria**: `[REQ-094] o relatório nunca soma as categorias; Brand Partner e margem do Investor nunca
  são receita Luxtory` · `[BR-230] Fee calculado pela regra do 01 com os parâmetros publicados` · `[TECH-080]
  pagamento aprovado + falha no domínio → estorno` · `[TECH-025] retry não duplica settlement nem refund` ·
  `[TECH-110] webhook duplicado ou fora de ordem não regride o estado; queda após o pagamento → conciliação confirma
  ou estorna` · `[TECH-082] Fee nunca vira Crédito`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-094 exits 0, stop after 4 tries`

### Wave 20 — Luxchange: depósito

- **Goal**: o Titular converte capacidade elegível em Créditos e a capacidade entra no Inventário Luxtory no mesmo
  ato.
- **IDs (dona)**: REQ-051, REQ-060. **TECH**: TECH-023, TECH-043, TECH-051.
- **Scope (slices/files)**: `luxchange`. `deposit_capacity` em `POST /v1/luxchange/deposits` (Membership;
  antecedência do TECH-043); Owner deposita `owner` livre, Co-Owner só `reserved_right`. Créditos = Σ PRL das noites
  × multiplicador publicado (`01` §20). A reserva de uso próprio cedida termina `cancelled` com
  `release_reason='ceded'`, sem restore (TECH-023). Créditos + custódia `luxchange_cession` no mesmo commit; tela;
  notificação de originação.
- **Depends on / parallel with**: W13, W16, W17; sequencial.
- **Acceptance criteria**: `[REQ-060] Créditos e entrada no Inventário no mesmo resultado; o dia do Co-Owner segue
  consumido` · `[REQ-051] depósito exige Membership; Co-Owner só data reservada; Owner só capacidade própria livre;
  Titular com Membership suspenso segue criando e cancelando uso próprio` · `[BR-201] Créditos = Σ PRL × multiplicador
  publicado` · `[CONC-10] depósito contra cancelamento` · `[TECH-043] antecedência de 14 dias`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-051,REQ-060 exits 0, stop after 4 tries`

### Wave 21 — Request: envio

- **Goal**: enviar Request com snapshot, Garantia e Fee, sem bloquear a capacidade.
- **IDs (dona)**: REQ-062, PD-005, PD-007. **TECH**: TECH-024, TECH-031, TECH-044, TECH-061, TECH-071, TECH-072,
  TECH-082, TECH-090.
- **Scope (slices/files)**: `luxchange`. `send_request` (rota do TECH-061; política aceita antes; snapshot; Garantia
  só com lotes válidos até a expiração da Request; Fee pago antes — TECH-082; sem bloqueio — TECH-024);
  `withdraw_request`; job `expire_requests` com expiração também checada nos commands (TECH-044); perda de
  elegibilidade encerra a Request (TECH-024), com gatilhos nos commands das W12, W13, W15 e W20; API
  `POST /v1/luxchange/requests` e `POST /v1/luxchange/requests/{id}/withdraw`; telas; notificações de Request
  recebida, Garantia e Fee.
- **Depends on / parallel with**: W18, W19, W20; sequencial.
- **Acceptance criteria**: `[PD-005] exige Membership, Garantia e Fee; Requests coexistem` · `[PD-007][EC-9] PRL
  alterado não muda o snapshot` · `[REQ-062] Fee apresentado separado dos Créditos` · `[EC-6] lote que vence antes
  da Request não serve de Garantia` · `[EC-7] perda de elegibilidade encerra, libera Garantia e reverte Fee` ·
  `[TECH-072] lote vencido em Garantia é liberado como expired, nunca como available` · `[TECH-044] Request vencida
  não é aceita mesmo sem o job ter rodado`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-062,PD-005,PD-007 exits 0, stop after 5 tries`

### Wave 22 — Request: aceite e recusa

- **Goal**: o primeiro aceite válido confirma, e todas as concorrentes se encerram sem penalidade.
- **IDs (dona)**: REQ-061, REQ-063, REQ-064, REQ-096, PD-006. **TECH**: TECH-023, TECH-024, TECH-055, TECH-061,
  TECH-070.
- **Scope (slices/files)**: `luxchange`. `accept_request` (revalidação integral; cessão + reserva `luxchange_request`
  + `held→consumed` + Créditos ao cedente com originação própria; encerra concorrentes); `reject_request`; estados da
  Request (TECH-055); API `POST /v1/luxchange/requests/{id}/accept` e `…/reject`; telas do detentor; notificação do
  resultado.
- **Depends on / parallel with**: W21; sequencial.
- **Acceptance criteria**: `[REQ-061] sem aceite tácito; o solicitante não aceita a própria Request` ·
  `[REQ-063][EC-8] confirmar uma encerra as concorrentes sem penalidade` · `[REQ-064] revalida capacidade,
  Membership dos dois e Garantia` · `[PD-006][CONC-4][CONC-5] vale o primeiro aceite válido; aceite contra retirada
  ou expiração; a avaliação de cancelamento pós-aceite nunca debita os Créditos do cedente` (domínio, P-11) ·
  `[TECH-023] reserved_right devolvido por política (exceção resolvida) recebe nova reserva de uso próprio sem novo
  consumo` · `[REQ-096] estados de Concept, Membership, Crédito, Request e Reserva conferem com o 02`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-061,REQ-063,REQ-064,REQ-096,PD-006 exits 0, stop after 5 tries`

### Wave 23 — Luxchange Direct

- **Goal**: reservar capacidade do Inventário Luxtory com Créditos, sem aceite de terceiro.
- **IDs (dona)**: REQ-065. **TECH**: TECH-061, TECH-080, TECH-082.
- **Scope (slices/files)**: `luxchange`. `create_direct` em `POST /v1/luxchange/direct`: só Inventário Luxtory,
  Membership, Créditos por FEFO, Fee antes da confirmação, política, revalidação pós-pagamento (TECH-080).
- **Depends on / parallel with**: W22; sequencial.
- **Acceptance criteria**: `[REQ-065] Direct sem aceite de terceiro; exige Membership, Créditos e Fee` · `[CONC-9]
  Request contra Direct` · `[CONC-8] mesmos Créditos` · `[REQ-035] Direct acima de 14 noites é aceito`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-065 exits 0, stop after 3 tries`

### Wave 24 — Luxplus

- **Goal**: compra em dinheiro de noites do Inventário Luxtory, com preço congelado.
- **IDs (dona)**: REQ-066, REQ-070. **TECH**: TECH-031, TECH-080, TECH-083.
- **Scope (slices/files)**: `booking`, `billing`. `buy_luxplus` em `POST /v1/luxplus/purchases`: só Inventário;
  Membership; independe de Créditos; preço = PRL × (1 − desconto publicado) congelado na compra; pagamento;
  settlement de receita Luxtory; política.
- **Depends on / parallel with**: W23 (Direct × Luxplus); sequencial.
- **Acceptance criteria**: `[REQ-070] preço congelado; sem nova remuneração ao cedente` · `[REQ-066][CONC-7] Direct
  e Luxplus na mesma data → uma única confirmação` · `[TECH-001] sem desconto publicado → ERR_PARAMETER_MISSING`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-066,REQ-070 exits 0, stop after 4 tries`

### Wave 25 — Locação externa

- **Goal**: o Titular monetiza capacidade elegível pelo canal Luxtory; a receita líquida é dele e o locatário não
  adquire direitos.
- **IDs (dona)**: REQ-012, REQ-041, REQ-042, REQ-043, REQ-071, REQ-072. **TECH**: TECH-023, TECH-024, TECH-051,
  TECH-063, TECH-083.
- **Scope (slices/files)**: `booking`, `billing`.
  - `authorize_rental` → `rental_offer` (não altera custódia); `withdraw_rental_offer`; `confirm_rental` (Admin)
    registra o valor bruto informado pelo canal (BR-253, BR-260).
  - Toda confirmação incompatível fecha as ofertas abertas no mesmo commit: uso próprio (W12), depósito (W20),
    aceite (W22), locação e comercialização por inadimplência (W27) — TECH-024.
  - `rental_contract` sem direitos, com referência externa do canal (⛔ P-6); settlement ao Titular (bruto −
    deduções publicadas; repasse bancário fora de escopo, `03` §15); Owner sem Membership fica fora do canal
    (TECH-063).
  - API `POST /v1/rental-offers`, `POST /v1/rental-offers/{id}/withdraw`, `POST /v1/admin/rental-offers/{id}/confirm`;
    telas.
- **Depends on / parallel with**: W22; sequencial.
- **Acceptance criteria**: `[REQ-041] capacidade locável não entra no Inventário Luxtory` · `[REQ-042][CONC-6]
  reserva de uso próprio, depósito ou aceite sobre data ofertada fecham a oferta no mesmo ato` · `[REQ-043] oferta
  retirável até o compromisso` · `[REQ-071] Owner escolhe as datas; sem Membership não usa o canal` · `[TECH-063]
  voltar ao canal exige ato expresso e revalidação` · `[REQ-072] dia locado do Co-Owner segue consumido, sem
  Créditos` · `[REQ-012] convidado e locatário sem Ação, Membership, Direito de Uso nem Créditos`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-012,REQ-041,REQ-042,REQ-043,REQ-071,REQ-072 exits 0, stop after 5 tries`

### Wave 26 — Fechamento do R3

- **Goal**: provar, entre todos os mecanismos, unicidade econômica, base registrada e paridade Owner/Co-Owner.
- **IDs (dona)**: REQ-073, REQ-102, REQ-103. **TECH**: TECH-064, TECH-110.
- **Scope (slices/files)**: testes transversais, sem feature nova.
- **Depends on / parallel with**: W24, W25; sequencial (fecha o R3).
- **Acceptance criteria**: `[REQ-073] para cada par de mecanismos, a mesma data não produz dois benefícios
  econômicos (Créditos, receita Luxtory, receita do Titular)` · `[REQ-102] toda oferta, reserva do Inventário e
  locação aponta custódia com base registrada; sem base, é recusada` · `[REQ-103] o mesmo mecanismo produz o mesmo
  efeito para Owner e Co-Owner, exceto nas diferenças listadas no REQ-103` · `npm run trace` encontra CONC-1 a
  CONC-12.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-073,REQ-102,REQ-103,CONC-1,CONC-2,CONC-3,CONC-4,CONC-5,CONC-6,CONC-7,CONC-8,CONC-9,CONC-10,CONC-11,CONC-12 exits 0, stop after 3 tries`

### Wave 27 — Inadimplência

- **Goal**: restrição e comercialização por inadimplência só com base registrada, sem tocar reservas confirmadas nem
  rotação.
- **IDs (dona)**: REQ-090. **TECH**: TECH-050, TECH-051, TECH-062, TECH-090.
- **Scope (slices/files)**: `billing`, `booking`. `register_debt`; `apply_delinquency_restriction` (nunca
  automática; torna o Membership inelegível para o mecanismo — TECH-050; `ERR_DELINQUENCY_RESTRICTED`);
  `authorize_delinquency_commercialization` com custódia `use_right/delinquency`; venda via `confirm_rental`;
  settlement dívida → custos → excedente ao Co-Owner, sem Créditos; job `close_delinquency_authorization`; API
  `POST /v1/admin/debts…`; notificações de suspensão e regularização.
- **Depends on / parallel with**: W26; sequencial.
- **Acceptance criteria**: `[REQ-090] débito sem restrição aplicada não bloqueia nada; a restrição bloqueia só novas
  ações; comercialização limitada ao exercício atual, aos saldos e ao débito; a quitação encerra autorização e
  restrição` · `[TECH-110] inadimplência não altera reserva confirmada nem rotação` · `[TECH-062] não gera Créditos
  nem entra no Inventário`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-090 exits 0, stop after 4 tries`

### Wave 28 — Transferência

- **Goal**: transferir a titularidade preservando compromissos e o que pertence à Ação.
- **IDs (dona)**: REQ-093. **TECH**: TECH-024, TECH-042, TECH-051.
- **Scope (slices/files)**: `ownership`. `transfer_holding` (TECH-051 e `03` §7) em
  `POST /v1/admin/holdings/{id}/transfer`: Ação, saldo remanescente, posições e histórico de rotação seguem a Ação;
  reservas e compromissos continuam; Membership e Créditos não se transferem; adesão do adquirente registrada;
  Requests e ofertas pendentes tratadas pelo TECH-024; notificação de transferência concluída.
- **Depends on / parallel with**: W26; sequencial depois da W27.
- **Acceptance criteria**: `[REQ-093][EC-11] Co-Owner: o adquirente recebe a Ação, o saldo remanescente e as
  posições e histórico das rotações; reservas e compromissos futuros permanecem; Membership e Créditos do
  transmitente não se transferem; Owner: Membership não segue`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-093 exits 0, stop after 3 tries`

### Wave 29 — Conformidade e parceiros

- **Goal**: não conformidade suspende o que o `01` permite, sem alterar propriedade, Direito de Uso nem compromissos.
- **IDs (dona)**: REQ-021, REQ-038, REQ-091. **TECH**: TECH-020.
- **Scope (slices/files)**: `catalog`. Registro de conformidade (TECH-020); suspensão pela BR-020 →
  `ERR_COMPLIANCE_SUSPENDED` nos mecanismos do Club; encerramento de Brand Partner com direitos sobreviventes;
  autorizações de parceiros de execução; Discovery oculta crédito de marca não autorizado.
- **Depends on / parallel with**: W27 (mesmos guards dos mecanismos); sequencial.
- **Acceptance criteria**: `[REQ-021] personalização não essencial do Owner é aceita; elemento essencial exige
  aprovação registrada; não conformidade material suspende Club, certificação e uso de marca sem alterar direitos;
  após o encerramento da parceria, nenhum uso novo de marca` · `[REQ-038] Residence sem conformidade registrada não
  participa do Club; administração integral do Owner é opcional` · `[REQ-091] Residence preserva a versão do
  Concept; parceiro de execução sem autorização é recusado` · `[EC-13] Residence suspensa preserva reservas
  confirmadas de terceiros` · `[TECH-110] personalização incompatível de Co-Owner falha`.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-021,REQ-038,REQ-091 exits 0, stop after 4 tries`

### Wave 30 — Hardening e gate final

- **Goal**: evidência protegida, divergências detectadas e o gate do `03` §12 cumprido.
- **IDs (dona)**: REQ-097. **TECH**: TECH-090, TECH-092, TECH-101, TECH-110.
- **Scope (slices/files)**: `platform`. `audit_seal` com cadeia SHA-256 sobre JCS RFC 8785 `audit-v1` (TECH-092),
  selado após o commit e varrido no `reconciliation` (sem job novo), com a prova `.ots` do OpenTimestamps guardada
  junto do selo (ADR-0002); conciliação de divergências (saldos × ledgers) com bloqueio do agregado e correção
  compensatória; alertas `invariant_breach · drift · audit_chain_failure`; teste de restauração sobre backup
  gerenciado (depende de D2), na sequência restauração → conciliação → reabertura das escritas (TECH-101); STRIDE
  consolidado e `/security-scan`; catálogo de notificações × REQ-097.
- **Depends on / parallel with**: W28, W29 e D2; sequencial (última).
- **Acceptance criteria**: `[TECH-092] commits concorrentes → um selo por evento e cadeia válida` · `[REQ-097] todo
  evento listado sai pelo outbox, sem duplicata; Titular sem Membership recebe os de calendário` · conciliação sem
  divergência · migrations up/down · `npm run trace -- --gate` = 63/63 REQ · 11/11 PD · 6/6 INV · 13/13 EC · 12/12
  CONC.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0, npm run trace -- --expect REQ-097 exits 0, and npm run trace -- --gate reports 63/63 REQ, 11/11 PD, 6/6 INV, 13/13 edge cases and 12/12 concurrency pairs, stop after 5 tries`

### Matriz de cobertura (uma wave dona por ID)

| Wave | REQ | PD | INV |
|---|---|---|---|
| W1 | REQ-015, REQ-098 | — | — |
| W2 | REQ-014 | — | — |
| W3 | REQ-020, REQ-027 | — | — |
| W4 | REQ-100, REQ-101 | — | — |
| W5 | REQ-023 | — | — |
| W8 | REQ-010, REQ-022, REQ-024, REQ-025, REQ-026 | PD-003 | — |
| W9 | — | PD-011 | — |
| W10 | REQ-040 | — | INV-2, INV-3 |
| W11 | REQ-030, REQ-031, REQ-032, REQ-033, REQ-039 | PD-004 | INV-4, INV-5 |
| W12 | REQ-034, REQ-035, REQ-037 | PD-002 | INV-1 |
| W13 | REQ-080, REQ-081, REQ-083 | PD-010 | — |
| W14 | REQ-016, REQ-036, REQ-092, REQ-095 | — | — |
| W15 | REQ-011, REQ-050 | PD-001 | — |
| W16 | REQ-013, REQ-052 | — | — |
| W17 | REQ-053, REQ-054 | PD-008 | INV-6 |
| W18 | REQ-082, REQ-104 | PD-009 | — |
| W19 | REQ-094 | — | — |
| W20 | REQ-051, REQ-060 | — | — |
| W21 | REQ-062 | PD-005, PD-007 | — |
| W22 | REQ-061, REQ-063, REQ-064, REQ-096 | PD-006 | — |
| W23 | REQ-065 | — | — |
| W24 | REQ-066, REQ-070 | — | — |
| W25 | REQ-012, REQ-041, REQ-042, REQ-043, REQ-071, REQ-072 | — | — |
| W26 | REQ-073, REQ-102, REQ-103 | — | — |
| W27 | REQ-090 | — | — |
| W28 | REQ-093 | — | — |
| W29 | REQ-021, REQ-038, REQ-091 | — | — |
| W30 | REQ-097 | — | — |

**Total: 63/63 REQ · 11/11 PD · 6/6 INV.** W0, W6 e W7 não são donas de REQ; justificam-se por TECH-010/011/100/110,
pela superfície Interesse (`02` §2) e por TECH-050 + ADR-0002.

- **Complementos** (acrescentam casos à suíte da dona): REQ-022, REQ-024 e REQ-025 em W5, W6 e W10 · REQ-027 em W8 e
  W19 · REQ-031 em W12 · REQ-032 em W15 e W27 · REQ-035 e REQ-051 em W21–W25 · REQ-038 em W8 e W19 · REQ-095 em
  cada wave com command Admin (PRL na W16) · REQ-096 em W3, W12, W13, W15 e W17 · REQ-097 em cada wave que emite
  evento · REQ-100 e REQ-101 na varredura da W0 e em toda tela · PD-009 em W21–W25 · PD-010 na W18 · PD-011 na W1.
- **INV como regressão transversal**: as consultas de INV-1…INV-6 rodam após todo teste `db` a partir da wave em que
  as tabelas nascem (W10, W11, W17); a conciliação da W30 reusa as mesmas consultas.
- **Edge cases (`02` §15)**: EC-1 e EC-2 → W12 · EC-3 → W8 · EC-4 → W11/W12 · EC-5 → W14 · EC-6, EC-7 e EC-9 → W21 ·
  EC-8 → W22 · EC-10 e EC-12 → W13 · EC-11 → W28 · EC-13 → W29.
- **Concorrência (TECH-110)**: CONC-1, CONC-2 e CONC-3 → W12 · CONC-4 e CONC-5 → W22 · CONC-6 → W25 · CONC-7 → W24 ·
  CONC-8 → W17/W23 · CONC-9 → W23 · CONC-10 → W20 · CONC-11 → W14 · CONC-12 → W0/W1.
- **Commands e jobs**: todo command do TECH-051 e todo job do TECH-090 têm wave (W1 `outbox`; W10 `open_exercise`;
  W11 `close_exercise`; W13 `advance_booking_states`, `flag_no_show_candidates`; W17 `expire_credit_lots`; W19 e W30
  `reconciliation`; W21 `expire_requests`; W27 `close_delinquency_authorization`).

### Pendências externas

| # | Pendência | Bloqueia | Como seguir sem inventar |
|---|---|---|---|
| P-1 | Fotografia oficial e logo Pure White | nenhuma wave | Frame tipográfico e Warm Sand sobre scrim; assets chegam como commit aditivo |
| P-2 | PSP não contratado | go-live de W21–W25 | port + fake determinístico (TECH-081); fake recusado em produção |
| P-3 | Campos de contato e qualificação do interesse + base LGPD, consentimento e aviso de privacidade (REQ-025) | **W6** e o go-live do R1-Interesse | W5 grava só os campos canônicos |
| P-4 | Políticas comerciais (PD-009) | operação de W22–W25 | políticas de teste; sem política → `ERR_POLICY_MISSING` (REQ-082) |
| P-5 | PRL por data; conteúdo de `guest_rules`; descontos Luxplus; taxas e comissões de locação; planos de Membership e seus benefícios (prioridade por plano sem mecânica no `02`/`03`) | operação de W14, W15 e W16–W25 | ausência → `ERR_PARAMETER_MISSING`/`ERR_PRL_MISSING`; zero nunca presumido. Os valores iniciais do TECH-030 **não** são pendência: são publicados pelo runbook |
| P-6 | Dados do convidado (REQ-092) e do locatário (`rental_contract`) | parte da W14 e da W25 | só a indicação e a versão aceita, ou a referência do canal, sem dado pessoal |
| P-7 | Antecedência do aviso de expiração próxima de Créditos (REQ-097) | só esse aviso (W17) | não emitido até a definição (TECH-001); o gate o registra como bloqueado |
| P-8 | Regras de exposição de marca por Brand Partner (BR-015) | nenhuma wave | exposição e `ConceptCredit` só com autorização registrada |
| P-9 | SMTP próprio (D4) — **resolvida em 2026-09-27**: SMTP customizado do Supabase Auth com Resend | go-live do login de Titulares (W7) | SMTP padrão do Supabase só envia a membros da org; notificações dentro do app. Resolvida: o login por código envia pelo Resend (credencial só no Supabase, nunca no repositório) |
| P-10 | Banco Upstash Redis + envs (`NOTES.md`) | go-live das escritas públicas (W5, W6) | sem Redis a escrita pública é recusada; testes com fake |
| P-11 | **Lacuna normativa**: o `02` exige cancelamento de Request aceita, Direct, Luxplus e locação pela política (PD-006, PD-009, REQ-082), mas a tabela fechada do TECH-051 só tem `cancel_own_use_booking` | cancelamento pelo usuário nesses mecanismos (W18, W22–W25) | nenhum command criado; avaliação só no domínio; no-show e exceção seguem pelos commands existentes; exige nova versão do `03` (D6) |

### Riscos

1. **Planos gratuitos × produção comercial**: Vercel Hobby veda uso comercial e limita cron a 1×/dia; Supabase Free
   não tem o backup que o ADR-0002 pressupõe. O plano não depende de job para validade (TECH-044) e dispara o outbox
   após o commit. Decisões D1 e D2.
2. **`main` sem proteção e deploy automático concorrendo com migrations**: a W0 desliga esse deploy e só publica
   depois dos gates e do `migrate`; PR obrigatório por disciplina.
3. **Fidelidade dos testes**: GoTrue e Supavisor não rodam localmente; SQL, RLS e concorrência são testados em PG
   real, mas login e pooler reais só em staging (D3).
4. **Pendências travam releases, não o desenvolvimento**: P-3 segura o R1-Interesse; P-9 o R2; PSP, políticas e PRL
   a operação do R3; P-11 impede cancelar pelo usuário os mecanismos do Club até a nova versão do `03`. (P-9 resolvida
   em 2026-09-27 com a D4.)
5. **Concorrência no R3**: risco de PRs grandes e testes instáveis. Mitigação: Request em duas waves, tags CONC,
   barreiras determinísticas, retentativa com a mesma chave, relógio injetável e fechamento na W26.

### Decisões

| # | Decisão | Recomendação | Status |
|---|---|---|---|
| D1 | Vercel Pro antes do go-live público do R1 (termos de uso comercial; cron por minuto) | sim | aberta |
| D2 | Supabase Pro (backup diário, sem pausa) antes de dados reais; PITR no go-live econômico (ADR-0002). Pré-requisito da W30 | sim, no go-live do R1 | aberta |
| D3 | Segundo projeto Supabase Free como staging (Previews + validação de migrations na CI) | criar antes da W1 | **adiada** em 2026-09-26 (opção A: sem staging; Previews sem credencial do banco; reavaliar antes de dados reais, PII, 1ª transação econômica ou go-live — [ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)); **reavaliada** em 2026-09-26 na W2 (PII do 1º staff em `auth.users`): mantida sem staging; nova reavaliação antes de PII de clientes, 1ª transação econômica ou go-live público |
| D4 | Provedor SMTP para login e notificações | escolher antes do go-live do R2 | **resolvida** em 2026-09-27: **Resend** (SMTP customizado do Supabase Auth, remetente `acesso@luxtory.club`, domínio com SPF/DKIM; credencial exclusiva da plataforma só no Supabase) |
| D5a | `NOTES.md` já existia → atualizado no lugar, sem recriar | — | adotada em 2026-09-25 |
| D5b | Este arquivo: seção DS e Anexo A preservados byte a byte; plano Luxtory acrescentado no topo | — | adotada em 2026-09-25 |
| D5c | R1 pode ir ao ar só com Discovery (W3–W4) se P-3 atrasar? | — | aberta |
| D6 | Encaminhar P-11 à Luxtory: nova versão do `03` com command de cancelamento para os mecanismos do Club | encaminhar antes da W18 | aberta |

### Registro da revisão (2026-09-25)

Revisão com evidência (grep dos canônicos + releitura do `03` §3.2–§12), 20 achados F1–F20:

1. Classificação civil (PD-003, `temporal-polyfill`) movida da W10 para a W8: a alocação inicial da W8 valida a
   distribuição sazonal (TECH-020) — F1.
2. REQ-027 passa da W8 para a W3: a autorização do Investor condiciona o cadastro da Residence (BR-310) — F12.
3. P-11 e D6: o `02` exige cancelamento dos mecanismos do Club, ausente da tabela fechada do TECH-051 — F2.
4. Paralelismo reduzido a W9 ∥ W10; status atualizado pela sessão principal após o merge — F3.
5. Contrato único `openapi.yaml`/`asyncapi.yaml`; removido `GET /v1/residences/{id}/calendar` — F4, F19.
6. Testes novos: TECH-110 (selagem, 29/02, 1 noite, 14h/10h, job atrasado, `expires_at`), TECH-023, TECH-024,
   TECH-025, TECH-044, TECH-072, fórmulas do Fee e dos Créditos, cláusulas dos REQ-024, REQ-026, REQ-036, REQ-050,
   REQ-051, REQ-053, REQ-080 e do PD-011 — F6–F10, F20.
7. Critérios vagos descritos; convenções `EC-n` e `CONC-n`; CONC 12/12 no gate — F11.
8. TECH-030: Membership e Taxa de Administração como tipos de parâmetro; P-5 corrigida — F13.
9. ADR-0004 cobre UI, validação, e-mail, observabilidade e Storage; W30 depende de D2 e ganha `.ots` e reabertura
   das escritas após a conciliação — F14, F15.
10. Ambiguidades resolvidas: conteúdo do Discovery, `guest_rules`, reserva cedida, prioridade por plano — F16.
11. Ultron: gitleaks e `.vercelignore` na lista de ignores — F17.
12. IDs por extenso; TECH-011, ADR-001 e ADR-005 citados; base de 15/09 citada pelo TECH-042; emissor de JWT de teste
    na W2 — F5, F18.

### Execution notes

- Sequential waves run in the main session, one branch/PR per wave (`feat/w<n>-<slug>`, squash merge, Conventional
  Commits); o PR cita os IDs cobertos.
- A sequential wave can run as a **goal loop**: invoke its Goal command and let the evaluator hold the session to the
  acceptance criteria instead of trusting "looks done". Close the wave with `/verify` before marking it ✅.
- O único grupo paralelo é **W9 ∥ W10**, que pode rodar como subagentes em worktrees isoladas — uma wave por agente,
  merge de um PR por vez.
- Ações do responsável fora do código: secrets `VERCEL_TOKEN` e `DATABASE_URL_MIGRATIONS` após a W0; desligar a Data
  API do Supabase e definir a senha do papel de aplicação (runbook, W1); indicar o primeiro Super Admin (W2).
- When a wave completes, mark it ✅ here AND in NOTES.md (sessão principal, após o merge) — the Stop hook then forces
  the final NOTES.md continuity pass and suggests /compact.

## Design System (DS) — `docs/specs/design-system.md`

Implementação tecnologicamente neutra (ADR-0003): tokens + CSS `lx-*` + Lab estático + docs.
Todas as ondas são **sequenciais**: compartilham `tokens.json` e `styles/index.css`.
Commit Conventional por onda, push em `claude/busy-edison-h75ufo`.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| DS-0 | Spec + ADR-0003 + wave plan + NOTES sync | — | — | ✅ |
| DS-1 | Foundations: tokens, fontes OFL, base, scripts de teste | DS-0 | — | ✅ |
| DS-2 | Layout e narrativa: Container, Grid, Scene, Marker, Frame, Sequence, Evidence | DS-1 | — | ✅ |
| DS-3 | Interação e formulário: Button, Link, Field, Choice Group, Message, States | DS-2 | — | ✅ |
| DS-4 | Navegação, Coleção e marca: Header, Mobile Nav, Footer, Collection Card, Credit, Logo slot | DS-3 | — | ✅ |
| DS-5 | Design System Lab + três composições R1 | DS-4 | — | ✅ |
| DS-6 | Documentação normativa + contexto para IAs | DS-5 | — | ✅ |
| DS-7 | QA visual, acessibilidade, `/verify` | DS-6 | — | ✅ |

### DS-0 — Governança e spec

- **Goal**: contrato antes do código.
- **Scope (files)**: `docs/specs/design-system.md`, `docs/adr/0003-design-system-camada-compartilhada.md`, este
  arquivo, `docs/adr/README.md`, `docs/specs/README.md`, `NOTES.md` (local).
- **Acceptance criteria**: spec segue `docs/specs/_template.md`; o Anexo A é idêntico ao plano anterior.
- **Goal command**: `/goal docs/specs/design-system.md and ADR-0003 exist and the Anexo A section of docs/plan/implementation-waves.md is byte-identical to the previous plan, stop after 2 tries`

### DS-1 — Foundations

- **Goal**: tokens, fontes e base prontos e verificados por teste.
- **Scope (files)**: `src/design-system/{tokens,fonts,styles/base.css,styles/fonts.css,styles/index.css,scripts}`.
- **Acceptance criteria**: `node --test src/design-system/scripts/*.test.mjs` verde; paleta imutável exata; contraste por
  fundo e scrim aprovado; zero literais proibidos; fontes ≤ 220KB total e ≤ 100KB com preload; `OFL.txt` presentes.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0, stop after 4 tries`

### DS-2 — Layout e narrativa

- **Goal**: a gramática LUXURY + STORY (Scene, Marker, Frame, Sequence, Evidence) disponível como classes `lx-*`.
- **Scope (files)**: `src/design-system/styles/layout.css`, `styles/components/{typography,marker,frame,scene,sequence,evidence,motion}.css`.
- **Acceptance criteria**: testes verdes; Frames com proporção declarada; drift ≤ 4.8s e 1×; reduced motion
  sem transform.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-2 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-3 — Interação e formulário

- **Goal**: controles acessíveis para o formulário de interesse.
- **Scope (files)**: `styles/components/{button,link,field,choice,message,states}.css`, `src/design-system/icons/`.
- **Acceptance criteria**: testes verdes; controles ≥ 48px; erro com ícone + texto; foco visível por fundo.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-3 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-4 — Navegação, Coleção e marca

- **Goal**: estrutura de navegação e vitrine de Concepts.
- **Scope (files)**: `styles/components/{header,mobile-nav,footer,collection,credit,logo}.css`, `src/design-system/brand/logo/README.md`.
- **Acceptance criteria**: testes verdes; nenhum logo provisório versionado; card sem caixa nem sombra.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and every DS-4 component class listed in the spec exists in styles/, stop after 3 tries`

### DS-5 — Design System Lab

- **Goal**: página de referência visual e de regressão.
- **Scope (files)**: `src/design-system/lab/{index.html,lab.css,lab.js}`.
- **Acceptance criteria**: todas as seções da spec §6 presentes; três composições R1; `check-hardcodes` cobre o Lab.
- **Goal command**: `/goal node --test src/design-system/scripts/*.test.mjs exits 0 and lab/index.html contains the three R1 compositions, stop after 3 tries`

### DS-6 — Documentação e contexto para IAs

- **Goal**: qualquer IA ou dev encontra e segue o sistema.
- **Scope (files)**: `docs/reference/design-system.md`, `.claude/skills/frontend-design/SKILL.md` (seção
  `[CUSTOMIZE]`), `CLAUDE.md`, `AGENTS.md`, `docs/reference/README.md`, `docs/README.md`, `CHANGELOG.md`.
- **Acceptance criteria**: links internos resolvem; somente adições em `CLAUDE.md` e `AGENTS.md`; canônicos intactos.
- **Goal command**: `/goal every relative link in docs/reference/design-system.md resolves and git diff --stat docs/specs/canonical is empty, stop after 2 tries`

### DS-7 — QA visual, acessibilidade e `/verify`

- **Goal**: evidência de qualidade antes do GO/NO-GO.
- **Scope (files)**: correções pontuais apontadas pelo QA.
- **Acceptance criteria**: axe sem violações; sem overflow horizontal em 320–1920px; teclado completo; reduced
  motion; `/verify` executado.
- **Goal command**: `/goal axe reports 0 violations on the Lab at 390 and 1440px and no viewport from 320 to 1920 has horizontal overflow, stop after 4 tries`

### Execution notes

- O W0 (scaffold Next.js, CI, `## Commands`) é pré-requisito dos wrappers React do DS, não destas ondas.
- Pendência externa: kit oficial de logos (commit aditivo em `src/design-system/brand/logo/`).

## Core Design System Luxtory — CP1…CP5 (2026-10-06)

> Fonte: [`docs/specs/design-system.md` §13](../specs/design-system.md) (plano FINAL aprovado pelo fundador em
> 2026-10-06). Missão: entregar corretamente a **W4 — Discovery público** (= CP2) sobre um único Core Design System;
> Auth e Admin vêm depois e não bloqueiam a W4. Base: `main@10a3a2b`.

| Checkpoint | Deliverable | Depends on | Parallel with | Status |
|------------|-------------|------------|---------------|--------|
| CP1 | Core DS + Lab: foundations, primitives, estados, patterns oficiais, diagramas, contratos; nenhuma página migrada | — | — | ✅ (#30, `d04e8ef`) |
| GATE-COPY-W4 | Fonte autorizada da copy da W4 (Framework → `b2c.md`/registro → fundador) | CP1 | — | ✅ (`D-B2C-19`) |
| CP2 = W4 | Core aplicado às superfícies da W4 (`/`, `/como-funciona`, `/colecao`, `/colecao/[conceptId]`, shell, 404) | CP1, GATE-COPY-W4 | — | ✅ (#32, `ba1dc8d`) |
| CP3 | Auth no Core (`/entrar`, `/entrar/mfa`, estados focados) | CP2 | — | ⬜ |
| CP4 | Admin no Core ("folha de papel inteligente", 16 rotas) | CP3 | — | ⬜ |
| CP5 | Consolidação: Core default, legado sem consumidores, docs sincronizados | CP4 | — | ⬜ |

Todos sequenciais: compartilham `tokens.json`, `styles/index.css` e a spec do DS. Cada checkpoint = branch/worktree e PR
próprios, nascidos da `main` com o anterior mergeado (nunca CP1 + CP2 numa branch longa).

### CP1 — Core Design System + Lab

- **Goal**: construir o sistema-mãe que sustenta a W4 e a expansão futura, sem migrar páginas do produto.
- **Scope**: `src/design-system/` (tokens, `styles/core/`, scripts de teste, Lab `core*.html`), `public/diagrams/core/`,
  `tests/e2e/lab-core.spec.ts`, docs (spec do DS §13, reference, `catalog.md` §13.9, este plano, CHANGELOG).
- **Depends on / parallel with**: `main@10a3a2b`; sequencial.
- **Acceptance criteria**: `npm run test:ds` verde (paleta de 5 valores, 3 famílias, matriz papel × superfície, hardcodes,
  contexto sem foundations, regras do Core só sob o flag, nenhum shell do produto com o flag, assinatura dos diagramas);
  `npx playwright test tests/e2e/lab-core.spec.ts` verde (axe 0 a 390/1440, overflow 0 de 320 a 1920, teclado, dialog,
  carrossel pausável, reduced motion, alvos ≥ 44 px, contraste do hero nos pixels); superfícies da W4 idênticas ao
  baseline; lint, typecheck e build verdes; Preview privado → STOP → aprovação → PR/CI → merge.
- **Goal command**: `/goal npm run test:ds && npm run lint && npm run typecheck && npx playwright test tests/e2e/lab-core.spec.ts --no-deps exit 0, stop after 4 tries`

### GATE-COPY-W4

- **Goal**: definir a fonte autorizada da copy da W4 antes do CP2; o CP1 não depende desta decisão.
- **Acceptance criteria**: todo delta candidato (inclusive de branches antigas, que não são fonte canônica) confrontado
  com `framework-b2c.md` → `b2c.md`/registro de decisões → instruções explícitas do fundador; sem cherry-pick automático
  de i18n; versões materiais concorrentes apresentadas em diff ao fundador → decisão registrada.
- **Goal command**: `/goal o registro de b2c.md contém a decisão do fundador sobre a copy da W4, stop after 1 try`

### CP2 — Wave 4 · Discovery público

- **Goal**: aplicar o Core aprovado às superfícies existentes da W4 e encerrar a W4.
- **Scope**: `catalog/presentation` (discovery), shell público, receitas de `catalog.md` §13.9. Domínio, queries, RLS,
  publicação, disponibilidade, Coleção, SSR, CSP, `PUBLIC_SITE`, nomenclatura, copy autorizada e regras de CTA intactos.
  Critério de aceite da W4 falhando é corrigido minimamente conforme canônicos/specs/decisões; decisão nova → STOP.
- **Sequência**: `main` com CP1 → GATE-COPY-W4 → implementação local → **CP2-A Checkpoint Visual sem push** (Home, Como
  funciona, Coleção, Concept com e sem Edition, menu do celular aberto, Admin com "Público no site", a 390 e 1440 px) →
  aprovação → **CP2-B** DS gates, unitários, E2E da W4, axe, overflow, `npm run verify && npm run test:e2e && npm run
  trace -- --expect REQ-100,REQ-101`, WebKit smoke (`PLAYWRIGHT_WEBKIT=1`, aceite da §13.6) → PR draft + CI verde → STOP →
  autorização → merge → gates pós-merge verdes → NOTES/roadmap → W4 concluída.
- **Acceptance criteria**: todos os critérios de `catalog.md` §13.6 e do roadmap da W4. Falha herdada é provada
  preexistente e reportada à parte; se for exigida pelo gate de fechamento (ex.: formato do hook até o merge do #29),
  é resolvida separadamente antes de declarar a W4 concluída.
- **Goal command**: `/goal npm run verify && npm run test:e2e && npm run trace -- --expect REQ-100,REQ-101 exit 0, stop after 4 tries`

### CP3 — Auth

- **Goal**: Auth no mesmo Core (canvas `blue`, painel `deep`), sem novo DS. Baseline de Auth imediatamente antes.
- **Acceptance criteria**: login + MFA a 390 px com toque; E2E `auth`/`admin-access`; axe e overflow por rota; WebKit smoke.
- **Goal command**: `/goal npx playwright test tests/e2e/admin-access.spec.ts tests/e2e/app-shell.spec.ts exit 0, stop after 3 tries`

### CP4 — Admin

- **Goal**: Admin no Core como "folha de papel inteligente", preservando toda a funcionalidade. Baseline das 16 rotas
  imediatamente antes.
- **Acceptance criteria**: smoke visual das 16 rotas; responsivo; axe; estados principais (vazio, aviso, sucesso, erro,
  destrutivo); fluxos críticos por módulo (Brand Partner: criar, exposição, encerramento; Concept: versão, aprovação,
  autorização e revogação de investor; Edition e Residence: criar e detalhar); zero mudança de domínio ou dados.
- **Goal command**: `/goal npx playwright test tests/e2e/catalog-admin.spec.ts tests/e2e/admin-access.spec.ts tests/e2e/app-shell.spec.ts exit 0, stop after 3 tries`

### CP5 — Consolidação global

- **Goal**: Core default; zero consumidores do DS superseded (`design-system.md` §13.9); flag e aliases temporários
  removidos quando permitido; imports antigos eliminados; docs sincronizados.
- **Acceptance criteria**: gate integral + regressão integral.
- **Goal command**: `/goal npm run verify && npm run test:e2e exit 0, stop after 3 tries`

---

## Anexo A — plano do template (concluído)

# Implementation waves — Loop engineering primitives

> Source spec: `docs/specs/loop-engineering.md`. This file is the source of
> truth for the wave roadmap; the NOTES.md table mirrors the Status column.
>
> Worked example: this plan was derived with `/waves` and executed wave by wave
> on the template itself.

| Wave | Deliverable | Depends on | Parallel with | Status |
|------|-------------|------------|---------------|--------|
| 0 | Spec + wave plan + NOTES sync | — | — | ✅ |
| 1 | `/verify` skill | 0 | 2, 3 | ✅ |
| 2 | `/waves` emits per-wave `Goal command` | 0 | 1, 3 | ✅ |
| 3 | `/babysit-pr` skill | 0 | 1, 2 | ✅ |
| 4 | `docs/how-to/loops.md` + generic task-completed gate | 1, 2, 3 | — | ✅ |
| 5 | Sync README + CLAUDE.md + final pass | 1–4 | — | ✅ |

## Wave 0 — Spec + wave plan

- **Goal**: the spec and this plan exist and the NOTES.md roadmap mirrors it.
- **Scope (files)**: `docs/specs/loop-engineering.md`, `docs/plan/implementation-waves.md`, `NOTES.md` (local).
- **Depends on / parallel with**: — (foundation, always sequential).
- **Acceptance criteria**: spec follows `docs/specs/_template.md` sections; this
  plan follows the `/waves` output format; NOTES.md table matches this table.
- **Goal command**: `/goal docs/specs/loop-engineering.md and docs/plan/implementation-waves.md exist and the NOTES.md roadmap table matches the plan table, stop after 2 tries`

## Wave 1 — `/verify` skill (turn-based lever)

- **Goal**: Claude can verify its own change end-to-end instead of the user
  reviewing by eye.
- **Scope (files)**: `.claude/skills/verify/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 2 and 3 (disjoint
  files, no shared interface).
- **Acceptance criteria**: skill has valid frontmatter (`name`, `description`,
  `allowed-tools`); body covers scope → static gates from `CLAUDE.md → ## Commands`
  → behavioral check per project type (`[CUSTOMIZE]`) → evidence rule →
  restart-from-step-1 failure rule; degrades with an explicit warning when
  `## Commands` still has placeholders.
- **Goal command**: `/goal .claude/skills/verify/SKILL.md exists with valid frontmatter and covers all five steps listed in the spec's file contract, stop after 3 tries`

## Wave 2 — `/waves` emits per-wave `Goal command` (goal-based lever)

- **Goal**: every generated wave plan ships a ready-made `/goal` invocation
  derived from that wave's acceptance criteria, cap included.
- **Scope (files)**: `.claude/skills/waves/SKILL.md` (edit).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 3.
- **Acceptance criteria**: Process derives the command from acceptance criteria
  and requires verifiable conditions (command exits green / score / count) plus
  an explicit cap; Output format shows the `**Goal command**` line; Execution
  notes explain running a sequential wave as a goal loop and closing it with
  `/verify`.
- **Goal command**: `/goal .claude/skills/waves/SKILL.md output format includes a Goal command line and the process section requires a verifiable condition with an explicit cap, stop after 3 tries`

## Wave 3 — `/babysit-pr` skill (time-based lever)

- **Goal**: a skill designed for `/loop 5m /babysit-pr <n>` that addresses
  review comments and fixes failing CI, acting only when something changed.
- **Scope (files)**: `.claude/skills/babysit-pr/SKILL.md` (new).
- **Depends on / parallel with**: depends on 0; parallel with 1 and 2.
- **Acceptance criteria**: frontmatter has `argument-hint` and
  `disable-model-invocation: true`; body covers PR resolution (argument or
  current branch), state gathering via `gh`, cheap no-change turns, acting on
  review comments and failing CI, merged/closed stop condition, and an explicit
  never-force-push rule; local gates referenced via `## Commands` with
  `[CUSTOMIZE]`.
- **Goal command**: `/goal .claude/skills/babysit-pr/SKILL.md exists and covers resolve/gather/idle/act/stop plus the never-force-push rule, stop after 3 tries`

## Wave 4 — Loops how-to guide + generic quality gate (proactive, doc-only)

- **Goal**: a how-to that maps the four loop types to the template's assets,
  with recipes and cost rules; `task-completed.sh` presented as the
  deterministic stop-condition reference.
- **Scope (files)**: `docs/how-to/loops.md` (new), `.claude/hooks/task-completed.sh`
  (header comment edit), `docs/how-to/README.md` (index, if it lists content).
- **Depends on / parallel with**: depends on 1, 2, 3 (references their names);
  sequential.
- **Acceptance criteria**: guide contains the four-type table with a template
  asset per row, at least three recipes with explicit stop conditions/caps, the
  cost rules, and the composition example; every referenced file exists;
  `task-completed.sh` stays unwired by default.
- **Goal command**: `/goal docs/how-to/loops.md exists, every file it references exists in the repo, and every example carries a stop condition, stop after 3 tries`

## Wave 5 — Sync pass (README, CLAUDE.md, NOTES)

- **Goal**: no divergence between shipped reality and the documents that
  describe it.
- **Scope (files)**: `README.md`, `CLAUDE.md`, this file (statuses → ✅),
  `NOTES.md` (final continuity pass, local).
- **Depends on / parallel with**: depends on 1–4; sequential (touches the files
  the parallel waves deliberately avoided).
- **Acceptance criteria**: README skills tree lists `verify/` and `babysit-pr/`
  and the hooks list reflects the task-completed reframing; CLAUDE.md
  Definition of Done includes end-to-end verification via `/verify`; wave table
  here and in NOTES.md all ✅ and identical.
- **Goal command**: `/goal README tree matches the actual .claude/skills contents and CLAUDE.md Definition of Done mentions /verify, stop after 2 tries`

## Execution notes

- Sequential waves run in the main session, one atomic Conventional Commit per
  wave (this repo is trunk-based on `main`; push only on request).
- Waves 1–3 are parallelizable (disjoint files, no shared public interface) —
  they may run as subagents in isolated worktrees; all README/CLAUDE.md
  touchpoints are deferred to wave 5 precisely to keep 1–3 conflict-free.
- When a wave completes, mark it ✅ here AND in NOTES.md — the Stop hook then
  forces the final NOTES.md continuity pass and suggests /compact.
