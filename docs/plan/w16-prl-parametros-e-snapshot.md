# W16 — PRL, parâmetros econômicos e snapshot: plano

IDs (dona): REQ-013, REQ-052. TECH: TECH-030, TECH-031, TECH-033 (com TECH-001, TECH-051, TECH-052, TECH-053,
TECH-056). Complemento: REQ-095 (PRL e parâmetros econômicos com autoridade, histórico e vigência). Base: main
`108d6f5` (W15), canônicos `01` v10.7 · `02` v4.6 · `03` v3.18. Decisão:
[ADR-0032](../adr/0032-prl-parametros-economicos-e-contrato-de-snapshot.md). Specs: [`pricing.md`](../specs/pricing.md)
e [`admin.md` §14](../specs/admin.md). STRIDE: [`pricing.md`](../security/threats/pricing.md).

## Decisões aprovadas (fundador + auditoria independente, 2026-11-20)

- **D1** — Seis chaves econômicas globais em `app.parameter`: `credit_multiplier`, `credit_validity_months`,
  `luxchange_fee_rate`, `luxchange_fee_minimum`, `request_deadline_hours` e `membership_base_annual_price` (BR-141,
  TECH-030). O registro do valor-base do Membership não autoriza cobrança, renovação, faturamento, plano ou integração
  financeira; D1–D4 da W15 preservadas. Adiados: Taxa de Administração, descontos Luxplus, taxas e comissões de
  locação. Análise da sexta chave: nenhum impedimento — o `01` §36 lista "preços de Membership" entre os parâmetros, a
  TECH-030 inclui "Membership", a forma (dinheiro por ano por titular) está na BR-141 e a chave não toca
  `app.membership`.
- **D2** — Rotas `POST /v1/admin/prl` e `POST /v1/admin/prl/changes` como adaptadores mínimos sobre os handlers das
  Server Actions (TECH-056, OpenAPI, `Idempotency-Key`, autorização, testes de contrato). `set_parameter` continua só por
  Server Action (ADR-0030, D5).
- **D3** — `EconomicTerms` definido agora (ids das versões, valores, unidade/moeda, instante do banco); persistência na
  primeira wave que produzir o efeito econômico, na mesma transação. REQ-052 com cobertura parcial explícita.
