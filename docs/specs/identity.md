# Spec: identity

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `identity` do TECH-011 (`src/features/identity/`). Esta versão cobre a W2 (acesso administrativo); a W7 a
estende com `party`, `party_delegation` e a Área do Titular, e a W15 com Membership.

## 1. Goal

Staff da Luxtory entra com MFA e nenhum command roda fora do guard (TECH-050, TECH-051, TECH-052). Brand Partner,
Investor e parceiros só agem dentro de `authorization_grant` (REQ-014); existir no modelo de negócio não concede
acesso ao software (`02` §2).

## 2. Non-goals

- `party`, `party_delegation`, holding e o caminho do Titular no guard (W7/W8): até lá esse caminho **nega**.
  (W7: `party`, `party_delegation`, a Área do Titular e a exigência de delegação vigente no guard estão no §13; holding
  e os commands do Titular continuam na W8.)
- Telas de grants e listas do Admin (W3 em diante); revogação de grant por API.
- Configuração do SMTP (decisão D4, P-9 — resolvida em 2026-09-27 com o Resend, feita no Supabase Auth, fora do
  código); rate limit (W5); selo da auditoria (W30). (W5, 2026-10-19: o limitador da aplicação foi aplicado só à escrita
  pública de interesse; login e Admin seguem com os limites do Supabase Auth — reavaliar na W7, login de Titulares.)
- Atribuição de papel de staff por tela: só pela função de operação do runbook (sem tela, plano → Wave 2).

## 3. Users / actors

- Staff da Luxtory com papel `admin` e/ou `super_admin` (sem hierarquia presumida, D-W2-2).
- Parceiro (Brand Partner, Investor, parceiro local ou de execução) agindo por uma party com `authorization_grant`.
- Operador do runbook (dono das tabelas, no SQL Editor): atribui e revoga papéis de staff e revoga grants.

## 4. User stories

- Como membro do staff, quero entrar com um código enviado por e-mail e confirmar com meu aplicativo autenticador,
  para acessar o Admin (TECH-050).
- Como Admin, quero registrar a autorização de um parceiro com comandos, escopo, vigência e base, para que ele só
  aja dentro dela (REQ-014).
- Como operador, quero atribuir e revogar papéis de staff e revogar grants por um caminho auditado (REQ-015).

## 5. Contracts

### HTTP API

- `POST /v1/admin/authorization-grants` (`createAuthorizationGrant`, `docs/api/openapi.yaml`): sessão por cookie
  (`sessionCookie`), header `Idempotency-Key`, origem igual à do host (TECH-100). 201 com o grant; 400, 401, 403,
  409, 503 no schema `Error` (TECH-056).
- Telas (fora do contrato REST): `/entrar` (e-mail → código), `/entrar/mfa` (cadastro ou desafio TOTP) e `/admin`
  (spec [`admin`](admin.md)). Formulários são Server Actions: o Next compara `Origin` e `Host`.

### Events (if any)

- Nenhum evento novo no outbox.

### Domain model

- **Sessão verificada**: `sub` e `aal` de um JWT com assinatura verificada no servidor (`getClaims()`, chave ES256 do
  JWKS do Supabase Auth). Claims vindas do navegador sem verificação nunca são usadas (ADR-0006 §6).
- **`app.staff_role`**: usuário do Supabase Auth, papel `admin | super_admin`, base, `granted_at`, `revoked_at`.
  Um papel ativo por usuário e papel; um usuário pode ter os dois. Sem `DELETE`: revogar grava `revoked_at` e a base.
  `luxtory_app` só lê.
- **`app.authorization_grant`** (`03` §3.1): party beneficiária, comandos explícitos, escopo (`scope_type`,
  `scope_id`), vigência (`valid_from` ≤ instante < `valid_until`), concedente (usuário e papel exercido), base,
  `operation_id` e revogação (`revoked_at` + base). Sem `DELETE`; `luxtory_app` lê e insere.
- **Funções de operação** (dono das tabelas, nunca `luxtory_app`): `app.assign_staff_role`, `app.revoke_staff_role` e
  `app.revoke_authorization_grant`. Cada chamada grava a mudança, uma `operation` (`committed`, papel `system`) e o
  `audit_log` com antes/depois e a base informada (REQ-015, TECH-092).
- **Operações não críticas (REQ-095)**: registro separado de `CRITICAL_COMMANDS`, que continua exatamente a tabela
  fechada do TECH-051. W2: `grant_authorization` (módulo `identity`, autoridade Admin). Operações que um parceiro
  pode receber por grant têm autoridade `grantee`; **nenhuma existe na W2**.

**Guard (TECH-050/051), nega por padrão.** Para `authorize(spec, ator, input, escopo)`:

