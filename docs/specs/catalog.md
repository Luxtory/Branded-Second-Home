# Spec: catalog

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `catalog` do TECH-011 (`src/features/catalog/`). Esta versão cobre a W3 (Catálogo + Admin); a W4 acrescenta a
leitura pública (Discovery), a W8 a configuração da Residence, a trava da estrutura e a alteração de modalidade da
Edition, e a W29 a conformidade (REQ-021, BR-020). Decisões: [ADR-0010](../adr/0010-catalogo-versoes-e-mutacoes-do-admin.md).
A leitura pública da W4 (Discovery) está na [§13](#13-discovery-público-w4); decisões em
[ADR-0012](../adr/0012-discovery-publico-leitura-anonima-csp-e-publicacao.md).

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
- W4 (§13): `01` §1–§2, §8, §8.1, BR-002, BR-005, BR-017, BR-019, BR-031, BR-051…054, BR-063, BR-071…076, BR-082,
  BR-100…104, BR-111, BR-130, BR-143, BR-144, BR-146…148, BR-190, BR-192, BR-300, BR-301; `02` §2, REQ-103; ADR-0011,
  ADR-0012, [`communication`](communication.md).

## 13. Discovery público (W4)

Superfície **Discovery** do `02` §2 ("Concepts, Editions e ofertas") para o Protagonista B2C, pelo mapa de jornada
aprovado (`D-B2C-09` em [`communication/b2c.md`](communication/b2c.md#7-jornada-e-5ps-mestre-6)). Contrato da camada de
comunicação: [`communication.md`](communication.md). Decisões de arquitetura:
[ADR-0012](../adr/0012-discovery-publico-leitura-anonima-csp-e-publicacao.md). Donos: REQ-100, REQ-101.

### 13.1 Escopo e decisões (aprovadas pela Luxtory em 2026-09-29)

| Página | Rota | Dados |
|---|---|---|
| Home | `/` | estática |
| Como funciona | `/como-funciona` | estática |
| Coleção | `/colecao` | catálogo, lido como `anon` |
| Concept (com as Editions e a oferta, quando existirem) | `/colecao/[conceptId]` | catálogo, lido como `anon` |

Fora da W4: página e formulário de Interesse (W6, P-3), jornada Brand Partners (`P-BP-01`), página própria de Edition,
fotografia (P-1), robots/sitemap e go-live.

| # | Decisão |
|---|---|
| D-W4-01 | As quatro páginas acima; a Edition e a oferta aparecem na página do Concept (mapa D-B2C-09), sem página própria. Home e Como funciona são conteúdo do Discovery, não funcionalidade nova |
| D-W4-02 | **Visibilidade** de um Concept: versão aprovada **e** autorização de exposição da marca registrada (BR-015, P-8) **e** instante anterior à eficácia do encerramento (BR-021). O crédito da marca aparece em todo Concept público. Depois da eficácia do encerramento o Concept sai da Coleção e a URL responde 404 — **limitação temporária, fechada para falhas**, do mesmo tipo da D-W3-4 (§7): **não redefine BR-021, BR-022 nem BR-023**. Quando os direitos sobreviventes forem modelados como dado, a visibilidade passa a respeitá-los |
| D-W4-03 | **Menor conteúdo público necessário**, sem mudança de modelo: título do Concept, especificação da versão vigente (como registrada), região, modalidade e condições comerciais de cada Edition (como registradas) e nome da marca. `essential_elements` e `preservation_premises` **não** são publicados: a página afirma o fato (BR-014, BR-301) sem expor as listas; ampliar isso exige o brief demonstrar necessidade. Nunca públicos: número da versão, `approval_refs`, datas e autores de aprovação, Residences, autorizações de Investor, referências de instrumento e de autorização. No Admin, todo campo publicado literalmente é identificado como conteúdo público (§13.5) |
| D-W4-04 | URL `/colecao/<uuid do Concept>`; Coleção na ordem de registro do Concept. Resumo editorial, slug legível e ordem editorial: pendências antes do go-live (§13.8) |
| D-W4-05 | **Portão de publicação**: em Production as rotas públicas respondem 404 até a decisão de go-live (P-LX-03, D1, D5c); abertas em local, CI e Preview. `PUBLIC_SITE=open` abre em Production. O portão também vale para os dados: nenhuma rota externa ao Next.js expõe o catálogo (§13.3) |
| D-W4-06 | CSP com nonce por requisição no `proxy.ts` para toda página HTML (públicas, `/entrar`, `/admin`); toda página HTML é renderizada por requisição |
| D-W4-07 | Sem cache: Coleção e Concept leem a cada requisição (aprovação e eficácia do encerramento valem na hora) |
| D-W4-08 | Navegação B2C: cabeçalho (logo → Home, Coleção, Como funciona; sem CTA), menu do celular (`dialog`), rodapé (logo e os mesmos links). Nenhum link para `/entrar`, Admin ou Brand Partners (D-LX-01); sem linha jurídica até os textos da Luxtory |
| D-W4-09 | Todo Frame é tipográfico (P-1); Courier só com metadado real (regiões das Editions); nenhum aviso público de "aguardando fotografia" |
| D-W4-10 | "Manifestar interesse" (BR-050, BR-060, BR-065) — CTA e explicação — entra na W6 com o formulário (D-B2C-10) |

### 13.2 Leitura pública: contrato de dados

- **Papel:** a página lê numa transação só de leitura em que `luxtory_app` vira `anon` (`SET LOCAL ROLE anon`), como a
  leitura de usuário do ADR-0006 §6 (`authenticated`). Nenhuma claim; nenhuma escrita; nenhum `admin_read` (leitura
  pública não é leitura administrativa).
- **Grants por coluna** (menor privilégio — o banco recusa qualquer outra coluna):

  | Tabela | Colunas para `anon` |
  |---|---|
  | `brand_partner` | `id`, `brand_name` |
  | `concept` | `id`, `brand_partner_id`, `title`, `created_at` |
  | `concept_version` | `id`, `concept_id`, `version`, `state`, `specification` |
  | `edition` | `id`, `concept_id`, `region`, `modality`, `commercial_conditions`, `created_at` |

  `version` e `state` servem só para escolher a versão vigente; não são exibidos. `residence`, `investor_authorization`,
  `operation`, `audit_log` e as demais tabelas de `app`: nenhum acesso.
- **Visibilidade = RLS** (fonte única; a consulta não repete a regra): políticas `FOR SELECT TO anon` sobre os
  predicados `app.brand_partner_is_public(id)` (autorização de exposição registrada e sem encerramento eficaz em
  `now()`) e `app.concept_is_public(id)` (Brand Partner pública e ao menos uma versão aprovada). Versões: só
  `approved` de Concept público. Editions: só de Concept público. Os predicados são `SECURITY DEFINER`, `STABLE`,
  `search_path = ''`, devolvem só booleano e têm `EXECUTE` só para `anon` — sem eles as políticas de `concept` e
  `concept_version` se referenciariam em recursão.
- **Versão vigente** = a aprovada de maior número (mesma regra da §5). Mudança de versão aprovada aparece na próxima
  requisição.
- **Visões** (`application/public-views.ts`): `PublicConceptCard` (id, título, marca, regiões das Editions) e
  `PublicConcept` (id, título, marca, especificação, Editions com região, modalidade e condições). Nenhum campo
  numérico, nenhum preço calculado (ADR-001 do `03`).

### 13.3 Portão e exposição externa

- `PUBLIC_SITE` ausente em Production → o layout do grupo público responde 404 (a página 404 da plataforma, sem o
  cabeçalho público). Fora de Production (local, CI, Preview) as páginas abrem. Qualquer valor diferente de `open` é
  recusado pela validação de ambiente.
- **Exposição fora do Next.js** (verificado em 2026-09-29, só leitura): a Data API do Supabase está desligada — o
  PostgREST registra `db-schemas=pg_pgrst_no_exposed_schemas` e responde `PGRST002` a qualquer rota (`/rest/v1/…`
  com `Accept-Profile: app`, `/graphql/v1`); `pg_graphql` não está instalado; `anon`, `authenticated`, `authenticator`
  e `service_role` não têm `USAGE` em `app`. Depois da W4, `anon` passa a ter `USAGE` e os grants por coluna — só
  alcançáveis por quem já é `luxtory_app` (a senha do papel só existe no servidor). **Religar a Data API ou incluir
  `app` nos Exposed schemas passa a ser proibido** (runbook `docs/how-to/operacao.md` e ADR-0012); a verificação é
  repetida depois do `migrate` da W4.

### 13.4 Briefs de página

Comum às quatro páginas: jornada B2C, Protagonista B2C ([`b2c.md`](communication/b2c.md) §1 — Owner e Co-Owner são
modalidades do mesmo Protagonista); Mentor, tom-base e guardrails de [`luxtory.md`](communication/luxtory.md) §2–§4 com
a modulação de [`b2c.md`](communication/b2c.md) §8; nomenclatura pública `D-LX-06` (termo canônico explicado na primeira
menção da página); copy no i18n do slice (`presentation/i18n/discovery-pt-br.ts`). Nenhuma prova externa (`P-LX-01`),
nenhuma fotografia (`P-LX-02`), nenhum número além dos canônicos citados, nenhuma hipótese `H-B2C-*` afirmada como fato.
Peso = emoção · explicação · evidência, em proporção aproximada.

#### Home — `/`

1. **Jornada:** mapa `D-B2C-09`, linha "Home".
2. **Função:** apresentar a categoria e despertar o desejo. **Conscientização:** não conhece a categoria Branded Second
   Home nem o modelo (`H-B2C-06`, só orienta) → entende a proposta e quer ver casas.
3. **5Ps:** arco completo; **PICTURE = Hero** (Opening Frame); a progressão seguinte parte de PROBLEM.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia) | Fatos e decisões | Peso | Intenção de layout (DS) |
   |---|---|---|---|---|---|---|
   | Hero | PICTURE | "Como seria?" | uma segunda casa com a identidade de uma marca que você admira, vivida nos dias fora da rotina; nomeia e explica Branded Second Home | D-B2C-01, D-B2C-05, D-LX-06, `01` §1 | 70·30·0 | Opening Frame, Frame tipográfico `night`; `lx-display-xl` com no máximo uma virada em itálico; `lx-lead`; ação primária + link; sem marker (não há metadado real) |
   | O problema | PROBLEM | "Por que isso é difícil hoje?" | o imóvel genérico não entrega identidade; fazer sozinho — escolher, projetar, construir, mobiliar e manter — pesa antes e depois da compra | D-B2C-02, D-B2C-06, D-B2C-07, D-LX-07 | 50·50·0 | Scene `--statement` em `paper`; texto curto, sem imagem |
   | Outra lógica | PROMISE | "Existe outra forma?" | a identidade vem antes da casa: a marca vira um Residence Concept; o Concept vira uma casa construída do zero e fiel a ele; duas formas de ter | D-B2C-03; `01` §1; BR-003, BR-013, BR-053, BR-301, BR-005 | 20·70·10 | Scene em `wash`; três blocos curtos em sequência |
   | Duas formas de ter | PROOF (breve) | "Qual forma combina comigo?" | Owner: a casa inteira, com espaço para o seu toque; Co-Owner: uma Ação da SPE proprietária com Direito de Uso anual, administração profissional e despesas rateadas | BR-052, BR-017, BR-130; BR-373, `01` §8, BR-071, BR-072, BR-073; REQ-103 | 0·40·60 | `lx-pair` na ordem Owner → Co-Owner, mesmo nível de título e mesma extensão; link para Como funciona |
   | Para quem | PUSH | "Isso faz sentido para mim?" | faz sentido para quem quer uma casa nova nascida de um Concept, aceitando seus elementos essenciais; pode não fazer sentido para quem quer reformar um imóvel existente ou busca retorno garantido | `b2c.md` §7 (PUSH): BR-014, BR-017, BR-053, BR-054, BR-374 | 10·60·30 | `lx-pair` (faz sentido · pode não fazer sentido); ação primária |

5. **CTA:** "Conhecer a Coleção" → `/colecao` (principal); "Entender como funciona" → `/como-funciona`. Ambos existem.
6. **Dados dinâmicos:** nenhum.
7. **Não afirmar:** perfil, alternativas, objeções, crenças e ênfases por modalidade (`H-B2C-01…09`); Luxtory Club
   (fica no Como funciona, `D-B2C-11`); qualquer número.
8. **Aceite:** checklist da §10 do contrato; Owner e Co-Owner com a mesma estrutura (`[REQ-103]`).

#### Como funciona — `/como-funciona`

1. **Jornada:** mapa `D-B2C-09`, linha "Como funciona".
2. **Função:** explicar o modelo e as modalidades. **Conscientização:** quer entender → entende mecanismo, condições e
   limites, e qual modalidade lhe serve.
3. **5Ps:** PROMISE breve → PROOF → PUSH. PICTURE e PROBLEM ficam na Home (Mestre §9, regra 8: a página não reconstrói o
   arco). Transparência proporcional ao impacto: condições e limites na mesma frase do benefício.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia) | Fatos e decisões | Peso | Intenção de layout (DS) |
   |---|---|---|---|---|---|---|
   | Abertura | PROMISE | "Qual é a lógica?" | a identidade de uma marca vira um Residence Concept; o Concept vira uma casa construída do zero; você a tem por inteiro ou em copropriedade | `01` §1, BR-003, BR-005 | 20·80·0 | cabeçalho de página em `paper`, `h1` + `lx-lead` |
   | Da marca à casa | PROOF | "O que acontece entre a marca e a casa pronta?" | Brand Partner (identidade) → Residence Concept (tradução replicável, com elementos essenciais e premissas de preservação) → Residence Edition (lançamento numa região, com condições comerciais) → Design & Build (fiel ao Concept) → Residence (construída do zero; sem reforma de imóvel existente) | `01` §1–§2, BR-002, BR-013, BR-014, BR-031, BR-053, BR-054, BR-300, BR-301 | 0·70·30 | lista ordenada numa Scene |
   | Duas formas de ter | PROOF | "Qual modalidade me serve?" | Owner e Co-Owner nas mesmas dimensões — o que se tem, uso, administração, personalização | BR-005, BR-051, BR-052, BR-130, BR-148, BR-017; BR-373, `01` §8, BR-071, BR-074, BR-072, BR-073, BR-019; REQ-103, BR-376 | 0·40·60 | `lx-pair` (Owner → Co-Owner) com as mesmas linhas nas duas colunas |
   | O uso no Co-Owner | PROOF | "Como funciona o uso ao longo do ano?" | uma de quatro configurações, definida pela Luxtory conforme a demanda; exercício no ano civil, sem acúmulo; limites por temporada que não se compensam; ordem de abertura por sorteio auditável e rotativa; a primeira janela é vantagem de tempo, não exclusividade; até 14 dias seguidos; nunca compra de dias | `01` §8.1, BR-063, BR-071, BR-074, BR-075, BR-076, BR-082, BR-100, BR-101, BR-102, BR-104, BR-111, BR-373 | 0·50·50 | as quatro configurações como Evidence (Co-Owners, participação, Direito de Uso anual, Alta/Super Alta, Média/Baixa); textos curtos |
   | Oferta e condições | PROOF | "Onde vejo preço e condições?" | toda oferta vem de uma Residence Edition, com região e condições comerciais registradas; nenhum preço por dia; valores de planos e taxas não são fixados nesta página | BR-004, BR-031, BR-143, REQ-100 | 0·80·20 | Scene curta |
   | Luxtory Club | PROOF | "O que é o Luxtory Club — e o que ele não é?" | parte do modelo para quem tem Membership vigente (Luxchange, Luxplus, locação pelo canal Luxtory), cada mecanismo com regras próprias; Créditos Luxchange não são moeda nem investimento, não garantem disponibilidade e não se vendem a terceiros; usar a própria casa não depende de Membership, e o Membership não muda propriedade, Direito de Uso nem a ordem de abertura | D-B2C-11; BR-144, BR-146, BR-147, BR-190, BR-192, BR-374 | 10·60·30 | Scene em `wash`; condições junto de cada afirmação |
   | O que não se promete | PROOF | "Quais são os limites?" | a Luxtory não promete rentabilidade, valorização, liquidez nem renda; se a parceria com a marca terminar, os direitos necessários às Residences já contratadas, vendidas ou em construção não se extinguem automaticamente | BR-374, BR-022, BR-023 | 0·70·30 | Scene `--statement` |
   | Para quem | PUSH | "Faz sentido para mim?" | qualificação completa, incluindo as ressalvas do Co-Owner (mesmas datas todos os anos; personalização) | `b2c.md` §7 (PUSH): BR-014, BR-017, BR-019, BR-051, BR-053, BR-054, BR-071, BR-076, BR-101, BR-104, BR-374 | 10·60·30 | `lx-pair` + ação primária |

5. **CTA:** "Conhecer a Coleção" → `/colecao`.
6. **Dados dinâmicos:** nenhum. As configurações do Co-Owner vêm do `01` §8.1 (regra estrutural, não parâmetro,
   BR-077); a coluna de capacidade Luxtory não é exibida.
7. **Não afirmar:** valores de Membership, Fee, Taxa de Administração, multiplicadores e descontos (BR-143, TECH-001);
   o passo de manifestar interesse (D-W4-10); `H-B2C-*`.
8. **Aceite:** checklist da §10 do contrato; `[REQ-103]`; `[REQ-101]` sem promessa (a negação da BR-374 escrita sem as
   expressões vedadas).

#### Coleção — `/colecao`

1. **Jornada:** mapa `D-B2C-09`, linha "Coleção".
2. **Função:** curadoria dos Concepts. **Conscientização:** quer ver → escolhe um Concept.
3. **5Ps:** PICTURE (por Concept) → PUSH; PROBLEM, PROMISE e PROOF ficaram na Home e no Como funciona.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia) | Fatos e decisões | Peso | Intenção de layout (DS) |
   |---|---|---|---|---|---|---|
   | Abertura | — (contexto) | "O que estou vendo?" | Residence Concepts: casas pensadas a partir do universo de uma marca; cada Concept pode ganhar lançamentos — Residence Editions — em regiões diferentes | `01` §2, BR-002, D-LX-06 | 20·80·0 | cabeçalho de página em `paper` |
   | Os Concepts | PICTURE → PUSH | "Qual deles me interessa?" | cada card: Frame tipográfico com o título; regiões das Editions no marker, quando houver; nome da marca | dados (§13.2); BR-015 | 60·20·20 | `Collection` (alternância 7/4), um link por card |

