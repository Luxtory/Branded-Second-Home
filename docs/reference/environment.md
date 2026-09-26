# Variáveis de ambiente

Catálogo versionado de **nomes** (nunca valores) das variáveis que a plataforma lê, e de onde vêm.
O `.env.example` do template está ignorado pelo `.gitignore` (regra `.env*`), por isso o catálogo vive aqui.

Regras:

- A aplicação lê só as chaves declaradas em `src/features/platform/infrastructure/env.ts` (validação com Zod). Nenhuma
  outra é exigida, removida ou alterada.
- Segredos só em GitHub Actions secrets ou em variáveis **Sensitive** da Vercel. Nunca no código, no banco, em logs
  ou em mensagens de erro (TECH-100).
- Variável ausente de que uma função dependa → erro explícito, nunca valor padrão (TECH-001).
- Não rodar `vercel env pull` sobre `.env.local`: ele sobrescreve o arquivo inteiro.

## Catálogo

| Nome | Onde | Lida por | Desde |
|---|---|---|---|
| `DATABASE_URL_MIGRATIONS` | secret do GitHub Actions | `npm run db:migrate` (job `migrate`): pooler em modo sessão, papel dono do schema; validada por preflight de conexão (`dbmate status`, só leitura) antes de aplicar | W0 |
| `VERCEL_TOKEN` | secret do GitHub Actions | job `deploy` (Vercel CLI) | W0 |
| `VERCEL_ENV` | Vercel (sistema, só leitura) | `platform`: `/lab` responde 404 com `production` | W0 |
| `VERCEL_GIT_COMMIT_SHA` | Vercel (sistema, só leitura) | `platform`: `GET /v1/version` | W0 |
| `DATABASE_URL` | Vercel — **só Production** (Sensitive). Previsto antes também para Preview e Development; a decisão D3 ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)) proíbe credencial do banco canônico fora de Production | papel de aplicação via Supavisor em modo transação (ADR-0006) | W1 |
| `CRON_SECRET` | Vercel — **só Production** (Sensitive; D3, ADR-0007) | autenticação dos endpoints `/api/jobs/*`, comparada em tempo constante; ausente → 503 | W1 |
| `COMMAND_MAX_ATTEMPTS` | Vercel — só Production | tentativas de um command em deadlock/`lock_timeout` (TECH-053); valor no runbook `docs/how-to/operacao.md` (TECH-001) | W1 |
| `COMMAND_LOCK_TIMEOUT_MS` | Vercel — só Production | `lock_timeout` da transação do command; valor no runbook (TECH-001) | W1 |
| `OUTBOX_BATCH_SIZE` | Vercel — só Production | eventos por execução do job `outbox`; valor no runbook (TECH-001) | W1 |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Supabase Auth | W2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | Supabase Auth (chave pública) | W2 |
| `AUTH_MODE` | local e CI | `supabase` ou `test`; `test` é recusado quando `VERCEL_ENV` existe (ADR-0005) | W2 |
| `UPSTASH_REDIS_REST_URL` | Vercel (Sensitive) | rate limit | W5 |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel (Sensitive) | rate limit | W5 |
| `SUPABASE_SECRET_KEY` | Vercel (Sensitive, só servidor) | Admin API do Supabase Auth (convites) | W7 |
| `PII_ENCRYPTION_KEYRING` | Vercel (Sensitive, só servidor) | cifra AES-256-GCM de CPF/CNPJ, com `key_id` (ADR-0002) | W7 |
| `PII_ENCRYPTION_ACTIVE_KEY_ID` | Vercel (Sensitive, só servidor) | chave ativa para novas cifras | W7 |
| `PII_HMAC_KEY` | Vercel (Sensitive, só servidor) | HMAC de busca, segredo separado (TECH-100) | W7 |
| `NEXT_PUBLIC_SITE_URL` | Vercel | links de convite e redirecionamentos de Auth | W7 |
| `PAYMENT_GATEWAY` | Preview, Development e CI | `fake` enquanto o PSP não é contratado; recusado em produção (TECH-081) | W19 |

## Fora do catálogo

- `ULTRONPX_PURCHASE_EMAIL`: pertence a `activate-ultronpx.mjs`, fora de toda ferramenta do projeto. A validação de
  ambiente não a exige nem a remove (`CLAUDE.md` → Files & paths to ignore).
- Variáveis de ferramentas (`CI`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`) seguem a documentação de cada ferramenta.

## Não secretos no repositório

- `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` ficam no próprio `.github/workflows/ci.yml` (identificadores, não segredo).
