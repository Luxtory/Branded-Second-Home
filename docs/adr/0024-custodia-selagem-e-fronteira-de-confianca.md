# 0024. Selagem por exercício, custódia em camadas e fronteira de confiança do inventário

- Date: 2026-10-29
- Status: Accepted
- Deciders: Luxtory (fundador), Engenharia
- Tags: calendar, inventory, postgresql, security, jobs

## Context

A W10 entrega a noite selada da Second Home, a custódia por noite e a ocupação (ADR-003 e ADR-004 do `03`; TECH-021,
TECH-022, TECH-023), com o job `open_exercise` (TECH-090) e o alerta `open_exercise_failure` (TECH-101). O plano foi
aprovado pelo fundador em 2026-10-29 após auditoria independente e revisão crítica
([`docs/plan/w10-custodia-e-selagem.md`](../plan/w10-custodia-e-selagem.md)).

Fatos que restringem o desenho:

- conta Vercel no plano Hobby: cada cron roda no máximo 1×/dia, em qualquer minuto da hora marcada, sem retry, e a
  entrega pode faltar ou duplicar; a função dura no máximo 300 s;
- o executor grava recusas por constraint (inclusive no COMMIT) na idempotência e insere a operação `pending`, que só
  vira `committed` no fim da mesma transação;
- o papel `luxtory_app` tem `INSERT` em `app.operation`, `app.idempotency_record` e `app.audit_log`: o banco não
  consegue provar que um command passou pelo guard, e a trilha do executor é gravável pelo mesmo papel;
- o `03` não define colunas de Ação e de operação em `date_occupancy`, mas a TECH-023 exige "mesma Ação" e "mesma
  operação"; a TECH-022 não tem saída para `use_right/delinquency` nem para `luxtory/{finalidade ≠ inventory}`.

## Decision

1. **Selagem por exercício, autorizada pelos fatos.** O command de sistema `open_exercise` sela, numa transação, todas as
   noites de um exercício da Second Home formalizada, da data-base (`acquisition.operation_start_date`) até 31/12, e
   abre a custódia raiz de cada noite (`owner` no Owner, `spe_pool` no Co-Owner). O registro do início efetivo da
   operação não interfere. O banco confere cobertura contínua, 103 + 262 (+29/02) no exercício completo, classificação
   canônica (função SQL, comparada exaustivamente com o TypeScript nos anos 1–9999) e o check-in das 14:00 locais pelas
   regras de fuso do PostgreSQL. Divergência → falha fechada. O instante `sealed_at` é carimbado pelo banco (instante da
   transação), como os carimbos do sorteio (ADR-0022): o valor enviado nunca prevalece.
2. **Prontidão.** O job roda pelo cron diário e também logo após a formalização, via `after()` nas duas entradas (rota e
   Server Action), sem evento, command ou endpoint novo. Nenhum dos dois é garantia: a integridade vem do banco — sem
   noite selada não existe custódia nem ocupação (FK), e toda operação futura sobre noite não selada falha fechada.
3. **Fronteira de confiança.** O servidor da aplicação é a fronteira que executa o guard (TECH-050, ADR-002 do `03`),
   como em todos os commands desde a W1. Uma operação forjada pelo papel da aplicação não é distinguível de uma
   legítima, então a W10 não usa a operação como prova de autorização:
   - a raiz é autorizada pelos fatos — primeira custódia da noite, modalidade da aquisição, noite selada e canônica —,
     de modo que uma operação forjada só consegue a selagem que o sistema faria (teste com os privilégios efetivos);
   - toda linha de inventário aponta para uma operação `pending` e, na raiz, do command `open_exercise`. Para o código do
     servidor é a operação da transação corrente (o executor nunca comita uma operação `pending`); o papel da aplicação
     consegue comitar uma `pending` e reutilizá-la em outra transação (teste), sem capacidade além da de inserir uma
     operação nova. É consistência contra erros de código, declaradamente não autenticidade;
   - nenhuma transição ou ocupação é executável pelo papel da aplicação na W10, por duas travas independentes: sem
     `UPDATE` em `date_custody` e sem `INSERT`/`UPDATE` em `date_occupancy`; e o gate `app.assert_inventory_transition_enabled`,
     chamado pelos gatilhos de transição, fechamento, ocupação e liberação, recusa todo papel que não seja o dono do
     schema — conceder privilégio não basta (teste com privilégio concedido). Habilitar uma transição exige migration
     que substitua o gate pela regra de autorização da wave dona: ponto obrigatório de reavaliação no banco.
   - o banco limita a selagem ao exercício corrente e ao seguinte pelo ano civil local do relógio do servidor, no fuso
     da Second Home e sem tolerância (`app.exercise_within_horizon`, testada nas viradas de ano), também para uma
     operação forjada: sem o teto, uma forjada poderia selar até 9999 —
     noites imutáveis em volume sem limite, com instantes fixados pelas regras de fuso de hoje e sem recuperação sem
     reescrever histórico; sem o piso, poderia selar exercícios passados desde uma data-base antiga, sem noite
     utilizável e sem necessidade legítima (o job nunca sela exercício passado);
   - a ausência da trilha do executor (idempotência e auditoria) é sinal de anomalia, mas a presença não comprova o
     guard: o mesmo papel consegue gravar uma trilha de mesma forma (teste). Autenticidade independente não existe antes
     de uma decisão de fronteira (abaixo) ou do selo da auditoria da W30, que esta wave não antecipa.
   - **Condição de resolução**, antes da primeira wave que precisar habilitar **cada** transição ou ocupação (não
     necessariamente a W12): decidir com o fundador a autorização no banco dessa transição (manter a fronteira do
     servidor, funções `SECURITY DEFINER` com revalidação, papel ou credencial separada, ou decisão assinada), implementar
     e verificar essa regra — inclusive carimbo do banco nos instantes de fechamento e liberação —, e só então
     substituir o gate para ela. Elegibilidade de reserva nunca é inferida só da selagem (W11/W12).
   - **Risco residual:** na W10, o único efeito possível de uma operação forjada pelo papel da aplicação é selar, de
     forma canônica, um exercício já devido (o corrente ou o seguinte) antes do cron. Aceitação do fundador, com alcance
     e condições, registrada à parte em "Aceitação do risco residual da W10".
