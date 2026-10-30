# 0025. Direito de Uso: ledger único conferido pelos fatos, rotação derivada e fronteira de confiança da W11

- Date: 2026-10-30
- Status: Accepted (arquitetura); risco residual **pendente de ratificação** do fundador
- Deciders: Luxtory (fundador), Engenharia
- Tags: calendar, ownership, postgresql, security, jobs

## Context

A W11 entrega saldos por Ação, exercício e categoria, a lista própria do 29/02 e as janelas cumulativas (`02` REQ-030 a
REQ-033, REQ-039, PD-004, INV-4, INV-5; `03` TECH-026, TECH-027, TECH-042, TECH-090). A W8 criou o `use_right_ledger`
só com as concessões do primeiro exercício e amarrou toda linha à operação da formalização (FK com `operation_id`,
`UNIQUE` incluindo `movement`, constraint diferida que exige exatamente 2N linhas). A W9 grava a posição sorteada por
Ação; a W10 sela o exercício corrente e o seguinte e define a fronteira de confiança do inventário (ADR-0024). O
sorteio é assíncrono (beacon futuro + outbox), então a selagem pode acontecer antes de as posições existirem. A
aceitação do risco residual da W10 vale só para a W10.

## Decision

1. **Um ledger, cinco movimentos (TECH-026).** Migration nova amplia o ledger da W8 sem editar a aplicada: forma de
   cada movimento por `CHECK` — só o `grant` tem `source` (configuração ou alocação inicial; o 29/02 é da
   configuração, sempre 1), `consume`/`restore` têm a noite (`stay_date`), `restore`/`correction` apontam para o
   movimento corrigido (`refers_to_id`), `expire` tem o fim efetivo (`effective_at`); `quantity` é magnitude. A
   constraint diferida da W8 passa a contar só as concessões da própria formalização (2N) e dispara só para `grant`.
2. **Conferência pelos fatos (INVOKER).** Um gatilho BEFORE INSERT confere cada movimento: concessão operacional só do
   command de sistema `open_exercise`, Co-Owner, exercício posterior ao primeiro, exercício selado e quantidade igual
   ao limite da configuração; 29/02 só com a noite selada, para a Ação da lista bissexta (função SQL equivalente à do
   TypeScript) e antes do fim efetivo; expiração só do `close_exercise`, depois do fim efetivo pelo relógio do banco,
   com `effective_at` canônico carimbado pelo banco; consumo no bucket e no exercício da própria noite e antes do fim
   efetivo. Uma constraint no COMMIT impede exercício Co-Owner posterior ao primeiro selado sem as 2N concessões.
3. **Projeção `use_right_balance`.** Linha por (Ação, exercício, bucket) com `CHECK` de saldo não negativo (prefixo
   `balance_` → `ERR_USE_RIGHT_BALANCE`): duas reduções concorrentes se serializam na linha e a segunda falha. Mantida
   por um único gatilho AFTER INSERT `SECURITY DEFINER`: o papel da aplicação não tem escrita no saldo, e `FOR UPDATE`
   exigiria `UPDATE` para ele. Restrições: só como gatilho AFTER INSERT ROW do ledger (conferido dentro da função),
   efeito derivado apenas da linha já validada, sem parâmetro nem SQL dinâmico, `search_path` vazio, sem `EXECUTE`
   para ninguém (sem ele não se cria outro gatilho com a função). Toda validação e o gate ficam em gatilhos INVOKER:
   o gate decide por `current_user`, que dentro de uma função DEFINER seria o dono. `granted` e a chave são imutáveis.
4. **Rotação e janelas derivadas, sem tabela.** Posição ordinária `((p₀ − 1 − (Y − Y₀)) mod N) + 1` (módulo não
   negativo); base `max(15/09/(Y−1) 00:00 local, formalização)`; abertura `base + (p − 1) × 7 dias civis`; Luxtory
   N+1. A lista do 29/02 é a ordem ordinária do primeiro ano com 29/02 na data-base ou depois; no k-ésimo ano
   bissexto seguinte o direito é de `lista[k mod N]`. Todas as entradas são fatos imutáveis (posição sorteada,
   data-base, N); a lista derivada é idêntica a uma lista congelada na primeira ocorrência e nunca lê a ordem
   ordinária de um ano bissexto posterior. Cada concessão anual do 29/02 fica persistida (imutável) no ledger.
5. **Passos do `open_exercise`, uma transação cada.** `seal` (W10 + concessões da configuração + agendamento das
   janelas se o sorteio já foi revelado) e `leap_day` (29/02). O job descobre os passos pendentes pelo estado, também em
   exercício selado em execução anterior; chave de idempotência por passo; falha no 29/02 nunca desfaz a selagem. Sem
   command novo nem novo mecanismo de autorização: o mesmo command de sistema e o guard da W10.
