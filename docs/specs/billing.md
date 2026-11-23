# Spec: billing

- **Status**: W19 — E0–E4 em PR draft; aguardando auditoria e autorização de merge
- **Owner**: módulo `billing` (TECH-011)
- **IDs**: REQ-094 (dona, W19); ADR-006, ADR-008, TECH-025, TECH-080, TECH-081, TECH-082, TECH-083, TECH-090,
  TECH-101; complementos BR-230–232, BR-350–352, BR-360, BR-361, TECH-001, TECH-031, TECH-033, TECH-052, TECH-053,
  TECH-054, TECH-056, TECH-110
- **Plano**: [`w19-pagamentos-fee-e-settlement.md`](../plan/w19-pagamentos-fee-e-settlement.md) · **Decisão**:
  [ADR-0035](../adr/0035-pagamentos-duas-fases-fee-settlement-e-k5.md) · **STRIDE**:
  [`threats/payments.md`](../security/threats/payments.md)

## 1. Goal

Infraestrutura financeira para os mecanismos do Club: pagamento que nunca reserva capacidade (ADR-008), estados
monotônicos e efeitos únicos (TECH-025, TECH-080), Luxchange Fee por operação a partir dos parâmetros vigentes (`01`
§24, TECH-082), settlement separado por categoria e beneficiário (TECH-083, REQ-094), conciliação e alerta
`payment_without_outcome` (TECH-090, TECH-101).

## 2. Non-goals

- Jornadas de Request, Direct, Luxplus e locação (W21–W25); telas de pagamento do Titular.
- PSP real, captura de dinheiro, repasse bancário e emissão de cobrança (`03` §15; P-2).
- Publicar `luxchange_fee_rate`, `luxchange_fee_minimum` ou qualquer valor econômico em Production (D4 da W16).
- Categorias de settlement além do Luxchange Fee com valor ou beneficiário (BR-352): ficam na estrutura e no relatório,
  fechadas para escrita.
- Cancelamento pós-aceite dos mecanismos do Club (⛔ P-11).

## 3. Atores

- **Titular** (party representada por delegação vigente): inicia o pagamento do Fee da própria party (W21/W23 chamam).
- **Commands consumidores**: `send_request` e `create_direct` vinculam o pagamento (`fee_charge`); desfechos pré-aceite
  revertem; `accept_request`/`create_direct` apuram o Fee (settlement).
- **PSP** (via `PaymentGateway`): responde à cobrança, à consulta e ao estorno; envia webhooks autenticados.
- **Sistema**: job `reconciliation`.
- **Admin**: relatório `/admin/financeiro` (só leitura).

## 4. Regras

### 4.1 Luxchange Fee (`01` §24 v10.8, BR-230–232, TECH-033)

`Fee = max(PRL total do período × percentual vigente, mínimo vigente)`, em unidade mínima, `HALF_UP` uma única vez no
valor percentual final; o mínimo é por operação, nunca por noite. Referência comercial atual (decisão do fundador de
2026-11-22): **12%** (fração canônica `0.12`) e mínimo R$ 120 — valores publicados pelo runbook, nunca no código, seed,
migration ou teste. Percentual ou mínimo ausente → `ERR_PARAMETER_MISSING`. O multiplicador de Créditos (`01` §20,
PRL × 10) é outra regra e não é tocado.

### 4.2 Pagamento (TECH-080, TECH-081, ADR-008)

1. O consumidor pré-valida e cota o Fee com os termos vigentes.
2. `initiatePayment` grava `payment(pending)` (idempotente por usuário + `Idempotency-Key`; mesmo key com payload
   diferente → `ERR_IDEMPOTENCY_CONFLICT`) e só então chama `createCharge` com a chave `payment.id`.
3. Confirmação: status `approved` da resposta, da consulta ou de webhook autenticado; `failed` é terminal.
4. O command consumidor, dentro da própria transação, resolve os termos, grava o snapshot e chama
   `chargeLuxchangeFee`: trava o pagamento (classe 8), confere estado, pagador, finalidade, moeda e valor recalculado; o
   banco confere de novo.
5. Recusa do domínio → pagamento aprovado sem desfecho → `reconcilePayment` (mesmo command de sistema do job) grava o
   estorno e chama o PSP.

Pagamento, pendente ou aprovado, não toca custódia, ocupação, PRL nem Créditos.

### 4.3 Estados

| Objeto | Transições | Regra |
|---|---|---|
| `payment` | `pending → approved \| failed` | terminais; repetição ou ordem inversa = no-op |
| `refund` | `pending → succeeded \| failed` | nova tentativa = nova linha; Σ estornos não falhos ≤ valor |
| `fee_charge` | append-only | um por operação e por pagamento |
| `fee_charge_reversal` | append-only | um por Fee; só Fee de `send_request` |
| `settlement` | append-only | `UNIQUE NULLS NOT DISTINCT (operation_id, kind, beneficiary_party_id)`; Fee: um por `fee_charge` |
| `webhook_inbox` | append-only | `UNIQUE (provider, event_id)` |

