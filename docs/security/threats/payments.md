# Threat Model: payments — pagamento, Fee, estorno, settlement e webhook (W19)

- **Date**: 2026-11-22
- **Author(s)**: agente de engenharia (revisão: fundador + auditoria independente)
- **Status**: Draft (PR draft da W19)
- **Scope**: `app.payment`, `app.fee_charge`, `app.fee_charge_reversal`, `app.refund`, `app.settlement`,
  `app.webhook_inbox`, K5 `payments`; port `PaymentGateway` e fake; `POST /v1/webhooks/psp/{provider}`; job
  `reconciliation`; `/admin/financeiro`
- **Linked spec**: `docs/specs/billing.md`
- **Linked ADR(s)**: ADR-0035, ADR-0033, ADR-0032, ADR-0024

## 1. Overview

A W19 cria a primeira superfície que move dinheiro e o primeiro endpoint chamado por terceiro (PSP). Entrega a
infraestrutura com a K5 fechada e sem PSP real: nenhuma cobrança é possível em Production.

## 2. Assets

- Integridade dos valores cobrados, estornados e apurados (dinheiro em unidade mínima + moeda).
- Unicidade dos efeitos (uma cobrança, um Fee, um estorno ativo, um settlement por chave).
- Estado financeiro monotônico.
- Segredo do webhook; credenciais futuras do PSP.
- Separação das categorias econômicas (REQ-094) e confidencialidade dos valores por party.

## 3. Trust boundaries

PSP → endpoint de webhook (Internet, não autenticado na borda) → servidor → PostgreSQL. Navegador → servidor (sessão,
delegação). Servidor → PSP (saída). O papel `luxtory_app` é tratado como potencialmente comprometido (ADR-0024 §3).

## 4. STRIDE

| Ameaça | Cenário | Mitigação |
|---|---|---|
| **S** Spoofing | Terceiro forja webhook "aprovado"; usuário paga em nome de outra party | HMAC do provedor sobre `timestamp.corpo` verificado antes de qualquer acesso ao banco, comparação em tempo constante; provedor da rota = provedor configurado; pagamento só por quem representa a party (`app.lock_own_use_representation`); Fee exige pagador = party que age |
| **T** Tampering | Alterar valor, regredir estado, reusar pagamento em outra operação, estornar acima do pago, apurar Fee revertido | K5; colunas imutáveis por gatilho; transições monotônicas no banco; `fee_charge` único por operação e por pagamento; valor do Fee recalculado no banco com as versões do snapshot; Σ estornos não falhos ≤ valor; reversão × settlement mutuamente exclusivos sob a trava do pagamento; append-only |
| **R** Repudiation | PSP ou operador nega um evento; Admin nega um estorno | `webhook_inbox` com id do evento, hash do corpo e resultado; toda escrita econômica aponta para a operação (ator, papel, instante) com auditoria do executor |
| **I** Information disclosure | Payload do PSP com dado pessoal em log/banco; valores por party expostos | Inbox guarda só hash, tipo e resultado; logs com ids técnicos e códigos (TECH-100); RLS sem leitura por `anon`/`authenticated`; relatório só para Admin, agregado por categoria |
| **D** Denial of service | Inundação do webhook; job lento | Limite de corpo (64 KiB) e rejeição por assinatura antes do banco; inbox deduplica; job com orçamento de tempo e itens independentes; travas em ordem total com `lock_timeout` |
| **E** Elevation of privilege | Escrita direta pelo papel da aplicação; categoria de settlement indefinida; fake em Production | K5 sem linha; commands permitidos por tabela no banco; só `luxchange_fee` habilitada; `PAYMENT_GATEWAY=fake` invalida o ambiente em Production |

## 5. Abuse cases

- **Replay de webhook**: mesmo evento → `UNIQUE(provider, event_id)`; evento antigo reassinado fora da tolerância →
  401; evento legítimo atrasado → transição monotônica não regride.
- **Duplo clique no pagamento**: mesma chave → mesmo pagamento; chave nova → outro pagamento, mas só um vincula Fee
  (`UNIQUE(operation_id)`); o órfão é estornado pela conciliação.
- **Corrida vínculo × estorno**: ambos travam o pagamento; com estorno, o vínculo é recusado; com vínculo, o estorno
  órfão é recusado.
- **Termos alterados após a cotação**: o banco recalcula o Fee com o snapshot; valor diferente → recusa → estorno.

## 6. Residual risks

- Servidor comprometido com a credencial do `luxtory_app`, após a ativação da K5, pode gravar `approved` sem o PSP ter
  aprovado (o banco não fala com o PSP). Mitigação futura: conciliação com o PSP real compara cada `approved` com a
  consulta do provedor. Antes da ativação, nenhuma escrita é possível.
- O PRL total do Fee só fica amarrado às noites do snapshot na W20/W21.
- Sem limitador por IP no webhook (o PSP não tem origem fixa garantida); a assinatura barra o custo de banco.
