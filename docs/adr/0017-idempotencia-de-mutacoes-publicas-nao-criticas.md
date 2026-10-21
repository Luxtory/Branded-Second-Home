# 0017. Idempotência de mutações públicas não críticas, fora do pipeline de commands críticos

- **Date**: 2026-10-19
- **Status**: Accepted (revisão do plano da W5 pelo fundador, 2026-10-19)
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: platform, ownership, database, security, idempotency

## Context

A W5 cria a primeira escrita pública **persistida** sem conta: `POST /v1/interests` (spec
[`ownership`](../specs/ownership.md)). O TECH-056 exige `POST` + `Idempotency-Key` em toda mutation, e o ADR-006 do
`03` define a semântica: mesma chave + ator + conteúdo → replay; mesma chave com conteúdo diferente →
`ERR_IDEMPOTENCY_CONFLICT`.

O mecanismo existente (W1) está acoplado ao pipeline de commands críticos: `app.idempotency_record` exige um
`app.operation` (TECH-002), o escopo da chave é o ator (`user:<uuid>` ou `system:<job>`), `app.actor_role` só conhece
Titular, Admin, Super Admin, `grantee` e sistema, e o executor exige guard, base registrada e auditoria de command.

O TECH-002 exige `operation` para mutações **econômicas ou de estado crítico**. Registrar interesse não é aquisição,
formalização nem mutação econômica (REQ-024, REQ-025, BR-050, BR-065) e não consta da tabela fechada do TECH-051.
Estender o pipeline com um ator "público" criaria uma ficção de usuário, ampliaria `operation`/`audit_log` sem
necessidade canônica e misturaria registros anônimos na trilha dos commands críticos. A BP1 (TECH-057) não serve de
precedente: o contato Brand Partners não persiste nada e deduplica pela chave do provedor de e-mail.

## Decision

1. **Mutações públicas não críticas não usam o pipeline de commands críticos.** Sem `operation`, `audit_log` de
   command, `idempotency_record`, `CommandRegistry`/`CRITICAL_COMMANDS` ou ator público; `app.actor_role` inalterado.
2. **Registro mínimo e genérico em `platform`**: `app.public_idempotency_key (surface, idempotency_key, request_hash,
   created_at)`, chave primária (`surface`, `idempotency_key`), só inserção, RLS só para `luxtory_app`. `surface`
   identifica a escrita pública (`interest` na W5); não há coluna de ator — o chamador é anônimo.
3. **Chave UUID imprevisível.** Sem ator, o escopo é a superfície: a chave precisa ser um UUID gerado pelo cliente por
   tentativa lógica (como a BP1), guardado em minúsculas. Chave curta ou previsível é recusada (`ERR_VALIDATION`).
4. **Conteúdo = entrada validada e normalizada.** `request_hash` = SHA-256 do JSON canônico (chaves ordenadas) da
   superfície e da entrada já normalizada pelo schema — a mesma canonicalização do `requestHash` da W1.
5. **Atomicidade no PostgreSQL.** A reserva da chave (`INSERT … ON CONFLICT DO NOTHING`) e o efeito de domínio rodam
   na mesma transação. Sem linha inserida, a chave existente decide: hash igual → replay; diferente → conflito. Uma
   corrida com a mesma chave espera o índice único: exatamente um efeito persiste. Redis nunca participa da
   consistência — só limita requisições, e sua ausência ou falha recusa a escrita antes do banco.
6. **Só o sucesso consome a chave.** Recusas (validação, alvo inexistente, conflito) não gravam nada; o replay
   devolve a resposta de sucesso da superfície, que precisa ser determinística a partir da entrada (o registro não
   guarda corpo de resposta). Antes do efeito, uma consulta à chave responde replay/conflito sem reavaliar o alvo.

### Extensão — W6 (2026-10-20, [ADR-0018](0018-contato-e-pre-qualificacao-do-interesse.md))

Na superfície `interest`, o conteúdo passa a incluir contato e pré-qualificação: o item 4 vale com HMAC-SHA-256 e
segredo próprio no lugar do SHA-256 sem chave, e cada registro identifica o esquema e a chave (`hash_scheme`,
`hash_key_id`). Registros `sha256` existentes mantêm a semântica deste ADR. Os demais itens seguem inalterados.

## Consequences

### Positive

- Cumpre TECH-056 e o ADR-006 do `03` sem alterar `operation`, `audit_log`, `idempotency_record` nem o TECH-051.
- Nenhum dado do visitante no registro além do hash; nenhuma escrita no banco para tentativas recusadas.
- Reutilizável por futuras escritas públicas não críticas (nova `surface`), testado uma vez em `platform`.

### Negative

- Segundo registro de idempotência no banco, com semântica deliberadamente mais estreita (sem resposta gravada, sem
  ator). Mitigação: nome, comentário e ADR deixam a fronteira explícita — mutação crítica continua só no pipeline W1.
- As chaves públicas crescem sem expurgo na W5 (linhas pequenas, sem PII). Retenção fica como follow-up.
- Escrita pública não crítica não gera `audit_log`; o próprio registro de domínio (imutável, com `created_at`) e os
  logs estruturados sem PII são a trilha.

### Neutral / follow-ups

- A W6 (formulário público, `P-3`) reutiliza a mesma superfície `interest`.
- Uma superfície cuja resposta de sucesso não seja determinística exige nova migration (corpo de resposta gravado).

## Alternatives considered

- **Ator `public` no pipeline W1** (ampliar `app.actor_role`, `operation_actor_check` e o escopo de
  `idempotency_record`, registrar a escrita no executor): rejeitada pelo fundador — amplia infraestrutura de commands
  críticos sem necessidade canônica e cria ficção de usuário/party público.
- **Colunas de idempotência na própria tabela `interest`**: mínima, porém acopla mecanismo técnico ao modelo de
  domínio e não é reutilizável por outra superfície.
- **Idempotência no Redis**: rejeitada — Redis não decide estado (ADR-001 do `03`, ADR-0002) e sua perda duplicaria
  efeitos.

## References

- `03`: TECH-002, TECH-051, TECH-056, ADR-006, ADR-001; `02`: REQ-022–REQ-025; `01`: BR-050, BR-060, BR-065.
- Spec [`ownership`](../specs/ownership.md) §5; [STRIDE `ownership`](../security/threats/ownership.md).
- [ADR-0006](0006-acesso-a-dados.md) (acesso a dados), [ADR-0014](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md).