5. **CTA:** o card leva ao Concept. Coleção vazia ou indisponível → "Entender como funciona".
6. **Dados dinâmicos:** Concepts públicos (D-W4-02), na ordem de registro (D-W4-04). **Vazio:** declaração neutra
   ("nenhum Residence Concept publicado no momento") + link. **Indisponível** (Preview sem banco, falha): mesma
   linguagem, sem detalhe técnico, com log estruturado sem dado pessoal.
7. **Não afirmar:** disponibilidade, estoque, escassez, lançamentos futuros, quantidades.
8. **Aceite:** Concept não público não aparece (`[BR-015]`, `[BR-021]`).

#### Concept — `/colecao/[conceptId]`

1. **Jornada:** mapa `D-B2C-09`, linha "Concept (com Edition e oferta quando existirem, REQ-022)".
2. **Função:** desejo específico e evidência do Concept. **Conscientização:** interessado → "isso faz sentido para mim",
   sabendo se há oferta e em que modalidade.
3. **5Ps:** PICTURE → PROOF → PUSH.
4. **Seções:**

   | Seção | 5P | Pergunta mental | Mensagem-chave (ideia) | Fatos e decisões | Peso | Intenção de layout (DS) |
   |---|---|---|---|---|---|---|
   | Abertura | PICTURE | "Que casa é esta?" | o título do Concept, a marca que ele traduz e as regiões com lançamento | dados; BR-015 | 70·20·10 | Opening Frame, Frame tipográfico `night`; `ConceptCredit`; marker só com as regiões reais |
   | O Concept | PICTURE → PROOF | "O que ele propõe?" | a especificação registrada pela Luxtory, como está | dados; BR-013 | 40·60·0 | `lx-prose`; parágrafos separados por linha em branco |
   | Fiel ao Concept | PROOF | "A casa vai ser mesmo assim?" | toda Residence deste Concept é construída do zero e preserva os elementos essenciais dele; o Owner personaliza só o que não é essencial; a do Co-Owner é padronizada | BR-003, BR-014, BR-017, BR-019, BR-053, BR-301 | 0·70·30 | Scene curta em `paper` |
   | Residence Editions | PROOF | "Existe oferta? Onde, e em que modalidade?" | cada Edition: região, modalidade e condições comerciais registradas; a oferta só existe por uma Edition | dados; BR-004, BR-031, REQ-020, REQ-022, REQ-100 | 0·30·70 | `Evidence` (região, modalidade) + `lx-prose` das condições; "Owner e Co-Owner" com o mesmo peso |
   | Para quem | PUSH | "Faz sentido para mim? Qual o próximo passo?" | qualificação; o próximo passo honesto enquanto o formulário não existe | `b2c.md` §7 (PUSH); D-B2C-10 | 10·60·30 | `lx-pair` + ações |

