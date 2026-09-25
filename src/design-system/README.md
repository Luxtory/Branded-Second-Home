# src/design-system — Design System Luxtory

**LUXTORY = LUXURY + STORY.** Camada compartilhada de apresentação (ADR-0003). Não contém domínio.

- Uso normativo: [`docs/reference/design-system.md`](../../docs/reference/design-system.md)
- Contrato: [`docs/specs/design-system.md`](../../docs/specs/design-system.md)
- Lab (QA visual): [`lab/index.html`](lab/index.html). Sirva por HTTP (ex.: `python3 -m http.server`) para as
  fontes carregarem.

| Pasta | Conteúdo |
|---|---|
| `tokens/` | `tokens.json` (fonte única, DTCG) → `tokens.css` (gerado: `node src/design-system/scripts/build-tokens.mjs`) |
| `styles/` | `index.css` (único import), base, layout e `components/*.css` (classes `lx-*`) |
| `fonts/` | Newsreader, Hanken Grotesk e Courier Prime (SIL OFL, gratuitas), `manifest.json` com os limites de peso |
| `icons/` | ícones hairline SVG (`currentColor`) |
| `brand/logo/` | kit oficial de logos (arquivos intocados) + `manifest.json` (chaves e sha256) + regras de uso |
| `scripts/` | build de tokens e checagens, mais testes `node --test src/design-system/scripts/*.test.mjs` |
