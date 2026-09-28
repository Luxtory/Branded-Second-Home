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
   `{"job":"outbox","result":{"delivered":0,"failed":0}}`. Um `503` traz nos logs da Vercel a chave ausente ou
   inválida (`job endpoint unavailable` ou `job unavailable`, campo `keys`) — por exemplo, `DATABASE_URL` sem
   `sslmode=verify-full` ou com a senha sem codificação para URL.

## Preparar a W2 em produção (acesso administrativo)

Auth real só em Production enquanto a D3 estiver adiada ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md),
[ADR-0008](../adr/0008-autenticacao-e-autorizacao-administrativa.md)). Nenhuma variável de Auth em Preview ou
Development: lá as telas mostram "indisponível" (o build não depende delas).

### Antes do merge da W2

0. SMTP customizado do Supabase Auth com **Resend** (decisão D4): **feito em 2026-09-27** — remetente
   `acesso@luxtory.club` / "Luxtory", domínio `luxtory.club` com SPF/DKIM válidos no Resend, credencial exclusiva da
   plataforma inserida direto no Supabase. Rotação da credencial: gere outra no Resend e troque só no Supabase.
1. No Supabase, em **Authentication → Sign In / Providers**, desligue o cadastro público de usuários ("Allow new
   users to sign up"). Só entra quem a Luxtory criar; e-mail sem conta recebe a mesma resposta na tela, sem código.
2. Em **Authentication → Multi-Factor**, confira que o **TOTP (App Authenticator)** está habilitado.
3. Em **Authentication → Emails → Templates**, no template de **Magic Link**, mostre o código de uso único com
   `{{ .Token }}` (o login é por código, não por link). Texto sugerido: "Seu código de acesso à Luxtory é
   {{ .Token }}. Ele vale por poucos minutos. Se você não pediu, ignore este e-mail."
   Confira também, em **Sign In / Providers → Email**, que o tamanho do código (**Email OTP Length**) é **6**: a
   tela de login aceita exatamente seis dígitos.
4. Em **Authentication → URL Configuration**, `Site URL` = `https://branded-second-home.vercel.app`.
5. Na Vercel, em **Settings → Environment Variables**, marcando **somente Production** em cada uma:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co` (a variável já existe: tire Preview e
     Development);
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = a chave `sb_publishable_…` de **Project Settings → API Keys**;
   - apague `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave legada; o código só aceita o formato `sb_publishable_…`).
   São chaves públicas (não precisam ser Sensitive), mas ficam fora de Preview (ADR-0007). **Nunca** crie
   `AUTH_MODE` na Vercel: `test` é recusado com `VERCEL_ENV` presente.

### Depois do merge (`migrate` ✅ e `deploy` ✅)

6. Crie o usuário do primeiro Super Admin em **Authentication → Users → Add user → Create new user**, com o e-mail do
   responsável, **Auto Confirm User** marcado e uma senha longa aleatória do gerenciador de senhas (não é usada: o
   login é por código). Os e-mails de login saem pelo SMTP customizado com **Resend** (D4, configurado em
   2026-09-27 no Supabase Auth; a credencial fica só lá, nunca no repositório): qualquer e-mail da equipe recebe o
   código. Copie o **User UID**.
7. No **SQL Editor**, atribua o papel com a base registrada (sem hierarquia: quem também opera como Admin recebe os
   dois papéis, um por chamada):
   `SELECT app.assign_staff_role('<User UID>', 'super_admin', '<base registrada, ex.: Ata da diretoria de AAAA-MM-DD>');`
   A função recusa usuário inexistente e grava `operation` + `audit_log` (REQ-015).
8. Primeiro login em `https://branded-second-home.vercel.app/entrar`: e-mail → código → **Configurar aplicativo
   autenticador** (QR code) → código do aplicativo → `/admin` mostra o papel ativo.
9. Confira (só leitura): uma linha ativa em `app.staff_role`, a `operation` `assign_staff_role` com o `audit_log`; nos
   logs da Vercel, nenhum `auth unavailable` nem erro.

### Revogar papel de staff ou grant

- Papel: `SELECT app.revoke_staff_role('<id em app.staff_role>', '<base registrada>');`
- Grant: `SELECT app.revoke_authorization_grant('<id em app.authorization_grant>', '<base registrada>');`
- Vale no command ou na página seguinte (o guard relê o banco). Cada revogação grava `operation` + `audit_log` com
  antes/depois; nada é apagado.
- Aparelho do segundo fator perdido: remova o fator do usuário em **Authentication → Users** (MFA) e ele cadastra um
  novo no próximo login.

## Preparar a W3 em produção (catálogo)

Nenhuma variável nova e nenhuma ação antes do merge. Depois do `migrate` ✅ e do `deploy` ✅:

1. Conferir (só leitura) as 5 migrations do catálogo em `dbmate.schema_migrations` e as tabelas `app.brand_partner`,
   `app.concept`, `app.concept_version`, `app.investor_authorization`, `app.edition` e `app.residence` com RLS ligada,
   políticas só para `luxtory_app` e **zero linhas**.
2. Entrar no Admin com o papel Admin e abrir **Catálogo** (`/admin/catalogo`): lista vazia, sem erro.
3. **Não criar registros de teste em Production** (D-W3-5): o catálogo é só de inserção e não há staging
   (ADR-0007). Os primeiros registros entram com dados reais da Luxtory.

## Rotacionar segredos

- `CRON_SECRET`: gere outro valor, atualize na Vercel (Production) e refaça o deploy (passo 6).
- Senha do `luxtory_app`: repita os passos 3, 5 e 6. A senha antiga deixa de valer quando o `ALTER ROLE` roda; até o
  novo deploy, o job `outbox` responde erro e os eventos esperam pendentes (nada se perde).

## Quando algo falha

- `migrate` vermelho em `main`: o `deploy` não roda e produção continua na versão anterior. Corrija a causa com uma
  nova migration ou um novo commit; nunca aplique SQL de schema pelo console, MCP ou máquina local (ADR-0006).
- Eventos com `attempts` crescendo em `app.outbox`: um consumidor falha; `last_error` guarda só o nome do erro, e o
  log `outbox delivery failed` identifica evento e consumidor. O domínio não é desfeito (TECH-091).
- `/entrar` ou `/admin` em Production dizem "O acesso não está disponível neste ambiente": o log `auth unavailable`
  traz as chaves (`keys`) — variável de Auth ausente ou fora do formato (ex.: a chave `anon` legada no lugar da
  `sb_publishable_…`). Corrija na Vercel (Production) e refaça o deploy pela CI (passo 6 da W1).
- `command retries exhausted` nos logs: contenção de locks acima do `COMMAND_LOCK_TIMEOUT_MS` em
  `COMMAND_MAX_ATTEMPTS` tentativas; o cliente pode repetir com a mesma `Idempotency-Key`.
