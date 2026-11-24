# 0037. Request: lastro no banco, complemento por datas sob a condição do aceite, encerramentos e contrato das capabilities

- **Date**: 2026-11-24
- **Status**: Proposed (W21, E0 — pendente de aprovação expressa do fundador; depende de `01` v10.9, `02` v4.7 e `03` v3.20,
  propostos na mesma E0)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, luxchange, credits, billing, inventory, booking, W21, W22

## Context

A W21 entrega REQ-062, PD-005, PD-007 e o envio do PD-012 (`02` v4.7, proposto), com TECH-024, TECH-031, TECH-043,
TECH-044, TECH-061, TECH-071, TECH-072, TECH-073, TECH-082 e TECH-090 (`03` v3.20, proposto); a W22 entrega o aceite e a
recusa sobre o contrato definido aqui. Fatos verificados na `main` (`9a55ffb`, mesma base de banco da W20: 71 migrations
em Production, nenhuma capability ativa):

- W17: Garantia, liberação e consumo indexados pela operação de Garantia (`holdCredits`, `releaseHold`, `consumeHold`).
  O banco não conhece a Request: a cobertura `lot.expires_at ≥ request.expires_at` só existe na aplicação; `release`
  aceita só `withdraw_request`/`reject_request`; o `consume` de `held` aceita qualquer `accept_request`, sem conferir a
  que Request a Garantia pertence (seguro hoje só porque a K7 está fechada).
- W17 `credit_lot_originate()`: exige a party que age e grava `originated_at = economic_snapshot.resolved_at` e
  `expires_at` com os meses de `credit_validity_months` do snapshot **da operação de origem**; `economic_snapshot_write`
  exige `resolved_at` dentro da transação corrente e `economic_snapshot_parameter_write`, a versão vigente nesse instante.
- W19: `fee_charge.prl_total_minor` vem do servidor, sem vínculo com as noites; a reversão já aceita `withdraw_request`,
  `reject_request`, `accept_request` e `expire_requests`; a apuração aceita `accept_request` sem conferir a Request.
- W20: cessão (`cession`, `luxchange_cession`, `parent_custody_id`, `authorization_ref = deposit_capacity:<op>`),
  `economic_snapshot_night` (PK `(operation_id, stay_date)`, uma Second Home por operação), quantidade conferida pelo
  banco, identidade transacional pelo `xmin` do snapshot.
- Capabilities: K4 em todo `credit_entry`; K5 em reversão, estorno, avanço de pagamento e de estorno e inbox; K7 em
  liberação. Desligar qualquer uma depois de existir Request prenderia Garantia, compromissos ou estornos.
- Guard: `authorizeTitular` exige holding na Second Home do command; a autoridade `requester` cai em `DENY`.
- Infra: Vercel Hobby (Cron diário); outbox por `after()` + cron diário; PSP não contratado (P-2).
- Eventos já emitidos que indicam perda de elegibilidade: `OwnUseBookingConfirmed`, `OwnUseBookingCancelled`,
  `OwnUseNoShowDeclared`, `OwnUseExceptionOpened`, `OwnUseExceptionResolved`, `OwnUseBookingInvalidated`,
  `MembershipStateChanged`, `LuxchangeCreditsOriginated`.

## Decision

### 1. Modelo de dados (migration única da W21)

- `app.luxchange_request` — `id`, `operation_id` (único; a operação `send_request`), `requester_party_id`,
  `holder_party_id`, `holder_holding_id`, `second_home_id`, `checkin`, `checkout`, `credits_required` (`N`),
  `guarantee_credits` (`G`), `complement_credits` (`P`), `complement_consumption` (`C`), `complement_excess` (`E`),
  `sent_at`, `expires_at`, `state`, `closure_reason`, `closed_by_operation`, `closed_at`. `state` é projeção escrita só
  pelo gatilho de `app.luxchange_request_transition` (só-inserção: `request_id`, `operation_id`, `from_state`,
  `to_state`, `reason`, `evidence_kind`, `evidence_id`, `created_at`; um único evento terminal por Request).
- `app.luxchange_request_night` — noites solicitadas: `request_id`, `second_home_id`, `stay_date`, `custody_id` (custódia
  do detentor no envio), `booking_id` (Co-Owner). Versões de PRL em `economic_snapshot_night` do envio.
