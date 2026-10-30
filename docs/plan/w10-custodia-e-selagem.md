# W10 — execução do plano aprovado

Data: 2026-10-29. Base: `cf10f9a42f8c8643516e41a01adce3d1c929e304` (main = Production, CI run 40912407810 verde,
45/0). Plano técnico apresentado, auditado de forma independente, revisado criticamente e aprovado pelo fundador no
chat em 2026-10-29, com autorização de execução até o checkpoint de PR draft validado. Este documento organiza a
execução, sem substituir os canônicos. Specs: calendar §5, inventory, platform (W10). ADR-0024. Sem closeout até merge
autorizado.

## Decisões consolidadas

- Horizonte imposto pelo banco: só o exercício corrente e o seguinte pelo ano civil local do servidor, no fuso da Second
  Home, sem tolerância; exercício passado nunca é selado. `sealed_at` carimbado pelo banco.
- Selagem por exercício, numa transação, da data-base (`acquisition.operation_start_date`) ou de 01/01 até 31/12;
  exercício completo 103 + 262 (+29/02); formalização torna a Second Home selável, o registro do início efetivo não
  interfere. Exercício corrente e seguinte pela data local (TECH-040, TECH-042).
- Prontidão: cron diário + `after()` nas duas entradas da formalização (rota e Server Action), sem evento, command ou
  endpoint novo; a integridade é do banco (sem noite selada não há custódia nem ocupação).
- Três camadas: estrutural completa; operação concreta (operação `pending` — consistência, não autenticidade; raiz autorizada pelos
  fatos); prova econômica nas waves seguintes. Fronteira de confiança no servidor da aplicação (ADR-0024 §3).
- Transições e ocupações sem command ficam protegidas por privilégio (`luxtory_app` sem UPDATE em custódia e sem
  INSERT/UPDATE em ocupação). Sem tabela de vínculo command↔transição (daria aparência de autorização que o banco não
  prova).
- Cadeia linear (`UNIQUE(parent_custody_id)`); reversão `luxtory/inventory → pai` repete a custódia anterior.
- Chave por execução + exatamente-uma-vez pelo estado; orçamento de 240 s (teto Hobby 300 s).
- Classificação: TypeScript produz, `CHECK` SQL confere (equivalência exaustiva 1–9999); check-in conferido TS × PG.
- Alerta: log sempre + e-mail Resend quando configurado; transporte simulado; recusa segura sem configuração.
- Vercel: plano Hobby ativo, Fluid compute, 300 s; até 100 crons, cada um 1×/dia, ±59 min, sem retry, best effort.

## Restrições globais

- Canônicos e migrations aplicadas intocados; W8 e W9 preservadas; nenhum command de usuário nem job fora do TECH-090.
- Production, gates (`ACQUISITION_WRITES`, `INTEREST_WRITES`, `PII_*`, `DRAW_*`), segredos e dados reais intocados;
  `OPS_ALERT_*` não criadas em Production. Parar antes do squash merge.

## Etapas

| Etapa | Entregáveis | Estado |
|---|---|---|
| E0 | worktree `/home/rjr-idb/luxtory-w10` (branch `feat/w10-custodia-selagem`), `npm ci` | ✅ |
| E1 | spec calendar §5, inventory, platform (W10), identity; ADR-0024; OpenAPI `runJob`; ambiente; runbook; STRIDE; roadmap | ✅ |
| E2 | calendário: `exerciseNights`, `checkInAt`, `checkOutAt` (14:00/10:00, recusa de hora inexistente) | ✅ |
| E3 | 4 migrations (45 → 49), codegen, testes db das barreiras, da cadeia, da matriz, de privilégios e da operação forjada | ✅ |
| E4 | `open_exercise` (command de sistema, guard do platform), job, `after()`, alerta, cron, `maxDuration` | ✅ |
| E5 | consultas de invariantes após todo teste db (`TestDatabase.drop()`); rollback W8 encadeado | ✅ |
| E6 | gates integrais (verify, E2E com 2 workers, trace, segurança) | ✅ verify 1.323/1.323 (0 skips), E2E 121 + 1 skip preexistente, trace 3/3 |
| E7 | PR draft → CI verde → checkpoint → merge autorizado | ✅ #74 squash `25f668c` (2026-10-30), CI da `main` 40998972343 verde (migrate 45 → 49, deploy) |

## Achados de integridade do fundador (2026-10-29)

