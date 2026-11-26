# W22 — Luxchange Request: aceite composto e recusa — plano

IDs (dona): REQ-061, REQ-063, REQ-064, REQ-096, PD-006 e o aceite do PD-012. TECH: TECH-023, TECH-024, TECH-043,
TECH-051, TECH-053–TECH-056, TECH-061, TECH-070, TECH-071, TECH-073, TECH-082, TECH-083, TECH-090, TECH-091.
Complementos: REQ-060, REQ-097, REQ-100, REQ-101, INV-1, INV-2, INV-6, EC-8, EC-17, EC-19, EC-20, CONC-4, CONC-5,
CONC-8, CONC-12, CONC-16 e CONC-18. Base: `main` `e7454dd` (W21, #112). Canônicos vigentes, sem mudança: `01` v10.9 ·
`02` v4.7 · `03` v3.20. Contrato vinculante: [ADR-0037](../adr/0037-request-lastro-complemento-por-datas-e-encerramentos.md)
§5–§13 (aceite no §8, capabilities no §10) — não repetido aqui. Plano anterior:
[`w21-luxchange-request-envio.md`](w21-luxchange-request-envio.md).

## Autorização

- **E0 (fundador, 2026-11-26):** exclusivamente documental, na branch `feat/w22-luxchange-request-aceite-recusa`, a
  partir da `main` atual: W21 ✅ no plano de waves, ADR-0037 §8 item 6 sem a condição de hipótese (conteúdo econômico
  intacto), este plano.
- **C0 (fundador, 2026-11-26): GO condicionado para encerrar a E0.** Q1 e Q4 aprovadas com condição, Q2 com ajustes
  obrigatórios, Q3 adiamento aceito condicionalmente, Q5 aprovada — incorporadas abaixo, com as consequências.
  Autorizados: esta revisão do plano, commit, push e PR draft só com os documentos da E0.
- **E1 em HOLD.** Não autorizados: código, migration 73, merge, deploy, escrita em Production, ativação de capabilities.
  A E0b e a E1 só começam com a aprovação expressa deste plano revisto.

## Estado verificado (2026-11-26, só leitura)

| Item | Estado |
|---|---|
| `main` | `e7454dd` = `origin/main` (o checkout local estava destacado em `e3cb145`, W17; atualizado, sem divergência remota) |
| Production | `/v1/version` `e7454dd`; `/v1/health` 200 |
| Supabase | 72 migrations (última `20261125012516`); `capability_activation`, `luxchange_request`, `payment`, `credit_lot` e `booking` com 0 linhas; `app.luxchange_invariant_breaches()` vazia |

## Reuso (nenhuma estrutura nova além do necessário)

| Existente | Uso na W22 |
|---|---|
| W21 — Request com `N`, `G`, `P`, `C`, `E`, noites com custódia/reserva, compromissos com `prl_id`, consentimento, política e parâmetros no snapshot do envio | termos vinculantes lidos, nunca recalculados (§9) |
| W21 — `luxchange_request_closure_reason`, `luxchange_complement_effective(_booking)`, `lock_night`, `lock_booking` | revalidação do aceite; prova das concorrentes encerradas |
| W21 — `luxchange_request_transition` (`UNIQUE (request_id)`), projeção por gatilho, completude do encerramento | registro da aceitação (Q1); recusa e concorrentes como encerramento pré-aceite |
| W21 — `closeLocked`, `holdCreditsReleasing`, `lockPayments`, `after()` de estornos, job `expire_requests` | recusa (cópia da retirada com autoridade do detentor); concorrentes numa única trava das classes 7 e 8 |
| W20 — transição `cession`, liberação `ceded`, custódia `luxchange_cession` com `parent_custody_id`, `luxchange_deposit_quantity_matches`, `luxchange_deposit_notice_met`, identidade pelo `xmin` | cessão do complemento e da capacidade solicitada; quantidade do cedente pela fórmula do PRL |
| W17 — `credit_lot UNIQUE (origin_operation_id, party_id)`, `consumeHold`, FEFO | dois lotes no aceite; consumo da Garantia |
| W19 — `settlement` `luxchange_fee`, reversão, estorno, `processRefund`, `reconciliation` | "Taxa definitiva" no aceite; estornos das concorrentes |
| Registro TECH-051 | `accept_request` (`holder`, Membership `eligible`) e `reject_request` (`holder`, `not_required`) já cadastrados |
| Executor (`read committed`, retry com a mesma chave em erro transitório) | serialização envio × aceite (ver "Serialização") |
| `ERR_CONCURRENT_CONFIRMATION` (TECH-056) | já existe no catálogo e no OpenAPI: Request encerrada por outra confirmação |
| Carteira (i18n) | origens `accept_request` já rotuladas ("Cessão em Request aceita", "Aceite de Request") |
| Harness de concorrência (`request-concurrency.db`) e de forja (`luxchange-request-binding.db`) | CONC-4, CONC-5, CONC-16, CONC-18 e testes adversariais, sem infraestrutura nova |

## Lacunas confirmadas no código

1. `luxchange_request_state` e `luxchange_request_transition_pair` não admitem `accepted`/`declined`
   (`migrations/20261125012516_luxchange_request.sql:53`, `:74`); `transition_check` recusa outros commands (`:777`);
   `transition_apply` sempre libera os compromissos (`:821`).
2. `credit_entry_write`: o `consume` de `held` aceita qualquer `accept_request`, sem vínculo com a Request (`:1127`);
   `available → consumed` só `create_direct`; a liberação por `reject_request` exige a K7 e não tem vínculo (`:1071`, `:1140`).
3. `credit_lot_originate` (`migrations/20261123211619_luxchange_deposit.sql:944`, `:961`): só a party que age, validade
   do snapshot da própria operação, nenhuma conferência de quantidade no aceite.
4. `settlement_write` aceita o Fee de qualquer `send_request` (`migrations/20261123032330_billing_payments.sql:376`);
   a reversão por `reject_request`/`accept_request` exige a K5 e não tem vínculo (`…luxchange_request.sql:1234`).
5. Transição `cession`, fechamento/abertura de custódia e liberação `ceded`: só `deposit_capacity`; `booking_open` só
   `own_use`, com K1 e holding da party que age na Second Home (`migrations/20261031164128_booking_own_use.sql:174`).
6. **`app.booking.holding_id NOT NULL`** (`…booking_own_use.sql:128`): o solicitante, em regra, não tem holding na
   Second Home solicitada — a reserva `luxchange_request` não cabe no modelo atual (Q2).
7. `booking_complete_constraint` dispara em toda inserção de reserva e aplica a regra do `own_use`
   (`migrations/20261031164135_calendar_own_use_consumption_and_booking_checks.sql:168`): exigiria ocupação `own_use` e
   recusaria a custódia movida pela operação (`booking_owner_effects`). `lock_own_use_titular` (cessão e cancelamento)
   exige que o ator represente a holding da reserva — falso para as reservas do complemento no aceite.
8. A view `luxchange_request_received` não traz os Créditos do cedente nem a validade (o detentor precisa vê-los antes
   de aceitar, PD-007).
9. O guard nega a autoridade `holder` (`src/features/identity/application/authorization-guard.ts:63`).
10. O avanço `advance_booking_states` e os stores do ciclo da reserva filtram `own_use` — a reserva `luxchange_request`
    ficaria `confirmed` para sempre (REQ-096).
11. O executor só refaz a tentativa em `40P01` (deadlock) e `55P03` (espera de lock esgotada)
    (`src/features/platform/infrastructure/database/errors.ts`): a corrida envio × aceite precisa de um sinal repetível.

## Decisões do C0 e consequências

### Q1 — aceitação registrada pela transição `accepted` (aprovada com condição)

Equivalência com o contrato da ADR-0037 §8 (tabela `luxchange_request_acceptance`):

| Garantia do contrato | Tabela (ADR) | Transição (W22) | Prova |
|---|---|---|---|
| uma aceitação por Request | `request_id` PK | `conflict_luxchange_request_closed UNIQUE (request_id)` — mais forte: um único evento terminal, então aceite, recusa, retirada, expiração e encerramento se excluem | segundo aceite, aceite × recusa e aceite × expiração → exatamente um |
| uma Request por operação de aceite | `operation_id UNIQUE` | índice parcial único `(operation_id) WHERE to_state = 'accepted'` (a mesma operação segue podendo encerrar várias concorrentes) | forja: segunda aceitação na operação |
| vínculo com `accept_request` | gatilhos a escrever | `transition_check`: `accepted` ⇔ `op.command = 'accept_request'`, papel Titular, party que age = detentor e sem representação do solicitante (BR-211), Memberships `active` (`FOR SHARE`), snapshot do aceite na transação (`xmin`) com `resolved_at < expires_at`, `closure_reason` nulo | forja: outro command, outra party, fora do prazo |
| gravada antes dos demais efeitos | ordem do handler | igual: primeiro efeito; cessões, lotes, consumos, reserva e apuração exigem a transição `accepted` desta operação para esta Request | forja: escrita do aceite sem transição |
| estado aceito | projeção | `transition_apply` projeta `accepted` (o guard da Request só muda `state` seguindo a transição); compromissos não são liberados nesse ramo | estado e compromissos depois do aceite |
| completude econômica no COMMIT | constraint trigger novo | o constraint trigger existente da transição desvia `accepted` para `assert_luxchange_request_accept_complete` (nova); o caminho pré-aceite fica intacto | três cenários econômicos; invariantes |
| idempotência e aceite duplicado | — | operação única por `Idempotency-Key` (executor); trava da Request (classe 1) + índice único | replay; duas chaves concorrentes |
| rastreabilidade | `request_id`, `operation_id` | `transition.operation_id` → lotes (`origin_operation_id`), custódias (`opened_by`/`closed_by_operation`, `authorization_ref` com o id da Request), reserva (`opened_by_operation`), consumos e apuração | teste da cadeia do §8 item 8 |

Nenhum invariante exclusivo da tabela foi encontrado; o `03` (TECH-073 item 1) exige "linha de aceitação única da
Request", não uma tabela. Projeção: `closure_reason = 'accepted'`, `closed_by_operation`, `closed_at` (o CHECK
`luxchange_request_closure` já trata todo estado diferente de `pending` como terminal). **Emendas da ADR-0037 na E0b**,
sem mudança de regra: §1 (linha 63), §8 item 1 (linha 211), §8 item 7 (linha 238) e uma linha na tabela de
compatibilidade do §8; §5 e §6 continuam válidos (o aceite usa o predicado e a trava da classe 1). **Condição de
revisão:** se a E1 encontrar invariante não demonstrável pela transição, volta à tabela da ADR e ao C1.