4. **Três camadas.** (1) Estrutural, completa na W10: tabela fechada da TECH-022 (inclusive `luxtory/inventory → pai`,
   BR-163), matriz da TECH-023, cadeia linear (`UNIQUE(parent_custody_id)`), fechamento e liberação únicos, custódia
   ocupada só fecha após a liberação, exatamente uma custódia ativa por noite no COMMIT. (2) Operação concreta, como no
   item 3. (3) Prova econômica — capacidade Luxtory, Créditos ao cedente, ausência de compensação na recuperação,
   settlements — nas waves que criam esses fatos (W13, W14, W17, W19, W20); a W10 só garante que origem, autorização e
   tratamento sejam identificáveis.
5. **Colunas além do DDL do `03`.** `date_custody` ganha FKs que amarram Ação, noite e mãe à mesma Second Home;
   `date_occupancy` ganha `stake_id`, `opened_by_operation` e `released_by_operation`, necessárias para a TECH-023.
   `booking_id` fica sem FK até a W12 (ninguém grava ocupação antes). `release_reason` só aceita `ceded`; cada wave
   acrescenta os motivos do próprio fluxo. Os índices mantêm os nomes do `03` e são mapeados pelo nome exato.
6. **Idempotência e recuperação.** Chave por execução (`open_exercise:<home>:<ano>:<correlation_id>`): uma recusa
   gravada nunca é reaproveitada, então a execução seguinte retenta sozinha. A selagem única vem do estado: a seleção
   pula o selado, o handler confere de novo sob a trava consultiva da Second Home (mesma chave da W8), e chave primária,
   `uq_custody_active` e a raiz "primeira da noite" fecham o resto. Orçamento de tempo em constante (240 s) abaixo do
   teto de 300 s; o restante fica para a próxima execução.
7. **Commands de sistema.** `SYSTEM_COMMANDS` fica fora da tabela fechada do TECH-051; um guard próprio do platform só
   autoriza o job dono do command. O guard de identity continua negando o ator `system`.
8. **Alerta.** Porta `OperationalAlert` no platform: log estruturado sempre e notificação de staff por e-mail via Resend
   (fornecedor já contratado, `fetch`, sem dependência), resolvida só quando há o que alertar. Configuração ausente ou
   inválida → recusa segura (alerta só no log, com as chaves nomeadas). Transporte simulado para local e CI. Falha de
   item e falha geral são distintas; a ausência de execução do cron não é detectável pelo próprio job.

## Aceitação do risco residual da W10 (fundador, 2026-10-30)

Separada da decisão de arquitetura acima. O fundador aceitou o risco residual **estritamente limitado** à selagem
estrutural canônica de exercícios devidos — sem movimentação econômica, ocupação, Créditos ou alteração dos direitos dos
Titulares —, **condicionada** à preservação de:

1. nenhuma transição econômica ou ocupação habilitada sem regra de autorização implementada e verificada na wave
   correspondente;
2. `luxtory_app` sem privilégios de fechamento de custódia e de escrita de ocupação na W10;
3. operação `pending` ou trilha gravada pelo mesmo papel nunca tratada como prova independente de autenticidade;
4. esta aceitação não constitui autorização antecipada de novas fronteiras de confiança em waves futuras.

Qualquer mudança nessas condições exige nova decisão do fundador.

## Consequences

- O Inventário Central é uma projeção (`central_inventory`), sem segunda fonte mutável; as consultas de invariantes
  rodam após todo teste db e servirão à reconciliação da W30.
- Owner e Co-Owner têm o mesmo horizonte de selagem (corrente + seguinte), imposto pelo job e pelo banco. Se o Owner poderá reservar além do exercício
  seguinte é questão da W12 (REQ-037), registrada como pendência.
- A W10 não declara REQ-040 e INV-2 integralmente entregues: a parte estrutural é dela; a prova econômica, das waves
  seguintes. INV-3 fica completa.
- Riscos residuais: mudança de regra de fuso depois da selagem (detecção na reconciliação da W30, alerta `drift`); cron
  que não roda (mitigado pelo `after()` e pela folga de ~8,5 meses do exercício seguinte); superusuário pode contornar
  gatilhos (D5, até a W30).

## Alternatives considered

- Selar dentro da transação da formalização: contraria a TECH-021 (quem cria a raiz é o `open_exercise`) e mistura as
  responsabilidades da W8 e da W10.
- Evento novo no outbox para Owner e Co-Owner: mecanismo novo sem necessidade; o `after()` existente já cobre.
- Chave de idempotência por item ou por dia: a recusa gravada travaria o item para sempre ou até o dia seguinte.
- Vincular agora cada transição a um command por tabela de vínculos: daria aparência de autorização que o banco não
  prova (item 3) e anteciparia commands das waves seguintes.
- Coluna gerada para a temporada: uma correção futura da função reclassificaria noites seladas; o `CHECK` só valida na
  escrita.
