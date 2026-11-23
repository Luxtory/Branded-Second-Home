# W19 — Pagamentos, Fee e settlement: plano

IDs (dona): REQ-094. TECH: ADR-006, ADR-008, TECH-025, TECH-080, TECH-081, TECH-082, TECH-083, TECH-090, TECH-101
(com TECH-001, TECH-031, TECH-033, TECH-052–054, TECH-056, TECH-110). Complementos: BR-230–232, BR-350–352, BR-360,
BR-361. Base: main `1e974bc` (W18), canônicos `01` v10.8 · `02` v4.6 · `03` v3.19. Decisão:
[ADR-0035](../adr/0035-pagamentos-duas-fases-fee-settlement-e-k5.md). Spec: [`billing.md`](../specs/billing.md).
STRIDE: [`payments.md`](../security/threats/payments.md).

## Autorização (fundador, 2026-11-22)

Iniciar a W19 em branch isolada e PR draft; decisões técnicas rotineiras sem nova aprovação; nada de merge, migration
ou deploy em Production, PSP real, valor econômico publicado, pagamento real ou ativação sem autorização expressa.

**Decisão comercial do fundador (2026-11-22):** o percentual de referência do Luxchange Fee passa de 10% para 12% do
PRL total do período, mínimo de R$ 120 por operação preservado. Registrada no `01` v10.8 (§24) e no `03` v3.19
(TECH-030, valor inicial). É referência para o runbook, não padrão no código; o multiplicador de Créditos (`01` §20) não
muda. Publicar `luxchange_fee_rate = 0.12` em Production exige autorização operacional própria.

## Decisões técnicas (ADR-0035; nenhuma altera regra de negócio)

- **D1** — duas fases do TECH-080 sem tocar o executor: `payment(pending)` antes do PSP; vínculo pelo command de domínio
  via `fee_charge`; falha do domínio → estorno pela conciliação.
- **D2** — estados monotônicos e append-only no banco; nova tentativa de estorno = nova linha.
- **D3** — Fee calculado por `luxchangeFee` (pricing) e conferido pelo banco com as versões do snapshot.
- **D4** — reversão integral pré-aceite (`fee_charge_reversal` + estorno), só para `send_request`.
- **D5** — settlement fechado por categoria; só `luxchange_fee` gravável na W19; relatório sem total consolidado.
- **D6** — webhook autenticado (HMAC + tolerância do provedor) e deduplicado (`webhook_inbox`).
- **D7** — port `PaymentGateway` + fake recusado em Production; sem gateway → indisponível.
- **D8** — K5 `payments` fechada (CHECK sem linha).
- **D9** — job `reconciliation` (cron diário, no-op sem gateway) e alerta `payment_without_outcome`.
- **D10** — `/admin/financeiro` só leitura.

## Etapas

| Etapa | Conteúdo | Saída |
|---|---|---|
| E0 | `01` v10.8 e `03` v3.19 (Fee 12%), este plano, ADR-0035, spec `billing`, STRIDE, W18 ✅ no plano de waves | docs |
| E1 | Migration `billing_payments` (K5, tabelas, gatilhos, RLS, invariantes), testes de banco, preservação, `db:check` (70) | testes `db` |
| E2 | Slice `billing`: domínio (estados, Fee, categorias, relatório), aplicação (pagamento, Fee, reversão, settlement, estorno, webhook, conciliação), store, fake, erros, travas | testes direcionados |
| E3 | `POST /v1/webhooks/psp/{provider}`, job `reconciliation` (registro, cron, OpenAPI), `/admin/financeiro`, env | E2E 390/1440 |
| E4 | Gates (`verify`, E2E, `trace --expect REQ-094`), CHANGELOG, runbook, catálogo de ambiente, NOTES | PR draft para auditoria |

## Critérios de aceite e onde são provados

- `[BR-230][TECH-082]` Fee 12% e outros percentuais, mínimo por operação, HALF_UP uma vez — unit + `db` (conferência do
  banco igual ao domínio).
- `[TECH-025]` retry não duplica Fee, estorno nem settlement — constraints + replay.
- `[TECH-080][TECH-110]` aprovado + falha do domínio → estorno; webhook duplicado/fora de ordem não regride; queda →
  conciliação.
- `[ADR-008]` pagamento não toca custódia, ocupação nem Créditos.
- `[REQ-094]` relatório por categoria; Brand Partner e Investor nunca como receita Luxtory; categoria indefinida
  recusada.
- Concorrência: vínculo × estorno, webhooks paralelos, conciliações paralelas.

## Cobertura parcial declarada

Consumidores reais (W21–W25); PRL total ↔ noites do snapshot (W20/W21); Fee ↔ Request e encerramentos por
inelegibilidade (W21/W22); categorias além do Fee (waves donas, BR-352); cancelamento pós-aceite (⛔ P-11); PSP real,
D2 e ativação (autorização do fundador).

## Goal command

`/goal npm run verify && npm run test:e2e exit 0 and npm run trace -- --expect REQ-094 exits 0, stop after 4 tries`
