# Spec: catalog

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `catalog` do TECH-011 (`src/features/catalog/`). Esta versão cobre a W3 (Catálogo + Admin); a W4 acrescenta a
leitura pública (Discovery), a W8 a configuração da Residence, a trava da estrutura e a alteração de modalidade da
Edition, e a W29 a conformidade (REQ-021, BR-020). Decisões: [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md).

## 1. Goal

Brand Partner, Residence Concept (com versões), Residence Edition e Residence existem como objetos distintos e
corretamente vinculados (REQ-020, BR-001…004); nenhuma Residence sem Concept aprovado e nenhuma oferta comercial sem
Edition; a Residence de Investor só existe com autorização registrada (REQ-027, BR-310…314). Tudo operado pelo Admin
(REQ-095), sob o guard, com `operation` e `audit_log` (REQ-015, TECH-092).

## 2. Non-goals

- Leitura pública, páginas do Discovery e políticas de RLS para `anon` (W4). Nenhum `GET` REST: as telas do Admin
  leem no servidor.
- `residence_configuration`, `residence_administration`, trava da estrutura, alteração de modalidade da Edition e
  formalização (W8); `party` e o vínculo Investor → party (W7); margem do Investor (W19); conformidade, personalização
  e suspensão (W29).
- Direitos sobreviventes do encerramento (BR-022/023) como dado: não modelados na W3 (ver §7, limitação temporária).
- Tabela e filtros de produto (ADR-0010 §9): sem consumidor na W3.
- Fotografia (P-1) e textos públicos (W4).

## 3. Users / actors

- Staff com papel **Admin** ativo e sessão AAL2 (TECH-050). O papel exercido é explícito e auditado; Admin e Super Admin
  não são hierárquicos (ADR-0008): quem só tem Super Admin não opera nem lê o catálogo.

## 4. User stories

- Como Admin, quero registrar uma Brand Partner e, quando houver, a autorização de exposição pública da marca (BR-015).
- Como Admin, quero registrar um Concept com elementos essenciais, premissas de preservação e especificação (BR-013,
  BR-014), criar versões novas e aprovar uma versão com as referências das aprovações (REQ-096, BR-010, BR-018).
- Como Admin, quero registrar a Edition de um Concept aprovado, com região, modalidade e condições comerciais (BR-031,
  BR-032).
- Como Admin, quero registrar a autorização de um Investor para um Concept e revogá-la (BR-310).
- Como Admin, quero registrar uma Residence numa Edition — o que também registra a aprovação comercial e fixa a versão
  vigente do Concept (BR-025) —, com ou sem Investor autorizado (REQ-027).
- Como Admin, quero registrar o encerramento da parceria com a Brand Partner e ter novos usos da marca bloqueados depois
  da eficácia (BR-021).

## 5. Contracts

### HTTP API

Operações não críticas do REQ-095 (registro separado do TECH-051), todas `POST` com `Idempotency-Key`, sessão de staff
AAL2 com papel Admin, origem igual ao host (TECH-100) e o schema `Error` (TECH-056). Contrato em
`docs/api/openapi.yaml` (tag `catalog`).

| Operação | Endpoint | Sucesso |
|---|---|---|
| `register_brand_partner` | `POST /v1/admin/brand-partners` | 201 |
| `authorize_brand_exposure` | `POST /v1/admin/brand-partners/{id}/exposure-authorization` | 200 |
| `terminate_brand_partner` | `POST /v1/admin/brand-partners/{id}/terminate` | 200 |
| `create_concept_version` | `POST /v1/admin/concept-versions` (Concept novo ou versão nova) | 201 |
| `approve_concept_version` | `POST /v1/admin/concept-versions/{id}/approve` | 200 |
| `register_investor_authorization` | `POST /v1/admin/investor-authorizations` | 201 |
| `revoke_investor_authorization` | `POST /v1/admin/investor-authorizations/{id}/revoke` | 200 |
| `create_edition` | `POST /v1/admin/editions` | 201 |
| `register_residence` | `POST /v1/admin/residences` | 201 |

Recusas: corpo inválido → 400 `ERR_VALIDATION` (inclui texto com termo vedado, §5 "Terminologia"); objeto referenciado
inexistente → 404 `ERR_NOT_FOUND`; estado que não permite a operação → 409 `ERR_STATE_TRANSITION`; sem papel Admin ou
sem AAL2 → 403 `ERR_PERMISSION`; sem sessão → 401.