5. **CTA:** "Conhecer outros Concepts" → `/colecao`; "Entender como funciona" → `/como-funciona` (D-B2C-10). Sem
   "Manifestar interesse" até a W6, que o acrescenta no PUSH sem reestruturar a página.
6. **Dados dinâmicos:** §13.2. **Sem Edition:** a seção declara que o Concept ainda não tem Residence Edition e, por
   isso, não tem oferta comercial (BR-004, REQ-022) — sem condição, sem modalidade, sem CTA de oferta. Sem Edition, o
   marker da abertura não aparece. Concept não público ou inexistente → 404 do grupo público (com a navegação). Metadata:
   só o título (resumir a especificação arriscaria mudar o sentido).
7. **Não afirmar:** disponibilidade, prazo de obra, preço calculado, número de Residences, configuração do Co-Owner da
   Edition (definida depois, conforme a demanda, BR-063), Investor.
8. **Aceite:** `[REQ-022]` sem Edition, sem oferta; `[REQ-100]` condições exibidas como registradas, sem preço por dia;
   `[BR-015]` e `[BR-021]` ocultação.

### 13.5 Admin: conteúdo público identificado (D-W4-03)

- Os campos publicados literalmente — **título do Concept, especificação, região e condições comerciais da Edition** —
  levam no próprio rótulo a marca visível **"Público no site"** e uma dica que diz onde o texto aparece.
