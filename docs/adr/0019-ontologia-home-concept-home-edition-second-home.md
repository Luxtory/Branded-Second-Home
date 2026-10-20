# 0019. Ontologia Home Concept → Home Edition → Second Home em todas as camadas

- **Date**: 2026-10-19
- **Status**: Accepted
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: catalog, ownership, data-model, communication, documentation

## Context

Até a v10.1 do `01`, o catálogo tinha Residence Concept, Residence Edition e Residence. A Residence Edition era um
lançamento comercial **regional**, com modalidade e condições comerciais, e o interesse podia nascer no Concept antes
de existir Edition (BR-030/031/032 da v10.1). O software seguiu esse modelo nas W3, W4, W4.1 e W5 (`edition` com
`region`, `modality`, `commercial_conditions`; `edition_reference_value` por modalidade; `interest` com `concept_id` e
`edition_id` opcional). Para o público, a W4 traduzia os nomes (`D-LX-08`: Home Concept, Home Edition e Second Home no
site; nomes canônicos no Admin, no banco e no código).

Em 2026-10-19 o fundador corrigiu o modelo de negócio. A Home Edition é uma configuração específica e replicável de
Second Home, sem localização, modalidade, estrutura patrimonial nem condições comerciais, e sua definição material não
muda depois de publicada. A Second Home é a instância de uma Home Edition numa localização concreta, e é nela que
ficam localização, modalidade, estrutura e condições. A manifestação de interesse parte sempre de uma Home Edition,
com a localização pretendida e a modalidade desejada. O produto nunca é enquadrado como moradia. A correção entrou no
`01` v10.2 (BR-030 a BR-036, BR-377), no `02` v4.3 e no `03` v3.15. As ADRs anteriores não decidem como aplicá-la ao
schema existente, que é append-only, tem gatilhos e funções cujo corpo cita as tabelas e tem dados de plataforma em
Production.

## Decision

1. **Um só vocabulário em todas as camadas.** Home Concept, Home Edition e Second Home nomeiam os canônicos, specs,
   ADRs, banco (`home_concept*`, `home_edition*`, `second_home*`), código (`HomeConcept`, `HomeEdition`, `SecondHome`),
   APIs, Admin, testes e as duas jornadas de comunicação. Nenhum identificador usa `residence`, nem `concept` ou
   `edition` isolados para essas entidades. `D-LX-08` (tradução pública) é substituída por `D-LX-11`. "Brand DNA" passa
   a "identidade da marca". A regra é verificada por teste, com denylist explícita gerada do mapa de nomes e allowlist
   mínima versionada — sem regex genérica sobre palavras inglesas.
2. **Fronteiras.** O Home Concept guarda a identidade e a especificação conceitual (versões aprovadas), sem atributos
   físicos. A Home Edition guarda a configuração (tipologia, configuração dos espaços, área projetada, suítes,
   capacidade, ambientes, amenidades, características), os textos editoriais, a mídia, o estado material, a
   visibilidade pública e a média projetada; não tem localização, modalidade, estrutura nem condições comerciais. A Second Home guarda a instância:
   Home Edition, versão fixada do Home Concept, aprovação comercial, rótulo e fuso. Localização concreta, modalidade
   definitiva, estrutura e condições chegam na W8.
3. **Preparação, finalização material e visibilidade pública são separadas (BR-036; `02` v4.3 REQ-022), sem tabela de
   versão.** Correção do fundador (2026-10-19) sobre a primeira versão deste ADR.
   - `material_state` `draft` → `finalized`, uma vez e sem volta. Em `draft` (preparação), definição material e textos
     editoriais podem ser completados e corrigidos (`update_home_edition_draft`).
   - `finalize_home_edition` é o marco de estabilização: a partir dele um gatilho recusa qualquer alteração material em
     qualquer caminho de escrita; alteração material posterior é uma Home Edition nova.
   - `visibility` `hidden`/`public` governa só o Discovery: `public` exige `finalized` (logo, depois de publicada, a
     definição é imutável — BR-036); retirar do público (`hidden`, com base) não reabre a definição material, e a Home
     Edition pode voltar a ser publicada.
   - O vínculo com o Home Concept nunca muda.
   - Os mecanismos não materiais são próprios, auditados e controlados: correção editorial de nome e descrição depois
     da finalização (com base), mídia (pendente → aprovada → retirada) e média projetada (vigências).
4. **Média projetada como entidade nova, não reaproveitada.** `home_edition_projected_investment` substitui
   `edition_reference_value`, que tinha base por modalidade (Owner/Ação). A média tem uma referência vigente por Home
   Edition, vigência temporal, `bigint` + moeda e registro da Luxtory. Não tem modalidade, base, configuração ou Ação, e
   nada é derivado dela. Na apresentação pública, o rótulo e a explicação obrigatória da semântica da BR-034 são parte do
   contrato.
5. **Second Home só de Home Edition materialmente finalizada** (`02` v4.3 REQ-022, derivação de BR-025 e BR-036). O
   `register_second_home` mantém o evento de aprovação comercial do ADR-0010 §2 e passa a exigir `material_state =
   'finalized'`: a Second Home fica presa a uma definição estável. A visibilidade pública não é condição — uma Home
   Edition finalizada, publicada ou não, pode originar Second Home; tirá-la do público não afeta Second Homes
   existentes.
