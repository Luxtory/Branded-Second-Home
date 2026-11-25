# Threat Model: luxchange — depósito de capacidade (W20)

- **Date**: 2026-11-23
- **Author(s)**: agente de engenharia (revisão: fundador + auditoria independente)
- **Status**: Draft (branch da W20)
- **Scope**: command `deposit_capacity`, `POST /v1/luxchange/deposits`, Server Actions e telas
  `/titular/luxchange/deposito*`; `app.economic_snapshot_night`; transição `cession`; ramos do depósito em
  `date_custody_open`/`date_custody_close`/`date_occupancy_release`; quantidade do lote de depósito; completude no
  COMMIT; K6 `luxchange_deposit`; K7 `luxchange_exchange`; evento `luxchange.credits_originated` e notificação
- **Linked spec**: `docs/specs/luxchange.md`
- **Linked ADR(s)**: ADR-0036, ADR-0033, ADR-0032, ADR-0031, ADR-0027, ADR-0026, ADR-0024

## 1. Overview

O depósito é a primeira operação de usuário que cria Créditos e move capacidade para o Inventário Luxtory: um depósito
forjado criaria Créditos sem contraprestação, cederia capacidade de terceiros ou devolveria Direito de Uso consumido.
Superfície nova: um endpoint autenticado do Titular (mesma origem, cookie de sessão), uma Server Action, leituras por RLS
e regras de escrita no banco. K4 e K6 permanecem fechadas em Production.

## 2. Assets

- Integridade do par cessão ⇄ Créditos (INV-2, INV-3, INV-6) e do Direito de Uso consumido (REQ-060).
- Quantidade exata dos Créditos e versões econômicas usadas (BR-201, REQ-052, TECH-031).
- Capacidade de outros Titulares e do `spe_pool` (BR-151, BR-162).
- Confidencialidade do PRL por noite (REQ-100) e do saldo de cada party.

## 3. Trust boundaries

Navegador → Next (sessão Supabase verificada, guard do Titular) → executor (TECH-054) → PostgreSQL. O papel
`luxtory_app` é tratado como potencialmente comprometido: as regras críticas estão nos gatilhos, privilégios, K4/K6 e na
completude adiada, não só no código.

## 4. STRIDE

| ID | Ameaça | Cenário | Mitigação |
|---|---|---|---|
| T-2001 | **S** Spoofing | Titular deposita noites de outra party ou de outra Second Home; usuário sem delegação usa `party_id` alheio | Guard do Titular (delegação + holding vigente na Second Home do command); handler trava a delegação `FOR SHARE` e confere a holding; banco exige representação travada da party que age e, por noite, a custódia de origem da holding vigente (Owner) ou a reserva da holding (Co-Owner) |
| T-2002 | **T** Tampering | Créditos sem cessão; cessão sem Créditos; quantidade inflada; noite fora do snapshot; versão de PRL antiga | Completude adiada no COMMIT (`assert_luxchange_deposit_complete`); quantidade conferida pelo banco (`quantidade × 100 = Σ PRL × multiplicador`); snapshot por noite com versão vigente conferida (`app.prl_at`); toda escrita exige a noite no snapshot da operação; `UNIQUE(origin_operation_id, party_id)` |
| T-2003 | **T** Tampering | Usar o depósito para devolver Direito de Uso (`restore`, `spe_pool`) ou ceder `forfeited_right`/`spe_pool` | Sucessora única `luxtory/inventory/luxchange_cession`; origem só `owner` ou `reserved_right`; operação de depósito não usa caminhos da W13; completude recusa qualquer movimento do ledger do Direito de Uso |
| T-2004 | **T** Tampering | Cessão parcial de reserva Co-Owner deixando reserva `confirmed` com noites no Inventário | Transição `cession` exige todas as noites não iniciadas; completude exige toda noite da reserva cedida e liberada com `ceded` |
| T-2005 | **T** Tampering | Burlar a antecedência com o relógio do servidor | `clock_timestamp() ≤ checkin_at − 336 h` no banco, por noite e na transição |
| T-2006 | **R** Repudiation | Titular nega o depósito; disputa sobre o valor | Operação (ator, party, instante, chave), auditoria do executor, snapshot imutável com versões de PRL, multiplicador e validade; custódia com `authorization_ref = 'deposit_capacity:<op>'`; termos revisados conferidos (`ERR_DEPOSIT_TERMS_CHANGED`) |
| T-2007 | **I** Information disclosure | PRL por noite exposto ao Co-Owner; Titular vê noites/saldo de terceiros | Jornada só com Créditos (nunca reais); PRL lido só pelo servidor (sem GRANT a `authenticated`); leituras da jornada sob RLS da holding/party representada; snapshot sem GRANT a `authenticated`; logs sem PII |
| T-2008 | **D** Denial of service | Corpo enorme; 366 noites repetidas; travas longas | Corpo limitado (64 KiB) e schema fechado (1–366 noites distintas); travas em ordem total com `lock_timeout` e retry limitado; completude proporcional às noites da operação |
| T-2009 | **E** Elevation of privilege | Ativar o depósito sem decisão; command sem Membership | K6 (cessão) e K4 (lote) sem linha; Membership `active` no executor (classe 3) e no banco (`FOR SHARE`); rollback recusado com fato de depósito ou sob ativação |
| T-2010 | **E** Elevation of privilege | CSRF na rota ou na Server Action | Rota exige mesma origem (TECH-100) e `Idempotency-Key`; Server Actions protegidas pelo Next; nenhum efeito por GET |
| T-2011 | **T** Tampering | Replay ou duplo clique cria dois depósitos | Idempotência (ADR-006); travas das noites; segundo depósito vê a noite cedida → `ERR_CAPACITY_UNAVAILABLE` |
| T-2012 | **E** Elevation of privilege | Com a K4 ligada para o depósito, servidor comprometido origina Créditos por aceite forjado ou gasta Créditos por Garantia/Direct forjados (W21–W23 ainda sem lastro) | K7 `luxchange_exchange` (sem linha) em `credit_lot_originate` (aceite) e `credit_entry_write` (send/accept/direct/withdraw/reject); teste adversarial reproduz e prova a recusa |
| T-2013 | **T** Tampering | Operação `pending` reaproveitada noutra transação — sequencial ou iniciada antes do snapshot de outra (concorrente) — acrescenta noites/cessões a um depósito já conferido no COMMIT | Noites do snapshot e escritas do depósito só na transação que inseriu o snapshot (`xmin` do snapshot = xid corrente; snapshot só-inserção); testes adversariais sequencial e concorrente com duas conexões `luxtory_app` |

