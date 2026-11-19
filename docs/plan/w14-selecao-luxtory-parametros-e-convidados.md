# W14 — Seleção Luxtory, parâmetros e convidados: plano

Data: 2026-11-19. Base: `001ef0d` (main = Production, 60/0; K1 e K2 com 0 linhas). Plano apresentado ao fundador,
auditado de forma independente e aprovado com D1–D5 em 2026-11-19; **GO só para a etapa 0, E1 e E2** (worktree
isolada, migrations e testes SQL em PostgreSQL isolado, PR draft único). E3 e E4 dependem de novo GO; nada em
Production. Este documento organiza a execução, sem substituir os canônicos. Decisão:
[ADR-0030](../adr/0030-selecao-luxtory-parametros-e-convidados.md). Specs: [`calendar` §9](../specs/calendar.md),
[`inventory` W14](../specs/inventory.md), [`admin` §13](../specs/admin.md), [`booking` §11](../specs/booking.md).
Ameaças: [`booking` W14](../security/threats/booking.md).

## Decisões aprovadas (2026-11-19)

| # | Decisão |
|---|---|
| D1 | Seleção registra só a custódia `luxtory/{finalidade}` (03 §7); seleção de capacidade não é ocupação; nenhum command cria `luxtory_use` |
| D2 | K3 `luxtory_selection` entra fechada (sem linha); ativação só por migration própria autorizada; K1/K2 intocadas |
| D3 | `parameter` só por inserção: início estritamente crescente por escopo, nunca retroativo, nunca antes de um `effective_to` explícito; fim derivado; trava exclusiva por escopo |
| D4 | Declaração do Titular por (reserva, versão aceita de `guest_rules`), sem dados nem quantidade de convidados (P-6) |
| D5 | Server Actions sobre o executor; REST `/v1` da TECH-056 **adiado** para esses commands (emenda D6 estendida), não cumprido; OpenAPI inalterado |

## Escopo

- **Dentro:** `select_luxtory_capacity` (Admin + base); `set_parameter` + `parameter` só para `guest_rules`;
  `nominate_guest` (Titular, sem Membership); telas Admin (seleção; regras com histórico; declaração no detalhe da
  reserva) e Titular (declarar no detalhe da reserva).
- **Fora:** liberar ou trocar a finalidade da seleção (P-12); devolver `luxtory/inventory` (política, W18+); conteúdo de
  `guest_rules` (P-5); dados do convidado (P-6); parâmetros econômicos (W15/W16); qualquer ativação.

## Cobertura (parcial explícita)

- REQ-016, REQ-036: integrais na W14 (EC-5, CONC-11, INV-4 do lado da Luxtory).
- REQ-092: declaração e versão aceita; dados do convidado em P-6.
- REQ-095: só a parte de parâmetros (autoridade, histórico e vigência de `guest_rules`). PRL na W16; demais
  parâmetros na W15/W16; demais operações Admin nas suas waves. Não declarado integralmente coberto.
- TECH-022: sem saída da seleção (P-12). TECH-056: REST adiado (D5).

## Etapas e checkpoints

| Etapa | Conteúdo | Situação |
|---|---|---|
| 0 | Worktree `/home/rjr-idb/luxtory-w14` a partir de `001ef0d`; branch `feat/w14-selecao-luxtory-parametros-convidados` | concluída |
| E1 | Plano, specs, ADR-0030, STRIDE | concluída (este PR) |
| E2 | 3 migrations + testes SQL (seleção, parâmetros, declaração, preservação) | concluída (este PR) |
| **C1** | Evidências para auditoria: PR draft, `db:check`, regressão W10–W13, prova de preservação | **checkpoint** |
| E3 | Handlers, mapeamentos de erro, classe de trava, testes de aplicação | aguarda GO |
| E4 | Server Actions, telas, i18n, E2E responsivo/axe | aguarda GO |
| E5 / C2 | `npm run verify`, `test:e2e`, trace, CI do PR → checkpoint de merge | aguarda GO |

## Migrations (E2)

1. `20261119061701_admin_parameter` — `app.parameter`, gatilho de procedência/autoridade/vigência, view
   `parameter_version` (fim derivado), `parameter_at`, RLS (Titular lê as versões da própria Second Home, sem base,
   autoridade nem autor).
2. `20261119061704_booking_guest_nomination` — `app.guest_nomination`, gatilho (representação, trava da reserva, trava
   compartilhada das regras, estado e check-out, versão vigente), RLS (Titular lê as declarações das reservas que lê).
3. `20261119061707_inventory_luxtory_selection` — K3 no CHECK; `assert_luxtory_selection_active`,
   `luxtory_window_opens_at`, `luxtory_capacity`, `assert_luxtory_selection_write`, `assert_luxtory_capacity_available`;
   funções de custódia da W13 com o ramo da seleção; INV-4 da Luxtory na consulta de invariantes; rollback recusado
   com a K3.

## Critérios de aceite (testes com ID)

- [REQ-016][EC-5][INV-4] Co-Owners sem saldo → a Luxtory seleciona exatamente a quantidade por categoria; a seguinte é
  recusada (`balance_luxtory_capacity` → ERR_USE_RIGHT_BALANCE); categorias não se compensam.
- [REQ-036][BR-122][TECH-027] antes da janela N+1, inclusive manutenção → `window_luxtory_selection`
  (ERR_WINDOW_NOT_OPEN); 29/02, noite iniciada ou Second Home Owner → recusa.
- [TECH-110][INV-3][REQ-040] `inventory` só com `annual_allocation`; nenhuma ocupação, consumo, reserva ou direito novo.
- [CONC-11] seleção × reserva na mesma noite → exatamente uma; seleção × seleção nunca passa da capacidade.
- [REQ-095][D3] sem autoridade, base, texto ou operação própria → recusa; retroativo, mesmo início, início anterior ou
  antecipação de término explícito (inclusive 1 µs) → recusa; começar no término explícito → aceito; fim derivado;
  intervalos disjuntos; publicações concorrentes serializadas; histórico imutável.
- [REQ-092][BR-330–332] sem regras vigentes → `parameter_missing_guest_rules`; versão diferente → `guest_rules_changed`;
  mesma versão de novo → conflito; outra party → recusa; reserva encerrada ou após check-out → recusa; declaração ×
  cancelamento e × nova versão serializadas; nada além da declaração muda.
- [TECH-051][ADR-0030] K3 fechada → nenhuma seleção pelo papel da aplicação, nem por SQL direto; K3 ativa só no banco de
  teste → só as transições da W14; demais transições fechadas.
- [TECH-110] desfazer a W14 restaura exatamente o catálogo da W13 (definições); a W14 só acrescenta o ramo da seleção.

## Goal command (E5)

`/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-016,REQ-036,REQ-092,REQ-095 exits 0, stop after 4 tries`
