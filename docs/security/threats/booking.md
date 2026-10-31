# Threat Model: reserva de uso próprio (W12)

- **Date**: 2026-10-31
- **Author(s)**: Engenharia
- **Status**: Draft (risco residual pendente de ratificação do fundador)
- **Scope**: command `create_own_use_booking` (Server Action da Área do Titular), regras no banco de reserva, custódia
  `spe_pool → reserved_right`, consumo do Direito de Uso e ocupação `own_use`; ativação privilegiada; leituras do Titular
  e notificação de confirmação
- **Linked spec**: `docs/specs/booking.md`
- **Linked ADR(s)**: ADR-0021, ADR-0024, ADR-0025, ADR-0026

## 1. Overview

O Titular (Owner ou Co-Owner, por delegação ativa da party que detém a holding) reserva noites de uso próprio. A reserva
bloqueia noites para todos (INV-1) e, no Co-Owner, consome o Direito de Uso (saldo por categoria e exercício). O servidor
autentica a sessão (Supabase, ES256) e autoriza; o banco aceita só efeitos canônicos presos à reserva da mesma operação e
só com a ativação privilegiada presente. Dados: ids pseudônimos (party, holding, Ação), datas; nenhum documento.

## 2. Assets

- Direito de Uso dos Co-Owners (saldo por categoria e exercício) e a capacidade das noites (INV-1, INV-2).
- Vantagem temporal das janelas (BR-103, BR-104) e o limite de permanência (BR-111, BR-112).
- Isolamento entre Titulares (reservas, saldos, notificações).
- A decisão de ativação (só depois da W13 e por autorização do fundador).

## 3. Actors

| Actor | Trust level | Notes |
|---|---|---|
| Titular com sessão e delegação ativa | low | só a party que representa, só a Second Home da holding vigente |
| Usuário sem delegação / delegação revogada ou expirada | untrusted | o guard e o banco negam |
| Servidor da aplicação (`luxtory_app`) | trusted boundary | autentica e autoriza; se comprometido, ver T-1201 |
| Dono do schema / superusuário | privileged | migrations e break-glass; contorna gatilhos (D5, até a W30) |

## 4. Threats (STRIDE)

### T-1201 [HIGH] Spoofing/Tampering — reserva em nome de Titular que não a pediu (credencial `luxtory_app` comprometida)

- **Vector**: SQL direto com o papel da aplicação, escolhendo qualquer party com holding vigente (o papel cria e ativa
  delegações; delegação não é barreira).
- **Mitigation**: sem a linha em `app.capability_activation` (que só o dono escreve), toda escrita da W12 é recusada;
  com ela, o banco só aceita reserva canônica e completa: noites seladas e futuras, janela aberta, saldo, ≤ 14 noites
  seguidas, uma ocupação por noite, `reserved_right` e consumo da mesma operação, Ação e noite.
- **Residual (R1, pendente de ratificação)**: com a ativação presente, reservas canonicamente válidas em nome de Titular
  vigente — Co-Owner até o saldo das janelas abertas; Owner, todas as noites seladas livres; notificação gerada ou
  suprimida pelo mesmo papel. Remédio só com o cancelamento da W13 (R4: a menos de 15 dias do check-in, a W13 decide).
- **Owner**: Engenharia · **Tracking**: `tests/migrations/booking.db.test.ts`

### T-1202 [MEDIUM] Tampering — burlar o instante (reservar noite já iniciada)

- **Vector**: transação aberta antes do check-in que confirma depois; `SET CONSTRAINTS ALL IMMEDIATE` para antecipar
  checagens diferidas e então esperar.
- **Mitigation**: condições temporais checadas no instante de **cada escrita** (`clock_timestamp()`), não no início da
  transação nem só no COMMIT; checagens diferidas são só estruturais (completude, permanência) e falham se antecipadas.
- **Residual (R2)**: o COMMIT pode ocorrer depois do check-in numa transação forjada; as escritas foram validadas antes e
  a custódia ficou travada. Detecção só com `track_commit_timestamp` (desligado; opção da W30).
- **Tracking**: `booking.db.test.ts` (bordas T3 e limite documentado)

### T-1203 [MEDIUM] Elevation — representação perdida no ponto de decisão

- **Vector**: revogar a delegação (ou deixá-la expirar) enquanto a reserva está em curso.
- **Mitigation**: `FOR SHARE` na delegação no guard transacional e no gatilho da reserva (a revogação espera, ou a reserva
  relê a linha revogada); validade conferida no instante de cada escrita.
- **Tracking**: `booking.db.test.ts` (duas ordens), `own-use-booking.db.test.ts` (retry com delegação revogada)

### T-1204 [MEDIUM] Tampering — corrida de saldo, permanência ou noite

- **Vector**: reservas concorrentes da mesma Ação (inclusive dois representantes da mesma party) ou de Ações diferentes.
- **Mitigation**: trava da Ação tomada também pelo gatilho da reserva (serializa saldo e permanência no banco); linha do
  saldo com `CHECK`; `uq_occupancy_active`; travas das noites em ordem (TECH-053).
- **Tracking**: `own-use-booking.db.test.ts` (CONC-1, CONC-2, CONC-3), `booking.db.test.ts` (adjacência entre transações)

### T-1205 [MEDIUM] Information disclosure — reservas, saldos ou notificações de outro Titular

- **Vector**: consulta direta como `authenticated`, com ids de terceiros ou colunas internas.
- **Mitigation**: RLS por holding vigente representada; privilégio de coluna sem Ação, reserva, operação ou party de
  terceiros; `app.notification` com RLS por party representada. As claims vêm do servidor: protegem contra bug, não
  contra servidor comprometido (que lê as tabelas diretamente).
- **Tracking**: `own-use-booking.db.test.ts` (dois Titulares, revogação, expiração, colunas negadas)

### T-1206 [LOW] Repudiation — autoria da reserva depois de uma transferência

- **Mitigation**: `booking.holding_id` imutável (party da época) e `operation.actor_user_id`; notificação à party que
  reservou, fixada no evento. Operação e auditoria são gravadas pelo mesmo papel (R5): sinal, não prova, até a W30.

### T-1207 [LOW] Denial of service — reservas em massa ou travas longas

- **Mitigation**: idempotência por chave; teto pelas noites seladas (≤ 2 exercícios) e, no Co-Owner, saldo e 14 noites;
  travas com `lock_timeout` do executor. Sem rate limit no command autenticado (decisão registrada no ADR-0026): o
  domínio limita o efeito. Uma sessão pendurada pode atrasar a desativação (runbook: `lock_timeout` e encerrar sessões).

## 5. Out of scope

Cancelamento, restauração, liberação e correção (W13); `reserved_right` devolvido (W21/W22); transferência (W28); selo
da auditoria e reconciliação (W30).
