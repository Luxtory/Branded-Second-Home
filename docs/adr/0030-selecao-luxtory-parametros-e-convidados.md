# 0030. Seleção Luxtory, parâmetros e declaração de convidados: regras no banco, K3 e vigência só por inserção

- **Date**: 2026-11-19
- **Status**: Accepted (plano corrigido da W14 aprovado pelo fundador e pela auditoria independente em 2026-11-19;
  implementação em PR draft)
- **Deciders**: Fundador (Luxtory), auditoria independente, agente de engenharia
- **Tags**: architecture, security, database, W14

## Context

A W14 entrega REQ-016, REQ-036, REQ-092 e a parte de parâmetros do REQ-095 (`02` v4.6), com TECH-022, TECH-023,
TECH-030, TECH-051 e TECH-052 (`03` v3.18). Três fatos do código e dos canônicos moldam a decisão:

- a transição `spe_pool → luxtory/{finalidade}`, com `inventory ⇔ annual_allocation`, já está na tabela fechada do
  banco desde a W10 (`app.custody_transition_valid`), mas só o dono do schema a executa (ADR-0024 §3: cada wave decide a
  regra de autorização da transição que libera);
- a TECH-022 não tem saída de `luxtory/{finalidade ≠ inventory}` (P-12, aberta no `03` v3.18): uma seleção dessas é
  irreversível;
- TECH-030 exige versões só por inserção com autoridade, base e vigência sem sobreposição, e a TECH-052 proíbe UPDATE
  funcional em versões; a P-6 ainda não define dados nem quantidade de convidados.

## Decision

1. **Seleção = só a custódia (D1).** O `03` §7 define o fluxo como `spe_pool → luxtory` dentro de categoria e limite,
   sem reserva (o Luxplus, ao contrário, cita reserva). A custódia `luxtory/{finalidade}` registra a finalidade de cada
   data e já tira a noite de todos os canais (TECH-023). Seleção de capacidade não é ocupação: nenhum command cria
   ocupação `luxtory_use`, que segue apenas como par válido da matriz.
2. **Regra no banco + K3 fechada (D2).** O papel da aplicação só fecha `spe_pool` e abre `luxtory/{finalidade}` numa
   operação `select_luxtory_capacity` da mesma Second Home, com a atribuição Admin da operação ativa (travada contra a
   revogação, `app.lock_own_use_admin_authority`), com a K3 `luxtory_selection` presente em `app.capability_activation`,
   noite futura (`clock_timestamp()`), não bissexta (TECH-027), janela N+1 aberta (`app.luxtory_window_opens_at`, gêmea
   SQL de `windowOpensAt`, sorteio revelado), base registrada não vazia e capacidade da categoria disponível
   (`app.assert_luxtory_capacity_available`: custódias ativas da seleção por exercício e categoria, sob trava consultiva
   `app.luxtory_capacity:<Second Home>:<exercício>` entre as classes 5 e 6 do TECH-053). A capacidade vem da alocação
   inicial no primeiro exercício parcial e da configuração nos demais. A K3 entra **sem linha**: nada é executável em
   Production até migration própria autorizada pelo fundador, de preferência com a P-12 resolvida. As funções de
   custódia da W13 são copiadas literalmente e só ganham o ramo da seleção; a consulta de invariantes ganha o INV-4 do
   lado da Luxtory. O rollback é recusado com a K3 presente.
3. **Vigência só por inserção (D3).** `app.parameter` (chave fechada em `guest_rules`, por Second Home, texto) grava
   `effective_from` e um `effective_to` opcional; nada é alterado depois. Uma versão nova do mesmo escopo só é aceita se
   começar depois de todos os inícios existentes, não antes do instante da gravação e **não antes do `effective_to`
   explícito da versão mais recente** — uma publicação nunca antecipa um término expressamente estabelecido; começar
   exatamente nele é aceito (intervalos semiabertos). Sem `effective_to`, a versão vale até o início da seguinte (fim
   derivado em `app.parameter_version.effective_until`). Por indução os intervalos efetivos são disjuntos, inclusive os
   futuros; com uma versão futura agendada, uma nova só pode começar depois dela. Sem início informado, a versão vale
   no instante da gravação. Autoridade e autor são copiados da operação (`set_parameter`, papel Admin revalidado) e a
   base é obrigatória. O gatilho toma trava exclusiva por escopo antes de ler a versão mais recente: publicações
   concorrentes se serializam e a segunda enxerga a primeira; a unicidade (chave, Second Home, início) é o reforço.
   Nenhum framework genérico: W15/W16 ampliam a lista de chaves por migration própria.