| Autoridade do spec | Permite quando |
|---|---|
| `admin`, `admin_or_super_admin`, `super_admin` | sessão AAL2 do próprio ator; papel exercido aceito pela autoridade (Admin → `admin`; "Admin ou Super Admin" → qualquer um dos dois; Super Admin → `super_admin`); papel ativo em `staff_role` no instante. Referência: `staff_role:<id>` |
| `grantee` | papel exercido `grantee`, party representada, grant ativo da party que lista o command e cobre o escopo do input. Referência: `authorization_grant:<id>` |
| Titular, detentor, solicitante, ofertante | nunca na W2 (W7/W8) |
| ator `system` | nunca na W2 (jobs que executam commands chegam a partir da W10) |

### Dívida transitória deliberada (D-W2-1)

`authorization_grant.grantee_party_id` nasce `uuid` **sem FK**, porque `party` só existe na W7. Não é o modelo
definitivo. Enquanto durar, fica **fechado para falhas**:

1. a validação do `grant_authorization` só aceita comandos com autoridade `grantee`, e esse conjunto está vazio;
2. no banco, um gatilho recusa todo `INSERT` cujo `grantee_party_id` não exista em `app.party` — e recusa sempre
   enquanto `app.party` não existir (mesmo erro que a FK dará: `foreign_key_violation`,
   `authorization_grant_grantee_party_fk`).

**Obrigação da W7** (registrada no plano): criar a FK validada, remover o gatilho e devolver erro funcional para party
inexistente.

**Encerrada na W7** (§13.9): `app.party` existe, a FK `authorization_grant_grantee_party_fk` é criada **validada** (sem
`NOT VALID`; Production auditada em 2026-10-21 com 0 grants), o gatilho `authorization_grant_require_party` e sua função
são removidos, e o `grant_authorization` confere a party antes de gravar: party inexistente → `ERR_NOT_FOUND` (404).

## 6. Acceptance criteria

- [x] `[REQ-014]` sem grant válido é negado: sem grant, grant de outro command, de outro escopo, fora da vigência
      (antes e depois) ou revogado; grant válido autoriza e a `operation` registra `authorization_grant:<id>`.
- [x] `[REQ-014]` na W2 nenhum grant produtivo pode ser criado: comando não concedível → 400; sem `app.party` o banco
      recusa o `INSERT`.
- [x] `[TECH-050]` Admin com sessão AAL1 é negado; papel inexistente, revogado ou não aceito pela autoridade é
      negado; Admin e Super Admin não se substituem.
- [x] `[TECH-052]` `anon` e `authenticated` não leem `staff_role` nem `authorization_grant`; `luxtory_app` não altera
      nem apaga papéis e grants.
- [x] `[TECH-052]` mecanismo de leitura sob RLS (`withUserRead`): `SET LOCAL ROLE authenticated` + claims verificadas
      isolam usuários e não vazam para a transação seguinte. Provado em teste com tabela de fixture; **nenhuma leitura
      de produção o usa na W2** — os primeiros chamadores chegam com dados de usuário (W7).
- [x] `[TECH-092]` mecanismo de leitura administrativa auditada (`recordAdminRead`): grava `audit_log` do tipo
      `admin_read`. Provado em teste; **sem chamador de produção na W2** — as primeiras listas do Admin chegam na W3.
- [x] `[REQ-015]` atribuir e revogar papel e revogar grant gravam `operation` e `audit_log` com antes/depois e base.
- [x] `[TECH-100]` `POST` com origem ausente ou de outro host → 403 sem efeito.
- [x] `[ADR-0005]` autenticação de teste recusada quando `VERCEL_ENV` existe; Auth real recusado em Preview e
      Development da Vercel (D-W2-3).
- [x] `[TECH-051]` `CRITICAL_COMMANDS` continua exatamente a tabela do TECH-051; operações não críticas ficam fora.
- [x] E2E com autenticação de teste: e-mail → código → cadastro TOTP → Admin; usuário sem papel vê 403; axe 0.

## 7. Edge cases

- Código de login inválido ou expirado → mensagem genérica; e-mail não cadastrado → a mesma resposta do envio (sem
  enumerar contas). Limite de envio do Supabase → "muitas tentativas".
- "Reenviar código" (2026-09-27) no passo do código: mesmo envio para o mesmo e-mail (`shouldCreateUser: false`, mesma
  resposta com ou sem conta) e o formulário do código continua na tela. Sucesso → "Novo código enviado"; limite do
  Supabase → aviso para aguardar antes de tentar de novo, sem prazo na tela (o intervalo por usuário é configuração do
  Supabase Auth — padrão documentado de 60 s, ajustável — e o valor do projeto não está registrado); o último código
  recebido pode ser usado se ainda não expirou.