### Q2 — reserva `luxchange_request` da party solicitante (aprovada com ajustes)

Alteração mínima, delimitada por canal:

- `app.booking.party_id uuid REFERENCES app.party(id)` (nulo); `holding_id` deixa de ser `NOT NULL`;
  `CHECK (channel = 'luxchange_request' OR (holding_id IS NOT NULL AND party_id IS NULL))` — todo outro canal exatamente
  como hoje — e `CHECK (channel <> 'luxchange_request' OR (holding_id IS NULL AND stake_id IS NULL AND party_id IS NOT NULL))`.
- **Vínculo sem ambiguidade, sem coluna extra:** `booking.opened_by_operation` = `operation_id` da transição
  `accepted` — 1:1 pelos índices únicos `booking_one_per_operation` e o parcial da Q1. O ramo novo de `booking_open`
  exige operação `accept_request` pendente na transação, com a transição `accepted`; `party_id = requester_party_id`;
  Second Home, `checkin` e `checkout` iguais aos da Request; estado `confirmed`; K7 (não a K1).

Impacto levantado e tratamento (caminho `own_use` idêntico em todos):

| Objeto | Impacto | Tratamento |
|---|---|---|
| `booking_open` (W12) | só `own_use`, K1, holding da party que age | ramo `luxchange_request` antes do caminho atual |
| `booking_complete_constraint` / `assert_booking_complete` (W12) | regra do `own_use` em toda reserva | desvio por canal no início: `luxchange_request` → completude do aceite; demais canais sem mudança |
| `booking_state_transition_check` (W13/W20) | `cession` só `deposit_capacity`; `lock_own_use_titular` | ramos `accept_request`: reserva do detentor (representação dele, só noite futura — sem 14 dias, TECH-043) e do complemento (autorização pelo compromisso registrado, TECH-051; 14 dias no `resolved_at`); reserva `luxchange_request`: só `advance`; cancelamento, no-show e exceção recusados (P-11/W26) |
| `assert_booking_closure_complete` (W20) | conclusão da cessão só do depósito | ramo da cessão pelo aceite |
| `booking_state_guard` (W13) | imutabilidade com `holding_id` | `party_id` incluído na comparação (`IS DISTINCT FROM` trata nulo) |
| `lock_own_use_titular`, `assert_own_use_write` (W12/W13) | leem `holding_id` | inalterados: só alcançados no `own_use` |
| `date_occupancy_open` (W12) | aplicação só grava `own_use` | ramo `luxchange_request`: operação `accept_request`, custódia `luxchange_cession` aberta por ela (`request_destination:<request>`), reserva da operação |
| `date_occupancy_complement_guard` (W21) | só `own_use` | estendido ao canal `luxchange_request` (ADR-0037 §8, tabela de compatibilidade) |
| `booking_invariant_breaches` (W12) | filtra `own_use` | inalterado; invariantes da reserva da Request em `luxchange_invariant_breaches` |
| RLS `booking_holder_read` | holding nula → invisível ao detentor | inalterada; nova `booking_requester_read` (canal `luxchange_request`, delegação vigente para `party_id`); colunas concedidas inalteradas (`party_id` sem GRANT) |
| `luxchange_request_closure_reason` (W21) | ocupação com `confirmed_at ≥ sent_at` | inalterado (a reserva nova carimba `confirmed_at`) |
| `advance_booking_states` e store do ciclo (W13) | filtram `own_use` | o avanço inclui `luxchange_request` (REQ-096); demais consultas inalteradas |
| tipos gerados (`schema.ts`) e os 7 arquivos do slice `booking` que leem `holding_id` | `string` → `string \| null` | estreitamento nos mapeadores do `own_use` (erro tipado se nulo, inalcançável pelo CHECK) |

