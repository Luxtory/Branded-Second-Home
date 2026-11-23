# W17 — Créditos e Carteira: plano

IDs (dona): REQ-053, REQ-054, PD-008, INV-6. TECH: ADR-007, TECH-025, TECH-031, TECH-044, TECH-051, TECH-053,
TECH-054, TECH-070, TECH-071, TECH-072, TECH-090 (com TECH-001, TECH-052, TECH-056). Complemento: REQ-096 (estados do
Crédito). Base: main `f1fd297` (W16), canônicos `01` v10.7 · `02` v4.6 · `03` v3.18. Decisão:
[ADR-0033](../adr/0033-creditos-lote-ledger-snapshot-e-k4.md). Spec: [`credits.md`](../specs/credits.md). STRIDE:
[`credits.md`](../security/threats/credits.md).

## Autorização (fundador, 2026-11-22)

Instrução do fundador nesta sessão: iniciar e desenvolver a W17 em branch isolada e PR draft; decisões técnicas
rotineiras sem nova aprovação; checkpoint curto depois da base transacional; nada de merge, deploy, migration em
Production, Créditos reais ou ativação sem autorização expressa. Decisões encerradas da W16 não são reabertas.

## Decisões técnicas (registradas na ADR-0033; nenhuma altera regra de negócio)

- **D1 — Buckets escritos pelo banco.** O servidor só insere movimentos em `app.credit_entry`; um gatilho valida o par
  do TECH-070 e atualiza os buckets do lote na mesma instrução. O papel da aplicação não tem UPDATE nem DELETE em
  `app.credit_lot` ou `app.credit_entry`: lote e ledger não divergem por construção.
- **D2 — Originação decidida no banco.** Só operações `deposit_capacity` e `accept_request` (`03` §7: depósito e
  Créditos ao cedente no aceite) originam lote, sempre para a party que age. `originated_at` é o instante do snapshot
  e `expires_at` é calculado pelo banco (`app.credit_expires_at`, adição calendárica em UTC, TECH-044); nenhum dos dois
  vem da entrada. O movimento `external → available` é escrito pelo próprio banco.
- **D3 — Snapshot persistido na originação (TECH-031; D3 da W16).** `app.economic_snapshot` (um por operação, instante
  dentro da transação) e `app.economic_snapshot_parameter` (FK para a versão de `app.parameter` vigente nesse
  instante). A W17 persiste a validade do Crédito originado; a W20 acrescenta PRL e multiplicador ao mesmo snapshot. As
  noites de PRL ficam para a W20, primeira consumidora (nenhuma tabela sem consumidor).
- **D4 — K4 `credits` fechada.** Toda escrita de Créditos pelo papel da aplicação exige a linha `credits` em
  `app.capability_activation`; a W17 só amplia o CHECK, sem linha. O job `expire_credit_lots` entra no cron (sem lote,
  nada a fazer). Ativação: migration própria com autorização do fundador.
- **D5 — Regras de cada movimento no banco.** Command permitido por movimento, validade pelo relógio do banco,
  Membership `active` da party do lote para Garantia e consumo (BR-195; também verificada no executor, ADR-0031 §5),
  representação vigente para quem gasta os próprios Créditos, autoridade Admin revalidada na reversão, saldo por
  movimento-pai (nenhuma liberação, consumo ou reversão acima do que foi reservado ou consumido).
- **D6 — Mecanismos sem jornada.** FEFO, Garantia, liberação e consumo são funções de aplicação para W20–W23; nenhum
  command de Titular novo. `reverse_credit` (Admin + base registrada) tem handler e regra no banco, sem tela nem rota:
  não existe consumo a reverter antes da W22/W23. `expire_credit_lots` é command de sistema do job.
- **D7 — Carteira só leitura.** `/titular/carteira` lê por RLS (party representada por delegação vigente): saldo por
  estado do REQ-096, lotes (origem, quantidade, originação, validade) e extrato (REQ-054) com filtro e paginação. Sem
  formato monetário, resgate, venda ou cessão. Aviso de expiração próxima ⛔ P-7 (antecedência não definida).

## Escopo e etapas

| Etapa | Conteúdo | Saída |
|---|---|---|
| E0 | Este plano, ADR-0033, spec `credits`, STRIDE, status da W14–W16 no plano de waves | docs |
| E1 | Migrations `pricing_economic_snapshot` e `credits_ledger` (K4, lote, ledger, gatilhos, RLS, consultas de INV-6), testes de banco, preservação, `db:check` (68) | **checkpoint da base transacional** |
| E2 | Slice `credits`: domínio, FEFO/Garantia/liberação/consumo, originação com snapshot, `reverse_credit`, job `expire_credit_lots`, trava `credit_lot`, erros, OpenAPI do job | testes direcionados |
| E3 | Carteira e extrato (`/titular/carteira`), i18n, Design System (consumer-driven), E2E 390/1440 | capturas |
| E4 | Gates completos (`verify`, E2E, `trace --expect REQ-053,REQ-054,PD-008,INV-6`), CHANGELOG, runbook, NOTES | PR draft pronto para auditoria |

## Critérios de aceite (plano de waves) e onde são provados

- `[INV-6]` gasto duplo, transferência e origem inválida falham — gatilhos + `credit_invariant_breaches()` após todo
  teste `db`.
- `[TECH-025]` retry não duplica o lote — `UNIQUE(origin_operation_id, party_id)` + replay da idempotência.
- `[PD-008]` FEFO, empate pela originação mais antiga, depois `id`.
- `[TECH-044]` 31/08 + 24 meses → 31/08; 29/02 + 12 meses → 28/02; job atrasado não prorroga.
- `[CONC-8]` mesmos Créditos sob concorrência: exatamente um gasto confirma.
- `[TECH-070]` reversão antes da expiração → `available`; depois → `expired`.
- `[REQ-053]` Membership inelegível bloqueia uso sem pausar validade; reativação restabelece só o saldo válido; Carteira
  sem formato monetário, venda ou cessão.
- `[REQ-054]` extrato com data, tipo, quantidade, lote e operação.

## Cobertura parcial declarada

- **Originação real:** depende de `deposit_capacity` (W20) e `accept_request` (W22); a W17 entrega o mecanismo, o
  snapshot da validade e a regra no banco. Notificação de originação: W20 (plano de waves).
- **Garantia × Request:** `lot.expires_at ≥ request.expires_at` é aplicada na função de Garantia; o vínculo no banco
  com `luxchange_request` nasce na W21.
- **Fato gerador detalhado** (Second Home e noites cedidas): a Carteira mostra origem, operação e data; o detalhe chega
  com a custódia `luxchange_cession` (W20, "Créditos apontam às custódias que os originaram", `03` §7).
- **Aviso de expiração próxima:** ⛔ P-7.
- **Superfície Admin de `reverse_credit`:** quando houver consumo (W22/W23).

## Goal command

`/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-053,REQ-054,PD-008,INV-6 exits 0, stop after 4 tries`