- Fator TOTP não verificado de uma tentativa anterior → removido antes de um novo cadastro: gerar um novo QR Code
  invalida a chave anterior (caminho para descartar uma chave exposta antes da verificação).
- W2B ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)): `/entrar`, `/entrar/mfa` e a tela
  "indisponível" usam o layout focado do DS (`FocusedLayout`), com o logo oficial; só apresentação — fluxos, TOTP e
  AAL2 inalterados. O rótulo "Indisponível" passa a `lx-label` (Hanken), não Courier.
- Primeiro cadastro do TOTP guiado em três passos (2026-09-27): (1) instalar ou abrir um aplicativo autenticador, com
  links só para páginas oficiais dos fornecedores ou das lojas; (2) adicionar a Luxtory pelo QR Code — a chave manual
  fica oculta em "Não consegue escanear?", com "Copiar chave" para a área de transferência local e o caminho "Adicionar
  conta → Inserir chave de configuração → Tipo baseado em tempo (TOTP)"; (3) digitar o código de 6 dígitos do
  aplicativo, diferente do código do e-mail, que muda a cada 30 segundos (usar o novo, sem recomeçar). TOTP padrão e
  AAL2 inalterados; nenhum site de terceiros recebe a chave.
- JWT ainda válido após revogar o papel → o guard lê `staff_role` a cada command: revogação vale na hora.
- `NEXT_PUBLIC_SUPABASE_*` ausentes → o build passa; telas e API respondem "indisponível" nomeando só a chave.
- Chave pública fora do formato `sb_publishable_…` (ex.: chave secreta) → recusada como configuração inválida.

## 8. Security considerations

- Authentication: Supabase Auth (TECH-050), só no servidor (`@supabase/ssr`, só `.auth`); cookies `httpOnly`,
  `Secure`, `SameSite=Lax`. Auth real só em Production enquanto a D3 estiver adiada (ADR-0007, ADR-0008).
- Authorization: guard acima; RLS nas leituras de usuário; papéis e grants lidos como `luxtory_app`.
- Data classification: e-mail do staff fica no `auth.users` do Supabase (PII interna, reavaliação da D3 registrada no
  ADR-0007); as tabelas da aplicação guardam só o id do usuário. Logs sem e-mail, código ou token.
- Threat model: [`docs/security/threats/identity-admin.md`](../security/threats/identity-admin.md).

## 9. Observability

- Logs: `auth code requested` (com `outcome` e `resend`) / `auth code rejected` / `mfa verified` / `mfa rejected` (sem e-mail nem código),
  `auth unavailable` (chaves), e os logs de command da W1 (`command committed`, `command rejected`).

## 10. Rollout plan

- Migrations aplicadas pelo `migrate`; runbook "Preparar a W2" (`docs/how-to/operacao.md`): configurações do Supabase
  Auth e variáveis em Production antes do merge; 1º Super Admin e 1º login com TOTP depois do merge.
- Rollback: `vercel rollback`; as migrations desta wave só criam objetos novos.

## 11. Open questions

- Nenhuma que bloqueie. SMTP (D4) limita o login a membros da organização Supabase até ser decidido. Resolvida em
  2026-09-27: SMTP customizado com Resend no Supabase Auth; o login não depende mais de ser membro da organização.

## 12. References

- ADRs: 0005, 0006, 0007, [0008](../adr/0008-autenticacao-e-autorizacao-administrativa.md).
- Plano: `docs/plan/implementation-waves.md` → Wave 2 (decisões D-W2-1…4).
- `03`: TECH-050, TECH-051, TECH-052, TECH-092, TECH-100, ADR-002. `02`: REQ-014, REQ-015, REQ-095.

## 13. W7 — Titulares: `party` cifrada, delegação e Área do Titular

> Wave 7 do plano (`docs/plan/implementation-waves.md`). IDs: TECH-050, TECH-052, TECH-100, ADR-0002 (economia de
> chaves), TECH-092 (leitura auditada), REQ-095 (operações não críticas), REQ-027/D-W3-1 (vínculo do Investor).
> Decisões do fundador de 2026-10-21 (§13.2). Cripto, HMAC e rotação: [ADR-0020](../adr/0020-party-cifrada-e-delegacao.md).
> STRIDE: [`titular-pii`](../security/threats/titular-pii.md).

### 13.1 Goal e non-goals

**Goal.** O futuro Titular existe como `party` protegida (CPF/CNPJ cifrado + HMAC `UNIQUE`, sem nome) e um usuário do
Supabase Auth só a representa por uma `party_delegation` **ativada** e vigente. A Área do Titular prova identidade e
isolamento: quem representa vê a própria party (documento mascarado); quem não representa é negado; quem representa A
não lê B.