## 5. Abuse cases

- Co-Owner reserva e deposita a mesma data duas vezes em abas diferentes → segunda recusada (custódia já cedida).
- Owner tenta depositar noite com reserva de uso próprio ativa → `custody_occupied` (cancelar antes, TECH-023).
- Servidor comprometido grava snapshot + lote sem custódias → COMMIT recusado pela completude.
- Servidor comprometido abre `luxchange_cession` com `authorization_ref` arbitrário → recusado.

## 6. Residual risks

- A originação por `accept_request` e os movimentos de Request/Direct ficam fechados pela K7 (sem linha) até o lastro
  das W21–W23; ativar a K7 sem esse lastro reabre T-2012 (decisão do fundador, nunca da W20).
- Hoje a K7 também trava retirada e recusa. Sem Garantia possível isso é inócuo; a W21 deve tirá-las da trava antes de
  ativar a K7, ou desligá-la depois prenderia Créditos em Garantia (contrato no ADR-0036, follow-ups).
- Ativação real depende de D2 (backup/restauração), PRL e parâmetros publicados por autorização do fundador.

## 7. W21 — Request: envio, complemento por datas e encerramentos (2026-11-24)

- **Scope**: `send_request`, `withdraw_request`, `expire_requests` e `close_ineligible_request` (job `expire_requests` e
  consumidor de eventos); `POST /v1/luxchange/requests/fee-payment`, `POST /v1/luxchange/requests`,
  `POST /v1/luxchange/requests/{id}/withdraw`; telas `/titular/luxchange/solicitacoes*`; tabelas da Request, das noites,
  do complemento e do consentimento; ramos de recusa por compromisso efetivo nas funções das W12/W13/W20; contrato das
  capabilities (ADR-0037 §10); guard `requester` e Titular fora da própria Second Home.
- **Linked**: `docs/specs/luxchange.md` §13 · ADR-0037 · `02` v4.7 PD-012 · `03` v3.20 TECH-073.
- **Assets novos**: Garantia de Créditos da Request; compromissos do complemento (datas do solicitante); pagamento e
  reversão do Fee; consentimento; ocupação e presença inferíveis das datas solicitáveis.