- `app.luxchange_request_complement_unit` — `id`, `request_id`, `kind` (`owner_night` | `co_owner_booking`),
  `holding_id`, `booking_id`, `potential_credits`, `state` (`active` | `consumed` | `released`), `closed_by_operation`;
  `UNIQUE (booking_id) WHERE state = 'active'`.
- `app.luxchange_request_complement_night` — `unit_id`, `request_id`, `second_home_id`, `stay_date`, `custody_id`,
  `prl_id` (vigente no `resolved_at` do envio, conferido por `app.prl_at`), `potential_credits`, `state`;
  `UNIQUE (second_home_id, stay_date) WHERE state = 'active'`. Não reutiliza `economic_snapshot_night`, cuja PK e regra de
  Second Home colidiriam com noites do complemento em outra Second Home ou na mesma data das solicitadas.
- `app.luxchange_request_consent` — `request_id` (PK), `text_version`, `terms` (`jsonb` canônico do que foi exibido),
  `created_at`; só-inserção; o gatilho confere que `terms` traz exatamente `N`, `G`, `P`, `C`, `E`, Fee, prazo em horas,
  `expires_at`, validade e o potencial de cada noite gravados na Request.
- `app.economic_snapshot_policy(operation_id PK, policy_id)` — versão `luxchange_request` aceita, vigente no
  `resolved_at` (obrigação da W18).
- Nenhuma linha existente é alterada; funções das W12–W20 ganham só ramos novos antes dos caminhos atuais.
- A tabela de aceitação (`luxchange_request_acceptance`) e todo ramo de escrita do aceite nascem na W22.

### 2. Composição e FEFO (PD-012, TECH-073)

O solicitante escolhe as unidades; `G = max(0, N − P)`; se `P ≥ N`, `P − min(potencial) < N`; `C = N − G`; `E = P − C`.
A Garantia retira, em ordem `(expires_at, originated_at, id)`, dos lotes com `available > 0`, `now < expires_at` e
`expires_at ≥ request.expires_at`, até `G`. Ficam livres os lotes de vencimento **mais distante** dentre os elegíveis e os
lotes que vencem antes do prazo da Request (nunca elegíveis a esta Garantia). Cada lote vence em
`originated_at + credit_validity_months` da versão registrada na sua originação (TECH-044); por isso empates de
vencimento entre originações diferentes são raros (a soma de meses preserva o dia e a hora; só o ajuste ao último dia do
mês, como 29/02 → 28/02, iguala vencimentos) e, havendo, prevalece a originação mais antiga e depois o id (PD-008).

Exemplo (versão de validade de 24 meses em todos os lotes; envio em 24/11/2026 14:32 UTC; prazo de 24 h;
`expires_at` = 25/11/2026 14:32 UTC; `N = 55.000`, duas noites de 4.500 → `P = 9.000`, `G = 46.000`, `C = 9.000`,
`E = 0`):

| Lote | Disponível | Originado em (UTC) | Vence em (UTC) | Elegível | Em Garantia | Fica livre |
|---|---|---|---|---|---|---|
| L1 | 10.000 | 10/01/2025 09:00 | 10/01/2027 09:00 | sim | 10.000 | 0 |
| L2 | 20.000 | 30/06/2025 09:00 | 30/06/2027 09:00 | sim | 20.000 | 0 |
| L3 | 15.000 | 02/07/2025 09:00 | 02/07/2027 09:00 | sim | 15.000 | 0 |
| L4 | 3.000 | 01/03/2026 09:00 | 01/03/2028 09:00 | sim | 1.000 | 2.000 |

Saldo de 48.000, todo elegível → 46.000 em Garantia (L1, L2 e L3 inteiros; L4 parcial); ficam livres 2.000 de L4, o lote
de vencimento mais distante. Variante: se L1 tivesse sido originado em 25/11/2024 10:00, venceria em 25/11/2026 10:00,
antes do prazo da Request: não seria elegível, o saldo elegível cairia para 38.000 < 46.000 e o envio seria recusado com
`ERR_CREDIT_HOLD_INVALID` (o saldo total bastaria), sugerindo acrescentar datas. Sem saldo total suficiente →
`ERR_CREDITS_INSUFFICIENT`. Excedente: Co-Owner oferece uma reserva de 6 noites com `P = 60.000` para `N = 55.000` →
`G = 0`, `C = 55.000`, `E = 5.000`; aceite em 25/11/2026 09:00 UTC → lote do complemento originado nesse instante, com a
validade do envio (24 meses: vence em 25/11/2028 09:00 UTC), 5.000 disponíveis.

