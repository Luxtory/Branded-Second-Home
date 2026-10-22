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

0. **O que cada conceito significa** (revisão do fundador, 2026-10-22). `user` = conta do Supabase Auth; `party` = pessoa
   física ou jurídica real identificada por CPF/CNPJ — a identidade no domínio, **não sinônimo de Titular** (uma party
   pode existir só por uma `investor_authorization`; titularidade é relação posterior, holding/Ação, W8);
   `party_delegation` = **quem pode representar quem** no software — não é propriedade, titularidade, participação em
   SPE, Owner, Co-Owner, Membership nem autorização econômica irrestrita. Agir continua dependendo de
   `user → party_delegation vigente → party → relação/autorização aplicável → command`. Esses nomes são do backend; a
   interface diz "Pessoas e empresas" (Admin) e "Suas representações" (Área do Titular), nunca "party" ou "parte".
1. **Cifra na aplicação** (ADR-0002): AES-256-GCM, chave de 32 bytes, IV aleatório de 96 bits por valor, tag de 128
   bits; `document_ciphertext = IV ‖ cifra ‖ tag` e `document_key_id` na mesma linha. **AAD** =
   `luxtory:party.document:v1|<party_id>|<key_id>`: a cifra não decifra em outra linha nem com outro id.
2. **HMAC de busca com anel próprio, um digest por chave**: HMAC-SHA-256 sobre
   `luxtory:party.document:v1|<tipo>|<normalizado>`. Quem grava uma party grava em `app.party_document_digest` **um
   digest para cada chave do seu anel**, com `UNIQUE (digest)`; a busca calcula com todas as chaves. Invariante: um
   CPF/CNPJ normalizado → no máximo uma party, **inclusive durante a rotação**: versões simultâneas do app com anéis
   diferentes (A `{h1}` ativa h1; B `{h1,h2}` ativa h2) compartilham ao menos uma chave pelo protocolo de rotação em
   fases (acrescentar → trocar a ativa → só retirar a antiga depois de toda party ter digest na que fica) e colidem no
   digest da chave comum, seja qual for a ativa. Nenhuma trava depende da chave ativa. *(Revisão de 2026-10-22: a versão
   anterior gravava um só `document_hmac` com a chave ativa, e duas versões em anéis diferentes podiam criar duas
   parties do mesmo documento.)*
3. **Anéis de chaves em variáveis Sensitive**: `PII_ENCRYPTION_KEYRING` + `PII_ENCRYPTION_ACTIVE_KEY_ID` e
   `PII_HMAC_KEYRING` + `PII_HMAC_ACTIVE_KEY_ID` (formato `id:base64,…`, 32 bytes por chave). Substituem o nome planejado
   `PII_HMAC_KEY` (chave única não permite rotação online). A validação recusa material repetido entre os anéis (segredo
   separado verificado, não só documentado) e ativa fora do anel. `key_id` de uma linha ausente do anel → erro
   explícito, nunca leitura silenciosa.
4. **Retirar uma chave antiga** exige recifrar/reindexar as linhas que a usam, por uma operação auditada no runtime.
   **Não entra na W7**: até lá, chaves antigas ficam no anel (o runbook proíbe remover chave em uso).
5. **Idempotência sem PII, por chave**: `CommandHandler` ganha `fingerprint: InputFingerprint` (`activeKeyId()` e
   `payload(input, keyId)`): o hash de idempotência usa o input com documento e e-mail trocados pelo HMAC **da chave
   indicada**, e o registro grava o id dela (`idempotency_record.request_hash_key_id`). No replay o executor recalcula
   com a chave do registro: mesma key + command/ator/payload → replay mesmo depois da troca da chave ativa (ADR-006 do
   `03`, sem exceção por causa de PII); payload diferente → `ERR_IDEMPOTENCY_CONFLICT`; chave histórica fora do anel →
   erro explícito (indisponível), nunca replay falso. Resultados e respostas gravadas para replay não contêm documento
   nem e-mail. *(Revisão de 2026-10-22: removido o "efeito colateral aceito" de conflito artificial na rotação.)*
6. **Normalização determinística** no domínio (puro): remove `.` `-` `/` e espaços, maiúsculas; CPF (11 dígitos, DV
   módulo 11) ou CNPJ (12 alfanuméricos + 2 DV, valor = ASCII − 48); sequências repetidas recusadas.
7. **Delegação pendente até a ativação** (fundador): `pending → active | revoked`, `active → revoked`; expiração derivada
   de `valid_until` opcional, sem revogação; escopo único `party` (representação da party, sem poderes próprios); no
   máximo uma delegação vigente por par usuário × party **em cada instante** — constraint de exclusão
   `conflict_party_delegation_overlap` (`btree_gist`) sobre as vigências `[valid_from, valid_until)` das linhas pendentes
   ou ativas, garantida pelo banco entre transações concorrentes; depois da expiração uma nova delegação entra e a
   anterior fica no histórico. *(Revisão de 2026-10-22: o índice único por par bloqueava o par para sempre depois da
   expiração.)* Representar = sessão verificada + delegação **ativa e vigente**. A ativação é um
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
    digest do documento e sobreposição de vigência da delegação), sem depender de erro acidental.
11. **Trava do convite**: a party é imutável e `luxtory_app` não tem `UPDATE` nela, então o convite não usa
    `SELECT … FOR UPDATE` (que exige `UPDATE`): toma a trava consultiva da transação `app.party:<id>`, que serializa
    convites concorrentes do mesmo par antes do e-mail; a constraint de exclusão continua a garantia final.

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
- A busca com todas as chaves custa um HMAC por chave a cada consulta, e cada party grava um digest por chave do anel
  (desprezível com poucas chaves).
- Nova dependência de extensão: `btree_gist` (no schema `extensions`), para a constraint de exclusão das vigências.
- `luxtory_app` passa a poder consultar id/confirmação de contas por e-mail e e-mails mascarados por id em `auth.users`
  (risco marginal frente ao que o papel já lê; nunca o e-mail completo).

### Neutral / follow-ups

- Recifragem/reindexação auditada antes de remover qualquer chave de um anel.
- Template **Invite user** do Supabase com `{{ .Token }}` e link para `/titular/ativar` (configuração operacional).
- Reavaliação da D3 (ADR-0007) antes da primeira party real.

## Alternatives considered

**Um só `document_hmac` com a chave ativa + busca em todas as chaves (versão inicial do PR #61).** Correto em sequência,
mas duas versões do app com chaves ativas diferentes podiam passar ambas pela busca e gravar digests distintos do mesmo
documento: duas parties. Rejeitada na revisão de 2026-10-22 em favor de um digest por chave do anel.

**Trava consultiva derivada do digest.** A identidade da trava mudaria com a chave ativa — exatamente o caso que falha na
rotação. Rejeitada.

**Índice único "uma delegação pendente ou ativa por par".** Simples, mas a expiração ocupava o par para sempre e exigia
revogação artificial. Rejeitada na revisão de 2026-10-22 em favor da exclusão por sobreposição de vigência.

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
