# 0037. Request: lastro no banco, complemento por datas sob a condição do aceite, encerramentos e contrato das capabilities

- **Date**: 2026-11-24
- **Status**: Accepted (C0 da W21 aprovado pelo fundador em 2026-11-24, com `01` v10.9, `02` v4.7 e `03` v3.20;
  implementação nas W21 E1–E4 e na W22)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, luxchange, credits, billing, inventory, booking, W21, W22

## Context

A W21 entrega REQ-062, PD-005, PD-007 e o envio do PD-012 (`02` v4.7), com TECH-024, TECH-031, TECH-043,
TECH-044, TECH-061, TECH-071, TECH-072, TECH-073, TECH-082 e TECH-090 (`03` v3.20); a W22 entrega o aceite e a
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
  `guarantee_credits` (`G`), `complement_credits` (`P`), `complement_consumption` (`C = N − G`) e `complement_excess`
  (`E = P − C`) como colunas geradas,
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
  `created_at`; só-inserção; o banco confere que `terms` traz exatamente o que foi apresentado — `N`, `G`, `P`, `C`, `E`, Fee,
  prazo em horas, validade, política e os Créditos de cada noite — e que isso coincide com a Request. O `expires_at` não
  integra o consentimento: é resultado do envio, gravado na Request, e o banco prova `expires_at = sent_at + prazo`.
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
   Request (com o `expires_at` derivado do envio), noites, compromissos, consentimento (com a duração consentida),
   Garantia e `fee_charge`. Só depois do COMMIT a tela diz "comprometidas" e mostra o prazo exato.
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

Travas das classes 5 e 6 (implementação da E1/E2): as noites e as reservas usam as travas consultivas do `LockSequence`
(`app.second_home_date:<casa>:<data>`, `app.booking:<id>`), as mesmas dos gatilhos das W12/W13/W20 — o `luxtory_app`
não tem `UPDATE` em `second_home_date` nem em `booking`, então não há trava de linha nelas. O command as toma exclusivas
na ordem total; os gatilhos da W21 as tomam de novo antes de ler o estado (reentrantes para o command): compartilhada na
noite solicitada (Requests coexistem), exclusiva na noite comprometida, compartilhada na reserva comprometida e exclusiva
nos atos do Titular que a recusam (cancelamento, cessão). "`FOR SHARE`/`FOR UPDATE`" acima significa esse modo das travas.
Na materialização do reenvio, a liberação das Garantias encerradas e a nova Garantia são uma única trava da classe 7
(`holdCreditsReleasing`), e os pagamentos dos Fees revertidos e do novo Fee uma única trava da classe 8 (`lockPayments`).

Gatilhos (o papel da aplicação é tratado como potencialmente comprometido, ADR-0024 §3): operação `pending` na transação
do snapshot (`xmin`); solicitante representado e `active`; detentor `active` e ≠ solicitante; usuário que age não
representa o detentor; noites solicitadas contínuas, de uma Second Home, futuras, elegíveis do detentor e sem compromisso
efetivo; unidades do solicitante, elegíveis ao depósito, com `luxchange_deposit_notice_met(checkin_at, expires_at)`;
`N` recalculado pelo banco sobre as noites do snapshot do envio — exatamente as noites solicitadas, o mesmo conjunto de
`luxchange_request_night`; as do complemento nunca entram em `economic_snapshot_night` —, `P` igual à soma das noites
efetivamente comprometidas (cada uma com o `prl_id` do snapshot e o multiplicador do envio), `G = max(0, N − P)`, `C` e
`E` gerados; Garantia só da Request da operação, cobertura e soma `= G`, em FEFO conferido também pelo banco (nenhum lote
elegível que vença antes — ou empate e seja mais antigo — fica com saldo livre: `credit_hold_fefo`);
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

**Critérios verificáveis (E1).** Testes de banco determinísticos, com PostgreSQL real e duas ou mais conexões em
intercalação controlada — o padrão dos testes de concorrência das W13–W20: uma transação trava e espera, a outra tenta, a
ordem dos COMMIT é imposta —, cobrindo os fluxos acima, a Request vencida sem execução do cron, o depósito depois da
expiração, retirada × aceite × expiração e a tentativa de dupla cessão ou dupla originação; repetição proporcional ao
risco só nos cenários de limite de prazo. A etapa é aceita quando: nenhuma cessão, originação ou utilização de Créditos
se duplica; nenhuma data fica recusada depois de perder a eficácia do compromisso, com o índice físico ainda `active`;
nenhum encerramento ou estorno se duplica; nenhuma operação fica parcialmente confirmada; o estado final é o esperado e as
invariantes do banco ficam vazias, inclusive depois do retry do executor. Deadlock ou timeout recuperado pelo retry com a
mesma chave (TECH-053) não é falha econômica, mas cada ocorrência em teste é investigada; a ordem estendida da TECH-053
(Request 1 → Membership 3 → Ação 4 → noite 5 → reserva → custódia 6 → lote 7 → pagamento 8) continua imposta em tempo de
execução pelo `LockSequence` existente.

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
6. **Cedente (hipótese de produto, sujeita à confirmação do fundador).** Lote do detentor com a quantidade devida pela
   capacidade solicitada: Σ PRL das noites solicitadas × multiplicador, ambos do snapshot do envio, mesmo que o PRL mude
   depois (BR-201, BR-212). O banco recalcula e confere essa quantidade com a mesma soma que a W20 já confere no depósito
   (`app.luxchange_deposit_quantity_matches`, aplicada às noites e ao multiplicador do snapshot do envio), sem cálculo
   novo. Hoje ela é igual a `N` porque os Créditos necessários são a mesma soma (`01` §20) e nenhum canônico prevê
   benefício sobre eles — os benefícios de Membership da BR-232 alcançam só o Fee; a conferência do cedente é feita pela
   fórmula do PRL, nunca por igualdade com o débito, para que um benefício futuro sobre o débito não altere a
   contraprestação nem o inverso. Originação só no aceite, com validade contada desse instante; o detentor vê a
   quantidade antes de aceitar. Capacidade solicitada cedida (`request_destination:<request>`) e reservada
   (`luxchange_request`, TECH-023); apuração do Fee só da Request aceita; concorrentes encerradas (TECH-024).