Testes: suítes W12/W13/W20/W21 sem mudança de expectativa; novos — CHECK por canal (`own_use` sem holding, Request com
holding ou Ação), party diferente do solicitante, reserva sem transição `accepted`, transições recusadas na reserva da
Request, leitura isolada do solicitante. Os canais `luxchange_direct`, `luxplus`, `rental_external` e `luxtory_use` não
mudam (cada wave os define).

### Q3 — `reserved_right` devolvido: adiamento condicional, critério preservado

- **Nada é removido:** o critério `[TECH-023]` da Wave 22 e a emenda D4 da W12 permanecem no plano de waves, com a
  dependência registrada.
- **Justificativa:** nenhum fluxo da W22 deixa `reserved_right` aberta sem ocupação. O aceite a fecha (→
  `luxchange_cession`); recusa, retirada, expiração, inelegibilidade e concorrentes não tocam custódia (conferido pela
  completude do encerramento). Na W13: cancelamento tempestivo → `spe_pool`; tardio e no-show → `forfeited_right`;
  invalidação → `spe_pool`; exceção resolvida mantém a ocupação ou cancela por esses caminhos.
- **Dependência:** P-11 — o TECH-051 não tem command de cancelamento por política para Request aceita, Direct, Luxplus
  e locação; exige nova versão do `03` (D6).