**Telas** (fora do contrato REST; Server Actions sobre o mesmo pipeline, ADR-0010 §6), todas no App Shell:

| Tela | Rota |
|---|---|
| Brand Partners (lista) | `/admin/catalogo` |
| Registrar Brand Partner | `/admin/catalogo/brand-partners/nova` |
| Brand Partner (detalhe: estado, exposição, Concepts) | `/admin/catalogo/brand-partners/[id]` |
| Registrar autorização de exposição | `/admin/catalogo/brand-partners/[id]/exposicao` |
| Registrar encerramento (confirmação) | `/admin/catalogo/brand-partners/[id]/encerramento` |
| Registrar Concept (versão 1) | `/admin/catalogo/brand-partners/[id]/concepts/novo` |
| Concept (detalhe: versões, Editions, autorizações de Investor) | `/admin/catalogo/concepts/[id]` |
| Nova versão | `/admin/catalogo/concepts/[id]/versoes/nova` |
| Aprovar versão (confirmação) | `/admin/catalogo/concepts/[id]/versoes/[versionId]/aprovacao` |
| Registrar Edition | `/admin/catalogo/concepts/[id]/editions/nova` |
| Registrar autorização de Investor | `/admin/catalogo/concepts/[id]/autorizacoes-investor/nova` |
| Revogar autorização de Investor (confirmação) | `/admin/catalogo/concepts/[id]/autorizacoes-investor/[authorizationId]/revogacao` |
| Edition (detalhe: Residences) | `/admin/catalogo/editions/[id]` |
| Registrar Residence | `/admin/catalogo/editions/[id]/residences/nova` |
| Residence (detalhe) | `/admin/catalogo/residences/[id]` |

Cada leitura dessas telas grava `audit_log` `admin_read` (TECH-092). A tela só oferece a ação que o estado permite e diz
por que uma ação não está disponível; o command revalida tudo dentro da transação (TECH-054).

### Events (if any)

- Nenhum. O catálogo não gera notificação do REQ-097; a AsyncAPI não muda.

### Domain model

Schema `app`; nenhuma coluna guarda dado pessoal. Toda tabela: RLS ligada com política só para `luxtory_app`, que lê e
insere; `UPDATE` só nas colunas de transição listadas; sem `DELETE`/`TRUNCATE` (gatilho). Cada linha criada por
command guarda o `operation_id` da criação.

| Tabela | Conteúdo | Regras no banco |
|---|---|---|
| `brand_partner` | `brand_name`; autorização de exposição (`exposure_authorization_ref`, `exposure_authorized_at`); encerramento (`terminated_effective_at`, `termination_basis`, `termination_registered_at`) | exposição e encerramento: cada um passa de vazio a preenchido uma única vez; o resto é imutável |
| `concept` | Brand Partner, `title` | imutável |
| `concept_version` | Concept, `version` (1, 2, …), `essential_elements[]`, `preservation_premises[]`, `specification`; `state` `not_approved` → `approved` com `approval_refs[]`, instante, usuário e papel da aprovação | conteúdo imutável; a única transição é a aprovação; `(concept_id, version)` único |
| `investor_authorization` | Concept, `instrument_ref` (referência estável do instrumento), vigência `[valid_from, valid_until)` (`valid_until` opcional: o instrumento pode não ter termo final), revogação (instante e base) | revogação só uma vez; o resto é imutável |
| `edition` | Concept, `region`, `modality` (`owner`, `co_owner`, `owner_and_co_owner`), `commercial_conditions` | imutável na W3 (a W8 traz a trava e a alteração de modalidade) |
| `residence` | Edition, Concept, `concept_version_id` fixada, `commercially_approved_at`, `label` (referência interna), `timezone` IANA, `investor_authorization_id` opcional | imutável; FKs compostas garantem que Edition, versão e autorização são do mesmo Concept; gatilho recusa versão que não seja a aprovada vigente |

- **Versão vigente** do Concept = a versão aprovada de maior número. Só se aprova uma versão maior que a vigente.
  Estados do REQ-096: "Não aprovado" (nenhuma versão aprovada) · "Aprovado (versão N)".
