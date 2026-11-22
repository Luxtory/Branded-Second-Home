# Spec: credits

- **Status**: W17 — E0–E4 em PR draft (#106); aguardando auditoria e autorização de merge
- **Owner**: módulo `credits` (TECH-011)
- **IDs**: REQ-053, REQ-054, PD-008, INV-6 (dona, W17); ADR-007, TECH-025, TECH-031, TECH-044, TECH-051, TECH-053,
  TECH-054, TECH-070, TECH-071, TECH-072, TECH-090; complementos REQ-096 (estados do Crédito), REQ-098, TECH-001,
  TECH-052, TECH-056
- **Plano**: [`w17-creditos-e-carteira.md`](../plan/w17-creditos-e-carteira.md) · **Decisão**:
  [ADR-0033](../adr/0033-creditos-lote-ledger-snapshot-e-k4.md) · **STRIDE**:
  [`threats/credits.md`](../security/threats/credits.md)

## 1. Goal

Créditos por lote com ledger imutável (ADR-007), consumo FEFO (PD-008), Garantia (TECH-071), validade calendárica em
UTC independente de job (TECH-044, TECH-072), reversão compensatória (TECH-070) e Carteira não monetária com extrato
(REQ-053, REQ-054), com INV-6 garantido pelo banco.

## 2. Non-goals

- Jornadas que originam ou gastam Créditos: depósito (W20), envio de Request (W21), aceite/recusa (W22), Direct (W23).
- Notificação de originação (W20) e aviso de expiração próxima (⛔ P-7).
- Tela ou rota Admin de `reverse_credit` (sem consumo a reverter antes da W22/W23).
- Qualquer apresentação de Créditos como dinheiro, investimento, saldo resgatável, venda, cessão ou transferência
  (BR-190, BR-192, REQ-053, REQ-101).

## 3. Users / actors

- **Titular** (party representada por delegação vigente): consulta a Carteira e o extrato.
- **Admin**: `reverse_credit` (Admin + base registrada, TECH-051).
- **Sistema**: job `expire_credit_lots` (TECH-090).
- **Commands das waves seguintes**: chamam as funções de originação, Garantia, liberação e consumo.

## 4. User stories

- Como Titular, vejo quantos Créditos posso usar agora, quantos estão em Garantia, consumidos e expirados, e por quê
  não posso usá-los quando o Membership não está vigente.
- Como Titular, vejo cada lote com origem, quantidade, data de originação e validade, e o extrato com data, tipo,
  quantidade, lote e operação de cada movimento.
- Como Admin, corrijo um consumo indevido por reversão com base registrada, sem criar Crédito nem mudar a party.

## 5. Contracts

### 5.1 Banco (migrations `pricing_economic_snapshot`, `credits_ledger`)

- `app.economic_snapshot(operation_id PK → operation, resolved_at, created_at)` — um por operação; `resolved_at` entre
  o início da transação e o instante da inserção; operação `pending`.
- `app.economic_snapshot_parameter(operation_id → economic_snapshot, parameter_key, parameter_id → parameter)`, PK
  `(operation_id, parameter_key)`; a versão é global, da chave e vigente em `resolved_at` (`app.parameter_at`).
- `app.credit_lot(id, party_id → party, quantity > 0, held, consumed, expired ≥ 0, available GENERATED ≥ 0,
  originated_at, expires_at, origin_operation_id → operation, origin_command)` — `UNIQUE(origin_operation_id,
  party_id)` (TECH-025); índice FEFO `(party_id, expires_at, originated_at, id)`. Inserção: o servidor informa só
  `id`, `party_id`, `quantity` e `origin_operation_id`; o banco grava o resto (ADR-0033 §3).
- `app.credit_entry(id, lot_id, operation_id, command, movement, from_bucket, to_bucket, quantity > 0,
  parent_entry_id, basis, created_at)` — append-only; pares e commands da ADR-0033 §2; `basis` obrigatória só na
  reversão; `created_at` e `command` gravados pelo banco.
- `app.credit_expires_at(originated_at, months)` — `((originated_at AT TIME ZONE 'UTC') + months) AT TIME ZONE 'UTC'`;
  o PostgreSQL ajusta ao último dia válido do mês (31/08 + 24 → 31/08; 29/02 + 12 → 28/02; 31/01 + 1 → 28/02 ou 29/02).
- `app.credit_invariant_breaches()` — consultada após todo teste `db` (ADR-0033 §10).
- K4: `credits` no CHECK de `app.capability_activation`, sem linha (ADR-0033 §8).
- Constraints nomeadas → código (TECH-056): `credits_*` → `ERR_CREDITS_INSUFFICIENT`; `credit_membership_ineligible`
  → `ERR_MEMBERSHIP_INELIGIBLE`; `permission_representation`/`permission_staff_role` → `ERR_PERMISSION`. Procedência,
  par ou command fora da matriz são falhas técnicas (`credit_*`); K4 fechada (`credit_capability_not_activated`) é
  funcionalidade fechada (`CLOSED_CAPABILITIES`: rollback sem recusa gravada, como K1–K3).

### 5.2 Aplicação (`src/features/credits`)

Todas recebem a transação e a `LockSequence` do command (TECH-054) e travam `credit_lot` na classe 7, depois de
Membership e das classes 4–6 que o command usar.

- `originateCreditLot({ operationId, partyId, quantity, terms })` — persiste o snapshot dos `terms`
  (`EconomicTerms` da W16, com `credit_validity_months`) e insere o lote. Devolve `{ lotId, quantity, originatedAt,
  expiresAt }`.
- `holdCredits({ operationId, partyId, quantity, coverUntil })` — Garantia FEFO entre lotes com `expires_at ≥
  coverUntil`; `ERR_CREDIT_HOLD_INVALID` / `ERR_CREDITS_INSUFFICIENT` (ADR-0033 §6).
- `consumeCredits({ operationId, partyId, quantity })` — consumo FEFO direto (`available → consumed`).
- `consumeHold({ operationId, holdOperationId })` / `releaseHold({ operationId, holdOperationId })` — todo o saldo
  ainda reservado pela operação de Garantia: consome, ou libera para `available`/`expired` conforme a validade.
- Quantidades são decimais exatos em string (`numeric`, TECH-033); nada é arredondado.

### 5.3 Commands

- `reverse_credit` (Admin, `not_applicable`; TECH-051): entrada `{ consumption_entry_id: uuid, quantity: decimal,
  basis: string(1..2000) }`. Trava o lote, confere o saldo reversível do consumo e grava `consumed → available` antes
  de `expires_at` ou `consumed → expired` depois (TECH-070). Sem tela nem rota nesta wave.
- `expire_credit_lots` (sistema, job do TECH-090): entrada `{ lot_id }`; registra `available → expired` de todo o
  saldo disponível do lote vencido; nada a expirar → `ERR_STATE_TRANSITION` (o job conta como ignorado). O job lista os
  lotes com `available > 0` e `expires_at ≤ now()` de qualquer data (recupera atrasos) e usa a chave
  `expire_credit_lots:<lot>:<correlation>`. Cron diário em `vercel.json`.

### 5.4 Carteira (`/titular/carteira`)

- Uma Carteira por party representada (título da party só quando houver mais de uma).
- **Saldo**: Disponível (ou "Indisponível por Membership" quando o Membership não está `active`), Em Garantia,
  Consumido, Expirado — totais exatos, em número pt-BR seguido de "Créditos". Saldo de lote vencido ainda não
  materializado pelo job aparece como Expirado (TECH-044).
- **Lotes** (validade mais próxima primeiro): origem, quantidade originada, disponível, data de originação, validade,
  situação.
- **Extrato** (mais recente primeiro): data, tipo, quantidade, lote e operação; filtro por tipo e paginação (20 por
  página) por parâmetros de URL, sem JavaScript obrigatório.
- Estados vazio, sem representação e indisponível. Mobile-first com paridade (ADR-0009).
- Lote e operação aparecem pela referência curta (8 primeiros hexadecimais do id); nenhuma base de reversão nem
  movimento-pai (fora do `GRANT` de coluna do `authenticated`).
- Party pedida pela URL (`pessoa`) que o usuário não representa recebe a primeira representada (sem oráculo).
- Área do Titular: seção "Créditos Luxchange" (disponível agora, somado entre as parties representadas) só quando há
  ao menos um lote visível — com a K4 fechada, nenhuma Área muda.
- Composição só de classes `lx-*` existentes (ADR-0003, consumer-driven): nenhum componente novo no Design System.

## 6. Acceptance criteria

- `[INV-6]` gasto duplo, transferência e origem inválida falham.
- `[TECH-025]` retry não duplica o lote.
- `[PD-008]` consome o lote que vence antes; empate pela originação mais antiga.
- `[TECH-044]` 31/08 + 24 meses → 31/08; 29/02 + 12 meses → 28/02; job atrasado não prorroga a validade.
- `[CONC-8]` mesmos Créditos sob concorrência: exatamente um gasto confirma.
- `[TECH-070]` reversão após a expiração vira `expired`; antes, `available`.
- `[REQ-053]` Membership inelegível bloqueia uso sem pausar validade; reativação restabelece o saldo válido; a Carteira
  não usa formato monetário nem oferece venda ou cessão.
- `[REQ-054]` extrato com data, tipo, quantidade, lote e operação.

## 7. Edge cases

- EC-6 (`02` §15): Créditos próximos da expiração ao entrar em Garantia — lote que vence antes do prazo da Request não
  cobre a Garantia.
- Lote vencido com Garantia pendente: segue `held`, inutilizável; ao liberar vira `expired` (TECH-072).
- Lote vencido antes do job: inutilizável e exibido como expirado; o job registra depois, sem mudar `expires_at`.
- Membership suspenso/encerrado: saldo preservado e validade correndo; reativação depois do vencimento não restaura.
- Parâmetro `credit_validity_months` ausente no instante → `ERR_PARAMETER_MISSING` (TECH-001); nada é presumido.

## 8. Security considerations

Ver [STRIDE](../security/threats/credits.md): K4 fechada, escrita só por movimento validado no banco, party imutável,
RLS de leitura por delegação vigente, `basis` invisível ao Titular, nenhum dado pessoal em logs.

## 9. Observability

Logs estruturados do executor (command, operação, desfecho, `correlation_id`) e do job (contagens `expired`,
`skipped`, `failed`); nenhuma quantidade por party em log.

## 10. Rollout plan

Merge aplica as duas migrations (68 no total) com K4 sem linha: nada originado, nada gasto. O cron do job roda sem
itens. Ativar a K4 exige migration e autorização do fundador (junto com a W20, primeira originadora).

## 11. Open questions

- P-7: antecedência do aviso de expiração próxima (REQ-097).

## 12. References

`01` BR-190–196 · `02` REQ-053, REQ-054, REQ-096, PD-008, INV-6, §15 · `03` ADR-007, TECH-025, TECH-031, TECH-044,
TECH-051–054, TECH-070–072, TECH-090, §7 · ADR-0031, ADR-0032, ADR-0033.
