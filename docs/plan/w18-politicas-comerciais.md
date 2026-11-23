# W18 — Políticas comerciais: plano

IDs (dona): REQ-082, REQ-104, PD-009. Complementos: PD-010, BR-163, BR-360, BR-361, INV-2, INV-6. TECH: TECH-001,
TECH-030, TECH-031, TECH-032, TECH-033, TECH-051, TECH-052, TECH-053, TECH-054, TECH-056. Base: main `00f0a5e` (W17),
canônicos `01` v10.7 · `02` v4.6 · `03` v3.18. Decisão:
[ADR-0034](../adr/0034-politicas-comerciais-esquema-fechado-e-avaliacao.md). Spec: [`pricing.md`](../specs/pricing.md)
§5 "Políticas comerciais". STRIDE: [`threats/pricing.md`](../security/threats/pricing.md) §7.

## Autorização (fundador, 2026-11-22)

Iniciar a W18 em branch isolada com PR draft, sem merge, deploy, migration em Production, política real, ativação de
capacidade ou alteração de parâmetro existente. Decisões técnicas rotineiras sem nova aprovação; decisão do fundador só
para lacuna normativa material ou decisão econômica/comercial não definida.

## Leitura normativa (o que é regra e o que é configuração)

- **Regra (não configurável):** sem política vigente aplicável ao mecanismo, o compromisso não confirma (PD-009,
  REQ-082, TECH-032); nenhuma política contraria a BR-163 nem um INV (PD-009 §Limite, REQ-104, BR-360/361); capacidade
  cancelada ou liberada volta à origem econômica imediatamente anterior — o `01` não prevê exceção para os mecanismos do
  Club (a única é a BR-284, do uso próprio Co-Owner); Fee nunca vira Crédito (TECH-082); reversão de Créditos nunca cria
  quantidade, muda party ou transfere (TECH-070, INV-6); exceção não cria restituição, Crédito, indenização ou
  compensação fora da política (PD-010).
- **Configuração comercial (Luxtory):** prazos (faixas de antecedência) e a parcela de cada efeito por evento — os
  valores das políticas (PD-009: "configuração comercial versionada"). Nenhum valor é presumido no código (TECH-001):
  toda parcela é declarada explicitamente pelo publicador, inclusive zero.

Nenhuma lacuna material impede a W18: os valores são pré-requisito de operação (`03` §16), não de implementação.

## Decisões técnicas (ADR-0034; nenhuma altera regra de negócio)

- **D1 — Esquema fechado v1 por mecanismo.** Três eventos obrigatórios (`cancellation` em 1–5 faixas de antecedência,
  `no_show`, `exception`); eixos por mecanismo derivados do `03` §7: Request e Direct → `capacity`, `credits`, `fee`;
  Luxplus → `capacity`, `money`; locação externa → `capacity`, `money`, `remuneration`. `capacity` é sempre
  `return_to_origin` (BR-163); os demais eixos são frações canônicas em [0, 1].
- **D2 — REQ-104 em três camadas.** Zod (forma), domínio (`validatePolicyConfig`: regras estruturais) e banco
  (`app.commercial_policy_config_valid` no CHECK): política fora do esquema ou contra BR-163/INV nunca é gravada.
- **D3 — Versões como `app.parameter`.** Append-only, escopo global por mecanismo, vigência nunca retroativa, sem
  sobreposição (TECH-030); autoridade Admin + base registrada (TECH-051); trava `app.commercial_policy:<mecanismo>`
  (exclusiva na publicação, compartilhada na resolução), na ordem total antes de `parameter`.
- **D4 — Avaliação pura.** `evaluatePolicy(versão, snapshot, evento)` devolve só efeitos normalizados nos cinco eixos;
  dinheiro com `HALF_UP` uma única vez na parcela devolvida e o restante por diferença; Créditos exatos (TECH-033).
- **D5 — Resolução e aceite.** `resolveEconomicTerms` recebe `policy: { mechanism, acceptedPolicyId }` e devolve a
  versão vigente no mesmo `resolvedAt`; ausente ou diferente da aceita → `ERR_POLICY_MISSING`. O vínculo persistente
  (`economic_snapshot` → versão) nasce na W21 com a primeira operação, na mesma transação (D3 da W16: nenhuma tabela
  sem consumidor; nenhuma operação fictícia).
