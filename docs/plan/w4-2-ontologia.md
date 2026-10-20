# W4.2 — Dependency map e estratégia de migration por objeto

> Plano técnico da [Wave 4.2](implementation-waves.md#wave-42--ontologia-home-concept--home-edition--second-home--correção-estrutural-do-catálogo-2026-10-19)
> (Fase B), escrito antes de qualquer migration. Canônicos: `01` v10.2 (BR-030 a BR-036, BR-377), `02` v4.3
> (REQ-020 a REQ-022, REQ-100), `03` v3.15 (§3.1, §3.2, §13). Modelo e contratos:
> [`catalog` §17](../specs/catalog.md#17-w42--ontologia-home-concept--home-edition--second-home),
> [`ownership` §13](../specs/ownership.md#13-w42--interesse-a-partir-da-home-edition) e
> [ADR-0019](../adr/0019-ontologia-home-concept-home-edition-second-home.md).

## 1. Método

O inventário foi extraído do catálogo do PostgreSQL com as 20 migrations de `origin/main` aplicadas num banco
descartável (`pg_constraint`, `pg_indexes`, `pg_trigger`, `pg_proc`, `pg_policies`, `information_schema` de grants e
views; 2026-10-19). Não há views, views materializadas nem sequências próprias nas tabelas afetadas; o único
`IDENTITY` (`audit_log`) não muda.

Regras da estratégia (decisão do fundador, 2026-10-19):

- preferir `ALTER … RENAME` / `ALTER TABLE` quando for semanticamente correto — preservam OIDs, dados, FKs, grants e
  as referências das policies;
- recriar só em substituição real (`edition_reference_value` → `home_edition_projected_investment`);
- toda operação destrutiva baseada em "Production vazia" tem **precondição fail-closed** que aborta a migration com
  mensagem própria se encontrar dado inesperado;
- nenhum `CASCADE`; cada dependente é tratado pelo nome;
- toda migration tem `down` testado por `npm run db:check` (up → down → up).

Estado de Production informado no handoff aprovado: 0 linhas de catálogo e de `interest` (escrita de interesse
fechada); `operation` e `audit_log` têm linhas (setup de staff). As precondições não dependem dessa informação: elas
a verificam no próprio banco.

## 2. Dependency map

### 2.1 Tabelas, colunas e dados

| Objeto atual | Dependentes | Dado em Production | Destino |
|---|---|---|---|
| `operation.residence_id` | `operation_transition()`, `record_operator_change()` (corpo PL/pgSQL), executor de commands (`residenceId`), command store, tipos Kysely | sim (linhas de setup) | `second_home_id` (RENAME) |
| `concept` | FK de `concept_version`, `concept_media`, `concept_curation`, `edition`, `investor_authorization`, `interest`; policies; `concept_is_public()` | não | `home_concept` (RENAME) |
| `concept_version` (+ `guests_max`, `suites`, `built_area_m2`) | FK de `concept_version_term`; FK composta de `residence`; `catalog_term_is_public()`, `concept_version_term_guard()`, `residence_require_basis()` | não | `home_concept_version` (RENAME); os três atributos físicos saem (passam à Home Edition) |
| `concept_version_term` | policy pública (subconsulta), `catalog_term_is_public()` | não | `home_concept_version_term` (RENAME) |
| `concept_media`, `concept_media_file` (`storage_key` `concept-media/…`) | `concept_curation_guard()`, `concept_media_file_guard()`, policy pública do arquivo; rota `/media/concept-covers` | não | `home_concept_media`, `home_concept_media_file` (RENAME); prefixo `home-concept-media/` |
| `concept_curation` | `concept_curation_guard()` | não | `home_concept_curation` (RENAME) |
| `investor_authorization.concept_id` | FK composta de `residence`; `residence_require_basis()` | não | `home_concept_id` (RENAME) |
| `edition` (`region`, `modality`, `commercial_conditions`) | FK composta de `residence` e `interest`; FK de `edition_reference_value`; `interest_modality_offered()`; policy pública | não | `home_edition` (RENAME + ALTER: saem as três colunas, entram atributos e publicação) |
| `edition_reference_value` | gatilho e função próprios, policies, grants | não | substituída por `home_edition_projected_investment` (recriação) |
| `residence` | `residence_require_basis()`; nenhuma FK aponta para ela | não | `second_home` (RENAME) |
| `interest` (`concept_id`, `edition_id` opcional, `region`) | `interest_modality_offered()` (F2a), FK composta para `edition`, índice de agrupamento | não | `home_edition_id` obrigatório, `desired_location`; sai `concept_id` e F2a (ALTER) |

### 2.2 Constraints (117 no schema; as afetadas)

Inline (nome automático `<tabela>_<coluna>_check`) e nomeadas. Todas as que levam o prefixo antigo recebem o nome do
objeto novo; a renomeação de uma constraint `PRIMARY KEY`/`UNIQUE` renomeia o índice dela.

| Tabela atual | Constraints |
|---|---|
| `concept` | `concept_pkey`, `concept_brand_partner_id_fkey`, `concept_operation_id_fkey`, `concept_operation_id_key`, `concept_title_check` |
| `concept_version` | `concept_version_pkey`, `_concept_id_fkey`, `_concept_key` (alvo da FK composta), `_number_key`, `_approval_check`, `_approval_operation_id_fkey`, `_approval_operation_id_key`, `_approval_refs_check`, `_approved_role_check`, `_essential_elements_check`, `_preservation_premises_check`, `_specification_check`, `_state_check`, `_summary_check`, `_version_check`, `_operation_id_fkey`, `_operation_id_key`; saem com as colunas: `_guests_max_check`, `_suites_check`, `_built_area_m2_check` |
| `concept_version_term` | `concept_version_term_pkey`, `_concept_version_id_fkey`, `_position_check`, `_term_fkey`, `_unique_key` |
| `concept_media` | `concept_media_pkey`, `_concept_id_fkey`, `_alt_check`, `_approval_check`, `_approval_operation_id_fkey`, `_approval_operation_id_key`, `_approved_role_check`, `_credit_check`, `_crop_x_check`, `_crop_y_check`, `_lifecycle_check`, `_operation_id_fkey`, `_operation_id_key`, `_source_sha256_check`, `_state_check`, `_withdrawal_basis_check`, `_withdrawal_check`, `_withdrawal_operation_id_fkey`, `_withdrawal_operation_id_key` |
| `concept_media_file` | `concept_media_file_pkey`, `_media_id_fkey`, `_byte_size_check`, `_content_type_check`, `_role_check`, `_sha256_check`, `_size_check`, `concept_media_file_check` (chave do Storage: substituída) |
| `concept_curation` | `concept_curation_pkey`, `_concept_id_fkey`, `_operation_id_fkey`, `_rank_check` |
| `investor_authorization` | `investor_authorization_concept_id_fkey`, `investor_authorization_concept_key` |
| `edition` | `edition_pkey`, `_concept_id_fkey`, `_concept_key`, `_operation_id_fkey`, `_operation_id_key`; saem com as colunas: `_region_check`, `_modality_check`, `_commercial_conditions_check` |
| `edition_reference_value` | 9 — saem com a tabela |
| `residence` | `residence_pkey`, `residence_edition_fk`, `residence_concept_version_fk`, `residence_investor_authorization_fk`, `residence_label_check`, `residence_timezone_check`, `residence_operation_id_fkey`, `residence_operation_id_key` |
| `interest` | `interest_concept_id_fkey` e `interest_edition_fkey` (saem), `interest_region_check` (renomeada) |

### 2.3 Índices avulsos

`concept_brand_partner_idx`, `concept_version_approved_idx`, `concept_version_term_term_idx`, `concept_media_concept_idx`,
`concept_media_current_cover_idx`, `concept_media_file_master_idx`, `concept_curation_featured_idx`,
`investor_authorization_concept_idx`, `edition_concept_idx`, `residence_edition_idx`,
`residence_investor_authorization_idx` → renomeados; `edition_reference_value_edition_idx` sai com a tabela;
`interest_grouping_idx` é recriado sobre (`home_edition_id`, `desired_location`, `modality`).

### 2.4 Gatilhos (34 nas tabelas afetadas) e funções

| Função | Linguagem | Corpo cita objeto renomeado | Destino |
|---|---|---|---|
| `operation_transition()` | PL/pgSQL | `residence_id` | corpo novo |
| `record_operator_change(…)` | PL/pgSQL | `residence_id` | corpo novo |
| `concept_is_public(uuid)` | SQL, `SECURITY DEFINER` | `app.concept`, `app.concept_version` | `home_concept_is_public` (RENAME + corpo novo; policies seguem pelo OID) |
| `catalog_term_is_public(uuid)` | SQL, `SECURITY DEFINER` | três tabelas e `concept_is_public` | corpo novo |
| `concept_version_transition()` | PL/pgSQL | mensagem | `home_concept_version_transition` |
| `concept_version_term_guard()` | PL/pgSQL | `app.concept_version` | `home_concept_version_term_guard` |
| `concept_media_transition()` | PL/pgSQL | mensagem | `home_concept_media_transition` |
| `concept_media_file_guard()` | PL/pgSQL | `app.concept_media` | `home_concept_media_file_guard` |
| `concept_curation_guard()` | PL/pgSQL | `app.concept_media`, `concept_id` | `home_concept_curation_guard` |
| `residence_require_basis()` | PL/pgSQL | `app.concept_version`, `app.investor_authorization`, `concept_id` | `second_home_require_basis` |
| `edition_reference_value_guard()` | PL/pgSQL | a própria tabela | removida com a tabela |
| `interest_modality_offered()` | PL/pgSQL | `app.edition` (F2a) | removida |
| `forbid_change()`, `is_text_list()`, `allow_single_revocation()`, `brand_partner_*`, `catalog_term_transition()` | — | não | inalteradas |

Funções SQL e PL/pgSQL guardam o corpo como texto e só o resolvem na execução: renomear tabela ou coluna as quebra
em silêncio. Por isso todas as da tabela acima recebem `CREATE OR REPLACE` na mesma migration da renomeação, com os
mesmos atributos (`STABLE`, `SECURITY DEFINER`, `SET search_path = ''`) — o OID, os grants (`EXECUTE` de `anon`) e os
gatilhos que as chamam ficam.

Gatilhos renomeados por `ALTER TRIGGER … RENAME`. Mudança de comportamento: `edition_no_update` (`forbid_change`) dá
lugar a `home_edition_transition` (preparação editável; finalização uma vez e sem volta; depois dela, definição
material imutável; visibilidade pública separada);
`interest_modality_offered` sai.

### 2.5 Policies (RLS) e grants

- Policies guardam a expressão já resolvida (OIDs): continuam válidas depois de `RENAME`; recebem nomes novos
  (`ALTER POLICY … RENAME`). Mudam de regra: `edition_public_read` → `home_edition_public_read` passa a exigir
  `visibility = 'public'`; as policies de `edition_reference_value` saem com a tabela.
- Grants de tabela e de coluna estão presos ao OID e ao número da coluna: sobrevivem a `RENAME`. Somem com
  `DROP COLUMN` os grants de `anon` em `region`, `modality`, `commercial_conditions` e nos três atributos físicos da
  versão. Novos: `UPDATE` por coluna de `luxtory_app` nas transições da Home Edition; `SELECT` por coluna de `anon` nas
  colunas publicáveis da Home Edition, da mídia e da média projetada (§3).
- `anon` continua com `EXECUTE` só em `brand_partner_is_public`, `home_concept_is_public` e `catalog_term_is_public`;
  as funções novas recebem `REVOKE ALL … FROM PUBLIC`.

### 2.6 Código e contratos dependentes

Tipos Kysely (`src/features/platform/infrastructure/database/schema.ts`, regenerados por `npm run db:types` e
conferidos por `tests/migrations/database-types.db.test.ts`); stores e readers do `catalog` e do `ownership`; executor e
command store da plataforma (`residenceId`); ordem de travas do TECH-053 (`lock-order.ts`, `residence_date`);
registro de commands não críticos; `openapi.yaml` (14 paths do catálogo, `/interests`, `/media/concept-covers`);
rotas `src/app/v1/admin/**`, `src/app/admin/catalogo/**`, `src/app/(public)/colecao/**`, `src/app/media/**`;
`audit_log.object_type` gravado pelos commands; fixtures, seeds e testes.

`audit_log` e `operation` não são reescritos: registros de commands antigos ficam com o nome que tinham (histórico,
TECH-092).

## 3. Migrations (ordem e estratégia)

Arquivos novos com timestamp posterior a `20261019034110`; as migrations aplicadas não mudam.

| # | Migration | Estratégia | Precondição fail-closed |
|---|---|---|---|
| 1 | `platform_operation_second_home_id` | `RENAME COLUMN`; `CREATE OR REPLACE` das duas funções | — (preserva dados) |
| 2 | `catalog_home_concept` | `RENAME` de 6 tabelas, 5 colunas, constraints, índices, gatilhos, policies e 6 funções; corpos novos; saem `guests_max`, `suites`, `built_area_m2` da versão; chave do Storage `home-concept-media/` | nenhuma versão com atributo físico preenchido; nenhum arquivo de mídia registrado |
| 3 | `catalog_home_edition` | `RENAME` + `ALTER`: saem `region`, `modality`, `commercial_conditions`; entram atributos, estado material (`draft` → `finalized`), visibilidade (`hidden`/`public`) e gatilho de transição; policy pública por `visibility` | `edition` vazia (as colunas novas são obrigatórias e a modalidade não tem destino) |
| 4 | `catalog_second_home` | `RENAME` de tabela, 3 colunas, constraints, índices, gatilhos e policies; `second_home_require_basis()` exige Home Edition materialmente finalizada | — |
| 5 | `catalog_home_edition_projected_investment` | `DROP TABLE edition_reference_value` (sem `CASCADE`: nada a referencia) + `CREATE TABLE home_edition_projected_investment` | `edition_reference_value` vazia |
| 6 | `catalog_home_edition_media` | `CREATE TABLE home_edition_media` e `home_edition_media_file` (mesmo ciclo da capa) | — |
| 7 | `ownership_interest_home_edition` | `ALTER`: sai F2a e a FK composta; `edition_id` → `home_edition_id NOT NULL` com FK simples; sai `concept_id`; `region` → `desired_location`; índice recriado | nenhum interesse sem Home Edition (o `NOT NULL` não tem como ser preenchido) |

`down` de cada uma desfaz na ordem inversa. Os `down` que recriam colunas obrigatórias (3, 7) também são fail-closed:
abortam se houver linhas, em vez de inventar valor. O `down` da 5 recria `edition_reference_value` exatamente como
estava (tabela, guard, policies e grants, inclusive a leitura pública da W4.1).

Verificação: `npm run db:check` (up → down → up de todas), `npm run db:types` (tipos), testes de banco das regras
(`tests/migrations/*.db.test.ts`, `tests/features/**/*.db.test.ts`) e um teste das precondições: cada migration com
precondição aborta com dado inesperado e não altera nada.

## 4. Mapa de nomes no código e nos contratos

| Antes | Depois |
|---|---|
| `Concept`, `ConceptVersion`, `ConceptMedia`, `ConceptCuration`, `PublicConcept*` | `HomeConcept`, `HomeConceptVersion`, `HomeConceptMedia`, `HomeConceptCuration`, `PublicHomeConcept*` |
| `Edition`, `EditionModality`, `OfferedModality`, `isModalityOffered`, `basesForModality`, `EditionReferenceValue` | `HomeEdition`; os de modalidade e de base saem; `HomeEditionProjectedInvestment` |
| `Residence` | `SecondHome` |
| `findPublicConceptOffer`, `readConceptLabels` | `findPublicHomeEdition`, `readHomeEditionLabels` |
| commands `create_concept_version`, `approve_concept_version`, `upload_concept_cover`, `approve_concept_media`, `withdraw_concept_media`, `set_concept_curation`, `create_edition`, `register_edition_reference_value`, `end_edition_reference_value`, `register_residence` | `create_home_concept_version`, `approve_home_concept_version`, `upload_home_concept_cover`, `approve_home_concept_media`, `withdraw_home_concept_media`, `set_home_concept_curation`, `create_home_edition`, `register_home_edition_projected_investment`, `end_home_edition_projected_investment`, `register_second_home` |
| — | `update_home_edition_draft`, `finalize_home_edition`, `publish_home_edition`, `withdraw_home_edition`, `correct_home_edition_editorial`, `upload_home_edition_media`, `approve_home_edition_media`, `withdraw_home_edition_media` |
| `/v1/admin/concept-versions…`, `/concepts/{id}/…`, `/concept-media/…`, `/editions…`, `/edition-reference-values/…`, `/residences` | `/v1/admin/home-concept-versions…`, `/home-concepts/{id}/…`, `/home-concept-media/…`, `/home-editions…`, `/home-edition-media/…`, `/home-edition-projected-investments/…`, `/second-homes` |
| `/admin/catalogo/concepts…`, `/editions…`, `/residences…` | `/admin/catalogo/home-concepts…`, `/home-editions…` (`media-projetada`, `midia`), `/second-homes…` |
| `/colecao/[conceptId]`, `/media/concept-covers/…` | `/colecao/[homeConceptId]`, `/colecao/[homeConceptId]/home-editions/[homeEditionId]`, `/media/home-concept-covers/…`, `/media/home-edition-media/…` |
| `ConceptCredit`, `lx-concept-*`, `lx-edition__head`, `lx-edition__region` | `HomeConceptCredit`, `lx-home-concept-*`, `lx-home-edition__head`; `__region` sai |
| `audit_log.object_type` `concept…`, `edition…`, `residence` | `home_concept…`, `home_edition…`, `second_home` |
| `residenceId` (executor), `residence_date` (TECH-053) | `secondHomeId`, `second_home_date` |

Arquivos e pastas ativos com o nome antigo são renomeados com `git mv` (exceção do `CLAUDE.md`, 2026-10-19).

## 5. Varredura terminológica

`tests/terminology.test.ts` ganha a verificação da BR-377 sobre `src`, `tests`, `docs/api`, `docs/specs` (exceto
`canonical`), `docs/reference`, `docs/how-to`, `docs/security`, `docs/adr`, `docs/plan`, `CLAUDE.md` e `AGENTS.md`:

- **Denylist explícita:** `Residence Concept(s)`, `Residence Edition(s)`, `Residence(s)` como nome, `residência(s)`,
  `residencial(is)`, `Brand DNA`, `Branded Residences` e os identificadores antigos da §4 (nomes exatos, como
  `concept_version`, `edition_reference_value`, `register_residence`, `ConceptVersion`, `PublicConceptCard`,
  `lx-concept-`, `/v1/admin/concepts`, `conceptId`). Nenhuma regex genérica sobre `concept` ou `edition`.
- **Allowlist mínima versionada** (`tests/terminology-allowlist.json`, caminho + trecho + motivo): migrations aplicadas,
  CHANGELOG passado, linhas de decisões superadas e registros datados, o texto das próprias regras e referências
  jurídicas ou externas justificadas (por exemplo, "segunda residência" como alternativa convencional).

## 6. Ordem de deploy e reversão

Uma wave, um PR, sem deploy intermediário. A CI aplica as migrations (`migrate`) antes do deploy, como hoje; o app
anterior não roda contra o schema novo (renomeações), por isso migration e deploy são do mesmo push em `main`, sem
janela com dados (Production sem catálogo nem interesse). Reversão: `down` das sete migrations na ordem inversa +
redeploy do commit anterior; as precondições dos `down` impedem perda silenciosa se houver dados novos.

## 7. Relação com a W6

As migrations da branch provisória da W6 (`20261019175001_ownership_interest_contact`,
`20261019175009_platform_public_idempotency_hash_scheme`) têm timestamps anteriores aos da W4.2. A W6 reconstruída cria
arquivos novos, posteriores aos desta wave, sobre o schema já renomeado; nada da branch provisória é aplicado aqui.
