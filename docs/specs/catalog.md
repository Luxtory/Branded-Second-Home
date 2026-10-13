# Spec: catalog

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `catalog` do TECH-011 (`src/features/catalog/`). Esta versão cobre a W3 (Catálogo + Admin); a W4 acrescenta a
leitura pública (Discovery), a W8 a configuração da Residence, a trava da estrutura e a alteração de modalidade da
Edition, e a W29 a conformidade (REQ-021, BR-020). Decisões: [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md).
A leitura pública da W4 (Discovery B2C) está na [§13](#13-discovery-público-b2c-w4); decisões técnicas em
[ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md).
A entrega pública B2B Brand Partners (BP1) está na [§14](#14-discovery-público-b2b-brand-partners-bp1).

## 1. Goal

Brand Partner, Residence Concept (com versões), Residence Edition e Residence existem como objetos distintos e
corretamente vinculados (REQ-020, BR-001…004); nenhuma Residence sem Concept aprovado e nenhuma oferta comercial sem
Edition; a Residence de Investor só existe com autorização registrada (REQ-027, BR-310…314). Tudo operado pelo Admin
(REQ-095), sob o guard, com `operation` e `audit_log` (REQ-015, TECH-092).

## 2. Non-goals

- Leitura pública, páginas do Discovery e políticas de RLS para `anon` (W4). Nenhum `GET` REST: as telas do Admin
  leem no servidor.
  → entregues pela W4 (§13), ainda sem `GET` REST: as páginas públicas também leem no servidor.
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
| `create_catalog_term` | `POST /v1/admin/catalog-terms` (Coleção, §13.12) | 201 |
| `update_catalog_term` | `POST /v1/admin/catalog-terms/{id}` | 200 |
| `upload_concept_cover` | `POST /v1/admin/concepts/{id}/cover` | 201 |
| `approve_concept_media` | `POST /v1/admin/concept-media/{id}/approve` | 200 |
| `withdraw_concept_media` | `POST /v1/admin/concept-media/{id}/withdraw` | 200 |
| `set_concept_curation` | `POST /v1/admin/concepts/{id}/curation` | 200 |
| `register_edition_reference_value` | `POST /v1/admin/editions/{id}/reference-values` | 201 |
| `end_edition_reference_value` | `POST /v1/admin/edition-reference-values/{id}/end` | 200 |

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
  do `02` §1 e expressões explícitas conhecidas de promessa de retorno (inclusive receita, vendas, demanda, escala,
  royalty e remuneração garantidas — Framework Brand Partners §8, ADR-0013) e de disponibilidade ou uso sem limite
  (Framework B2C §14, regras 11 e 13 — ADR-0012); os mesmos padrões estão nas varreduras de `src/` e do Design System.
  É defesa complementar, não interpretação semântica do REQ-101; o gate editorial continua sendo a aprovação humana da
  versão (`approve_concept_version`).
- **Travas (ADR-0010 §8).** Ordem do catálogo: `brand_partner` → `investor_authorization`, por id, antes de qualquer
  classe do TECH-053 (nenhum command do catálogo toca essas classes). Os novos usos (Concept novo, autorização de
  Investor, Edition, Residence) travam a Brand Partner em `FOR SHARE`; encerrar, autorizar a exposição, criar versão
  nova e aprovar versão, em `FOR NO KEY UPDATE` — o que serializa numeração e aprovação de versões com o registro de
  Residences sem bloquear as FKs. O registro de Residence trava a autorização de Investor em `FOR SHARE`; a revogação,
  em `FOR NO KEY UPDATE`. O resto é contido por constraints.

## 6. Acceptance criteria

- [x] `[REQ-020]` Residence sem Concept aprovado ou sem Edition é recusada; condição comercial só existe na Edition;
      Concept, Edition e Residence são objetos distintos, com vínculos garantidos pelo banco.
- [x] `[REQ-027]` Residence com autorização de Investor inexistente, revogada, fora da vigência ou de outro Concept é
      recusada; com autorização válida, a Residence existe sem adquirente numa Edition Owner, Co-Owner ou ambas.
- [x] `[BR-025]` O registro fixa a versão vigente e o instante da aprovação comercial; uma versão aprovada depois não
      altera a Residence; o banco recusa trocar a versão fixada.
- [x] `[BR-021]` Depois da eficácia do encerramento, Concept, versão, aprovação, Edition, autorização de Investor,
      Residence e exposição novos são recusados (inclusive em concorrência com o encerramento); antes da eficácia e para
      o que já existe, nada muda; a autorização de exposição continua registrada.
- [x] `[REQ-096]` Concept "Não aprovado" → "Aprovado (versão N)"; aprovar exige `approval_refs`; versão aprovada é
      imutável; versão menor ou igual à vigente não é aprovada.
- [x] `[REQ-100]` `[REQ-101]` Texto com termo vedado ou expressão explícita de promessa é recusado com o campo
      indicado (na tela, ao lado do campo; na API, 400 `ERR_VALIDATION` no schema `Error`, que não expõe campos).
- [x] `[REQ-015]` `[TECH-092]` Cada operação grava `operation` e `audit_log` com antes/depois e o papel exercido; replay
      pela mesma chave; chave com corpo diferente → `ERR_IDEMPOTENCY_CONFLICT`; cada leitura das telas grava
      `admin_read`.
- [x] `[TECH-052]` `anon` e `authenticated` não leem o catálogo; `luxtory_app` não apaga nem altera fora das transições.
- [x] `[TECH-100]` `POST` com origem inválida → 403; sem sessão → 401; AAL1, sem papel ou só Super Admin → 403.
- [x] Contrato OpenAPI de cada rota (sucesso e erros).
- [x] UI (ADR-0009): toda tela com axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px e zero erro de console;
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
- W4 (§13): `01` §1, §2, §8, §8.1; BR-002, BR-005, BR-017, BR-019, BR-031, BR-051…054, BR-063, BR-065, BR-071…076,
  BR-082, BR-100…104, BR-111, BR-130, BR-143, BR-144, BR-146…151, BR-162, BR-190, BR-192, BR-240, BR-242, BR-250, BR-252,
  BR-257…259, BR-300, BR-301, BR-330…332, BR-340…345; `02` §2, REQ-070…072, REQ-092, REQ-103; ADR-0011…ADR-0014;
  [`communication`](communication.md), [Framework B2C](communication/framework-b2c.md), [`b2c.md`](communication/b2c.md).

## 13. Discovery público B2C (W4)

Superfície **Discovery** do `02` §2 para o Protagonista B2C, pelo mapa de páginas `D-B2C-14` de
[`b2c.md`](communication/b2c.md#8-jornada-e-5ps). Fonte canônica da comunicação: [Framework B2C](communication/framework-b2c.md)
(ADR-0012); limites L1–L9 e objeções: [`b2c.md`](communication/b2c.md) §2 e §5; contrato: [`communication.md`](communication.md).
Decisões técnicas: [ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md). Donos: REQ-100, REQ-101.

### 13.1 Escopo e decisões

| Página | Rota | Dados | Schwartz | 5Ps |
|---|---|---|---|---|
| Home | `/` | disponibilidade (§13.2) | Unaware → Product Aware | arco completo; PICTURE = Hero |
| Como funciona | `/como-funciona` | disponibilidade | Product Aware → Most Aware | PROOF → PUSH |
| Coleção | `/colecao` | Concepts e Editions públicos | Product Aware → Most Aware | PROOF → PUSH |
| Concept, com as Editions e a oferta | `/colecao/[conceptId]` | o Concept e suas Editions | Most Aware | PUSH + prova necessária |

Fora da W4: Interesse (W6, `P-B2C-01`), páginas Brand Partners (`P-BP-01`; jornadas separadas, `D-LX-01`), página
própria de Edition, fotografia (`P-LX-02`), robots/sitemap e go-live.

Decisões técnicas (aprovadas em 2026-09-29 e mantidas em 2026-10-01):

| Tema | Decisão |
|---|---|
| Visibilidade | Concept público = versão aprovada **e** autorização de exposição da marca registrada (BR-015) **e** instante anterior à eficácia do encerramento (BR-021). Depois da eficácia, o Concept sai da Coleção e a URL responde 404 — **limitação temporária, fechada para falhas** (como a D-W3-4, §7), que **não redefine BR-021, BR-022 nem BR-023**; quando os direitos sobreviventes virarem dado, a visibilidade passa a respeitá-los |
| Conteúdo público | o menor necessário, sem campo novo: título do Concept, especificação da versão vigente, região, modalidade e condições comerciais de cada Edition (como registradas) e nome da marca. `essential_elements` e `preservation_premises` não são publicados; a página afirma o fato (BR-014, BR-301) sem as listas. Nunca públicos: número da versão, dados de aprovação, Residences, Investor e referências de instrumento |
| URL e ordem | `/colecao/<uuid>`; ordem de registro do Concept dentro de cada grupo da Coleção |
| Portão | rotas públicas 404 em Production até `PUBLIC_SITE=open` (go-live depende de `P-LX-03`, D1 e D5c); abertas em local, CI e Preview |
| CSP e cache | CSP com nonce por requisição em toda página HTML; leitura pública sem cache |
| Imagem | Frame tipográfico (P-1); Courier só com metadado real (regiões, capítulos) |

### 13.2 Leitura pública: contrato de dados

- **Papel:** transação só de leitura em que `luxtory_app` vira `anon` (`SET LOCAL ROLE anon`); sem claims, sem escrita,
  sem `admin_read`.
- **Colunas concedidas a `anon`:** `brand_partner(id, brand_name)`; `concept(id, brand_partner_id, title, created_at)`;
  `concept_version(id, concept_id, version, state, specification)`; `edition(id, concept_id, region, modality,
  commercial_conditions, created_at)`. Nada mais em `app`.
- **Visibilidade = RLS** (fonte única): políticas `FOR SELECT TO anon` sobre os predicados `SECURITY DEFINER`
  `app.brand_partner_is_public` e `app.concept_is_public` (só booleano, `EXECUTE` só para `anon`). Versão: só
  `approved`; vigente = a aprovada de maior número.
- **Leituras** (`application/public-views.ts`, nenhum campo numérico ou preço calculado — ADR-001 do `03`):
  - `collection()` — cada Concept público com título, marca e suas Editions (região, modalidade);
  - `concept(id)` — título, marca, especificação vigente e Editions (região, modalidade, condições);
  - `availability()` — há Edition publicada? há Concept publicado? Lida pela Home e pelo Como funciona.
- **Disponibilidade e CTA (`D-B2C-13`, `D-B2C-16`):**

  | Estado | CTA da Home | CTA do Como funciona |
  |---|---|---|
  | ao menos uma Edition publicada | "Conheça as Residence Editions" → primeiro grupo da Coleção | o mesmo |
  | Concepts publicados, nenhuma Edition | "Conheça os Residence Concepts" → Coleção | o mesmo |
  | nenhum Concept publicado | "Entenda como funciona" (nenhum CTA para a Coleção) | nenhum CTA de catálogo |
  | dados indisponíveis (Preview sem banco, falha) | **desconhecido**: nenhum CTA de catálogo, "Entenda como funciona"; log estruturado | **desconhecido**: nenhum CTA de catálogo |

  Ausência técnica de dados nunca é tratada como inexistência de Edition ou de Concept.

  Nomes públicos (`D-LX-08`, `D-B2C-18`): os CTAs aparecem como "Conheça as Home Editions" e "Conheça os Home
  Concepts"; no site, a casa é Second Home, o Concept é Home Concept e a Edition é Home Edition.

### 13.3 Portão e exposição externa

- `PUBLIC_SITE` ausente em Production → o layout do grupo público responde 404 (página 404 da plataforma). Só `open` é
  aceito pela validação de ambiente.
- Verificado em 2026-09-29 (só leitura): a Data API do Supabase está desligada — o PostgREST registra
  `db-schemas=pg_pgrst_no_exposed_schemas` e responde `PGRST002` a `/rest/v1/…` (inclusive com `Accept-Profile: app`) e
  a `/graphql/v1`; `pg_graphql` não está instalado; nenhum papel de API tinha `USAGE` em `app`. Com a W4, `anon` passa
  a ter `USAGE` e os grants por coluna, alcançáveis só por quem já é `luxtory_app`. **Religar a Data API ou expor `app`
  é proibido** (runbook e ADR-0014); a verificação se repete depois do `migrate`.

### 13.4 Briefs de página

Comum às quatro páginas — Brief Narrativo `[FW-B2C: §12]`:

- **Protagonista:** potencial Titular que deseja aproveitar melhor seu lazer e suas conquistas com os Aliados
  `[FW-B2C: §3, §12]`. Owner e Co-Owner são modalidades do mesmo Protagonista, com o mesmo peso (REQ-103).
- **Contexto:** aberto à melhor solução para aproveitar com mais valor o lazer com os Aliados. **Disposição:** Aberto
  `[FW-B2C: §3.1]`; a ambivalência é tratada pelas objeções (`b2c.md` §5) no PROOF e no PUSH `[FW-B2C: §7.1]`.
- **Desejo, Job e Solução Desejada:** `[FW-B2C: §4, §4.1, §4.3, §12]` — Patrimônio + Liberdade + Pertencimento.
- **Tom:** `[FW-B2C: §11]`, derivado por seção; no máximo dois traços OCEAN `[FW-B2C: §10.1]`; contexto negativo com
  Retraimento `[FW-B2C: §10.2]`; Volatilidade só como em `D-B2C-12`.
- **Limites:** L1–L9 de `b2c.md` §2 e guardrails de [`luxtory.md`](communication/luxtory.md) §4. Termos canônicos
  explicados na primeira menção da página (`D-LX-06`). Nenhuma prova externa (`P-LX-01`) nem fotografia (`P-LX-02`).
- **Copy:** `presentation/i18n/discovery-pt-br.ts`; a copy final é aprovada no Checkpoint Visual.
- **Peso:** emoção · explicação · evidência, em proporção aproximada.

#### Home — `/`

1. **Jornada:** `D-B2C-14`, linha "Home" — a mais abrangente; segue estritamente o Brief Narrativo `[FW-B2C: §12]`.
2. **Função:** despertar o desejo pela vida que a tríade possibilita, tornar consciente o trade-off das alternativas,
   apresentar a nova lógica e demonstrar como a Luxtory integra os três valores `[FW-B2C: §12]`. **Schwartz:** Unaware →
   Product Aware `[FW-B2C: §7, §13]`. **Camada de solução:** Progresso → Solução Desejada → Categoria → Oferta
   `[FW-B2C: §4.4]`. **MCR:** Estratégica — Interna + Cooperação `[FW-B2C: §6]`.
3. **5Ps:** arco completo; PICTURE = Hero; a progressão seguinte parte de PROBLEM `[FW-B2C: §8 P1, §14]`.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia, não copy) | Fatos e limites | Afeto · OCEAN | Peso | Composição (DS) |
   |---|---|---|---|---|---|---|---|
   | Hero | PICTURE | "Como seria se meu lazer fosse assim?" | a vida de lazer desejada: viver mais e melhor as conquistas com os Aliados, em lugares que têm a ver com você e passam a fazer parte da sua história. Desperta o desejo primeiro e faz sentido sem depender de produto, categoria ou problema `[FW-B2C: §8 P1]`. Resultado: "Eu quero essa vida pra mim." | nenhuma afirmação de produto | CARE + SEEKING · Estética + Compaixão | 80·20·0 | Opening Frame com Frame tipográfico `night`; `lx-display-xl` com no máximo uma virada em itálico; uma frase de apoio em cena; sem CTA comercial |
   | O conflito | PROBLEM | "Por que eu preciso abrir mão de algo?" | as alternativas entregam partes da tríade — propriedade tradicional, hotelaria e locação, compartilhamento genérico, cada uma com o que tende a entregar e do que tende a abrir mão; os três importam `[FW-B2C: §2, §8 P2]`. Resultado: "Por que eu deveria abrir mão de um deles?" | trade-offs com "tende a" e "pode"; categorias nomeadas, nenhuma empresa (`luxtory.md` §6) | SEEKING · Intelecto + Assertividade | 40·50·10 | Scene em `paper`: afirmação curta + as três alternativas em `lx-blocks`, cada uma com o que entrega e do que abre mão (`dl`), sem caixa nem sombra |
   | A virada | PROMISE | "Existe outra forma?" | o insight: não começar escolhendo entre comprar ou alugar, e sim pelos valores; a nova lógica — uma second home construída a partir do lifestyle e conectada a mecanismos que reúnem os três valores; a categoria Branded Second Home, explicada na primeira menção `[FW-B2C: §8 P3]`. Resultado: "Eu posso ter os três." | BR-003, BR-053 (construída do zero) | SEEKING · Intelecto + Assertividade | 30·70·0 | Scene `--statement` em `night`: virada tipográfica grande e a tríade do Framework em três linhas `[FW-B2C: §2]` |
   | A arquitetura | PROOF | "Como a Luxtory entrega os três, de verdade?" | o mecanismo `[FW-B2C: §8 P4]` costura três capítulos: **Patrimônio → Posse** (Owner: a Residence inteira; Co-Owner: Ação da SPE proprietária com Direito de Uso; patrimônio com valor econômico, sem garantia); **Liberdade → Possibilidades** (gestão aplicável; Luxchange e Luxplus com Membership vigente; locação autorizada quando elegível — ampliar possibilidades, não ausência de regras); **Pertencimento → Identificação + Lugar + Pessoas** (marca, Brand DNA, Concept, Residence, Aliados; o Club amplia progressivamente). Fecha mostrando os três na mesma arquitetura — presença, não maximização. Resultado: "Agora entendo como a Luxtory garante a presença dos três valores." | L1, L3, L4, L5, L6, L7, L8, L9; BR-052, BR-071, BR-146, BR-147, BR-374 | SEEKING + FEAR↓ · Diligência + Ordem | 10·50·40 | um Chapter de três Scenes com marker de capítulo no rail ("Patrimônio · Posse"…), Frame tipográfico alternando de lado com a linha da tríade; Owner e Co-Owner em `lx-pair`; link discreto para o Como funciona; nenhum link para mecanismo do Club (L7) |
   | Para quem | PUSH | "Isso faz sentido para mim?" | a autosseleção `[FW-B2C: §8 P5]` e o próximo passo coerente. Resultado: "Quero descobrir qual Residence faz sentido para minha vida." | qualificação `[FW-B2C: §8 P5]` + BR-054 | CARE · Polidez + Compaixão | 20·50·30 | Scene em `wash`: `lx-pair` (faz sentido · pode não fazer sentido) + o CTA da §13.2 |

5. **CTA:** por disponibilidade (§13.2).
6. **Dados dinâmicos:** só a disponibilidade; o resto é estático.
7. **Não afirmar:** comunidade como recurso existente (L6); mecanismos do Club como disponíveis hoje (L7); receita,
   valorização, liquidez; prova social; números.
8. **Aceite:** §13.6.
9. **Copy (2026-10-01):** a copy da Home é a escrita pelo fundador (`D-B2C-18`), com as decisões da revisão de
   2026-10-01; ela substitui a mensagem-chave da tabela acima e acrescenta três seções: a regra da renúncia (PROBLEM,
   vilão), a Luxtory com os pilares Pertencimento, Patrimônio, Liberdade e a Gestão (PROOF) e as dúvidas essenciais
   (FAQ, depois do PUSH). Ordem das seções e textos: `presentation/i18n/discovery-pt-br.ts` (`home`).

#### Como funciona — `/como-funciona`

1. **Jornada:** `D-B2C-14`, linha "Como funciona" — aprofunda, em detalhe, modalidades, Direito de Uso, gestão, Luxtory
   Club, condições e limites.
2. **Função:** demonstrar a arquitetura e responder às objeções com fatos. **Schwartz:** Product Aware → Most Aware
   `[FW-B2C: §8.1, §13]`. **MCR:** Estratégica — Interna + Enfrentamento (escolha consistente diante de custos, regras e
   uso real) `[FW-B2C: §6.2]`.
3. **5Ps:** PROOF → PUSH `[FW-B2C: §8.1]`; PICTURE, PROBLEM e PROMISE ficam na Home.
4. **Seções** (organizadas pelas perguntas do Protagonista, `[FW-B2C: §5]`, respondidas por `b2c.md` §5):

   | Seção | 5P | Perguntas | Mensagem-chave (ideia) | Fatos e limites | Afeto · OCEAN | Composição (DS) |
   |---|---|---|---|---|---|---|
   | Abertura | PROOF | "Como a arquitetura funciona?" | a tríade e o mecanismo, do lifestyle à Residence e ao Club | `[FW-B2C: §8 P4]`; `luxtory.md` §5 | SEEKING · Intelecto + Ordem | cabeçalho de página + a cadeia em `lx-blocks--rows` |
   | Patrimônio → Posse | PROOF | "O que exatamente eu possuo?" · "Qual a diferença entre Owner e Co-Owner?" · "Isso é timeshare?" · "Existe garantia de retorno, valorização ou liquidez?" | Owner: a Residence inteira; Co-Owner: Ação da SPE proprietária com Direito de Uso, equivalente entre Co-Owners; ambos nascem na formalização; transferência conforme as regras aplicáveis; não é timeshare (`D-B2C-15`); nenhuma garantia | L1, L8; BR-052, BR-065, BR-071, BR-341, BR-373, BR-374 | SEEKING + FEAR↓ · Diligência + Ordem | marker de capítulo; perguntas como títulos; Owner e Co-Owner em `lx-pair` |
   | Liberdade → Possibilidades | PROOF | "Como funciona meu uso?" · "Vou usar o suficiente?" · "O que acontece quando não utilizo?" · "Como funcionam gestão e manutenção?" · "Consigo usar outros lugares?" · "Isso reduz minha liberdade?" | Owner: toda a capacidade de uso; Co-Owner: Direito de Uso anual da configuração, limites por temporada, abertura sorteada e rotativa, até 14 dias seguidos — com as **quatro configurações canônicas como detalhe secundário**; gestão por modalidade, nunca "sem custos"; Club com Membership vigente, cada mecanismo com regras próprias; liberdade = possibilidades, não ausência de regras | `01` §8.1 (sem a capacidade Luxtory); L3, L4, L7; BR-075, BR-076, BR-082, BR-100…104, BR-111, BR-147, BR-151, BR-162 | SEEKING + FEAR↓ · Diligência + Ordem; Retraimento nas regras e custos | marker de capítulo; perguntas como títulos; configurações em `Evidence` dentro de `lx-blocks` |
   | Pertencimento → Identificação + Lugar + Pessoas | PROOF | "Qual a diferença para uma second home tradicional?" · "Por que não continuar alugando?" | da marca ao Brand DNA, ao Concept e à Residence construída do zero e fiel a ele; Aliados como convidados; o Club amplia progressivamente; o contraste com as alternativas pelos trade-offs | L5, L6, L9; BR-003, BR-013, BR-053, BR-330…332 | CARE + SEEKING · Estética + Ordem | marker de capítulo; texto + cadeia curta |
   | Condições e limites | PROOF | "O que mais preciso saber?" | oferta só por uma Residence Edition, com condições registradas; valores de planos e taxas não fixados nesta página; Ação com Direito de Uso (dito em positivo); nenhuma garantia de retorno | BR-004, BR-031, BR-143, L2, REQ-100, REQ-101 | FEAR↓ · Retraimento + Diligência | Scene `--statement` |
   | Para quem | PUSH | "Faz sentido para mim?" | qualificação completa | `[FW-B2C: §8 P5]` + BR-054, BR-019, BR-101, BR-104 | CARE · Polidez + Compaixão | `lx-pair` + CTA da §13.2 |

5. **CTA:** §13.2.
6. **Dados:** disponibilidade; o resto é estático.
7. **Não afirmar:** valores de Membership, Fee, Taxa de Administração e descontos (BR-143); regras de convidado ainda
   não definidas (P-5); o passo de manifestar interesse (W6).

#### Coleção — `/colecao`

1. **Jornada:** `D-B2C-14`, linha "Coleção" — as Second Homes: Concepts e suas Editions, como Discovery de produto, não
   marketplace.
2. **Função:** levar o Protagonista à Residence que faz sentido. **Schwartz:** Product Aware → Most Aware.
3. **5Ps:** PROOF → PUSH.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia) | Fatos | Composição (DS) |
   |---|---|---|---|---|---|
   | Abertura | PROOF | "O que estou vendo?" | Residence Concept × Residence Edition em uma frase: o Concept traduz um lifestyle em uma casa; a Edition é o seu lançamento numa região, com condições | BR-001, BR-002, BR-004, `D-LX-06` | cabeçalho de página |
   | Residence Editions | PROOF → PUSH | "Onde há oferta?" | Concepts com ao menos uma Edition: card com o título no Frame, a marca e cada Edition (região · modalidade) | dados; REQ-103 | `Collection` (alternância 7/4), âncora do CTA da Home |
   | Residence Concepts | PROOF → PUSH | "Quais Concepts existem?" | Concepts ainda sem Edition, sem oferta comercial | REQ-022, BR-030 | `Collection`; um Concept nunca aparece nos dois grupos |

5. **CTA:** o card leva ao Concept ("Ver o Concept"). Vazio ou indisponível → frase honesta + "Entenda como funciona".
6. **Dados:** §13.2; grupo vazio não aparece.
7. **Não afirmar:** disponibilidade, estoque, escassez, quantidades.

#### Concept — `/colecao/[conceptId]`

1. **Jornada:** `D-B2C-14`, linha "Concept, com Edition e oferta quando existirem (REQ-022)" — a Residence específica.
2. **Função:** dar a prova necessária para a decisão. **Schwartz:** Most Aware `[FW-B2C: §8.1]`.
3. **5Ps:** PUSH + prova necessária.
4. **Seções:**

   | Seção | Função | Pergunta mental | Mensagem-chave (ideia) | Fatos | Composição (DS) |
   |---|---|---|---|---|---|
   | Abertura | prova (Pertencimento) | "Que Residence é esta?" | título, a marca que ela traduz, as regiões com lançamento | dados; BR-015 | Opening Frame tipográfico `night`; `ConceptCredit`; marker com as regiões reais |
   | A Residence | prova | "O que ela propõe?" | a especificação registrada, como está | BR-013 | `lx-prose` |
   | Fiel ao Concept | prova | "A casa vai ser assim?" | construída do zero e fiel ao Concept; o Owner personaliza o que não é essencial; a Residence Co-Owner é padronizada | L9; BR-014, BR-017, BR-019, BR-301 | Scene `--statement` |
   | Oferta | prova | "Existe oferta? Onde, e em que modalidade?" | cada Edition: região, modalidade (Owner e Co-Owner com o mesmo peso) e condições registradas; sem Edition, sem oferta comercial | BR-004, BR-031, REQ-020, REQ-022, REQ-100 | `Evidence` + `lx-prose` |
   | Para quem | PUSH | "Faz sentido para mim?" | qualificação e próximo passo possível hoje | `[FW-B2C: §8 P5]` | `lx-pair` + ações |

5. **CTA:** "Manifestar interesse" ausente até a W6 (`D-B2C-10`, `P-B2C-01`). Decisão deste brief: o PUSH oferece
   "Conheça outros Concepts" (Coleção) e "Entenda como funciona".
6. **Dados:** §13.2. Concept não público ou inexistente → 404 do grupo público, com a navegação. Metadata: só o título.
7. **Não afirmar:** disponibilidade, prazo de obra, preço calculado, número de Residences, configuração Co-Owner da
   Edition (definida conforme a demanda, BR-063), Investor.

### 13.5 Admin: conteúdo público identificado

- Os campos publicados como estão — título do Concept, especificação, região, modalidade e condições comerciais da
  Edition — levam no rótulo a marca visível **"Público no site"** e uma dica que diz onde o texto aparece; o nome da
  marca diz que só é público com a exposição autorizada.
- `essential_elements` e `preservation_premises` dizem na dica que não aparecem no site.
- Antes de confirmar, as telas que publicam dizem a consequência: aprovar uma versão, autorizar a exposição da marca e
  registrar uma Edition.

### 13.6 Aceite da W4

- [ ] `[REQ-100]` `[REQ-101]` o texto renderizado das páginas públicas, inclusive com os dados do catálogo, passa pela
      guarda canônica de terminologia (`domain/terminology.ts`).
- [ ] `[REQ-022]` Concept sem Edition aparece sem oferta; na Coleção, só no grupo Residence Concepts.
- [ ] `[REQ-103]` Owner e Co-Owner com a mesma estrutura (mesmo nível de título, mesmas dimensões) onde aparecem juntos.
- [ ] `[BR-015]` `[BR-021]` sem exposição autorizada, sem versão aprovada ou depois da eficácia do encerramento, o
      Concept não aparece e a URL responde 404.
- [ ] `[TECH-052]` `anon` só lê as colunas da §13.2 das linhas visíveis, não escreve e só executa os dois predicados.
- [ ] CTA por disponibilidade nos quatro estados da §13.2; dados indisponíveis nunca viram "sem Edition".
- [ ] Hero com função de desejo: abre a página sem depender de produto, categoria ou problema para fazer sentido.
- [ ] Nenhum link para a jornada Brand Partners nem para o Admin.
- [ ] Portão: com `VERCEL_ENV=production` e sem `PUBLIC_SITE=open`, as rotas públicas respondem 404.
- [ ] CSP com nonce em toda página HTML; zero erro de console nas telas públicas e do Admin.
- [ ] Admin: conteúdo público identificado (§13.5).
- [ ] UI (ADR-0009): axe 0 a 390 e 1440 px; sem overflow de 320 a 1920 px; jornada Home → Coleção → Concept → Como
      funciona a 390 px com toque; menu do celular; smoke Playwright WebKit.
- [ ] Checklist da §10 do contrato de comunicação, inclusive os 6 Testes de Validação e as regras de execução do
      Framework `[FW-B2C: §13, §14]`; capturas a 390 e 1440 px no PR.

### 13.7 Edge cases

- **Encerramento com eficácia futura:** o Concept aparece até o instante (`now()` do banco) e some na requisição
  seguinte.
- **Versão nova ainda não aprovada:** a página continua na vigente.
- **Especificação e condições:** parágrafos separados por linha em branco; quebra simples vira espaço; nenhum HTML.
- **Banco indisponível:** estado desconhecido (§13.2) na Home e no Como funciona; estado indisponível na Coleção e no
  Concept.

### 13.8 Pendências (não bloqueiam a W4)

- Slug legível, resumo editorial e ordem editorial da Coleção — antes do go-live, com contrato próprio.
- Direitos sobreviventes do encerramento como dado (§7).
- `P-LX-03` (inclui o termo "posse"), D1 e D5c — condicionam abrir o portão.
- P-8 (regras de exposição por marca), P-1 (fotografia) e P-3 (textos jurídicos do rodapé).

### 13.9 Receitas visuais do Core Design System (CP2)

> Documentadas no CP1 (2026-10-06) a partir da estrutura das páginas na `main`; aplicadas no CP2. Patterns e superfícies
> de [`design-system.md` §13](design-system.md). Receita = composição, não copy: a fonte autorizada da copy é decidida no
> **GATE-COPY-W4**, antes do CP2. Âncoras, ordem das seções, dados, CTA por disponibilidade e regras da §13 continuam
> como estão. Mídia só com asset autorizado; sem ela, o pattern sem mídia (P-1).

**Shell público:** SiteHeader `--overlay` sobre o hero da Home e sólido `blue` nas demais; Menu (`lx-mobile-nav`) com o
gatilho do ícone oficial; Footer `deep`.

| Página | Seção | Superfície | Pattern |
|---|---|---|---|
| Home | Hero | fotografia | Cinematic Hero (3 fotos existentes; o único convite desce para a renúncia) |
| Home | Renúncia | `blue` | Problem / Triad Comparison (Tríade de valor + três alternativas) |
| Home | Regra | `sand` | Statement/Pause (as três linhas, a pergunta e o fechamento) |
| Home | Possibilidade | `blue` | Text + Diagram (Diagrama de solução) + Triad Statement ("Você pode ter os três.") |
| Home | Luxtory | `sand` | Editorial Comparison (os dois polos do contraste) + fechamento |
| Home | Pertencimento | `blue` | Editorial Split media/text com mídia autorizada; sem ela, uma coluna |
| Home | Patrimônio | `sand` | Editorial Comparison Owner \| Co-Owner (mesma estrutura, REQ-103) + princípio |
| Home | Liberdade | `blue` | Numbered Editorial List (mecanismos) |
| Home | Gestão | `sand` | Panel Comparison Owner \| Co-Owner (painéis `deep`) + fechamento |
| Home | PUSH | `blue` | Sibling Blocks (quatro promessas, 2 × 2) + linhas da tríade + CTA nos quatro estados |
| Home | FAQ | `white` | FAQ / Disclosure |
| Como funciona | Abertura + índice | `blue` | Statement/Pause `--opening` + Numbered Editorial List com links |
| Como funciona | Mecanismo, capítulos e condições | `sand` ↔ `blue` | Numbered Editorial List / Disclosure; configurações canônicas do Co-Owner como Panel Comparison (detalhe secundário do PROOF) |
| Como funciona | PUSH | `blue` | Statement/Pause com o CTA por disponibilidade |
| Coleção | Abertura | `blue` | Statement/Pause `--opening` |
| Coleção | Residence Editions, depois Residence Concepts | `sand` / `white` | Sibling Blocks de CollectionCard tipográficos (P-1); estados vazio e indisponível |
| Concept | Abertura | `blue` | Statement/Pause `--opening` + ConceptCredit (só com autorização) |
| Concept | Proposta | `white` | Editorial Split sem mídia (uma coluna) |
| Concept | Fiel ao Concept | `deep` | Statement/Pause |
| Concept | Editions e oferta | `white` | Sibling Blocks com Evidence; sem Edition, sem oferta (REQ-022) |
| 404 público | — | `white` | Statement/Pause com o link de volta |

Aceite visual no **Checkpoint Visual do CP2 (sem push)**: Home, Como funciona, Coleção, Concept com e sem Edition, menu
do celular aberto e Admin com "Público no site", a 390 e 1440 px.

### 13.10 Home — Especificação Visual Final do fundador (CP2, 2026-10-06)

> Brief visual da Home no Core Design System; prevalece sobre as linhas da Home da tabela §13.9. Copy: `D-B2C-19`
> (GATE-COPY-W4, [`b2c.md`](communication/b2c.md) §11). Âncoras (`HOME_SECTIONS`), ordem, dados, CTA por disponibilidade
> (`D-B2C-16`), CSP e as regras da §13 continuam como estão. Grid de 12 colunas no container de 1.400 px; mobile em
> uma coluna na ordem abaixo, sem divisores verticais, Owner antes de Co-Owner com o mesmo peso.

| Seção | Superfície | Composição (desktop) | Celular | Mídia |
|---|---|---|---|---|
| Hero | fotografia | Composição da W4 aprovada (revisão do fundador): fachada ao entardecer em toda a viewport, scrim sobre toda a imagem (um pouco mais escuro), headline White com a virada em itálico Warm Sand, menor e em duas linhas a partir do `lg`, subtítulo e CTA na mesma linha; header transparente que fica Moroccan Blue sólido depois da rolagem; uma foto, sem controles | foto com o conteúdo embaixo | `luxury-property-facade-hero.jpg` |
| Renúncia | `blue` | Problem / Triad Comparison em duas colunas: o diagrama tem a altura do bloco de texto; alternativas 01–03 em 4/4/4 entre hairlines; fechamento centrado | copy → tríade → alternativas | Tríade de valor desejado (SVG) |
| Regra | `deep` | Columns 5/7: copy + Panel Switch (Second Home inicial, radios nativos, região viva); opções, atributos e valores na mesma fonte e tamanho (Newsreader, `type.ordinal`), em uma linha a partir de 1440 px; fechamento centrado | copy → painel → fechamento | — |
| Possibilidade | `blue` | Text + Diagram 6/6: o Diagrama de solução tem a altura do bloco de texto e não tem os rótulos "Venda Integral", "Aluguel de Temporada" e "Clube de Lazer" (removidos; círculos e traços intactos) + Triad Statement | copy → diagrama → Triad Statement | Diagrama de solução (SVG) |
| Luxtory | `sand` | Editorial Split 7/5 (imagem \| copy); fechamento nas 12 colunas | imagem → texto → fechamento | Kaizen K09 |
| Pertencimento | `blue` | Editorial Split 5/7 (copy com Editorial List \| imagem); fechamento | texto → imagem → fechamento | Kaizen K07 |
| Patrimônio | `white` | intro (≈ 8 colunas) + Owner \| Co-Owner (Editorial Comparison com hairline superior e divisor central); fechamento | intro → Owner → Co-Owner → fechamento | sem imagem |
| Liberdade | `deep` | Bloco A: Editorial Split 5/7 (imagem \| intro); Bloco B: Numbered Editorial List (Luxchange, Luxplus, Locação de temporada); fechamento | intro → imagem → lista → fechamento | `luxury-property-facade-hero.jpg` |
| Gestão | `sand` | Editorial Split 7/5 (copy \| imagem) + Owner \| Co-Owner; fechamento | texto → imagem → Owner → Co-Owner → fechamento | Kaizen K05 |
| PUSH | `deep` + fotografia | A: Editorial Split 6/6 (argumento com as três linhas da tríade \| fotografia); subseção "E para quem é a Luxtory?" (pergunta \| texto corpo); próximo passo centrado. B: fotografia de fechamento com o CTA por disponibilidade (primário Warm Sand, secundário em contorno) e scrim só atrás das ações | argumento → foto → pergunta → texto → próximo passo → foto → CTA | `hero-lifestyle.jpg` · `home-solucao-firepit-family.jpg` |
| FAQ | `white` | cabeçalho à esquerda; 13 disclosures nativos em ≈ 8–10 colunas, chevron Moroccan Blue | cabeçalho → disclosures | — |

**Fotografias (proveniência).** Do repositório Luxtory2.0: `luxury-property-facade-hero.jpg` (Hero e Liberdade),
`hero-lifestyle.jpg` (PUSH A) e `home-solucao-firepit-family.jpg` (PUSH B), já em `public/images/home/hero/`. Da
galeria Kaizen do anteprojeto (Luxtory2.0): K09 (família na piscina), K07 (pavilhão de bem-estar) e K05 (suíte
preparada), recomprimidas sem redimensionar em `public/images/home/kaizen/`, sem legenda sobre a foto (revisão do
fundador). Todas provisórias: autorizadas para o site como referência visual, sem autorização definitiva de produção
registrada. Nenhuma significa Edition, oferta ou prova de benefício (REQ-022).

**Contraste — exceção registrada (decisão do fundador, 2026-10-06).** Os eyebrows sobre Moroccan Blue da Home
(Renúncia, Possibilidade, Pertencimento) são Warm Sand (`lx-eyebrow--accent`) e medem 4,32:1 a 12 px, abaixo dos
4,5:1 do WCAG 2.2 AA. O gate de axe do E2E tolera só a regra `color-contrast` nesses elementos
(`tests/e2e/support/ui.ts`); todo o resto continua exigido. Sobre Deep o eyebrow é Warm Sand dentro do AA (5,57:1);
sobre Warm Sand, Dark Moroccan Blue (5,57:1).

**Revisão visual do fundador (2026-10-06, aprovada).** Hero na composição da W4; diagramas com a altura do texto;
painel da Regra numa só tipografia; um tamanho por tipo de texto (fechamento: parágrafo `lx-subheadline` e destaque
`lx-headline`) e fechamentos na mesma largura (`layout.container-narrow`); "o lifestyle com o qual você se identifica."
maior; copy nova em Pertencimento, Patrimônio, Liberdade e no PUSH (`D-B2C-19`). O carrossel do Hero volta sozinho
com duas ou mais fotos adequadas.

**Demais páginas.** Como funciona, Coleção, Concept e 404 seguem as receitas da §13.9 no Core. No Como funciona, o
desenho da proporção do ano das configurações Co-Owner sai; os valores continuam em Evidence, painel a painel.

### 13.11 Como funciona — Especificação Visual e Copy do fundador (2026-10-06)

> Brief de página de `/como-funciona` sobre o Core Design System; prevalece sobre as linhas do Como funciona da tabela
> §13.9 e sobre a frase do Como funciona em "Demais páginas" da §13.10. Copy: `D-B2C-20`
> ([`b2c.md`](communication/b2c.md) §11). Dados, SSR, CSP, RLS, CTA por disponibilidade (`D-B2C-16`) e as regras da §13
> continuam como estão; nenhum produto ou regra de negócio muda.

**Brief.** Protagonista: quem avalia se uma Second Home Luxtory faz sentido para a sua vida, como Owner ou Co-Owner
(`[FW-B2C: §5]`). Consciência Product Aware → Most Aware; 5Ps predominantes PROOF → PUSH (`[FW-B2C: §8]`), sem
reabrir PROBLEM nem PROMISE da Home; estado afetivo SEEKING, com redução de insegurança; tom sofisticado, claro,
seguro, humano e conversacional; a Luxtory é Mentor. Resultado mental esperado: "agora eu entendo como funciona, o
que é meu, como uso, quais são as regras, e consigo decidir se isso combina comigo". Função: extensão da Home — o
Hero continua a Home sem reiniciar a jornada. Fatos: L1–L9 e os IDs citados no i18n de cada bloco; nenhum preço, taxa,
disponibilidade, garantia ou regra nova.

| Seção | Superfície | Composição (desktop) | Celular | Mídia |
|---|---|---|---|---|
| Hero | fotografia (`blue` no celular) | Cinematic Hero `lx-hero lx-hero--uniform` (scrim uniforme `scrim.display-alpha` 0,80 sobre 100% da foto); o mesmo header da Home (sobre a foto, menu pelo ícone oficial); headline Warm Sand, subtítulo, âncora "Entenda a jornada" e índice dos três capítulos (`lx-hero__chapters`), embaixo à esquerda | foto → headline → subtítulo → âncora → capítulos | `hero-lifestyle.jpg` (no `md`, recorte sem pessoas sob o texto) |
| Como tudo se conecta + jornada | `sand` | Editorial Split 6/6 (texto \| imagem); jornada em Answer Rows `--phases`: cada momento abre com a hairline forte, rótulo à esquerda, três etapas numeradas (01–09, título `display-s`) à direita | texto → imagem → jornada | Kaizen K07 |
| Patrimônio | `blue` | Split 6/6 (imagem \| texto); Answer Rows 4/8: "O que exatamente é meu?" (Owner \| Co-Owner), "Isso é timeshare?" e "Existe garantia…?" com "Não." em destaque; fechamento | imagem → intro → Owner → Co-Owner → dúvidas | `luxury-property-facade-hero.jpg` |
| Liberdade | `sand` | Split 6/6 (texto \| imagem); uso (Owner \| Co-Owner, fechamento em corpo), "No Co-Owner, quanto tempo posso usar?" com as quatro configurações em Figures (mesma geometria, 4 colunas; "Uso anual" em destaque, nome da configuração como rótulo) e legenda em corpo; "E quando eu não estiver usando?" | intro → imagem → uso → configurações empilhadas → não uso | `problema-imovel.jpg` (outro destino: mar e palmeiras, recorte à direita) |
| Gestão | `sand` | Split 6/6 (imagem \| texto); "Quem cuida da Second Home?" (Owner \| Co-Owner); fechamento | imagem → texto → Owner → Co-Owner → fechamento | Kaizen K05 (recorte na cama preparada) |
| Luxtory Club | `sand` | cabeçalho com a pergunta; Luxchange, Luxplus, Locação em Numbered Editorial List; nota (corpo) e statement | Luxchange → Luxplus → Locação | — |
| Pertencimento | `blue` | Split 6/6 (imagem \| texto); "O que faz…ser diferente?" (texto + Owner \| Co-Owner), "E meus convidados?"; fechamento | imagem → intro → diferença → convidados | Kaizen K09 |
| Condições | `white` | Numbered Editorial List 01–05, sempre visível (sem disclosure) | título → 01–05 | — |
| Faz sentido | `sand` | Editorial Comparison: as duas listas com o mesmo peso, sem ícones de certo/errado | faz sentido → pode não fazer | — |
| CTA | fotografia | `lx-hero--closing lx-hero--uniform` (scrim uniforme 0,80): headline, apoio e CTA por disponibilidade | foto → headline → apoio → CTA | `home-solucao-firepit-family.jpg` |

**CTA por disponibilidade (`D-B2C-16`).** Com Home Edition publicada, "Conheça as Home Editions"; só com Concepts,
"Conheça os Home Concepts"; o apoio ("…descubra quais Home Concepts e Home Editions já fazem parte da Coleção") só
aparece com um desses dois CTAs. Sem Concept publicado, a frase "Os primeiros Home Concepts ainda não foram
publicados." e nenhum CTA; com leitura indisponível, nem frase nem CTA — nunca um CTA falso.

**Fotografias.** As seis fotos provisórias da §13.10 e, na Liberdade, `problema-imovel.jpg` do Luxtory2.0 (casa de
praia ao entardecer, sem pessoas), autorizada pelo fundador em 2026-10-07 como asset provisório para comunicar outro
destino; copiada sem alteração em `public/images/como-funciona/`. Nenhuma foto se repete na página. Nenhuma foto
significa Edition, oferta ou prova de benefício (REQ-022).

**Scrim uniforme (decisão do fundador, 2026-10-07).** Hero e CTA final usam um scrim Dark Moroccan Blue uniforme sobre
100% da fotografia (`lx-hero--uniform`), com a menor opacidade em que tudo o que fica sobre a foto passa a 390, 768,
1024 e 1440 px. Mínimo medido por fotografia nos pixels reais: Hero — headline Warm Sand 0,79, subtítulo 0,68, âncora
0,63, nomes dos capítulos 0,60, números 0,73, logo 0,77, marca do menu 0,76; CTA — headline 0,79, apoio 0,68. Como o
navegador guarda o alfa em 8 bits (0,79 vira 0,788 e o headline cai para 2,998:1 no render), as duas fotos ficam em
0,80 (`scrim.display-alpha`, o nível em que o Warm Sand mantém 3:1 até sobre um pixel branco); as cores da copy não
mudam.

**Core.** Complementos com consumidor real (design-system §13.10): Answer Rows (`lx-answers`, `--phases`; perguntas
em Hanken medium), Figures (`lx-figures`, `__value--primary`), índice de capítulos do Hero (`lx-hero__chapters`),
nota de modalidade numa lista (`lx-numbered__note`), recortes `lx-crop-md-x-*` e o scrim uniforme opt-in
(`lx-hero--uniform`, token `scrim.display-alpha`); o Cinematic Hero padrão (Lab, fechamento da Home) não muda. Sobre
`sand`, o eyebrow segue o papel `marker` do Core (Dark Moroccan Blue, 5,57:1): Moroccan Blue a 12 px mede 4,32:1.

**Aceite.** E2E `discovery.spec.ts` (gate de UI com axe a 390/1440 e sem overflow 320–1920; REQ-103 nos pares
Owner | Co-Owner; D-B2C-16; teste da página: capítulos, condições visíveis, Figures, listas do PUSH e fechamento;
header da Home com `aria-current` no menu; contraste do Hero e do CTA medido nos pixels a 768 e 1440) e Checkpoint
Visual sem push a 390/768/1024/1440.

### 13.12 Coleção — discovery curatorial (Fase A, 2026-10-07)

> Brief UX/copy e contrato mínimo de dados da nova `/colecao`, aprovados em conceito pelo fundador (`D-B2C-21`).
> Prevalece sobre as linhas da Coleção da §13.4 e da §13.9 quando a Fase C entrar. Fora deste brief, as regras da §13
> continuam: SSR, CSP, RLS (`anon`), CTA por disponibilidade (`D-B2C-16`), âncoras `#home-editions`/`#home-concepts`.

**Brief.** Protagonista: quem quer descobrir qual forma de viver e qual Home Concept combinam com ele. Pergunta central:
"Como eu quero viver — e quais Home Concepts combinam comigo?". Product Aware → Most Aware, PROOF → PUSH; sem reabrir
PROBLEM/PROMISE da Home. Ordem: descoberta → comparação → compreensão → escolha. Resultado mental: "não estou vendo uma
lista de imóveis; estou descobrindo qual forma de viver e qual Home Concept combinam comigo".

| # | Seção | Superfície | Função |
|---|---|---|---|
| 01 | Hero + Discovery | `blue` (tipográfico) | headline, subtítulo, barra de discovery como protagonista da primeira dobra; "Home Concept é a ideia. Home Edition é o lançamento dessa ideia em uma região." + "Entenda como funciona ↓" (para a 03) |
| 02 | Destaques / Resultados | `white` | sem filtro: curadoria; com filtro: resultados. Dois grupos: Com Home Edition (`#home-editions`) e Ainda sem Home Edition (`#home-concepts`) |
| 03 | Como um Home Concept chega à sua Second Home | `sand` | a cadeia canônica em seis passos (REQ-024/025, BR-030/031, BR-052/071, BR-053, BR-300/301) |
| 04 | Fechamento | `blue` | "Refinar a busca ↑" + "Entenda como funciona" |

Header: o mesmo da Home (logo + menu pelo ícone), sólido. Hero tipográfico nesta versão, por falta de fotografia de
atmosfera adequada (todas as autorizadas mostram uma casa e seriam lidas como um Concept); uma fotografia de atmosfera
autorizada e não vinculável a um Concept pode substituí-lo depois, sem mudar a arquitetura da página.

**Card — a unidade é o Home Concept.** Um card por Concept, nunca duplicado por ter várias Editions. Identidade:
imagem oficial (ou o fallback tipográfico do Core), lifestyle · estilo principais, título (Newsreader), "A partir do
universo de X" (só com exposição autorizada, BR-015), fatos ("Até 10 pessoas · 5 suítes · 500 m²", só os que
existem). Dentro dele, **Home Editions**: um bloco editorial por Edition — a região; depois uma linha por base que a
modalidade oferece, "Owner · a partir de R$ X" (a Second Home inteira) e "Co-Owner · Ação a partir de R$ Y" (sem valor
vigente, só "Owner" ou "Co-Owner · Ação"); hairline entre Editions quando houver mais de uma; nunca valor por dia
(REQ-100); mesmo peso (REQ-103). Sem Edition: "Ainda sem Home Edition — por enquanto, sem oferta comercial." e
nenhum valor (REQ-020/022). Dado ausente: a linha some (nunca "—" nem "sob consulta"). CTA: "Conheça o Concept →"; o
card inteiro é o alvo (link do título), foco visível; no desktop o CTA fica no pé do card, alinhado entre os cards da
mesma linha, sem truncar conteúdo nem criar caixa. Grade uniforme (4/12 · 6/12 · 12/12; imagem 4:5 a partir do `md`,
4:3 no celular). **Sem capa**, o Frame tipográfico do Core mostra o lifestyle principal do Concept (rótulo do
vocabulário, Newsreader) — ou, sem lifestyle, o título —, decorativo (`aria-hidden`) e sem nenhum outro texto. Só com
**destaque editorial explícito** e capa aprovada, o Concept em destaque abre o seu grupo como Editorial Split nas 12
colunas (imagem 3:2 + texto; no celular, um card como os outros com o eyebrow "Em destaque") — a largura toda evita uma
coluna vazia ao lado; um Concept sem capa nunca é destaque.