- **D4** — Sem capability nova; K1/K2/K3 fechadas. Nenhum PRL ou parâmetro econômico real em Production sem
  autorização operacional específica do fundador; valores iniciais só por procedimento autorizado
  ([runbook](../how-to/operacao.md#preparar-a-w16-em-produção-prl-e-parâmetros-econômicos)).
- **Testes** — usam valores deliberadamente diferentes dos valores iniciais canônicos, para detectar padrão embutido.

## Escopo

- **M1 `admin_parameter_economic_keys`**: escopo global (`second_home_id NULL`), seis chaves, coluna `currency`, CHECK
  de escopo, moeda e formato por chave; `parameter_insert` e `parameter_at` seguros para NULL; unicidade
  `NULLS NOT DISTINCT`; `parameter_version` com `currency` ao fim; rollback que recusa com linha econômica e restaura a
  W14 idêntica.
- **M2 `pricing_prl`**: `app.prl_publication` + `app.prl`, gatilhos de procedência, autoridade, vigência e regra
  inicial/alteração, gatilho adiado de completude, `app.prl_version` (com `effective_to` derivado), `app.prl_at`,
  `app.prl_period_in_force` (trava compartilhada + instante do banco), RLS e privilégios mínimos, rollback protegido.
- **E3**: slice `pricing` (valores exatos, calculadoras, `publish_initial_prl`, `change_published_prl`, consulta de
  período, resolvedor `EconomicTerms`), extensão do `set_parameter`, trava `prl`, erros. **E4**: telas `/admin/prl`,
  `/admin/prl/[id]`, `/admin/parametros`, as duas rotas, i18n, E2E, CHANGELOG.

## Cobertura (parcial explícita)

- **REQ-052**: a W16 prova PRL por data e soma por período, prospectividade, resolução histórica e recusa de noite sem
  PRL (`ERR_PRL_MISSING`). "O PRL utilizado permanece funcionalmente associado à operação" só se completa quando a
  primeira wave consumidora persistir o snapshot: W20 (Créditos do depósito) e W21 (Request: PD-007, EC-9). Validade
  dos Créditos (W17) e Fee (W19) seguem a mesma obrigação.
- **REQ-095**: PRL e parâmetros econômicos com autoridade, histórico e vigência; Taxa de Administração, descontos e
  taxas de locação adiados (D1).
- **TECH-031**: contrato; persistência com o primeiro efeito econômico.

## Etapas e checkpoints

| Etapa | Conteúdo | Parada |
|---|---|---|
| E0 | Worktree `/home/rjr-idb/luxtory-w16`, branch `feat/w16-prl-parametros-snapshot` a partir de `108d6f5` | — |
| E1 | Plano, ADR-0032, specs `pricing` e `admin` §14, OpenAPI (2 rotas), STRIDE, runbook, emenda do roadmap | — |
| E2 | M1 + M2, testes de PostgreSQL, preservação W14/W15, tipos do Kysely; `db:check` 66 | **C1** (PR draft + CI) |
| E3 | Domínio e aplicação do `pricing`, `set_parameter`, travas, erros; unit, db e contrato | GO após C1 |
| E4 | Telas, rotas, i18n, E2E, CHANGELOG | — |
| E5 | `verify`, `test:e2e`, `trace`, capturas | **C2** (GO do merge) |

## Critérios de aceite (testes com ID)

- `[REQ-013]` Admin e Super Admin publicam PRL inicial com base registrada; publicação inicial sobre data já publicada
  é recusada; alteração com papel Admin, Admin revogada ou papel diferente da atribuição é recusada pelo banco; o Super
  Admin altera; só chaves autorizadas e valores tipados (BR-360, BR-361).
- `[REQ-052]` PRL por data e soma por período, atravessando exercício e com 29/02; resolução histórica correta antes,
  durante e depois de versão futura; início retroativo ou não posterior ao último recusado; noite sem PRL devolvida
  explicitamente (`ERR_PRL_MISSING` na E3).
- `[TECH-001]` chave econômica sem versão → nenhuma linha (`ERR_PARAMETER_MISSING` na E3); nenhum padrão.
- `[TECH-030]` publicação e linhas atômicas; procedência e autor da operação; `effective_to` derivado; sem
  sobreposição, inclusive no escopo global.
- `[TECH-033]` dinheiro em unidade mínima + `BRL`, sem zero ou negativo; E3: centavos → reais antes do multiplicador
  (erro de fator 100 detectado), Créditos exatos sem arredondamento, Fee com HALF_UP uma vez no valor final, JSON sem
  número em ponto flutuante para dinheiro ou Créditos.
- `[TECH-052]` UPDATE/DELETE/TRUNCATE recusados; `luxtory_app` sem UPDATE/DELETE; `authenticated`/`anon` sem leitura do
  PRL; Titular sem parâmetros globais.
- `[TECH-053]` publicações concorrentes da mesma data → exatamente uma; leitura em vigor espera a publicação e a vê;
  revogação concorrente serializada.
- `[TECH-110]` rollback com linhas recusado; `db:check` 66; a W16 só altera os objetos da W14 listados e o down
  restaura W15 idêntica; `guest_rules`, declaração de convidados e Membership sem regressão.
- E3/E4: contrato das 2 rotas; E2E 390 com toque e 1440, axe 0, sem overflow de 320 a 1920.

## Goal command (E5)

`npm run verify && npm run test:e2e` com saída 0 e `npm run trace -- --expect REQ-013,REQ-052`.
