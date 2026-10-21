# 0018. Contato e pré-qualificação do interesse: dados separados, hash chaveado e contexto de apresentação assinado

- **Date**: 2026-10-20
- **Status**: Accepted (P-3, plano executivo da W6 e checkpoint da dimensão de investimento aprovados pelo fundador,
  2026-10-19 e 2026-10-20)
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: ownership, platform, catalog, database, security, privacy, idempotency

## Context

A W6 recebe, na página pública da Home Edition, a solicitação de conversa (spec [`ownership`](../specs/ownership.md)
§14): a manifestação de interesse, o contato do interessado (nome, telefone e e-mail) e a pré-qualificação comercial
estruturada — dimensão de investimento, unidade de decisão e horizonte (`02` v4.3 REQ-022; `03` v3.15 §3.1
`interest_contact`, `interest_qualification`). É a primeira PII de cliente persistida pela aplicação. Quatro fatos
pesam:

1. `app.interest` é imutável e é o registro da manifestação (REQ-022–REQ-025, BR-062). O contato e a pré-qualificação
   precisam ser elimináveis **sem** alterar a manifestação (`03` §3.1).
2. `app.public_idempotency_key` (ADR-0017) é imutável e guarda um SHA-256 sem chave do conteúdo — adequado na W5, sem
   dado pessoal. Com o contato no conteúdo (a idempotência precisa cobri-lo), um SHA-256 sem chave seria um derivado de
   PII permanente, verificável por adivinhação. O TECH-100 pede HMAC com segredo separado e PII fora de logs.
3. O `02` §15, item 14, exige que a pré-qualificação fique vinculada à média projetada **apresentada** ao interessado,
   mesmo que ela mude antes do envio. O navegador não é fonte confiável do que a página mostrou.
4. O `02` §15, item 15, exige que a manifestação não seja registrada se a Home Edition deixar de ser pública entre a
   página e o envio — e a W5 aceitava a corrida entre a checagem pública e a inserção.

## Decision

1. **Estruturas separadas, 1:1.** `app.interest_contact` e `app.interest_qualification` usam `interest_id` como chave
   primária e FK para `app.interest`. Nenhuma FK para `party`, `holding`, `membership`, Brand Partner ou parceiro;
   nada as referencia. O contato não cria Titular, conta, vínculo nem direito.
2. **Eliminação estrutural, sem caminho na aplicação (D-W6-2 = A).** As duas recusam `UPDATE` e `TRUNCATE`, mas não têm
   gatilho contra `DELETE`: eliminar uma linha não altera `interest`, a outra estrutura nem a chave de idempotência. A
   W6 **não** concede `DELETE` ao papel de aplicação, não tem ação no Admin nem no fluxo público e não define workflow
   de direitos. O go-live fica bloqueado até um procedimento operacional definido; `DELETE` manual não auditado em
   Production não é solução.
3. **Hash chaveado com esquema por registro (D-W6-1).** Para a superfície `interest`, `request_hash` passa a ser
   HMAC-SHA-256 (hex) do mesmo JSON canônico do ADR-0017 §4, com o segredo próprio `INTEREST_REQUEST_HMAC_SECRET`.
   Cada registro guarda `hash_scheme` (`sha256` | `hmac_sha256`) e `hash_key_id` (nulo só em `sha256`). A verificação
   usa o esquema e a chave **do registro**: `sha256` (W5) pela semântica do ADR-0017; `hmac_sha256` pela chave de mesmo
   id; chave desconhecida → não verificável → `503` sem efeito, nunca replay nem conflito. Uma chave (`v1`) na W6;
   rotação possível depois (nova chave para gravar, antiga para verificar), sem KMS. O HMAC é **pseudonimização**, não
   anonimização; rotação ou descarte do segredo não é eliminação.
4. **Contexto de apresentação assinado (`02` §15, item 14).** A página da Home Edition emite no servidor um contexto
   `{ v, k, h, p }` — versão, id da chave, `home_edition_id` e o id da média projetada apresentada ou `null` explícito —,
   assinado com HMAC-SHA-256 pelo segredo próprio `INTEREST_CONTEXT_HMAC_SECRET` sobre um rótulo de domínio fixo. Sem
   PII, valor ou instante. No envio: assinatura (tempo constante), versão, chave e Home Edition conferidas; senão
   `400`. A referência registrada é a do contexto — nunca substituída pela vigente nem recalculada. A média projetada
   não é copiada: `presented_projected_investment_id` é FK para `app.home_edition_projected_investment`, cujas linhas
   não aceitam `DELETE`/`TRUNCATE` e só mudam o fim da vigência; um gatilho confere que a referência é da mesma Home
   Edition. O contexto não expira (nenhum prazo canônico, TECH-001).
