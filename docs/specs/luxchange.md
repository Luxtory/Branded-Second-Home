# Spec: luxchange

> Módulo `luxchange` (TECH-011). W20: depósito de capacidade (`deposit_capacity`). Request, aceite e Direct chegam nas
> W21–W23. Canônicos: `01` v10.8 (BR-146, BR-151, BR-160–BR-171, BR-180–BR-203), `02` v4.6 (REQ-051, REQ-060, REQ-052,
> REQ-053, REQ-096–REQ-098, REQ-100, INV-2, INV-3, INV-6), `03` v3.19 (TECH-022, TECH-023, TECH-025, TECH-031, TECH-033,
> TECH-043, TECH-051–TECH-054, TECH-056, TECH-070, TECH-091; `03` §12 CONC-10). Decisão:
> [ADR-0036](../adr/0036-deposito-luxchange-cessao-snapshot-por-noite-e-k6.md). Plano:
> [`w20-luxchange-deposito.md`](../plan/w20-luxchange-deposito.md). STRIDE:
> [`luxchange.md`](../security/threats/luxchange.md). O texto canônico prevalece; aqui só o contrato de implementação.
>
> **W21 (§13):** envio de Request, complemento por datas e encerramentos pré-aceite — `01` v10.9, `02` v4.7 (REQ-062,
> PD-005, PD-007, PD-012), `03` v3.20 (TECH-024, TECH-031, TECH-043, TECH-044, TECH-061, TECH-071–TECH-073, TECH-082,
> TECH-090). Decisão: [ADR-0037](../adr/0037-request-lastro-complemento-por-datas-e-encerramentos.md). Plano:
> [`w21-luxchange-request-envio.md`](../plan/w21-luxchange-request-envio.md). Aceite e recusa: W22; Direct: W23.

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

- **K6** `luxchange_deposit` e **K7** `luxchange_exchange` no CHECK de `app.capability_activation`, sem linha. Depósito
  exige K6 (cessão) e K4 (lote). K7 fecha os movimentos de Créditos de Request e Direct (originação no aceite,
  Garantia, consumo, liberação) até o lastro das W21–W23: ativar a K4 para o depósito não abre o intercâmbio.
- **Mesma transação:** toda escrita do depósito e toda noite do snapshot exigem o snapshot inserido pela transação
  corrente — identidade pelo `xmin` do snapshot, não por tempo (`economic_snapshot_night_transaction`,
  `luxchange_deposit_transaction`; ADR-0036 §3).
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
2. **Datas** — calendário do DS, **um mês por vez em todas as larguras** (os Créditos exatos de cada noite precisam caber
   legíveis na célula; dois meses lado a lado os truncariam), com "Próximo/Anterior" e **ir direto a mês e exercício**
   (seletores nativos rotulados, como no calendário do PRL da W16); foco itinerante; alvos ≥ 44 × 48 px. Por noite
   elegível: Créditos, **temporada de apresentação da W16** (Super Alta — janela de Carnaval —, Alta, Média/Baixa;
   ADR-0032 §11, só leitura: o grupo canônico continua governando direitos), seleção inequívoca e o motivo de cada
   indisponibilidade (antecedência, já depositada, reservada para uso próprio — Owner precisa cancelar antes —, não
   reservada — Co-Owner reserva antes —, sem referência econômica publicada, indisponível). Co-Owner: título "Datas do
   seu Direito de Uso"; tocar uma noite seleciona a reserva inteira, com todas as suas noites (a dica não sugere
   cancelar nem refazer reservas).
   **Antecedência mínima (BR-200, TECH-043 — 336 horas antes do check-in oficial):** objetivo comercial da Luxtory de
   ter janela para ofertar as noites depositadas. Só é selecionável a noite com check-in a pelo menos 336 h do instante
   atual (no limite exato, permitida; 335h59 bloqueada); as demais ficam bloqueadas ao toque, ao teclado e a qualquer
   outro meio, com o motivo acessível "Esta data exige pelo menos 14 dias de antecedência para depósito." O calendário
   aberto reaplica a regra com o passar do tempo (relógio ancorado no instante do banco da leitura, reavaliado no
   próximo prazo, ao voltar à aba e a cada minuto): a noite que passa do prazo sai da seleção — e a revisão volta ao
   resumo — com aviso. Co-Owner: a reserva só é selecionável se todas as noites cumprem o prazo. O command e o banco
   revalidam com o relógio do banco (`app.luxchange_deposit_notice_met(checkin_at, clock_timestamp())`), inclusive
   contra chamadas diretas à API e concorrência.