### 3. Cotação, consentimento, pagamento e envio

1. **Cotação** (leitura do servidor): elegibilidade, `N`, `P` por unidade e por noite, `G` com os lotes que o FEFO
   escolheria, `C`, `E`, Fee, prazo em horas e validade — tudo como prévia.
2. **Revisão**: a tela exibe, nesta ordem, Créditos necessários; datas e reservas a comprometer, com os Créditos
   potenciais por data e o total; Créditos da Carteira que ficarão em Garantia; total coberto; excedente; Taxa de
   intermediação; prazo para resposta ("24 horas a partir do envio"); o destino de cada recurso no aceite e em recusa,
   retirada, expiração ou encerramento; no Co-Owner, que o dia cedido segue consumido do Direito de Uso; a política
   vigente. Antes do envio confirmado, as datas aparecem como **a comprometer**, nunca como comprometidas, e os Créditos
   potenciais nunca como saldo.
3. **Aceites**: a política (`PolicyAcceptance`, W18) e, havendo complemento, as condições do complemento — dois aceites
   obrigatórios e separados, ligados à versão do texto.
4. **Pagamento**: o servidor refaz a cotação (pré-validação) e chama `initiatePayment` com o Fee cotado
   (`Idempotency-Key` da revisão); só com o pagamento `approved` o envio prossegue. Pendente: "Pagamento em
   processamento", com conclusão explícita depois da aprovação.
5. **Envio** (`send_request`, uma transação): travas, revalidação integral e recálculo; qualquer valor diferente do
   revisado → `ERR_REQUEST_TERMS_CHANGED`; data de complemento que deixou de cumprir a antecedência em `expires_at` →
   `ERR_MIN_NOTICE`. O banco fixa `sent_at` (relógio na inserção) e `expires_at = sent_at + horas do snapshot` e grava
   Request, noites, compromissos, consentimento (com as horas consentidas e o `expires_at` efetivo), Garantia e
   `fee_charge`. Só depois do COMMIT a tela diz "comprometidas" e mostra o prazo exato.
6. **Falha depois do pagamento aprovado**: o pagamento fica sem desfecho; o fluxo dispara `reconcilePayment` logo após a
   recusa (estorno `pending` idempotente por pagamento, chamada ao PSP) e o job `reconciliation` é a rede de segurança. O
   membro vê "Pagamento sem solicitação enviada — devolução em processamento" e "Revisar valores atualizados".

O prazo consentido é a duração; o instante exato nasce no envio, segundos depois da revisão, e é o registrado. Valores
vinculantes nunca divergem do consentimento: o banco recusa consentimento diferente da Request.

### 4. Envio (`send_request`): ordem e regras do banco

Ordem (TECH-053/054): K4 + K5 + K7 (+ K6 com complemento) → Requests do mesmo solicitante com compromisso ativo sobre as
unidades escolhidas (classe 1, ordem de id; as que não podem mais ser aceitas são encerradas nesta transação, as demais
recusam) → Memberships do solicitante e do detentor `FOR SHARE` (3) → Ações (4) → noites solicitadas `FOR SHARE` e noites
do complemento `FOR UPDATE` (5, ordem `(second_home_id, stay_date)`) → reservas → política, parâmetros e PRL (instante
único; resolvedor estendido a várias Second Homes, travas `app.prl:<id>` em ordem crescente) → comparação com os termos
revisados → snapshot → Request → noites solicitadas → unidades e noites do complemento → consentimento → Garantia (7) →
`fee_charge` com o pagamento por último (8) → outbox → auditoria.

