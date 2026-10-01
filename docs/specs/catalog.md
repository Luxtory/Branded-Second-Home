# Spec: catalog

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `catalog` do TECH-011 (`src/features/catalog/`). Esta versão cobre a W3 (Catálogo + Admin); a W4 acrescenta a
leitura pública (Discovery), a W8 a configuração da Residence, a trava da estrutura e a alteração de modalidade da
Edition, e a W29 a conformidade (REQ-021, BR-020). Decisões: [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md).
A leitura pública da W4 (Discovery B2C) está na [§13](#13-discovery-público-b2c-w4); decisões técnicas em
[ADR-0014](../adr/0014-discovery-publico-leitura-anonima-csp-e-publicacao.md).

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
