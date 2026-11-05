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
- **Aceitação provisória (fundador, 2026-11-02):** T-1207 aceito exclusivamente para a W12 implantada com as reservas
  desativadas (`app.capability_activation` vazia). Antes da operação real, reavaliar com métricas reais de uso (volume
  de prévias por Titular, latência, cauda longa) e decidir de novo; a aceitação não se estende à ativação.

## 5. Out of scope

Cancelamento, restauração, liberação e correção (W13); `reserved_right` devolvido (W21/W22); transferência (W28); selo
da auditoria e reconciliação (W30).

---

# W13 — ciclo da reserva: cancelamento, no-show, recuperação, exceção e invalidação

- **Date**: 2026-11-03
- **Status**: Draft (E0; riscos residuais sem ratificação)
- **Scope**: os seis commands da W13 (spec `booking` §10), transições só-inserção, liberação, custódia, `restore`,
  `correction`, jobs `advance_booking_states`/`flag_no_show_candidates`, papel `luxtory_booking_authorizer` e workflow
  de autorização num GitHub Environment (repositório público)
- **Linked ADR(s)**: ADR-0024, ADR-0025, ADR-0026, ADR-0027

## W13.1. Assets e atores novos

Assets: estadias já pagas com consumo (não iniciadas), saldo do Direito de Uso, capacidade que pode entrar no Inventário
Luxtory, autorizações de uso único, histórico de estados. Atores: Titular (cancela a própria reserva); Admin com MFA;
papel autorizador (só duas funções); aprovador no GitHub Environment (fundador); `luxtory_app` (fronteira confiável; se
comprometido, forja operações Admin — tem `INSERT` em `app.operation` e `SELECT` em `app.staff_role`).

## W13.2. Threats (STRIDE)

### T-1301 [HIGH] Tampering — cancelamento forjado (R6)

- **Vector**: com a credencial e a K2 presente, transição de cancelamento em nome de Titular vigente.
- **Mitigation**: transição presa à operação, delegação e holding da reserva; K2; contenção em três degraus.
- **Residual**: tardio leva noites a `forfeited_right` de forma irreversível (TECH-060); tempestivo devolve o saldo e
  libera as noites a terceiros. Sem ratificação.

### T-1302 [HIGH] Elevation — ato Admin com efeito econômico sem decisão legítima (R7, R8)

- **Vector**: operação Admin forjada pelo `luxtory_app` ou Admin interno: no-show, recuperação, cancelamento P-A,
  invalidação.
- **Mitigation**: autorização independente do `luxtory_app` (papel dedicado + aprovação no GitHub Environment), de uso
  único, com escopo e validade por finalidade; o banco exige o uso na mesma operação.
- **Residual**: abertura de exceção e resolução `confirmed`/`completed` ficam com Admin + K2, sem autorização
  independente. Não alteram saldo nem custódia, mas não são inofensivas: uma P-B indevida suspende o cancelamento
  tardio do Co-Owner e o no-show enquanto durar (o Owner e o cancelamento tempestivo seguem disponíveis). Mitigação:
  evento de notificação enfileirado no outbox no COMMIT da abertura (a entrega depende do job `outbox`, hoje cron
  diário: até cerca de um dia de atraso; latência adequada a comprovar antes da ativação), prazo do 1º check-in visível
  ao Admin, `completed` só com o período
  encerrado. Teste: a abertura forjada pelo `luxtory_app` com K2 produz só essas restrições; sem K2 ou sem operação
  Admin, recusada.

### T-1303 [MEDIUM] Tampering — uso indevido de autorização legítima

- **Vector**: execução antecipada pelo `luxtory_app` comprometido; reuso; ampliação de escopo; corrida com a revogação.
- **Mitigation**: escopo derivado dos fatos e gravado (reserva, finalidade, noites/custódias, classificação esperada,
  validade); uso único (PK); trava consultiva por reserva; uso `FOR SHARE` × revogação `FOR UPDATE`.
