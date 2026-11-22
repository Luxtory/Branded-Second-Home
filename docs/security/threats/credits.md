# Threat Model: credits — lotes, ledger, snapshot e Carteira (W17)

- **Date**: 2026-11-22
- **Author(s)**: agente de engenharia (revisão: fundador + auditoria independente)
- **Status**: Draft (PR draft da W17)
- **Scope**: `app.credit_lot`, `app.credit_entry`, `app.economic_snapshot`, `app.economic_snapshot_parameter`,
  `app.credit_expires_at`, K4 `credits`; funções de originação, Garantia, liberação e consumo; commands
  `reverse_credit` e `expire_credit_lots`; tela `/titular/carteira`
- **Linked spec**: `docs/specs/credits.md`
- **Linked ADR(s)**: ADR-0033, ADR-0032, ADR-0031, ADR-0026

## 1. Overview

Créditos são unidade operacional interna (BR-190) com efeito econômico: um lote forjado, um gasto duplo ou uma
transferência entre parties muda acesso a capacidade de terceiros. A W17 entrega o mecanismo com a K4 fechada: nenhum
command de usuário origina ou gasta Créditos nesta wave. A Carteira é só leitura.

## 2. Assets

- Integridade de lotes e ledger (quantidade, party, validade, origem) — INV-6.
- Validade (`expires_at`) e sua independência do job e do relógio do servidor (TECH-044).
- Snapshot dos valores usados (TECH-031).
- Confidencialidade do saldo e do histórico de cada party (dado pessoal indireto); `basis` das reversões (interno).

## 3. Trust boundaries

Navegador → servidor (sessão Supabase, delegação vigente) → PostgreSQL. O papel `luxtory_app` é tratado como
potencialmente comprometido: as regras críticas estão nos gatilhos, privilégios e K4, não só no código (ADR-0024 §3).

## 4. STRIDE

| Ameaça | Cenário | Mitigação |
|---|---|---|
| **S** Spoofing | Titular gasta Créditos de outra party; ator forja operação de outro usuário | Garantia/consumo direto exigem `acting_party_id` = party do lote e representação vigente (`app.lock_own_use_representation`); reversão revalida a atribuição Admin (`app.lock_own_use_admin_authority`); leitura por RLS só das parties representadas |
| **T** Tampering | Inserir lote sem origem, alterar buckets ou `expires_at`, apagar movimento, reverter duas vezes | K4; papel da aplicação sem UPDATE/DELETE; buckets escritos só pelo gatilho do ledger; originação só por `deposit_capacity`/`accept_request` da operação `pending`, com snapshot conferido; colunas imutáveis e ledger append-only protegidos por gatilho; saldo por movimento-pai; CHECKs de bucket ≥ 0 |
| **R** Repudiation | Admin nega uma reversão; command nega um gasto | Todo movimento aponta para a operação (ator, papel, base, instante) e para o command gravado pelo banco; auditoria do executor; `basis` obrigatória na reversão |
| **I** Information disclosure | Titular lê saldo de outra party; `basis` ou dados de operação expostos | RLS por delegação vigente; privilégio por coluna (sem `basis`); snapshot sem GRANT a `authenticated`; logs sem quantidades por party nem PII |
| **D** Denial of service | Job lento ou falho deixa saldo vencido utilizável; concorrência trava lotes | Uso confere `expires_at` no banco em toda operação (job nunca é a única proteção, TECH-090); orçamento de tempo do job e itens independentes; travas em ordem total (TECH-053) com `lock_timeout` e retry com a mesma chave |
| **E** Elevation of privilege | Command fora da matriz move Créditos; Titular sem Membership usa saldo | Matriz movimento × command no banco; Membership `active` conferido no executor e no gatilho (`FOR SHARE`); K4 fechada até autorização do fundador |

## 5. Abuse cases

- **Gasto duplo concorrente**: dois gastos sobre o mesmo saldo — travas `FOR UPDATE` em ordem FEFO + bucket ≥ 0; teste
  CONC-8.
- **Retry de originação**: mesma operação/party → `UNIQUE(origin_operation_id, party_id)`; mesma chave → replay.
- **Validade forjada**: `originated_at`/`expires_at` vindos da entrada são ignorados (gravados pelo banco a partir do
  snapshot); snapshot com versão não vigente é recusado.
- **Cron atrasado**: lote vencido é inutilizável antes do job; o job não altera `expires_at`.

## 6. Residual risks

- Um servidor comprometido com a credencial do `luxtory_app`, depois da ativação da K4, pode criar uma operação
  `pending` citando um command permitido e uma delegação real (o banco não autentica a sessão) — mesmo risco residual da
  W12–W16; auditoria e invariantes registram. Antes da ativação, nenhuma escrita de Créditos é possível.
- O vínculo Garantia × Request só fica no banco na W21.
