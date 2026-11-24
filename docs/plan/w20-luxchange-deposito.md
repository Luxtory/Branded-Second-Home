# W20 — Luxchange: depósito — plano

IDs (dona): REQ-051, REQ-060. TECH: TECH-023, TECH-043, TECH-051 (com TECH-001, TECH-021, TECH-022, TECH-025,
TECH-031, TECH-033, TECH-044, TECH-052, TECH-053, TECH-054, TECH-056, TECH-070, TECH-091). Complementos: REQ-052 (PRL
por noite associado à operação), REQ-053 (originação na Carteira), REQ-096, REQ-097 (notificação de originação),
REQ-098, INV-2, INV-3, INV-6, CONC-10 (`03` §12: depósito × cancelamento). Base: main `2fa37e8` (W19), canônicos `01`
v10.8 · `02` v4.6 · `03` v3.19. Decisão: [ADR-0036](../adr/0036-deposito-luxchange-cessao-snapshot-por-noite-e-k6.md).
Spec: [`luxchange.md`](../specs/luxchange.md). STRIDE: [`luxchange.md`](../security/threats/luxchange.md).

## Autorização (fundador, 2026-11-23)

Instrução do fundador nesta sessão: iniciar e concluir a W20 em branch isolada, com testes e integração em ambiente de
desenvolvimento; decisões técnicas rotineiras sem nova aprovação; push da branch ao remoto no encerramento (o PR draft
é aberto pelo fundador). **Não autorizado:** merge na `main`, deploy ou migration em Production, ativação de K1–K5
(e da K6 criada aqui), publicação de PRL, multiplicador, Membership ou política real, originação de Créditos reais,
depósitos reais, alteração de segredos e escrita no banco de Production. D2 (backup e restauração testados) continua
condição da ativação econômica real e não bloqueia a entrega da infraestrutura desativada.

## Diagnóstico E0

### Dependências (todas em Production, nada ativado)

| Wave | O que a W20 consome | Estado |
|---|---|---|
| W13 | `booking_state_transition` (cadeia só-inserção, projeção controlada), `date_occupancy_release`, custódia `reserved_right`, `assert_booking_closure_complete`, trava da reserva | ✅ #96 |
| W16 | `app.prl` por noite + `app.prl_period_in_force` (trava compartilhada + instante do banco), parâmetros `credit_multiplier` e `credit_validity_months`, contrato `EconomicTerms`, `creditsForPrl` | ✅ #101 |
| W17 | `app.economic_snapshot(+_parameter)`, `credit_lot` com originação decidida no banco, `originateCreditLot`, K4 `credits` | ✅ #106 |
| W19 | nada funcional (o depósito não cobra Fee); só a convivência com a K5 e o snapshot | ✅ #108 |

A transição `owner | use_right/reserved_right → luxtory/inventory/luxchange_cession` já consta da tabela fechada da W10
(`app.custody_transition_valid`), e o CHECK da ocupação já admite `release_reason = 'ceded'` só em `own_use` sobre
`reserved_right` da mesma Ação. **Falta** a regra de autorização no banco para o papel da aplicação executar esses
fatos, o vínculo do depósito com o snapshot por noite e com o lote, e o encerramento da reserva cedida.

### Q1 — Encerramento da reserva Co-Owner por cessão (§3.1 do pedido)

O W13 prende cada transição a um command: `cancellation` ↔ `cancel_own_use_booking`, com classe temporal
(`timely`/`late`, 15 dias) e efeitos pela sucessora (`spe_pool` + `restore` ou `forfeited_right`). Usar o cancelamento
convencional na cessão seria errado nos dois ramos: o tempestivo **restauraria** o Direito de Uso (contra REQ-060) e o
tardio converteria em `forfeited_right` (contra TECH-022, que manda a capacidade para `luxchange_cession`).