- **Aprovação comercial (BR-025).** `register_residence` é o evento que registra a aprovação comercial da Residence:
  grava o instante (`commercially_approved_at`, do `Clock`) e fixa a versão vigente do Concept naquele instante. Versões
  aprovadas depois não alteram a Residence; a versão fixada nunca muda.
- **Investor (REQ-027, D-W3-1).** A autorização vale para o Concept, dentro da vigência e enquanto não revogada. A
  Residence de Investor referencia a autorização (`investor_authorization_id`); sem autorização válida no instante do
  registro, é recusada. Com autorização, a Residence existe sem adquirente (nenhuma holding até a W8) numa Edition
  Owner, Co-Owner ou ambas. A W7 acrescenta o vínculo com a `party` do Investor (coluna nova com FK) sem reescrever os
  registros existentes.
- **Exposição da marca (BR-015, P-8, D-W3-3).** Registrada por Brand Partner, uma vez, com a referência da autorização.
  O encerramento não a apaga: o registro fica como histórico. A W4 expõe a marca só com autorização registrada e antes
  da eficácia do encerramento.
- **Encerramento (BR-021, D-W3-4).** Registra `terminated_effective_at` (instante de eficácia, passado ou futuro) e a
  base. A partir da eficácia, ficam bloqueados os novos usos da marca: Concept novo, versão nova, aprovação de versão,
  Edition nova, autorização de Investor nova, Residence nova e autorização de exposição. O que já existe não muda
  (BR-022). Ver §7 sobre direitos sobreviventes.
- **Terminologia (REQ-100/101).** Todo texto registrado passa por uma checagem **lexical**: recusa os termos vedados
  do `02` §1 e expressões explícitas conhecidas de promessa de retorno (mesmos padrões do teste de terminologia do DS).
  É defesa complementar, não interpretação semântica do REQ-101; o gate editorial continua sendo a aprovação humana da
  versão (`approve_concept_version`).
- **Travas (ADR-0010 §8).** Ordem do catálogo: `brand_partner` → `investor_authorization`, por id, antes de qualquer
  classe do TECH-053 (nenhum command do catálogo toca essas classes). Os novos usos (Concept novo, autorização de
  Investor, Edition, Residence) travam a Brand Partner em `FOR SHARE`; encerrar, autorizar a exposição, criar versão
  nova e aprovar versão, em `FOR NO KEY UPDATE` — o que serializa numeração e aprovação de versões com o registro de
  Residences sem bloquear as FKs. O registro de Residence trava a autorização de Investor em `FOR SHARE`; a revogação,
  em `FOR NO KEY UPDATE`. O resto é contido por constraints.

## 6. Acceptance criteria

- [ ] `[REQ-020]` Residence sem Concept aprovado ou sem Edition é recusada; condição comercial só existe na Edition;
      Concept, Edition e Residence são objetos distintos, com vínculos garantidos pelo banco.
- [ ] `[REQ-027]` Residence com autorização de Investor inexistente, revogada, fora da vigência ou de outro Concept é
      recusada; com autorização válida, a Residence existe sem adquirente numa Edition Owner, Co-Owner ou ambas.
- [ ] `[BR-025]` O registro fixa a versão vigente e o instante da aprovação comercial; uma versão aprovada depois não
      altera a Residence; o banco recusa trocar a versão fixada.
- [ ] `[BR-021]` Depois da eficácia do encerramento, Concept, versão, aprovação, Edition, autorização de Investor,
      Residence e exposição novos são recusados (inclusive em concorrência com o encerramento); antes da eficácia e para
      o que já existe, nada muda; a autorização de exposição continua registrada.
- [ ] `[REQ-096]` Concept "Não aprovado" → "Aprovado (versão N)"; aprovar exige `approval_refs`; versão aprovada é
      imutável; versão menor ou igual à vigente não é aprovada.
- [ ] `[REQ-100]` `[REQ-101]` Texto com termo vedado ou expressão explícita de promessa é recusado com o campo
      indicado.
- [ ] `[REQ-015]` `[TECH-092]` Cada operação grava `operation` e `audit_log` com antes/depois e o papel exercido; replay
      pela mesma chave; chave com corpo diferente → `ERR_IDEMPOTENCY_CONFLICT`; cada leitura das telas grava
      `admin_read`.