3. **Resumo** — datas, noites, "Créditos a receber", "Saldo atual" (zero real quando não há lote), "Saldo potencial após
   o depósito" (informativo) e validade dos novos Créditos.
4. **Revisão e confirmação** — prévia do servidor: Second Home, vínculo (Owner ou Co-Owner), cada data com os seus
   Créditos, total, saldos e validade; consequências (as datas deixam de estar disponíveis para uso incompatível; no
   Co-Owner, o dia segue consumido do Direito de Uso; a cessão é vinculante depois da originação); confirmação explícita.
   Termos alterados entre a revisão e a confirmação: recusa com aviso e "Revisar valores atualizados" (um único aviso
   por vez).
5. **Resultado** (`/titular/luxchange/deposito/[operationId]`) — lido do banco: datas cedidas, Créditos originados,
   validade, referência da operação e acesso à Carteira.

Nunca PRL em reais (REQ-100). Termos internos (`reserved_right`, custódia, snapshot) não aparecem.

**Reserva cedida** (W13 × W20): no Titular e no Admin, a reserva encerrada pela transição `cession` aparece como
**"Cedida ao Luxchange"** — nunca "Cancelada" —; o detalhe do Titular mostra a seção "Cessão ao Luxchange" (instante,
noites cedidas, o Direito de Uso segue consumido) com link para o resultado do depósito; o histórico do Admin mostra
"Confirmada → Cedida ao Luxchange".

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
- PRL, multiplicador ou validade publicados entre a revisão e a confirmação que mudem os **Créditos de qualquer data, o
  total ou a validade** apresentados → `ERR_DEPOSIT_TERMS_CHANGED` (alterações que se compensam entre noites também);
  versão nova com os mesmos valores confirma, com as versões novas no snapshot (ADR-0036 §8).
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

## 13. W21 — Request: envio, complemento por datas e encerramentos

Contrato de implementação da W21. Regras: `02` v4.7 (PD-005 a PD-007, PD-012, REQ-062 a REQ-064, REQ-096 a REQ-098) e
`03` v3.20 (TECH-073 e associados). Decisões técnicas, banco, chaves e prova de concorrência:
[ADR-0037](../adr/0037-request-lastro-complemento-por-datas-e-encerramentos.md) — não repetidas aqui.

### 13.1 Goal

O membro solicitante envia uma Request para noites contínuas de outro Titular, fora do Inventário Luxtory, com
Créditos em Garantia e, se escolher, datas próprias comprometidas sob a condição do aceite; paga a Taxa de intermediação
antes do envio; acompanha, retira ou vê encerrar a Request sem que a capacidade solicitada seja bloqueada.

### 13.2 Non-goals

Aceite composto e recusa (W22); Direct (W23); envio automático depois de pagamento assíncrono (wave do PSP real);
cancelamento pós-aceite (⛔ P-11); qualquer ativação, PSP real ou valor econômico real.

### 13.3 Actors

- **Membro solicitante** — Titular com holding vigente em qualquer Second Home e Membership elegível; não representa o
  detentor.
- **Membro solicitado** — Titular da capacidade solicitada (Owner: noites livres; Co-Owner: reservas inteiras); na W21
  só é notificado e vê a solicitação recebida, sem ação.
- **Sistema** — job `expire_requests` e consumidor de eventos (encerramentos).

### 13.4 Commands e API

| Command | Rota | Autoridade | Notas |
|---|---|---|---|
| — (pagamento do Fee) | `POST /v1/luxchange/requests/fee-payment` | Titular | refaz a cotação no servidor e chama `initiatePayment` com o Fee cotado; devolve `payment_id`, estado e valor |
| `send_request` | `POST /v1/luxchange/requests` | Titular + Membership | corpo: `party_id`, `second_home_id`, `checkin`, `checkout`, unidades do complemento, `payment_id`, `accepted_policy_id`, `consent_text_version` e os termos revisados (Créditos por noite, `N`, Créditos potenciais por noite, `P`, `G`, Fee, prazo em horas, validade); 201 com `request_id`, `sent_at`, `expires_at`, `N`, `G`, `P`, `C`, `E` |
| `withdraw_request` | `POST /v1/luxchange/requests/{id}/withdraw` | requester | `cancelled_pre_accept` (`withdrawn`) ou `expired` se vencida |
| `expire_requests`, `close_ineligible_request` | job `POST /api/jobs/expire_requests` | system | materialização idempotente por Request |