- **Residual**: o atacante só antecipa exatamente o ato autorizado, uma vez.
- **Procedure**: a solicitação gravada pelo papel da aplicação não prova legitimidade; o aprovador verifica os
  fundamentos por fontes próprias (no-show: registro da administração profissional ou da party; invalidação:
  declaração da party por canal verificado e logs do Vercel/Supabase Auth) antes de aprovar.

### T-1304 [HIGH] Tampering/Elevation — workflow do autorizador

- **Vector**: alteração do workflow, disparo de outra ref, injeção por entrada, exposição do secret.
- **Mitigation**: arquivo versionado com PR revisado; Environment só da `main` com revisor obrigatório; secret do
  Environment; entradas por `env:` com schema fechado; SQL parametrizado; `permissions: contents: read`; actions por SHA.

### T-1305 [MEDIUM] Information disclosure — logs públicos do GitHub

- **Vector**: reserva, datas ou evidência em entradas e logs de um repositório público.
- **Mitigation**: só o id opaco da solicitação e a referência do run; saída com código e id da autorização; o detalhe
  fica na área Admin protegida.

### T-1306 [MEDIUM] Spoofing — tela do aprovador com o servidor inteiro comprometido

- **Residual**: com o servidor da aplicação comprometido (não só a credencial do banco), o detalhe exibido deixa de ser
  confiável. Limite da fronteira existente (ADR-0024 §3, T-1201).

### T-1307 [MEDIUM] Tampering — cadeia de estados

- **Vector**: bifurcação, segunda raiz, `UPDATE` direto do estado, projeção por outra via.
- **Mitigation**: índice parcial de raiz única, FK composta, `UNIQUE(previous_transition_id)`, gatilho com trava e
  `previous = last_transition_id`; projeção `SECURITY DEFINER` só de gatilho (molde W11); guarda de `UPDATE` para todos os
  papéis; `luxtory_app` sem `UPDATE` em `app.booking`.

### T-1308 [MEDIUM] Repudiation — consequência diferente da exibida

- **Mitigation**: termos esperados da prévia; divergência → `ERR_CANCELLATION_TERMS_CHANGED`, sem efeito; na P-A de
  Co-Owner, a classificação esperada fica gravada na autorização.

### T-1309 [MEDIUM] Information disclosure — cancelar reserva de outra party (IDOR)

- **Mitigation**: guard do Titular, RLS por `booking.holding_id` e regra do banco presa à delegação e à holding.

### T-1310 [LOW] Tampering/DoS — jobs forjados ou atrasados

- **Mitigation**: o job só faz o que o instante permite; nenhum command depende do estado do job; idempotência por item.

### T-1311 [MEDIUM] Denial of service — prazo perdido durante indisponibilidade (C1)

- **Residual**: com a K2 desligada, a senha trocada ou o serviço fora do ar, o Titular não cancela e o prazo de 360 h pode
  vencer. Sem compensação automática e sem a PD-010 como exclusão genérica: decisão operacional/contratual pendente antes
  da ativação (comunicação, coleta de evidência, escalonamento administrativo).

## W13.3. Risco por estado operacional

A = hoje, sem reservas e sem ativação; B = ativada; C = reservas existentes com a criação (K1) desligada.

