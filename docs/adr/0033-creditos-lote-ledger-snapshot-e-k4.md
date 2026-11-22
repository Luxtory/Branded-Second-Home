# 0033. Créditos: lote + ledger com buckets escritos pelo banco, snapshot persistido na originação e K4

- **Date**: 2026-11-22
- **Status**: Accepted (W17 iniciada pelo fundador em 2026-11-22; PR draft)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, credits, pricing, W17

## Context

A W17 entrega REQ-053, REQ-054, PD-008 e INV-6 (`02` v4.6) com ADR-007, TECH-025, TECH-044, TECH-070, TECH-071,
TECH-072 e TECH-090 (`03` v3.18). Fatos que moldam a decisão:

- ADR-007 fixa `credit_lot(party_id, quantity, held, consumed, expired, available GENERATED, originated_at, expires_at,
  origin_operation_id)` com party imutável e buckets nunca negativos, e `credit_entry` append-only; TECH-025 fixa
  `UNIQUE(origin_operation_id, party_id)`; TECH-052 proíbe UPDATE/DELETE funcional em ledgers e snapshots.
- TECH-070 fecha os movimentos; o `03` §7 diz quem origina Créditos: depósito (`luxchange_cession` → Créditos ao
  cedente) e aceite de Request ("Créditos cedente"); Direct e Luxplus não originam.
- TECH-044: validade por adição calendárica em UTC; uso exige `now < expires_at` independentemente de job; `expires_at`
  nunca é prorrogado. BR-193–196 e TECH-072: Membership não altera lote nem validade, só impede o uso.
- Nenhum command que gaste ou origine Créditos existe antes da W20 (`deposit_capacity`), W21 (`send_request`), W22
  (`accept_request`) e W23 (`create_direct`); `reverse_credit` (Admin) e o job `expire_credit_lots` já constam do
  registro.
- ADR-0032 §8 (D3 da W16): o snapshot persistente nasce com o primeiro efeito econômico, na mesma transação, com FK para
  versões imutáveis. A originação é o primeiro efeito econômico da W17 que usa um valor versionado (validade).
- Precedentes: K1/K2/K3 (`app.capability_activation`) fecham mecanismos de estado crítico até autorização do fundador;
  gatilhos de procedência exigem a operação `pending` da transação (W10+); consultas de invariantes rodam após todo
  teste `db` (W10).

## Decision

1. **Lote e ledger conforme ADR-007; buckets escritos pelo banco.** `app.credit_lot` tem os campos do ADR-007 mais
   `origin_command` (o command da operação de origem, gravado pelo banco, legível pelo Titular) e `available` gerado.
   `app.credit_entry` registra `(lot_id, operation_id, command, movement, from_bucket, to_bucket, quantity,
   parent_entry_id, basis, created_at)`. O servidor só insere movimentos; o gatilho `BEFORE INSERT` trava o lote, valida
   e atualiza os buckets na mesma instrução. O papel da aplicação não tem UPDATE nem DELETE em nenhuma das duas tabelas;
   um gatilho recusa UPDATE em colunas imutáveis do lote e todo UPDATE/DELETE do ledger, inclusive pelo dono.
2. **Movimentos do TECH-070, fechados no banco.** Pares e commands permitidos:

   | Movimento | Par | Commands | Regras do instante (relógio do banco) |
   |---|---|---|---|
   | `originate` | `external → available` | `deposit_capacity`, `accept_request` | só o gatilho do lote o escreve |
   | `hold` | `available → held` | `send_request` | `now < expires_at`; Membership `active`; quem age representa a party |
   | `release` | `held → available` / `held → expired` | `withdraw_request`, `reject_request` | `available` se `now < expires_at`, senão `expired`; pai = `hold` |
   | `consume` | `held → consumed` | `accept_request` | `now < expires_at`; Membership `active`; pai = `hold` |
   | `consume` | `available → consumed` | `create_direct` | `now < expires_at`; Membership `active`; quem age representa a party |
   | `expire` | `available → expired` | `expire_credit_lots` | `now ≥ expires_at` |
   | `reverse` | `consumed → available` / `consumed → expired` | `reverse_credit` | `available` se `now < expires_at`, senão `expired`; pai = `consume`; Admin revalidado; base registrada |

   Movimento com pai nunca soma mais que o pai menos o que já saiu dele (nenhuma liberação, consumo ou reversão acima
   do reservado ou consumido). A lista de commands é a da TECH-051 para cada fluxo do `03` §7; as waves donas a
   estendem por migration (ex.: expiração de Request na W21, encerramento por inelegibilidade na W21/W22, efeitos de
   política na W18+).
3. **Originação decidida no banco.** A operação precisa estar `pending`, ter command de originação e `acting_party_id`
   igual à party do lote; quem age representa a party no instante. `originated_at` = instante do snapshot da operação;
   `expires_at` = `app.credit_expires_at(originated_at, meses)`, com os meses da versão de `credit_validity_months`
   registrada no snapshot. Retry com a mesma operação viola `UNIQUE(origin_operation_id, party_id)` (TECH-025); retry
   com a mesma chave é replay (ADR-006).