Gatilhos (o papel da aplicação é tratado como potencialmente comprometido, ADR-0024 §3): operação `pending` na transação
do snapshot (`xmin`); solicitante representado e `active`; detentor `active` e ≠ solicitante; usuário que age não
representa o detentor; noites solicitadas contínuas, de uma Second Home, futuras, elegíveis do detentor e sem compromisso
efetivo; unidades do solicitante, elegíveis ao depósito, com `luxchange_deposit_notice_met(checkin_at, expires_at)`;
`N`, `P`, `G`, `C`, `E` exatos pelo snapshot; Garantia só da Request da operação, cobertura e soma `= G`;
`fee_charge.prl_total_minor = Σ` noites solicitadas. Completude no COMMIT: Request, noites, unidades, consentimento,
snapshot com política e parâmetros, Garantia exata, um Fee, e nenhuma escrita de custódia, ocupação, transição de reserva
ou ledger do Direito de Uso.

### 5. Compromisso efetivo

`app.luxchange_request_closure_reason(request_id)` devolve `expired` (`now ≥ expires_at`), uma inelegibilidade provada
(transição de Membership para fora de `active`, custódia fechada, ocupação aberta, transição de reserva, compromisso de
complemento sobre noite solicitada, holding encerrada — todos com instante `≥ sent_at` — ou período solicitado iniciado) ou
`NULL`. Compromisso efetivo ⇔ `state = 'active'` ∧ Request `pending` ∧ `closure_reason IS NULL`. Os ramos de recusa nos
gatilhos das W12/W13/W20, a elegibilidade de capacidade solicitada (W21) e o aceite (W22) usam esse predicado, só lendo.

### 6. Liberação após a expiração

O índice `state = 'active'` só impede **novo compromisso** sobre a mesma unidade, e só o dono da unidade (o solicitante)
cria compromisso sobre ela; todo outro ato consulta o predicado efetivo, falso desde o primeiro instante em que a Request
não pode mais ser aceita.

| Fluxo | Tratamento | Resultado esperado |
|---|---|---|
| Nova Request do mesmo solicitante sobre as mesmas unidades | trava as Requests com compromisso ativo (classe 1) antes das noites; encerra na mesma transação as que não podem mais ser aceitas; recusa se alguma ainda pode | determinístico; dois envios concorrentes serializam na classe 1 e nas noites; o perdedor recebe `ERR_CAPACITY_UNAVAILABLE` |
| Depósito W20 da unidade | gatilho do fechamento de custódia consulta o predicado | efetivo → recusa; não efetivo → prossegue; o encerramento posterior só marca `released` |
| Reserva de uso próprio (Owner) / cancelamento (Co-Owner) | gatilhos da ocupação e da transição consultam o predicado | idem |
| Aceite de Request alheia sobre a unidade | elegibilidade e escrita de cessão consultam o predicado | efetivo → recusa |
| Retirada × job de expiração | ambos travam a Request (classe 1) | o primeiro grava `withdrawn` (`now < expires_at`) ou `expired`; o segundo encontra estado terminal |
| Expiração × aceite (W22) | aceite trava a Request primeiro e exige `resolved_at` do aceite `< expires_at` | aceito só se travou primeiro e no prazo; nunca os dois |
| Mudança administrativa de elegibilidade | não é recusada; a prova torna o compromisso não efetivo no mesmo instante | nenhum bloqueio residual; o encerramento é materializado depois |
| Atos no limite do prazo sobre a mesma noite | serializam pela trava da noite; custódia ativa única | só um ato vence |

**Critérios verificáveis (E1, PostgreSQL real, duas ou mais conexões, cada cenário repetido ao menos 50 vezes com
intercalações forçadas):** todos os fluxos acima, mais Request vencida sem execução do cron, depósito após a expiração,
retirada × aceite × expiração e tentativa de dupla cessão ou dupla originação. Aceita-se a etapa só se: nenhuma execução
termina em `40P01` (deadlock) ou em `lock_timeout`; cada cenário de corrida tem exatamente um vencedor com o estado final
esperado; nenhuma data fica recusada depois de `expires_at` ou de inelegibilidade provada sem job, com o índice físico
ainda `active`; as invariantes do banco ficam vazias. Toda função nova declara as travas que toma, conferidas contra a
ordem estendida da TECH-053 (Request 1 → Membership 3 → Ação 4 → noite 5 → reserva → custódia 6 → lote 7 → pagamento 8)
por teste estático do `LockSequence`.