| Risco | Controle | A | B | C |
|---|---|---|---|---|
| R1 reserva forjada | K1; contenção | — | sim | — |
| R2 COMMIT depois do instante validado (criação e cancelamento) | T3 | — | sim | sim |
| R3 dono/superusuário, sessão pendurada, troca de senha | ensaio fora de Production; término de sessões | estrutural | sim | sim |
| R4a reserva não autorizada remediável | invalidação (REQ-084) | — | sim | sim |
| R4b reserva não autorizada já cancelada com atraso, com no-show ou com datas iniciadas | detecção rápida, monitoração, runbook | — | sim | sim |
| R5 trilhas sem autenticidade | selo W30 | estrutural | sim | sim |
| R6 cancelamento forjado | K2; contenção | — | sim | sim |
| R7 Admin forjado sem autorização independente (abertura de exceção; P-B indevida suspende tardio e no-show) | K2; evento enfileirado no COMMIT (entrega pelo cron diário do `outbox`; latência a comprovar antes da ativação); atos econômicos exigem autorização | — | sim | sim |
| R8 Admin interno | autorização independente; auditoria | — | sim | sim |
| C1 prazo perdido por indisponibilidade | decisão operacional/contratual pendente | — | sim | sim |
| T-1207 prévia sem limitador | reavaliar com métricas | leitura | sim | sim |

Nenhum desses riscos está ratificado para operação real. Reconhecer o R4b como residual não equivale a aceitá-lo.

## W13.4. E1 — mitigações no banco verificadas (2026-11-04, ambiente isolado)

Comprovadas por testes `db` com os privilégios reais (`tests/migrations/booking-lifecycle.db.test.ts`,
`booking-authorization.db.test.ts`): T-1301 (cancelamento só com delegação ativa e holding da reserva, K2 e prazo no
instante), T-1302 (no-show, P-A cancelada, invalidação e recuperação recusados sem o uso da autorização da mesma
operação, mesmo com Admin ativo e K2; P-B forjada só suspende), T-1303 (escopo derivado e gravado, uso único, uso ×
revogação e autorizações simultâneas: exatamente um vence), T-1307 (cadeia com raiz única, FK composta, sem bifurcação,
também com os gatilhos contornados; `UPDATE` direto recusado para a aplicação e para o dono), T-1308 (termos diferentes →
recusa sem efeito), T-1309 (outra party recusada) e T-1310 (job limitado pelo instante, fora da K2). T-1304/T-1305
(workflow e logs) ficam para a E5. Nota: o papel autorizador recebe `USAGE` no schema `app` e por isso enxerga funções
executáveis por `PUBLIC` desde as W1–W7 — 18 de gatilho (chamada direta recusada) e um validador IMMUTABLE —, sem acesso
a dados (ADR-0027, notas da E1). Nenhuma ativação; riscos R1–R8, R4b e C1 seguem sem ratificação.

### T-1312 [HIGH → mitigada na E1] Elevation — tipo sombreado em `pg_temp` dentro de `SECURITY DEFINER`

- **Vector**: papel com TEMP (autorizador ou `luxtory_app`) cria `pg_temp.uuid`/`pg_temp.text` com `CHECK` que chama
  função própria; com `search_path = ''`, o tipo temporário vence o de `pg_catalog` e o `CHECK` roda como o dono.
- **Evidência**: sonda descartável no PR #82 (antes da correção) — `app.authorize_booking_action` executou a função do
  autorizador como `postgres`.
- **Mitigation**: `SET search_path = pg_catalog, pg_temp` em toda função da W13; prontidão exige nas `SECURITY DEFINER`
  acionáveis; regressões com seis tipos sombreados (autorizador e `luxtory_app`).
- **Residual**: cinco `SECURITY DEFINER` anteriores com `''`, sem nome de tipo sombreável, aceitas pela prontidão só por
  lista finita e auditada (assinatura + md5 do corpo + configuração) e testadas com tipos sombreados pelos papéis que as
  executam (dívida técnica documentada no ADR-0027, nota 5); 18 funções de gatilho e `app.is_text_list` executáveis por
  PUBLIC (nota 2), sem acesso a dados.

## W13.5. E2 — commands (2026-11-05, PR draft)

- **T-1313 [MEDIUM] Repudiation/DoS — solicitações em massa e fadiga de aprovação.** Sessão Admin comprometida registra
  muitas solicitações para cansar o aprovador. Mitigação: gate G-E4-1 (limitador antes de expor a solicitação, spec
  `booking` §10.12); a solicitação não autoriza nada e o aprovador verifica os fundamentos por fontes próprias (ADR-0027
  §4). Residual: credencial do banco comprometida insere solicitações direto (fronteira R1); o limitador não alcança.