**Non-goals (W7).** Aquisição/formalização, holding, Ação, Direito de Uso, calendário, reservas, Membership e Créditos
(W8+); commands do Titular do TECH-051 (o guard continua negando: falta holding); edição ou eliminação de CPF/CNPJ (sem
decisão de domínio); recusa do convite pelo convidado; reenvio de convite como operação própria (reenvio = revogar a
pendente e convidar de novo, §13.6); recifragem/reindexação depois de rotação (§13.5); navegação inferior (ADR-0009:
a Área tem um só destino na W7); portal Brand Partner (BP2, TECH-058).

### 13.2 Regra central e decisões do fundador (2026-10-21)

- **Existência de usuário ≠ representação da party.** **Convite enviado ≠ delegação ativa.** Só **usuário autenticado +
  ativação válida + `party_delegation` vigente** representa a party.
- **Escopo único, fim opcional.** `scope = 'party'` = representação integral da party: o que ela pode fazer vem do
  holding (W8) ou do `authorization_grant` (REQ-014); escopos mais estreitos não existem (BR-352). Início = instante do
  registro; fim (`valid_until`) só se a delegação tiver termo final (precedente: autorização do Investor, D-W3-1);
  revogação única, com base registrada e efeito imediato. N:N — uma party pode ter vários representantes e um usuário
  pode representar várias parties; no máximo **uma delegação não revogada (pendente ou ativa) por par usuário × party**.
- **Delegação pendente até a ativação.** O Admin informa e confirma visualmente o e-mail; o sistema mostra um resumo
  mascarado antes da confirmação; o Supabase Auth envia o convite; enquanto não houver ativação o usuário **não**
  representa a party; pendente ou ativa, o Admin pode revogar (efeito imediato).
- **Conta existente.** Não se cria conta duplicada: a delegação pendente é associada à conta existente, achada por uma
  função restrita do banco que devolve só o id e se a conta está confirmada (nunca o e-mail). A ativação continua
  exigindo uma sessão autenticada válida **daquele** usuário; "a conta existe" não ativa nada.
- **Conta nova não nasce confirmada.** A Admin API cria a conta **pelo convite** (`inviteUserByEmail`): não confirmada
  até o usuário provar controle do endereço com o código do convite.
- **CPF/CNPJ nunca é fator de autenticação nem "prova de conhecimento"** (o CNPJ é público). A Área mostra o documento
  só mascarado e só depois da ativação; nenhum e-mail ou tela anterior à ativação revela o documento, nem mascarado.
- **Investor (D-W3-1, já decidida).** `investor_authorization` ganha `party_id` com FK para `app.party`, sem reescrever
  registros; nova autorização só com party existente, identificada pelo CPF/CNPJ informado e resolvida pelo HMAC.

### 13.3 Modelo de domínio

**`app.party`** (`03` §3.1; módulo `identity`):

| Coluna | Regra |
|---|---|
| `id` | uuid gerado na aplicação (entra no AAD da cifra) |
| `document_type` | `cpf` \| `cnpj`, derivado da normalização |
| `document_ciphertext` | `bytea`: IV (12 bytes) ‖ cifra ‖ tag GCM (16 bytes), AES-256-GCM |
| `document_key_id` | id da chave de cifra usada (`[a-z0-9][a-z0-9_-]{0,31}`) |
| `document_hmac` | `bytea` de 32 bytes, HMAC-SHA-256 do documento normalizado; **`UNIQUE`** |
| `document_hmac_key_id` | id da chave de HMAC usada |
| `registered_by_user_id`, `registered_role`, `operation_id`, `created_at` | quem registrou, papel exercido e operation |

- **Sem nome** (o `03` não o prevê) e **sem** coluna em claro, parcial, mascarada ou reversível do documento; nenhum
  índice sobre texto do documento.
- Imutável: sem `UPDATE`, `DELETE` ou `TRUNCATE` (gatilhos); `luxtory_app` só `SELECT` e `INSERT`.

**Normalização determinística** (antes de cifrar e de calcular o HMAC; domínio puro): remove espaços, `.`, `-` e `/`,
converte para maiúsculas; então
- **CPF**: 11 dígitos; dígitos verificadores módulo 11; recusa os 11 dígitos iguais;
- **CNPJ**: 14 caracteres — 12 alfanuméricos `[0-9A-Z]` + 2 dígitos verificadores (CNPJ alfanumérico da Receita
  Federal, IN RFB 2.229/2024, vigente desde julho de 2026; o numérico é caso particular): valor de cada caractere =
  código ASCII − 48, pesos 2…9 da direita para a esquerda, módulo 11; recusa os 14 caracteres iguais;
- qualquer outra forma → `ERR_VALIDATION`. Mesmo documento com ou sem máscara → mesma forma normalizada → mesmo HMAC.

