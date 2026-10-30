# Calendário — classificação civil (W8)

## 1. Fontes e escopo

Fontes: 01 BR-074, BR-080–083, BR-090–095, BR-107–109; 02 PD-003/EC-3 e REQ-033; 03 TECH-020/026/040/041/110.
Esta spec referencia essas regras e define somente sua aplicação técnica na formalização, sem substituir o texto canônico.

W8 entrega PD-003 e a classificação civil necessária à formalização. Não entrega janelas, rotação, sorteio, selagem, custódia, reservas, balance ou calendário operacional anual.

## 2. Representação e fronteiras

- Datas civis ISO YYYY-MM-DD e timezone IANA da Second Home; instantes reais UTC.
- A base operation_start_date é civil. Seu ano é o primeiro exercício. A partialidade é derivada de mês/dia, não da data de aquisição.
- temporal-polyfill 1.0.5 (HERDADA, ADR-0004) fica encapsulado no adapter; tipos próprios de data/season atravessam a porta pública.
- Enumeração de noites é determinística e efêmera; não existe calendário persistido paralelo.
- PROPOSTA W8: a classificação reutiliza somente a janela determinística de Carnaval do último ano consultado,
  em memória limitada a um exercício e sem expor o conjunto interno. A capacidade futura continua sendo calculada
  a cada chamada, com timezone e relógio revalidados; nenhuma disponibilidade é armazenada nesse memo.
- Na base atual, nenhuma fonte modelada compromete noites antes da formalização. W8 não inventa bloqueios externos ou antecipa W10.

## 3. Classificação e validação

Aplicar diretamente PD-003/TECH-041: computus gregoriano; Carnaval a partir da sexta anterior à terça Páscoa-47; começo em 01/02 no caso de sexta em janeiro; selecionar dez datas adicionais válidas, ignorando 29/02 e meses já Alta.

Janeiro/julho/dezembro são alta; demais noites media, ressalvada a janela adicional. 29/02 é media extraordinária e não integra as contagens ordinárias.
Noite futura tem check-in canônico às 14h local estritamente posterior ao relógio revalidado. A capacidade civil do primeiro exercício começa na base civil e termina em 31/12, excluindo 29/02 e noites transcorridas.
O handler chama a validação com relógio fresco após locks. Contagens não são reservas e não autorizam uso operacional.

## 4. Aceite e testes

- PD-003/EC-3: casos independentes de Carnaval, sexta 31/01 em 1913, início 01/02, salto de 29/02, ausência de duplicação em meses Alta.
- TECH-110: varrer 1900..2100; 2000 bissexto e 2100 não bissexto; 103 alta/262 media ordinários, mais leap quando aplicável.
- TECH-040: múltiplos fusos, virada de exercício, datas inválidas e fronteira exata de 14h; domínio não depende do timezone do processo.
- Primeiro exercício parcial: somente noites futuras desde operation_start_date. Quantidades são fornecidas e validadas em ownership, nunca proporcionadas pelo calendário.

## 5. Selagem do exercício e job `open_exercise` (W10)

Fontes: 01 BR-074, BR-080, BR-090, BR-103; 02 REQ-024, REQ-030, PD-003; 03 ADR-003, TECH-021, TECH-040, TECH-041,
TECH-042, TECH-054, TECH-090, TECH-101, TECH-110. Decisão: [ADR-0024](../adr/0024-custodia-selagem-e-fronteira-de-confianca.md).
Custódia, ocupação e barreiras: [`inventory.md`](inventory.md).

- **O que se sela.** Um exercício inteiro, numa transação: toda noite da data-base (`acquisition.operation_start_date`,
  congelada na formalização) ou de 01/01 até 31/12. Exercício completo = 103 Alta/Super Alta + 262 Média/Baixa + 29/02 em
  ano bissexto (Média/Baixa, `is_leap_day`; o Direito de Uso extraordinário e a rotação dele são da W11). Exercício
  parcial = exatamente da data-base a 31/12. Noite antes da data-base nunca é selada. Noite selada nunca é
  reclassificada, alterada ou apagada.
- **Quando.** Formalização (W8) torna a Second Home selável; o registro do início efetivo da operação não interfere. O
  job sela o exercício corrente e o seguinte pela data local de cada Second Home (TECH-040), a partir do ano da
  data-base — a posição 1 abre em 15/09 do ano anterior (TECH-042), e o exercício seguinte é selado já em 01/01.