Todas com `Idempotency-Key`, mesma origem e OpenAPI antes do handler. Recusas: `ERR_PERMISSION`,
`ERR_MEMBERSHIP_INELIGIBLE`, `ERR_CAPACITY_UNAVAILABLE`, `ERR_MIN_NOTICE`, `ERR_CREDITS_INSUFFICIENT`,
`ERR_CREDIT_HOLD_INVALID`, `ERR_PAYMENT_FAILED`, `ERR_POLICY_MISSING`, `ERR_PRL_MISSING`, `ERR_PARAMETER_MISSING`,
`ERR_REQUEST_TERMS_CHANGED` (novo), `ERR_STATE_TRANSITION`, `ERR_IDEMPOTENCY_CONFLICT`, `ERR_VALIDATION`. Chave fechada:
503 `ERR_UNAVAILABLE`, nada gravado.

### 13.5 Jornada (`/titular/luxchange/solicitacoes*`)

1. **Second Home** com capacidade solicitável (catálogo; "a partir de N Créditos por noite"; só com Membership elegível).
2. **Datas** — calendário do Design System, um mês por vez, "Solicitável"/"Indisponível"/"Passada", sem motivo nem
   identidade; período contínuo; detentor Co-Owner por reserva inteira.
3. **Como cobrir os Créditos necessários** — Créditos necessários; datas próprias a comprometer (opcional; calendário do
   depósito, só datas com 336 h cumpridas no prazo de resposta; Co-Owner por reserva inteira) com Créditos potenciais por
   data e total; Créditos da Carteira que ficarão em Garantia (calculados, FEFO); total coberto; excedente; Créditos que
   continuam disponíveis, com a validade.