1. **Operação forjada.** Reproduzido com os privilégios efetivos de `luxtory_app`: uma operação `pending` forjada com o
   command de sistema consegue apenas a selagem canônica (raiz autorizada pelos fatos); modalidade errada, segunda raiz,
   outro command, operação já encerrada e qualquer transição ou ocupação são recusados (uma `pending` comitada pelo
   próprio papel é reutilizável, sem capacidade nova). A selagem forjada é
   idêntica à canônica (classificação e check-in) e não cria ocupação, custódia econômica nem Direito de Uso. O banco
   limita a selagem ao exercício corrente e ao seguinte (relógio do servidor), inclusive para a forjada. A trilha do
   executor não prova autenticidade: o mesmo papel grava idempotência e auditoria de mesma forma (testado); a ausência
   é só sinal de anomalia. Segunda trava: o gate `app.assert_inventory_transition_enabled` recusa transições e
   ocupações para todo papel exceto o dono do schema, mesmo com privilégio concedido (testado). A fronteira de
   confiança fica explícita no ADR-0024 §3, com condição de resolução antes da primeira wave que habilitar cada
   transição. Aceitação do efeito residual (selar, de forma canônica, um exercício já devido antes do cron) pelo
   fundador em 2026-10-30, estritamente limitada e condicionada (ADR-0024, "Aceitação do risco residual da W10").
2. **Cadeia de custódia.** `UNIQUE(parent_custody_id)` validado com `spe_pool → reserved_right → spe_pool →
   reserved_right`, `owner → luxtory/inventory → owner → luxtory/inventory`, bifurcação recusada, transição concorrente
   da mesma custódia com duas conexões nas duas ordens e histórico preservado após a reversão.

## Revisão do código pelo fundador (2026-10-29)

1. Operação `pending` comitada por outra transação: reutilizável pelo papel da aplicação (testado), sem capacidade além
   da de inserir uma operação nova — afirmação corrigida no ADR-0024, sem mecanismo novo (nenhum ganho de segurança).
2. Horizonte sem piso: operação forjada selaria exercícios passados com data-base antiga — corrigido no banco (piso no
   exercício corrente; testado), sem necessidade legítima de selagem retroativa.
3. `sealed_at` aceitava qualquer valor — corrigido: carimbado pelo banco (testado com valores passado e futuro).

## Decisões pendentes do fundador

- Canal de e-mail do alerta na ativação (caixa, remetente, chave dedicada ou reaproveitada).

## Decisões do fundador registradas (2026-10-30)

- Risco residual da W10 aceito, estritamente limitado à selagem estrutural e condicionado (ADR-0024).
- D7 aprovada: P-12 e P-13 encaminhadas para revisão normativa antes da W14, sem alterar agora os canônicos.
- Horizonte estrito (ano civil local do servidor, sem tolerância) — preferência do fundador, adotada.
- Na W12: fronteira de confiança das transições discricionárias e horizonte de reserva do Owner (P-14).

## Encerramento (2026-10-30)

- Squash merge autorizado pelo fundador (HEAD auditado `86564eb`, CI 40990394457) → `main` = `25f668c`.
- CI da `main` 40998972343: lint, typecheck, test, security, e2e, migrate e deploy verdes. Migrate: 45 aplicadas,
  4 pendentes → 49 (0,83–0,95 s cada).
- Production (verificações somente leitura): `/v1/version` = `25f668c` nos dois domínios; health 200; smoke sem
  credenciais conforme esperado (jobs 401, Admin e Titular redirecionam ao login, `/privacidade` 404 com aviso
  `pending`); cron `open_exercise` `23 4 * * *` registrado, não disparado manualmente; logs do deployment sem error, fatal
  ou 5xx; 49/0; 0 aquisições, noites seladas, custódias e ocupações; 0 violações de invariantes; RLS e privilégios
  conforme o ADR-0024; nomes de variáveis inalterados, gates e `OPS_ALERT_*` ausentes.

## Pendências operacionais para ativação antes de uso real

- Notificação de staff do alerta: caixa, remetente e chave (`OPS_ALERT_*`), só com autorização do fundador; até lá o
  alerta fica no log.
- Monitoramento da execução do cron (o job não detecta a própria ausência) até a reconciliação da W30 ou o Vercel Pro
  (D1); conferir periodicamente os logs do cron.
- Ativação das aquisições (`ACQUISITION_WRITES`) e do sorteio (`track_commit_timestamp`, `DRAW_*`) seguem pendentes,
  por decisão do fundador; a selagem só começa com a primeira formalização.
- D7 aprovada: P-12 e P-13 à revisão normativa antes da W14; P-14 para a W12.
