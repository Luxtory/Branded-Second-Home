# W13 — Cancelamento, no-show, recuperação, exceção e invalidação: plano

Data: 2026-11-03. Base: `d360324775c601a6e8df1af25357afa1207059b9` (main = Production, 55/0; ativação 0 linhas; 0
reservas, ocupações e holdings; `track_commit_timestamp` off). Plano técnico apresentado ao fundador e revisto em quatro
rodadas de auditoria (2026-11-03); E0 documental autorizada para auditoria em PR draft. **E1 não autorizada.** Este
documento organiza a execução, sem substituir os canônicos. Spec: [`booking` §10](../specs/booking.md) (notas em
`inventory` e `calendar` §8). Decisão: [ADR-0027](../adr/0027-ciclo-da-reserva-de-uso-proprio-e-autorizacao-independente.md).
Ameaças: [`booking`](../security/threats/booking.md) (W13).

**Atualização 2026-11-03:** a E0 foi mergeada pelo #80 (squash `5d9b636`; `02` v4.4 e `03` v3.16 emitidos; ADR-0027
aceito); as situações "em auditoria neste PR" da tabela abaixo referem-se a esse PR. A E1 foi autorizada pelo fundador
em 2026-11-03 só em ambiente isolado (PR draft para auditoria, sem merge, deploy, Production, secrets, Environment real
ou ativação); E2 em diante dependem de nova autorização expressa.

**Atualização 2026-11-04:** a E1 foi mergeada pelo #82 (squash `26dd58d`; 4 migrations em Production, 59/0; ativação 0 linhas; reservas desativadas). Em 2026-11-05 o fundador aprovou o plano v2 da E2 e autorizou a implementação em PR draft (sem merge, deploy, Production, migration nova ou ativação); E3–E5 seguem não autorizadas.

**Atualização 2026-11-05 (E2 mergeada; bloqueio B-A3):** o #83 foi mergeado (squash `65223a9`, sem migration; K1 e K2 com 0 linhas). **Bloqueio B-A3 (decisão do fundador):** nenhuma ativação de reserva (K1, K2), recuperação (`recover_future_capacity`) ou autorização independente (senha, Environment ou uso do papel `luxtory_booking_authorizer`) antes de a correção da origem P-A na recuperação estar integrada na `main`, aplicada pela CI e validada. Motivo: a função `app.authorize_booking_action` da E1 não reconhece como origem P-A o cancelamento tardio do Titular durante exceção operacional aberta e emite a autorização `recovery` sem a atestação exigida por A3 (spec `booking` §10.13). A correção (E2b) foi autorizada só em PR draft, sem merge nem Production; E3–E5 seguem não autorizadas.

**Atualização 2026-11-05 (E2b mergeada; B-A3 resolvido tecnicamente):** a correção foi mergeada pelo #84 (squash `afa2d12`); a CI da `main` (42091427441) aplicou só a migration `20261105174225_booking_recovery_operational_exception_origin` (60/0) e a validação somente leitura em Production confirmou o critério novo em `app.authorize_booking_action` (md5 do corpo igual ao do repositório), `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, dono e ACL preservados e `app.assert_own_use_activation_ready()` sem erro, com ativação 0 e nenhuma reserva, solicitação ou autorização. O bloqueio B-A3 está tecnicamente resolvido; **isso não autoriza ativação** — K1, K2, a autorização independente (senha, Environment) e as demais pendências da ativação seguem fechadas. A E3 (jobs e consumidores) foi autorizada só em branch isolada e PR draft (sem merge, deploy, Production ou ativação).

## Decisões do fundador (2026-11-03)

