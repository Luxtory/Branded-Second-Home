# 0020. Party cifrada, HMAC com rotação e delegação pendente até a ativação

- **Date**: 2026-10-21
- **Status**: Accepted
- **Deciders**: Luxtory (decisões do fundador de 2026-10-21 sobre delegação, conta existente, convite e Investor);
  Engenharia (cripto, HMAC, idempotência, RLS)
- **Tags**: security, identity, database, privacy

## Context

A W7 cria a primeira PII de cliente persistida pela aplicação: o CPF/CNPJ da `party` (`03` §3.1: "CPF/CNPJ cifrado +
HMAC normalizado `UNIQUE`"). O TECH-100 pede chaves em KMS; o ADR-0002 adaptou para Vercel Sensitive Environment
Variables com `key_id` em cada valor e HMAC com segredo separado, preservando a rotação. O `03` diz só "usuário → party,
escopo e vigência" sobre `party_delegation` e nada sobre como a conta do Supabase Auth nasce ou se vincula.

Fatos que pesam:

- variáveis Sensitive da Vercel não são legíveis depois de gravadas: qualquer recifragem precisa rodar dentro do
  runtime, não numa máquina local;
- o hash de idempotência do executor (W1) é SHA-256 do input; um input com CPF (espaço de ~10⁹ valores) seria
  enumerável a partir do hash gravado;
- o `03` não define um escopo de delegação além de "representar a party", nem prazo de ativação (TECH-001: nada
  presumido);
- a Admin API do Supabase não tem busca de usuário por e-mail; `inviteUserByEmail` cria a conta não confirmada e envia
  o convite, ou reenvia para conta não confirmada; recusa conta confirmada (`email_exists`);
- desde julho de 2026 a Receita emite CNPJ alfanumérico (IN RFB 2.229/2024).

## Decision

1. **Cifra na aplicação** (ADR-0002): AES-256-GCM, chave de 32 bytes, IV aleatório de 96 bits por valor, tag de 128
   bits; `document_ciphertext = IV ‖ cifra ‖ tag` e `document_key_id` na mesma linha. **AAD** =
   `luxtory:party.document:v1|<party_id>|<key_id>`: a cifra não decifra em outra linha nem com outro id.
2. **HMAC de busca com anel próprio**: HMAC-SHA-256 sobre `luxtory:party.document:v1|<tipo>|<normalizado>`;
   `document_hmac` (`UNIQUE`) e `document_hmac_key_id`. A busca calcula o HMAC com **todas** as chaves do anel; novas
   linhas usam a ativa. Assim a rotação do segredo do HMAC é online: linhas antigas continuam achadas e a duplicidade
   continua barrada; a corrida entre inserções concorrentes do mesmo documento cai no `UNIQUE` (mesma chave ativa).
3. **Anéis de chaves em variáveis Sensitive**: `PII_ENCRYPTION_KEYRING` + `PII_ENCRYPTION_ACTIVE_KEY_ID` e
   `PII_HMAC_KEYRING` + `PII_HMAC_ACTIVE_KEY_ID` (formato `id:base64,…`, 32 bytes por chave). Substituem o nome planejado
   `PII_HMAC_KEY` (chave única não permite rotação online). A validação recusa material repetido entre os anéis (segredo
   separado verificado, não só documentado) e ativa fora do anel. `key_id` de uma linha ausente do anel → erro
   explícito, nunca leitura silenciosa.
4. **Retirar uma chave antiga** exige recifrar/reindexar as linhas que a usam, por uma operação auditada no runtime.
   **Não entra na W7**: até lá, chaves antigas ficam no anel (o runbook proíbe remover chave em uso).
5. **Idempotência sem PII**: `CommandHandler` ganha o hook opcional `fingerprint(input)`, usado no lugar do input no
   hash de idempotência. Os commands da W7 trocam documento e e-mail pelo HMAC (chave ativa) antes do hash. Resultados e
   respostas gravadas para replay não contêm documento nem e-mail. Efeito colateral aceito: um replay que atravesse a
   troca da chave ativa do HMAC recebe `ERR_IDEMPOTENCY_CONFLICT`.
6. **Normalização determinística** no domínio (puro): remove `.` `-` `/` e espaços, maiúsculas; CPF (11 dígitos, DV
   módulo 11) ou CNPJ (12 alfanuméricos + 2 DV, valor = ASCII − 48); sequências repetidas recusadas.
7. **Delegação pendente até a ativação** (fundador): `pending → active | revoked`, `active → revoked`; expiração derivada
   de `valid_until` opcional; escopo único `party`; no máximo uma delegação pendente ou ativa por par usuário × party
   (`conflict_party_delegation_open`). Representar = sessão verificada + delegação **ativa e vigente**. A ativação é um
   command do próprio convidado (`activate_party_delegation`, autoridade `invitee`), auditado.
8. **Conta do Supabase Auth**: a busca por e-mail é uma função `SECURITY DEFINER` do dono das tabelas, executável só por
   `luxtory_app`, que devolve só o id e se a conta está confirmada (`app.auth_account_by_email`); a listagem do Admin usa
   `app.auth_account_labels`, que devolve o e-mail **já mascarado no SQL**. Conta inexistente ou não confirmada →
   `inviteUserByEmail` (conta nunca nasce confirmada); conta confirmada → nenhuma conta nova nem e-mail, ativação pelo
   login normal. O convite (`user_metadata`, template) não carrega documento nem party.
9. **Leitura do Titular sob RLS**: `authenticated` recebe `USAGE` em `app` e `SELECT` por coluna só em `party` (sem
   HMAC) e `party_delegation` (sem bases nem ids de staff); a política de `party` exige delegação vigente do
   `auth.uid()`. O app decifra e mascara no servidor; o navegador nunca recebe a cifra.
10. **Constraints de conflito** com prefixo `conflict_` mapeiam para `ERR_STATE_TRANSITION` no executor (unicidade do
    documento e da delegação aberta), sem depender de erro acidental.

## Consequences

### Positive

- Documento nunca em claro no banco, nos logs, no `audit_log`, no hash de idempotência ou nas respostas.
- Rotação da chave de cifra e do segredo do HMAC sem janela de indisponibilidade e sem mudar o modelo de dados; troca
  futura para KMS mantém `key_id`.
- "Conta existe" e "convite enviado" nunca bastam para representar; toda ativação e revogação vira `operation` +
  `audit_log`.

### Negative

- Chaves em variáveis de ambiente (ADR-0002) continuam com proteção menor que KMS; anéis crescem até existir a
  recifragem.
- A busca com todas as chaves custa um HMAC por chave a cada consulta (desprezível com poucas chaves).
- `luxtory_app` passa a poder consultar id/confirmação de contas por e-mail e e-mails mascarados por id em `auth.users`
  (risco marginal frente ao que o papel já lê; nunca o e-mail completo).

### Neutral / follow-ups

- Recifragem/reindexação auditada antes de remover qualquer chave de um anel.
- Template **Invite user** do Supabase com `{{ .Token }}` e link para `/titular/ativar` (configuração operacional).
- Reavaliação da D3 (ADR-0007) antes da primeira party real.

## Alternatives considered

**`PII_HMAC_KEY` única (nome planejado).** Simples, mas rotacionar exigiria reindexar tudo de uma vez, com o app fora do
ar ou sem deduplicação no meio. Rejeitada em favor do anel.

**HMAC só com a chave ativa + reindexação imediata a cada rotação.** Exige job de recifragem já na W7 e janela de
inconsistência. Rejeitada.

**Máscara gravada no banco.** Evitaria decifrar para listar, mas é CPF/CNPJ parcial em claro. Rejeitada.

**Conta criada já confirmada (`createUser` com `email_confirm`).** Rejeitada pelo fundador: a conta só é confirmada
quando o usuário prova controle do endereço.

**Confirmar CPF/CNPJ na ativação.** Rejeitada pelo fundador: documento não é segredo de autenticação (o CNPJ é público).

## References

- `docs/specs/identity.md` §13; STRIDE `docs/security/threats/titular-pii.md`.
- ADR-0002, ADR-0006, ADR-0007, ADR-0008, ADR-0010 (D-W3-1), ADR-0018 (hash chaveado da W6).
- `03`: TECH-050, TECH-052, TECH-092, TECH-100, ADR-006 (idempotência).
- NIST SP 800-38D (GCM); IN RFB 2.229/2024 (CNPJ alfanumérico).