**Máscara** (só na apresentação, depois de decifrar): CPF `***.456.789-**` (6 dígitos centrais); CNPJ
`**.345.678/0001-**` (oculta os 2 primeiros caracteres e os verificadores).

**`app.party_delegation`** (`03` §3.1: usuário → party, escopo e vigência):

| Coluna | Regra |
|---|---|
| `id`, `party_id` (FK), `user_id` | usuário do Supabase Auth (id; nunca o e-mail) |
| `scope` | `party` (único valor, §13.2) |
| `state` | `pending` → `active` \| `revoked`; `active` → `revoked` |
| `valid_from` | instante do registro (convite) |
| `valid_until` | opcional; se houver, `> valid_from` |
| `basis` | base registrada do convite (1–255; sem dado pessoal — orientação na tela) |
| `invited_by_user_id`, `invited_role`, `operation_id`, `created_at` | quem convidou |
| `activated_at`, `activation_operation_id` | preenchidos uma única vez, na ativação |
| `revoked_at`, `revocation_basis`, `revoked_by_user_id`, `revoked_role`, `revocation_operation_id` | revogação única |

- **Vigente** no instante `t` = `state = 'active'` ∧ `valid_from ≤ t` ∧ (`valid_until` nulo ∨ `t < valid_until`).
  **Expirada** é derivada (`valid_until ≤ t`), nunca gravada: pendente expirada não ativa; ativa expirada não autoriza.
- Gatilho de transição: só `pending → active` (grava só os campos de ativação) e `pending|active → revoked` (só os de
  revogação); o resto é imutável; sem `DELETE`/`TRUNCATE`.
- Unicidade `conflict_party_delegation_open`: no máximo uma linha `pending|active` por (`user_id`, `party_id`). Uma
  delegação expirada e não revogada ocupa o par: novo convite exige revogá-la antes (base registrada).

**Contas do Supabase Auth.** Funções `SECURITY DEFINER` do dono das tabelas, executáveis só por `luxtory_app`:
`app.auth_account_by_email(text)` → (`user_id`, `email_confirmed`) e `app.auth_account_labels(uuid[])` → (`user_id`,
e-mail **mascarado** no próprio SQL, `email_confirmed`). O app nunca recebe e-mail completo de `auth.users`; mais de uma
conta para o mesmo e-mail → erro (fechado para falhas).

### 13.4 Fluxos

**Convite (Admin, `create_party_delegation`).** Passo 1: e-mail (digitado duas vezes), fim opcional e base. Passo 2:
resumo — e-mail completo para conferência visual, documento da party **mascarado**, vigência e base — e "Confirmar
convite". No command, dentro da transação (TECH-054):
1. trava a party (`FOR UPDATE`); inexistente → `ERR_NOT_FOUND`;
2. procura a conta pelo e-mail (`auth_account_by_email`);
3. se já houver delegação `pending|active` para o par → `ERR_STATE_TRANSITION` (antes de qualquer e-mail);
4. conta inexistente ou não confirmada → `inviteUserByEmail` (Admin API, só no servidor): cria a conta não confirmada ou
   reenvia o convite; `user_metadata` vazio (o convite não carrega documento nem party); conta confirmada → nenhum
   e-mail (o representante ativa ao entrar com código em `/titular/entrar`);
5. grava a delegação `pending` + `operation` + `audit_log`.

Falha depois do passo 4 deixa no máximo uma conta convidada sem delegação: ela não representa nada (regra central); a
nova tentativa com a mesma chave encontra a conta e não a duplica. O e-mail e o documento entram no hash de
idempotência só como HMAC (§13.5).

**Primeiro acesso de conta nova (`/titular/ativar`).** E-mail + código de 6 dígitos do convite → `verifyOtp` do tipo
`invite` (prova de controle do endereço; a conta passa a confirmada) → sessão → `/titular`, onde a delegação pendente
aparece. Código inválido ou expirado → mensagem genérica, sem enumerar contas; convite expirado → o Admin revoga a
pendente e convida de novo (o Supabase reenvia o convite para conta não confirmada).

**Conta existente (`/titular/entrar`).** Login por código (mesmo envio do staff: `shouldCreateUser: false`, resposta
igual com ou sem conta) → `/titular`. Sem MFA obrigatório: o TECH-050 exige MFA só de Admin/Super Admin; sessão AAL1 ou
AAL2 serve à Área do Titular, e o staff continua exigindo AAL2 no Admin.

**Ativação (`activate_party_delegation`).** Na Área, o convite pendente aparece como "Convite para representar um
Titular na Luxtory" (só a data do convite; **sem** documento nem tipo — a RLS só mostra a party depois da ativação) com
"Ativar representação". Exige sessão
verificada cujo `sub` = `user_id` da delegação, estado `pending`, não revogada e não expirada; revalida com a linha
travada; grava `active`, `activated_at`, `operation` e `audit_log` (antes/depois, só ids e estados). Só então a party
aparece, com o documento mascarado.

