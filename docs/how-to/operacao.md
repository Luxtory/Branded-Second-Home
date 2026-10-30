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
| `DRAW_TRANSACTION_TIMEOUT_MS` | `15000` (proposto; **não criar antes da ativação das aquisições**) | Vercel, Production | `transaction_timeout` das transações de compromisso e revelação do sorteio e largura do prazo de commit (W9) |
| `DRAW_BEACON_TIMEOUT_MS` | `8000` (proposto; idem) | Vercel, Production | orçamento total para obter e verificar a rodada da drand, somando os relays; **menor** que o anterior, senão o sorteio fica pendente |
| `DRAW_BEACON_LEAD_SECONDS` | `120` (proposto; idem) | Vercel, Production | folga mínima entre o prazo de commit e a rodada alvo (latência final do commit e diferença de relógio) |
| Cadência do job `outbox` | `17 6 * * *` (06:17 UTC, 1×/dia) | `vercel.json` → `crons` | varredura de segurança; o caminho normal é o disparo logo após o commit. O plano Hobby limita o cron a 1×/dia (ADR-0002) |
| Cadência do job `open_exercise` | `23 4 * * *` (hora 04 UTC, 1×/dia) | `vercel.json` → `crons` | sela o exercício corrente e o seguinte de cada Second Home formalizada (W10); o caminho normal após uma formalização é o `after()`. No Hobby o disparo ocorre em qualquer minuto da hora, sem retry |
| `OPS_ALERT_SEND_TIMEOUT_MS` | `5000` (proposto; **não criar sem autorização do fundador**) | Vercel, Production | prazo do e-mail de alerta à staff (W10); ausente → alerta só no log |

## Segredos

