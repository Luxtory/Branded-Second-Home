# 0004. Toolchain, bibliotecas e pipeline

- **Date**: 2026-09-25
- **Status**: Accepted
- **Deciders**: Luxtory (responsável pelo produto); Engenharia
- **Tags**: architecture, tooling, ci, security
- **Amends**: [ADR-0003](0003-design-system-camada-compartilhada.md) — decisão 4, carregamento de fontes

## Context

O [ADR-0002](0002-plataforma-e-adaptacoes-economicas.md) fixou a plataforma (Vercel + Supabase + Upstash) e deixou
para a W0 as escolhas de biblioteca, testes, observabilidade e pipeline. Limites que moldam a escolha:

- TECH-010: TypeScript `strict`, Next.js, migrations SQL versionadas, adaptadores substituíveis; query builder só sem
  geração de schema. TECH-100: SAST e scanning de dependências e segredos. TECH-110: camadas de teste.
- Planos gratuitos: Vercel Hobby (cron 1×/dia, só `GET`), GitHub privado Free (sem branch protection, sem CodeQL),
  Supabase Free.
- Máquina de desenvolvimento: WSL sem Docker; npm 9 local, npm 10 na CI e na Vercel.
- `CLAUDE.md`: conteúdo existente só é estendido; o arquivo `activate-ultronpx.mjs` fica fora de toda ferramenta.

Regra geral: a opção mais simples compatível com o `03` e o ADR-0002. Versões **exatas** (`.npmrc` `save-exact`,
lockfile commitado), atualizadas pelo Dependabot.

## Decision

### Base do app

| Tema | Decisão | Versão | Justificativa |
|---|---|---|---|
| Runtime | Node.js 22 (`engines: 22.x`) | 22.x | LTS suportada pela Vercel e pela CI |
| Framework | Next.js App Router, app único | 16.3.6 | TECH-010, ADR-0002 |
| UI | React; classes `lx-*` do Design System + componentes React finos; sem biblioteca de componentes | 19.3.0 | ADR-0003: estilos não são reescritos |
| Linguagem | TypeScript `strict` + `noUncheckedIndexedAccess` | 6.0.3 | o 7.x não é aceito pelo `typescript-eslint` (`<6.1`) |
| Lint e formato | ESLint + `eslint-config-next`; Prettier | 9.39.5 / 16.3.6; 3.9.9 | ver "ESLint 9" abaixo |
| Validação | Zod em toda fronteira (env, input HTTP) | 4.6.5 | um validador para servidor e tipos |
| i18n | dicionário tipado por slice em `presentation/i18n/pt-br.ts`; pt-BR é o único locale | — | um locale não justifica biblioteca |
| Fontes | `styles/fonts.css` do Design System, empacotado pelo Next.js a partir de `styles/index.css` | — | ver "Fontes" abaixo |

**ESLint 9, não 10.** Os plugins que o `eslint-config-next` 16.3.6 traz (`eslint-plugin-import` 2.32,
`eslint-plugin-jsx-a11y` 6.10, `eslint-plugin-react` 7.37) só aceitam ESLint até a 9, e o `create-next-app` 16.3.6
instala `eslint: ^9`. O npm marca a 9.x como fora de suporte: a troca para a 10 acompanha o `eslint-config-next`
(Dependabot).

**Fontes (altera o ADR-0003, decisão 4).** O `next/font/local` gera uma família com nome próprio (hash) e uma cópia
própria do arquivo. Usá-lo junto do `fonts.css` duplicaria downloads; usá-lo no lugar exigiria redefinir fora do
`tokens.json` as famílias e os fallbacks medidos do Design System. Na W0 as fontes carregam só pelo `fonts.css`
(mesmos woff2, `font-display: swap`, fallback com `size-adjust`). O preload dos 2 arquivos críticos
(`fonts/manifest.json`) é decidido na W4, junto com a primeira página pública e a medição de Core Web Vitals.

