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
| `SUPABASE_SECRET_KEY` | Vercel, **só Production**, **Sensitive** — nunca `NEXT_PUBLIC_*` | Supabase → Settings → API Keys → chave secreta `sb_secret_…` (a `service_role` legada é recusada pela validação) |

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

## Preparar a W4 em produção (Discovery público)

Nenhuma ação antes do merge. **Não crie `PUBLIC_SITE`**: sem ela, as páginas públicas respondem 404 em Production
(portão de publicação, ADR-0014). Depois do `migrate` ✅ e do `deploy` ✅:

1. Conferir (só leitura) a migration `catalog_public_read`: `anon` membro de `luxtory_app` só com `SET`; `USAGE` em
   `app` para `anon`; grants por coluna da spec `catalog` §13.2; políticas `FOR SELECT TO anon` nas 4 tabelas; os dois
   predicados com `EXECUTE` só para `anon`.
2. **Data API continua desligada** e `app` fora dos Exposed schemas: `GET /rest/v1/concept?select=id` com
   `Accept-Profile: app` e a chave publicável responde `PGRST002` (ou recusa), nunca dados. Religar a Data API ou incluir
   `app` nos Exposed schemas é **proibido** — publicaria o catálogo público fora do portão.
3. `/`, `/como-funciona`, `/colecao` e `/colecao/<id>` → 404; `/entrar` e `/admin` com `Content-Security-Policy`
   contendo `nonce-` e sem erro de console.

**Go-live do site público** (depois da revisão jurídica `P-LX-03`, de D1 e da D5c): criar `PUBLIC_SITE=open` só em
Production e fazer um novo deploy.

## Preparar a Wave 4.1 em produção (mídia da Coleção)

Antes do deploy que habilitar capas reais ([ADR-0015](../adr/0015-midia-do-catalogo-metadados-e-storage.md)). Nenhum
valor de segredo entra em código, migration, log, issue ou artifact.

1. Supabase → Storage → **New bucket**, nome `catalog-media` (ou outro), **Public bucket desligado**. Não criar
   políticas de Storage para `anon` nem `authenticated`: só o servidor lê e grava, com a chave secreta.
2. Vercel → Environment Variables, **só Production**: `SUPABASE_SECRET_KEY` (Sensitive) e `MEDIA_BUCKET` = o nome do
   bucket. Nunca em Preview/Development, nunca com prefixo `NEXT_PUBLIC_`. Não criar `MEDIA_STORAGE` nem
   `MEDIA_LOCAL_DIR` na Vercel (o adaptador local é recusado quando `VERCEL_ENV` existe).
3. Deploy (CI). Conferir:
   - o bucket continua **privado** (Storage → bucket → sem "Public"); `GET https://<projeto>.supabase.co/storage/v1/object/public/<bucket>/…`
     responde erro, nunca o arquivo;
   - a única superfície pública de entrega é `GET /media/concept-covers/{id}/{largura}` do próprio domínio, e só para a
     capa aprovada de Concept público (o resto é 404);
   - no Admin, enviar uma capa de teste, aprovar, ver no site e retirar — a rota passa a 404 na próxima requisição.
4. **Falha segura sem as variáveis:** sem `SUPABASE_SECRET_KEY` ou `MEDIA_BUCKET`, o envio de capa e a rota da imagem
   ficam indisponíveis (`ConfigurationMissingError` → 503), sem gravar nada; o código nunca cria bucket nem muda a
   visibilidade dele. O resto da Coleção (cards com o quadro tipográfico) continua no ar.

## Preparar a BP1 (Brand Partners público)

Contrato: spec `catalog` §14 (TECH-057). Nenhum valor de segredo entra em código, issue, PR, log ou chat — o fundador
configura direto na Vercel. **Sem a configuração, o envio falha fechado (503) em qualquer ambiente**; nada é simulado.

**Preview (revisão antes do go-live)** — exceção da BP1 à regra "segredos só em Production" (spec `catalog` §14.6):
credenciais e caixa **de teste**, nunca as de Production.