### 7. Encerramentos

- `withdraw_request` (autoridade `requester`, sem Membership): `cancelled_pre_accept` (`withdrawn`), ou `expired` se
  `now ≥ expires_at`.
- `expire_requests` (sistema): só com `now ≥ expires_at`.
- `close_ineligible_request` (sistema, executado pelo job `expire_requests`): só com prova registrada (`evidence_kind`,
  `evidence_id`) conferida pelo banco.
- Mesma transação, conferido no COMMIT: liberação de toda a Garantia restante (`available`, ou `expired` se o lote
  venceu), compromissos `released`, `fee_charge_reversal` + estorno `pending` integral; nada em custódia, reserva ou
  Direito de Uso.
- Disparo: `after()` dos commands de Request; consumidor dos eventos do Context; materialização no `send_request` do
  mesmo solicitante; Cron diário de recuperação. Chave de idempotência por Request; a trava da Request serializa job,
  consumidor e retirada.

### 8. Contrato do aceite composto (implementado na W22; fixado agora)

Nenhuma permissão genérica de agir por outra party. Cada escrita do aceite sobre recurso do solicitante exige todas as
condições:

1. **Aceitação.** Operação `accept_request` `pending`, na transação do próprio snapshot (`xmin`); o snapshot do aceite
   só fixa o instante do aceite (`resolved_at`, depois das travas), que precisa ser `< request.expires_at`; linha
   `luxchange_request_acceptance(request_id PK, operation_id UNIQUE)` gravada antes dos demais efeitos; Request `pending`
   e `closure_reason IS NULL`; ator representa o detentor e não representa o solicitante (BR-211); Memberships das duas
   parties `active` (`FOR SHARE`).
2. **Consentimento vinculante.** Só compromissos `active` e Garantia criados pela operação de envio da mesma Request,
   com consentimento gravado, são alcançáveis.
3. **Cessão do complemento.** Fechamento só da custódia registrada no compromisso e ainda ativa; reserva Co-Owner ainda
   `confirmed` e encerrada por `cession` com liberação `ceded`; `luxchange_deposit_notice_met(checkin_at, resolved_at do
   aceite)`; nova custódia `luxchange_cession` com `parent_custody_id` da cedida e `authorization_ref =
   request_complement:<request>`; compromisso → `consumed`; nenhum movimento do Direito de Uso.
4. **Originação ao solicitante.** Novo ramo em `credit_lot_originate()`: `party_id = requester_party_id` só nesta
   operação e só com todos os compromissos da Request consumidos por ela; quantidade `= P` recalculada pelo banco com os
   `prl_id` das noites do complemento e o multiplicador do snapshot **do envio**; `originated_at = resolved_at` do
   snapshot **do aceite**; `expires_at = credit_expires_at(originated_at, meses do snapshot do envio)`.
5. **Consumo.** `held → consumed` só das entradas `hold` da operação de envio da mesma Request, por inteiro;
   `available → consumed` só do lote do item 4 (`origin_operation_id` = esta operação) e exatamente `C`; `E` permanece
   `available`.
6. **Cedente (hipótese de produto, sujeita à confirmação do fundador).** Lote do detentor: quantidade `N`, calculada com
   os valores vinculantes do envio mesmo que o PRL mude depois; mesma originação e validade do envio; o detentor vê
   esses valores antes de aceitar. Capacidade solicitada cedida (`request_destination:<request>`) e reservada
   (`luxchange_request`, TECH-023); apuração do Fee só da Request aceita; concorrentes encerradas (TECH-024).
7. **Prova.** Completude no COMMIT contra o plano do §9; invariantes após todo teste; replay pelo executor;
   `UNIQUE (request_id)` na aceitação e `UNIQUE (origin_operation_id, party_id)` nos lotes.
8. **Rastreabilidade.** Noite do complemento → `custody_id` cedida → custódia sucessora (`parent_custody_id`) → lote do
   solicitante (mesma operação, party) → consumo (`parent_entry_id`/operação).

**Compatibilidade com os gatilhos atuais:**