**Menor alteração segura:** uma natureza de transição nova e específica, `cession` (`confirmed → cancelled`, par da
TECH-055), aceita **só** de operação `deposit_capacity`, com a K6 `luxchange_deposit`, papel Titular que representa a
party da holding da reserva (a mesma trava `lock_own_use_titular` do cancelamento), Membership `active` (`FOR SHARE`),
antecedência de 14 dias do primeiro check-in (TECH-043) e **todas** as noites da reserva ainda não iniciadas. Sem classe
de cancelamento (a cessão não é cancelamento convencional; a regra de 15 dias não se aplica), sem base registrada (ato do
Titular). O fechamento completo (no COMMIT) é conferido por uma regra própria do depósito — cada noite liberada com
`ceded`, cada `reserved_right` sucedida por `luxtory/inventory/luxchange_cession` com a referência do depósito, **nenhum**
movimento no ledger do Direito de Uso (sem `restore`, sem `correction`, sem `forfeited_right`, sem volta ao `spe_pool`) —
em vez da regra do cancelamento. Commands, gatilhos e efeitos das W12–W19 ficam idênticos: as funções da W13 ganham
apenas o ramo `cession` antes do caminho existente.

### Q2 — Reserva de várias noites: só cessão integral (§3.2 do pedido)

A reserva tem um único estado da TECH-055, e o W13 deriva dele e do período inteiro: primeira noite afetada e classe do
cancelamento, janela do no-show (`[1º check-in, check-out)`), avanço `in_use`/`completed`, invariantes
`booking_closure_occupancy` e permanência/adjacência (TECH-045). Ceder parte das noites deixaria uma reserva
`confirmed` com buracos — o avanço para `in_use` aconteceria no check-in de uma noite cedida, o no-show seria declarável
sobre noite que já é do Inventário, e o cancelamento posterior calcularia classe e liberações sobre noites que não são
mais dela. Corrigir isso exigiria segmentar a reserva (nova reserva para as noites mantidas, religando consumo,
convidados e histórico), comportamento estrutural novo sem base canônica.

**Decisão:** o Co-Owner cede reservas **inteiras** — uma ou mais reservas confirmadas da mesma holding num só depósito.
Isso não restringe o direito: BR-151 só exige data "já validamente reservada", e o Co-Owner pode reservar exatamente as
noites que deseja ceder (mínimo de 1 noite, TECH-045). A tela seleciona a reserva como unidade (tocar uma noite
seleciona todas as noites daquela reserva) e diz isso explicitamente; nenhuma promessa de seleção parcial. O Owner
seleciona noites individuais, consecutivas ou não.

### Q3 — Noites não consecutivas e PRL (§3.3 do pedido)

O resolvedor `EconomicTerms` (W16) lê o PRL de um período contínuo por `app.prl_period_in_force`, com a trava
compartilhada `app.prl:<casa>` e um único instante do banco. **Extensão cirúrgica:** o pedido aceita, em alternativa ao
período, um conjunto explícito de noites; o resolvedor lê o intervalo que as cobre numa única chamada (mesma trava, mesmo
instante, mesma ordem de travas da TECH-053/ADR-0032) e só considera as noites pedidas — noite intermediária sem PRL não
recusa e não entra no total. Nenhum segundo motor de preço. O snapshot persiste uma linha por noite cedida
(`app.economic_snapshot_night`, versão de PRL conferida pelo banco como a vigente no instante da resolução).

### Gates e autorizações

- **K6 `luxchange_deposit` (nova, sem linha):** abre só os fatos do depósito para o papel da aplicação — transição
  `cession`, fechamento/abertura de custódia do depósito e liberação `ceded`. A K4 `credits` continua exigida pelo lote.
  Depósito = K4 **e** K6; Production: ambas fechadas. Razão de uma chave própria: ativar Créditos para outros mecanismos
  (W21+) não pode abrir a entrada no Inventário por cessão sem decisão específica do fundador (precedente K1–K5).
- **Guard:** autoridade Titular do TECH-051 (delegação + holding vigente na Second Home do command); o handler e o banco
  revalidam na transação (representação travada, holding, Membership `FOR SHARE`, antecedência pelo relógio do banco).