**Revogação (Admin, `revoke_party_delegation`).** Pendente ou ativa → `revoked` com base; vale na leitura ou no command
seguinte (RLS e guard leem o banco a cada request). Já revogada → `ERR_STATE_TRANSITION`.

### 13.5 Criptografia, HMAC e rotação ([ADR-0020](../adr/0020-party-cifrada-e-delegacao.md))

- **Chaves só em Vercel Sensitive Environment Variables** (ADR-0002), só no servidor: `PII_ENCRYPTION_KEYRING` +
  `PII_ENCRYPTION_ACTIVE_KEY_ID` e `PII_HMAC_KEYRING` + `PII_HMAC_ACTIVE_KEY_ID`. Formato do anel:
  `id:base64,id:base64` com chaves de exatamente 32 bytes; ids únicos; a ativa precisa estar no anel. **Segredo do HMAC
  separado**: a validação recusa qualquer material igual entre os dois anéis. Nunca no banco, no código, em logs, no
  `audit_log` nem em resposta de API; erros nomeiam só a variável ou o `key_id`.
- **Cifra**: AES-256-GCM, IV aleatório de 96 bits por valor, AAD = `luxtory:party.document:v1|<party_id>|<key_id>` —
  a cifra só decifra na própria linha e com o próprio `key_id`. O `key_id` grava-se ao lado do valor.
- **HMAC**: HMAC-SHA-256 sobre `luxtory:party.document:v1|<document_type>|<normalizado>` com a chave ativa;
  `document_hmac_key_id` ao lado. **Deduplicação/busca**: o HMAC é calculado com **todas** as chaves do anel e procurado
  em `document_hmac`; o `UNIQUE` barra a corrida entre inserções concorrentes (ambas usam a chave ativa).
- **Rotação da chave de cifra**: acrescentar a chave nova ao anel e trocar a ativa. Valores com `key_id` antigo
  continuam legíveis enquanto a chave antiga estiver no anel; novas cifras usam a ativa. `key_id` ausente do anel →
  erro explícito (`PiiKeyUnavailableError`, só o id), nunca leitura silenciosa.
- **Rotação do segredo do HMAC**: mesmo procedimento com o anel do HMAC. Parties antigas continuam encontradas (busca em
  todas as chaves) e a duplicidade continua barrada. Remover uma chave antiga do anel exige antes recifrar/reindexar as
  linhas que a usam — operação **fora da W7** (follow-up registrado; runbook proíbe remover chave em uso).
- **Idempotência sem PII**: o hash de idempotência dos commands da W7 recebe o documento e o e-mail só como HMAC
  (hook `fingerprint` do handler, ADR-0020); a resposta gravada para replay não contém documento nem e-mail.

### 13.6 Commands (operações não críticas do REQ-095; `CRITICAL_COMMANDS` intacto)

| Command | Autoridade | Entrada | Efeito | Recusas |
|---|---|---|---|---|
| `register_party` | Admin | `document` | party nova | `ERR_VALIDATION` (documento inválido) · `ERR_STATE_TRANSITION` (já existe, em qualquer chave do anel) |
| `create_party_delegation` | Admin | `party_id`, `email`, `valid_until?`, `basis` | delegação `pending` + convite | `ERR_NOT_FOUND` · `ERR_STATE_TRANSITION` (par com delegação aberta) · `ERR_VALIDATION` (`valid_until` não futuro) |
| `revoke_party_delegation` | Admin | `party_delegation_id`, `revocation_basis` | `revoked` | `ERR_NOT_FOUND` · `ERR_STATE_TRANSITION` |
| `activate_party_delegation` | `invitee` (o próprio convidado) | `party_delegation_id` | `active` | `ERR_PERMISSION` (inexistente ou de outro usuário: mesma resposta) · `ERR_STATE_TRANSITION` (não pendente, expirada) |

- Resultados sem PII: party → `id`, `document_type`, `operation_id`, `created_at`; delegação → ids, `scope`, `state`,
  vigência, `basis` e instantes. `audit_log` com antes/depois só desses campos (nunca documento, HMAC, cifra ou e-mail).
- `activate_party_delegation` grava `role = 'titular'`, `acting_party_id` nulo e `authorization_ref =
  party_delegation:<id>`.
- `register_investor_authorization` (catálogo) passa a exigir `investor_document`: normalizado, resolvido pelo HMAC para
  uma party **existente** (inexistente → `ERR_NOT_FOUND`; inválido → `ERR_VALIDATION`); grava `party_id`; nunca cria
  party nem guarda o documento. Home Concept, vigência e revogação seguem como na D-W3-1.