- **Horizonte no banco.** O gatilho de selagem recusa noite de exercício anterior ao corrente ou posterior ao seguinte
  pelo ano civil local do relógio do servidor, no fuso da Second Home e sem tolerância (`app.exercise_within_horizon`,
  testada nas viradas de ano; `custody_exercise_horizon`): o job e o banco usam
  o mesmo horizonte, e uma operação forjada não sela à frente nem para trás dele. Exercício passado nunca é selado,
  mesmo com data-base antiga. `sealed_at` é carimbado pelo banco (instante da transação).
- **Classificação.** O TypeScript (W8) produz `season` e o check-in; o banco confere: `app.canonical_season` (mesmo
  algoritmo, comparado exaustivamente nos anos 1–9999) e `checkin_at = (stay_date + 14:00) AT TIME ZONE timezone`.
  Divergência → falha fechada e alerta. Check-out = 10:00 local da manhã seguinte, derivado (`checkOutAt`), sem coluna.
  Hora local inexistente ou ambígua → recusa.
- **Command de sistema `open_exercise`** (`SYSTEM_COMMANDS`, ator `system`, guard do platform): trava consultiva da
  Second Home (mesma chave da W8) → relê a formalização → recusa `ERR_STATE_TRANSITION` se já selado, sem formalização ou
  anterior à data-base → grava as noites → abre as custódias raiz pela interface do inventory na mesma transação → uma
  auditoria por exercício (`second_home_exercise`, `<id>:<ano>`).
- **Job.** Cron diário (`vercel.json`) e disparo pós-commit da formalização via `after()` nas duas entradas (rota API
  e Server Action), ambos melhor esforço; disparo manual pelo runbook. Corrente primeiro; um exercício por transação;
  chave `open_exercise:<home>:<ano>:<correlation_id>` (nunca reaproveitada entre execuções); orçamento de 240 s abaixo
  do teto de 300 s da função, com o restante para a próxima execução. Resultado: `formalized`, `due`, `sealed`,
  `already_sealed`, `failed`, `deferred`.
- **Superfícies.** `@/features/calendar` continua só o calendário civil, sem dependências de servidor (o suporte de
  testes e do E2E o importa); o job sai por `@/features/calendar/jobs`, registrado pelo platform.
- **Falhas.** Item que falha não interrompe os demais; ao fim, um alerta `open_exercise_failure` (escopo `item`) com
  ids e códigos. Falha geral (configuração, banco) → alerta de escopo `run` e erro HTTP. O alerta sai fora do outbox:
  log estruturado sempre; e-mail à staff quando configurado (ADR-0024 §8). A ausência de execução do cron não é
  detectável pelo próprio job (risco residual até a reconciliação da W30).
- **Aceite.** [TECH-041] 103 + 262 (+29/02) e parcial exato; [TECH-110] noite selada sem custódia ativa falha no COMMIT;
  [REQ-024] Owner formalizado → custódia `owner` (Co-Owner → `spe_pool`); [TECH-110] 14:00/10:00 locais em UTC em vários
  fusos; [TECH-090] repetição, execuções simultâneas, queda da conexão, timeout de lock, orçamento esgotado e
  falha → correção → sucesso produzem exatamente uma selagem e uma custódia ativa por noite; [TECH-101] alerta de item e
  de execução, com transporte simulado e recusa segura sem configuração.

## 6. Direito de Uso, janelas e rotações (W11)

Fontes: 01 BR-071, BR-074–BR-083, BR-090–BR-095, BR-100–BR-109, BR-120–BR-122, BR-162; 02 REQ-030, REQ-031,
REQ-032, REQ-033, REQ-039, REQ-097, PD-004, INV-4, INV-5, §15 itens 3 e 4; 03 TECH-026, TECH-027, TECH-040, TECH-042,
TECH-053, TECH-054, TECH-056, TECH-090, TECH-110, §13. Decisão: [ADR-0025](../adr/0025-direito-de-uso-ledger-rotacao-derivada-e-fronteira.md);
plano: [`docs/plan/w11-direito-de-uso-janelas-e-rotacoes.md`](../plan/w11-direito-de-uso-janelas-e-rotacoes.md).

Dona: REQ-030, REQ-031, REQ-032, REQ-033, REQ-039, PD-004, INV-4, INV-5. Fora: reserva, permanência e
`ERR_WINDOW_NOT_OPEN` (W12), cancelamento e restauração pelo command (W13), `correct_use_right` (W13, D2), seleção
Luxtory (W14), telas e leituras do Titular (W12), catálogo de notificações (W30).

