# Spec: pricing

- **Status**: W16 — E1/E2 aprovadas no C1; E3/E4 em PR draft (C2) → ✅ concluída (#101, squash `f1fd297`, 2026-11-22; Production); W17 persiste o snapshot (§13); W18 políticas comerciais (§5 "Políticas comerciais") — 🔄 PR draft
- **Owner**: módulo `pricing` (TECH-011)
- **IDs**: REQ-013, REQ-052 (dona, W16); REQ-082, REQ-104, PD-009 (dona, W18; complementos PD-010, TECH-032); TECH-030, TECH-031, TECH-033; complementos REQ-095, TECH-001, TECH-051,
  TECH-052, TECH-053, TECH-056
- **Plano**: [`w16-prl-parametros-e-snapshot.md`](../plan/w16-prl-parametros-e-snapshot.md) · **Decisão**:
  [ADR-0032](../adr/0032-prl-parametros-economicos-e-contrato-de-snapshot.md) · **STRIDE**:
  [`threats/pricing.md`](../security/threats/pricing.md)

## 1. Goal

PRL versionado por Second Home e data, publicado e alterado só pela autoridade da BR-181, com efeitos prospectivos
(BR-182) e ausência explícita (TECH-001); contrato exato de valores (TECH-033) e de snapshot (TECH-031) para os
mecanismos do Luxtory Club.

## 2. Non-goals

- Nenhum mecanismo que use PRL (depósito, Request, Direct, Luxplus, locação), pagamento, Fee cobrado, Crédito
  originado ou política comercial — W17–W25.
- Nenhuma tabela de snapshot sem consumidor (ADR-0032 §8); nenhum preço por noite exibido ao Titular (REQ-100).
- Nenhum rascunho de PRL, retirada de PRL ou término explícito (inexistentes no `01/02`).

## 3. Users / actors

Admin e Super Admin (MFA, TECH-050). O Titular não lê PRL na W16.

## 4. User stories

- Como Admin ou Super Admin, publico o PRL inicial de noites seladas de uma Second Home, com base registrada.
- Como Super Admin, altero o PRL publicado de noites, com efeito a partir de um instante presente ou futuro.
- Como Admin ou Super Admin, vejo por noite o PRL em vigor, a versão agendada, as lacunas e o histórico.

## 5. Contracts

### Modelo (M2 `pricing_prl`, ADR-0032 §1–§5)

- `app.prl_publication`: `id`, `second_home_id`, `kind` (`initial` | `change`), `effective_from`, `authority`
  (`admin` | `super_admin`), `authorization_ref` (base), `created_at`, `created_by`, `operation_id` (único).
- `app.prl`: `id`, `publication_id`, `second_home_id`, `stay_date`, `amount_minor` (`bigint`, unidade mínima, ≥ 1,
  limite técnico de 15 dígitos), `currency` (`BRL`), `effective_from` (o da publicação).
- Uma versão = linha de `app.prl` + metadados da publicação. `app.prl_version` expõe ambos e o `effective_to`
  derivado (início da versão seguinte da mesma noite; `NULL` = sem sucessora). Intervalos `[effective_from,
  effective_to)` disjuntos por construção.
- Regras no banco: operação `pending` da transação e command do tipo; Second Home, papel e autor da operação;
  atribuição de staff ativa do papel exercido (`initial`: `admin` ou `super_admin`; `change`: `super_admin`); início
  carimbado pelo banco, nunca retroativo e posterior ao último início da noite; `initial` só em noite sem PRL, `change`
  só em noite publicada; noite selada (FK `app.second_home_date`); publicação com 1 a 366 noites, verificada no commit;
  nada é alterado ou apagado.
- Leitura: `app.prl_at(second_home_id, stay_date, at)` (histórica, sem trava); `app.prl_period_in_force(second_home_id,
  checkin, checkout)` (trava compartilhada `app.prl:<id>`, instante do banco, uma linha por noite de `[checkin,
  checkout)`, `prl_id` nulo = noite sem PRL; até 366 noites).
- Privilégios: `luxtory_app` lê e insere; `authenticated` e `anon` não leem.

### Commands (TECH-051, E3)

| Command | Autoridade | Entrada |
|---|---|---|
| `publish_initial_prl` | Admin ou Super Admin + base | `second_home_id`, `nights[{stay_date, amount_minor}]` (1–366, distintas), `effective_from` opcional, `basis` |
| `change_published_prl` | Super Admin + base | mesma forma |

- Recusas: entrada → `ERR_VALIDATION`; papel → `ERR_PERMISSION`; Second Home inexistente → `ERR_NOT_FOUND`; noite não
  selada, publicada (no inicial), não publicada (na alteração), início retroativo ou não posterior →
  `ERR_STATE_TRANSITION`.
- Auditoria: um registro por publicação (tipo, início, quantidade de noites, primeira e última noite, base; na
  alteração, a quantidade de noites substituídas — as versões anteriores seguem no histórico imutável de
  `app.prl_version`). Leitura do histórico pelo Admin registrada (TECH-092).
- Papel exercido (ADR-0008): a alteração exerce `super_admin`; a publicação inicial exerce o primeiro papel ativo de
  `admin`, `super_admin` (lista em ordem de preferência na entrada única do Admin), registrado na operação.
- Sem evento nem notificação (REQ-097 não os lista).

### HTTP API (TECH-056, D2)

`POST /v1/admin/prl` (inicial) e `POST /v1/admin/prl/changes` (alteração), `Idempotency-Key` obrigatório, sessão de
staff com MFA, mesmos handlers das Server Actions — [`openapi.yaml`](../api/openapi.yaml). Dinheiro em JSON como
string em unidade mínima (`amount_minor`) + `currency`.

### Telas (E4)

- `/admin/prl` (Admin e Super Admin): por Second Home, noites no calendário (o calendário selado do exercício, gerado
  depois da formalização), período, noites com preço vigente e com preço definido (vigente ou futuro).
- `/admin/prl/[id]`, com modos separados (`?modo=consultar|inicial|alteracao&mes=AAAA-MM[&noite=AAAA-MM-DD]`). Todos
  usam a mesma composição (DS `lx-pricing` + variante `lx-calendar--prl`, ADR-0009): o **calendário do mês é o
  centro** — células proporcionais à largura, sete colunas desde 320 px — e um **painel contextual** fica ao lado
  quando há largura útil (≥ 52rem; no celular, logo abaixo da legenda). Estados de cada noite, nenhum só por cor e
  todos no nome acessível: **temporada** (traço = Alta/Super Alta; sem traço = Média/Baixa — a categoria canônica do
  `01` §9, nunca editável, por noite, inclusive na janela de Carnaval), **preço** (sem preço · vigente em Warm Sand, com
  o valor na célula quando ela comporta · versão futura no losango), **seleção** (Moroccan Blue + ✓) ou **em detalhe**
  (contorno). Preço existente não significa disponibilidade, e noite sem preço continua no calendário.
  **Temporadas (C2, decisão do fundador de 2026-11-21; ADR-0032 §11):** a tela divide o grupo canônico Alta/Super Alta
  só para leitura — **Super Alta** (roxo, faixa mais grossa) = as 10 noites da janela de Carnaval do PD-003, **Alta**
  (dourado) = janeiro, julho e dezembro, **Média/Baixa** (verde, faixa mais fina) = demais noites, 29/02 incluído
  (`pricing/presentation/prl-seasons.ts`, derivada de `carnivalDates` do calendário canônico). O grupo canônico (`alta`
  /`media`) continua governando Direito de Uso e os limites 103/262 e aparece no detalhe da noite como "Grupo de
  Direito de Uso". A legenda tem dois grupos independentes — temporada (faixa) e preço/seleção (sem preço · preço
  vigente com o valor, ou um ponto quando a célula não comporta · versão futura num losango próprio do módulo ·
  selecionada ou em detalhe) — e nenhuma cor serve aos dois; a seleção preserva a faixa da temporada.
  - **Consultar:** a noite em detalhe ao lado (temporada, situação do preço, preço vigente e desde quando, versões
    futuras, histórico imutável sob demanda — valor, tipo, situação, vigência, autoridade, base, registro — no fuso da
    Second Home) e o resumo do mês em dois grupos: **situação agora**, com linhas mutuamente exclusivas que somam as
    noites do mês (com preço vigente · sem preço vigente, com versão futura — só quando houver · sem preço definido), e
    **alterações programadas** (noites com versão futura), contadas à parte porque uma noite pode ter preço vigente e
    versão futura ao mesmo tempo. Trocar de noite é
    imediato (cliente, dados do mês vindos do servidor); trocar de mês — pelo link ou pelo teclado — recarrega no
    servidor (uma leitura administrativa por mês) e remonta a consulta, com a noite e o foco vindos da URL do mês
    novo. Depois de uma confirmação, a consulta abre na primeira noite publicada.
  - **Ir direto a um mês** (consulta e publicação): seletores nativos de mês e exercício, além das setas, com opções
    só dos meses selados da Second Home (o mês lista os meses do exercício em tela; trocar de exercício mantém o mês do
    ano quando selado, senão vai ao mais próximo). Na publicação, navegar nunca mexe na seleção, no preço comum nem
    nos preços próprios; na consulta, recarrega o mês pedido e devolve o foco ao seletor.
  - **Definir preços iniciais** (Admin ou Super Admin) e **Alterar preços** (só Super Admin; para o Admin o modo não
    existe, nem pela URL): seleção por noite (`aria-pressed`; tocar de novo desmarca), do mês ("Mês inteiro", só Super
    Alta, só Alta, só Média/Baixa — sempre aditiva: nunca desmarca nem muda preço próprio), acumulada entre meses, até
    366 noites — a seleção em lote diz quantas noites entraram, que todas já estavam selecionadas ou, no limite, que as
    demais ficaram de fora. **Noites selecionadas** junto ao calendário (paridade com o `SeasonCalendar` do Luxtory2.0):
    os meses com noites selecionadas, cada um atalho para o mês com quantas têm preço próprio, e "Limpar seleção"
    sempre à vista; sob demanda, as noites em ordem cronológica, agrupadas por mês, cada uma removível. Essa área diz
    quais noites compõem o lote; o painel, quanto vale cada uma. O painel mostra a contagem e o **preço comum**, que vale para toda noite selecionada sem preço
    próprio (mudar o comum muda essas noites, e só elas). **Preço próprio** é o que o Admin digita no campo da noite:
    o comum nunca o sobrescreve, e ele só volta ao comum por ação explícita — "Usar o preço comum" na noite, ou "Substituir N
    preços próprios pelo comum", que diz quantos substituiu. Havendo preço próprio, o painel diz quantas noites seguem o
    comum e quantas têm preço próprio; do **mês em tela**, lista só as noites de preço próprio (preço editável, temporada,
    preço vigente na alteração) e abre, sob demanda, a lista completa noite a noite — aberta ou fechada, a escolha vale
    para os outros meses; remover uma noite também fica na linha dela. Só
    noites elegíveis ao modo aceitam seleção (a inicial não alcança noite com preço; a alteração não alcança noite sem
    preço): uma publicação nunca mistura as duas operações. Nenhum preço único por temporada é imposto. A seleção e os
    preços sobrevivem à revisão e à volta para editar.
  - **Revisão no servidor** antes da confirmação (`reviewPrlPublication`, `pricing/application/prl-review.ts`), do
    mais importante ao detalhe: a operação (preços iniciais ou alteração), o resumo "N noites · PRL total" (na
    alteração, antes da nova vigência → novo), vigência, autoridade exercida, base registrada, noites com temporada e
    prévia de Créditos com o multiplicador vigente (`creditsForPrl`), sempre informativa; sem multiplicador,
    "indisponível". Na alteração, cada noite mostra a
    sequência de preços: vigente agora (ou "só versão agendada"), versões agendadas e o **preço imediatamente anterior
    à nova vigência → novo**. Como uma versão nova só começa depois da última versão da noite (D3), o preço substituído
    é o da última versão — agendada, se houver —, nunca necessariamente o vigente agora. Problemas (noite publicada, sem
    PRL, não selada, repetida, valor inválido, início retroativo ou não posterior) voltam por noite. A confirmação refaz
    a revisão (uma publicação concorrente depois da revisão recusa o lote) e só então executa o command; o cliente não
    calcula nada econômico.
  - Mês de referência no fuso IANA da Second Home (TECH-040), nunca UTC; a navegação (botões, teclado e exercícios)
    percorre só os meses do calendário da Second Home, pulando lacunas.
  - Semântica da base: `prl_publication.authorization_ref` grava a **base registrada** informada (justificativa
    administrativa, TECH-002/TECH-030, como em `app.parameter` na W14); a autorização efetiva do operador é a atribuição
    `staff_role:<id>` em `operation.authorization_ref`, ligada pela `operation_id`, com `authority` e `created_by` na
    publicação.
  - O texto deixa claro que publicar PRL não cobra ninguém nem ativa mecanismos do Club. Nenhuma superfície ao Titular
    (REQ-100).

