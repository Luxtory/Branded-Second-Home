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
- Telas de grants e listas do Admin (W3 em diante); revogação de grant por API.
- Configuração do SMTP (decisão D4, P-9 — resolvida em 2026-09-27 com o Resend, feita no Supabase Auth, fora do
  código); rate limit (W5); selo da auditoria (W30).
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
- Fator TOTP não verificado de uma tentativa anterior → removido antes de um novo cadastro: gerar um novo QR Code
  invalida a chave anterior (caminho para descartar uma chave exposta antes da verificação).
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

- Logs: `auth code requested` / `auth code rejected` / `mfa verified` / `mfa rejected` (sem e-mail nem código),
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