4. **Declaração de convidados (D4).** `app.guest_nomination` registra a declaração do Titular, vinculada à reserva e à
   versão aceita de `guest_rules`, sem dado, identificação ou quantidade de convidados (P-6); a entidade `guest` do `03`
   §3.1 espera a P-6. Unicidade só por (reserva, versão): aceitar de novo apenas quando as regras mudarem. O gatilho
   exige operação `nominate_guest` da party representada (delegação travada, holding vigente da reserva), trava da
   reserva (mesma chave do ciclo da W13), trava compartilhada do escopo das regras, reserva `own_use` em `confirmed` ou
   `in_use` antes do check-out, e a versão vigente no instante: sem versão → recusa nomeada
   `parameter_missing_guest_rules` (ERR_PARAMETER_MISSING na E3); versão diferente → `guest_rules_changed`. Não consome
   Direito de Uso, não cria direito, ocupação nem valor econômico; o Titular continua responsável (BR-330 a BR-332).
5. **Entrada por Server Actions (D5).** Os três commands usam o executor existente (idempotência, autorização, códigos
   de erro, POST). As rotas REST `/v1` da TECH-056 para esses commands ficam **adiadas** (emenda D6 da W12 estendida),
   não cumpridas: viram adaptador fino sobre o mesmo handler quando houver consumidor fora da web. Nenhuma rota nova no
   OpenAPI; só o catálogo global `ErrorCode` ganha `ERR_GUEST_RULES_CHANGED` (o enum é o espelho exato dos códigos do
   código, como o `ERR_CANCELLATION_TERMS_CHANGED` da W13).

## Consequences

### Positive

- Nenhuma escrita da seleção, de parâmetro ou de declaração depende de o servidor estar íntegro: o banco confere
  procedência, autoridade, tempo e capacidade (padrão ADR-0026/ADR-0027).
- Ramos da W12/W13 intocados, provados por comparação das definições (`tests/migrations/w14-preservation.db.test.ts`).
- Vigência determinística e sem UPDATE, compatível com TECH-030 e TECH-052.

### Negative

- Seleção com finalidade ≠ inventory é irreversível enquanto a P-12 estiver aberta.
- Com uma versão futura agendada, não se publica outra antes dela; corrigir um agendamento exige nova versão depois.
- Duas operações forjadas que fixavam a recusa anterior da W10/W12 passam a ser recusadas pela K3 (mesma recusa,
  nome da constraint diferente; testes ajustados).

### Neutral / follow-ups

- E3: handlers, mapeamento de `parameter_missing_guest_rules` → ERR_PARAMETER_MISSING e `guest_rules_changed` →
  ERR_GUEST_RULES_CHANGED, classe de trava `luxtory_capacity` no `LockSequence`.
- Ativação da K3: migration própria, autorização do fundador, P-12 avaliada.
- P-5 (conteúdo de `guest_rules`) e P-6 (dados do convidado) continuam pendências de operação.

## Alternatives considered

- **Reserva + ocupação `luxtory_use` na seleção:** exigiria `booking.holding_id` opcional e filtros por canal nos jobs
  e telas da W13; sem ganho funcional e sem base normativa no fluxo do `03` §7.
- **Fechar `effective_to` da versão anterior por UPDATE único** (precedente da média projetada, W4.2): grava os dois
  extremos, mas é UPDATE em versão (TECH-052).
- **Antecipar silenciosamente um término explícito pela sucessora:** recusado pelo fundador; a regra exige começar no
  término ou depois.
- **Uma indicação por reserva:** poderia ser lida como limite de um convidado; substituída pela declaração por versão.
- **Rotas REST agora:** superfície e contrato sem consumidor.
