# Architecture Decision Records

Decisions that shape this project's architecture, recorded in the format
described by Michael Nygard. The ADR process itself is established in
[ADR-0001](0001-record-architecture-decisions.md).

## Index

| #    | Title                                                                | Status   |
|------|----------------------------------------------------------------------|----------|
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md) | Accepted |
| 0002 | [Plataforma (Vercel + Supabase + Upstash) e adaptações econômicas ao 03](0002-plataforma-e-adaptacoes-economicas.md) | Accepted |
| 0003 | [Design System como camada compartilhada de apresentação](0003-design-system-camada-compartilhada.md) | Accepted |
| 0004 | [Toolchain, bibliotecas e pipeline](0004-toolchain-bibliotecas-e-pipeline.md) | Accepted |
| 0005 | [Testes com PostgreSQL real, sem Docker](0005-testes-com-postgresql-real-sem-docker.md) | Accepted |
| 0006 | [Acesso a dados: schemas, papéis, migrations e leituras sob RLS](0006-acesso-a-dados.md) | Accepted |
| 0007 | [Ambientes antes do lançamento: sem staging (D3 adiada)](0007-ambientes-pre-lancamento-sem-staging.md) | Accepted |
| 0008 | [Autenticação e autorização administrativa](0008-autenticacao-e-autorizacao-administrativa.md) | Accepted |
| 0009 | [Superfícies de produto mobile-first e shell de aplicação](0009-superficies-de-produto-mobile-first.md) | Accepted |
| 0010 | [Catálogo: versões, aprovação comercial, Investor e mutações do Admin pela UI](0010-catalogo-versoes-e-mutacoes-do-admin.md) | Accepted |
| 0011 | [Camada de comunicação das páginas públicas: Framework Mestre e Frameworks preenchidos](0011-camada-de-comunicacao-publica.md) | Accepted |
| 0012 | [Framework B2C como fonte canônica principal da comunicação B2C](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md) | Accepted |
| 0013 | [Framework Brand Partners como fonte canônica da comunicação Brand Partners](0013-framework-brand-partners-fonte-canonica.md) | Accepted |
| 0014 | [Discovery público: leitura anônima sob RLS, CSP com nonce e portão de publicação](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md) | Accepted |
| 0015 | [Mídia do catálogo: metadados no PostgreSQL, binários no Supabase Storage, entrega pelo próprio domínio](0015-midia-do-catalogo-metadados-e-storage.md) | Accepted |
| 0016 | [Nova versão do Framework Brand Partners (Home Concept, Home Edition e Second Home)](0016-framework-brand-partners-versao-2026-10-12.md) | Accepted |
| 0017 | [Idempotência de mutações públicas não críticas, fora do pipeline de commands críticos](0017-idempotencia-de-mutacoes-publicas-nao-criticas.md) | Accepted |
| 0018 | [Contato e pré-qualificação do interesse: dados separados, hash chaveado e contexto de apresentação assinado](0018-contato-e-pre-qualificacao-do-interesse.md) | Accepted |
| 0019 | [Ontologia Home Concept → Home Edition → Second Home em todas as camadas](0019-ontologia-home-concept-home-edition-second-home.md) | Accepted |
| 0020 | [Party cifrada, HMAC com rotação e delegação pendente até a ativação](0020-party-cifrada-e-delegacao.md) | Accepted |

The technical decisions ADR-001…008 of the canonical
[03 — Technical Spec](../specs/canonical/03-technical-spec.md) also apply, by reference.

## Adding a new ADR

1. Copy `_template.md` to `NNNN-<short-title>.md` (next sequential number).
2. Fill in context, decision, consequences, and alternatives.
3. Open a PR. Review happens alongside the code changes the ADR justifies.
4. Once merged, append it to the index above.

## Status lifecycle

- **Proposed** — under discussion
- **Accepted** — current decision; in effect
- **Deprecated** — no longer recommended, but still informative
- **Superseded by ADR-XXXX** — replaced by a newer decision; link to the successor