6. **29/02 sem concessão retroativa (D5).** Se o sorteio só termina depois do fim efetivo do 29/02, nada é concedido
   (antes ou depois de 31/12, mesma regra); a lista avança pelo calendário, sem compensação presumida (PD-004). O job
   registra o caso em log (`leap_day_lapsed`).
7. **Expiração (`close_exercise`).** Command de sistema e job novos (TECH-090), cron diário. Considera todo exercício
   com saldo restante, de qualquer ano, e expira exatamente o restante de cada bucket vencido: recupera atrasos sem
   prorrogar. O direito deixa de ser utilizável no fim efetivo pelo banco, com ou sem o registro. Falha vai só ao log
   estruturado: a lista de alertas do TECH-101 é fechada e não inclui este job.
8. **Fronteira de confiança da W11.** O papel da aplicação insere só `grant` e `expire`, ambos conferidos pelos fatos.
   `consume` e `restore` ficam fechados ao papel da aplicação (gate `app.assert_use_right_consumption_enabled`, como o
   do inventário) até a wave do command (W12/W13) decidir a regra de autorização com o fundador. `correction` é só
   estrutural — nunca sobre concessão, referência a consumo ou expiração da mesma Ação, exercício e categoria — e
   fechada a todos até a W13 (D2).
9. **Notificações (REQ-097, D4).** Uma por Ação na abertura da própria janela (`calendar.use_window_opened`) e o direito
   ao 29/02 na base (`calendar.leap_day_granted`), pelo outbox com `available_at` — nunca antes do `occurred_at`
   (piso aplicado no platform). Emitidas pelo passo `seal` ou pelo consumidor de `ownership.initial_draw_completed`,
   ambos sob a trava consultiva da Second Home: um dos dois sempre enxerga selagem e revelação commitadas, e a
   `dedup_key` descarta a cópia. Destinatários resolvidos na entrega. A elegibilidade nunca depende da entrega.

## Risco residual da W11 — pendente de ratificação

Uma operação forjada pelo papel da aplicação só consegue, nos limites provados pelos testes com os privilégios reais
(`tests/migrations/use-right.db.test.ts`): (1) selar um exercício devido junto com as concessões canônicas dele; (2)
conceder o 29/02 à Ação canônica, com a noite selada e antes do vencimento, no máximo uma execução antes do job; (3)
registrar a expiração exata de saldo já inutilizável. Não consegue consumir, restaurar, corrigir, escrever no saldo,
alterar concessão ou rotação, nem tocar custódia. A ratificação da W10 não se estende; a decisão do fundador fica
registrada aqui quando tomada.

## Consequences

- A W12 consome e restaura por noite, no bucket da noite, e precisa decidir a autorização no banco do consumo junto com
  a da transição `spe_pool → reserved_right` (ADR-0024 §3). O saldo é travado pela própria manutenção da projeção, em
  ordem de noite; a W12 também deve recusar noite passada.
- A W13 recebe o command `correct_use_right` e o endpoint (emenda do roadmap, D2), com a prova da correção contra
  reserva, ocupação e custódia.
- A W14 deve recusar a seleção Luxtory do 29/02 (fora da capacidade ordinária da Luxtory, BR-091).
- Liveness: até um ciclo do job depois da revelação para conceder o primeiro 29/02 selado antes do sorteio; nenhuma
  outra Ação consegue usar a data nesse intervalo.

## Alternatives considered

- Concessão do 29/02 no consumidor de `ownership.initial_draw_completed`: escrita crítica por consumidor (ADR-006 do
  `03`), e o evento é único por aquisição — os anos bissextos seguintes ainda dependeriam do job (dois escritores).
- Concessão do 29/02 na mesma transação da selagem: uma falha dele desfaria a selagem do exercício inteiro.
- Tabela de posições por exercício ou lista bissexta persistida: segunda cópia de função determinística de fatos
  imutáveis; a persistência só seria necessária com novo sorteio, mudança de N ou troca de posição entre Ações.
- Saldo como view: sem linha travável, duas reduções concorrentes não se serializam no banco sem lock explícito no
  gatilho, o que inverteria a ordem do TECH-053.
- Conceder e expirar o 29/02 na mesma transação quando o sorteio atrasa: dois movimentos artificiais para um direito
  que nunca pôde ser exercido; a regra única (sem concessão depois do vencimento) evita a assimetria antes/depois de
  31/12.
- Alerta novo `close_exercise_failure`: a lista do TECH-101 é fechada; a validade não depende do job.
