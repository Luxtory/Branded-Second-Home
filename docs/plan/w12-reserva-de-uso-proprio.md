# W12 — execução do plano aprovado

Data: 2026-10-31. Base: `a3802d37ffc92a54b8cec37d51fdf09185d1f06a` (main = Production, 52/0). Plano técnico
apresentado em 2026-10-30, revisado criticamente em quatro rodadas de auditoria do fundador e aprovado no chat em
2026-10-31, com autorização de execução das etapas E0–E8 até um único PR draft (sem merge, deploy, migration em
Production, linha de ativação, gates operacionais nem break-glass). Este documento organiza a execução, sem substituir os
canônicos. Spec: [`booking`](../specs/booking.md) (e notas em `inventory`, `calendar` §6 e `identity`). Decisão:
[ADR-0026](../adr/0026-reserva-de-uso-proprio-autorizacao-no-banco-e-ativacao.md). Ameaças:
[`booking`](../security/threats/booking.md).

## Decisões do fundador (2026-10-31)

- **D1 — autorização no banco: A1 + ativação privilegiada + semântica temporal T3.** O servidor continua a fronteira que
  autentica o Titular; o banco aceita só efeitos canonicamente válidos e presos à reserva da mesma operação, e só com a
  ativação presente. Alternativas avaliadas e recusadas: função `SECURITY DEFINER` como caminho único, papel/credencial
  separada, intenção assinada pelo usuário (ES256 não verificável em PL/pgSQL), escrita via PostgREST (vedada pelo `03`
  §13), sessão ativa em `auth.sessions`. **Risco residual não ratificado**: depende da auditoria da implementação.
- **D2 — restrição operacional.** Nenhuma reserva real antes de a W13 estar em Production e de autorização específica do
  fundador. A ativação é uma migration própria, posterior, que insere a linha em `app.capability_activation`; a W12 não
  contém ativação. Break-glass só documentado — nunca pré-autorizado (ADR-0006 item 4).
- **D3 — P-14 (horizonte do Owner).** O Owner reserva qualquer noite **selada** (exercício corrente e seguinte),
  sem limite de Direito de Uso ou rotação. É limite técnico transitório da selagem (ADR-0024), não regra de produto nem
  restrição contratual (BR-052, BR-151, REQ-037 não fixam horizonte); evoluir exige decisão do fundador e emenda do
  ADR-0024.
- **D4 — `reserved_right` devolvido (TECH-023).** Fechado no banco até a wave que produzir validamente esse estado
  (W21/W22), que terá a obrigação do teste da TECH-023.
- **D5 — telas.** Calendário, reservas e central de notificações do roadmap, server-rendered e mobile-first, com revisão
  renderizada do `lx-calendar` no checkpoint **E5a** antes da integração **E5b**. Um período contínuo por reserva; a
  seleção de múltiplos períodos fica como oportunidade futura de produto, sem wave nem semântica antecipada.
- **D6 — entrada.** Só a Server Action (emenda do roadmap que previa `POST /v1/bookings`), com o mesmo executor, guard,
  idempotência e auditoria; chave de idempotência emitida na prévia (padrão W7). Notificação de confirmação à party que
  reservou, fixada no evento no COMMIT.
- **D7 — entrega.** Um branch (`feat/w12-reserva-de-uso-proprio`), um PR draft; parar antes do merge.

## Achados que condicionaram o desenho (não redescobrir)

- O guard negava a autoridade `titular`; a W12 cria o caminho (delegação + holding vigentes) com revalidação na
  transação (`FOR SHARE` na delegação, ADR-0021).
- O mesmo gate da W10 cobre todas as transições, a ocupação e a liberação: a W12 não substitui a função, cria regras
  específicas nos gatilhos (o resto continua no gate).
- `luxtory_app` cria e ativa delegações e grava notificações e outbox: delegação, notificação e trilha não são barreiras
  contra credencial comprometida.
- `SET CONSTRAINTS … IMMEDIATE` (PostgreSQL 17) checa os eventos diferidos no próprio comando e o COMMIT não reavalia, sem
  privilégio exigido: checagem temporal "no COMMIT" é impossível contra o papel da aplicação (já registrado na W9).