- **D6 — Eventos.** No-show e exceção serão avaliados pelos commands já autorizados (`declare_no_show`,
  `open_exception`/`resolve_exception`) quando houver reserva de mecanismo do Club (W22–W25). Reservas de uso próprio
  não têm política (não são um dos quatro mecanismos): W13 intacta. Cancelamento: avaliação só no domínio até P-11
  (nenhum command novo).
- **D7 — Nada ativado.** Sem capability nova; nenhuma política inserida por migration, seed ou runbook automático.
- **D8 — Telas.** `/admin/politicas` (vigente, agendadas, histórico; publicar com revisão e confirmação, padrão da
  W16) e o componente `PolicyTerms` + `PolicyAcceptance` (Design System), com prévia "como o Titular verá" na revisão.

## Etapas

| Etapa | Conteúdo | Saída |
|---|---|---|
| E0 | Este plano, ADR-0034, spec §5 "Políticas comerciais", STRIDE §7, W17 ✅ no plano de waves | docs |
| E1 | Migration `pricing_commercial_policy` (69), testes de banco, `db:check` | testes `db` |
| E2 | Domínio (esquema, validação, avaliação), `publish_policy`, rota + OpenAPI, resolução no `EconomicTerms`, trava | testes `unit`/`db` |
| E3 | `/admin/politicas`, componente de apresentação e aceite, i18n, E2E 390/1440 | capturas |
| E4 | `verify`, E2E, `trace --expect REQ-082,REQ-104,PD-009`, CHANGELOG, runbook, NOTES | PR draft |

## Critérios de aceite e onde são provados

- `[PD-009]` sem política vigente nada confirma (`resolveEconomicTerms` → `ERR_POLICY_MISSING`, também com aceite de
  versão superada); versão aceita = vigente no instante dos termos.
- `[REQ-082]` nenhum tratamento econômico por padrão: esquema exige todos os eventos e eixos, sem valor implícito.
- `[REQ-104]` política contra BR-163 (capacidade fora da origem), INV-6 (fração > 1, Créditos em mecanismo sem
  Créditos), TECH-082 (Fee em mecanismo sem Fee) ou com faixas incompletas é recusada no domínio e no banco.
- `[PD-010]` evento `exception` aplica só os efeitos declarados na política.
- `[TECH-030]` sem UPDATE/DELETE; vigência retroativa ou sobreposta recusada; publicações concorrentes serializadas.
- `[TECH-051]` só Admin com AAL2 e base registrada; idempotência por `Idempotency-Key`.

## Cobertura parcial declarada (dependências futuras)

- Vínculo persistente da versão aceita à operação e aplicação dos efeitos pelos ledgers: W21 (Request), W22 (aceite),
  W23 (Direct), W24 (Luxplus), W25 (locação), W19 (Fee/dinheiro).
- Cancelamento pelo usuário nos mecanismos do Club: ⛔ P-11/D6 (nova versão do `03`).
- Política por Second Home: não prevista; o escopo é o mecanismo (ampliável por migration).

## Execução (2026-11-22)

- E0 `26f8152`, E1 `5180566`, E2 `1fd3fd5`, E3 `37ff996` — branch `feat/w18-politicas-comerciais`, auditados pelo
  fundador.
- **Correção da auditoria (`f85fc5d`):** removida a regra `money + remuneration ≤ 1` da locação (domínio e CHECK do
  banco, migration ainda não aplicada fora dos bancos de teste). Ela somava frações de bases distintas — valor bruto
  pago × receita líquida do Titular (BR-253/BR-260) — e não protegia BR-163 (capacidade, eixo fixo) nem BR-270/INV-2
  (decididos pela custódia na aplicação, W25). A conservação passou a ser conferida na avaliação, com valores: líquido
  ≤ bruto e remuneração mantida ≤ valor retido do locatário (PD-010). Exemplo nos testes: bruto R$ 10.000, líquido
  R$ 6.000, devolve 50% e mantém 75% → retém R$ 5.000 e mantém R$ 4.500 (aceito); com líquido = bruto, R$ 7.500 >
  R$ 5.000 (recusado). ADR-0034 §1/§5 emendada.
- E4: `npm run verify` ✅ (225 arquivos, 2123 testes, db:check 69, build); E2E completo local 168 ✅ + 1 timeout do axe em `collection.spec.ts` sob carga (7/7 isolado; fora do escopo da W18); `trace --expect REQ-082,REQ-104,PD-009,PD-010` 4/4; E2E `commercial-policies.spec.ts`
  (axe 0 e sem overflow a 390/1440, toque a 390); CHANGELOG, runbook (`operacao.md` "Preparar a W18"), spec `admin`.
