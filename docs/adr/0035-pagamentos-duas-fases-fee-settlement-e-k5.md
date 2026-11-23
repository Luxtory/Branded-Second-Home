# 0035. Pagamentos em duas fases, Fee por operação, settlement por categoria e K5

- **Date**: 2026-11-22
- **Status**: Accepted (W19 iniciada pelo fundador em 2026-11-22; PR draft)
- **Deciders**: Fundador (Luxtory), agente de engenharia
- **Tags**: architecture, security, database, billing, payments, W19

## Context

A W19 entrega REQ-094 com ADR-006, ADR-008, TECH-025, TECH-080, TECH-081, TECH-082, TECH-083, TECH-090 e TECH-101
(`03` v3.19). Fatos que moldam a decisão:

- TECH-080: pré-validação e registro pendente → cobrança no PSP **fora** da transação de domínio → confirmação
  financeira → transação com travas e revalidação → commit ou estorno/void. Estado financeiro monotônico; duplicidade
  ou ordem inversa não regridem. ADR-008: pagamento não reserva capacidade; TECH-054: pagamento aprovado nunca garante
  a confirmação.
- TECH-025: `fee_charge UNIQUE(operation_id)`, `settlement UNIQUE(operation_id, kind, beneficiary_party_id)`,
  `refund UNIQUE(payment_id, operation_id)`; ADR-006: `webhook_inbox UNIQUE(provider, event_id)`.
- TECH-082: um `fee_charge` por operação; Request paga antes do envio, Direct antes da confirmação; desfechos pré-aceite
  do PD-006 revertem integralmente; Fee nunca vira Crédito. `01` §24 (v10.8, decisão do fundador de 2026-11-22):
  Fee = maior entre 12% do PRL do período e R$ 120 — percentual e mínimo são parâmetros (BR-232), lidos da versão
  vigente registrada no snapshot (TECH-031), nunca de padrão no código (TECH-001, BR-352).
- TECH-083: settlement append-only por natureza e beneficiário; Brand Partner e margem do Investor nunca são
  automaticamente receita Luxtory; categorias separadas; valor líquido do Titular é obrigação apurada. `03` §15:
  repasse bancário e emissão de cobrança fora de escopo.
- O executor de commands (W1, TECH-054) roda cada command numa única transação; os consumidores do pagamento são
  `send_request` (W21), `create_direct` (W23), `buy_luxplus` (W24) e a locação (W25). O PSP não está contratado (P-2).
- Precedentes: capabilities K1–K4 fechadas por `app.capability_activation`; regras críticas nos gatilhos (o papel
  `luxtory_app` é tratado como potencialmente comprometido, ADR-0024 §3); snapshot por operação (ADR-0033 §4).

## Decision

1. **Duas fases sem mudar o executor.** A etapa 1 do TECH-080 materializa-se como `app.payment` em `pending`, gravado e
   confirmado **antes** de qualquer chamada ao PSP — nenhuma cobrança existe sem registro local que a conciliação
   encontre. Cobrança, consulta e estorno acontecem fora de transação, com a chave de idempotência do provedor igual ao
   id local (`payment.id`, `refund.id`). A operação de domínio nasce na etapa 4 pelo executor (TECH-054 inalterado): o
   command consumidor resolve os termos, grava o snapshot, trava o pagamento por último (classe 8 da TECH-053) e o
   vincula com `fee_charge`. Recusa do domínio deixa o pagamento aprovado **sem desfecho**, que é estornado pela
   conciliação — disparada pelo fluxo logo após a recusa e, como rede de segurança, pelo job.
2. **Estados monotônicos no banco.** `payment`: `pending → approved | failed`, ambos terminais; evento repetido, atrasado
   ou contraditório é no-op (nunca regride). `refund`: `pending → succeeded | failed`; nova tentativa é nova linha com
   nova operação, e a soma dos estornos não falhos nunca passa do valor aprovado. O identificador do provedor é gravado
   uma única vez. `fee_charge`, `fee_charge_reversal`, `settlement` e `webhook_inbox` são append-only.