| ID | Ameaça | Cenário | Mitigação |
|---|---|---|---|
| T-2101 | **S** Spoofing | Usuário envia Request por party que não representa, ou de party sem holding vigente | Guard: delegação vigente + holding vigente em qualquer Second Home; banco exige representação travada da party que age |
| T-2102 | **E** Elevation of privilege | Mesmo usuário representa solicitante e detentor e fecha o próprio intercâmbio | Envio recusado quando o ator representa o detentor; o aceite (W22) recusa o mesmo caso (BR-211) |
| T-2103 | **T** Tampering | Servidor comprometido grava Request sem Garantia, com `N`/`P`/`G` divergentes, Garantia de lote que vence antes do prazo, ou Fee sobre PRL que não é o das noites | Gatilhos e completude no COMMIT: `N` recalculado sobre as noites solicitadas do snapshot, `P` sobre as noites comprometidas, `G = max(0, N − P)`, cobertura `lot.expires_at ≥ expires_at`, soma da Garantia = `G`, `fee_charge.prl_total_minor` = Σ noites solicitadas; `xmin` do snapshot |
| T-2104 | **T** Tampering | Comprometer datas de outra party, data já depositada, reserva parcial ou data que não cumprirá as 336 h no prazo | Unidade só da holding vigente da party que age, elegível ao depósito, reserva inteira, `luxchange_deposit_notice_met(checkin_at, expires_at)` no banco |
| T-2105 | **T** Tampering | Mesma data lastreando duas Requests; uso da data comprometida por depósito, reserva ou cancelamento do próprio Titular | Índice único de compromisso `active`; ramos de recusa por compromisso efetivo nas W12/W13/W20; travas da noite e da reserva |
| T-2106 | **D** Denial of service | Data presa por Request vencida ou inelegível sem job; job atrasado prende Garantia | Compromisso efetivo depende do relógio do banco e da inelegibilidade provada; compromisso não efetivo nunca recusa; reutilização materializa sob trava; job só materializa |
| T-2107 | **T** Tampering | Encerramento forjado de Request elegível para liberar Garantia ou reverter Fee; liberação parcial; reversão dupla | Encerramento de sistema só com prazo vencido ou prova registrada `≥ sent_at`; retirada só pelo representante do solicitante; completude no COMMIT; `fee_charge_reversal` única; estorno integral |
| T-2108 | **E** Elevation of privilege | Desligar K4/K5/K6/K7 prende Garantia, datas ou estornos; ou caminho isento usado para criar efeito novo | Chave fechada só impede compromisso novo; caminhos isentos exigem objeto preexistente e encerramento comprovado na mesma operação; nada isento cria Crédito, capacidade ou cobrança |
| T-2109 | **T** Tampering | Termos ou consentimento diferentes do exibido; prazo divergente | Command recompara (`ERR_REQUEST_TERMS_CHANGED`); consentimento gravado com versão do texto e valores conferidos pelo banco; `expires_at` calculado pelo banco a partir das horas do snapshot |
| T-2110 | **R** Repudiation | Solicitante nega ter oferecido as datas ou aceito a cessão no aceite | Consentimento só-inserção vinculado à Request; operação com ator e chave; auditoria sem PII; compromissos com custódia e versão do PRL |
| T-2111 | **I** Information disclosure | Calendário solicitável revela ocupação ou ausência do detentor; identidade das parties | Só "Solicitável/Indisponível", sem motivo nem identidade; leitura só com Membership elegível; limite de taxa; detentor lê a Request por colunas restritas (sem party do solicitante nem complemento); nunca PRL em reais |
| T-2112 | **T** Tampering | Pagamento aprovado usado duas vezes, aprovado sem envio retido, ou envio sem pagamento | `payment_already_bound`; `fee_charge` exige pagamento `approved` e valor do Fee; aprovado sem desfecho estornado pela conciliação; fake recusado em Production |
| T-2113 | **D** Denial of service | Solicitações em massa contra um detentor ou corrida de envios | Cada envio exige Fee pago e lastro; limite de taxa nas rotas; travas em ordem total com retry limitado |
| T-2114 | **E** Elevation of privilege | Aceite forjado move recursos do solicitante (W22) | Só pelo contrato da ADR-0037 §8: aceitação única, compromissos efetivos e Garantia da mesma Request, quantidades recalculadas pelo banco; até lá, aceite fechado pela K7 |

**Abuse cases (W21):** solicitante comprometido tenta reofertar a mesma data numa segunda aba (índice único →
`ERR_CAPACITY_UNAVAILABLE`); Co-Owner tenta cancelar a reserva comprometida (recusa com orientação de retirar a
solicitação); depósito da data depois do vencimento sem job (prossegue; o encerramento posterior só marca `released`);
servidor comprometido grava Request sem consentimento (COMMIT recusado).

**E3 (2026-11-25) — rotas, telas e encerramentos por evento:** `POST /v1/luxchange/requests/preview` (leitura do
servidor, sem escrita) e as Server Actions equivalentes; leitura da capacidade alheia só com Membership ativo (T-2111),
sem detentor, motivo nem PRL; detalhe da Request só pela RLS do solicitante (de outra party: 404, sem oráculo); avisos do
solicitado sem party, Créditos ou complemento de quem pediu; pagamento só depois de conferir que os termos revisados
ainda valem (nada é cobrado por prévia vencida); efeitos depois da resposta nunca mudam o desfecho do command; o
gatilho de encerramento não executa command dentro da transação de entrega do outbox. PSP fake só no servidor de E2E
(recusado em Production pela validação do ambiente).

**Residual risks (W21):** limite de taxa das rotas e da leitura da capacidade (T-2111, T-2113) **não implementado na
W21**: exigiria limitador com variáveis novas em Production (decisão do fundador: sem mudança de ambiente nem
infraestrutura nova nesta wave); mitigações atuais — sessão, representação, Membership ativo para ler e Taxa paga por
envio — e o limitador entra como pendência antes da ativação; estorno de Request vencida em que ninguém age começa só na
recuperação diária (Cron do plano Hobby; com evento relevante, logo depois da varredura do outbox); a reserva Co-Owner perto dos 15 dias pode ter o prazo tempestivo transcorrendo durante a pendência (aviso na
tela); ativação real continua dependente de W22, D2, PSP validado, parâmetros, política e autorização do fundador.