6. **Interesse a partir da Home Edition.** `interest.home_edition_id` passa a obrigatório; `concept_id` sai, porque o
   Home Concept vem da Home Edition. `region` passa a `desired_location`. A validação de modalidade contra a Edition
   (F2a) sai, porque a Home Edition não restringe modalidade (BR-032). Contato, qualificação, formulário e Budget Fit
   ficam na W6.
7. **Migrations por objeto, a partir de um dependency map do banco real** ([`docs/plan/w4-2-ontologia.md`](../plan/w4-2-ontologia.md)).
   - Usa `ALTER … RENAME` e `ALTER TABLE` onde preservam a semântica: OIDs, dados, FKs, grants e as referências das
     policies continuam válidos.
   - Recria só o que é substituído de verdade (o valor de referência pela média projetada).
   - Toda função cujo corpo cita um nome renomeado recebe `CREATE OR REPLACE` na mesma migration, com os mesmos
     atributos.
   - Toda operação destrutiva tem precondição fail-closed.
   - Nenhum `CASCADE`.
   - As migrations aplicadas não mudam; o `audit_log` e as `operation` antigas ficam com os nomes da época.
8. **Página pública da Home Edition** em `/colecao/[homeConceptId]/home-editions/[homeEditionId]`. A visibilidade é da
   RLS (`visibility = 'public'` e Home Concept público). Uma Home Edition de outro Home Concept responde 404. A página não tem
   formulário até a W6.

## Consequences

### Positive

- O software deixa de contornar um erro canônico: nenhuma região, modalidade ou condição comercial existe na Home
  Edition, nem como dado nem como copy.
- Um só nome por conceito, do canônico ao CSS, com verificação automática.
- BR-036 é garantida pelo banco depois da finalização, sem tabela de versão; a preparação continua editável.
- O dependency map e as precondições tornam a migration auditável e segura para dados inesperados.

### Negative

- Diff grande (renomeação de arquivos, rotas, tipos, tabelas e testes) concentrado numa wave.
- Entre o `migrate` e o fim do deploy da CI, o app anterior não lê o catálogo renomeado: a Coleção mostra o estado
  "indisponível" por alguns minutos. Production não tem catálogo.
- O Admin precisa finalizar a Home Edition antes de publicá-la ou de registrar Second Home.

### Neutral / follow-ups

- W6: formulário de solicitação de conversa na página da Home Edition, `interest_contact`, `interest_qualification` e
  Budget Fit, com migrations posteriores às desta wave.
- W8: localização concreta, modalidade, estrutura, configuração Co-Owner, condições e primeiro exercício da Second Home.

## Alternatives considered

- **`drop/recreate` geral porque Production está vazia.** Mais simples de escrever, mas descarta o `operation` com dados
  reais e reconstrói grants, policies e gatilhos à mão, com risco de regressão silenciosa. Rejeitada pelo fundador em
  favor da estratégia por objeto.
- **`HomeEditionVersion`** (versões da Home Edition, como as do Home Concept). Duplica o modelo de versão sem
  necessidade: BR-036 pede uma Home Edition nova para mudança material. Rejeitada pelo fundador.
- **Imutável desde a criação** (primeira versão deste ADR). Mais estrita que o canônico e operacionalmente ruim:
  corrigir um dado digitado na preparação exigiria outra Home Edition. Rejeitada pelo fundador.
- **Publicação como marco de estabilização e condição da Second Home** (`draft` → `published` → `withdrawn`).
  Confunde visibilidade pública com definição estável: uma Home Edition finalizada fora do site não poderia originar
  Second Home, e retirar do público seria irreversível. Rejeitada pelo fundador.
- **Reaproveitar `edition_reference_value` sem a base.** O valor de referência era por modalidade (Owner/Ação) e por
  série; a média projetada tem outra semântica (BR-034). Rejeitada pelo fundador ("não reutilizar por proximidade").
- **Manter a tradução pública (`D-LX-08`)** com nomes antigos no banco e no código. Mantém duas linguagens e o erro de
  modelo nas camadas internas. Rejeitada pelo fundador.
- **Validar modalidade do interesse contra a Home Edition.** A Home Edition não tem modalidade (BR-032 v10.2).
  Rejeitada.

## References

- `01` v10.2: §1–§4, BR-001 a BR-004, BR-025, BR-030 a BR-036, BR-301, BR-310, BR-377. `02` v4.3: §1, §2, REQ-020 a
  REQ-022, REQ-024, REQ-025, REQ-100, §15 (14, 15). `03` v3.15: §3.1, §3.2, §13.
- Specs: [`catalog` §17](../specs/catalog.md#17-w42--ontologia-home-concept--home-edition--second-home),
  [`ownership` §13](../specs/ownership.md#13-w42--interesse-a-partir-da-home-edition); plano
  [`w4-2-ontologia.md`](../plan/w4-2-ontologia.md).
- Supersede em parte: [ADR-0010](0010-catalogo-versoes-e-mutacoes-do-admin.md) §2 e §8 (nomes),
  [ADR-0016](0016-framework-brand-partners-versao-2026-10-12.md) §2 (nomes canônicos no domínio). Relacionadas:
  [ADR-0012](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md),
  [ADR-0013](0013-framework-brand-partners-fonte-canonica.md), [ADR-0014](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md),
  [ADR-0015](0015-midia-do-catalogo-metadados-e-storage.md), [ADR-0017](0017-idempotencia-de-mutacoes-publicas-nao-criticas.md).