- **Nenhum caminho privilegiado genérico:** toda escrita do depósito exige a operação `pending` da transação com command
  `deposit_capacity`, papel Titular, party que age representada, Second Home da operação, a noite no snapshot da operação
  e a custódia de origem do próprio Titular (Owner: `owner` da holding vigente, sem ocupação; Co-Owner: `reserved_right`
  da Ação da holding vigente, aberta pela reserva cedida na mesma operação).

### Riscos de concorrência e integridade

| Cenário | Barreira |
|---|---|
| Mesma noite em dois depósitos (inclusive duplo clique com chaves diferentes) | travas das noites (classe 5) + `UPDATE … WHERE closed_at IS NULL` + `uq_custody_active`; o segundo vê a noite já cedida → `ERR_CAPACITY_UNAVAILABLE` |
| Depósito × cancelamento (CONC-10) | mesma trava da Ação (classe 4) e da reserva; quem chega depois relê o estado (`conflict_booking_transition_stale` / custódia já movida) |
| Depósito × confirmação de reserva do Owner | travas das noites; ocupação ativa impede fechar a custódia (`custody_occupied`); custódia já cedida recusa a ocupação (`custody_occupancy_matrix`) |
| Depósito × mudança de Membership | `FOR SHARE` em `app.membership` (executor e banco) contra o `FOR UPDATE` da mudança |
| Depósito × publicação de PRL / multiplicador / validade | travas compartilhadas `app.prl:<casa>` e `app.parameter:<chave>:global` contra as exclusivas da publicação; instante lido depois das travas |
| Replay / mesma chave com outro payload | ADR-006 do `03` (executor): replay ou `ERR_IDEMPOTENCY_CONFLICT` |
| Falha antes do commit | uma transação; regra de completude adiada ao COMMIT; nada parcial |
| Termos mudaram entre a revisão e a confirmação | o command recalcula e compara com os termos revisados → `ERR_DEPOSIT_TERMS_CHANGED`, sem efeito (precedente D7 da W13) |

### Arquivos que realmente mudam

- `migrations/<ts>_luxchange_deposit.sql` (uma migration): K6, `economic_snapshot_night`, natureza `cession`, ramos do
  depósito nas funções de custódia/ocupação/transição/fechamento, quantidade do lote conferida pelo banco, completude
  adiada no snapshot, `app.luxchange_invariant_breaches()`.
- `src/features/luxchange/` (slice novo do TECH-011): domínio (elegibilidade, Créditos por noite), `deposit_capacity`,
  leitura da jornada, Server Actions, rota, notificação.
- Portas públicas mínimas: `pricing` (resolvedor por conjunto de noites; snapshot por noite), `inventory` (cessão da
  noite e liberação `ceded`), `booking` (transição `cession`), `credits` (saldo disponível da party), `identity` (rota de
  command do Titular), `platform` (código `ERR_DEPOSIT_TERMS_CHANGED`, K6, consumidores).
- Contratos: `openapi.yaml` (`POST /v1/luxchange/deposits`), `asyncapi.yaml` (`luxchange.credits_originated`).
- Testes de banco, aplicação, preservação (W14 limitada à própria wave; W17 com originação genérica por
  `accept_request`), E2E 390/1440.

## Escopo e etapas

| Etapa | Conteúdo | Saída |
|---|---|---|
| E0 | Este plano, ADR-0036, spec `luxchange`, STRIDE, W19 ✅ no plano de waves, versões canônicas no `CLAUDE.md` | docs |
| E1 | Migration (K6, snapshot por noite, `cession`, regras de escrita, quantidade e completude no banco, invariantes), testes de banco, preservação, `db:check` (71) | base transacional |
| E2 | Slice `luxchange`: domínio, `deposit_capacity` pelo executor, portas de pricing/inventory/booking/credits, auditoria, outbox | testes direcionados |
| E3 | `POST /v1/luxchange/deposits`, leitura da jornada, prévia, calendário, revisão, confirmação, resultado, Carteira, notificação; E2E 390/1440 | capturas |
| E4 | Gates (`verify`, E2E, `trace --expect REQ-051,REQ-060`), CHANGELOG, runbook, NOTES; push | branch pronta para PR draft |