- a coluna da Second Home em `app.operation` é `second_home_id` desde a W4.2 (renomeada); o gatilho do ledger da W11 declara a variável `c`
  (alias de tabela `c` colide); `stake`/`second_home_date` sem UPDATE para a aplicação → travas consultivas
  (`app.stake:`, `app.second_home_date:`), como `app.party:`.

## Restrições globais

- Nada em Production; as migrations chegam só pela CI do merge (não autorizado). A tabela de ativação nasce vazia.
- W10 e W11 inalteradas, salvo onde a W12 substitui o gate do próprio caso (custódia `spe_pool`, ocupação `own_use`,
  consumo) e as fixtures de teste que gravam ocupação (agora com reserva-fixture).
- Sem quarto canal, cancelamento, restauração, liberação, correção, seleção Luxtory, convidados ou transferência.

## Etapas

| Etapa | Conteúdo | Estado |
|---|---|---|
| E0 | Plano, ADR-0026, spec `booking`, STRIDE, runbook, AsyncAPI, emendas do roadmap e notas nas specs | ✅ |
| E1 | 3 migrations (`booking_own_use`, `inventory_own_use_authorization`, `calendar_own_use_consumption_and_booking_checks`) + codegen | ✅ (db:check 55) |
| E2 | Domínio: noites (PD-002), permanência (BR-111/112), janela TS gêmea do SQL | ✅ |
| E3 | Handler `create_own_use_booking`, portas de calendar/inventory/ownership, guard do Titular | ✅ |
| E4 | Server Action, evento e consumidor da notificação | ✅ |
| E5a | `lx-calendar` no Lab renderizado (320/390/1440, axe, overflow) → **revisão do fundador** | ✅ aprovada (v2.4, 2026-11-01) |
| E5b | Telas: calendário, reservas, central de notificações, i18n; `channel` no GRANT do Titular e RLS por holding (opção 1) | ✅ |
| E6 | Testes db (command, fronteira, RLS com identidades diferentes, leitura e prévia), unitários, E2E | ✅ |
| E7 | Gates: `npm run verify`, `npm run test:e2e` (`--workers=2`), `npm run trace -- --expect REQ-034,REQ-035,REQ-037,PD-002,INV-1` | ✅ (c4ad879, 2026-11-02); refeitos depois da auditoria (E9) |
| E8 | Commit, push, PR draft, checkpoint | ✅ PR draft #78 (c4ad879, CI verde); merge **não autorizado** → autorizado e concluído em 2026-11-02 (squash `57015e1`, implantação fechada) |
| E9 | Correções da auditoria independente do PR #78 (2026-11-02): resultado incerto só pela idempotência do executor; aviso e nenhuma confirmação com as reservas fechadas (`bookingOpen` da ativação); prévia e calendário num snapshot único; motivo "reserva do Owner"; nota W28; E2E de confirmação com ativação só no banco descartável | ✅ no mesmo PR draft #78; aprovadas tecnicamente pelo fundador (2026-11-02) |
| E10 | Verificações finais (2026-11-02): E2E de confirmação do Co-Owner com a ativação só no banco descartável (saldo da categoria cai, a outra não muda, noite ocupada); precisão do snapshot (consistência, não vigência) e limite da perda da chave; custo da prévia medido (STRIDE T-1207); aplicabilidade de R1–R5 por estado | ✅ no PR draft #78; merge aguarda decisão do fundador → preflight de Production somente leitura (2026-11-02) e merge autorizado |

## Riscos residuais declarados (ratificação pendente)

- **R1 — reserva forjada** (credencial `luxtory_app` comprometida **e** ativação presente): reservas canonicamente válidas
  em nome de qualquer party com holding vigente — Co-Owner até o saldo das janelas abertas em permanências ≤ 14 noites;
  Owner, todas as noites seladas livres —, com notificação gerada ou suprimida pelo mesmo papel. Sem a ativação, nada.
- **R2 — temporal**: o COMMIT de uma transação forjada pode ocorrer depois do check-in, embora todas as escritas tenham
  sido validadas antes; não detectável sem `track_commit_timestamp` (desligado).