- `essential_elements` e `preservation_premises` dizem na dica que não aparecem no site; o título deixa de ser descrito
  como "identificação nos registros".
- As telas que **publicam** dizem a consequência antes da confirmação: aprovar uma versão (o título e a especificação
  passam a aparecer no site quando a exposição da marca estiver autorizada), autorizar a exposição da marca (o nome da
  marca e os Concepts aprovados passam a aparecer) e registrar uma Edition (região, modalidade e condições aparecem na
  página do Concept).
- O nome da marca diz no rótulo que só é público com a exposição autorizada.

### 13.6 Aceite da W4

- [ ] `[REQ-100]` nenhum termo vedado nem preço por dia para Co-Owner nas páginas públicas, inclusive com os dados do
      catálogo.
- [ ] `[REQ-101]` nenhuma promessa de rentabilidade, valorização, liquidez ou renda nas páginas públicas.
- [ ] `[REQ-022]` Concept sem Edition aparece sem oferta.
- [ ] `[REQ-103]` Owner e Co-Owner com a mesma estrutura (mesmo nível de título e as mesmas dimensões) onde aparecem
      juntos.
- [ ] `[BR-015]` `[BR-021]` sem autorização de exposição, sem versão aprovada ou depois da eficácia do encerramento, o
      Concept não aparece na Coleção e a URL responde 404; antes da eficácia, aparece.