## Critérios de aceite (plano de waves) e onde são provados

- `[REQ-060]` Créditos e entrada no Inventário no mesmo resultado; o dia do Co-Owner segue consumido — completude adiada
  no COMMIT + testes de banco e do command (sem `restore`, saldo inalterado).
- `[REQ-051]` depósito exige Membership; Co-Owner só data reservada; Owner só capacidade própria livre; Titular com
  Membership suspenso segue criando e cancelando uso próprio — executor + banco; preservação W15.
- `[BR-201]` Créditos = Σ PRL × multiplicador publicado — `creditsForPrl` + quantidade conferida pelo banco.
- `[CONC-10]` depósito contra cancelamento — teste de concorrência com PostgreSQL real.
- `[TECH-043]` antecedência de 14 dias — relógio do banco, fronteira ao segundo.

## Fora do escopo (pedido §11 e plano de waves)

Request e Garantia (W21), aceite/recusa (W22), Direct (W23), Luxplus, locação externa, Fee, PSP real, cancelamento
pós-aceite (P-11), retirada do depósito (BR-170/171: depois da originação a cessão é vinculante; nenhuma restituição
automática), encerramento de Requests pendentes pelo depósito (gatilho da W21 sobre os commands das W12/W13/W15/W20),
mudanças de Membership, PRL ou políticas reais.

## Auditoria independente (2026-11-23, instrução do fundador)

| Achado | Prioridade | Evidência | Decisão | Status |
|---|---|---|---|---|
| Com a K4 ligada, `accept_request` forjado origina Créditos sem lastro; `send_request`/`create_direct` forjados movem Créditos | P1 (ativação) | `tests/migrations/luxchange-deposit.db.test.ts` "ativação do depósito não abre Request/Direct" (falhava antes da correção); `credit-ledger.db.test.ts` "K7 luxchange_exchange" | K7 `luxchange_exchange` fechada no banco (`credit_lot_originate`, `credit_entry_write`); depósito = K4 + K6 | corrigido (`36f1464`) |
| Operação `pending` reaproveitada noutra transação cede noite sem Créditos | P1 (ativação) | mesmo arquivo, "operação pendente reaproveitada" (falhava antes) | noites do snapshot e escritas do depósito só na transação do snapshot | corrigido (`36f1464`) |
| (2ª rodada) A guarda de mesma transação comparava tempo (`created_at ≥ now()`): transação B iniciada antes do snapshot de A reaproveitava a operação `pending` de A depois do COMMIT e cedia noite sem Créditos; a completude não rodava no COMMIT de B | P1 (ativação) | reproduzido com duas conexões `luxtory_app`: COMMIT de B aceito, 2 noites cedidas, lote de 1 noite, 1 violação na reconciliação; teste "concorrência: transação iniciada antes do snapshot de outra" | identidade transacional pelo `xmin` do snapshot (só-inserção), sem coluna nova; alternativas rejeitadas no ADR-0036 §3 | corrigido |
| Termos: total igual com versões de PRL diferentes | descartado como defeito (identidade de versão não é contrato) | `deposit-capacity.db.test.ts` "termos revisados por noite" | contrato = valores apresentados; snapshot com as versões usadas (ADR-0036 §8) | documentado e testado |
| (2ª rodada) A revisão mostra Créditos por data, mas o command conferia só total e validade: noites que trocam de valor com a mesma soma confirmavam | P2 | `deposit-capacity.db.test.ts` "valores trocados com a mesma soma são recusados"; `deposit.test.ts` `sameNightCredits` | `expected_night_credits` na ordem de `nights`, além de total e validade; OpenAPI e copy atualizados | corrigido |
| Reserva cedida exibida como "Cancelada" (Titular e histórico do Admin) | P2 | `own-use-booking-sections.ts` (`displayState`); E2E Co-Owner | situação "Cedida ao Luxchange", seção "Cessão ao Luxchange" com link ao depósito, histórico do Admin | corrigido |
| Duas faixas de temporada no depósito × três aprovadas na W16 | P2 | `deposit-read.ts` × ADR-0032 §11 | reutiliza `seasonTiers` da W16 (só apresentação); legenda com três | corrigido |
| Spec dizia "2 meses quando cabem"; o calendário mostra 1 | P2 | spec §5.4 × `deposit-calendar.tsx` | 1 mês por vez (Créditos legíveis na célula) + ir direto a mês/exercício, como na W16; spec corrigida | corrigido |
| Dica do Co-Owner sugeria refazer reservas para ceder parte (14 × 15 dias) | P2 | `deposit-pt-br.ts` `hintCoOwner` | copy sem sugerir cancelamento/re-reserva | corrigido |
| Revisão sem Second Home, vínculo e Créditos por data; rótulo "Saldo atual da Carteira" | P2 | `deposit-calendar.tsx` (revisão) | revisão com Second Home, vínculo e cada data com seus Créditos; "Saldo atual" | corrigido |
| Dois avisos quase iguais enquanto a revisão atualizada carrega (termos alterados) | P2 | E2E "Owner" (strict mode: 2 `alert`) | um único aviso por vez | corrigido |
| Sem teste de depósito × revogação da representação, reserva em exceção/cancelada e reserva atravessando o mês | P2 (cobertura) | — | `deposit-concurrency.db.test.ts`, `deposit-capacity.db.test.ts` | coberto |
| (2ª rodada) Calendário congelado no instante da leitura: uma noite que passa do prazo de 336 h com a tela aberta continuava selecionável; motivo com texto diferente do definido pela Luxtory | P2 | `deposit-calendar.tsx` (estado fixo); copy "menos de 14 dias de antecedência" | relógio ancorado no banco + reavaliação no próximo prazo; seleção e revisão derivadas da elegibilidade atual; motivo exato; bordas 335h59/336h/336h01 testadas no domínio, na tela, no banco (`luxchange_deposit_notice_met`) e no command; E2E com toque, teclado e relógio controlado | corrigido |
| Projeto `chrome-luxchange` pulado quando outro projeto falha | descartado como falso verde | `reports/dep-proof` (local): dependência com falha → "did not run" e saída 1 | semântica do Playwright impede falso verde; risco residual é só falta de cobertura numa execução já vermelha | documentado |