### Valores exatos (TECH-033, E3)

- Dinheiro: `bigint` em unidade mínima + moeda; em TypeScript, `bigint`/string, nunca `number`. Entrada da tela em reais
  com no máximo 2 casas; mais casas → recusa, nunca arredondamento.
- PRL do período = soma exata das noites (unidade mínima).
- Créditos do PRL = (PRL do período em unidade mínima ÷ 10^expoente da moeda) × multiplicador vigente — conversão de
  centavos para reais antes do multiplicador; resultado decimal exato, sem arredondamento (`numeric`).
- Fee = maior entre percentual vigente × PRL do período e mínimo vigente (`01` §24); HALF_UP uma única vez, na
  unidade mínima do valor final.
- `decimal.js` 10.6.0 (ADR-0004) em instância isolada, com precisão dimensionada pelos limites técnicos.

### Snapshot — contrato `EconomicTerms` (TECH-031, ADR-0032 §8)

```
EconomicTerms {
  resolvedAt: instante do banco depois das travas
  secondHomeId
  nights: [{ stayDate, prlId, amountMinor (string), currency }]   // todas as noites do período; falta → ERR_PRL_MISSING
  prlTotal: { amountMinor (string), currency }
  parameters: { [key]: { parameterId, value (string canônica), unit: 'decimal' | 'months' | 'hours' | currency } }
                                                                   // ausente → ERR_PARAMETER_MISSING
}
```

