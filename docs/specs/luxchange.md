# Spec: luxchange

> Módulo `luxchange` (TECH-011). W20: depósito de capacidade (`deposit_capacity`). Request, aceite e Direct chegam nas
> W21–W23. Canônicos: `01` v10.8 (BR-146, BR-151, BR-160–BR-171, BR-180–BR-203), `02` v4.6 (REQ-051, REQ-060, REQ-052,
> REQ-053, REQ-096–REQ-098, REQ-100, INV-2, INV-3, INV-6), `03` v3.19 (TECH-022, TECH-023, TECH-025, TECH-031, TECH-033,
> TECH-043, TECH-051–TECH-054, TECH-056, TECH-070, TECH-091; `03` §12 CONC-10). Decisão:
> [ADR-0036](../adr/0036-deposito-luxchange-cessao-snapshot-por-noite-e-k6.md). Plano:
> [`w20-luxchange-deposito.md`](../plan/w20-luxchange-deposito.md). STRIDE:
> [`luxchange.md`](../security/threats/luxchange.md). O texto canônico prevalece; aqui só o contrato de implementação.

## 1. Goal

O Titular converte capacidade elegível da sua Second Home em Créditos Luxchange, e a capacidade entra no Inventário
Luxtory no mesmo resultado (REQ-060, BR-202): Créditos = Σ PRL das noites cedidas × multiplicador publicado (`01` §20,
BR-201), com validade e procedência rastreáveis (REQ-053).

## 2. Non-goals

Request e Garantia (W21), aceite (W22), Direct (W23), Luxplus, locação, Fee (o depósito não cobra Fee), retirada do
depósito (BR-171: vinculante depois da originação; nenhuma restituição automática), cessão de parte de uma reserva de
uso próprio (ADR-0036 §2), imóveis fora do modelo de Second Home.

## 3. Users / actors

- **Titular Owner** — deposita noites próprias livres (custódia `owner`, sem ocupação ativa).
- **Titular Co-Owner** — deposita reservas de uso próprio confirmadas da sua holding (custódia `use_right/reserved_right`
  da Ação), inteiras.
- O mesmo usuário pode representar parties diferentes e ser Owner numa Second Home e Co-Owner noutra; o depósito é por
  holding vigente da party representada.

## 4. User stories

- Como Owner, escolho noites livres (consecutivas ou não) com ao menos 14 dias de antecedência, vejo os Créditos por
  noite e o total, revejo as consequências e confirmo; as noites entram no Inventário Luxtory e recebo o lote de Créditos.
- Como Co-Owner, vejo as "Datas do seu Direito de Uso" (minhas reservas confirmadas), escolho uma ou mais reservas
  inteiras e confirmo; a reserva é encerrada por cessão, o dia segue consumido do meu Direito de Uso e recebo os Créditos.
- Como Titular sem Membership elegível, vejo por que não posso depositar (o uso próprio continua disponível).

## 5. Contracts

### 5.1 Banco (migration `luxchange_deposit`)

- **K6** `luxchange_deposit` no CHECK de `app.capability_activation`, sem linha. Depósito exige K6 (cessão) e K4 (lote).
- **`app.economic_snapshot_night`** `(operation_id, second_home_id, stay_date, prl_id)`, PK `(operation_id, stay_date)`,
  FK para `app.economic_snapshot`, `app.second_home_date` e `app.prl`; só-inserção; versão do PRL = a vigente no
  `resolved_at` (`app.prl_at`), mesma Second Home em todas as noites da operação.
- **Transição `cession`** (ADR-0036 §1): `confirmed → cancelled`, só `deposit_capacity`, Co-Owner, todas as noites não
  iniciadas, antecedência de 14 dias, Membership `active`, representação da holding da reserva, noites no snapshot.
- **Escritas do depósito** (`app.luxchange_deposit_write`; ADR-0036 §3): fechamento de `owner`/`reserved_right`,
  abertura de `luxtory/inventory/luxchange_cession` com `authorization_ref = 'deposit_capacity:<op>'`, liberação `ceded`.
