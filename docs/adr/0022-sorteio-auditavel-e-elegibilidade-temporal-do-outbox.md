# 0022. Sorteio auditável em três consumidores e elegibilidade temporal do outbox

- Date: 2026-10-28
- Status: Accepted
- Deciders: Luxtory (fundador), Engenharia
- Tags: ownership, platform, outbox, security, randomness

## Context

`formalize_acquisition` (W8) agenda o sorteio da ordem inicial de toda Second Home Co-Owner com o evento
`ownership.initial_draw_scheduled`, sem consumidor (ADR-0021). O TECH-093 exige compromisso `SHA-256(seed)` e rodada
futura publicados antes do beacon, `fy-v1` com HMAC-SHA256 e rejection sampling, e evidência de participantes, insumo
de aleatoriedade e resultado (PD-011). A tabela de commands do TECH-051 é fechada e a lista de jobs do TECH-090
também: a conclusão do sorteio cabe a consumidores do outbox. O plano aprovado em 2026-10-28 (D1–D5) fixou as escolhas
abaixo. O `03` não define a codificação da mensagem do HMAC, o escopo do contador, o sentido do Fisher-Yates nem qual
valor do beacon entra na chave; estas são escolhas de implementação, sem nova regra de negócio.

Restrições verificadas no código: uma exceção de consumidor incrementa `attempts` e registra erro; a seleção ordenava
por `occurred_at`, então um evento ainda não devido ocuparia o lote e produziria erro a cada varredura; uma falha no
COMMIT da transação do evento escapava do savepoint do consumidor e interrompia a varredura sem registrar a tentativa; o
consumidor roda dentro da transação que trava a linha do evento; o único disparo periódico é o job diário `outbox`.

## Decision

1. **Três consumidores, três transações.** `ownership_initial_draw_commit` congela as N Ações (ordem de
   `allocation_position`), gera a seed por CSPRNG, grava compromisso, rodada alvo e prazo de commit e enfileira
   `ownership.initial_draw_committed` elegível só depois da rodada; `ownership_initial_draw_reveal` verifica a rodada,
   aplica `fy-v1` e enfileira `ownership.initial_draw_completed`; `ownership_initial_draw_notification` registra a
   notificação REQ-097. Tudo referencia o `operation_id` da formalização (TECH-002) e é auditado com o papel `system`.
   Um sorteio por aquisição; não existe novo sorteio.
2. **`fy-v1`** conforme spec ownership §16.2: `K = SHA-256(seed ‖ randomness)`; Fisher-Yates de `n−1` até `1`;
   `U(K,i,m)` com `HMAC-SHA256(K, u32be(i) ‖ u32be(c))`, contador por posição a partir de 0, inteiro big-endian e
   rejeição de `x ≥ 2²⁵⁶ − (2²⁵⁶ mod m)`. Vetor fixo de uma implementação independente.
3. **Beacon drand quicknet com a biblioteca aprovada.** `drand-client` 1.4.2 (ADR-0004) por `fetchBeacon` com um
   `ChainClient` próprio: `ChainInfo` fixado no código e `fetch` nativo com orçamento total. A verificação oficial
   (`verifyBeacon`, não exportada) confere rodada, `randomness = SHA-256(assinatura)` e assinatura BLS no G1 com o DST do
   RFC 9380; o adaptador confere rodada igual a `R`, tamanhos e constantes. Integração criptográfica própria rejeitada:
   o risco crítico é aceitar assinatura falsa, e a vantagem (menos pacotes) não é material com `npm audit` limpo.
4. **Anterioridade imposta pelo banco.** `commit_deadline` = relógio do banco + `DRAW_TRANSACTION_TIMEOUT_MS`, com o
   mesmo `transaction_timeout` armado na transação; `t(R) ≥ commit_deadline + DRAW_BEACON_LEAD_SECONDS`. Constraints e
   um gatilho diferido no COMMIT efetivo recusam o compromisso se `clock_timestamp() > commit_deadline`. O
   `transaction_timeout` libera conexão e locks; não é a prova, porque o código poderia desarmá-lo.
5. **Elegibilidade temporal e progresso do outbox (platform).** `app.outbox.available_at` (nulo = imediato), filtrado
   no SQL antes de ORDER/LIMIT/locks, como o filtro de tipos do ADR-0021; ordem de seleção `attempts, occurred_at, id`;
   falha no COMMIT da transação de um evento registrada em transação própria, com a varredura continuando. Seams
   `enqueueOutboxEvent` e `recordSystemAudit` para consumidores. Commands, executor, recibos, deduplicação e job
   `outbox` não mudam.
6. **Beacon fora da transação de domínio.** A chamada ocorre na transação do evento, sem lock de domínio; o orçamento
   `DRAW_BEACON_TIMEOUT_MS` (menor que o `transaction_timeout`) inclui todos os relays e a verificação. Após uma falha,
   novas obtenções falham sem rede pelo mesmo orçamento.
7. **Evidência sob RLS.** O Titular da Second Home vê Ações por identificador não pessoal, a sua destacada, e a seed só
   após a revelação; nunca outras pessoas ou empresas, `operation_id` ou eventos (D1). O Admin lê com auditoria.
8. **Runbook sem default** (TECH-001): as três variáveis `DRAW_*` são lidas só ao processar um evento; ausentes ou
   inválidas deixam o evento pendente sem efeito. Não são criadas em Production nesta Wave.

## Consequences

### Positive

- Nenhum resultado parcial: falhas desfazem o savepoint ou a transação, e a revelação é determinística.
- Evento futuro não ocupa lote nem gera erro; falha recorrente não bloqueia eventos independentes; falha no COMMIT não
  interrompe a varredura.
- Qualquer pessoa reproduz o resultado com a evidência publicada e a chave pública da drand.

### Negative

- A anterioridade do compromisso depende do banco controlado pela Luxtory até o selo e a ancoragem da W30; um
  superusuário pode contornar gatilhos (D5).
- A revelação depende de um disparo do outbox depois da rodada (cron diário ou `after()` de outro command).
- Quicknet descontinuado deixa o sorteio pendente; trocar de beacon depois do compromisso quebraria a verificação.
- A biblioteca escreve `console.error` genérico em falha de verificação (sem PII).

## Alternatives considered

- Exceção tipada de adiamento no dispatcher: o evento continuaria selecionado e ocupando lote a cada varredura.
- Job novo para a revelação: a lista do TECH-090 é fechada.
- Gerar o compromisso dentro de `formalize_acquisition`: altera um command fechado na W8.
- Buscar o beacon fora da transação do evento: exigiria redesenhar o dispatcher sem ganho, pois nenhum lock de domínio é
  mantido.
- Aleatoriedade falsa nos testes de banco: aceitaria uma chain não real; os testes usam rodadas reais gravadas.

## References

- `docs/specs/canonical/03-technical-spec.md`: TECH-001, TECH-002, TECH-051, TECH-090–TECH-093, TECH-110
- `docs/specs/canonical/02-product-spec.md`: PD-011, REQ-032, REQ-097
- [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md), [ADR-0006](0006-acesso-a-dados.md),
  [ADR-0021](0021-formalizacao-calendario-civil-e-outbox.md)
- Spec [`ownership` §16](../specs/ownership.md#16-w9--sorteio-auditável-da-ordem-inicial),
  [`platform`](../specs/platform.md), [referência de verificação](../reference/sorteio-inicial.md)