1. Resend: domínio/remetente verificado e uma chave de API própria do Preview (permissão só de envio).
2. Upstash: um banco Redis próprio do Preview (não o de Production).
3. Vercel → Environment Variables, **só Preview**: `RESEND_API_KEY` (Sensitive), `BRAND_PARTNERS_CONTACT_FROM`,
   `BRAND_PARTNERS_CONTACT_TO` (caixa de teste), `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (Sensitive),
   `BRAND_PARTNERS_CONTACT_HMAC_SECRET` (Sensitive, ≥ 32 caracteres aleatórios), `BRAND_PARTNERS_ALLOWED_ORIGINS` (a URL
   estável do branch na Vercel, `https://…`, sem barra final) e os seis limites/prazos abaixo. Nunca criar
   `BRAND_PARTNERS_CONTACT_MODE` na Vercel (o adaptador determinístico é recusado lá).
4. Redeploy do Preview e smoke com dados sintéticos: o e-mail chega à caixa de teste; repetir o mesmo envio (retry)
   não duplica; origem estranha → 403.

**Valores de operação (TECH-001)** — definidos pela operação antes do go-live; o código não tem default:

| Chave | Valor | Efeito |
|---|---|---|
| `BRAND_PARTNERS_CONTACT_NETWORK_LIMIT` / `…_NETWORK_WINDOW_SECONDS` | a definir | tentativas por origem de rede na janela; excedido → 429 com `Retry-After` |
| `BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT` / `…_GLOBAL_WINDOW_SECONDS` | a definir | tentativas totais da superfície na janela |
| `BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS` | a definir | prazo do Resend; timeout → 503 "envio não confirmado" (pode ter sido aceito; o retry usa a mesma chave) |
| `BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS` | a definir | prazo do Upstash; sem resposta → 503 (falha fechada) |
| TTL das chaves no Redis | derivado da janela | o script da janela deslizante expira cada chave (`PEXPIRE`) em ~2 × janela + 1 s |

**Janela de idempotência do Resend:** 24 h por chave (documentação do Resend). Dentro dela, o retry da mesma
tentativa (mesma `Idempotency-Key` e mesmo conteúdo) devolve o aceite original sem novo envio; a mesma chave com outro
conteúdo é recusada (`409 invalid_idempotent_request` → `ERR_IDEMPOTENCY_CONFLICT`); chave em uso por outro request
(`409 concurrent_idempotent_requests`), limitação (429) e erros do provedor → 503. Fora da janela não há retry
automático nem garantia de deduplicação; a chave no provedor é `luxtory:brand-partner-contact:<VERCEL_ENV>:<uuid>`.

**Go-live em Production** (depois de copy/visual aprovados, `P-LX-03`, acesso/retenção/privacidade validados):

1. Production: as mesmas variáveis com a caixa corporativa, chave e banco Upstash de Production e
   `BRAND_PARTNERS_ALLOWED_ORIGINS` com o(s) domínio(s) públicos.
2. `BRAND_PARTNERS_SITE=open` só em Production; deploy pela CI.
3. Smoke controlado com dados sintéticos recebidos na caixa corporativa; conferir `/brand-partner` e
   `/brand-partner/como-funciona` com `Content-Security-Policy` com `nonce-` e indexáveis (`robots` sem `noindex`).

### Checklist de go-live da BP1.1 (preparado em 2026-10-12, não aplicado)

Executado pelo fundador na Vercel, com orientação; nada aqui foi configurado. **Antes:** `P-LX-03` concluída (temas
A–D de [`revisao-juridica-brand-partners.md`](../specs/communication/revisao-juridica-brand-partners.md)), as
verificações de pré-go-live J-34 (direitos das fotografias provisórias ou substituição) e J-35 (aviso de privacidade
do formulário, se exigido), autorização de merge do PR da BP1.1 e, **separada**, autorização para abrir o portão. O
aceite visual final foi dado em 2026-10-12.
Nunca criar `BRAND_PARTNERS_CONTACT_MODE` na Vercel; não tocar em variáveis fora desta lista.

1. **Merge** (autorização própria): a CI publica em Production com o portão fechado — `/brand-partner` e
   `/brand-partner/como-funciona` seguem 404, assim como `POST /v1/brand-partner-contacts`.