- **Lote**: na originação de `deposit_capacity`, `quantidade × 100 = Σ amount_minor × multiplicador` do snapshot.
- **Completude no COMMIT** (`app.assert_luxchange_deposit_complete`) e `app.luxchange_invariant_breaches()`.
- Recusas nomeadas → códigos (TECH-056): `deposit_min_notice` → `ERR_MIN_NOTICE`; `custody_*` →
  `ERR_CAPACITY_UNAVAILABLE`; `permission_representation` → `ERR_PERMISSION`; `credit_membership_ineligible` →
  `ERR_MEMBERSHIP_INELIGIBLE`; `conflict_booking_transition_stale` → `ERR_STATE_TRANSITION`; `luxchange_deposit_*`,
  `credit_lot_deposit_*`, `economic_snapshot_night_*` → falha técnica (só por bug ou forja).

### 5.2 Aplicação (`src/features/luxchange`)

- `domain/deposit.ts`: elegibilidade por noite (Owner/Co-Owner), cessão integral por reserva, antecedência
  (`checkin_at − 336 h`), soma exata de Créditos (texto decimal, sem `Number`).
- `application/deposit-capacity.ts`: handler do executor (TECH-054) — K4/K6 → Membership (classe 3) → representação →
  Ação (4) → noites (5) → reservas → termos econômicos (`parameter`, `prl`; instante único) → comparação com os termos
  revisados → originação (snapshot + lote) → transições `cession` → liberações `ceded` → custódias → outbox → auditoria.
- Portas públicas: `pricing.resolveEconomicTerms` com `nights` (conjunto explícito) e snapshot por noite;
  `inventory.createLuxchangeCessionInventory()`; `booking.createOwnUseCessionPort()`;
  `credits.readAvailableCredits()`.

### 5.3 Command e API

`POST /v1/luxchange/deposits` (OpenAPI `depositCapacity`, tag `luxchange`) e a Server Action da tela usam o mesmo
handler. Sessão do Titular (cookie), mesma origem, `Idempotency-Key`. Corpo:

```json
{ "party_id": "uuid", "second_home_id": "uuid", "nights": ["2027-03-01", "2027-03-04"],
  "expected_credits": "12500", "expected_validity_months": 24 }
```

`nights`: 1–366 datas civis distintas, em ordem crescente. Resposta 201: `operation_id`, `lot_id`, `second_home_id`,
`nights`, `credits` (decimal em texto), `originated_at`, `expires_at`, `ceded_bookings`. Recusas: `ERR_PERMISSION`,
`ERR_MEMBERSHIP_INELIGIBLE`, `ERR_CAPACITY_UNAVAILABLE`, `ERR_MIN_NOTICE`, `ERR_PRL_MISSING`, `ERR_PARAMETER_MISSING`,
`ERR_STATE_TRANSITION`, `ERR_DEPOSIT_TERMS_CHANGED`, `ERR_IDEMPOTENCY_CONFLICT`, `ERR_VALIDATION`. K4/K6 ausentes:
funcionalidade fechada (503 `ERR_UNAVAILABLE`, nada gravado).

### 5.4 Jornada (`/titular/luxchange/deposito`)

1. **Second Home** — holdings vigentes das parties representadas (Owner e Co-Owner), com o vínculo explícito.
2. **Datas** — calendário do DS (1 mês no celular, 2 quando cabem; foco itinerante; alvos ≥ 44 × 48 px) com Créditos por
   noite elegível, temporada, seleção inequívoca e o motivo de cada indisponibilidade (antecedência, já depositada,
   reservada para uso próprio — Owner precisa cancelar antes —, não reservada — Co-Owner reserva antes —, sem referência
   econômica publicada, indisponível). Co-Owner: título "Datas do seu Direito de Uso"; tocar uma noite seleciona a
   reserva inteira.
3. **Resumo** — datas, noites, Créditos a receber, saldo atual da Carteira (zero real quando não há lote), saldo potencial
   (informativo) e validade dos novos Créditos.