**Discovery.** Formulário GET renderizado no servidor (sem JS também funciona; URL compartilhável). Filtros
principais: Lifestyle (múltiplo) · Localização (regiões das Editions) · Estilo (múltiplo) · Pessoas ("para pelo menos
N", com os valores reais) · Faixa de valor em duas etapas — 1) Owner (a Second Home inteira) ou Co-Owner (uma Ação),
com o mesmo peso; 2) De / Até, sugeridos pelos valores vigentes publicados; aplicada, a interface diz "Considera só
Concepts com Home Edition e valor vigente para Owner/Co-Owner". Busca livre: Concept, lifestyle, destino, estilo e
Brand Partner autorizada. Mais filtros: suítes (mínimo), área (m²), modalidade disponível, só com Home Edition, Brand
Partner. **Localização não elimina Concepts sem Edition na região**: com uma região escolhida, a página mostra "Com
Home Edition em [região]" e depois "Outros Home Concepts que combinam com suas escolhas" (os que atendem aos demais
filtros e ainda não têm Edition naquela região: "Ainda sem Home Edition em [região]. O interesse por um Concept pode
indicar onde um novo lançamento faz sentido."). A Faixa de valor continua restrita a Concepts com Home Edition e valor
vigente na base escolhida; com região, o primeiro grupo exige essa Edition na região. Ordenação: Curadoria Luxtory
(padrão) · Mais recentes. Cada filtro só aparece com 2+ valores reais; opções
sem resultado não aparecem; sem nenhum filtro útil, a barra mostra só a busca; com o catálogo vazio, a barra não
aparece. Desktop: a barra fica fixa e compacta
sob o header ao rolar, numa linha (o rótulo "Faixa de valor" vira "Valor"), com chips dos filtros ativos e "Limpar
filtros". Celular: busca + "Filtros (n)" + ordenação;
filtros num `<dialog>` em tela cheia com "Ver resultados"/"Limpar" fixos. A busca do celular tem um botão de envio
inequívoco em largura total ("Explorar a Coleção", 48 px), nunca um quadrado só com ícone. "Filtros (n)" fixo no
rodapé depois da barra é P2: só entra se for simples e não conflitar com a viewport, o navegador ou o CTA. Desktop: os
cinco filtros usam a tipografia e as alturas do Core (rótulo `type.label`, valor `type.body`, alvo ≥ 48 px); o valor
quebra linha, nunca é reduzido nem truncado. Contagens só no status `aria-live` e no botão do celular, nunca como headline.