- **Etapa responsável:** o E0 da primeira wave que implementar cancelamento ou reversão por política sobre ocupação
  apoiada em `reserved_right` (cancelamento pós-aceite, sem wave até a P-11; locação externa, W25, candidata) reabre o
  critério e o teste da TECH-023.
- **Até lá:** `custody_reserved_right_reuse` continua recusando; a W22 acrescenta um teste de preservação dessa recusa.

### Q4 — concorrentes: motivos existentes, vínculo rastreável, economia separada (aprovada com condição)

- **Motivo:** `cancelled_pre_accept` com o motivo provado pelo banco. Quando a causa é o aceite, `capacity_unavailable`
  com evidência `custody` = custódia fechada pela operação do aceite (também no EC-20, em que a noite solicitada é
  complemento da Request aceita). Concorrente já inaceitável por causa anterior (vencida, Membership) fecha com essa
  causa, que é a correta.
- **Rastreio:** transição da concorrente → `evidence_id` (custódia) → `closed_by_operation` = `operation_id` da
  transição `accepted` → Request vencedora → custódia sucessora com `request_destination:<id>` ou
  `request_complement:<id>`. Teste dedicado prova a cadeia.
- **Semântica:** "a capacidade solicitada deixou de estar disponível" é exatamente o efeito; o REQ-096 não tem estado
  próprio para confirmação concorrente e o PD-006 a lista entre os encerramentos pré-aceite, com o mesmo efeito.
  Nenhum motivo novo. Se a E1 achar um caso em que o motivo existente distorça a causa, acrescenta
  `concurrent_confirmation` (CHECK pequeno) em vez de distorcer.
- **Economia separada:**

| | Request aceita | Concorrente encerrada |
|---|---|---|
| Garantia | `held → consumed`, inteira | liberada (`available`, ou `expired` se o lote venceu) |
| Compromissos | `consumed` (cessão) | `released` |
| Fee | apurado (`settlement` `luxchange_fee`) | revertido + estorno `pending` integral |
| Lotes | originados (detentor; solicitante se `P > 0`) | nenhum |
| Completude | `assert_luxchange_request_accept_complete` (nova) | `assert_luxchange_request_closing_complete` (atual) |

  No banco: consumo de Garantia só da Request com transição `accepted` desta operação; liberação pela operação do
  aceite só de Request encerrada antes do aceite por ela (nunca a aceita); apuração só do Fee da aceita; reversão pela
  operação do aceite só de Fee de Request encerrada por ela; Fee apurado nunca revertido e vice-versa (regras da W19).