- `grant_authorization`: party inexistente → `ERR_NOT_FOUND` (conferida no handler, antes do `INSERT`).

### 13.7 HTTP API (`docs/api/openapi.yaml`)

- `POST /v1/admin/parties` (`registerParty`) → 201 `Party`.
- `POST /v1/admin/parties/{id}/delegations` (`createPartyDelegation`) → 201 `PartyDelegation` (`state = pending`).
- `POST /v1/admin/party-delegations/{id}/revoke` (`revokePartyDelegation`) → 200 `PartyDelegation`.
- `POST /v1/admin/investor-authorizations`: `InvestorAuthorizationRequest` ganha `investor_document` (obrigatório);
  `InvestorAuthorization` ganha `party_id`.
- Todos: sessão por cookie, `Idempotency-Key`, `Origin` igual ao host (TECH-100), erros no schema `Error`. A ativação
  e as leituras são telas (Server Actions e Server Components), fora do contrato REST, como o login.

### 13.8 Telas

**Admin** (papel Admin; AAL2; item "Partes" na navegação, como "Catálogo" e "Interesses"):
- `/admin/partes` — lista (mais recentes primeiro, limite fixo) com tipo, documento mascarado e data; busca por CPF/CNPJ
  (HMAC); "Cadastrar parte".
- `/admin/partes/nova` — CPF ou CNPJ → `register_party` → detalhe.
- `/admin/partes/[id]` — tipo, documento mascarado, data; representantes (e-mail mascarado, estado, vigência, base;
  "Revogar"); "Convidar representante"; "Ver documento completo".
- `/admin/partes/[id]/documento` — documento completo, leitura deliberada e auditada.
- `/admin/partes/[id]/representantes/novo` — convite em dois passos (§13.4).
- `/admin/partes/[id]/representantes/[delegationId]/revogacao` — base da revogação.
- Autorização de Investor (`/admin/catalogo/home-concepts/[id]/autorizacoes-investor/nova`) ganha "CPF/CNPJ do
  Investor".

**Titular** (Core DS, mobile-first, ADR-0009):
- `/titular/entrar` — login por código com texto do Titular; `/titular/ativar` — primeiro acesso pelo código do
  convite (layout focado).
- `/titular` — Área do Titular (App Shell; um item, "Início"; conta com "Sair"): representações vigentes (tipo, documento
  mascarado, desde quando, link), convites pendentes ("Ativar representação"); sem representação vigente nem convite →
  tela "Acesso negado" sem dado.
- `/titular/partes/[partyId]` — party representada (tipo, documento mascarado, vigência). Party que o usuário não
  representa, inexistente ou id inválido → 404 (mesma resposta: sem oráculo de existência).

### 13.9 Leituras, RLS e guard

- **RLS (TECH-052).** `authenticated` ganha `USAGE` no schema `app` e `SELECT` **por coluna** só em `party` (`id`,
  `document_type`, `document_ciphertext`, `document_key_id`, `created_at` — sem HMAC) e `party_delegation` (sem `basis`,
  `revocation_basis` nem ids de staff). Políticas: `party_delegation` → `user_id = auth.uid()`; `party` → existe
  delegação **vigente** do `auth.uid()` para a linha. Auditoria de Production (2026-10-21): `authenticated` não tem
  `SELECT` em nenhuma tabela de `app` nem privilégio padrão no schema; as funções de `app` executáveis por PUBLIC são de
  gatilho ou puras.
- **Área do Titular** lê sob `withUserRead` (`SET LOCAL ROLE authenticated` + claims verificadas): os primeiros chamadores
  de produção do mecanismo da W2. O id da URL nunca atravessa a política.
- **Admin** lê como `luxtory_app` e grava `admin_read` (TECH-092) na mesma transação, só com ids: `party_directory`
  (lista ou busca; `object_id` = `list` ou o id encontrado/`not_found`), `party` (detalhe), `party_document` (documento
  completo).
- **Guard.** Novo diretório de delegações (lido a cada decisão). `grantee` passa a exigir delegação **vigente** do
  usuário para a `actingPartyId` além do grant (cadeia TECH-050 completa; antes confiava no `actingPartyId`).
  `invitee` (ativação) exige delegação pendente, não expirada, do próprio usuário (`authorization_ref =
  party_delegation:<id>`). Titular, detentor, solicitante e ofertante continuam negados (holding na W8).
- **D-W2-1 encerrada**: FK validada `authorization_grant.grantee_party_id → party`, gatilho e função transitórios
  removidos.

### 13.10 Segurança e observabilidade

- Logs sem documento, HMAC, cifra, e-mail, código ou token: `party registered`/`party delegation …` não existem como
  logs próprios — valem os logs do executor (`command committed`/`rejected`, só nome, operation e código) e, do Auth,
  `auth invite sent`/`auth invite failed` (só `outcome`/código do provedor), `auth invite code rejected`.
