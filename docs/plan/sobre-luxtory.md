# Sobre a Luxtory — plano de implementação

**Goal:** copy institucional aprovada compartilhada, pronta para revisão visual em Preview.
**Architecture:** corpo Server Component e i18n únicos; entradas finas preservam shells e portões independentes.
**Tech Stack:** Next.js App Router, React, TypeScript, Core DS, Vitest e Playwright/axe.
**Spec:** [catalog §15](../specs/catalog.md#15-sobre-a-luxtory).

## Restrições e foco da revisão inicial

Copy, parágrafos, ordem e destaques verbatim; canônicos e Frameworks intactos. Contexto obrigatório
`discovery | brandPartners`; nunca cruzar jornadas. Foto JPEG original 884 × 990. Canonical por entrada e
noindex em Preview/local. Com o portão fechado, nada da copy em HTML/RSC/metadados. Header sólido sem foto,
copy longa sem truncamento em 320 px, fechamentos locais em itálico com filete, teto B2B preservado e menu ativo.
A revisão visual em `catalog` §15.5, registrada abaixo, autoriza a edição da copy e a mesma escala nas duas entradas.

## 1. Conteúdo, rotas e integração — sequencial

Arquivos: `presentation/about/{content,context,metadata}.ts/tsx`, `i18n/about-pt-br.ts`,
duas rotas `sobre/page.tsx`, registros `paths.ts` e shells `site.tsx` das jornadas,
`styles/core/about.css`, `styles/index.css`, `public/images/about/marcos-rodopiano.jpg`.
Consome: SiteShell/DiscoverySite/BrandPartnersSite, tokens e patterns Core, portões existentes.
Produz: `AboutContent({ journey }: { journey: AboutJourney })`, `aboutContext(journey)`, `aboutMetadata(journey)`.

- [x] Escrever testes de copy (hash do pedido), render, destinos, imagem e portões; executar e observar implementação ausente.
- [x] Implementar conteúdo/i18n/asset, contexto e metadados; rotas compõem o shell próprio com `current="about"`.
- [x] Adicionar Sobre à navegação sem alterar destinos existentes; B2B usa header sólido somente em Sobre.
- [x] Executar testes direcionados; resultado esperado: todos passam.

## 2. Verificação e entrega — sequencial, depende de 1

Arquivos: `tests/e2e/about.spec.ts`, aplicações de comunicação, CHANGELOG e NOTES local.

- [x] Exercitar copy idêntica, links/estado ativo, foto, teclado/foco, metadata e portões fechados em Playwright.
- [x] Gate de UI e larguras exigidas; capturas 390 e 1440 px.
- [x] `npm run verify`, E2E e trace; corrigir falhas reais e registrar evidências.
- [x] Revisão completa da branch; commit, push e PR draft, sem merge.
- [x] Confirmar deployment READY pela Git integration e entregar URLs das duas rotas e PR.

Evidências visuais do build: [390 e 1440 px por jornada](../reviews/sobre/README.md).


## Ajustes da revisão visual (catalog §15.5)

- [x] Reproduzir diferenças de escala e blocos longos com testes de navegador (RED).
- [x] Unificar composição, encurtar textos preservando fatos e remover abertura duplicada.
- [x] Medir paridade e máximo de quatro linhas em seis larguras, incluindo o print 1266 × 546 (GREEN).
- [ ] Atualizar capturas, executar gates/regressões e publicar no mesmo PR/Preview, sem merge.
