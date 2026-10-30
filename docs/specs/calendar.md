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