### Fronteiras com as próximas waves (registro)

- **W21 (envio de Request):** compor saldo disponível com Créditos já originados por depósito só quando o produto
  autorizar; Garantia (`held`) é temporária e nunca se confunde com a cessão definitiva da capacidade; encerrar Requests
  pendentes incompatíveis após mudança de capacidade (TECH-024, incluindo o depósito); preservar o snapshot da Request
  (PD-007); comunicar que a recusa de uma Request não desfaz um depósito anterior. Ativar a K7 só com esse lastro.
- **W22 (aceite/recusa):** originação pelo aceite com lastro completo no banco — cessão da capacidade do cedente,
  consumo da Garantia e encerramento das concorrentes no mesmo commit; substitui a regra "aceite só com a K7".
- **W23 (Direct):** a capacidade `luxtory/inventory/luxchange_cession` é origem possível de Direct; reserva, cobrança e
  consumo de Créditos são da W23.
- **K7 (contrato mínimo; ADR-0036, follow-ups):** a K7 abre só compromissos novos (envio, Direct, aceite); retirada,
  recusa, expiração da Request e dos lotes nunca dependem dela. A W21 tira os encerramentos da trava na mesma migration
  que traz o lastro e pede a ativação; desligar a K7 nunca prende Garantia. Chave dividida (Request / Direct) só se a
  ativação de um vier antes do lastro do outro.
- **Membership e go-to-market:** a W20 só verifica a elegibilidade vigente; a decisão comercial de primeiro ano gratuito
  é validada na wave do Membership antes da ativação comercial, sem valores embutidos aqui.