### Q5 — experiência do detentor (aprovada)

Página de revisão (não modal) com os componentes atuais (`PageHeader`, `lx-app-*`, lista da prévia da Request, mês do
calendário, `PolicyTerms`); Créditos a receber, validade, datas e consequências; confirmação explícita; recusa com
confirmação e sem motivo; identidade do solicitante e complemento nunca exibidos, também depois do aceite (ADR-0037
§13). Luxtory2.0 só como referência de UX.

## Serialização `send_request` × `accept_request`

Fatos em que a prova se apoia:

1. Toda escrita de noite de Request toma a trava da noite **no próprio gatilho**, antes de ler a custódia —
   compartilhada na noite solicitada (`luxchange_request_night_write`), exclusiva na noite comprometida
   (`luxchange_complement_night_write`) —, além da trava do `LockSequence` no command.
2. O aceite toma **exclusivas** as noites solicitadas e do complemento da Request aceita (classe 5) e fecha as
   custódias delas na mesma transação.
3. O executor usa `read committed`: cada instrução enxerga o que foi commitado antes dela.

Intercalações:

| Caso | Resultado |
|---|---|
| (a) envio trava a noite antes do aceite | o aceite espera na classe 5 até o COMMIT ou rollback do envio; a revarredura seguinte enxerga a Request nova; como a classe 1 não pode ser tomada depois da 5, o aceite falha com `serialization_failure` (`40001`) e o executor refaz com a mesma chave — a nova tentativa trava a Request na classe 1 e a encerra no mesmo commit |
| (b) aceite trava a noite antes do envio | o envio espera; depois do COMMIT do aceite, o gatilho relê a custódia fechada e recusa (`ERR_CAPACITY_UNAVAILABLE`); nada do envio fica gravado |
| (c) envio sem a trava da aplicação (defeito ou forja) | a trava do gatilho reproduz (a) ou (b) |
| (d) envio commitado antes da varredura da classe 1 | entra no conjunto travado e é encerrado no mesmo commit |

A exclusão vem da trava da noite em toda escrita de Request — não da consulta final. A revarredura só detecta a janela
entre as classes 1 e 5, e a completude no COMMIT ("nenhuma Request pendente sobre noite cedida", lida pelo gatilho
adiado no estado commitado) é defesa em profundidade. Mudança na plataforma: reconhecer `40001` em
`isTransientDatabaseError` (uma constante + teste), reutilizando o retry da TECH-053, limitado por `maxAttempts`
(esgotado → `ERR_UNAVAILABLE`, nada gravado). Alternativa rejeitada: trava de classe 1 por noite no envio — mudaria a
ordem de travas da W21.

O mesmo raciocínio cobre aceite × aceite (CONC-4: as duas Requests entram na classe 1 das duas operações, em ordem de
id; a segunda encontra a sua encerrada → `ERR_CONCURRENT_CONFIRMATION`, ou `ERR_STATE_TRANSITION` se é a mesma Request já
aceita) e aceite × retirada/expiração (CONC-5: trava da Request; `resolved_at < expires_at` e predicado no instante da
transição).

## Aceite (`accept_request`) — uma transação (TECH-054, ADR-0037 §8)

1. Guard: delegação vigente do usuário para a party que age (escopo `party`; mesma função do solicitante).
2. K4 + K5 + K7 (+ K6 com complemento) → **classe 1**: a Request e as concorrentes — pendentes com noite solicitada ou
   de complemento ativo sobre as noites solicitadas ou do complemento da aceita —, em ordem de id → party que age =
   `holder_party_id` e sem representação do solicitante (BR-211); Request `pending`, `closure_reason` nulo.
3. **Classe 3** Memberships do detentor e do solicitante (`FOR SHARE`) → **4** Ações → **5** noites, exclusivas, ordem
   `(second_home_id, stay_date)` → revarredura (ver "Serialização") → reservas → **6** custódias.
4. Snapshot do aceite só com `resolved_at` (< `expires_at`) → transição `accepted` (primeiro efeito) → cessões
   (complemento: `request_complement:<request>`, compromissos `consumed`, reservas Co-Owner `cession` + `ceded`, sem
   Direito de Uso; capacidade solicitada: `request_destination:<request>`, reserva Co-Owner do detentor `cession`).
5. Lote do solicitante (`P`, `prl_id` dos compromissos × multiplicador do envio) e lote do detentor (Σ PRL das noites
   solicitadas × multiplicador do envio, por `luxchange_deposit_quantity_matches`); originação = `resolved_at` do aceite;
   validade = meses do snapshot do envio.