- **Ledger (TECH-026).** O `use_right_ledger` da W8, só-inserção, com `grant · consume · restore · expire ·
  correction`. Forma por movimento: só o `grant` tem `source` (`configuration` ou `initial_allocation`; o 29/02 é
  `configuration`, quantidade 1); `consume`/`restore` têm a noite; `restore`/`correction` apontam o movimento
  corrigido; `expire` tem o fim efetivo carimbado pelo banco. Uma concessão por Ação, exercício e bucket; um 29/02 por
  Second Home e ano; uma restauração por consumo.
- **Concessões.** Primeiro exercício: as da formalização (W8; parcial = alocação aprovada, sem proporcionalidade, D3).
  Do seguinte em diante: o passo `seal` do `open_exercise` concede a cada Ação o limite da configuração, na transação
  da selagem; o banco recusa exercício Co-Owner posterior ao primeiro selado sem as 2N concessões. INV-4: N × limite +
  capacidade Luxtory = 103 Alta/Super Alta e 262 Média/Baixa na configuração integral.
- **Saldo (`use_right_balance`).** Projeção por (Ação, exercício, bucket): `granted`, `consumed`, `expired`,
  `remaining`. Nunca negativo; buckets não se compensam; cada noite consome o bucket da própria categoria e do próprio
  exercício (o 29/02 só o `leap`). Saldo do exercício N nunca atende N+1. Recusa → `ERR_USE_RIGHT_BALANCE`.
- **Rotação e janelas (TECH-042).** Derivadas dos fatos, sem tabela: posição ordinária pela BR-101 a partir da
  posição sorteada; base `15/09 00:00` local do ano anterior ou a formalização, se posterior; posição `p` abre
  `(p − 1) × 7` dias civis depois; Luxtory na posição N+1; abertura cumulativa (BR-103) até o fim do exercício. Hora
  local inexistente ou ambígua → recusa. Sem sorteio revelado não há janela (falha fechada).
- **29/02 (TECH-027, PD-004).** Lista fixada no primeiro 29/02 da operação (data-base em 29/02 conta), copiando a ordem
  ordinária daquele exercício; avança uma posição por ano bissexto (2100, 2200, 2300 não contam) e reinicia na mesma
  ordem; nunca lê a ordem ordinária de ano posterior. O passo `leap_day` concede 1 à Ação contemplada quando a noite
  está selada e o sorteio revelado, antes do fim efetivo. Vencido antes disso, não há concessão retroativa nem
  compensação (D5); o log `leap_day_lapsed` só cobre o horizonte do job, e o vencimento de qualquer exercício é
  reconstruível dos fatos (consulta do runbook).
- **Fim efetivo e `close_exercise`.** 29/02: 00:00 de 01/03; Alta e Média: 00:00 de 01/01 seguinte, no fuso da Second
  Home. Depois dele o banco recusa uso, com ou sem registro. O job `close_exercise` registra a expiração exata do
  restante de todo exercício vencido, de qualquer ano, com o instante canônico; repetição é no-op. Não toca custódia:
  capacidade não reservada continua `spe_pool` (REQ-039, BR-162) e nunca entra no Inventário Luxtory.
- **Notificações (REQ-097, D4).** `calendar.use_window_opened` por Ação na abertura da janela e
  `calendar.leap_day_granted` na base, pelo outbox com `available_at`; registro aos titulares vigentes na entrega.
- **Fronteira (ADR-0025 §8).** O papel da aplicação só insere `grant` e `expire`, conferidos pelos fatos; `consume` e
  `restore` são do dono do schema até a W12/W13; `correction` é recusada a todos até a W13. Sem leitura do Titular.
- **Aceite.** [INV-4] limites somados + Luxtory = capacidade; excesso ou categoria errada falha · [INV-5] saldo do ano N
  não atende N+1 · [REQ-030] categorias não se compensam; saldo insuficiente → ERR_USE_RIGHT_BALANCE · [REQ-031] lista
  bissexta nunca é recalculada · [TECH-110] o 29/02 é Média/Baixa e consome só o leap · [REQ-032] rotação e abertura
  cumulativa · [REQ-033] exercício parcial usa só a alocação; janelas contam da formalização · [PD-004][EC-4] o 29/02
  abre na base e expira sem transporte nem Inventário · [REQ-039] capacidade não reservada fica coletiva até o fim do
  exercício · [TECH-110] correção nunca altera concessão.