7. **Prova.** Completude no COMMIT contra os termos vinculantes do §9; invariantes após todo teste; replay pelo executor;
   `UNIQUE (request_id)` na aceitação e `UNIQUE (origin_operation_id, party_id)` nos lotes.
8. **Rastreabilidade.** Noite do complemento → `custody_id` cedida → custódia sucessora (`parent_custody_id`) → lote do
   solicitante (mesma operação, party) → consumo (`parent_entry_id`/operação).

**Revalidação no aceite.** Valores congelados não dispensam revalidação: o aceite revalida todos os direitos, estados,
prazos e recursos — capacidade solicitada, compromissos e reservas do complemento, Memberships, representação, Garantia,
prazo da Request e antecedência —, sem recalcular o PRL vigente, e confere os efeitos econômicos contra o snapshot
imutável do envio e os compromissos autorizados.

**Compatibilidade com os gatilhos atuais:**

| Gatilho/tabela atual | Hoje | Contrato (W22) | W20 |
|---|---|---|---|
| `economic_snapshot_write` | `resolved_at` na transação | inalterado: o snapshot do aceite só fixa o instante | intacto |
| `economic_snapshot_parameter_write` | versão vigente em `resolved_at` | inalterado: o aceite não grava parâmetros vinculantes; lê os do envio pela Request | intacto |
| `credit_lot_originate` | party que age; validade do snapshot da origem; aceite só com K7 | ramo novo para `accept_request` com aceitação: cedente (party que age; Σ PRL das noites solicitadas × multiplicador do envio) e solicitante (party da Request, só com compromissos consumidos pela operação; `P`); instante do snapshot do aceite; quantidades e meses do snapshot do envio; K4 + K7 (+ K6 com complemento) | ramo do depósito inalterado |
| `credit_entry_write` | `held → consumed` com qualquer `accept_request`; `available → consumed` só `create_direct` | `held → consumed` só da Garantia da Request aceita; `available → consumed` do lote da mesma operação e só `C` | — |
| `date_custody_close/open`, `date_occupancy_release`, transição `cession` | ramos só de `deposit_capacity` | ramos de `accept_request` só para compromissos efetivos da Request aceita (`request_complement`) e para a capacidade solicitada (`request_destination`) | ramos do depósito inalterados |
| `settlement` (W19) | `accept_request` + Fee de `send_request` | Fee da operação de envio da Request aceita | — |
| `date_occupancy_complement_guard` (W21) | recusa só ocupação `own_use` sobre data com compromisso efetivo; os demais canais seguem impedidos pelas regras vigentes do Inventário | quando o canal `luxchange_request` passar a ser autorizado, a confirmação da ocupação da capacidade solicitada respeita os compromissos efetivos de complemento por datas, reutilizando o predicado `app.luxchange_complement_effective` e as travas já estabelecidas — sem subsistema de bloqueio paralelo | — |

### 9. Entrega estrutural da W21 para o aceite

Os termos vinculantes do aceite são gravados no envio e conferidos pelo banco nesse momento: `N`, `G`, `P`, `C` e `E` na
Request; noites solicitadas e do complemento com custódia, reserva e versão do PRL; multiplicador e validade pelo
snapshot do envio. O domínio calcula para a prévia e o banco recalcula e confere na inserção (padrão do Fee e do
depósito); no aceite não há recálculo nem segundo planejador — a W22 lê esses termos e confere os efeitos contra eles. A
W21 prova estruturalmente, em testes de banco, que os termos gravados bastam para recompor todos os efeitos do aceite nos
três cenários (`G > 0` com `E = 0`; `G = 0` com `E > 0`; sem complemento), sem função de produção nova. A W21 não cria
nenhum ramo de escrita do aceite; a regra "aceite só com a K7" (ADR-0036 §7) permanece até a W22.

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
- O aceite da W22 nasce com contrato e termos vinculantes conferidos no envio; a regra de composição pode mudar sem
  mudar o aceite.

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
| Divergência domínio × banco | o domínio calcula para a prévia; o banco recalcula e confere no envio (padrão do Fee e do depósito); no aceite, nenhum recálculo |
| Complexidade do aceite composto | termos vinculantes gravados e conferidos no envio; checkpoint dedicado na W22 |

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