**Copy.**
- 01 — eyebrow "Coleção"; H1 "As suas próximas histórias começam antes mesmo de a casa existir."; subtítulo "Explore
  Home Concepts criados a partir de diferentes lifestyles — e descubra quais Home Editions já foram lançadas na região
  que você deseja."; busca "Busque por lifestyle, destino, Home Concept ou Brand Partner"; botão "Explorar a Coleção";
  "Mais filtros"; explicação "Home Concept é a ideia. Home Edition é o lançamento dessa ideia em uma região." +
  "Entenda como funciona ↓" (âncora para a 03).
- 02 — sem filtro: eyebrow "Curadoria Luxtory", H2 "Encontre uma Second Home que tenha a ver com você."; com filtro:
  H2 "Resultados da sua busca". Grupos: "Com Home Edition" ("Já lançados — com região, modalidade e condições
  definidas.") e "Ainda sem Home Edition" ("Por enquanto, sem oferta comercial. O interesse por um Concept pode ajudar a
  indicar onde um novo lançamento faz sentido.").
- 03 — "Como um Home Concept chega à sua Second Home": 01 Escolha o Home Concept — o lifestyle e a casa que combinam
  com você. · 02 Escolha onde gostaria de vivê-lo — o interesse mostra à Luxtory onde há demanda. · 03 A Home Edition ganha
  forma — com demanda e viabilidade, a Luxtory estrutura o lançamento com região, modalidade e condições próprias. · 04
  Escolha como possuir — Owner: a Second Home inteira. Co-Owner: uma Ação da SPE proprietária, com Direito de Uso. · 05
  O Design & Build transforma o Concept em casa — arquitetura, interiores, engenharia e obra; construída do zero e fiel
  ao Concept. · 06 Viva sua Second Home. + "Entenda como funciona". Nunca "Home Edition ou Design & Build".
- 04 — "Encontre o lugar onde suas próximas histórias podem começar." + "Refinar a busca ↑" + "Entenda como funciona".
- Estados — sem resultado: "Nenhum Home Concept combina com todas essas escolhas." + "Limpar filtros"; catálogo vazio:
  "Os primeiros Home Concepts ainda não foram publicados." (a 03 e o fechamento continuam); leitura indisponível: "A
  Coleção não pôde ser carregada agora." sem afirmar que não há catálogo.

**Contrato mínimo de dados (para liberar a Fase B).** Escritas só pelo servidor, por commands com `operation_id` e
auditoria (TECH-002); leitura pública como `anon` com colunas e linhas mínimas (ADR-0014).

1. **Vocabulários controlados** `lifestyle` e `architectural_style` (`id`, `slug` único e imutável, `label`, `active`).
   Geridos no Admin: criar, renomear o rótulo, desativar (nunca apagar um valor em uso). Sem tagging livre.
2. **Classificações da versão do Concept**, múltiplas e ordenadas (a 1ª é a principal, mostrada no card): lifestyle
   1–3, estilo 1–2 — um Concept costuma traduzir mais de um aspecto de um lifestyle (ex.: wellness e natureza) e, às
   vezes, uma linguagem arquitetônica híbrida; os limites impedem que vire tagging. Gravadas com a versão (imutáveis
   como a especificação, BR-013/021).
3. **Atributos da versão do Concept** (colunas novas, opcionais): `summary` (≤ 160), `guests_max`, `suites`,
   `built_area_m2` (inteiros positivos). Versões antigas ficam sem eles; o dado ausente esconde a linha e o filtro.
4. **Mídia do Concept** (`concept_media`): zero ou uma capa pública vigente por Concept, com ciclo próprio — `alt`
   (obrigatório), `credit` (metadado editorial, nunca EXIF), foco (`crop_x`/`crop_y` nos passos das classes
   `lx-crop-*`), estado pendente → aprovada → retirada; só a aprovada é pública; uma capa nova aprovada substitui a
   vigente e retirar a capa tira o destaque. A capa não é exigida para publicar o Concept (sem capa: fallback tipográfico
   do Core, nunca destaque). **PostgreSQL = metadados e estado; Supabase Storage privado = binários** (ADR-0015, decisão
   final do checkpoint B): o banco guarda a referência de cada versão (`storage_key`), dimensões, MIME, tamanho e
   SHA-256; o Storage guarda um master sanitizado (até 4096 px) e as larguras de exibição (480/800/1200/1600, sem
   ampliar). Entrega por uma rota do próprio domínio, só para mídia aprovada de Concept público, sem mudar a CSP; upload
   no Admin com MFA, conteúdo real JPEG/PNG/WebP, até 3 MiB e 40 MP, mínimo 720 × 520 px (o maior quadro da Coleção em
   1×), orientação corrigida e reencode sem metadados. STRIDE em `docs/security/threats/catalog.md`.
5. **Curadoria** (`concept_curation`, mutável e auditada): `rank` (ordem "Curadoria Luxtory") separado de `featured`
   (destaque editorial explícito, no máximo um Concept por vez; só vale com capa aprovada).
6. **Valor de referência da Edition, versionado** (`edition_reference_value`, só inserção): `edition_id`, `basis`
   (`owner` = a Second Home inteira, `acao` = uma Ação Co-Owner; compatível com a modalidade da Edition), `amount_minor`
   (`bigint`) + `currency` (TECH-033), `valid_from`, `valid_until` opcional; sem vigências sobrepostas por série
   (Edition + base + moeda). No Admin: início agora ou no futuro, nunca retroativo; um valor futuro não encerra o atual
   antes da sua data de início — na entrada em vigor do novo, o anterior termina; "Encerrar" vale a partir de agora;
   nada histórico é sobrescrito. Backfill técnico, se um dia for preciso, não é funcionalidade do Admin.
   Vigente = `valid_from ≤ agora` e sem fim vencido. Registrado pela Luxtory, nunca calculado (BR-031, REQ-094). Nada
   de valor para Concept sem Edition.
7. **Leitura pública**: `anon` passa a ler os vocabulários ativos em uso, as classificações e atributos da versão
   vigente, a capa aprovada e os valores vigentes. Busca, filtros e ordenação rodam no servidor sobre a leitura pública
   (camada `application`, funções puras testáveis) — o catálogo é curado (dezenas de Concepts); se crescer para
   milhares, passam a SQL sem mudar a interface.
8. **Admin**: contratos no `openapi.yaml` no início da Fase B (vocabulários, classificações e atributos na criação da
   versão, mídia, curadoria, valores de referência), antes de qualquer handler.

**Fase B — entregue (2026-10-07; checkpoint B aprovado com ajustes, já aplicados).** Contratos no `openapi.yaml` antes dos handlers; cinco
migrations reversíveis (`catalog_term` + atributos e classificações da versão; `concept_media` + `concept_media_file`;
`concept_curation`; `edition_reference_value`; leitura `anon`). Regras gravadas no banco, além dos commands: só rótulo e
estado ativo do termo mudam; classificação só com termo ativo e versão não aprovada; ciclo da capa
pendente → aprovada → retirada com zero ou uma capa aprovada por Concept; no máximo um destaque e só com capa aprovada;
valor de referência sem vigências sobrepostas por série e com um único encerramento; slug único por vocabulário,
imutável e nunca reutilizado (o termo desativado continua dono dele). Recusas próprias: conteúdo que não é JPEG, PNG ou
WebP, acima de 40 MP ou menor que 720 × 520 px, ou valor que começaria no passado → `ERR_VALIDATION` dentro do command
(ADR-0015); base
incompatível com a modalidade, destaque sem capa, termo desativado → `ERR_STATE_TRANSITION`. Aprovar uma capa nova retira
a anterior ("Substituída por nova capa"); retirar a capa tira o destaque; registrar um valor encerra o vigente em aberto da
mesma base no início do novo. Telas do Admin: Vocabulários da Coleção (lista, registro, renomear/desativar); Coleção na
versão (lifestyle 1–3 e estilo 1–2 por seleção, resumo, pessoas, suítes, área — pré-preenchidos da versão mais recente);
Capa (envio, pré-visualização `data:`, aprovação, retirada com motivo); Curadoria; Valores de referência na Edition
(registro, encerramento). Leitura pública: `PublicCollectionReader` e as funções puras `parseCollectionQuery`,
`discoverCollection` e `collectionFacets`, que a Fase C usa sem mudar. Parâmetros da URL da Coleção (estáveis): `q`,
`lifestyle` e `estilo` (slugs, repetíveis), `regiao`, `pessoas`, `base` (`owner` | `co-owner`), `valor-de` e
`valor-ate` (reais inteiros), `suites`, `area-de`, `area-ate`, `modalidade` (`owner` | `co-owner`), `com-edition=1`,
`marca` (id da Brand Partner) e `ordem` (`curadoria` | `recentes`); valor inválido é ignorado. A página pública não mudou.

**Fase C — implementada (2026-10-07, aguardando o Checkpoint Visual final).** `/colecao` sobre a leitura pública e as
funções da Fase B, no Core (`styles/core/collection.css`; design-system §13.10, "Coleção"). Header da Home (logo + menu
pelo ícone), sólido. Busca: formulário GET no servidor; parâmetro vazio, repetido ou fora de ordem redireciona para a URL
estável (os chips, a ordenação e "Limpar filtros" usam a mesma forma). Facetas em `<details>` nativos, cada uma com
"Aplicar" — sem JS funcionam em qualquer largura; com JS, o celular abre os mesmos campos num `<dialog>` em tela cheia
("Filtros (n)", "Ver resultados" e "Limpar" fixos). "Mais filtros" mostra só a contagem de filtros avançados ativos.
Ordenação como links ("Curadoria Luxtory" · "Mais recentes") no cabeçalho dos resultados, em todas as larguras — um campo
só, sem duplicar a ordem na linha do celular. Barra fixa do desktop (lg+), que aparece só depois que a barra do Hero sai
da tela: a busca e um grupo com as facetas ("Valor" no lugar de "Faixa de valor"; só o rótulo numa linha e, quando
ativa, a quantidade — "Lifestyle (2)"), "Filtros (n)" (leva aos chips) e "Explorar a Coleção"; o grupo fica ao lado da
busca quando cabe e numa segunda linha quando não (a busca guarda espaço para a dica curta numa linha). Os chips dos
filtros ativos e "Limpar filtros" ficam no cabeçalho dos resultados (na barra, cortariam). Estados:
sem resultado (frase + "Limpar filtros"), catálogo vazio e leitura indisponível (sem a barra; a jornada e o fechamento
continuam; o fechamento sem "Refinar a busca"). Âncoras `#home-editions`/`#home-concepts` preservadas (também nos
grupos de Localização). O botão "Filtros (n)" fixo no rodapé do celular (P2) não entrou: o botão do Hero já mostra a
contagem e a barra não conflita com a viewport.

**Checkpoint Visual final — decisões do fundador (2026-10-07), aplicadas.** (1) Chips só no cabeçalho dos resultados; a
barra fixa mantém os controles e "Filtros (n)". (2) Ordenação como dois links no cabeçalho dos resultados em todas as
larguras: a opção atual tem `aria-current`, ícone de check, peso semibold e fio inferior (não depende só de cor); foco
visível do Core; a URL guarda `ordem`. (3) Dica da busca responsiva, sem reduzir a fonte: "Busque por lifestyle,
destino, Home Concept ou Brand Partner" no Hero a partir de lg; "Lifestyle, destino, Concept ou marca" no celular, no
tablet e na barra fixa (onde a longa seria cortada). (4) Sem "Filtros" fixo no rodapé do celular. Mídia — elegibilidade
por quadro: toda capa aprovada (≥ 720 × 520) serve ao card; o destaque editorial (≈ 720 × 480 a 1440, 3:2) em DPR 2 pede
uma largura de exibição ≥ 1440 × 960 px, derivada das dimensões guardadas e sem ampliar (`supportsFeatured`): a curadoria
recusa destacar capa menor (`ERR_STATE_TRANSITION`), aprovar capa menor tira o destaque, e a leitura só abre o destaque
com capa elegível; o Admin mostra "Uso na Coleção" na capa e o motivo na curadoria. Ajustes da validação: no diálogo do
celular, "Faixa de valor" e "Mais filtros" aparecem como títulos de grupo (o mesmo nome do desktop); num card com várias
Editions, as que atendem à região/modalidade/faixa de valor da busca vêm primeiro.

**Fases.** A — este brief, o contrato e os mockups (checkpoint). B — migrations reversíveis, Admin, leitura pública,
mídia e as funções de busca/filtro, com testes unitários e de banco; a página pública não muda (checkpoint com dados
semeados). C — a `/colecao` final, responsiva, com estados, acessibilidade e E2E (busca, filtros, valor em duas etapas,
estados, âncoras da Home, REQ-020/022/100/103); Checkpoint Visual → PR → CI → merge → deploy → smoke. Insumos da
Luxtory: termos dos vocabulários, capas oficiais (P-1), valores de referência e curadoria.

**Mockups e dados.** O rótulo "Mockup — conteúdo, imagens e valores de exemplo" existe só no artifact de revisão e
nunca entra na página; nenhum dado fictício dos mockups vira seed de produção (os seeds de E2E e de desenvolvimento são
de teste e nunca rodam contra produção).

**Fora do escopo.** Design & Build como caminho alternativo à Edition e estimativa de valor de Concept sem Edition (exigem
nova versão do `02`); amenidades (sem vocabulário); formulário de interesse (W6, ⛔ P-3).

## 14. Discovery público B2B Brand Partners (BP1)

Contrato BP0 aprovado pelo fundador (2026-10-09); BP1 não implementada na BP0 — implementação registrada em §14.8;
BP1.1 (comunicação, 2026-10-12) em §14.9.
Comportamento e limites:
[`02` REQ-028](canonical/02-product-spec.md#61-jornada-brand-partners); arquitetura:
[`03` TECH-057](canonical/03-technical-spec.md#61-brand-partners-público-e-fronteira-do-portal).
Comunicação: [aplicação Brand Partners](communication/brand-partners.md), D-BP-11/12/13 e L1–L10;
narrativa: [Framework congelado](communication/framework-brand-partners.md) §12; forma:
[Core DS §15](../reference/design-system.md#15-core-design-system--uso-cp1-2026-10-06).
O portal permanece exclusivamente nos contratos futuros REQ-029/TECH-058 e na BP2 do
[roadmap](../plan/implementation-waves.md); não integra esta seção nem condiciona BP1.

### 14.1 Jornada, navegação e publicação

| Rota | Conteúdo | Destino do CTA do REQ-028 |
|---|---|---|
| `/brand-partner` | Home + formulário | `#conversa` |
| `/brand-partner/como-funciona` | Processo, papéis e governança | `/brand-partner#conversa` |

`SiteShell` com `homeHref`/navegação B2B próprios, grupo de rotas/layout independente; logo, menu e footer só
levam a destinos B2B disponíveis. Sem links de Concepts pendente ou portal; não reutilizar CTA por disponibilidade
do catálogo B2C nem formulário Admin. Se `/Brand-Partner` tiver uso/divulgação, redirect 308 para a Home canônica.

Flag server-side `BRAND_PARTNERS_SITE=open|closed`, independente de `PUBLIC_SITE`: ausente/fechada em produção
→ páginas e endpoint retornam 404. Publicação exige formulário funcional. Preview não indexável; produção aberta
com canonical, title, description e metadados sociais por página, sem dados estruturados de prova inexistente.
As páginas não dependem de consulta ao catálogo nem da quantidade de marcas cadastradas.

### 14.2 Briefs funcionais

Mapa e conscientização: [aplicação §7](communication/brand-partners.md#7-jornada-e-5ps).
**Home:** aplicar integralmente o Brief Narrativo do Framework §12; PICTURE é o Hero.
Seções em ordem, com mensagens como intenção (copy final em i18n):

| Seção | Pergunta / mensagem-chave | Fonte | Peso e composição Core |
|---|---|---|---|
| PICTURE | “Como nossa marca poderia ser vivida?” / expressão residencial do universo da marca | Framework §8 P1/§12; BR-013/014 | Emoção; headline e frame tipográfico com hierarquia ampla |
| PROBLEM | “Como expandir sem diluir?” / complexidade e identidade | Framework §8 P2; BR-010/014 | Explicação curta; statement editorial |
| PROMISE | “Que estrutura permite esse progresso?” / DNA como origem do Concept | Framework §8 P3; BR-013/014 | Emoção + explicação; composição editorial |
| PROOF | “Como funciona e como se protege?” / mecanismo e governança | Framework §8 P4/§12; aplicação L1–L9 | Evidência + explicação; sequência numerada e blocos; link para Como funciona |
| PUSH + conversa | “Faz sentido para nossa marca?” / fit e próximo passo | Framework §8 P5; REQ-028; D-BP-13 | CTA e formulário em `white` ou `wash`, nunca estados/formulário sobre `sand` |

**Como funciona:** Brand Partner interessada na oferta, disposição Aberta; Product Aware → Most Aware.
Objetivo: compreender o processo e avaliar fit. PROOF → PUSH, sem repetir os três primeiros Ps da Home.
MCR contextual: confiança para avaliar identidade, governança e responsabilidades (Framework §6.1/§12);
SEEKING, Intelecto + Assertividade e tom institucional do Framework §12. Próximo passo/CTA iguais aos da Home.

| Seção | Pergunta / mensagem-chave | Fonte | Peso e composição Core |
|---|---|---|---|
| Abertura + mecanismo | “Qual é o percurso?” / percurso Brand DNA → Concept e demais etapas | Framework §8 P4; REQ-020/022 | Explicação; título e sequência numerada, sem reiniciar PICTURE |
| Governança | “Como o DNA e os direitos são preservados?” / aprovações e versão vinculada | REQ-021; aplicação L2–L4 | Evidência; blocos editoriais |
| Papéis, demanda e remuneração | “Quem faz o quê?” / responsabilidades e remuneração contratual | BR-016/030/040/041/350; aplicação L1/L5/L7 | Explicação + evidência; papéis comparáveis |
| Replicação, continuidade e objeções | “O que condiciona a expansão e a continuidade?” | aplicação L6/L8 e §5 | Evidência; FAQ/padrões Core |
| PUSH | “Qual é o primeiro passo?” / avaliação de fit | REQ-028; D-BP-12/13 | CTA para formulário da Home; sem duplicá-lo ou criar terceira página |

Dados ausentes não viram prova: usar frames tipográficos; fotografia, marcas, Concepts reais e demais evidências
exigem autorização e fonte (aplicação L9, P-LX-01/02). Não publicar instrumentos privados. Narrar Concepts não
equivale à página pendente em P-BP-02. Aceite editorial: limites L1–L10, seis testes/regras do Framework §13/14,
checklist de `communication.md` §10 e Checkpoint Visual da BP1. P-LX-03 é gate de comunicação antes do go-live
das afirmações abrangidas, sem bloquear implementação técnica.

### 14.3 Entrada do formulário

`POST /v1/brand-partner-contacts`, público (`security: []`), JSON; `Idempotency-Key` UUID por tentativa lógica.
Zod no servidor e o mesmo contrato no browser para feedback. Corpo até 32 KiB efetivos, mesmo sem
`Content-Length`; schema fechado, sem propriedades extras ou anexos. Limites de caracteres em pontos de código
Unicode após trim. Campos autorizados pelo REQ-028:

| Campo JSON | Rótulo | Validação |
|---|---|---|
| `name` | Nome | Obrigatório, 1–120 caracteres |
| `brand` | Marca | Obrigatório, 1–200 caracteres |
| `email` | E-mail | Obrigatório, válido, até 254 caracteres, sem CR/LF; não exigir domínio corporativo |
| `message` | Mensagem | Obrigatório, 1–4.000 caracteres; texto simples, preservando quebras de linha |
| `website` | Site da marca | Opcional, vazio = ausente; HTTP/HTTPS até 500 caracteres, sem credenciais; nunca acessado pelo servidor |
| `_trap` | Sem campo de negócio | Honeypot técnico, ausente/vazio; preenchido → recusa sem envio |

Honeypot fora do teclado/árvore acessível, sem interferir no preenchimento assistido. A aplicação não armazena
o contato em cookie, localStorage, sessionStorage, URL ou analytics. Não acrescentar campos/consentimentos ao REQ-028.

### 14.4 Processamento e respostas

Aplicar TECH-057: publicação/configuração → origem e limite de corpo → schema/honeypot/proteção distribuída →
envio → resposta. O limitador protege também tentativas rejeitadas; honeypot não produz falso sucesso.
Origem comparada ao domínio permitido por ambiente, nunca `Host` arbitrário; recusar ausente/indevida e CORS
permissivo. Limites por origem de rede e global; IP de metadado confiável da plataforma, pseudonimizado por HMAC
com segredo separado e TTL na chave Redis, sem e-mail como chave. Isso não é anonimização; não logar IP/identificador.

| HTTP | Resultado | Condição |
|---|---|---|
| 202 | `{ "status": "accepted" }` | Aceite confirmado pelo Resend, inclusive replay; não comprova entrega na caixa |
| 400 | `ERR_VALIDATION` | JSON, schema, campos ou chave inválidos |
| 403 | `ERR_PERMISSION` | Origem indevida/ausente ou honeypot; não revelar a proteção acionada |
| 404 | `ERR_NOT_FOUND` | Superfície fechada |
| 409 | `ERR_IDEMPOTENCY_CONFLICT` | Mesma chave, conteúdo diferente na janela do provedor |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Corpo acima do limite |
| 415 | `ERR_UNSUPPORTED_MEDIA_TYPE` | Tipo de conteúdo não aceito |
| 429 | `ERR_RATE_LIMITED`, `Retry-After` | Limite distribuído excedido |
| 503 | `ERR_UNAVAILABLE` | Configuração ausente/inválida, limitador indisponível, timeout ou envio sem aceite confirmado |
| 500 | `ERR_INTERNAL` | Erro inesperado; resposta genérica e log sanitizado |

Erros no schema `Error` existente (`code`, `message` pt-BR/i18n, `correlation_id`); validação de campo pode
acrescentar somente nomes/códigos, nunca valores. `Cache-Control: no-store`, correlação via `withRoute`.
BP1 atualiza OpenAPI e códigos/i18n antes do handler; nenhum contrato executável muda em BP0.

### 14.5 Envio, retry e estados

Adapter/port e não persistência seguem TECH-057; proteção em `platform` com bibliotecas Upstash do ADR-0004,
sem SDK de e-mail obrigatório. Assunto fixo, corpo texto simples e `Reply-To` somente com e-mail validado;
nenhum HTML fornecido pelo visitante ou URL acessada. Destinos/credenciais não vêm do client.

UUID imprevisível com namespace da aplicação/ambiente no provedor. Retry mantém chave e payload determinístico,
sem horário/correlação variável no e-mail; conflito não troca chave silenciosamente. Confirmar a janela documentada
do Resend no runbook da BP1: retries da mesma interação ficam nela; fora dela não há retry automático ou garantia
de deduplicação. Nova submissão é tentativa explícita. Timeout pode ocorrer após aceite remoto: informar envio
não confirmado, sem afirmar que não foi enviado; retry usa a mesma chave/conteúdo. Limitação do provedor → 503.

Não repassar input/erros brutos ao logger/`withRoute`. Permitir evento, resultado/código seguro, duração e correlação
validada; excluir campos, corpo, autenticação, IP, caixa e mensagem/stack contendo payload, conforme TECH-057/100.

Estados: inicial → validação → enviando → aceite confirmado ou erro. Botão “Enviar mensagem” impede concorrência
na interação; labels, indicação de obrigatório, `aria-describedby`, foco no primeiro erro, resumo acessível e
região viva. Falha preserva dados/chave só em memória; sucesso limpa campos/encerra tentativa. Feedback segue o
significado do REQ-028, sem prazo de resposta presumido. Exibir junto ao formulário o propósito literal do REQ-028;
informação de privacidade, responsáveis, acesso/retenção/descarte sujeitos à validação jurídica antes do go-live.

### 14.6 Configuração e segurança para publicação

BP1 documenta no runbook existente: `RESEND_API_KEY`, `BRAND_PARTNERS_CONTACT_FROM`, `BRAND_PARTNERS_CONTACT_TO`,
credenciais Upstash, segredo HMAC, domínio permitido e `BRAND_PARTNERS_SITE`. Secrets por TECH-057/100;
limites por origem/global, janelas, TTLs e timeouts positivos validados, definidos antes do go-live.
Local/CI usam adapters determinísticos e nunca enviam e-mail real; Preview usa destino de teste, sem credenciais/
destino de produção; fake recusado em produção. Reavaliar PII no Preview conforme D3 do roadmap, sem banco de
staging ou infraestrutura antecipada.

STRIDE mínimo, sem novo documento:

| Ameaça | Controle/contrato |
|---|---|
| Spoofing | Origem/IP confiáveis (§14.4); e-mail não prova representação (REQ-028) |
| Tampering | Schema, limites, texto simples e headers de envio controlados (§14.3–5) |
| Repudiation | Correlação/resultado seguros, sem evento econômico ou auditoria de domínio (TECH-057) |
| Information disclosure | Dados fora de logs/analytics/storage; secrets server-side; acesso/retenção (TECH-057/100, REQ-028) |
| Denial of service | Honeypot, corpo/tempo limitados, rate limit distribuído e falha fechada (§14.3–6) |
| Elevation of privilege | Envio não cria conta, grant, Brand Partner ou vínculo (REQ-028/TECH-057) |

**Proxy — somente na BP1:** restringir a exclusão atual de prefixo `brand` aos assets reais `/brand/logo/...`.
Páginas `/brand-partner/**` passam pelo proxy com CSP/nonce; preservar CSP própria dos logos. Testar ambas as
páginas e um asset real. Não incluir API JSON no matcher nem alterar Auth; sem CAPTCHA ou relaxamento de CSP.

### 14.7 Critérios de aceite BP1

| Área | Evidência |
|---|---|
| REQ-028/TECH-057 | Rotas/CTA/formulário; validação client/server; rejeição de campos extras e abuso; aceite confirmado; falhas, timeout ambíguo, replay/conflito e janela de retry; nenhuma persistência de contato ou payload/PII nos logs |
| Apresentação | Navegação B2B; teclado/foco/estados; axe 0 a 390/1440 px; sem overflow 320–1920 px; fluxo principal a 390 px com touch; SEO, CSP/nonce e branding preservados |
| Publicação | Copy/visual e P-LX-03 para afirmações abrangidas; domínio/remetente, caixa, secrets, proteção, acesso/retenção/privacidade validados; deploy por CI; smoke controlado com dados sintéticos recebidos na caixa corporativa |

Gates e sequência executiva pertencem à BP1 do roadmap. OpenAPI precede o handler; runbook precede go-live.
Esta seção não autoriza execução de BP1 nem declara cobertura implementada de REQ-028/029.

### 14.8 Implementação BP1 (2026-10-10)

Executa §14.1–14.7 e a **Copy + Especificação Visual FINAL** do fundador (congelada em 2026-10-10, `D-BP-14`), sem
redefinir REQ-028/TECH-057. Copy verbatim em
`src/features/catalog/presentation/i18n/brand-partners-pt-br.ts`; identificadores internos (H1–H9, C1–C6, funções 5P,
marcadores de bloco) não são renderizados.

| Tema | Decisão de implementação |
|---|---|
| Rotas | Grupo `src/app/(brand-partners)` com layout próprio; portão `BRAND_PARTNERS_SITE` no layout, em cada página e no `generateMetadata` (o Next renderiza layout, página e metadados em paralelo: fechado, o 404 não leva copy, props nem metadados da BP1 — E2E pelo corpo bruto); páginas em `catalog/presentation/brand-partners/`. `/Brand-Partner` sem uso/divulgação conhecido → sem redirect (§14.1 o condiciona ao uso) |
| Shell | `SiteShell` do Core com navegação B2B (Brand Partners · Como funciona · Contato → `/brand-partner#conversa`), header sólido, `MobileNav` Core; o menu passa a fechar ao ativar um link (âncora na própria página) |
| Imagem | Nenhum asset B2B autorizado: Hero tipográfico (fallback aprovado) e nenhuma seção com fotografia; nenhuma imagem B2C reutilizada |
| Core | Complementos genéricos em `styles/core/` (spec `design-system` §13 e uso em `docs/reference/design-system.md` §15): `lx-hero--typographic`, `lx-stack__pause`, `lx-stack--editorial`, `lx-siblings--trio`, `lx-section-note`, `lx-columns--aside`, `lx-anchors`; `strong` semibold em `lx-body`/`lx-subheadline` |
| SEO | `generateMetadata` por página: title/description da copy aprovada, canonical relativo (base da plataforma), Open Graph/Twitter sem imagem; `noindex, nofollow` fora de Production; sem dados estruturados |
| Endpoint | `POST /v1/brand-partner-contacts` (OpenAPI `createBrandPartnerContact`); ordem: portão/configuração → `Origin` exata (`BRAND_PARTNERS_ALLOWED_ORIGINS`) → JSON UTF-8 (415) → corpo ≤ 32 KiB contado em stream (413) → limitador → JSON/schema/chave (400) → honeypot (403) → Resend. Novos códigos `ERR_PAYLOAD_TOO_LARGE`, `ERR_UNSUPPORTED_MEDIA_TYPE`, `ERR_RATE_LIMITED` |
| Limitador | `platform`: `@upstash/ratelimit` 2.2.0 + `@upstash/redis` 1.39.0 (ADR-0004), janela deslizante (TTL pelo PEXPIRE do script), sem analytics/telemetria/cache local; timeout próprio que **recusa** (o da biblioteca deixaria passar). Origem de rede = `x-real-ip` da Vercel, canônica (IPv4; IPv4 mapeado → IPv4; IPv6 reduzido ao /64), HMAC-SHA256 com `BRAND_PARTNERS_CONTACT_HMAC_SECRET`; fora da Vercel, uma origem única `local` |
| Envio | `catalog`: port `ContactMailer` + adapter HTTP do Resend (sem SDK), `Idempotency-Key` = `luxtory:brand-partner-contact:<ambiente>:<uuid>`, assunto fixo, texto simples determinístico, `reply_to` = e-mail validado. 409 `invalid_idempotent_request` → `ERR_IDEMPOTENCY_CONFLICT`; 409 concorrente, 429, 4xx/5xx, rede e timeout → `ERR_UNAVAILABLE` |
| Local/CI | `BRAND_PARTNERS_CONTACT_MODE=fake`: envio (idempotência emulada, só impressões digitais SHA-256) e limitador em memória; recusado quando `VERCEL_ENV` existe — Preview sem configuração real falha fechado (503) |
| Formulário | Cliente com o mesmo schema Zod; chave UUID por tentativa lógica (mesmo conteúdo = mesma chave; conteúdo novo ou conflito = tentativa nova, só por ação explícita); durante o envio, campos `readOnly` e botão `disabled` (o resultado vale só para o conteúdo enviado; o foco volta ao botão no fim); estados acessíveis; nada em URL, cookie ou storage |
| Logs | Uma linha por request: `event`, `stage`, `status`, `duration_ms` e `reason` de conjunto fechado (nomes de chave de configuração, motivo do provedor/limitador, nome do erro); nunca campos, corpo, IP, chave ou resposta do provedor |

Configuração e go-live: [runbook](../how-to/operacao.md#preparar-a-bp1-brand-partners-público) e
[catálogo de ambiente](../reference/environment.md). **Pendência externa:** Resend (domínio/remetente e caixa de
teste) + Upstash do Preview, configurados pelo fundador diretamente no ambiente.

### 14.9 BP1.1 — Brand Partners Communication Upgrade (2026-10-12)

Executa o Decision & Approval Pack aprovado pelo fundador em 2026-10-12 (D1–D7) e os dois ajustes editoriais da mesma
aprovação, sem redefinir REQ-028/TECH-057: copy `D-BP-15`, nomenclatura `D-BP-16`, Framework de 2026-10-12
([ADR-0016](../adr/0016-framework-brand-partners-versao-2026-10-12.md)). A BP1 (§14.8) fica no Git e no registro
(`D-BP-14`, substituída). **Não mudam:** rotas, portão `BRAND_PARTNERS_SITE`, contrato e estados do formulário,
endpoint, OpenAPI, Resend, Upstash, proteções, B2C e BP2 (fora de escopo).

**Copy.** Verbatim em `src/features/catalog/presentation/i18n/brand-partners-pt-br.ts`. Ajustes de 2026-10-12:

- **Valor bilateral no Hero:** para quem se identifica com a marca, viver o lazer com patrimônio, liberdade e
  pertencimento, em um lugar que expressa sua identidade e seu lifestyle `[FW-BP: §2]` — sem sugerir que todo Titular
  possui diretamente a Second Home (no Co-Owner, a pessoa possui uma Ação, BR-373); para a marca, transformar o que ela
  representa em Brand Experience e participar dos momentos que importam na vida das pessoas `[FW-BP: §8 P1]`.
- **Luxtory Club como modelo previsto:** R3 não está operacional, então Luxtory Club, Membership, Luxchange e Luxplus
  aparecem sempre como "o modelo prevê"/"quando disponível", com Membership, elegibilidade, disponibilidade, inventário
  e regras aplicáveis (BR-146, BR-161, BR-190, BR-240). Nenhum texto permite ler que já podem ser usados.
- **Ajustes do Checkpoint 1 (fundador, 2026-10-12):** a precisão do Hero acima; na escada da marca, "Em uma
  experiência — A marca é sentida."; "Decisões e remuneração" com seis decisões (alteração de elementos essenciais fica
  em Governança e replicação em Condições e expansão), sem accordion.
- **Auditoria de concisão (gate editorial pré-merge, fundador, 2026-10-12):** cada bloco de texto busca até 3 linhas
  visuais e usa 4 só quando reduzir mais prejudicaria contexto, precisão ou segurança da informação. Medida a 390, 768
  e 1440 px em todo `p`, `li` e título de item do `<main>` das duas páginas (altura ÷ line-height, fontes carregadas):
  antes, 25 blocos acima de 4 linhas (até 7); depois, nenhum. Só divisões na fronteira das frases — no i18n, a lista
  de strings é o bloco dividido, um `<p>` por item —, sem corte de conteúdo, claim, condição ou ressalva. Diff palavra
  a palavra: 12 pontos de divisão, com pontuação e maiúscula ajustadas e três conexões mínimas ("um universo próprio
  e uma comunidade… / E com interesse…", "O Home Concept tem especificação suficiente…", "…desses momentos. / E isso
  pode abrir…"). No Club, cada frase traz "o modelo prevê"/"quando disponível" ou vem depois dessa marca no mesmo
  bloco, nunca antes (teste de copy). Repetições entre seções ficam (licenciamento × governança; "do zero" no percurso
  × condições): cada resposta precisa estar correta lida sozinha, inclusive pela âncora.
  - **Exceções acima de 4 linhas:** nenhuma.
  - **Mantidos com 4 linhas** (frase única; dividir separaria a definição, a condição ou a paridade do que ela
    qualifica): Hero, os dois parágrafos do valor bilateral (só a 390); definições — Home Concept (`proposta`;
    percurso 02) e Home Edition (`como-acontece` 03; percurso 04); condições — "Um Home Concept pode originar…" (768),
    Design & Build, Pertencimento, Liberdade (Luxtory Club), percurso 07 (Luxtory Club), remuneração, não conformidade,
    encerramento (duas frases), "E para a marca?", parceiros locais e a introdução do Club; paridade Owner | Co-Owner
    em Patrimônio (REQ-103); enumerações — introdução de "Para quem vive", cadeia da marca e o critério "querem
    ampliar…" (768).
- **Fora da copy:** cross-brand (`H-BP-09`), ativação pela capacidade da Luxtory (BR-121, `H-BP-10`) e monetização
  opcional (`P-BP-04`).
- **Refinamento comercial pós-merge (fundador, 2026-10-13; `D-BP-20`).** Copy verbatim do fundador, sem nova ressalva
  nem linguagem defensiva (`D-BP-19`):
  - **O dilema da expansão:** o antagonista passa a ser a lacuna da Brand Experience — formatos que aproximam pessoas
    da marca, poucas soluções que participam do lazer com profundidade para criar conexões emocionais e memoráveis —,
    nas mesmas duas perspectivas ("O que já existe" × "O espaço em aberto"). A seção não nomeia Branded Second Home,
    Home Concept nem a Luxtory: Hero → lacuna de mercado → promessa (teste de copy).
  - **Uma nova lógica:** a resposta à tensão, com a nova headline e a sequência "receber · paisagem · materiais,
    rituais e detalhes"; a primeira seção que nomeia **Branded Second Home** e **Home Concept**.
  - **Para a sua marca:** sem a nota de limite ("O modelo cria as condições…"), sem substituto; a ausência de garantia
    segue no fechamento fotográfico e no Como funciona (J-32, J-33).
  - **Luxchange:** converter dias elegíveis da Second Home em créditos para se hospedar em outras residências da rede.
    Sem "créditos equivalentes" — os Créditos vêm do PRL (BR-201) — e sem "dias do Direito de Uso", que é só do
    Co-Owner (o Club atende Owner e Co-Owner). A abertura e o fechamento da seção já enquadram o Club como modelo
    previsto; o mecanismo não repete a ressalva (o teste de copy lê a seção como um bloco).
  - **Concisão (medida a 390, 768 e 1440 px):** a 768 e 1440 px nenhum bloco novo passa de 4 linhas. Exceções a 390 px,
    frases únicas do texto do fundador (dividir mudaria a copy): "O mercado ainda oferece poucas soluções…" (5 linhas)
    e "A Luxtory traduz o Brand DNA em um Home Concept…" (5 linhas).
  - **Composição:** em "Para quem vive", a frase de abertura sobe para cima dos pilares; o diagrama de solução tem, do
    `lg` em diante, o tamanho renderizado na Home B2C a 1440 px (437 × 490 px, proporção 667 × 748 preservada), o topo
    alinhado ao 01 · Patrimônio e os três pilares ao lado, no ritmo de item dos Sibling Blocks — a 1440 px, o conjunto
    01–03 mede 514 px para os 490 px do diagrama. A 390 e 768 px, a mesma leitura empilhada de antes (texto → diagrama,
    com o tamanho do B2C). Entre 1024 e 1279 px e a 1920 px, o diagrama B2C varia com a altura do texto ao lado (416 a
    437 px de largura; 360 px a 1920) e o Brand Partners mantém 437 px.
  - **Cor dos títulos:** títulos abaixo da headline de seção no papel de headline da superfície, nunca na cor do corpo
    sobre Blue e Deep — Warm Sand sobre Deep (5,57:1); sobre Moroccan Blue, abaixo de 24 px, Warm Sand com 10% do
    branco do corpo (4,69:1; o Warm Sand puro mede 4,32:1) e, a partir de 1280 px, o `lx-display-s` (24 px, texto
    grande) no Warm Sand; Moroccan Blue sobre White. Sobre Warm Sand, o Design System já define headline e corpo em
    Dark Moroccan Blue (o Moroccan Blue sobre Warm Sand mede 4,32:1). Tamanhos inalterados.

**Home `/brand-partner`** (PICTURE → PROBLEM → PROMISE → PROOF → PUSH):

| `id` | Função | Composição Core | Mídia |
|---|---|---|---|
| `inicio` | PICTURE, valor bilateral | Cinematic Hero `lx-hero--uniform` sob header sobreposto | M1 |
| `expansao` | PROBLEM | `blue`: `lx-section-head` + `lx-comparison--divided` + `lx-section-closing` | — |
| `proposta` | PROMISE | `sand`: Editorial Split `lx-split--wide-text` + `lx-editorial-list` | M3 |
| `para-a-marca` | PROMISE → PROOF, tese da marca | `deep`: escada `lx-steps--four`, cadeia em `lx-section-closing`, possibilidades `lx-siblings--pair`, mecanismos `lx-siblings--trio` (o limite `lx-section-note` saiu em `D-BP-20`) | — |
| `para-quem-vive` | PROOF, valor para quem vive | `blue`: Split `--media-start --wide-media` + frase de abertura + `lx-diagram--reference` (pilares `lx-diagram__item` × diagrama de solução no tamanho da Home B2C; até `D-BP-20`, `lx-diagram--even`) + fechamento | M2 + diagrama |
| `como-acontece` | PROOF, mecanismo e papéis | `white`: `lx-numbered` 01–06 + link `/brand-partner/como-funciona#percurso` | — |
| `governanca` | PROOF, risco | `sand`: `lx-answers` + link `/brand-partner/como-funciona#governanca` | — |
| `sua-marca` | PUSH | Cinematic `lx-hero--closing --uniform`; CTA → `#conversa` | M5 |
| `conversa` | PUSH, formulário | `wash`: `lx-columns--aside` + formulário de §14.3–14.5 | — |

**Como funciona `/brand-partner/como-funciona`** (PROOF → PUSH): `abertura` (Cinematic `--uniform`, M4, índice
`lx-anchors` com sete âncoras) → `percurso` (`white`, `lx-answers--phases`: três fases, sete passos `lx-numbered`,
Owner | Co-Owner com o mesmo peso) → `decisoes-remuneracao` (`sand`, `lx-answers` decisão → quem + licenciamento e
remuneração) → `governanca` (`blue`, seis perguntas) → `luxtory-club` (`deep`, `lx-numbered` + pergunta da marca +
limite) → `condicoes-expansao` (`white`, três perguntas) → `para-quem` (`sand`, `lx-comparison--divided`) →
`proximo-passo` (`blue`, `lx-section-closing`; CTA → `/brand-partner#conversa`).

**Navegação (D4).** Header sobreposto à fotografia nas duas páginas. Do `lg` em diante: nav visível alinhada ao fim
(Brand Partners, Como funciona) e Contato como ação da navegação (`lx-button--secondary`, → `#conversa`). Abaixo do
`lg`: o menu Core (`MobileNav`), aberto pelo ícone oficial. Rodapé com os três destinos. Só destinos Brand Partners.

**Mídia (D5, `P-BP-03`).** Manifesto único `brand-partners/media-manifest.ts` (renderizado por `media.tsx`): cada lugar M1–M5 é um ativo aprovado ou `null`.
Com `null`, a página mostra um placeholder estrutural identificado (`lx-media-placeholder`, rótulo em
`media.placeholders`), renderizado dentro da página protegida pelo portão — nenhum arquivo público de placeholder. A
troca pelo ativo aprovado muda só a entrada do manifesto (arquivo em `public/images/brand-partners/`, ≤ 300 KB por
variante, recorte `lx-crop-*`, contraste medido sob o scrim). **Aceite visual final e go-live exigem o manifesto sem
nenhum `null`.** No celular, o Cinematic Hero do Core põe a fotografia acima do texto. Com o M1 aprovado, testar o Hero
com e sem o lead da cena ("Amigos ao redor da mesa…") e recomendar a versão mais forte visualmente.

| Ativo | Função | Cena | Proporção |
|---|---|---|---|
| M1 "A mesa posta" | Hero da Home | Mesa longa numa varanda aberta para a paisagem, família e amigos, gesto de receber; sujeito no terço direito, área negativa à esquerda; fim de tarde | 16:9, ≥ 2400 px |
| M2 "Momentos" | Para quem vive | Um momento por imagem (família descansando ao fim da manhã), interação sem pose | 3:2 (5:4 no celular) |
| M3 "Códigos" | Promise | Natureza-morta arquitetônica: mesa preparada, soleira para a paisagem, junção de madeira e pedra | 4:5 |
| M4 "Ateliê" | Abertura do Como funciona | Maquete volumétrica branca, amostras de materiais, croquis, mãos sem rosto | 16:9 |
| M5 "Fim de tarde" | PUSH | Terraço ao entardecer, conversa calma, casa iluminada ao fundo | 16:9 |

Regras de todos: série única de direção de arte; nenhum logotipo, produto, cor proprietária, residência real ou
anteprojeto Luxtory; nada que pareça case ou Brand Partner real; proveniência e direitos registrados (imagem sintética
declarada); stock genérico não é aceito automaticamente. M6 (OG): tipográfico com o logo oficial, 1200 × 630.

**Fotografias provisórias do B2C (`D-BP-17`, fundador, 2026-10-12).** Para o aceite visual da BP1.1, sem esperar o
ensaio próprio, M1–M5 reutilizam as fotografias que o B2C já publica, nos mesmos caminhos (nenhum arquivo novo em
`public/`), decorativas (`alt=""`) como no B2C. Proveniência herdada, sem direito ou licença além do registrado:
repositório Luxtory2.0, "provisórias: autorizadas para o site como referência visual, sem autorização definitiva de
produção registrada" (§13.10; `problema-imovel.jpg` autorizada como asset provisório em 2026-10-07, §13.11). O ensaio
próprio (`P-BP-03`) segue aberto e troca só as entradas do manifesto.

| Lugar | Fotografia | Recorte | Leitura do brief |
|---|---|---|---|
| M1 Hero da Home | `home/hero/hero-lifestyle.jpg` (1344 × 768) | `x-80`, `md-x-20` (o do Hero do Como funciona B2C) | família reunida ao entardecer, sujeito à direita, área livre à esquerda; sem mesa |
| M3 Promise | `como-funciona/problema-imovel.jpg` (1024 × 576) | `x-35` | arquitetura, materiais e paisagem; sem natureza-morta |
| M2 Para quem vive | `home/hero/home-solucao-firepit-family.jpg` (1376 × 768) | `x-65` | um momento em família, sem pose |
| M5 PUSH | `home/hero/luxury-property-facade-hero.jpg` (1672 × 941) | `x-65`, `lg-x-50` | terraço ao entardecer, casa iluminada; sem pessoas |
| M4 Como funciona | a mesma de M5 | `x-65`, `lg-x-50` | sem correspondente no B2C para "Ateliê"; a arquitetura ao entardecer |

- **Fora:** as três fotografias Kaizen (K05, K07, K09) vêm do anteprojeto Luxtory, que o brief exclui ("residência
  real ou anteprojeto Luxtory", "nada que pareça case"). A K05 (suíte, madeira e pedra, soleira para o jardim) seria
  o melhor M3; só entra por decisão expressa do fundador.
- **Sinalizações:** resolução abaixo do brief (≥ 2400 px) em todas, como no B2C; M4 repete a fotografia de M5 (páginas
  diferentes); `luxury-property-facade-hero.jpg` tem 309 KB, acima dos 300 KB do brief para arquivos próprios
  (reutilizada sem cópia). Sobre o Hero de M1, testados com e sem o lead "Amigos ao redor da mesa…" (a fotografia não
  mostra mesa): recomendação a decidir pelo fundador, copy inalterada.
- **Medido (Chromium, 390/768/1024/1440 px):** recorte sem rosto sob o texto no Hero; contraste nos pixels sob o scrim
  uniforme — headlines Warm Sand ≥ 3,09:1, subtítulos e corpo ≥ 6,52:1, eyebrows (branco 80 %) ≥ 5,08:1, âncoras do
  índice ≥ 6,84:1 (E2E `[WCAG 1.4.3]` a 768 e 1440 px); axe 0, sem overflow de 320 a 1920 px, nenhuma imagem quebrada;
  com o portão fechado, nada da BP1.1 no corpo (o atributo `data-media-slot` é marcador da prova).

**Ajustes do aceite visual (fundador, 2026-10-12; `D-BP-18`).** (1) O Hero da Home perde o lead da cena ("Amigos ao
redor da mesa…"): mais limpo, menos denso no celular, e a fotografia M1 não mostra mesa; os demais textos do Hero não
mudam. (2) Paridade tipográfica B2C → Brand Partners: para o mesmo papel de texto, o B2C é a referência — sem mudar
token, escala global nem o B2C, e reutilizando os papéis do Core:

| Papel | B2C (referência) | Antes na BP | Ajuste |
|---|---|---|---|
| H1 do Hero da Home | `lx-home-hero__title`: 35,1 / 28 / 39,6 px, entrelinha 1,02 | `lx-headline`: 28 / 36,1 / 48 px | `lx-headline--home-hero` (opt-in do Core com a mesma escala) |
| CTA do Hero da Home | primário 13 px | primário `large` 16 px | sem `large` |
| CTA sobre o fechamento fotográfico | `large` 16 px | primário 13 px | `large` |
| Owner \| Co-Owner (comparação) | `lx-eyebrow` 12 px | `lx-title` 18–20 px | `lx-eyebrow` |
| Rótulo de fase (`lx-answers--phases`) | `lx-eyebrow` 12 px | `lx-subheadline` 18–23,8 px | `lx-eyebrow` |

Já em paridade (sem mudança): H1 do Hero do Como funciona, H2, `lx-display-m`, `lx-display-s`, pergunta das respostas,
subheadline, corpo, eyebrow, afirmação do fechamento, lista editorial, índice do Hero (nome do capítulo × âncora) e
links de ação. O texto de apoio do Hero da Home são dois parágrafos de corpo (o B2C tem um lead único): papel de corpo,
mantido. A E2E `[ADR-0003]` compara os tamanhos computados B2C × BP por papel a 390, 768 e 1440 px.

**Core (genérico, opt-in, sem efeito no B2C).** `SiteShell`: `navAlign="end"` (`lx-header--nav-end`), item de
navegação com `action` (botão secundário no header, link no menu e no rodapé) e `menuTrigger="mark"` (ícone oficial
no gatilho do menu também no modo não retrátil). CSS: `lx-steps--four` (1 → 2 → 4 colunas) e `lx-media-placeholder`.
Da auditoria de concisão: dentro da coluna de texto de `lx-numbered`, `lx-comparison` fica empilhada em toda largura
(a 1440 px o par Owner | Co-Owner lado a lado deixava 163 px por lado: 4 e 6 linhas para 45 e 101 caracteres). Do
refinamento pós-merge (`D-BP-20`): `SiteShell titleRole="headline"` (`main.lx-titles-headline`: títulos no papel de
headline da superfície) e `lx-diagram--reference` com `lx-diagram__item` (diagrama no tamanho de referência da Home B2C,
topo no primeiro bloco). Uso em [`docs/reference/design-system.md`](../reference/design-system.md) §15.

**Checkpoints.** (1) Visual/editorial antes do merge: Home e Como funciona completas, header/menu e formulário a 390,
768 e 1440 px, placeholders identificados, nenhuma copy fora do Approval Pack e dos ajustes. (2) Técnico, depois do
aceite visual: gates completos (DS, unitários, comunicação/terminologia, E2E, acessibilidade, regressão B2C) e prova
de que, com `BRAND_PARTNERS_SITE` fechado, nada da BP1.1 vaza em HTML, RSC ou metadados. (3) Editorial antes do
merge: a auditoria de concisão acima. (4) **Encerramento (2026-10-12): implementação concluída** — aceite visual
final do fundador, diretriz `D-BP-19` (o site é comercial; segurança jurídica por progressive disclosure, sem camada
jurídica visual). (5) **Refinamento pós-merge (`D-BP-20`, 2026-10-13):** em revisão no Preview, sem merge até o
aceite visual final do fundador. **Go-live:** P-LX-03,
ativos aprovados (`P-BP-03`) e autorização expressa do fundador; CI verde não autoriza merge nem go-live.