- **R3 — desativação**: dono do schema e superusuário contornam gatilhos (D5, até a W30); sessão pendurada atrasa a
  desativação; credencial comprometida exige troca de senha.
- **R4 — remédio**: reserva forjada a menos de 15 dias do check-in não volta por cancelamento tempestivo (W13 decide
  exceção ou correção antes da ativação).
- **R5 — trilhas**: operação, auditoria e notificação não provam autenticidade até o selo da W30.

### Aplicabilidade por estado (recomendação técnica, não ratificação — 2026-11-02)

- **A — merge com a ativação vazia.** O merge na `main` dispara a CI: `migrate` aplica as 3 migrations da W12 em
  Production (tabelas, gatilhos, RLS e `app.capability_activation` vazia; nenhuma migration insere ativação) e `deploy`
  publica as telas de consulta. R1, R2 e R4 não são operacionais: dependem de uma reserva gravada, e o banco recusa toda
  escrita de reserva sem a ativação, que o papel da aplicação não pode criar (só `SELECT`). R3 e R5 existem só como a
  fronteira de confiança já vigente em toda a plataforma (dono do schema/superusuário; trilhas sem selo até a W30), sem
  exposição nova enquanto não houver reserva. Operacionais em A: a superfície nova de leitura do Titular (T-1205,
  isolamento provado) e a prévia sem limitador por usuário (T-1207, custo medido menor que uma carga da página); a
  migration em si (rollback `down` provado por `db:check`; recusa descartar uma ativação existente). Preflight somente
  leitura de Production (2026-11-02): 52/0 migrations (md5 das versões = `main`), 0 aquisições, holdings, noites,
  custódias e ocupações, nenhum objeto W12, outbox vazio, 24 nomes de env sem gates — sem holding, nenhum Titular chega
  às telas novas até uma formalização real.
- **B — ativação de reservas reais depois da W13.** Pré-requisito: cancelamento e restauração da W13 em Production.
  Exigem decisão expressa antes da ativação: R1 (aceitar, ou exigir mitigação adicional — monitoração de criação de
  reservas, rotação e menor privilégio da credencial `luxtory_app`); R2 (aceitar — `track_commit_timestamp` não previne:
  só daria evidência posterior do instante do COMMIT, com reinício do banco); R5 (aceitar até o selo da W30, ou
  antecipá-lo). Exigem prova operacional: R3 (ensaio da desativação do runbook — `LOCK` + `DELETE` com `lock_timeout` e
  encerramento de sessões — fora de Production, e procedimento de troca de senha); R4 (a W13 define exceção ou correção
  para reserva forjada a menos de 15 dias do check-in, como já previsto); notificação (depende do job `outbox`, cron
  diário 06:17 UTC: confirmar que a latência é aceitável e observar execuções em Production); prévia (reavaliar o
  limitador com métricas reais de uso). A ativação continua sendo só por migration pela CI, com autorização expressa.

## Encerramento (2026-11-02)

- **Concluída como infraestrutura implantada com as reservas desativadas — não como reservas reais ativadas.** O
  fundador aprovou a W12 tecnicamente e autorizou o squash merge exclusivamente para a implantação fechada, sem
  autorizar reservas reais nem ratificar R1–R5.
- Preflight de Production somente leitura antes do merge: projeto Supabase `fpuzepugueidglbceglz` ACTIVE_HEALTHY;
  52 aplicadas / 0 pendentes com as versões idênticas às da `main`; 0 aquisições, holdings, Ações, noites, custódias,
  ocupações, movimentos e saldos de Direito de Uso e sorteios; operações só as 2 `assign_staff_role` do bootstrap
  (2026-09-27); outbox sem pendência; nenhum objeto W12; `track_commit_timestamp` desligado; 24 nomes de env, sem gates;
  deployment de produção em `a3802d3`.
- PR #78 → squash `57015e1d9d2ac9257b028655c311ba3ba2effe16` (HEAD `2c33033`, merge fixado nesse SHA; árvore
  idêntica; CI do PR 41538065617). CI da `main` 41556251722 verde: lint, typecheck, test, e2e, security, migrate
  (Applied 52 / Pending 3 → as três migrations W12, `20261031164128`, `20261031164132` e `20261031164135`) e deploy,
  este só depois do `migrate`.