3. **Fee por operação, conferido pelo banco.** O domínio calcula com `luxchangeFee` (`pricing/domain/economic.ts`,
   HALF_UP uma vez no valor final, mínimo por operação). O gatilho de `app.fee_charge` exige: operação `pending` de
   `send_request` ou `create_direct` (BR-230); pagamento `approved`, finalidade `luxchange_fee`, pagador = party que age,
   mesma moeda e mesmo valor; nenhum estorno do pagamento; e valor = `max(round(PRL total × taxa), mínimo)` com a taxa e
   o mínimo das versões registradas no snapshot da operação. O banco repete a regra como conferência (defesa em
   profundidade, como a validade dos Créditos na W17); teste cruzado garante o mesmo resultado nas duas implementações.
   O PRL total entra como valor do Fee; o vínculo com as noites do snapshot nasce com elas (W20/W21).
4. **Reversão integral (PD-006).** `app.fee_charge_reversal` (uma por Fee) + estorno `pending` do valor integral, na
   mesma transação do desfecho pré-aceite. Só Fee de `send_request` é revertido assim (Direct não tem pré-aceite); os
   commands permitidos são os desfechos do PD-006 já nomeados no TECH-051 (`withdraw_request`, `reject_request`,
   `accept_request` para as concorrentes) e o job `expire_requests`; os encerramentos por perda de elegibilidade entram
   com a W21 por migration. Fee revertido não pode ser apurado como receita, e Fee apurado não pode ser revertido. Nada
   disso toca Créditos: o Fee é sempre dinheiro (BR-231, TECH-082).
5. **Settlement fechado por categoria.** `app.settlement.kind` tem a lista fechada do TECH-083 mais `titular_net`
   (valor líquido devido ao Titular). Cada categoria pertence a um grupo fixo — receita Luxtory (Membership, Taxa de
   Administração, Design & Build, Property Services, Luxchange Fee, Luxplus, locação, estruturação/comercialização),
   despesas da Second Home, obrigações com terceiros (Brand Partner, margem do Investor, líquido do Titular) — e o
   relatório nunca soma categorias nem grupos. O papel da aplicação só grava categorias **habilitadas**: a W19 habilita
   apenas `luxchange_fee` (vinculado a um Fee não revertido, mesmo valor, beneficiária a Luxtory, commands
   `accept_request` ou `create_direct`); as demais são recusadas (`settlement_kind_not_enabled`) até a wave dona definir
   valores e beneficiários (BR-352). `UNIQUE NULLS NOT DISTINCT (operation_id, kind, beneficiary_party_id)`, com
   `beneficiary_party_id` nulo = Luxtory.
6. **Webhook autenticado e replay-safe.** `POST /v1/webhooks/psp/{provider}` aceita só o provedor configurado; o
   adaptador autentica (HMAC sobre `timestamp.corpo`, tolerância do protocolo do provedor) antes de qualquer acesso ao
   banco; `app.webhook_inbox` deduplica por `(provider, event_id)` na mesma transação que aplica a transição monotônica.
   O inbox guarda só o hash do corpo, o tipo e o resultado — nunca o payload bruto.
7. **Port + fake.** `PaymentGateway` com cobrança, consulta, estorno/void, verificação de webhook e idempotência; a
   confirmação é o status `approved` obtido na resposta, na consulta ou no webhook autenticado. O fake determinístico
   existe para testes e desenvolvimento e é recusado em Production (`PAYMENT_GATEWAY=fake` com
   `VERCEL_ENV=production` invalida o ambiente). Sem `PAYMENT_GATEWAY`, pagamentos ficam indisponíveis
   (`ERR_UNAVAILABLE`); nenhuma integração com PSP real.