6. **Classe 7 única**: Garantia aceita (`held → consumed`, inteira), Garantias das concorrentes (liberação) e lote novo
   do solicitante (`available → consumed` de exatamente `C`; `E` fica disponível).
7. Reserva `luxchange_request` da party solicitante + ocupações sobre a custódia aberta pela operação (TECH-023).
8. **Classe 8 única**: apuração do Fee da Request aceita; reversão + estorno `pending` dos Fees das concorrentes.
9. Transições das concorrentes (Q4) → outbox → auditoria. Depois do COMMIT: `processRefund` das concorrentes em
   `after()`; `reconciliation` como rede de segurança.

**Completude no COMMIT** (`assert_luxchange_request_accept_complete`): uma transição `accepted` da operação; todos os
compromissos `consumed` por ela; cada noite (solicitada e do complemento) com a custódia registrada fechada e sucedida
por `luxchange_cession` com a referência certa; reservas Co-Owner cedidas por inteiro; uma reserva `luxchange_request`
com a party solicitante, o período da Request e uma ocupação por noite; lotes e quantidades do §8; consumo exato; uma
apuração; **nenhuma Request pendente sobre noite cedida**; nenhum movimento do Direito de Uso.

## Recusa (`reject_request`)

Autoridade do detentor, sem Membership e sem chave (ADR-0037 §10): `declined` (`expired` se vencida — o banco decide),
Garantia liberada, compromissos `released`, Fee revertido com estorno integral; nada em custódia, reserva ou Direito de
Uso (`reject_request` entra na lista da conferência de efeitos colaterais da completude do encerramento). Reaproveita
`closeLocked`.

## Alterações previstas

**Banco — migration única 73** (`luxchange_request_accept`): estados e pares `accepted`/`declined` e o índice parcial
da Q1; ramos em `transition_check`/`apply` e o desvio na completude; ramos `accept_request` (antes dos caminhos atuais)
em `credit_lot_originate`, `credit_entry_write`, `settlement_write`, `fee_charge_reversal_write`, fechamento/abertura de
custódia e liberação `ceded`; os objetos da tabela da Q2; `reject_request` como encerramento isento; view do detentor
com Créditos e validade (colunas acrescentadas); `luxchange_invariant_breaches()` com o aceite. `down` recusa com Request
aceita ou recusada, reserva `luxchange_request` ou a K7 presente; sem linhas, restaura a W21.

**Domínio e aplicação**: prévia do detentor (leitura dos termos do envio); handlers `accept_request` e `reject_request`;
variantes nas portas públicas de `credits` (consumo + liberações numa trava) e de `billing` (apuração + reversões numa
trava); portas de `booking`/`inventory` para a reserva e as cessões; guard `holder`; `40001` transitório na plataforma;
evento `luxchange.request_accepted` (novo) e `luxchange.request_closed` (recusa); notificações ao solicitante (aceita;
recusada) e ao detentor (aceite concluído, Créditos recebidos) — sem PII.

**API**: OpenAPI `acceptRequest` (`POST /v1/luxchange/requests/{requestId}/accept`, corpo `party_id`,
`expected_credits`) e `rejectRequest` (`…/reject`, corpo `party_id`), antes dos handlers; AsyncAPI do evento novo.
Recusas: `ERR_PERMISSION`, `ERR_NOT_FOUND`, `ERR_MEMBERSHIP_INELIGIBLE`, `ERR_CAPACITY_UNAVAILABLE`, `ERR_MIN_NOTICE`,
`ERR_STATE_TRANSITION`, `ERR_CONCURRENT_CONFIRMATION`, `ERR_REQUEST_TERMS_CHANGED`, `ERR_IDEMPOTENCY_CONFLICT`,
`ERR_VALIDATION`; chave fechada → 503 `ERR_UNAVAILABLE`, nada gravado. Aceite e recusa sem limitador próprio (como a
retirada: limitados pelas Requests existentes e idempotentes).

**Interface** (Design System, mobile-first): Recebidas acionáveis (Second Home, período "Entrada · Saída", noites, prazo
exato e restante, "Créditos que você receberá", estado); revisão do detentor com "Aceitar e ceder as datas" e "Recusar";
resultado com datas cedidas, Créditos recebidos e validade; detalhe do solicitante com "Aceita" (reserva confirmada,
Créditos consumidos, excedente disponível com validade, datas cedidas, "Taxa definitiva") ou "Recusada" (rótulos de
encerramento da W21); Carteira com os lotes novos; reserva Co-Owner cedida como "Cedida ao Luxchange" com link para a
solicitação. Nunca PRL em reais, "cota" ou "diárias"; Créditos nunca como dinheiro.