### Operação

| Tema | Decisão | Justificativa |
|---|---|---|
| Observabilidade | Logger JSON do módulo `platform` (uma linha por evento, `correlation_id` do header `x-correlation-id` ou UUID); `withRoute` nos route handlers; `onRequestError` em `src/instrumentation.ts` para o resto; métricas e erros não tratados pela Observability nativa da Vercel | sem fornecedor extra (ADR-0002); PII fora de logs (TECH-100) |
| E-mail | Só o do Supabase Auth (login por código). E-mail transacional aguarda a decisão D4; notificações ficam dentro do app | REQ-097 não exige canal de e-mail |
| Storage | Não usado enquanto nenhum requisito armazenar arquivo; quando usado, bucket privado | TECH-100 |
| Contratos | Um `docs/api/openapi.yaml` e um `docs/api/asyncapi.yaml`; teste de contrato com Ajv | API-First, sem divisão por recurso |
| Outbox | Disparo após o commit com `after()` (`@vercel/functions`) + varredura por cron (W1) | TECH-091 sem worker dedicado |
| Jobs | Endpoints em `/api/jobs/*`, fora de `/v1`, protegidos por `CRON_SECRET` | o Vercel Cron só faz `GET`; TECH-056 reserva `POST` para mutations em `/v1` |
| Rastreabilidade | `scripts/trace.mjs`: tags `[REQ-…]`, `[EC-n]`, `[CONC-n]` nos títulos de testes aprovados; `--expect` por wave e `--gate` no fim | gate do `03` §12 verificável |

### Testes e segurança

| Tema | Decisão | Versão |
|---|---|---|
| Unit, contratos e PostgreSQL real | Vitest (projetos `unit` e `db`) + cobertura v8 com mínimo de 80% em `domain/` e `application/` | 5.0.2 |
| PostgreSQL de teste | `embedded-postgres` (PostgreSQL 17) — [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md) | 17.10.0-beta.17 |
| Contratos | Ajv (JSON Schema 2020-12) + ajv-formats + yaml | 8.20.0 / 3.0.1 / 2.9.1 |
| E2E e acessibilidade | Playwright com o Chrome do sistema (`channel: 'chrome'`) + axe | 1.63.0 / 4.13.0 |
| Migrations | dbmate — [ADR-0006](0006-acesso-a-dados.md) | 2.36.0 |
| Segredos | gitleaks (regras padrão + exceção do arquivo ultron) | action v2.3.9 |
| Dependências | `npm audit --omit=dev --audit-level=high` + Dependabot com `cooldown` de 7 dias; `.npmrc` `min-release-age=7` (efetivo a partir do npm 11.10) | — |
| SAST | Semgrep CE, regras `p/default`, falha com achado | 1.178.0 |

### CI/CD (`.github/workflows/ci.yml`)

- PR e push em `main`: `lint`, `typecheck`, `test` (Vitest com cobertura, testes do Design System, `db:check`),
  `e2e` (`next build` + Playwright) e `security`. Os jobs do esqueleto do template foram preenchidos, não trocados
  (`CLAUDE.md`: conteúdo existente só é estendido).
- Push em `main`, depois de todos verdes: `migrate` (`npm run db:migrate` com o secret `DATABASE_URL_MIGRATIONS`) →
  `deploy` (Vercel CLI 60.0.1: `pull` → `build --prod` → `deploy --prebuilt --prod` com o secret `VERCEL_TOKEN`).
  Secret ausente → falha explícita. Os dois jobs não se cancelam (`concurrency: production`).
- `vercel.json`: `git.deploymentEnabled.main = false` (produção só sai pela CI, depois dos gates e da migração),
  `regions: ["gru1"]`, `framework: "nextjs"`, `installCommand: "npm ci"`. Branches seguem com Preview (staging).

### Bibliotecas das waves seguintes (instaladas só na wave que as usa)

