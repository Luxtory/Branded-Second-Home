# 0003. Design System como camada compartilhada de apresentação

- **Date**: 2026-09-25
- **Status**: Accepted
- **Amended by**: [ADR-0004](0004-toolchain-bibliotecas-e-pipeline.md) — carregamento de fontes (decisão 4)
- **Deciders**: Luxtory (produto e marca); Engenharia
- **Tags**: frontend, design-system, architecture, performance, accessibility

## Context

- O R1 (site público: Discovery + Interesse) precisa de um Design System antes da primeira tela.
- O scaffold do frontend (W0) ainda não existe: não há `package.json` nem versões fixadas de Next.js.
- O `CLAUDE.md` prevê só `src/features/<módulo>/` (slices que não importam uns dos outros) e `src/app/`
  (rotas). Um sistema visual usado por todas as slices não cabe em nenhuma delas.
- O `CLAUDE.md` proíbe apagar, mover ou renomear arquivos. O que for criado agora precisa sobreviver ao W0
  sem reescrita.
- ADR-0002 exige operação econômica: nada de serviço pago sem necessidade.

## Decision

1. **Local.** O Design System vive em `src/design-system/` como camada compartilhada **apenas de apresentação**,
   sem domínio, sem I/O e sem dependência de slice. Qualquer `presentation/` de slice e `src/app/` pode
   importá-lo; ele não importa nada do projeto.
2. **Tokens.** Fonte única em `src/design-system/tokens/tokens.json` (formato W3C DTCG). `tokens.css` (CSS custom
   properties `--lx-*`) é gerado por `scripts/build-tokens.mjs`, sem dependências. Se o W0 adotar Tailwind,
   o `@theme` consome essas variáveis e não redefine valores.
3. **CSS tecnologicamente neutro.** Cascade layers (`lx.tokens`, `lx.base`, `lx.layout`, `lx.components`,
   `lx.utilities`) e classes `lx-*` (BEM). Os componentes React do pós-W0 são wrappers finos que só compõem
   essas classes. Estilos não são reescritos em outra tecnologia.
4. **Fontes.** Newsreader, Hanken Grotesk e Courier Prime (todas SIL OFL 1.1, gratuitas), self-hosted em woff2
   (subset latin) com `OFL.txt`. Sem requests a terceiros. No W0, `next/font/local` aponta para os mesmos arquivos.
5. **Testes sem dependências.** `node --test src/design-system/scripts/*.test.mjs` (Node 22 nativo) verifica tokens,
   contraste, literais proibidos, terminologia e o peso das fontes até a CI do W0 existir.
6. **Lab.** `src/design-system/lab/index.html` é a referência de QA visual. No W0 ganha uma rota interna
   `noindex` **adicional**. O HTML permanece.

## Consequences

### Positive

- Um só lugar para decidir cor, tipo, espaço e motion; slices e IAs não improvisam.
- Nada é jogado fora no W0: CSS, tokens, fontes e Lab entram no Next.js como estão.
- Contraste e hardcodes são garantidos por teste, não por disciplina.
- Custo zero de fontes e nenhum rastreamento de terceiros.

### Negative

- Sem React agora, a composição é por markup e classes. Os wrappers ficam para depois do W0.
- Até a CI do W0, os testes do DS rodam só localmente (comando documentado no `CLAUDE.md`).

### Neutral / follow-ups

- W0: incluir `node --test src/design-system/scripts/*.test.mjs` na CI; criar os wrappers React; adicionar a rota `/lab` interna.
- Receber o kit oficial de logos em `src/design-system/brand/logo/` (commit aditivo).

## Alternatives considered

- **Esperar o W0 para começar o DS.** Atrasa o R1 e deixa o W0 sem contrato visual. Rejeitada.
- **Fazer o scaffold Next.js agora.** Antecipa decisões do W0 (versões, lint, testes). Rejeitada por decisão
  da Luxtory: implementação neutra agora, React depois.
- **Tailwind como fonte dos tokens.** Acopla o sistema a uma ferramenta ainda não escolhida. Tokens DTCG + CSS
  servem a qualquer escolha do W0.
- **Design System dentro de uma slice (ex.: `platform/presentation`).** Obrigaria slices a importar internals
  de outra slice, o que viola a regra de fronteiras do `CLAUDE.md`.
- **Fontes comerciais do Luxtory2.0 (SangBleu Kingdom, Suisse Intl).** Exigem licença web paga e não
  confirmada. Rejeitadas: a Luxtory quer apenas fontes gratuitas.

## References

- Spec: [`docs/specs/design-system.md`](../specs/design-system.md)
- Referência: [`docs/reference/design-system.md`](../reference/design-system.md)
- ADR-0002 (plataforma e custo)
