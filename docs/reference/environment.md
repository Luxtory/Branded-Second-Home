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
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel — **só Production** enquanto a D3 estiver adiada ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md), [ADR-0008](../adr/0008-autenticacao-e-autorizacao-administrativa.md)) | Supabase Auth, só no servidor (`identity`): URL `https://` do projeto; ausente → telas e API de Auth indisponíveis (o build não depende dela) | W2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel — **só Production** (idem) | Supabase Auth (chave pública), só no servidor; precisa ter o formato `sb_publishable_…` — a `anon` legada e chaves secretas são recusadas | W2 |
| `AUTH_MODE` | local e CI | `supabase` ou `test`; `test` é recusado quando `VERCEL_ENV` existe (ADR-0005). Ausente = `supabase`; nunca configurar na Vercel | W2 |
| `MEDIA_STORAGE` | local e CI | `supabase` ou `local`; `local` (diretório) é recusado quando `VERCEL_ENV` existe ([ADR-0015](../adr/0015-midia-do-catalogo-metadados-e-storage.md)). Ausente = Supabase Storage; nunca configurar na Vercel | 4.1 |
| `MEDIA_LOCAL_DIR` | local e CI | diretório absoluto dos objetos de mídia com `MEDIA_STORAGE=local` (o servidor do E2E usa um diretório temporário) | 4.1 |
| `MEDIA_BUCKET` | Vercel — **só Production** | nome do bucket **privado** do Supabase Storage com os binários da mídia do catálogo (master sanitizado e larguras de exibição; ADR-0015); ausente → envio e entrega de capa indisponíveis (503) | 4.1 |
| `UPSTASH_REDIS_REST_URL` | Vercel (Sensitive) — Production e Preview com bancos Upstash **distintos** | rate limit (`platform`); desde a BP1, o limitador do contato Brand Partners (`https://`); desde a W5, também o do interesse, com namespace próprio `luxtory:interest:<ambiente>` | W5 (antecipada na BP1) |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel (Sensitive) — Production e Preview, cada um com o token do próprio banco | rate limit | W5 (antecipada na BP1) |
| `BRAND_PARTNERS_SITE` | Vercel — Production (Preview só se for preciso fechar) | portão da jornada Brand Partners, independente de `PUBLIC_SITE`: `open` ou `closed`; ausente = fechada em Production e aberta fora dela; fechada → páginas e endpoint 404 (spec `catalog` §14.1) | BP1 |
| `BRAND_PARTNERS_CONTACT_MODE` | local e CI | `fake` = envio e limitador determinísticos em memória (nenhum e-mail real, nenhum Upstash); recusado quando `VERCEL_ENV` existe, inclusive em Preview. Ausente = Resend + Upstash reais; nunca configurar na Vercel | BP1 |
| `RESEND_API_KEY` | Vercel (Sensitive, só servidor) — Production e Preview com chaves distintas | envio do contato Brand Partners pela API HTTP do Resend; formato `re_…` (TECH-057) | BP1 |
| `BRAND_PARTNERS_CONTACT_FROM` | Vercel — Production e Preview | remetente verificado no Resend (`email@dominio` ou `Nome <email@dominio>`) | BP1 |
| `BRAND_PARTNERS_CONTACT_TO` | Vercel — Production (caixa corporativa) e Preview (caixa **de teste**) | destinatário do contato; nunca vem do client | BP1 |
| `BRAND_PARTNERS_CONTACT_HMAC_SECRET` | Vercel (Sensitive, só servidor) — Production e Preview com valores distintos | segredo próprio (≥ 32 caracteres) do HMAC que pseudonimiza a origem de rede nas chaves do limitador; desde a W5, também o do interesse, com separação de domínio pela superfície (sem segredo novo — STRIDE `ownership` T-407) | BP1 |
| `BRAND_PARTNERS_ALLOWED_ORIGINS` | Vercel — Production e Preview (e o servidor do E2E) | origens exatas aceitas no `Origin` do contato, separadas por vírgula, na forma canônica (`https://host`, sem barra final) | BP1 |
| `BRAND_PARTNERS_CONTACT_NETWORK_LIMIT` · `BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS` | Vercel — Production e Preview | tentativas por origem de rede por janela (inteiros positivos; valores no runbook, TECH-001) | BP1 |
| `BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT` · `BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS` | Vercel — Production e Preview | tentativas totais da superfície por janela (idem) | BP1 |
| `BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS` · `BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS` | Vercel — Production e Preview | prazo do envio ao Resend e do limitador; sem resposta no prazo → 503 (idem) | BP1 |
| `INTEREST_WRITES` | Vercel — Production (ativação) | portão da escrita pública de interesse (`POST /v1/interests`, spec ownership §5): `open` ou `closed`; ausente = fechada em Production e aberta fora dela; exige também o site público aberto (`PUBLIC_SITE`). Fechada → 404. Só abrir depois dos pré-requisitos operacionais (D2, chaves abaixo) e da decisão do fundador | W5 |
| `INTEREST_LIMITER_MODE` | local e CI | `fake` = limitador do interesse determinístico em memória (nenhum Upstash); recusado quando `VERCEL_ENV` existe, inclusive em Preview. Ausente = Upstash real; nunca configurar na Vercel | W5 |
| `INTEREST_NETWORK_LIMIT` · `INTEREST_NETWORK_WINDOW_SECONDS` | Vercel — Production (e Preview, se preciso) | tentativas de registro de interesse por origem de rede por janela (inteiros positivos; valores no runbook, TECH-001) | W5 |
| `INTEREST_GLOBAL_LIMIT` · `INTEREST_GLOBAL_WINDOW_SECONDS` | Vercel — Production (e Preview, se preciso) | tentativas totais da superfície por janela (idem) | W5 |
| `INTEREST_LIMITER_TIMEOUT_MS` | Vercel — Production (e Preview, se preciso) | prazo do limitador do interesse; sem resposta no prazo → 503 (idem) | W5 |
| `SUPABASE_SECRET_KEY` | Vercel (Sensitive, só servidor) | Admin API do Supabase Auth (convites, W7) e, desde a Wave 4.1, o Supabase Storage privado da mídia do catálogo (cabeçalho `apikey`, ADR-0015); só no formato `sb_secret_…` — a `service_role` legada é recusada; **só Production** | W7 (antecipada na 4.1) |
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