- **T-1314 [MEDIUM] Information disclosure — dado pessoal na base registrada.** `basis` e `incident_ref` são referências
  não pessoais por contrato (D11); ficam só nas linhas de domínio e na auditoria, nunca em logs, outbox, resultados ou
  erros (provado por testes da E2). Residual **não ratificado**: um Admin pode digitar dado pessoal numa linha
  só-inserção; decisão pendente antes da ativação.
- **Recusas do banco (D1):** `permission_*` de forjamento ou corrida chegam como `ERR_PERMISSION` gravado, e K1/K2
  fechadas como capability fechada (sem operação, recusa ou evento) — antes da E2 viravam erro 500 (W12 inclusive).
- **Cobertura pelos handlers (E2):** T-1301 (cancelamento só com delegação ativa, holding da reserva, K2 e prazo),
  T-1302 (atos econômicos sem o uso da autorização da mesma operação → `ERR_PERMISSION`; P-B só suspende), T-1303
  (autorização resolvida pelo servidor, uso único, uso × revogação), T-1307 (transições concorrentes: exatamente uma),
  T-1308 (termos da prévia), T-1309 (reserva de outra party = inexistente) — provados em
  `own-use-cancellation.db.test.ts`, `own-use-admin-acts.db.test.ts` e `own-use-lifecycle-concurrency.db.test.ts`.
  Nenhuma ativação; riscos residuais seguem não ratificados.

## W13.6. Bloqueio B-A3 — origem P-A na recuperação (2026-11-05)

- **T-1315 [HIGH] Tampering/Elevation — monetização de capacidade bloqueada sem atestação.** O cancelamento tardio do
  Titular durante exceção operacional aberta não era reconhecido como origem P-A por `app.authorize_booking_action` (E1):
  a autorização `recovery` saía sem a atestação de disponibilidade e compatibilidade com o bloqueio (A3, BR-123), e a
  capacidade do imóvel bloqueado ia ao Inventário Luxtory. Mitigação: correção no banco (spec `booking` §10.13) e
  **bloqueio B-A3** — nenhuma ativação, recuperação ou autorização independente antes da correção integrada e validada.
  Alcance até lá: nenhum em Production (K1/K2 com 0 linhas, autorizador sem senha nem Environment).
  **Situação (2026-11-05):** mitigado — correção mergeada (#84 → `afa2d12`), aplicada pela CI e validada somente
  leitura em Production; ativação segue não autorizada.

## W13.7. E3 — jobs e consumidores (2026-11-05, PR draft)

- **Superfície:** duas rotas novas em `/api/jobs/[job]`, sob o mesmo `CRON_SECRET` (comparação em tempo constante,
  401 sem revelar o job); sem entrada além do nome do job. Os jobs não têm efeito econômico, ficam fora da K2 e o banco
  confere cada escrita (E1). Sem segredo, papel, migration ou serviço novo.
- **T-1316 [LOW] Denial of service / repetição — disparo duplicado ou concorrente.** A Vercel pode repetir um disparo e
  o endpoint pode ser chamado à mão. Mitigação: chave idempotente pelo estado da reserva (replay sem operação nova),
  travas da reserva e orçamento de 240 s; provado por testes concorrentes.
- **T-1317 [LOW] Information disclosure — notificação.** Dados escolhidos campo a campo, sem base registrada, referência
  de incidente ou dado pessoal; destinatário = party fixada no evento (RLS da central); log do dispatcher só com nome
  do erro. Provado pela entrega real com marcadores.
- **Residual:** cadência best effort (Hobby, sem nova tentativa); registro de candidata perdido não se recupera depois do
  check-out — a lista do Admin e o `declare_no_show` não dependem dele.