- Resolvido dentro da transação do command (`resolveEconomicTerms`, `pricing/application/economic-terms.ts`): travas
  compartilhadas dos parâmetros globais em ordem crescente de chave, depois a do PRL (tomada por
  `app.prl_period_in_force`, que lê o instante do banco depois dela); sem período, `clock_timestamp()` depois das
  travas. Todos os parâmetros são consultados nesse mesmo instante. As travas seguem até o fim da transação. Os ids
  apontam versões imutáveis.
- **Obrigação futura (rastreável):** a primeira wave que produzir o efeito econômico persiste o snapshot com FK para
  as versões usadas, na mesma transação do efeito: W17 (validade do lote), W19 (Fee), W20 (Créditos do depósito), W21
  (Request — PD-007, EC-9), W23 (Luxplus). Até lá o REQ-052 não é declarado integralmente coberto.

### Políticas comerciais (W18; TECH-032, PD-009, REQ-082, REQ-104; ADR-0034)

Plano [`w18-politicas-comerciais.md`](../plan/w18-politicas-comerciais.md). A W18 não cria operação: entrega versões,
validação, avaliação e a resolução da versão aceita para as W21–W25.

- **Modelo:** `app.commercial_policy(id, mechanism, schema_version = 1, config jsonb, effective_from, effective_to,
  authority = 'admin', authorization_ref, created_at, created_by, operation_id)`; `mechanism ∈ {luxchange_request,
  luxchange_direct, luxplus, rental_external}`; CHECK `app.commercial_policy_config_valid(mechanism, config)`; versões
  como `app.parameter` (append-only, sem retroatividade nem sobreposição, trava `app.commercial_policy:<mecanismo>`);
  `app.commercial_policy_at(mechanism, at)`. Leitura só do `luxtory_app`.