2. **Variáveis de Production** (Vercel → Settings → Environment Variables, só o ambiente Production; o código valida o
   formato e, sem uma delas, o envio falha fechado com 503 `stage: configuration`):

   | Variável | Formato validado | Sensitive |
   |---|---|---|
   | `RESEND_API_KEY` | `re_…`; chave própria de Production, só permissão de envio | sim |
   | `BRAND_PARTNERS_CONTACT_FROM` | `e-mail` ou `Nome <e-mail>`, num domínio verificado no Resend (SPF/DKIM, como `luxtory.club`) | não |
   | `BRAND_PARTNERS_CONTACT_TO` | um e-mail: a caixa corporativa que recebe as mensagens | não |
   | `UPSTASH_REDIS_REST_URL` | `https://…` do banco de Production (não o do Preview) | não |
   | `UPSTASH_REDIS_REST_TOKEN` | ≥ 20 caracteres sem espaço | sim |
   | `BRAND_PARTNERS_CONTACT_HMAC_SECRET` | ≥ 32 caracteres aleatórios (ex.: `openssl rand -base64 48`), exclusivo | sim |
   | `BRAND_PARTNERS_ALLOWED_ORIGINS` | origens exatas separadas por vírgula, `https://host` sem barra final: cada domínio público que serve o site (Vercel → Domains) | não |
   | os seis limites e prazos abaixo | inteiros positivos | não |

   **Limites e prazos — proposta para decisão da operação (TECH-001: o código não tem default):**

   | Chave | Proposta | Racional |
   |---|---|---|
   | `BRAND_PARTNERS_CONTACT_NETWORK_LIMIT` / `…_NETWORK_WINDOW_SECONDS` | 5 / 600 | um envio legítimo + retries por origem em 10 min |
   | `BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT` / `…_GLOBAL_WINDOW_SECONDS` | 60 / 3600 | volume B2B baixo; protege a cota do Resend |
   | `BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS` | 8000 | folga sobre a latência do Resend, abaixo do limite da função |
   | `BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS` | 1500 | Upstash REST na mesma região; sem resposta → 503 |

3. **Abrir o portão** (autorização própria): `BRAND_PARTNERS_SITE=open` só em Production e redeploy pela CI.
4. **Smoke em Production, logo depois:**
   - `/brand-partner` e `/brand-partner/como-funciona` → 200, `Content-Security-Policy` com `nonce-`, `robots` sem
     `noindex`, `canonical` próprio; M1–M5 carregam e o header leva só a destinos Brand Partners;
   - um envio com dados sintéticos (nome e marca de teste, e-mail da própria operação) → 202, "Envio confirmado" e a
     mensagem "Brand Partners — mensagem pelo site" chega à caixa corporativa;
   - o mesmo envio repetido (retry) não duplica a mensagem; `POST` com `Origin` de outro domínio → 403;
   - logs: uma linha `brand partner contact` por request, sem campos do formulário, IP ou chave;
   - o B2C (`/`, `/como-funciona`) continua igual, sem link para Brand Partners.
5. **Rollback:** `BRAND_PARTNERS_SITE=closed` (ou remover a variável) e redeploy — páginas e endpoint voltam a 404 sem
   mudar código; as credenciais podem ficar.

**Logs:** uma linha `brand partner contact` por request com `stage`, `status`, `duration_ms` e `reason` (chaves de
configuração ausentes, motivo do provedor ou do limitador) — nunca campos, corpo, IP, chave ou resposta do provedor.
503 com `stage: configuration` nomeia as chaves a corrigir.

## Rotacionar segredos

- `CRON_SECRET`: gere outro valor, atualize na Vercel (Production) e refaça o deploy (passo 6).
- Senha do `luxtory_app`: repita os passos 3, 5 e 6. A senha antiga deixa de valer quando o `ALTER ROLE` roda; até o
  novo deploy, o job `outbox` responde erro e os eventos esperam pendentes (nada se perde).

- `SUPABASE_SECRET_KEY`: crie uma chave secreta nova no Supabase, troque na Vercel (Production), refaça o deploy e só
  então revogue a antiga.
- `RESEND_API_KEY` e `UPSTASH_REDIS_REST_TOKEN` (BP1): crie a credencial nova, troque na Vercel (no ambiente certo),
  refaça o deploy e só então revogue a antiga. `BRAND_PARTNERS_CONTACT_HMAC_SECRET`: trocar só reinicia as contagens
  do limitador (chaves novas no Redis; as antigas expiram sozinhas).

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