4. **Revisão e aceites** — os itens do PD-012 item 4, a Taxa de intermediação (só o total, em R$), o prazo ("24 horas a
   partir do envio"), a política e dois aceites separados (política; complemento). Datas aparecem como **a comprometer**.
5. **Pagamento e envio** — pagamento aprovado → envio; pendente → "Pagamento em processamento"; recusa → "Revisar valores
   atualizados" e "Pagamento sem solicitação enviada — devolução em processamento".
6. **Resultado** — prazo exato, Créditos em Garantia, datas comprometidas, Taxa paga.
7. **Minhas solicitações** — lista e detalhe com histórico, estados financeiros (ADR-0037 §11) e **Retirar**;
   **Recebidas** só leitura (datas, Second Home, prazo).
8. **Telas existentes** — reserva, cancelamento e depósito mostram a data comprometida e orientam a retirar a
   solicitação; a Carteira mostra "datas comprometidas com solicitação pendente (Créditos potenciais, não utilizáveis)".

Nunca PRL em reais; Créditos potenciais nunca como saldo; textos pela camada de i18n, com versão do texto do
consentimento.

### 13.6 Eventos e notificações

`luxchange.request_sent` e `luxchange.request_closed` (AsyncAPI; ids, datas, quantidades, motivo; sem PII). Solicitante:
enviada (Garantia, datas comprometidas, Taxa paga) e encerrada (motivo, Garantia liberada, datas liberadas, devolução da
Taxa). Solicitado: recebida e encerrada. Notificação não cria direito nem prazo (REQ-097).

### 13.7 Acceptance criteria

Os do [plano da W21](../plan/w21-luxchange-request-envio.md#critérios-de-aceite-da-w21), com as tags `[REQ-062]`,
`[PD-005]`, `[PD-007]`, `[PD-012]`, `[EC-6]`–`[EC-9]`, `[EC-17]`–`[EC-21]` e `[CONC-13]`–`[CONC-18]` nos títulos dos
testes; preservação das W12–W20 (inclusive `luxchange-deposit.db.test.ts`) e invariantes vazias após todo teste `db`.

### 13.8 Edge cases

`02` §15 itens 6–9 e 17–21; Request cujo check-in chega antes do prazo (encerra por período iniciado); Garantia com lote
que vence entre o envio e o encerramento (liberado como `expired`); unidades de mais de uma holding do solicitante;
29/02 reservado pelo Co-Owner contemplado como unidade do complemento (elegível como no depósito).

### 13.9 Rollout

Migration aplicada pelo pipeline com K4–K7 sem linha; nada enviável em Production. Ativação só depois da W22, de D2, do
PSP com validação confiável, de parâmetros (`credit_multiplier`, `credit_validity_months`, `luxchange_fee_rate`,
`luxchange_fee_minimum`, `request_deadline_hours`) e política `luxchange_request` publicados, por migration e autorização
do fundador.

### 13.10 Aplicação (E2) — contratos implementados

Slice `src/features/luxchange` (ADR-0037; decisões técnicas não repetidas aqui):

- **Domínio** (`domain/request.ts`, puro): capacidade solicitada (Owner livre, Co-Owner por reserva confirmada inteira,
  noites futuras, sem compromisso efetivo), unidades do complemento (como no depósito, com 336 h cumpridas no prazo de
  resposta), composição `N`, `P`, `G`, `C`, `E` com a regra de seleção, e o documento de termos do consentimento no formato
  que o banco recompõe (`app.luxchange_request_terms`).
- **`send_request`** (`application/send-request.ts`; registro TECH-051 `titular` + Membership; escopo do guard `party`):
  entrada `party_id`, `second_home_id`, `checkin`, `checkout`, `complement[]` (`owner_night` com `second_home_id` e
  `stay_date`; `co_owner_booking` com `booking_id`), `payment_id`, `accepted_policy_id`, `consent_text_version` e
  `expected` (Créditos por noite, `credits_required`, Créditos potenciais por noite do complemento, `complement_credits`,
  `guarantee_credits`, `fee_amount_minor`, `deadline_hours`, `credit_validity_months`); resultado com `request_id`,
  `sent_at`, `expires_at`, `N`, `G`, `P`, `C`, `E`, Taxa, `fee_charge_id` e, no reenvio que materializa encerramentos
  (EC-21), `materialized[]` e `refund_ids[]`. Garantia pelo `holdCredits` (FEFO, cobertura até `expires_at`); no reenvio,
  `holdCreditsReleasing`.
- **Prévia** (`quoteRequest`; ADR-0037 §3 item 1): as mesmas regras sem travas nem escrita, com a política vigente; devolve os valores no
  formato de `expected`.
- **Fluxo** (`application/request-flow.ts`): `payRequestFee` refaz a prévia e cobra a Taxa da prévia (`initiatePayment`,
  chave da revisão); `submitRequest` executa o envio e, recusado ou com falha depois de pagamento aprovado **da própria
  party**, dispara `reconcilePayment` (estorno imediato); confirmado, processa os estornos do reenvio.
- **`withdraw_request`** (autoridade `requester`: delegação vigente da party que age, escopo `party`; sem Membership;
  entrada `party_id`, `request_id`): Request de outra party ou inexistente → `ERR_NOT_FOUND`; encerrada →
  `ERR_STATE_TRANSITION`. **`expire_requests`/`close_ineligible_request`** (sistema, job `expire_requests`; entrada
  `request_id`): só com o motivo correspondente. Resultado comum: `state`, `reason` (decididos pelo banco),
  `guarantee_released`, `refund_id` (processado depois do commit).
- **Job `expire_requests`** (cron diário no `vercel.json` e disparo manual): uma transação por Request, chave
  `<command>:<request_id>`; contagens `due`, `expired`, `closed_ineligible`, `skipped`, `failed`, `deferred`.
- **Eventos** `luxchange.request_sent` e `luxchange.request_closed` (AsyncAPI) e **notificações**
  `luxchange.request_sent` e `luxchange.request_closed` (solicitante; o encerramento traz motivo e Garantia liberada),
  `luxchange.request_received` e `luxchange.request_received_closed` (solicitado; Second Home, datas, prazo e estado —
  nunca motivo, party do solicitante, Créditos ou complemento).
- **Erros**: `ERR_REQUEST_TERMS_CHANGED` (produto, 409); recusas do banco mapeadas (antecedência do complemento →
  `ERR_MIN_NOTICE`; compromisso efetivo, unidade já comprometida, capacidade, período iniciado →
  `ERR_CAPACITY_UNAVAILABLE`; detentor inelegível → `ERR_MEMBERSHIP_INELIGIBLE`; autonegociação e encerramento por outra
  party → `ERR_PERMISSION`; Garantia sem lastro → `ERR_CREDIT_HOLD_INVALID`; Request ainda aceitável →
  `ERR_STATE_TRANSITION`); as demais constraints da Request só falham por bug ou forja (falha técnica).

Fica para a E3: rotas `/v1/luxchange/requests*` (OpenAPI antes do handler), telas, texto das notificações na central
(hoje caem no aviso genérico), E2E 390/1440 e o seed do E2E da Carteira com a Request completa (hoje grava Garantia sem
Request, com gatilhos desligados).
