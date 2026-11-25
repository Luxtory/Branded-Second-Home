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
| 0021 | [Formalização atômica, base civil e outbox consumer-aware](0021-formalizacao-calendario-civil-e-outbox.md) | Accepted |
| 0022 | [Sorteio auditável em três consumidores e elegibilidade temporal do outbox](0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md) | Accepted |
| 0023 | [Carimbo de COMMIT do servidor na anterioridade do sorteio (T-910)](0023-carimbo-de-commit-do-servidor-no-sorteio.md) | Accepted |
| 0024 | [Selagem por exercício, custódia em camadas e fronteira de confiança do inventário](0024-custodia-selagem-e-fronteira-de-confianca.md) | Accepted |
| 0025 | [Direito de Uso: ledger único conferido pelos fatos, rotação derivada e fronteira de confiança da W11](0025-direito-de-uso-ledger-rotacao-derivada-e-fronteira.md) | Accepted (risco residual ratificado, exclusivo da W11) |
| 0026 | [Reserva de uso próprio: autorização no banco presa à reserva, ativação privilegiada e instante de aceite](0026-reserva-de-uso-proprio-autorizacao-no-banco-e-ativacao.md) | Accepted (arquitetura; risco residual pendente de ratificação) |
| 0027 | [Ciclo da reserva de uso próprio: transições só-inserção, chaves K1/K2 e autorização independente](0027-ciclo-da-reserva-de-uso-proprio-e-autorizacao-independente.md) | Accepted (merge do #80, `5d9b636`, 2026-11-03; antes: Proposed — E0 em auditoria) |
| 0028 | [Jornada Second Home Partners: superfície, portão e contato próprios sobre a infraestrutura existente](0028-jornada-second-home-partners.md) | Accepted (plano v3.3 aprovado pelo fundador em 2026-11-12) |
| 0029 | [Governança do repositório: identidade dos agentes, revisão obrigatória e Environment de produção](0029-governanca-do-repositorio-identidades-revisao-e-environment.md) | Proposed (PR draft de governança, 2026-11-18) |
| 0030 | [Seleção Luxtory, parâmetros e declaração de convidados: regras no banco, K3 e vigência só por inserção](0030-selecao-luxtory-parametros-e-convidados.md) | Accepted (plano corrigido da W14 aprovado em 2026-11-19; implementação em PR draft; concluída: #99 `c681727`) |
| 0031 | [Membership: estado com histórico escrito pelo banco e elegibilidade verificada no executor](0031-membership-estado-historico-e-elegibilidade-no-executor.md) | Accepted (plano da W15 aprovado em 2026-11-19; C1 aprovado; E3 + E4 em PR draft; concluída: #100 `108d6f5`) |
| 0032 | [PRL por data com autoridade no banco, parâmetros econômicos globais e contrato de snapshot](0032-prl-parametros-economicos-e-contrato-de-snapshot.md) | Accepted (plano da W16 aprovado em 2026-11-20; E0–E2 em PR draft, parada no C1; concluída: #101 `f1fd297`) |
| 0033 | [Créditos: lote + ledger com buckets escritos pelo banco, snapshot persistido na originação e K4](0033-creditos-lote-ledger-snapshot-e-k4.md) | Accepted (W17 iniciada pelo fundador em 2026-11-22; PR draft) |
| 0034 | [Políticas comerciais: esquema fechado por mecanismo, versões append-only e avaliação pura](0034-politicas-comerciais-esquema-fechado-e-avaliacao.md) | Accepted (W18; concluída: #107 `1e974bc`) |
| 0035 | [Pagamentos em duas fases, Fee por operação, settlement por categoria e K5](0035-pagamentos-duas-fases-fee-settlement-e-k5.md) | Accepted (W19; concluída: #108 `2fa37e8`) |
| 0036 | [Depósito Luxchange: cessão integral da reserva, snapshot por noite, completude no banco e K6](0036-deposito-luxchange-cessao-snapshot-por-noite-e-k6.md) | Accepted (W20; concluída: #109 `5b8a047`; emenda W21 aprovada no C0 da W21) |
| 0037 | [Request: lastro no banco, complemento por datas sob a condição do aceite, encerramentos e contrato das capabilities](0037-request-lastro-complemento-por-datas-e-encerramentos.md) | Accepted (C0 da W21 aprovado pelo fundador em 2026-11-24; antes: Proposed; implementação pendente) |

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