4. **Revisão e confirmação** — prévia do servidor; consequências (as datas deixam de estar disponíveis para uso
   incompatível; no Co-Owner, o dia segue consumido do Direito de Uso; a cessão é vinculante depois da originação);
   confirmação explícita.
5. **Resultado** (`/titular/luxchange/deposito/[operationId]`) — lido do banco: datas cedidas, Créditos originados,
   validade, referência da operação e acesso à Carteira.

Nunca PRL em reais (REQ-100). Termos internos (`reserved_right`, custódia, snapshot) não aparecem.

### 5.5 Evento e notificação

`luxchange.credits_originated` (AsyncAPI), `dedup_key = luxchange.credits_originated:<lot_id>`, payload só com ids,
datas, contagem e quantidade. Consumidor `luxchange_deposit_notification` grava a notificação
`luxchange.deposit_completed` para a party (idempotente por evento/destinatário/tipo). Recusa ou rollback não emitem.

## 6. Acceptance criteria

- [ ] `[REQ-060]` lote e custódias `luxchange_cession` no mesmo commit; sem lote não há cessão e vice-versa.
- [ ] `[REQ-060]` Co-Owner: Direito de Uso continua consumido (nenhum `restore`/`correction`; saldo igual).
- [ ] `[REQ-051]` sem Membership elegível → `ERR_MEMBERSHIP_INELIGIBLE`, nada gravado; uso próprio segue sem Membership.
- [ ] `[REQ-051][BR-151]` Owner só `owner` livre; Co-Owner só `reserved_right` da própria reserva confirmada, inteira.
- [ ] `[BR-201]` Créditos = Σ PRL × multiplicador publicado, exatos; quantidade divergente recusada pelo banco.
- [ ] `[TECH-043]` antecedência de 14 dias pelo relógio do banco.
- [ ] `[CONC-10]` depósito × cancelamento: exatamente um vence; estado íntegro.
- [ ] `[TECH-025]` replay sem duplicidade; mesma chave com outro payload → `ERR_IDEMPOTENCY_CONFLICT`.
- [ ] `[REQ-052]` snapshot com a versão de PRL de cada noite e as versões de multiplicador e validade.
- [ ] `[REQ-097]` uma notificação por depósito; nenhuma em recusa.

## 7. Edge cases

- Noite sem PRL no conjunto → `ERR_PRL_MISSING`; noite intermediária (não pedida) sem PRL não importa.
- Multiplicador ou validade ausentes → `ERR_PARAMETER_MISSING`.
- PRL, multiplicador ou validade publicados entre a revisão e a confirmação → `ERR_DEPOSIT_TERMS_CHANGED`.
- Reserva Co-Owner em exceção, em uso ou já encerrada → `ERR_STATE_TRANSITION`/`ERR_CAPACITY_UNAVAILABLE`.
- Noite de outra Second Home, de outra holding ou já depositada → `ERR_CAPACITY_UNAVAILABLE`.
- Owner com reserva de uso próprio na noite → `ERR_CAPACITY_UNAVAILABLE` (cancelar antes, TECH-023).
- 29/02 do Co-Owner contemplado: depositável se reservado (consumo `leap` mantido).

## 8. Security considerations

STRIDE em [`docs/security/threats/luxchange.md`](../security/threats/luxchange.md). Autorização no guard, no handler e no
banco; RLS na leitura; K4 e K6 fechadas em Production.

## 9. Observability

Logs estruturados do executor (`command`, `operation_id`, `code`); auditoria do depósito sem dado pessoal (ids, noites,
quantidade, versões); evento de outbox; invariantes consultáveis (`app.luxchange_invariant_breaches()`).

## 10. Rollout plan

Migration aplicada pelo pipeline com K6 sem linha; ativação = migration própria + autorização do fundador, depois de D2,
PRL e parâmetros publicados por autorização operacional.

## 11. Open questions

Nenhuma bloqueante. Encerramento de Requests pendentes pelo depósito é da W21 (TECH-024).

## 12. References

`02` §15 e `03` §12 (CONC-10); ADR-0024, ADR-0026, ADR-0027, ADR-0031, ADR-0032, ADR-0033, ADR-0036.