4. **Snapshot persistido (TECH-031).** `app.economic_snapshot(operation_id, resolved_at)` — `resolved_at` é o instante
   devolvido pelo resolvedor `EconomicTerms` (W16), aceito só dentro da transação corrente — e
   `app.economic_snapshot_parameter(operation_id, parameter_key, parameter_id)` com FK para a versão imutável de
   `app.parameter`, que o banco confere ser a vigente em `resolved_at`. O valor é lido pela FK (sem cópia). Sem
   UPDATE/DELETE. As noites de PRL (`economic_snapshot_night`) entram na W20, com o primeiro consumidor de PRL.
5. **Validade no banco, job só materializa.** Uso (Garantia e consumo) exige `clock_timestamp() < expires_at` no gatilho;
   FEFO só enxerga lotes com `expires_at` futuro. O job registra `available → expired` do lote vencido sem tocar em
   `expires_at`: atraso do job não prorroga nada e a Carteira mostra o lote vencido como expirado antes do job.
6. **FEFO e Garantia (PD-008, TECH-071).** Lotes da party com saldo e `expires_at` futuro, `ORDER BY expires_at,
   originated_at, id`, travados `FOR UPDATE` nessa ordem (classe 7 da TECH-053). Na Garantia, só lotes com
   `expires_at ≥` prazo da Request; faltando cobertura com saldo total suficiente → `ERR_CREDIT_HOLD_INVALID`; saldo
   insuficiente → `ERR_CREDITS_INSUFFICIENT`. O vínculo da Garantia com `luxchange_request` no banco nasce na W21.
7. **Membership.** Garantia e consumo verificam a elegibilidade no executor (ADR-0031 §5) e de novo no gatilho, com
   `FOR SHARE` em `app.membership`. Liberação, expiração e reversão não dependem de Membership: o saldo volta, mas
   segue "Indisponível por Membership" até a reativação (REQ-096, `03` §6).
8. **K4 `credits` fechada.** O CHECK de `app.capability_activation` ganha `credits`, sem linha. Sem ela, o papel da
   aplicação não grava lote nem movimento (`credit_capability_not_activated`, falha técnica, não recusa funcional). O snapshot não
   é coberto pela K4 (sem efeito econômico próprio; também servirá à W19). Ativar exige migration e autorização do
   fundador; o rollback é recusado com linha de Créditos.
9. **Carteira por RLS.** O Titular lê lotes e movimentos das parties que representa por delegação vigente, por
   privilégio de coluna (sem `basis`); estados do REQ-096 derivados dos buckets, de `expires_at` e do Membership. Sem
   rota REST nova (leitura server-side, como as telas do Titular desde a W12).
10. **Invariantes após todo teste `db`.** `app.credit_invariant_breaches()`: lote sem exatamente uma originação igual à
    quantidade, buckets diferentes da soma do ledger, movimento-filho acima do pai, party do lote diferente da party
    que age numa originação.

## Consequences

### Positive

- INV-6 garantido pelo PostgreSQL mesmo com servidor comprometido (K4, procedência, pares, saldo por pai, party
  imutável); o ledger é a única porta de escrita.
- TECH-044 e REQ-053 independem do job e do relógio do servidor.
- W20–W23 consomem funções prontas (FEFO, Garantia, liberação, consumo, originação com snapshot) sem nova estrutura.

### Negative

- Até a W20/W22 nenhum lote é originado em Production; a Carteira mostrará o estado vazio.
- A Garantia só fica amarrada à Request no banco na W21.
- Testes de vencimento envelhecem os dados (como superusuário) em vez de adiantar o relógio do banco.

### Neutral / follow-ups

- W18: efeitos de política sobre `credits` estendem a matriz do item 2. W20: noites de PRL e multiplicador no snapshot,
  vínculo com a custódia `luxchange_cession`, notificação de originação. W21: expiração/encerramento de Request
  liberam Garantia. P-7: aviso de expiração próxima.

## Alternatives considered

- **Buckets atualizados pelo servidor + ledger em paralelo.** Duas escritas que podem divergir. Rejeitada.
- **Saldo derivado só do ledger (sem buckets).** Contraria o ADR-007 (buckets e `available` gerado). Rejeitada.
- **Funções `SECURITY DEFINER` por movimento.** Mais superfície; os gatilhos dão a mesma garantia com o padrão já usado
  (W10–W16). Rejeitada.
- **Banco resolvendo a validade sozinho na originação.** O snapshot poderia divergir dos termos que o servidor usou
  (relevante quando a W20 calcular a quantidade com o multiplicador). Rejeitada em favor da conferência.
- **Sem K4.** Nenhum command gasta ou origina antes da W20, mas a escrita direta do papel da aplicação ficaria aberta
  num mecanismo econômico. Rejeitada (precedente K1–K3).
- **Rota REST e tela Admin para `reverse_credit` já na W17.** Superfície sem objeto (nenhum consumo existe). Adiada.
