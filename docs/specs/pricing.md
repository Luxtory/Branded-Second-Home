# Spec: pricing

- **Status**: W16 — E1/E2 aprovadas no C1; E3/E4 em PR draft (C2)
- **Owner**: módulo `pricing` (TECH-011)
- **IDs**: REQ-013, REQ-052 (dona, W16); TECH-030, TECH-031, TECH-033; complementos REQ-095, TECH-001, TECH-051,
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

- `/admin/prl` (Admin e Super Admin): cobertura por Second Home — noites seladas, com PRL vigente e com alguma versão.
- `/admin/prl/[id]`, com modos separados (`?modo=consultar|inicial|alteracao&mes=AAAA-MM`):
  - **Consultar:** calendário do mês (`.lx-calendar` do DS, renderizado no servidor) com navegação entre os meses e
    exercícios selados; cada noite diz no nome acessível a categoria canônica (Alta pelo traço do DS, só informativa),
    a situação (sem PRL, vigente, só agendada) e leva ao detalhe da noite: valor vigente, versões agendadas e histórico
    imutável (valor, tipo, vigência, autoridade, base, registro), no fuso da Second Home.
  - **Publicar PRL inicial** (Admin ou Super Admin) e **Alterar PRL publicado** (só Super Admin; para o Admin o modo
    não existe, nem pela URL): calendário de seleção com alternância por noite (`aria-pressed`), mês inteiro ou só Alta
    ou Média/Baixa do mês, valor comum aplicado às noites e valor próprio por noite, até 366 noites. Só noites
    elegíveis ao tipo aceitam seleção (a inicial não alcança noite publicada; a alteração não alcança noite sem PRL):
    um lote nunca mistura as duas operações. A categoria não é editável.
  - **Revisão no servidor** antes da confirmação (`reviewPrlPublication`, `pricing/application/prl-review.ts`): tipo,
    vigência, noites com categoria, vigente × novo na alteração, PRL somado e prévia de Créditos com o multiplicador
    vigente (`creditsForPrl`); sem multiplicador, "não configurado". Problemas (noite publicada, sem PRL, não selada,
    repetida, valor inválido, início retroativo ou não posterior) voltam por noite. A confirmação refaz a revisão e só
    então executa o command; o cliente não calcula nada econômico.
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