- Production, conferida somente em leitura, conforme observado:
  - Vercel: deployment `dpl_CNvSH2GTgruiKNhihRRiKdbUny7N` READY em `57015e1`. `branded-second-home.vercel.app`:
    `/v1/version` = `57015e1`, `/v1/health` 200; smoke: `/` e `/brand-partner` 200; `/admin` → `/entrar`; `/titular`,
    `/titular/reservas`, `/titular/notificacoes` e `/titular/calendario/<id>` → `/titular/entrar`; os três jobs 401 sem
    o segredo; `/privacidade` 404. `luxtory.club`: alias configurado (auditoria do fundador); a resposta HTTP desse
    domínio não foi observada deste ambiente, onde o nome resolve para o endereço local.
  - Banco: 55 aplicadas / 0 pendentes, versões idênticas às do repositório. O `dbmate` não guarda checksum; as
    definições do schema `app` foram comparadas com um PostgreSQL descartável montado com as migrations do repositório:
    gatilhos, políticas, colunas, constraints e privilégios de tabela e de coluna idênticos; as 81 funções com md5
    idêntico uma a uma.
  - Ativação e dados: `app.capability_activation` vazia; 0 reservas, ocupações, aquisições, holdings e notificações.
  - Privilégios: `luxtory_app` com SELECT na ativação, sem INSERT, UPDATE ou DELETE; INSERT em `app.booking`, sem
    UPDATE nem DELETE; INSERT em `app.date_occupancy`; UPDATE em `app.date_custody` só nas colunas `closed_at` e
    `closed_by_operation` (`GRANT` da migration `20261031164132`; consultado diretamente: `closed_at` com UPDATE e
    `holder_kind` sem; demais colunas pela igualdade dos privilégios de coluna com o repositório). `authenticated` lê
    `channel` de `app.booking`, não `holding_id`, sem INSERT; `anon` sem acesso; RLS ativa em `app.booking`,
    `app.capability_activation` e `app.notification`; políticas `booking_app_insert`, `booking_app_read` e
    `booking_holder_read`.
  - Operação: três crons inalterados (`close_exercise 41 5 * * *`, `open_exercise 23 4 * * *`, `outbox 17 6 * * *`);
    24 nomes de env idênticos aos do preflight, sem gates; `track_commit_timestamp` desligado. Nenhum cron manual,
    segredo, flag ou gate alterado.
  - Interface fechada: sem holding em Production, nenhum Titular alcança as telas novas; a apresentação lê a mesma
    ativação vazia; nenhuma confirmação real foi executada. O estado fechado e a confirmação (só no banco descartável)
    foram provados no E2E do mesmo código.
- Limitação de observabilidade: nenhum agrupamento de erro de runtime na janela de 1 h e nenhum registro de log de
  runtime na janela de 40 min consultadas (o plano Hobby retém 1 h); a CLI não devolveu registros de requisição deste
  ambiente; o smoke direto não teve 5xx. Essas janelas limitadas não provam ausência absoluta de erros.

## Pendências preservadas

- **Ativação:** a linha `own_use_booking` em `app.capability_activation` continua proibida. Depende da W13 em
  Production, dos ensaios operacionais (desativação emergencial, credenciais), da verificação operacional do `outbox`
  (execuções observadas e latência das notificações aceita) e de nova autorização do fundador; só por migration pela CI.
- **Riscos:** R1–R5 pendentes de ratificação específica para a ativação. T-1207 aceito provisoriamente só para o estado
  atual de reservas fechadas, com reavaliação antes da operação real (STRIDE `booking`).
- **W13:** cancelamento, restauração e tratamento de reservas indevidas (inclusive a reserva forjada a menos de 15 dias
  do check-in, R4), e `correct_use_right` (emenda D2).
- **W22:** reserva sobre `reserved_right` devolvido (emenda D4).
- **W28:** visibilidade e exercício dos compromissos que sobrevivem à transferência (BR-344 a BR-346, nota W12 no roadmap).
- **W30:** selo de auditoria (R5), reconciliação e endurecimento (limitador da prévia e `statement_timeout`, se as
  métricas pedirem).