## Luxtory2.0 — só o que agrega

Aproveitar: lista de recebidas em cartões (destino, período, Créditos, estado), ações ≥ 44 px, estado vazio explicativo,
confirmação que descreve a consequência antes de agir, retorno claro de sucesso. **Não transplantar:** Edge Functions e
RPC; escolha da titularidade cedente no aceite (a W21 já vincula `holder_holding_id`); verificação de estado fora da
transação e cancelamento posterior e não atômico das concorrentes; nome do cedente na notificação; termos proibidos
("cota"); "créditos necessários" do solicitante mostrados ao detentor (o detentor vê os Créditos que recebe).

## Testes e preservação

Conexões reais e barreira determinística do harness existente; cada teste confere o estado econômico final (lotes,
entradas, apurações, reversões, estornos, custódias, ocupações) e as invariantes vazias.

| Cenário | Tag | Camada |
|---|---|---|
| Aceite × aceite: mesma Request (duas chaves) e duas Requests sobre a mesma capacidade → exatamente um | CONC-4, REQ-063, EC-8 | db, 2 conexões |
| Envio × aceite nas intercalações (a), (b) e (d) da "Serialização"; (c) por forja | REQ-063, TECH-024 | db, 2 conexões |
| Aceite × retirada; aceite × expiração no limite do prazo (relógio do banco) | CONC-5, TECH-044 | db |
| Aceite × exceção na reserva do complemento | CONC-18 | db |
| Aceite × compromisso do detentor sobre a capacidade solicitada | CONC-16, EC-20 | db |
| Aceite × suspensão de Membership (detentor e solicitante); × reserva, cancelamento ou depósito do detentor | REQ-064, EC-17 | db |
| Aceite × outro envio do solicitante com os mesmos lotes; Garantia × job de expiração de lotes | CONC-8, INV-6 | db |
| Replay; mesma chave com outro corpo; falha injetada no meio → nada gravado; retry (inclusive `40001`) | CONC-12, TECH-025 | db + aplicação |
| Forja pelo `luxtory_app`: consumo de Garantia alheia, lote ao solicitante sem compromissos consumidos, quantidade divergente (cedente pela fórmula, nunca pelo débito), escrita do aceite sem transição, apuração de outro Fee, aceite depois do prazo, reserva `luxchange_request` com outra party ou sem a custódia da operação | PD-006, TECH-073, INV-2 | db adversarial |
| Solicitante tentando aceitar; usuário que representa as duas parties; terceiro; detentor após transferência | REQ-061, BR-211 | aplicação + db |
| Três cenários econômicos (`G > 0`/`E = 0`; `G = 0`/`E > 0`; sem complemento) | PD-012, REQ-064 | db |
| Cadeia de rastreio da concorrente encerrada até a Request vencedora | REQ-063 | db |
| Q2: CHECK por canal, transições da reserva da Request, leitura isolada; Q3: `custody_reserved_right_reuse` segue recusando | TECH-023, TECH-052 | db |
| Estados de Request, compromisso, Crédito e Reserva | REQ-096 | db + aplicação |
| Recusa sem chaves; recusa × aceite; recusa × expiração | PD-006, REQ-061 | db |
| E2E 390 (toque): detentor Owner aceita Request com complemento; Carteiras dos dois. E2E 1440: detentor Co-Owner recusa; estorno em processamento. axe 0 e sem overflow 320–1920 | REQ-061, REQ-064 | e2e |

Preservação: suítes das W12, W13, W17, W19, W20 (inclusive `luxchange-deposit.db`) e W21 inalteradas e verdes;
invariantes vazias após todo teste `db`; `db:check` 73 (up → down → up). Durante a implementação, testes direcionados;
gates completos nos checkpoints.

## Etapas e checkpoints

