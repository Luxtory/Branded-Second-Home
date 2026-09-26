# Como operar a plataforma (runbook)

Runbook do módulo `platform`. O TECH-001 do `03` atribui ao runbook os timeouts, as tentativas e as cadências de
jobs: os valores abaixo são a fonte deles, e o código não tem default para nenhum (ausente → erro explícito com o
nome da chave). Segredos seguem o [ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md): **só no ambiente
Production da Vercel**, nunca em Preview ou Development.

## Valores de operação (TECH-001)

| Chave | Valor | Onde | Efeito |
|---|---|---|---|
| `COMMAND_MAX_ATTEMPTS` | `3` | Vercel, Production | tentativas de um command em deadlock ou `lock_timeout` (TECH-053); esgotadas → `ERR_UNAVAILABLE`, nada gravado |
| `COMMAND_LOCK_TIMEOUT_MS` | `5000` | Vercel, Production | espera máxima por lock dentro da transação do command |
| `OUTBOX_BATCH_SIZE` | `100` | Vercel, Production | eventos por execução do job `outbox` (um por transação) |
| Cadência do job `outbox` | `17 6 * * *` (06:17 UTC, 1×/dia) | `vercel.json` → `crons` | varredura de segurança; o caminho normal é o disparo logo após o commit. O plano Hobby limita o cron a 1×/dia (ADR-0002) |

## Segredos

| Chave | Onde | Como gerar |
|---|---|---|
| `CRON_SECRET` | Vercel, Production, **Sensitive** | ao menos 32 caracteres aleatórios do gerenciador de senhas; a Vercel o envia como `Authorization: Bearer` ao chamar os crons |
| `DATABASE_URL` | Vercel, Production, **Sensitive** | passo 5 abaixo |

## Preparar a W1 em produção

### Antes do merge da W1

1. No Supabase, em **Project Settings → Data API**, desligue a Data API (ADR-0006 §7). Nada na aplicação usa o
   PostgREST.
2. Na Vercel, em **Settings → Environment Variables**, crie `CRON_SECRET` (Sensitive) e os três valores de operação
   da tabela acima. Em cada uma, marque **somente Production** (o formulário vem com os três ambientes marcados).

### Depois do merge (job `migrate` ✅: o papel `luxtory_app` já existe, sem senha)

3. Gere no gerenciador de senhas uma senha de ao menos 32 caracteres, só com ASCII visível (sem espaço). Na raiz do
   repositório, rode `npm run db:password-verifier`, cole a senha (ela não aparece na tela) e copie a linha
   `ALTER ROLE luxtory_app WITH PASSWORD 'SCRAM-SHA-256$…';`. Execute essa linha no **SQL Editor** do Supabase. Só o
   verificador SCRAM chega ao servidor: a senha nunca aparece no editor nem nos logs do Supabase.
4. Confira a CA fixada no código: em **Project Settings → Database → SSL Configuration**, baixe o certificado e
   rode `openssl x509 -noout -fingerprint -sha256 -in <arquivo baixado>`. O resultado precisa ser
   `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. Se for diferente,
   pare e abra um issue: a conexão não vai validar.
5. Na Vercel, crie `DATABASE_URL` (Sensitive, **somente Production**):
   `postgresql://luxtory_app.<project-ref>:<senha codificada para URL>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full`
   (Supavisor em modo transação, ADR-0006 §5). Outro `sslmode` é recusado pelo código.
6. Refaça só o deploy pela CI, para o deployment de produção ler as variáveis novas:
   `gh run view <id do run do merge> --json jobs --jq '.jobs[] | select(.name=="deploy") | .databaseId'` e depois
   `gh run rerun <id do run> --job <id do job deploy>`. Deploy local de produção é proibido.
7. Confira o job sem deixar o segredo no histórico do shell: `read -rs CRON_SECRET` (cole o valor), depois
   `curl -s -H "Authorization: Bearer $CRON_SECRET" https://branded-second-home.vercel.app/api/jobs/outbox`. Esperado:
   `{"job":"outbox","result":{"delivered":0,"failed":0}}`. Um `503` traz nos logs da Vercel a chave ausente
   (`job endpoint unavailable` ou `job unavailable`, campo `keys`).

## Rotacionar segredos

- `CRON_SECRET`: gere outro valor, atualize na Vercel (Production) e refaça o deploy (passo 6).
- Senha do `luxtory_app`: repita os passos 3, 5 e 6. A senha antiga deixa de valer quando o `ALTER ROLE` roda; até o
  novo deploy, o job `outbox` responde erro e os eventos esperam pendentes (nada se perde).

## Quando algo falha

- `migrate` vermelho em `main`: o `deploy` não roda e produção continua na versão anterior. Corrija a causa com uma
  nova migration ou um novo commit; nunca aplique SQL de schema pelo console, MCP ou máquina local (ADR-0006).
- Eventos com `attempts` crescendo em `app.outbox`: um consumidor falha; `last_error` guarda só o nome do erro, e o
  log `outbox delivery failed` identifica evento e consumidor. O domínio não é desfeito (TECH-091).
- `command retries exhausted` nos logs: contenção de locks acima do `COMMAND_LOCK_TIMEOUT_MS` em
  `COMMAND_MAX_ATTEMPTS` tentativas; o cliente pode repetir com a mesma `Idempotency-Key`.