- **Esquema v1** (ADR-0034 §1): `cancellation` (1–5 faixas `{min_notice_hours, effects}`, decrescentes, última = 0),
  `no_show` e `exception` — todos obrigatórios. Eixos exatos por mecanismo: Request/Direct `capacity, credits, fee`;
  Luxplus `capacity, money`; locação `capacity, money, remuneration`. `capacity = "return_to_origin"` sempre (BR-163);
  demais eixos são frações canônicas em [0, 1]; locação com `money + remuneration ≤ 1`.
- **Command `publish_policy`** (TECH-051, Admin + base registrada, AAL2): entrada `{ mechanism, config,
  effective_from | null, effective_to | null, basis }`; recusas: forma ou regra → `ERR_VALIDATION` (REQ-104); vigência
  incompatível → `ERR_STATE_TRANSITION`; sem papel → `ERR_PERMISSION`. Auditoria com mecanismo, vigência, base e o
  `config` (não pessoal).
- **HTTP:** `POST /v1/admin/policies` (OpenAPI `publishPolicy`, 201) sobre o mesmo handler da Server Action.
- **Avaliação** (`evaluatePolicy`, domínio): `(versão, snapshot, evento)` → efeitos normalizados por eixo
  (devolvido/mantido); evento `cancellation` (instante → faixa pela antecedência em horas inteiras até o check-in),
  `no_show`, `exception` (PD-010: só os efeitos declarados). Dinheiro `HALF_UP` uma vez; Créditos exatos.