| Gatilho/tabela atual | Hoje | Contrato (W22) | W20 |
|---|---|---|---|
| `economic_snapshot_write` | `resolved_at` na transação | inalterado: o snapshot do aceite só fixa o instante | intacto |
| `economic_snapshot_parameter_write` | versão vigente em `resolved_at` | inalterado: o aceite não grava parâmetros vinculantes; lê os do envio pela Request | intacto |
| `credit_lot_originate` | party que age; validade do snapshot da origem; aceite só com K7 | ramo novo para `accept_request` com aceitação: cedente (party que age) e solicitante (party da Request, só com compromissos consumidos pela operação); instante do snapshot do aceite; quantidades e meses do snapshot do envio; K4 + K7 (+ K6 com complemento) | ramo do depósito inalterado |
| `credit_entry_write` | `held → consumed` com qualquer `accept_request`; `available → consumed` só `create_direct` | `held → consumed` só da Garantia da Request aceita; `available → consumed` do lote da mesma operação e só `C` | — |
| `date_custody_close/open`, `date_occupancy_release`, transição `cession` | ramos só de `deposit_capacity` | ramos de `accept_request` só para compromissos efetivos da Request aceita (`request_complement`) e para a capacidade solicitada (`request_destination`) | ramos do depósito inalterados |
| `settlement` (W19) | `accept_request` + Fee de `send_request` | Fee da operação de envio da Request aceita | — |

### 9. Entrega estrutural da W21 para o aceite

`app.luxchange_request_acceptance_plan(request_id, accepted_at)` (somente leitura) e `planCompositeAcceptance` no domínio,
com teste cruzado: noites a ceder (com custódia e reserva), `P`, `G`, `C`, `E`, `N` do cedente, validade, `expires_at` dos
lotes para o `accepted_at` dado e as versões do envio. A W21 não cria nenhum ramo de escrita do aceite; a regra "aceite só
com a K7" (ADR-0036 §7) permanece até a W22.

### 10. Capabilities

Compromisso novo exige todas as chaves do que ele cria; encerramento de obrigação existente não depende de nenhuma.

| Ato | Chaves exigidas |
|---|---|
| Depósito (W20) | K4 + K6 |
| Envio sem complemento | K4 + K5 + K7 |
| Envio com complemento | K4 + K5 + K6 + K7 |
| Aceite sem complemento (W22) | K4 + K5 + K7 |
| Aceite com complemento (W22) | K4 + K5 + K6 + K7 |
| Direct (W23) | K4 + K5 + K7 |
| Retirada, expiração, inelegibilidade, recusa (W22) | nenhuma |
| Expiração de lote vencido | nenhuma |
| Estorno: abertura (reversão ou conciliação), avanço, inbox; avanço monotônico de pagamento existente | nenhuma |

Restrições dos caminhos isentos (conferidas no banco): objeto preexistente; liberação só por operação que grava, na mesma
transação, o evento terminal pré-aceite da Request dona da Garantia, com a quantidade restante inteira e o bucket pela
validade; compromisso `released` só nessa mesma operação; reversão só do Fee da operação de envio dessa Request; estorno
de reversão no valor integral do Fee; expiração de lote só com `now ≥ expires_at` e todo o disponível; estados
financeiros só avançam; nada isento cria Crédito, capacidade, cobrança ou vínculo novo.

### 11. PSP, estados visíveis e recuperação

Reversão interna (`fee_charge_reversal`, no encerramento) ≠ estorno concluído (`refund.succeeded`, no PSP).

| Estado do pagamento/estorno | O que o membro vê |
|---|---|
| `payment.pending`, sem Request | "Pagamento em processamento" (nada foi enviado) |
| `payment.failed` | "Pagamento não aprovado" (nada foi enviado) |
| `fee_charge`, Request pendente | "Taxa paga" |
| aprovado sem Request (envio recusado ou abandonado) | "Pagamento sem solicitação enviada — devolução em processamento" |
| reversão + estorno `pending` ou `failed` com nova tentativa | "Devolução da taxa em processamento" |
| estorno `succeeded` | "Taxa devolvida" |
| apuração no aceite (W22) | "Taxa definitiva" |