- [ ] `[TECH-052]` `anon` só lê as colunas da §13.2 das linhas visíveis; não lê as demais tabelas nem colunas, não
      escreve e só executa os dois predicados.
- [ ] Portão: com `VERCEL_ENV=production` e sem `PUBLIC_SITE=open`, as rotas públicas respondem 404.
- [ ] CSP com nonce em toda página HTML; zero erro de console (inclusive violação de CSP) nas telas públicas e do Admin.
- [ ] Admin: conteúdo público identificado como na §13.5.
- [ ] UI (ADR-0009): axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px, zero erro de console, jornada Home → Coleção
      → Concept → Como funciona a 390 px com toque; menu do celular (foco preso, Esc, foco devolvido, fecha ao cruzar o
      `lg`); smoke Playwright WebKit da Home e do menu.
- [ ] Checklist da §10 do contrato de comunicação; capturas a 390 e 1440 px no PR.

### 13.7 Edge cases

- **Encerramento com eficácia futura:** o Concept aparece até o instante da eficácia (`now()` do banco) e some na
  requisição seguinte — sem cache (D-W4-07).
- **Versão nova ainda não aprovada:** a página continua na vigente.
- **Especificação com linhas simples:** parágrafos só por linha em branco; quebras simples viram espaço.
- **Nome de Concept longo:** `text-wrap: balance` do DS; nenhuma truncagem.
- **Banco indisponível** (Preview, falha): estado indisponível na Coleção e no Concept; Home e Como funciona não
  dependem do banco.

### 13.8 Pendências (não bloqueiam a W4)

- Resumo editorial do Concept para o card, slug legível e ordem editorial da Coleção — decidir antes do go-live
  (mudança de contrato própria).
- Direitos sobreviventes do encerramento como dado (BR-022/023, §7) — quando existirem, a visibilidade os respeita.
- Revisão jurídica da comunicação pública (`P-LX-03`), D1 e D5c — condicionam abrir o portão.
- Regras de exposição por Brand Partner (P-8), fotografia (P-1) e textos jurídicos do rodapé (P-3).
