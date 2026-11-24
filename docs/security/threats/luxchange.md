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
| T-2013 | **T** Tampering | Operação `pending` reaproveitada noutra transação acrescenta noites/cessões a um depósito já conferido no COMMIT | Noites do snapshot e escritas do depósito só na transação do snapshot (`created_at ≥ now()`); teste adversarial |

## 5. Abuse cases

- Co-Owner reserva e deposita a mesma data duas vezes em abas diferentes → segunda recusada (custódia já cedida).
- Owner tenta depositar noite com reserva de uso próprio ativa → `custody_occupied` (cancelar antes, TECH-023).
- Servidor comprometido grava snapshot + lote sem custódias → COMMIT recusado pela completude.
- Servidor comprometido abre `luxchange_cession` com `authorization_ref` arbitrário → recusado.

## 6. Residual risks

- A originação por `accept_request` e os movimentos de Request/Direct ficam fechados pela K7 (sem linha) até o lastro
  das W21–W23; ativar a K7 sem esse lastro reabre T-2012 (decisão do fundador, nunca da W20).
- Ativação real depende de D2 (backup/restauração), PRL e parâmetros publicados por autorização do fundador.