5. **Variante da dimensão de investimento decidida no servidor.** `reference_fit` só para Owner com média apresentada;
   `investment_definition` para Co-Owner e para Owner sem média. O cliente declara a variante que viu; divergência é
   recusada. Nenhum valor individual é derivado da média (BR-034). O gatilho de inserção repete a regra em qualquer
   caminho de escrita.
6. **Revalidação do alvo dentro da transação (`02` §15, item 15).** Além da leitura pública como `anon` (ADR-0014), a
   transação de escrita revalida a Home Edition por uma consulta exposta pelo `catalog` (sem acesso do `ownership` às
   tabelas dele): trava a linha como `luxtory_app` (`FOR SHARE`) e lê a visibilidade pela própria RLS pública, como
   `anon`, na mesma transação. Uma retirada concorrente espera o fim da transação ou é vista por ela; fora do público, a
   transação inteira é desfeita e a resposta é `404`.
7. **Replay depois da eliminação.** A repetição da mesma tentativa lógica responde como replay e **não** recria contato
   nem pré-qualificação; uma nova manifestação é uma nova tentativa, com nova chave.
8. **Atomicidade.** Reserva da chave → revalidação → `interest` → `interest_contact` → `interest_qualification` numa só
   transação (ADR-0017 §5): qualquer falha desfaz tudo.
9. **Um segredo por finalidade.** Pseudonimização de rede (`BRAND_PARTNERS_CONTACT_HMAC_SECRET`, domínio `interest`),
   hash de idempotência (`INTEREST_REQUEST_HMAC_SECRET`) e contexto de apresentação (`INTEREST_CONTEXT_HMAC_SECRET`)
   nunca compartilham segredo.

## Consequences

### Positive

- A manifestação continua imutável e agregável (BR-062); contato e pré-qualificação ficam isolados, com RLS própria, e
  são elimináveis sem reescrever histórico.
- O registro de idempotência não guarda derivado de PII verificável sem o segredo; a identificação por registro deixa
  a rotação possível sem migration nova.
- O vínculo com a média apresentada é verificável e reconstruível pelo histórico imutável da média projetada.
- A retirada da Home Edition e a manifestação ficam serializadas: não há registro numa Home Edition que já saiu do
  público.

### Negative

- Dois segredos novos de produção no go-live, sem default (TECH-001).
- O derivado chaveado continua sendo dado pseudonimizado no registro imutável; entra no inventário para a validação
  jurídica ([`lgpd-interesse.md`](../security/lgpd-interesse.md)).
- A transação de escrita troca de papel por um instante (`SET LOCAL ROLE anon` e de volta) para ler a visibilidade pela
  RLS sem repetir a regra; a troca vale só para a transação e é desfeita no rollback.
- A eliminação real depende de um procedimento ainda inexistente — gate de go-live, não da W6.

### Neutral / follow-ups

- Expurgo de chaves públicas antigas e retenção operacional do contato (proposta de até 12 meses) ficam com o
  procedimento de go-live.
- Outra superfície pública com PII deve seguir este ADR (segredo próprio, esquema por registro).

## Alternatives considered

- **SHA-256 sem chave também na W6** (ADR-0017 §4 como está): rejeitada — derivado permanente de PII verificável.
- **Reutilizar um segredo existente com separação de domínio**: rejeitada pelo fundador para o hash (domínios
  diferentes) e, pelo mesmo motivo, para o contexto de apresentação.
- **Confiar no id da média projetada enviado pelo navegador**: rejeitada pelo fundador — o envio precisa provar o que a
  página apresentou.
- **Copiar `amount_minor` para a pré-qualificação**: rejeitada — duplicaria um valor que o histórico imutável e a FK
  já preservam.
- **Só a checagem pública antes da transação** (W5): rejeitada para a W6 — o fundador exige a revalidação dentro da
  submissão.
- **Ação Admin "Eliminar contato" já na W6** (D-W6-2, opção B): rejeitada — decidiria quem executa e como se audita
  antes do procedimento de direitos.
- **Colunas de contato/qualificação na própria `interest`**: rejeitada — exigiria `UPDATE`/`DELETE` numa tabela
  imutável.

## References

- `03`: §3.1, TECH-001, TECH-033, TECH-056, TECH-092, TECH-100, ADR-006; `02`: REQ-022–REQ-025, §15 itens 14 e 15;
  `01`: BR-034, BR-041, BR-062, BR-064.
- [ADR-0017](0017-idempotencia-de-mutacoes-publicas-nao-criticas.md), [ADR-0014](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md),
  [ADR-0007](0007-ambientes-pre-lancamento-sem-staging.md) (reavaliação da D3), [ADR-0006](0006-acesso-a-dados.md),
  [ADR-0019](0019-ontologia-home-concept-home-edition-second-home.md).
- Spec [`ownership`](../specs/ownership.md) §14; [STRIDE `ownership`](../security/threats/ownership.md);
  [inventário LGPD do interesse](../security/lgpd-interesse.md).