### 4.4 Settlement (TECH-083, REQ-094)

| Grupo | Categorias (`kind`) | Escrita na W19 |
|---|---|---|
| Receita Luxtory | `membership`, `administration_fee`, `design_build`, `property_services`, `luxchange_fee`, `luxplus`, `rental`, `structuring_commercialization` | só `luxchange_fee` |
| Despesas da Second Home | `second_home_expenses` | fechada |
| Obrigações com terceiros | `brand_partner_obligation`, `investor_margin`, `titular_net` | fechadas |

`beneficiary_party_id` nulo = Luxtory. O relatório mostra cada categoria por moeda (quantidade e soma) e nunca soma
categorias nem grupos; Brand Partner e margem do Investor nunca aparecem como receita Luxtory.

### 4.5 Conciliação (TECH-090, TECH-101)

Item a item, idempotente, com chave `reconciliation:<tipo>:<id>:<execução>`:

| Situação | Ação |
|---|---|
| `pending` além da carência | consulta ao PSP e transição monotônica |
| `approved` sem `fee_charge` nem estorno além da carência | alerta `payment_without_outcome` + estorno (operação `reconciliation`) + PSP |
| estorno `pending` | chamada ao PSP com a chave `refund.id` |
| estorno `failed` sem estorno ativo | nova tentativa + alerta `payment_without_outcome` |

Carência: `PAYMENT_OUTCOME_GRACE_SECONDS` (runbook, sem padrão; ausente → a execução falha fechada). Sem gateway
configurado, a execução é no-op (`unconfigured`).

## 5. Contratos

- **Port** `PaymentGateway` (`billing/application/ports.ts`): `createCharge`, `getCharge`, `refund`, `verifyWebhook`;
  `provider` identifica o adaptador. Fake determinístico: `billing/infrastructure/fake-payment-gateway.ts`.
- **Funções para os commands**: `chargeLuxchangeFee`, `reverseLuxchangeFee`, `recordFeeSettlement` (dentro da
  transação do command); `initiatePayment`, `processRefund`, `reconcilePayment` (fora dela).
- **HTTP**: `POST /v1/webhooks/psp/{provider}` (OpenAPI); job `POST /api/jobs/reconciliation` (cron diário).
- **Banco**: migration `billing_payments` (K5, tabelas, gatilhos, RLS, `app.billing_invariant_breaches()`).
- **Ambiente**: `PAYMENT_GATEWAY` (`fake`, recusado em Production), `PAYMENT_WEBHOOK_SECRET` (fake, ≥ 32),
  `PAYMENT_OUTCOME_GRACE_SECONDS` (runbook).

## 6. Edge cases

- Webhook duplicado, atrasado (`approved` depois de `failed`, `pending` depois de `approved`) → no-op registrado no inbox.
- Webhook com assinatura inválida, timestamp fora da tolerância ou provedor diferente → 401/404 sem tocar o banco.
- Queda depois de `createCharge` e antes de gravar a resposta → pagamento `pending` → webhook ou conciliação resolvem.
- Timeout depois do commit do command → replay idempotente (ADR-006); o pagamento já vinculado não é estornado.
- Termos mudaram entre cotação e envio → valor diferente → recusa (`ERR_PAYMENT_FAILED`) → estorno.
- Vínculo do Fee concorrente com estorno da conciliação → a trava do pagamento serializa; exatamente um vence.
- Estorno falhou no PSP → nova tentativa na execução seguinte + alerta; nunca dois estornos ativos acima do valor.

## 7. Critérios de aceite

- `[BR-230][TECH-082]` Fee = maior entre percentual × PRL total e mínimo publicados; 12% como referência e outros
  percentuais; HALF_UP uma vez; mínimo por operação; sem default.
- `[TECH-025]` retry não duplica cobrança, Fee, estorno nem settlement.
- `[TECH-080][TECH-110]` webhook duplicado ou fora de ordem não regride; aprovado + falha do domínio → estorno; queda →
  conciliação confirma ou estorna.
- `[ADR-008]` pagamento não toca custódia, ocupação nem Créditos.
- `[TECH-082]` Fee nunca vira Crédito; reversão pré-aceite integral.
- `[REQ-094]` relatório por categoria sem total consolidado; Brand Partner e Investor nunca como receita Luxtory;
  categoria sem definição não é gravável.
- Nenhuma cobrança real: K5 fechada; fake recusado em Production.

## 8. Cobertura parcial

- Consumidores reais (W21–W25); finalidades `luxplus`/locação; categorias além do Fee.
- Vínculo PRL total ↔ noites do snapshot (W20/W21) e Fee ↔ Request (W21/W22).
- Encerramentos por perda de elegibilidade revertendo Fee (W21); cancelamento pós-aceite (⛔ P-11).
- PSP real e ativação (P-2, D2, autorização do fundador).