Recuperação: `processRefund` no `after()` do encerramento; job `reconciliation` (W19) para pendentes, aprovados sem
desfecho e estornos falhos (nova linha + alerta); estornos seguem com a K5 desligada; sem `PAYMENT_GATEWAY` nada é
cobrado nem estornado (o runbook proíbe remover o gateway com estorno pendente; alerta). Production: gateway ausente,
fake recusado, K5 fechada — nenhum pagamento real ou simulado.

### 12. Guard

`send_request`: delegação vigente + holding vigente da party em qualquer Second Home (TECH-050/051). `requester`: delegação
vigente + party = solicitante da Request. Ambos revalidados no banco.

### 13. Leitura e privacidade

RLS: o solicitante lê as próprias Requests, unidades, noites e consentimento; o detentor lê as recebidas por colunas
restritas (sem party do solicitante nem complemento). Calendário solicitável sem motivo nem identidade, só para
Membership elegível, com limite de taxa. Nunca PRL em reais; Créditos potenciais nunca como saldo.

## Consequences

### Positive

- Nenhuma data cedida sem aceite; nenhum Crédito de data não cedida; nenhum saldo fictício; depósito da W20 intacto.
- Prazo e exclusividade decididos pelo relógio do banco; nenhum bloqueio residual por atraso de job.
- Encerramentos e estornos nunca presos por chave.
- O aceite da W22 nasce com contrato, plano e testes estruturais; a regra de composição pode mudar sem mudar o aceite.

### Negative

- Ramos novos em funções das W12/W13/W17/W19/W20 (provas de preservação obrigatórias).
- Um command do detentor move recursos do solicitante — só pelo contrato do §8.
- Reserva Co-Owner perto de 15 dias pode ver o prazo tempestivo passar durante a pendência (aviso na tela).
- Estorno de Request vencida sem nenhuma ação começa só na recuperação diária.

### Risks and mitigations

| Risco | Mitigação |
|---|---|
| Escrita forjada pelo `luxtory_app` | regras nos gatilhos; completude no COMMIT; `xmin`; invariantes após todo teste; testes adversariais |
| Corrida na expiração | predicado efetivo pelo relógio do banco; materialização sob trava da classe 1; critérios do §6 |
| Regressão das waves anteriores | ramos antes dos caminhos; testes de preservação; `db:check` |
| Divergência domínio × banco | dupla implementação com teste cruzado (padrão do Fee e do depósito) |
| Complexidade do aceite composto | plano somente leitura na W21; checkpoint dedicado na W22 |

## Alternatives considered

- **Só o depósito definitivo (A).** O membro perde a data mesmo sem intercâmbio. Segue disponível, não como única via.
- **Depósito com reversão (C).** Contraria BR-171, REQ-060, TECH-070, TECH-022 e INV-6. Rejeitada.
- **Encerrar a Request em vez de recusar o ato do Titular (B′).** Sem exclusividade. Rejeitada.
- **Créditos primeiro.** Mais saldo preso e excedente frequente; o fundador aprovou `G = max(0, N − P)`.
- **Quantidade de Créditos digitada pelo membro.** Entrada decimal arbitrária e seleção ambígua. Rejeitada.
- **Lote potencial bloqueado.** Saldo fictício. Rejeitada.
- **Flag genérica de agir por outra party.** Superfície de forja ampla. Rejeitada.
- **Originação no aceite com instante e validade do envio.** O lote nasceria antes do fato gerador. Rejeitada.
- **Originação no aceite com valores do aceite.** Revalorizaria o que foi consentido (contra o PD-007). Rejeitada.
- **Unicidade só pelo predicado (sem índice).** Corrida entre compromissos do mesmo solicitante. Rejeitada.
- **Liberação do compromisso por gatilho de outro command.** Escrita fora da ordem de travas. Rejeitada.
- **Encerramento síncrono nos commands das W12–W20.** Violaria a ordem da TECH-053. Rejeitado.
- **`pg_cron` com regra no SQL; Vercel Schedules (beta) ou agendador externo agora.** Desnecessários à correção;
  avaliáveis antes da ativação, se a latência do estorno exigir.
- **Reusar `economic_snapshot_night` para o complemento.** Colide com a PK e a regra de Second Home. Rejeitado.
