# W15 — Membership: plano

IDs (dona): REQ-011, REQ-050, PD-001. TECH: TECH-030, TECH-050, TECH-053, TECH-055. Complementos: REQ-095 (Admin opera
Membership), REQ-096 (estados Vigente · Suspenso · Encerrado), REQ-097 (mudança de elegibilidade). Base: main
`c681727` (W14), canônicos `01` v10.7 · `02` v4.6 · `03` v3.18. Decisão: [ADR-0031](../adr/0031-membership-estado-historico-e-elegibilidade-no-executor.md).
Spec: [`identity.md` §15](../specs/identity.md). STRIDE: [`identity-admin.md` §W15](../security/threats/identity-admin.md).

## Decisões aprovadas (fundador + auditoria independente, 2026-11-19)

- **D1** — Sem `membership_plan_version` e sem coluna de plano; nenhum benefício, prioridade, preço variável ou regra
  comercial (P-5).
- **D2** — Só party Titular (holding vigente) ativa ou reativa Membership. Decisão explícita de elegibilidade da W15,
  não exigência literal dos canônicos. O Membership é da party, nunca da holding; perder a holding não encerra. Não se
  estende a modelos futuros de participação no Club ainda não definidos. Verificação no PostgreSQL sem acoplar slices.
- **D3** — Sem cobrança, validade automática, renovação ou job. A BR-141 segue vigente; a não renovação pode ser a base
  registrada de um encerramento administrativo.
- **D4** — Sem capability nova. Depois do deploy, nenhum Membership real é criado ou alterado em Production sem
  autorização operacional expressa do fundador. K1/K2/K3 continuam fechadas.
- **Executor** — verificação mínima no TECH-054: `FOR SHARE` até o commit, ordem da TECH-053, falha fechada para
  `eligible` sem comprovação, uso próprio e convidados independentes, nenhuma mudança nos commands que não dependem de
  Membership. Obrigação futura registrada: o aceite de Request verifica as duas parties (REQ-064).
- **Integridade no banco (prioridade do C1)** — padrão da W14: operação da transação, command da transição, atribuição
  Admin revalidada, autor/autoridade/instante de fontes confiáveis, sem manipulação direta pelo `luxtory_app`, histórico
  append-only, rollback que recusa com linhas.

## Escopo

- Migration `identity_membership` (64 migrations): `app.membership` (estado atual) + `app.membership_transition`
  (histórico escrito pelo banco), gatilhos de procedência/transição/titularidade, privilégios por coluna, RLS do Titular.
- Operações não críticas Admin no `identity` (registro separado; tabela fechada da TECH-051 intacta):
  `activate_membership`, `suspend_membership`, `reactivate_membership`, `end_membership`.
- REST `POST /v1/admin/parties/{id}/membership/{activate|suspend|reactivate|end}` e Server Actions sobre os mesmos
  handlers; verificação de elegibilidade no executor; evento `identity.membership_state_changed` → notificação à party
  (outbox, consumidor e `app.notification` existentes).
- Telas: seção "Membership" no detalhe Admin da pessoa ou empresa (estado, histórico, ações) e na Área do Titular
  (estado da party representada); textos factuais (BR-147, BR-321), sem promessa sobre o Club.

## Cobertura (parcial explícita)

- REQ-050: a independência de Taxa de Administração e despesas é provada estruturalmente (o Membership não grava nada
  fora das próprias tabelas); "Taxa obrigatória no Co-Owner, opcional no Owner" e o rateio de despesas não têm entidade
  no produto (`03` §15); a Taxa como parâmetro é da W16. Planos dependem da P-5.
- Créditos (BR-193–196, REQ-053): W17, onde as tabelas nascem.
- Request (TECH-024, EC-7): o fechamento por perda de elegibilidade entra nos commands de suspensão/encerramento na
  W21/W22.

## Etapas e checkpoints

| Etapa | Conteúdo | Parada |
|---|---|---|
| E0 | Worktree `/home/rjr-idb/luxtory-w15`, branch `feat/w15-membership` a partir de `c681727` | — |
| E1 | Plano, ADR-0031, spec §15, OpenAPI (4 rotas), AsyncAPI (1 evento), STRIDE, linha do roadmap | — |
| E2 | Migration + testes de banco + regressões (rollback da W8, preservação da W14, tipos do Kysely) | **C1** (PR draft + CI) |
| E3 | Domínio, operações, verificação no executor, rotas, consumidor; testes unit, db e de contrato | só com GO |
| E4 | Telas Admin e Titular, texto da notificação, E2E, CHANGELOG | — |
| E5 | `verify`, `test:e2e`, `trace`, capturas | **C2** (GO do merge) |

## Critérios de aceite (testes com ID)

- `[PD-001]` segundo Membership para a mesma party é recusado, também entre transações concorrentes; party sem holding
  vigente não ativa; Membership não é papel (holding só Owner/Co-Owner; sem holding, nenhum command do Titular).
- `[TECH-055]` as seis transições pelo seu command, histórico linear com autor/autoridade/instante derivados; qualquer
  outro par → `ERR_STATE_TRANSITION`, inclusive forjado pelo `luxtory_app`.
- `[TECH-002][TECH-051]` operação de fora da transação, de outro command, presa a Second Home ou party, de Titular ou de
  Admin revogada → recusada pelo banco; o `luxtory_app` não grava autor, instante, origem nem histórico, e nada apaga.
- `[REQ-011]` suspensão entre duas ações bloqueia a segunda; a ação em curso (`FOR SHARE`) segura a suspensão; a
  suspensão em curso faz a ação esperar e ver `suspended`; E3: command `eligible` sem verificação falha fechado e
  `not_required` que verifica falha.
- `[REQ-050][BR-321][REQ-032]` o ciclo completo não altera nada fora do Membership (todo o schema `app`), reservas
  confirmadas seguem confirmadas, sorteio e rotação intactos; `[BR-147]` suspenso, encerrado ou sem Membership reserva.
- `[TECH-052]` o Titular só lê o estado das parties que representa com delegação vigente; sem base, autor, operação ou
  histórico; delegação revogada não lê.
- `[TECH-110]` rollback com linhas recusado; `db:check` 64; a W15 só acrescenta objetos ao catálogo e o down o restaura.
- E3/E4: `[REQ-097]` uma notificação por transição; contrato das 4 rotas; E2E 390 com toque e 1440, axe 0.

## Goal command (E5)

`npm run verify && npm run test:e2e` com saída 0 e `npm run trace -- --expect REQ-011,REQ-050,PD-001`.