- **Resolução** (`EconomicTerms.policy`): `resolveEconomicTerms({ policy: { mechanism, acceptedPolicyId } })` trava em
  compartilhado e devolve `{ policyId, mechanism, config, effectiveFrom }` vigente no `resolvedAt`; ausente ou diferente
  da aceita → `ERR_POLICY_MISSING` (REQ-098: "política obrigatória ausente").
- **Telas:** `/admin/politicas` — por mecanismo, versão vigente, agendadas e histórico; publicar com revisão (resumo,
  consequências, prévia do componente de aceite) e confirmação. `PolicyTerms` (texto derivado do esquema, sem texto
  livre) e `PolicyAcceptance` (checkbox obrigatório com a versão) em `pricing/presentation`, para W21–W25.
- **Obrigações futuras:** W21 grava o vínculo `economic_snapshot` → versão aceita com FK e gatilho de vigência; W19–W25
  aplicam os efeitos pelos ledgers (Créditos, Fee, pagamento, settlement, custódia); cancelamento ⛔ P-11.

## 6. Acceptance criteria

Ver [plano §Critérios](../plan/w16-prl-parametros-e-snapshot.md#critérios-de-aceite-testes-com-id).

## 7. Edge cases

Período atravessando exercícios (EC-1) · 29/02 com PRL como qualquer noite · versão futura agendada · publicação
concorrente · leitura durante publicação · atribuição revogada durante a operação · noite não selada · alteração de PRL
durante Request pendente (EC-9, W21).

## 8. Security considerations

MFA e deny por padrão; autoridade revalidada no banco; histórico append-only; PRL só pelo servidor; limite de 366
noites por publicação e por leitura. STRIDE em [`threats/pricing.md`](../security/threats/pricing.md).

## 9. Observability

Logs estruturados do executor com `correlation_id`; auditoria por publicação; sem PII.

## 10. Rollout plan

Nada é ativado. PRL e parâmetros reais em Production só com autorização operacional do fundador
([runbook](../how-to/operacao.md#preparar-a-w16-em-produção-prl-e-parâmetros-econômicos)).

## 11. Open questions

P-5 (PRL por data, valores e planos) é pré-requisito de operação, não de desenvolvimento.

## 12. References

`01` §19, §20, §24, §36 (BR-141, BR-180–182, BR-191, BR-232, BR-352, BR-360, BR-361) · `02` REQ-013, REQ-052, REQ-095,
REQ-100, PD-005, PD-007 · `03` TECH-001, TECH-030–033, TECH-051–056, TECH-092.