| Etapa | Conteúdo | Checkpoint — GO / HOLD |
|---|---|---|
| E0 | esta entrega | **C0** — GO condicionado (2026-11-26); decisões incorporadas nesta revisão; PR draft só documental |
| — | revisão deste plano pelo fundador | **aprovação expressa** — GO: Q1–Q5 incorporadas com as condições; serialização envio × aceite demonstrada; nenhum canônico editado. HOLD: qualquer condição sem resposta |
| E0b | emendas da ADR-0037 (Q1 e as linhas citadas; Q2 e Q4 na tabela de compatibilidade), spec `luxchange` §14, STRIDE `luxchange` (aceite e recusa) | revisão junto do C1 |
| E1 | migration 73 + testes de banco (vínculos, forja, concorrência, tempo, preservação) + `db:check` | **C1** — GO: todos os cenários db verdes, invariantes vazias, preservação intacta, nenhuma linha de ativação. HOLD: deadlock não explicado, duplicidade, estado parcial, regressão ou invariante que exija a tabela da Q1 |
| E2 | domínio, handlers, guard, portas, `40001`, eventos, notificações, auditoria | **C2** — GO: replay, retry e guard verdes, cobertura ≥ 80% em `domain`/`application`, sem PII em logs. HOLD: divergência domínio × banco |
| E3 | OpenAPI/AsyncAPI → rotas → telas; E2E 390/1440; capturas 320/390/1440 | **C3** (revisão renderizada) — GO: axe 0, sem overflow, textos conferidos com a comunicação. HOLD: texto que prometa pagamento concluído ou revele identidade |
| E4 | `verify`, `test:e2e`, `trace --expect REQ-061,REQ-063,REQ-064,REQ-096,PD-006,PD-012`, CHANGELOG, runbook, NOTES; PR; CI | **C4** — GO/HOLD do fundador; merge e deploy só com autorização expressa |

## Critérios de aceite da W22

- `[REQ-061]` só o detentor aceita ou recusa; o solicitante nunca; sem aceite tácito.
- `[REQ-063][EC-8][CONC-4]` vale o primeiro aceite válido; as concorrentes se encerram no mesmo commit, sem penalidade
  (Garantia liberada, compromissos liberados, Fee revertido com estorno integral), com rastreio até a Request vencedora;
  nenhum envio concorrente deixa Request pendente sobre noite cedida.
- `[REQ-064][PD-012][TECH-073]` revalidação integral sem recalcular valores; cessões, reserva da party solicitante, dois
  lotes, consumo de `G` e de `C`, `E` disponível, todos conferidos pelo banco; cedente pela fórmula do PRL do envio.
- `[PD-006][CONC-5][TECH-044]` aceite contra retirada ou expiração: nunca os dois; Request vencida nunca é aceita.
- `[CONC-18]` aceite × exceção no complemento: exatamente um vence, estado íntegro.
- `[REQ-096]` estados de Request, complemento, Crédito e Reserva conferem com o `02`.
- `[REQ-060]` no Co-Owner, o dia cedido (complemento ou capacidade solicitada) segue consumido do Direito de Uso.
- `[ADR-0037 §10]` recusa e encerramento das concorrentes concluem com as chaves fechadas; aceite exige K4 + K5 + K7
  (+ K6).
- `[TECH-023]` `reserved_right` devolvido: adiado com dependência da P-11 (Q3); a recusa atual segue provada.

## Riscos

| Risco | Mitigação |
|---|---|
| Transação mais extensa do sistema (muitos ramos) | termos vinculantes do envio; completude no COMMIT; invariantes; testes adversariais; um checkpoint por etapa |
| Ordem de travas com concorrentes (classes 7 e 8) | uma trava única por classe (padrão do reenvio da W21); `LockSequence` em tempo de execução |
| Envio concorrente durante o aceite | trava da noite em todo gatilho de Request; revarredura + `40001` + retry; completude no COMMIT |
| Retry esgotado sob envios repetidos nas mesmas noites | limite do executor → `ERR_UNAVAILABLE`, nada gravado; o detentor tenta de novo |
| Mudança em `app.booking` (Q2) | CHECK por canal; caminho `own_use` intacto; tipos gerados; suítes W12/W13 |
| Regressão das W17/W19/W20/W21 | ramos antes dos caminhos atuais; provas de preservação; `db:check` |
| Estorno das concorrentes depende do PSP (P-2) | `after()` + `reconciliation`; tela nunca diz "concluída" antes do PSP |
| Vazamento ao detentor | colunas restritas da view; RLS da reserva por canal; testes |

## Fora da W22 e Go-to-Market

Fora: Direct (W23), Luxplus (W24), cancelamento pós-aceite, no-show e exceção da reserva `luxchange_request` (⛔ P-11/W26),
reutilização de `reserved_right` devolvido (Q3), PSP real, ativação, parâmetros e políticas reais. Antes de qualquer
operação real (decisões do fundador, separadas da implementação): backup adequado (D2), PSP (P-2), parâmetros e política
`luxchange_request` publicados, variáveis do limitador, migration de ativação K4–K7, latência da expiração e decisão
sobre operar sem cancelamento pós-aceite enquanto a P-11 estiver aberta.