| # | Decisão | Situação |
|---|---|---|
| D1 | Autorização no banco por transição (A1 estendido); estados só-inserção com cadeia provada e projeção no molde W11 | aprovada |
| D2 | K1 `own_use_booking` (criação) e K2 `own_use_lifecycle` (os seis commands da W13); jobs fora; contenção em três degraus; tabela de ativação vazia | direção aprovada; redação em auditoria neste PR |
| D3 | Invalidação de reserva não autorizada (REQ-084): apuração em `in_exception`; Co-Owner por `correct_use_right`, Owner por `resolve_exception`; autorização independente | direção aprovada; emenda `02` v4.4 / `03` v3.16 em auditoria neste PR |
| D4 | Correção só reversão de `consume` (`consumed − quantity`); correção de expiração fechada | aprovada; emenda de escopo do roadmap |
| D5 | Exceção operacional (P-A): Titular cancela com as regras normais; resolução `cancelled` do Admin classificada no instante (tempestiva = BR-280; tardia = `forfeited_right`, sem entrada automática no Inventário) | direção aprovada; redação em auditoria neste PR |
| D6 | Só Server Actions; seis rotas REST adiadas; domínio reutilizável | aprovada; emenda do roadmap |
| D7 | Prévia vinculante: termos esperados (classificação e primeira noite afetada) ≠ calculados → `ERR_CANCELLATION_TERMS_CHANGED` | aprovada |
| D8 | No-show na janela estrita `[1º checkin_at, checkout_at)`; lista ao vivo; job só registra; "Concluída" = período encerrado sem declaração | aprovada |
| D9 | Notificações pelo outbox (cancelamento, exceção, invalidação, no-show, correção) | aprovada |
| D10 | Prontidão por invariantes na W13; impressões digitais geradas pela CI no PR de ativação | aprovada |
| D11 | Prazo `checkin_at − 360 h`, exibido no fuso local | aprovada (decisão funcional expressa) |
| A1 | Autorização independente também para no-show e recuperação (efeito irreversível ou transferência à Luxtory) | ajuste exigido pelo fundador |
| A2 | Validade e escopo por finalidade; no-show com zero noites futuras; recuperação depois do no-show, nunca conjunta | ajuste exigido pelo fundador |
| A3 | Recuperação de origem P-A exige atestação de disponibilidade e compatibilidade com o bloqueio | ajuste exigido pelo fundador |
| A4 | Solicitação com id opaco; nenhuma reserva, data ou evidência em entrada ou log público | ajuste exigido pelo fundador |
| R8 | Admin interno no registro de riscos | aprovada |

## Etapas