- [ ] `[TECH-052]` `anon` e `authenticated` não leem o catálogo; `luxtory_app` não apaga nem altera fora das transições.
- [ ] `[TECH-100]` `POST` com origem inválida → 403; sem sessão → 401; AAL1, sem papel ou só Super Admin → 403.
- [ ] Contrato OpenAPI de cada rota (sucesso e erros).
- [ ] UI (ADR-0009): toda tela com axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px e zero erro de console;
      fluxo completo (Brand Partner → Concept → aprovação → Edition → autorização de Investor → Residence) a 390 px com
      toque; textos pelo i18n.

## 7. Edge cases

- **Encerramento com eficácia futura:** até a eficácia, novos usos seguem permitidos; depois, bloqueados.
- **Direitos sobreviventes (BR-022/023) — limitação temporária.** A W3 não modela direitos sobreviventes; por isso,
  depois da eficácia, **todo** novo uso da marca é recusado (fechado para falhas), inclusive o que um contrato viesse a
  permitir. Não é regra de negócio nova e não redefine BR-022/023: registros existentes ficam intactos. Quando a Luxtory
  definir como registrar uma base sobrevivente, a exceção entra como dado registrado.
- **Duas aprovações concorrentes do mesmo Concept:** serializadas pela trava do Concept; só a maior versão vale.
- **Aprovação concorrente com o registro de uma Residence:** a Residence fixa a versão vigente no instante do seu
  commit.
- **Autorização de Investor revogada entre abrir a tela e enviar:** o command revalida e recusa.
- **Edition de Concept sem versão aprovada:** recusada (uma Edition sem Concept aprovado nunca teria Residence, BR-003).
- **Fuso da Residence:** obrigatório e sem valor padrão (TECH-001); só nomes IANA conhecidos do runtime.
- **Instantes digitados no Admin** (eficácia, vigência): interpretados no fuso IANA do navegador de quem registra,
  enviado com o formulário e mostrado ao lado do campo; sem fuso, o registro é recusado. A API exige ISO 8601 com
  deslocamento.

## 8. Security considerations

- Authorization: guard do TECH-050/051 (papel Admin exercido, AAL2), releitura do papel a cada command e a cada tela.
- Input validation: Zod com limites de tamanho em toda entrada; ids em uuid; checagem lexical de terminologia.
- Sem dado pessoal: marca, títulos, textos, referências de instrumento e rótulo interno. O rótulo da Residence é
  referência interna — a tela pede para não usar nome de pessoa nem endereço.
- CSRF: `Origin` igual ao host nos `POST` de `/v1`; Server Actions comparam `Origin` e `Host`.
- Threat model: [`docs/security/threats/catalog.md`](../security/threats/catalog.md).

## 9. Observability

- Logs do executor (`command committed`/`command rejected`) com command e `operation_id`; sem textos registrados.
- `admin_read` no `audit_log` para cada leitura das telas.

## 10. Rollout plan

- Migrations só acrescentam tabelas: voltar o app para o deployment anterior é seguro. Sem variável nova.
- Production (D-W3-5): fechar a W3 sem dados fictícios — o catálogo é append-only e não há staging (ADR-0007); os
  primeiros registros reais só com dados reais da Luxtory.

## 11. Open questions

- Como registrar uma base sobrevivente (BR-022/023) que permita novo uso depois do encerramento — aguarda a Luxtory.
- Regras de exposição por Brand Partner (P-8) — aguarda a Luxtory; até lá, só a referência da autorização.

## 12. References

- `01`: BR-001…004, BR-010…015, BR-021…025, BR-030…033, BR-310…314, BR-373, BR-374.
- `02`: REQ-020, REQ-021 (parcial), REQ-022, REQ-027, REQ-095, REQ-096, REQ-098, REQ-100, REQ-101.
- `03`: §3.1, TECH-002, TECH-020, TECH-051, TECH-052, TECH-053, TECH-054, TECH-056, TECH-092, TECH-100, §13.
- ADR-0006, ADR-0008, ADR-0009, ADR-0010. Specs [`admin`](admin.md), [`identity`](identity.md),
  [`design-system`](design-system.md).
