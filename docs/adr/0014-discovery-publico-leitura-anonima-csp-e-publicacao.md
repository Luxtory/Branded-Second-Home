# 0014. Discovery público: leitura anônima sob RLS, CSP com nonce e portão de publicação

- **Date**: 2026-10-01
- **Status**: Accepted
- **Deciders**: Luxtory, Engenharia
- **Tags**: catalog, security, frontend, database

## Context

A W4 abre a primeira superfície pública B2C — Home, Como funciona, Coleção e Concept (spec
[`catalog`](../specs/catalog.md) §13), com a comunicação vinda do Framework B2C canônico
([ADR-0012](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md)). Até aqui toda leitura do catálogo era do Admin,
como `luxtory_app`, com `admin_read` (ADR-0010 §7), e `anon` não tinha nem `USAGE` no schema `app`. O `03` exige
leituras protegidas por RLS (TECH-052, ADR-002 do `03`) e proíbe decidir economia no front (ADR-001 do `03`). O ADR-0004
deixou a CSP para a primeira página pública. A revisão jurídica da comunicação (`P-LX-03`), o plano da Vercel (D1) e a
D5c ainda não permitem o go-live, mas as páginas precisam existir, ser testadas e ser revisadas. O CTA da Home e do Como
funciona depende do catálogo (`D-B2C-13`, `D-B2C-16`).

Fatos verificados em 2026-09-29 (só leitura): a Data API do Supabase está desligada — o PostgREST registra
`db-schemas=pg_pgrst_no_exposed_schemas` e responde `PGRST002` a `/rest/v1/…` (inclusive com `Accept-Profile: app`) e
a `/graphql/v1`; `pg_graphql` não está instalado; nenhum papel de API tem `USAGE` em `app`; o dono das migrations tem
`ADMIN OPTION` em `anon`. Já existe um `src/proxy.ts` que renova a sessão do Auth em `/entrar` e `/admin`.

## Decision

1. **Leitura pública como `anon`, sob RLS.** Numa transação só de leitura, `luxtory_app` troca para `anon`
   (`SET LOCAL ROLE`, membership `WITH INHERIT FALSE, SET TRUE`, como o `authenticated` da W2). Sem claims, sem
   escrita e sem `admin_read`.
2. **Menor privilégio por coluna.** `anon` recebe `SELECT` só nas colunas publicáveis (spec §13.2); `essential_elements`,
   `preservation_premises`, dados de aprovação, Residences, Investor e o resto de `app` ficam fora. O banco recusa
   qualquer outra coluna, mesmo que a aplicação erre a consulta.
3. **Visibilidade decidida só pela RLS**, com dois predicados `SECURITY DEFINER` (`app.brand_partner_is_public`,
   `app.concept_is_public`; `STABLE`, `search_path = ''`, só booleano, `EXECUTE` só para `anon`). Políticas que se
   consultassem diretamente (`concept` ↔ `concept_version`) entrariam em recursão. A consulta não repete a regra.
4. **Encerramento fechado para falhas.** Depois da eficácia do encerramento o Concept deixa de ser público — limitação
   temporária igual à D-W3-4, que **não redefine BR-021, BR-022 nem BR-023**; quando os direitos sobreviventes virarem
   dado, os predicados passam a considerá-los.
5. **Disponibilidade explícita.** A leitura pública responde "há Edition publicada?" e "há Concept publicado?"; quando os
   dados não podem ser lidos (Preview sem banco, falha), o estado é **desconhecido** e nunca é tratado como inexistência
   (`D-B2C-16`, TECH-001).
6. **Portão de publicação.** Em Production, as rotas públicas respondem 404 até `PUBLIC_SITE=open` (decisão de
   go-live); fora de Production, abertas. A única rota até o catálogo é o Next.js: **a Data API continua desligada e
   `app` nunca entra nos Exposed schemas** (runbook); a verificação se repete depois do `migrate`.
7. **CSP com nonce por requisição** no `proxy.ts` (documentação do Next 16), composta com a renovação de sessão
   existente, para toda página HTML. Ficam fora do matcher `/lab` (interno, fora de produção), `/brand/logo` (CSP
   própria), `/v1`, `/api`, `_next` e `favicon.ico`. Toda página HTML passa a ser renderizada por requisição (página
   estática não teria o nonce nos scripts).
8. **Sem cache nas leituras públicas:** aprovação e eficácia do encerramento valem na próxima requisição.
9. **Local.** As páginas vivem em `src/features/catalog/presentation/discovery/` (o Discovery é leitura do catálogo; o
   TECH-011 fixa os módulos) e as rotas em `src/app/(public)/`, que só delegam.

## Consequences

### Positive

- Um erro na aplicação não vaza coluna nem linha não pública: o banco recusa.
- A regra de visibilidade tem uma fonte só, testada como `anon` em PostgreSQL real.
- O site existe, é testado e revisado sem ir ao ar antes da revisão jurídica.
- A CSP cobre também o Admin com o mesmo mecanismo.

### Negative

- `anon` passa a ter `USAGE` em `app`: religar a Data API com `app` exposto publicaria o catálogo público — daí a
  proibição e a verificação no runbook.
- Nenhuma página HTML é gerada estaticamente; revisar no go-live.
- Toda leitura pública vai ao banco; aceitável no volume atual, revisar no go-live (D1).

### Neutral / follow-ups

- Go-live: `PUBLIC_SITE=open`, robots/sitemap, slug e resumo editorial (spec §13.8).
- W6: o CTA de interesse entra no PUSH do Concept sem reestruturar a página.

## Alternatives considered

- **Ler o catálogo público como `luxtory_app` filtrando na consulta.** Uma consulta errada vazaria dados; contraria o
  TECH-052. Rejeitada.
- **Funções `SECURITY DEFINER` que devolvem as linhas públicas, sem RLS.** Esconde a regra em funções e dispensa a RLS.
  Rejeitada.
- **Views num schema próprio.** Mais objetos e privilégios nas tabelas-base do mesmo jeito. Rejeitada.
- **CSP sem nonce (`'unsafe-inline'`) ou com SRI experimental.** A primeira quase não protege; a segunda é
  experimental no Next 16. Rejeitadas.
- **Publicar com `noindex` em vez do portão.** A página continuaria acessível antes da revisão jurídica. Rejeitada pela
  Luxtory.

## References

- Spec: [`catalog`](../specs/catalog.md) §13 · [`communication`](../specs/communication.md)
- `03`: ADR-001, ADR-002, TECH-001, TECH-011, TECH-052, TECH-100, §13
- [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md), [ADR-0006](0006-acesso-a-dados.md),
  [ADR-0007](0007-ambientes-pre-lancamento-sem-staging.md), [ADR-0010](0010-catalogo-versoes-e-mutacoes-do-admin.md),
  [ADR-0012](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md)

## Atualização W4.2 (2026-10-19)

Mesma leitura anônima sob RLS para a página da Home Edition (`/colecao/[homeConceptId]/home-editions/[homeEditionId]`):
a Home Edition é pública só `published` e com Home Concept público; o predicado passa a `home_concept_is_public`
([ADR-0019](0019-ontologia-home-concept-home-edition-second-home.md); spec `catalog` §17.7).
