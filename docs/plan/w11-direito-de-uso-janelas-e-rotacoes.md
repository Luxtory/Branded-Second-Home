# W11 — execução do plano aprovado

Data: 2026-10-30. Base: `6ef5004928ea6c073355cad8334f1686e1f3795d` (main = Production, 49/0). Plano técnico
apresentado, revisado criticamente em duas rodadas e aprovado pelo fundador no chat em 2026-10-30, com autorização de
execução das etapas E0–E8 até o PR draft (sem merge, deploy ou alteração de Production). Este documento organiza a
execução, sem substituir os canônicos. Spec: [`calendar`](../specs/calendar.md) §6 (e nota em `ownership` §15.9).
Decisão: [ADR-0025](../adr/0025-direito-de-uso-ledger-rotacao-derivada-e-fronteira.md). Sem closeout até merge
autorizado.

## Decisões do fundador (2026-10-30)

- **D1:** arquitetura aprovada para implementação; o risco residual da W11 **não está ratificado** — depende dos testes
  com os privilégios reais e da auditoria do PR. A ratificação da W10 não se estende.
- **D2:** `correct_use_right` (command e `POST /v1/admin/use-right-corrections`) adiado para a W13 por emenda explícita
  do roadmap; na W11, `correction` só estrutural e fechada ao papel da aplicação.
- **D3:** INV-4 com igualdade estrita na configuração integral; exercício parcial conforme a alocação aprovada na W8,
  sem proporcionalidade inventada.
- **D4:** uma notificação por Ação, agendada para a abertura da elegibilidade e entregue pelo outbox; entrega ou atraso
  nunca afetam a elegibilidade.
- **D5:** derivações fundamentadas nos canônicos; casos-limite do 29/02 validados à parte (abaixo).
- **D6:** E0–E8 até o PR draft. Restrição operacional temporária de ativação (não regra canônica): nenhuma reserva real
  antes dos mecanismos necessários da W13.

## Ajustes obrigatórios da segunda revisão e como foram tratados

- **A — ledger e `source`.** Forma por movimento num `CHECK` (`use_right_movement_shape`): só o `grant` tem `source`;
  `initial_allocation_id` só no grant da alocação; `stay_date` em consumo/restauração; `refers_to_id` em
  restauração/correção; `effective_at` só na expiração; `quantity` é magnitude (1 por noite; ≥ 1 na expiração e na
  correção). Direção da correção não definida (W13).
- **B — grant tardio do 29/02.** Adotada a alternativa 1: nenhuma concessão depois do fim efetivo, com a mesma regra
  antes ou depois de 31/12 (o banco recusa `use_right_leap_expired`). As alternativas 2 (concessão + expiração na mesma
  transação) e 3 (concessão + `close_exercise` depois) criariam movimentos para um direito que nunca pôde ser exercido,
  e a 3 deixaria saldo aparente depois do vencimento. Sem ambiguidade normativa material: PD-004 define o desfecho
  (expira com a data, sem transporte), BR-094 faz a lista avançar a cada ano bissexto e nenhum canônico prevê
  compensação; a causa operacional (sorteio atrasado) fica em log (`leap_day_lapsed`) e nos riscos.
- **Auditoria do PR (2026-10-30).** (1) `leap_day_lapsed` só cobre o horizonte do job (corrente e seguinte): sinal
  operacional, não registro; sem obrigação de rastreabilidade que peça outro mecanismo, porque o vencimento sem
  concessão é reconstruível dos fatos por consulta somente leitura — documentada no runbook e testada. (2) Falha da
  consulta inicial do `close_exercise`: a infraestrutura existente já responde 500 `ERR_INTERNAL` com log estruturado
  (`withRoute`), sem escrita anterior; nenhum tratamento novo, só um teste do job.
- **C — expiração e recuperação.** O banco recusa consumo e restauração depois do fim efetivo pelo próprio relógio
  (`balance_use_right_expired`), sem depender do job; o `close_exercise` varre todo exercício com saldo restante, de
  qualquer ano, e registra o restante exato com o instante canônico.
- **D — rotação.** `nonNegativeModulo` em TypeScript e `((x % n) + n) % n` em SQL; ciclos completos de N = 2, 4, 8 e
  10 testados nas duas implementações.
- **E — `open_exercise`.** Passos explícitos `seal` e `leap_day` no mesmo command de sistema (sem novo mecanismo de
  autorização); o job descobre o `leap_day` pendente também em exercício já selado; uma transação por passo.

## Restrições globais

- Canônicos intocados; migrations aplicadas intocadas (três migrations novas, 49 → 52); sem endpoint, segredo, variável
  ou papel novo; sem telas; Production intocada.
- Fixtures das waves anteriores ajustadas só onde a evolução do esquema exige (rollback da W8 desfaz a W11 primeiro;
  dependências novas do handler; contadores novos do job; lista fechada de commands de sistema), sem enfraquecer
  critérios.

## Etapas

- **E0** worktree `/home/rjr-idb/luxtory-w11`, branch `feat/w11-direito-de-uso-janelas-rotacoes`; plano, ADR-0025, specs,
  STRIDE (T-1101..T-1104), runbook, OpenAPI (`runJob`), AsyncAPI (dois eventos), emenda do roadmap.
- **E1** domínio puro (rotação, lista do 29/02, janelas, fim efetivo) com TDD.
- **E2** M1 `calendar_use_right_ledger_movements` + equivalência TS×SQL.
- **E3** M2 `calendar_use_right_balance`, M3 `calendar_use_right_invariant_checks`, hook de invariantes, codegen.
- **E4** `open_exercise` com `seal`/`leap_day`; job com descoberta de passos pendentes.
- **E5** `close_exercise` (command, job, cron `41 5 * * *`).
- **E6** eventos e consumidores; `availableAt` com piso `occurred_at` no platform.
- **E7** documentação.
- **E8** `npm run verify`, `npm run test:e2e --workers=2`, `npm run trace`, revisão, PR draft, CI; parar antes do merge.