| Wave | Pacote | Versão | Uso |
|---|---|---|---|
| W1 | `kysely`, `kysely-codegen` | 0.29.6, 0.20.0 | query builder; tipos gerados do banco migrado, nunca o contrário (TECH-010) |
| W1 | `@vercel/functions` | 3.9.9 | `after()` para o outbox |
| W2 | `@supabase/ssr`, `@supabase/supabase-js` | 0.12.7, 2.117.2 | só Auth (ADR-002 do `03`) |
| W5 | `@upstash/ratelimit`, `@upstash/redis` | 2.2.0, 1.39.0 | rate limit (ADR-0002) |
| W8 | `temporal-polyfill` | 1.0.5 | datas civis e fusos IANA (TECH-040) |
| W9 | `drand-client` | 1.4.2 | beacon do sorteio (TECH-093) |
| W16 | `decimal.js` | 10.6.0 | aritmética exata de Créditos (TECH-033) |
| W30 | `canonicalize` | 5.1.0 | JCS RFC 8785 do selo (TECH-092) |
| W30 | OpenTimestamps por HTTP direto | — | o pacote npm está sem manutenção desde 2022 (ADR-0002) |

### Arquivo `activate-ultronpx.mjs`

Fica fora de Prettier, ESLint, TypeScript, Vitest (testes e cobertura), Playwright, Semgrep, gitleaks, `.vercelignore`
e da varredura de terminologia. A validação de ambiente lê só as chaves do catálogo: não exige nem remove
`ULTRONPX_PURCHASE_EMAIL`.

## Consequences

### Positive

- Um conjunto pequeno e fixado de ferramentas, com o mesmo resultado local e na CI.
- Produção só recebe código que passou por todos os gates e cuja migração já foi aplicada.
- Rastreabilidade do gate do `03` §12 é um comando, não uma planilha.

### Negative

- Cinco jobs por push consomem minutos do plano gratuito do GitHub; mitigado com cache do npm e cancelamento de
  execuções antigas de PR.
- Sem `next/font/local` na W0, as fontes ainda não têm preload (resolvido na W4).
- Logger próprio exige disciplina de uso (`withRoute`, `rootLogger`) em vez de instrumentação automática.

### Neutral / follow-ups

- Actions fixadas por SHA completo, com a versão em comentário (achado do Semgrep na W0); o Dependabot atualiza SHA e
  comentário.
- CSP entra com a primeira página pública (W4); a W0 aplica só cabeçalhos sem risco de quebra.

## Alternatives considered

**Tailwind ou biblioteca de componentes.** Redefiniria estilos que o Design System já entrega em CSS com tokens e
testes (ADR-0003). Rejeitada.

**Biblioteca de i18n (next-intl, i18next).** Resolve pluralização e múltiplos locales; o `02` define só pt-BR.
Um dicionário tipado cumpre a regra "nenhuma string hardcoded" sem dependência.

**Fornecedor de observabilidade (Sentry, Datadog).** Custo e mais um processador de dados; a Vercel já coleta logs e
erros. Reavaliar no go-live econômico.

**CodeQL.** Exige GitHub Advanced Security em repositório privado. Semgrep CE é gratuito e roda na CI.

**Deploy de produção pela integração Git da Vercel.** Publicaria `main` sem esperar os gates nem a migração, e o
GitHub Free não protege `main`. Rejeitada.

## References

- Related ADRs: [ADR-0002](0002-plataforma-e-adaptacoes-economicas.md),
  [ADR-0003](0003-design-system-camada-compartilhada.md), [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md),
  [ADR-0006](0006-acesso-a-dados.md)
- `docs/specs/canonical/03-technical-spec.md`: ADR-001, ADR-002, TECH-010, TECH-011, TECH-056, TECH-090, TECH-091,
  TECH-100, TECH-110
- `docs/plan/implementation-waves.md` → Wave 0
