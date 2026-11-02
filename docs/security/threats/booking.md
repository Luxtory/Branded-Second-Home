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
- **Mitigation**: RLS por holding vigente representada; a reserva só é lida pela holding que a abriu
  (`h.id = booking.holding_id`, E5b) — nem outra Ação da mesma Second Home, nem titular anterior da Ação, nem reservas sem
  Ação de outra holding no Owner; privilégio de coluna sem Ação, holding, operação ou party (nem para filtrar); `channel`
  só da própria reserva; `app.notification` com RLS por party representada. As claims vêm do servidor: protegem contra
  bug, não contra servidor comprometido (que lê as tabelas diretamente). O calendário recebe a situação de cada noite já
  resolvida (sem Ação, reserva, operação ou valor de terceiros); a prévia e a página de reserva respondem 404/"proibido"
  para holding não representada, sem oráculo.
- **Tracking**: `own-use-booking.db.test.ts` (dois Titulares, revogação, expiração, colunas negadas; canal, id forjado,
  SQL direto como `authenticated`, transferência de Co-Owner e Owner; calendário sob RLS); E2E
  `own-use-booking.spec.ts` (outro Titular → 404 no calendário)

### T-1206 [LOW] Repudiation — autoria da reserva depois de uma transferência

- **Mitigation**: `booking.holding_id` imutável (party da época) e `operation.actor_user_id`; notificação à party que
  reservou, fixada no evento. Operação e auditoria são gravadas pelo mesmo papel (R5): sinal, não prova, até a W30.

### T-1208 [LOW] Information disclosure/Tampering — janela e prévia lidas pelo papel da aplicação (E5b)

- **Vector**: a janela da Ação e a prévia leem fatos da formalização, do sorteio, da custódia e do saldo com o papel da
  aplicação (o Titular não lê as posições de outras Ações nem a custódia de terceiros por RLS).
- **Mitigation**: só depois de a RLS provar a holding (delegação ativa + holding vigente); a saída é só desta holding
  (data de abertura da própria janela; motivos com datas, nunca quem ocupa); a prévia roda em transação só de leitura,
  sem travas, e não decide — a confirmação revalida tudo no banco (ADR-0026).
- **Perda de representação entre etapas (auditoria do PR #78)**: prova e leitura privilegiada acontecem na mesma
  transação `REPEATABLE READ` só de leitura (`withUserThenServerRead`: RLS como `authenticated`, depois `RESET ROLE` e
  claims limpas, no mesmo snapshot). Uma revogação confirmada antes do snapshot faz a RLS devolver nada (→ "proibido");
  uma confirmada depois não é vista por nenhuma das duas fases — a resposta corresponde a um instante em que a
  representação valia. Limite: o snapshot dá consistência, não vigência — não impede revogação posterior, e a resposta
  pode chegar a quem acabou de perder a representação (só a regra desta holding, sem escrita). Por isso a prévia não
  vincula: a confirmação confere a representação de novo no guard e no gatilho (T-1203). Travar a delegação na prévia
  não daria garantia útil a uma leitura não vinculante.
- **Enumeração**: holding não representada, inexistente ou de outro Titular → a mesma resposta "proibido" (sem oráculo;
  ids UUID). Para a holding representada, a prévia não diz nada que o calendário da mesma holding já não mostre: noites
  indisponíveis como fato, sem Ação, reserva ou pessoa; janela, saldo, 29/02 e adjacência só desta Ação. Residual,
  aceito pela regra: no Co-Owner a adjacência conta por Ação (TECH-045), então depois de uma transferência a mensagem de
  permanência indica que noites vizinhas indisponíveis são desta Ação — sem expor quem as reservou (W28 revisa).
- **Tracking**: `preview-own-use-booking.test.ts`; `own-use-booking.db.test.ts` (prévia concorda com o command;
  calendário de holding alheia → nada; transferência); `identity.db.test.ts` (`withUserThenServerRead`: papel e claims
  de cada fase, só leitura, sem prova a fase do servidor não roda)

### T-1207 [LOW] Denial of service — reservas em massa ou travas longas

- **Mitigation**: idempotência por chave; teto pelas noites seladas (≤ 2 exercícios) e, no Co-Owner, saldo e 14 noites;
  travas com `lock_timeout` do executor. Sem rate limit no command autenticado (decisão registrada no ADR-0026): o
  domínio limita o efeito. Uma sessão pendurada pode atrasar a desativação (runbook: `lock_timeout` e encerrar sessões).
  Prévia (E5b): só Titular autenticado com holding autorizada pela RLS, intervalo validado (≤ 800 noites, saídas antes
  de qualquer consulta para datas fora do calendário), uma transação só de leitura sem travas; sem rate limit próprio
  (o limitador do projeto é para escritas públicas por origem de rede) — endurecimento possível com a W30.
  Proporcionalidade (auditoria do PR #78): o teto de 800 noites cobre o calendário aberto (≤ 2 exercícios) e cada prévia
  faz um número fixo de leituras indexadas por intervalo, sem escrita, trava, chamada externa nem custo por terceiro — o
  mesmo volume que a página do calendário já lê a cada carga. Quem pode chamar é um conjunto fechado (Titulares
  convidados pelo Admin, sessão verificada); o cliente só pede prévia para um período completo. Um limitador por usuário
  exigiria estado novo no Redis para um custo que não excede o de recarregar a página; fica fora da W12 e não é
  ratificado aqui (risco residual).
  Medição (2026-11-02, PostgreSQL local do harness de testes, Co-Owner com 730 noites seladas e reservas existentes,
  40 execuções depois de aquecer): prévia no pior intervalo aberto (423 noites) = 12 consultas, p50 31 ms, p95 36 ms,
  máx. 43 ms; carga da página do calendário = 13 consultas, p50 41 ms, p95 79 ms. A prévia custa menos que recarregar a
  página. Limites vigentes: sessão verificada de Titular convidado, datas validadas antes de qualquer consulta, teto de
  800 noites, número fixo de consultas indexadas, transação só de leitura sem travas, duração da função na Vercel. Sem
  `statement_timeout` próprio nas leituras: com esse custo, não muda o caso típico; endurecimento opcional (W30) se a
  medição em produção mostrar cauda longa. Resposta a abuso: revogar a delegação, que vale na hora (TECH-050).

## 5. Out of scope

Cancelamento, restauração, liberação e correção (W13); `reserved_right` devolvido (W21/W22); transferência (W28); selo
da auditoria e reconciliação (W30).