| Etapa | Entrega | Situação |
|---|---|---|
| E0 | Canônicos `02` v4.4 e `03` v3.16 (REQ-084, EC-16, TECH-022/026/051, §7); roadmap; ADR-0027; specs; plano; STRIDE | PR draft documental; sem merge → mergeada (#80, `5d9b636`, 2026-11-03) |
| E1 | Migrations: transições, projeção, exceção, candidatos, solicitação/autorização/revogação/uso, papel autorizador, regras de liberação, custódia, `restore` e `correction`, chave K2 no `CHECK`, prontidão; `db:check`; testes com privilégios reais | não autorizada → em andamento (autorizada em 2026-11-03; ambiente isolado) → concluída (#82 → `26dd58d`, 2026-11-04; Production 59/0, ativação 0) |
| E2 | Contratos AsyncAPI dos eventos dos commands, antes do primeiro handler que emite evento; domínio e commands (classificação TS + gêmea SQL; máquina da TECH-055; seis commands); idempotência; concorrência | não autorizada → autorizada (2026-11-05, plano v2; PR draft, sem merge) → implementada em PR draft (spec `booking` §10.12.1), aguardando auditoria → concluída (#83 → `65223a9`, 2026-11-05) |
| E2b | Correção da origem P-A na recuperação (A3, BR-123; spec `booking` §10.13): migration incremental com `CREATE OR REPLACE` de `app.authorize_booking_action`, espelho no `requestFacts`, testes de regressão; bloqueio B-A3 até integrada e validada | autorizada (2026-11-05; PR draft, sem merge nem Production) → concluída (#84 → `afa2d12`, 2026-11-05; Production 60/0, validada somente leitura) |
| E3 | Jobs e consumidores de notificação | não autorizada → autorizada (2026-11-05; branch isolada e PR draft, sem merge, deploy, Production ou ativação) → implementada em PR draft (spec `booking` §10.14.1), aguardando auditoria |
| E4a | Revisão renderizada com o fundador: prévia do cancelamento (tempestivo, tardio, iniciada, Owner, prazo vencido na revisão, em exceção) e telas Admin, 390/1440 px | não autorizada |
| E4b | Integração das telas e E2E; gate G-E4-1 (limitador da solicitação, spec `booking` §10.12) testado antes de expor a solicitação | não autorizada |
| E5 | Workflow do autorizador comprovado num Environment isolado apontando para banco descartável | não autorizada |
| E6 | Gates locais | não autorizada |
| E7 | PR draft da implementação; parar antes do merge | não autorizada |

## E1 — resultado no banco (2026-11-04, ambiente isolado)

Quatro migrations (spec `booking` §10.11), `db:check` up → down → up, testes `db` com os privilégios reais em
`tests/migrations/booking-lifecycle.db.test.ts` e `booking-authorization.db.test.ts`. Critérios abaixo cobertos no banco:
4 (entrada da função em schema fechado: UUID e `github-run:<id>:<tentativa>`, SQL parametrizado), 5 (só id opaco e
referência do run chegam à função; saída = id da autorização), 6, 7, 8, 9, 10 (incluindo login real e `CONNECTION LIMIT
1`), 11 (no banco: PK, reuso recusado, falha → rollback e autorização utilizável), 12, 13, 14 e 16. Pendentes por etapa:
1–3 e a varredura de log do 5 (workflow, E5); o replay pela chave do executor do 11 (E2); o roteiro do 15 (runbook, E5).
Auditoria do PR #82 (2026-11-04): escalada por tipo sombreado em `pg_temp` achada e corrigida (`search_path =
pg_catalog, pg_temp`, T-1312); isolamento do autorizador provado (sem CREATE, TRIGGER, REFERENCES, coluna ou outra
`SECURITY DEFINER`; gatilhos só com os próprios privilégios); testes independentes da data real (exercício anterior
selado; regressão da virada do ano); ordem de travas obrigatória para a E2 e proteção da solicitação documentadas
(spec `booking` §10.11.1). Dependem da E2: handlers na ordem documentada, mapeamento de recusas, idempotência do
executor, guard/MFA/auditoria da solicitação, AsyncAPI.

## Autorização independente — critérios de aceite

1. **Workflow protegido.** Arquivo versionado, mudança só por PR revisado; `permissions: contents: read`; actions
   fixadas por SHA; job com `if: github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'`.
2. **Só a `main`.** A regra de branch do Environment aceita só `main`; disparo de outra ref bloqueado (prova isolada).
3. **Secret só depois da aprovação.** Secret do Environment, não do repositório; sem aprovação o job espera e o secret
   não é exposto (prova isolada).
4. **Sem injeção.** Entrada só por `env:`, nunca `${{ inputs.* }}` em `run:`; schema fechado (id da solicitação em UUID,
   referência do run); SQL parametrizado; nenhum SQL livre.
5. **Sem dado pessoal ou sensível público.** Entradas: id opaco da solicitação e referência do run. Saída: código do
   resultado e id da autorização. Varredura do log do run isolado.
6. **Concorrência.** Duas autorizações simultâneas para a mesma reserva e finalidade → exatamente uma; uso × revogação
   → exatamente um vence.
7. **Escopo exato.** Execução recusada para outra reserva, finalidade, exceção ou solicitação, noite afetada fora do
   escopo gravado, autorização expirada, revogada ou usada, classificação divergente (P-A Co-Owner), escopo esperado
   diferente do derivado.
8. **Validade por finalidade.** `no_show`: emissão só em `[1º checkin_at, checkout_at)`, validade `≤ checkout_at`,
   aceita zero noites futuras (reserva de uma noite; ausência constatada na última noite). `recovery`: só custódias
   `forfeited_right` ativas e futuras, validade `≤ checkin_at` da última. `exception_cancellation` e `invalidation`:
   ≥ 1 noite não iniciada, validade `≤ checkin_at` da última, afetadas ⊆ gravadas na execução. Fronteiras exatas
   (`−1 µs`, igual, `+1 µs`) e reserva parcialmente iniciada.
9. **Sequência.** Recuperação antes do no-show commitado → recusada; depois, só as custódias efetivamente perdidas.
10. **Inacessível ao `luxtory_app`.** Sem `EXECUTE` nas funções de autorizar e revogar, sem `INSERT` em autorização ou
    revogação (`42501`); o papel autorizador não tem privilégio em tabela; `CONNECTION LIMIT 1`.
11. **Uso único e replay.** PK na linha de uso; reuso recusado; falha no meio → rollback integral e autorização
    utilizável; replay pela chave do executor devolve o resultado gravado sem nova linha de uso.
12. **Execução antecipada com credencial comprometida.** Com uma autorização legítima, o `luxtory_app` forjando a
    operação só obtém exatamente o ato autorizado (mesma reserva, finalidade, noites e classificação), uma vez; qualquer
    variação é recusada.
13. **Cobertura das finalidades.** Sem autorização, mesmo com operação Admin válida e K2 presente: P-A `cancelled`,
    invalidação (Owner e Co-Owner), no-show e recuperação recusados.
14. **Regimes distintos.** O cancelamento do Titular, com representação, K2 e prazo, é aceito sem autorização
    independente; a exigência da linha de uso depende do command e do desfecho.
15. **Fundamentos verificados.** O runbook do autorizador lista, por finalidade, as fontes que o aprovador consulta
    antes de aprovar; a solicitação registrada pelo papel da aplicação não basta. O workflow só confere escopo e validade.
16. **Atos sem autorização independente.** Abertura de P-B forjada com K2 produz só a suspensão do cancelamento tardio
    do Co-Owner e do no-show (saldo, custódia e ocupação inalterados); sem K2 ou sem operação Admin, recusada;
    `completed` antes de `checkout_at` e `confirmed` depois, recusados.

## Gates

`npm run verify` · `npm run test:e2e` (`--workers=2` no WSL) · `npm run trace -- --expect
REQ-080,REQ-081,REQ-083,REQ-084,PD-010` · job `security` (Semgrep) · `db:check` up → down → up · consultas de invariantes
vazias após todo teste `db`. Proibido: linha em `app.capability_activation`, `track_commit_timestamp`, gates
operacionais, secrets, Environment real, migrations fora da CI, merge sem autorização.

## Pendências preservadas

- **Bloqueio B-A3** (2026-11-05; **resolvido tecnicamente** em 2026-11-05 pelo #84 → `afa2d12`, sem autorizar ativação): nenhuma ativação de reserva (K1, K2), recuperação (`recover_future_capacity`) ou autorização independente (senha, Environment ou uso do papel `luxtory_booking_authorizer`) antes de a correção da origem P-A na recuperação estar integrada na `main`, aplicada pela CI e validada (spec `booking` §10.13).
- **Ativação** (estado B): migration própria depois da W13 em Production; prontidão + impressões digitais; ensaio da
  desativação (R3) fora de Production; execuções do `outbox`, `open_exercise` e `close_exercise` observadas; latência de
  entrega das notificações adequada à detecção (R4, R7), comprovada em Production — hoje o evento é enfileirado no
  COMMIT e entregue pelo cron diário do `outbox`, sem serviço novo na W13; decisões expressas sobre R1–R8; reavaliação do T-1207; configuração do Environment, do
  revisor e da senha do autorizador.
- **C1** — prazo vencido durante indisponibilidade ou contenção: decisão operacional/contratual antes da ativação, com
  comunicação, coleta de evidência e escalonamento administrativo; sem compensação automática; a PD-010 não é exclusão
  genérica.
- **R4b** reconhecido como residual; não aceito para ativação.
- W22 `reserved_right` devolvido; W28 transferência; W30 selo, reconciliação e catálogo de notificações.