- Admin API do Supabase só no servidor, com `SUPABASE_SECRET_KEY` (`sb_secret_…`, só Production), só a partir do command
  autorizado; recusada fora de Production (D3, ADR-0007); `AUTH_MODE=test` usa adapter determinístico.
- Rate limit: login e ativação usam os limites do Supabase Auth, como o login do staff (reavaliação da W5 registrada no
  STRIDE `titular-pii`).
- Reavaliação da D3 (ADR-0007): a W7 cria a estrutura de PII de clientes; **gate antes da primeira party real**.

### 13.11 Critérios de aceite

Verificados em 2026-10-21 (local): `npm run verify` exit 0, E2E completo 117/117 (`--workers=2`), `trace --expect
TECH-050,TECH-052,TECH-100,ADR-0002,TECH-092,REQ-014,REQ-027` 7/7.


- [x] `[TECH-100]` CPF/CNPJ nunca em claro no banco (colunas, índices, `idempotency_key`, `operation`, `audit_log`,
      `outbox`), nos logs nem em resposta; cifra AES-256-GCM com `key_id`; AAD amarrado à party.
- [x] `[TECH-100]` HMAC barra duplicidade (com e sem máscara, CPF e CNPJ alfanumérico); segredo do HMAC separado
      (anéis com material igual recusados).
- [x] `[ADR-0002]` valor cifrado com `key_id` antigo continua legível após a rotação; `key_id` ausente → erro explícito.
- [x] `[ADR-0002]` após rotação do segredo do HMAC, a party antiga é encontrada e o duplicado continua barrado.
- [x] `[TECH-050]` sem delegação vigente não há acesso: sem delegação, pendente, expirada e revogada → negado (Área, RLS
      e guard); ativação só pelo próprio convidado, com sessão.
- [x] `[TECH-050]` existência de conta ≠ representação: convite para conta existente fica pendente; conta nova nasce
      pelo convite (não confirmada).
- [x] `[TECH-052]` Titular A não lê a party do Titular B (RLS direto, tela por id e manipulação de ids na ativação).
- [x] `[TECH-052]` `authenticated` não lê HMAC, `basis`, nem outras tabelas de `app`; `luxtory_app` não altera nem apaga
      party; delegação só muda pelas transições.
- [x] `[TECH-092]` leituras do Admin gravam `admin_read` (lista, detalhe, documento completo) sem o documento.
- [x] `[REQ-014]` D-W2-1: FK validada; grant para party inexistente → `ERR_NOT_FOUND`; gatilho removido.
- [x] `[REQ-027]` autorização de Investor exige party existente pelo CPF/CNPJ (HMAC); documento duplicado resolve para a
      mesma party; vigência, Home Concept e revogação intactos; migração sem backfill.
- [x] `[TECH-100]` `POST` com origem inválida → 403 nas rotas novas.
- [x] E2E (autenticação de teste): Admin cadastra party, convida, revoga; convidado ativa e vê só a própria party;
      usuário sem delegação negado; A não abre B; axe 0 e sem overflow (320–1920) nas telas novas.

### 13.12 Edge cases

- Mesmo documento com máscara diferente, minúsculas no CNPJ alfanumérico → mesma party (409 no cadastro).
- Convite para e-mail do próprio staff → conta existente; delegação pendente até ele entrar em `/titular/entrar` e
  ativar.
- Dois Admins convidando o mesmo par ao mesmo tempo → trava da party serializa; o segundo recebe 409.
- Revogação com a sessão do Titular aberta → a próxima navegação já não mostra a party (RLS a cada request).
- Delegação ativa expirada → some da Área; novo convite para o par exige revogar a expirada.
- `PII_*` ausentes ou inválidas → telas e API respondem "indisponível" nomeando só a chave (TECH-001).
- Usuário com várias parties (CPF + CNPJ) → todas listadas; cada detalhe isolado.

### 13.13 Rollout e gates operacionais (antes de usar dados reais)

- Migrations pelo `migrate` da CI depois do merge autorizado; nenhuma party real, nenhum convite real e nenhum segredo
  novo em Production antes do checkpoint do fundador.
- Antes da primeira party real: criar os quatro segredos `PII_*` (Sensitive, só Production; geração no runbook);
  template **Invite user** do Supabase com o código `{{ .Token }}` e o link para `/titular/ativar`, sem dado da party;
  reavaliação da D3; base legal/aviso aplicáveis aos dados de Titulares (fora do escopo técnico).
- Rollback: `vercel rollback`; as migrations só acrescentam objetos, exceto a remoção do gatilho transitório (o `down`
  o recria).