8. **K5 `payments` fechada.** O CHECK de `app.capability_activation` ganha `payments`, sem linha. Sem ela, o papel da
   aplicação não grava pagamento, Fee, reversão, estorno, settlement ou inbox (`payments_not_activated`). Ativar exige
   migration, PSP contratado, política de backup (D2) e autorização do fundador. **Condição obrigatória para ativar a K5 (fundador, 2026-11-23):** validação confiável da aprovação pelo PSP real. Como o banco não fala com o PSP, um servidor comprometido com a credencial do `luxtory_app` poderia gravar `approved` sem aprovação real; antes da ativação, o adaptador do PSP contratado precisa confirmar cada aprovação na fonte do provedor (webhook autenticado pelo protocolo dele e/ou consulta servidor-a-servidor) e a conciliação precisa comparar todo `approved` com o provedor, alertando divergência. Nada disso é implementado na W19 (sem integração fictícia); é critério de aceite da wave que integrar o PSP.
9. **Conciliação (TECH-090 `reconciliation`, TECH-101).** Command de sistema por item, com chave por execução: pagamento
   `pending` além da carência → consulta ao PSP; pagamento `approved` sem desfecho além da carência → alerta
   `payment_without_outcome` + estorno; estorno `pending` → chamada ao PSP; estorno `failed` → nova tentativa + alerta.
   A carência é valor do runbook (`PAYMENT_OUTCOME_GRACE_SECONDS`, sem padrão); sem gateway configurado, o job é no-op.
   A trava do pagamento serializa vínculo do Fee e estorno: um pagamento com estorno nunca é vinculado, e um pagamento
   vinculado só é estornado pela reversão do Fee.
10. **Relatório Admin.** `/admin/financeiro` (Admin): settlement por categoria e moeda, agrupado sem total consolidado,
    e o estado da conciliação (pendentes, aprovados sem desfecho, estornos pendentes e falhos). Só leitura.

## Consequences

### Positive

- Nenhuma cobrança sem registro local; nenhuma regressão de estado; retry, webhook duplicado e corrida
  vínculo × estorno têm um único efeito garantido pelo PostgreSQL.
- O executor e as W13–W18 não mudam; W21–W25 consomem funções prontas.
- O Fee sai sempre da regra parametrizada do `01` com as versões do snapshot; 12% só existe como valor publicado.

### Negative

- Sem PSP contratado, nada é cobrado: a W19 é infraestrutura desativada (K5 fechada, gateway ausente em Production).
- O PRL total do Fee só é amarrado às noites do snapshot na W20/W21.
- O pagador precisa refazer o fluxo se os termos mudarem entre a cotação e o envio (o pagamento é estornado).

### Neutral / follow-ups

- W20/W21: noites do snapshot e vínculo PRL total ↔ noites; encerramentos por inelegibilidade revertendo o Fee;
  vínculo Fee ↔ Request. W22: apuração do Fee no aceite. W23: Direct paga e confirma na mesma operação. W24/W25:
  finalidades `luxplus`/locação, categorias `luxplus`, `rental` e `titular_net` habilitadas com seus valores. P-11
  segue aberta para o cancelamento pós-aceite.

## Alternatives considered

- **Executor com operação pré-criada em duas transações.** Muda o núcleo usado por W1–W18. Rejeitada.
- **Fee calculado só no banco.** Duplicaria a fonte da regra no domínio; o banco apenas confere. Rejeitada.
- **Estado do pagamento por eventos sem coluna.** Mais custo de leitura sem ganho de integridade. Rejeitada.
- **Habilitar todas as categorias de settlement.** Permitiria valores e beneficiários não definidos (BR-352). Rejeitada.
- **Taxa fixa por plano e pagamento após o aceite (Luxtory2.0).** Contraria o `01` §24 e o TECH-082. Rejeitada.
- **Integração Stripe já na W19.** PSP não contratado (P-2, TECH-081: fornecedor é decisão de contratação). Rejeitada.