| Chave | Onde | Como gerar |
|---|---|---|
| `CRON_SECRET` | Vercel, Production, **Sensitive** | ao menos 32 caracteres aleatórios do gerenciador de senhas; a Vercel o envia como `Authorization: Bearer` ao chamar os crons |
| `DATABASE_URL` | Vercel, Production, **Sensitive** | passo 5 abaixo |
| `SUPABASE_SECRET_KEY` | Vercel, **só Production**, **Sensitive** — nunca `NEXT_PUBLIC_*` | Supabase → Settings → API Keys → chave secreta `sb_secret_…` (a `service_role` legada é recusada pela validação) |
| `PII_ENCRYPTION_KEYRING` · `PII_ENCRYPTION_ACTIVE_KEY_ID` | Vercel, **só Production**, **Sensitive** (W7) | anel `id:base64` com chave de 32 bytes aleatórios (ex.: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` numa máquina confiável, colado direto na Vercel; nunca em arquivo, chat ou commit); id curto e minúsculo (ex.: `e2026a`) |
| `PII_HMAC_KEYRING` · `PII_HMAC_ACTIVE_KEY_ID` | Vercel, **só Production**, **Sensitive** (W7) | mesmo formato, com chave **gerada à parte** (a validação recusa material igual ao do anel de cifra); id próprio (ex.: `h2026a`) |

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
do formulário, se exigido), autorização de merge do PR da BP1.1 e, **separada**, autorização para abrir o portão.
Atendidos em 2026-10-13 por decisão do fundador (`D-BP-24`): `P-LX-03` com o risco residual aceito, J-34 e J-35;
acesso e retenção da caixa de `BRAND_PARTNERS_CONTACT_TO` (12 meses após o último contato para leads sem relação
comercial ativa) em [`revisao-juridica-brand-partners.md`](../specs/communication/revisao-juridica-brand-partners.md) §6. O
aceite visual final foi dado em 2026-10-12; o do refinamento pós-merge (`D-BP-20` a `D-BP-23`), em 2026-10-13, sobre
`10c2816`.
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

## Preparar a W5 em produção (interesse)

Registro público de interesse (`POST /v1/interests`, spec [`ownership`](../specs/ownership.md) §5, ADR-0017) e visão
agrupada em `/admin/interesses`. **Nada aqui foi configurado**: cada passo é decisão e ação do fundador, depois do
checkpoint final da W5. O merge publica o endpoint **fechado** em Production (`INTEREST_WRITES` ausente → `404`); as
migrations `public_idempotency_key` e `interest` são aplicadas pelo job `migrate`.

**Pré-requisitos antes de abrir a coleta produtiva:**

1. **D2** (plano do Supabase com backup diário e sem pausa) resolvida — interesse é dado real de demanda. Enquanto
   isso, a coleta produtiva fica fechada (decisão do fundador de 2026-10-19).
2. **Variáveis de Production** (Vercel → Settings → Environment Variables, só Production; o código valida o formato e,
   sem uma delas, a escrita falha fechada com `503`, nomeando só a chave no log):

   | Variável | Formato validado | Sensitive |
   |---|---|---|
   | `INTEREST_NETWORK_LIMIT` / `INTEREST_NETWORK_WINDOW_SECONDS` | inteiros positivos (tentativas por origem de rede por janela, em segundos) | não |
   | `INTEREST_GLOBAL_LIMIT` / `INTEREST_GLOBAL_WINDOW_SECONDS` | inteiros positivos (tentativas totais por janela) | não |
   | `INTEREST_LIMITER_TIMEOUT_MS` | inteiro positivo (prazo do Upstash; sem resposta → `503`) | não |

   Reaproveitadas, já existentes desde a BP1: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (banco de
   Production) e `BRAND_PARTNERS_CONTACT_HMAC_SECRET` (o interesse usa domínio próprio no HMAC; nenhum segredo novo).
   Os valores dos limites são decisão da operação (TECH-001: o código não tem default). Nunca criar
   `INTEREST_LIMITER_MODE` na Vercel.
3. **Abrir** (autorização própria do fundador): `INTEREST_WRITES=open` só em Production e redeploy pela CI. Exige o site
   público aberto (`PUBLIC_SITE=open`).
4. **Smoke em Production, logo depois** (dados sintéticos identificáveis, depois tratados como teste): `POST
   /v1/interests` numa Home Edition publicada → `201`; a mesma chave → `201` com `idempotency-replayed: true`; Home
   Edition em preparação ou fora do público → `404`; `/admin/interesses` mostra o agrupamento; logs sem campos, IP ou
   chave. (Desde a W4.2, o interesse parte da Home Edition — spec `ownership` §13.)

**Fechar de novo**: `INTEREST_WRITES=closed` e redeploy — o endpoint volta a `404` sem perder registros.

## Preparar a W6 em produção (solicitação de conversa na Home Edition)

Formulário "Solicitar uma conversa" na página da Home Edition, contato e pré-qualificação (spec
[`ownership`](../specs/ownership.md) §14, ADR-0018) e drill-down em `/admin/interesses`. **Nada aqui foi
configurado**: cada passo é decisão e ação do fundador, depois do checkpoint final da W6. O merge publica tudo
**fechado** em Production (`INTEREST_WRITES` ausente e Aviso de Privacidade `pending` → `404` e nenhuma seção de
formulário); as migrations de esquema do hash, contato e pré-qualificação são aplicadas pelo job `migrate`.

**Gates antes de abrir a coleta (spec `ownership` §14.12), todos obrigatórios:**

1. Validação jurídica da base legal proposta e Aviso de Privacidade final entregue pela Luxtory, marcado `approved`
   por commit revisado (o software verifica só a estrutura).
2. Canal de direitos do titular e procedimento operacional de retenção e eliminação (quem executa, fundamento,
   verificação de identidade, auditoria, backups, conservação legal). Nunca `DELETE` manual não auditado.
3. D2 resolvida e reavaliação formal da D3 ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)).
4. Os pré-requisitos da W5 (seção acima) e, além deles, os segredos próprios da W6 (Vercel → só Production,
   **Sensitive**; valores gerados por um gerador de segredos, ≥ 32 caracteres, nunca reaproveitados):

   | Variável | Uso |
   |---|---|
   | `INTEREST_REQUEST_HMAC_SECRET` | HMAC do hash de idempotência (`hash_key_id = v1`) — não trocar sem rotação planejada |
   | `INTEREST_CONTEXT_HMAC_SECRET` | assinatura do contexto de apresentação da Home Edition |

5. **Abrir** (autorização própria do fundador): `INTEREST_WRITES=open` só em Production e redeploy pela CI.
6. **Smoke em Production, logo depois** (dados sintéticos identificáveis, depois tratados pelo procedimento do item 2):
   a seção aparece numa Home Edition publicada; envio Owner com média apresentada e Co-Owner → sucesso "Recebemos sua
   solicitação de conversa."; a mesma tentativa → replay; `/admin/interesses` → Home Edition → interesse → contato e
   pré-qualificação; logs sem contato, pré-qualificação, IP ou chave.

**Fechar de novo**: `INTEREST_WRITES=closed` e redeploy — a seção some e o endpoint volta a `404` sem perder
registros.

## Preparar a W7 em produção (Titulares: party cifrada, delegação e Área do Titular)

Spec [`identity`](../specs/identity.md) §13, [ADR-0020](../adr/0020-party-cifrada-e-delegacao.md), STRIDE
[`titular-pii`](../security/threats/titular-pii.md). **Nada aqui foi configurado**: nenhuma party real, nenhum convite
real e nenhum segredo novo antes do checkpoint final do fundador. Sem os anéis `PII_*`, as telas de "Pessoas e empresas"
e da Área do Titular respondem "indisponível" e o cadastro de autorização de Investor responde `503` (fechado para
falhas). Na interface, a `party` é sempre "pessoa ou empresa" (nunca "parte") e não é sinônimo de Titular.

1. **Antes do merge (só leitura):** `SELECT count(*) FROM app.authorization_grant` e
   `SELECT count(*) FROM app.investor_authorization` devem ser **0** (auditados em 2026-10-21). A FK do grant é criada
   validada e `investor_authorization.party_id` nasce `NOT NULL`: com linha antiga, o job `migrate` falha fechado sem
   reescrever nada. Confirme também, só por leitura, que a **Data API continua desligada e `app` fora dos Exposed
   schemas**: `GET /rest/v1/staff_role?select=id` com `Accept-Profile: app` e a chave publicável responde `PGRST002`
   (ou recusa), nunca dados (conferido em 2026-10-22). Se `app` estiver exposto: **NO-GO** — `authenticated` lê a cifra
   por coluna para a decifragem no servidor, e o navegador nunca pode recebê-la.
2. **Merge → `migrate` → `deploy`** pela CI. Migrations `20261021220001`…`20261021220006` (a 0002 instala a extensão
   `btree_gist` no schema `extensions`).
3. **Depois (só leitura):** 36 versões em `dbmate.schema_migrations`; `app.party`, `app.party_document_digest` e
   `app.party_delegation` vazias, com RLS; constraint `conflict_party_delegation_overlap`; `idempotency_record` com
   `request_hash_key_id`; `authenticated` com `SELECT` só nas colunas previstas (sem digests nem bases); constraint
   `authorization_grant_grantee_party_fk` com `convalidated = true` e sem o gatilho `authorization_grant_require_party`;
   `app.auth_account_by_email` e `app.auth_account_labels` executáveis só por `luxtory_app`. **Smoke da Data API depois
   do deploy:** `GET /rest/v1/party?select=id,document_ciphertext` e `GET /rest/v1/party_delegation?select=id` com
   `Accept-Profile: app` e a chave publicável → `PGRST002` ou recusa, nunca linhas nem `document_ciphertext`.
4. **Gates antes da primeira party real ou do primeiro convite real** (todos obrigatórios, decisão do fundador):
   - os quatro segredos `PII_*` criados conforme a tabela de [Segredos](#segredos) (registre só os **ids** das chaves;
     o valor não sai da Vercel);
   - template **Invite user** do Supabase Auth (Authentication → Emails → Templates) com o código `{{ .Token }}` e o
     link para `/titular/ativar` do site — sem documento, party ou outro dado; o prazo do código é o "Email OTP
     Expiration" do projeto;
   - reavaliação formal da D3 ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)) e base legal/aviso
     aplicáveis aos dados de Titulares;
   - autorização explícita do fundador para a primeira party e o primeiro convite.
5. **Primeiro uso real** (não há party de teste em Production): Admin → Pessoas e empresas → Cadastrar pessoa ou
   empresa → Convidar
   representante (o resumo mostra o e-mail completo e o documento mascarado) → o representante faz o primeiro acesso em
   `/titular/ativar` (conta nova) ou entra em `/titular/entrar` (conta existente) e ativa; confira na lista de
   representantes "Ativa" e, nos logs, nenhum documento, e-mail ou código.
6. **Revogar** uma delegação: Admin → Pessoas e empresas → a pessoa ou empresa → o representante → Revogar (com a base).
   Vale na próxima tela. Convite expirado: revogue a pendente e convide de novo (o Supabase reenvia o convite para conta
   não confirmada). Delegação com fim (`valid_until`) já passado não precisa de revogação: um novo convite para o mesmo
   representante entra direto, e a anterior fica no histórico.

## Preparar a W4.2 em produção (ontologia Home Concept → Home Edition → Second Home)

Spec [`catalog`](../specs/catalog.md) §17, [`ownership`](../specs/ownership.md) §13, ADR-0019; dependency map e
estratégia por objeto em [`w4-2-ontologia.md`](../plan/w4-2-ontologia.md). **Nada aqui foi aplicado**: Production
continua fechada para a W4.2 até a aprovação explícita do fundador depois do PR, da CI e da revisão. Nenhuma variável
nova.

1. **Antes do merge (só leitura):** contar as linhas de `app.concept_version` com atributo físico, `app.edition`,
   `app.edition_reference_value`, `app.concept_media_file` e `app.interest` sem Edition. As migrations da W4.2 têm
   precondições fail-closed: com dado inesperado, o job `migrate` aborta sem aplicar a migration (nada é descartado em
   silêncio).
2. **Merge → `migrate` → `deploy`** pela CI (nunca localmente). As 7 migrations `20261019210001`…`20261019210007`
   renomeiam por `ALTER … RENAME` e só recriam o que foi substituído (média projetada, mídia da Home Edition).
3. **Depois (só leitura):** as 7 versões em `dbmate.schema_migrations`; `app.home_concept`, `app.home_concept_version`,
   `app.home_edition`, `app.home_edition_projected_investment`, `app.home_edition_media`, `app.second_home` com RLS
   ligada e as mesmas contagens de antes; `/admin/catalogo` abre sem erro; o site público continua no estado do portão
   (`PUBLIC_SITE`).
4. **Não publicar Home Edition de teste em Production.** A primeira Home Edition real segue o ciclo do Admin:
   preparação → finalização → publicação.

## Preparar a W8 em produção (formalização e calendário civil)

Spec [`ownership`](../specs/ownership.md) §15, [`calendar`](../specs/calendar.md),
[ADR-0021](../adr/0021-formalizacao-calendario-civil-e-outbox.md). O PR funcional permanece em draft durante o
desenvolvimento. Merge só depois do checkpoint do fundador; nenhuma configuração ou formalização produtiva está
autorizada pela entrega da Wave.

1. **Manter fechado:** não criar `ACQUISITION_WRITES`, `PII_*`, party, convite ou identidade institucional real e não
   criar dados sintéticos em Production. Os gates da W7 e da coleta de interesse continuam independentes e fechados.
2. Depois de eventual merge autorizado, somente o pipeline aplica as seis migrations W8 (36 → 42) e publica o app.
   Conferir em leitura as versões, as quatro linhas imutáveis de `second_home_configuration`, RLS/privilégios e zero
   fatos nas novas relações. A carga das configurações é o único catálogo inserido pelas migrations.
3. `ACQUISITION_WRITES` ausente/`closed`/inválido mantém as quatro mutations novas indisponíveis. Request válido e
   autorizado recebe `503 ERR_UNAVAILABLE`; sessão/papel/MFA recusados conservam os erros de autenticação/autorização.
   O gate precede lookup/reserva da idempotência: inclusive uma chave antiga não devolve replay enquanto fechado.
   REST e Server Actions usam a mesma regra. Leituras e o cadastro anterior de Second Home permanecem independentes.
4. **Identidade institucional é um gate posterior**, sem variável de ambiente, busca por nome ou leitura do CNPJ.
   Após autorização específica do fundador e conclusão dos gates de identidade/dados reais da W7, o operador poderá
   referenciar uma `party` CNPJ existente pelo procedimento versionado e auditado:
   `SELECT app.register_luxtory_legal_identity('<party_id CNPJ>', '<referência da base>');`.
   A função é invoker e não tem execução para `luxtory_app`, `authenticated` ou `anon`. Não cria a party, não copia
   seu documento e não admite CPF. A referência singleton é imutável. Ausência na formalização Co-Owner resulta em
   `ERR_PARAMETER_MISSING`, sem efeito patrimonial.
5. Primeira formalização real exige autorização posterior, reavaliação D3 e os pré-requisitos operacionais aplicáveis.
   A data-base civil é definitiva no ato; alocação parcial e capacidade Luxtory são explícitas, sem proporcionalidade.
   Administração Co-Owner deve cobrir continuamente o período operacional, com extremo final realmente aberto; não
   presumir renovação. Registro posterior de início declara a mesma base e não abre reservas ou calendário.
6. `ownership.initial_draw_scheduled` sem consumer fica pendente, sem tentativa, recibo ou erro. Isso é esperado até a
   W9 registrar seu consumer. Não marcar entregue manualmente nem executar sorteio, selagem, custódia ou rotações.
7. **Rollback:** fechar o gate interrompe novas mutations sem desfazer fatos. Os `down` recusam descartar identidade,
   aquisição, alocação ou administração registradas e bloqueiam escritores antes da verificação. Com fatos, preservar
   o banco e preparar correção por migration nova; nunca desabilitar triggers ou apagar histórico. Retorno da aplicação
   e migrations seguem o pipeline, com decisão explícita do fundador.
   Com eventos pendentes, o retorno da aplicação precisa preservar o dispatcher consumer-aware do ADR-0021: a versão
   anterior da W1 marcava eventos sem consumidor como entregues. Fechar mutations não protege esses eventos de um
   dispatcher antigo; não reintroduzir essa política nem descartar o agendamento da W9.

### Operar a formalização no Admin depois de ativação autorizada

Este procedimento descreve o uso futuro. Não autoriza abrir o gate ou criar dados em Production nesta Wave.

1. No catálogo, abrir a Second Home e sua formalização. Conferir Home Edition, versão aprovada de Home Concept de
   origem e timezone. A localização concreta, a modalidade e a data-base civil são registradas na formalização.
2. Selecionar pessoas ou empresas já cadastradas em "Pessoas e empresas", pelo identificador e documento mascarado.
   Owner exige um adquirente; Co-Owner exige uma das quatro configurações, N adquirentes distintos e uma SPE CNPJ.
   A identidade institucional da Luxtory precisa estar previamente registrada; não é criada por esta tela.
3. Para primeiro exercício parcial Co-Owner, registrar as quantidades equivalentes por Ação e categoria e a
   capacidade Luxtory explicitamente definidas na estruturação. Selecionar essa versão de alocação na formalização.
   O servidor revalida as noites futuras; o registro não reserva datas, não cria Ação e não presume proporcionalidade.
4. Registrar a referência da base do ato e confirmar a formalização. Depois do sucesso, modalidade, configuração e
   data-base ficam somente leitura. Ação, titularidade e grants surgem juntos; uma recusa não deixa estrutura parcial.
5. Registrar as coberturas de administração com prestador, escopo, vigência civil e base explícitos. Um contrato sem
   termo precisa ser declarado como tal. Co-Owner exige cadeia profissional contínua com extremo aberto para iniciar
   a operação; cobertura apenas finita ou com lacuna é insuficiente. Substituições preservam o histórico e a cobertura.
6. Quando a Second Home tiver efetivamente iniciado, registrar esse fato com a mesma data-base formalizada. Se a data
   efetiva divergir, interromper e obter decisão de domínio; não recalcular ou corrigir grants. O ato não abre reservas
   nem calendário. Em erro transitório, conservar a chave e os dados da tentativa para verificar/repetir o mesmo ato.

## Preparar a W9 em produção (sorteio auditável)

Spec [`ownership`](../specs/ownership.md) §16, [ADR-0022](../adr/0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md),
[referência de verificação](../reference/sorteio-inicial.md). Merge só depois do checkpoint do fundador; a entrega não
autoriza sorteio, formalização ou configuração produtiva.

1. **Antes do merge (D4):** conferência agregada e somente leitura no Production, com igualdade exata dos tipos:
   `SELECT event_type, count(*) FILTER (WHERE delivered_at IS NULL) AS pending, count(*) AS total FROM app.outbox
   WHERE event_type IN ('ownership.initial_draw_scheduled', 'ownership.initial_draw_committed',
   'ownership.initial_draw_completed') GROUP BY event_type;` e `SELECT count(*) FROM app.acquisition;`. Esperado: sem
   linhas e `0`. Qualquer outro resultado: parar antes do merge.
2. **Manter fechado:** não criar `DRAW_*`, `ACQUISITION_WRITES`, `PII_*`, identidade institucional ou dados. Sem
   aquisição não há evento de sorteio; o consumidor registrado não executa nada. Se um evento de sorteio surgir sem os
   `DRAW_*`, ele fica pendente com `ConfigurationMissingError` (log por varredura), sem compromisso nem efeito.
3. Depois de eventual merge autorizado, somente o pipeline aplica as duas migrations W9 (42 → 44). Conferir em leitura
   `app.outbox.available_at` (nulo nas linhas anteriores), as cinco tabelas `initial_draw*` vazias, RLS e privilégios
   por coluna, e o log do job `outbox` (`delivered 0`, `failed 0`).
4. **Pré-requisito bloqueante da ativação** (spec `ownership` §16.3, T-910 HIGH): mitigação aprovada mergeada e testada
   (carimbo de COMMIT do servidor conferido na revelação) e `track_commit_timestamp` habilitado e conferido no Supabase
   (`supabase --experimental --project-ref <ref> postgres-config update --config track_commit_timestamp=true`; reinicia o
   banco; só com autorização e janela do fundador). Sem isso, não criar `DRAW_*`. Depois do reinício, conferir
   `SHOW track_commit_timestamp` = `on` com o papel da aplicação; desligado, o banco recusa compromissos e evidências do
   sorteio (ADR-0023). Restauração lógica ou migração de servidor não preserva os carimbos: com sorteio pendente sem
   evidência, não restaurar sem decisão do fundador.
   **Ativação futura** (junto com a das aquisições, por autorização do fundador): criar os três `DRAW_*` com os valores
   da tabela de operação. A primeira formalização Co-Owner agenda o sorteio; o compromisso é gravado no `after()` do
   command ou na varredura seguinte; a revelação é elegível depois de `t(R)` + 3 s e ocorre no próximo disparo do
   outbox (cron diário ou outro command). A evidência aparece no Admin (formalização) e na Área do Titular.
5. **Beacon fora do ar ou rodada inválida:** o evento de revelação fica pendente com `InitialDrawBeaconUnavailableError`
   ou `InitialDrawBeaconInvalidError`, um log por varredura, sem resultado parcial. Não marcar entregue, não refazer o
   sorteio e não trocar de beacon: compromisso e rodada são definitivos. Quicknet descontinuado exige decisão do
   fundador (sem caminho técnico previsto).
6. **Falha no COMMIT** (prazo de commit excedido, conexão encerrada por `transaction_timeout`) aparece como
   `outbox delivery failed` com `phase: commit`; a tentativa é registrada e a varredura segue. O compromisso perdido
   não deixa rastro além do log e é refeito com outra seed e outra rodada futura.
7. **Rollback:** os `down` recusam descartar sorteios ou eventos agendados. Com fatos, preservar o banco e corrigir por
   migration nova; nunca desabilitar gatilhos (`session_replication_role` é só do fixture do E2E descartável).

## Preparar a W10 em produção (custódia e selagem)

Spec [`calendar`](../specs/calendar.md) §5 e [`inventory`](../specs/inventory.md),
[ADR-0024](../adr/0024-custodia-selagem-e-fronteira-de-confianca.md). Merge só depois do checkpoint do fundador; a
entrega não abre gates nem cria configuração produtiva.

1. **Antes do merge:** conferência agregada e somente leitura no Production: `SELECT count(*) FROM app.acquisition;`.
   Esperado `0` (com `ACQUISITION_WRITES` fechado, não há o que selar).
2. Depois do merge autorizado, só o pipeline aplica as quatro migrations W10 (45 → 49). Conferir em leitura as três
   tabelas vazias, RLS habilitada, privilégios de `luxtory_app` (SELECT; INSERT só em `second_home_date` e
   `date_custody`) e nenhum privilégio de `authenticated`/`anon`. O cron `open_exercise` passa a rodar 1×/dia: sem
   aquisição, o log mostra `job completed` com `formalized 0`, `sealed 0`, `failed 0`. Não exige variável nova.
3. **Disparo manual** (recuperação depois de uma correção, sem esperar o cron): `read -rs CRON_SECRET` e
   `curl -s -H "Authorization: Bearer $CRON_SECRET" https://branded-second-home.vercel.app/api/jobs/open_exercise`.
   Idempotente: o que já está selado conta como `already_sealed`.
4. **Alerta `open_exercise_failure`.** O log estruturado `operational alert` traz o escopo (`item`: a execução terminou
   com itens falhos; `run`: a execução inteira falhou), o `correlation_id` e, por item, a Second Home, o exercício e o
   código. Corrigir a causa e disparar o job (passo 3) ou aguardar o cron. Item `ERR_UNAVAILABLE` = timeout de lock
   (transitório); `second_home_date_checkin_local` = regras de fuso divergentes entre Node e PostgreSQL (não selar à
   força; investigar o fuso da Second Home).
5. **Notificação de staff por e-mail — ativação só com autorização do fundador** (caixa de destino, remetente e se a
   chave do Resend é dedicada ou reaproveitada). Criar na Vercel (Production) `OPS_ALERT_RESEND_API_KEY` (Sensitive),
   `OPS_ALERT_EMAIL_FROM`, `OPS_ALERT_EMAIL_TO` e `OPS_ALERT_SEND_TIMEOUT_MS`, e refazer o deploy. Até lá, o alerta fica só
   no log, com `staff notification configuration unavailable` nomeando as chaves — recusa segura, nunca envio simulado.
6. **Ausência do cron** não gera alerta (o job não roda). Conferir periodicamente os logs do cron na Vercel até a
   reconciliação da W30 ou o Vercel Pro (D1).
7. **Rollback:** os `down` recusam descartar noites, custódias ou ocupações. Com fatos, preservar o banco e corrigir por
   migration nova; nunca desabilitar gatilhos.

## Rotacionar segredos

- `CRON_SECRET`: gere outro valor, atualize na Vercel (Production) e refaça o deploy (passo 6).
- Senha do `luxtory_app`: repita os passos 3, 5 e 6. A senha antiga deixa de valer quando o `ALTER ROLE` roda; até o
  novo deploy, o job `outbox` responde erro e os eventos esperam pendentes (nada se perde).

- `SUPABASE_SECRET_KEY`: crie uma chave secreta nova no Supabase, troque na Vercel (Production), refaça o deploy e só
  então revogue a antiga.
- `PII_ENCRYPTION_KEYRING` (W7, ADR-0020): **acrescente** a chave nova ao anel (`idAntigo:…,idNovo:…`), troque
  `PII_ENCRYPTION_ACTIVE_KEY_ID` para o id novo e refaça o deploy. Valores antigos continuam legíveis. **Nunca remova**
  uma chave enquanto `SELECT document_key_id, count(*) FROM app.party GROUP BY 1` mostrar linhas com ela (a
  recifragem auditada que permite retirá-la ainda não existe).
- `PII_HMAC_KEYRING` (W7, ADR-0020 §2) — **protocolo em fases**, um deploy por fase: (1) **acrescente** a chave nova ao
  anel mantendo `PII_HMAC_ACTIVE_KEY_ID`; (2) troque `PII_HMAC_ACTIVE_KEY_ID` para a nova; (3) só retire a antiga
  **depois** que toda party tiver digest na chave que fica (`SELECT count(DISTINCT party_id) FROM app.party` igual a
  `SELECT count(*) FROM app.party_document_digest WHERE hmac_key_id = '<nova>'`) — a reindexação auditada que preenche
  os digests antigos ainda não existe, então, por ora, a chave antiga **fica** no anel. Pular fase (ex.: trocar `h1` por
  `h2` de uma vez) quebra o invariante "um CPF/CNPJ → uma party" entre versões que rodam juntas e invalida replays de
  idempotência gravados com a chave antiga (falham fechados).
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
