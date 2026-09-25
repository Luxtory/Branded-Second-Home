# Fontes do Design System Luxtory

Todas **gratuitas**: licença [SIL Open Font License 1.1](https://openfontlicense.org/). Uso comercial, web
e self-hosting permitidos sem custo nem registro. Cada pasta traz o `OFL.txt` da família.

| Voz | Família | Arquivo | Peso (bytes) | Preload |
|---|---|---|---:|:-:|
| LUXURY — Display | Newsreader (opsz 72, 400–500) | `newsreader/newsreader-opsz72-roman-latin.woff2` | 56 848 | ✓ |
| LUXURY — Display itálico | Newsreader (opsz 72, 400 italic) | `newsreader/newsreader-opsz72-italic-latin.woff2` | 22 856 | — |
| UTILITY — Sans | Hanken Grotesk (400–600) | `hanken-grotesk/hanken-grotesk-latin.woff2` | 34 704 | ✓ |
| STORY — Script | Courier Prime 400 | `courier-prime/courier-prime-400-latin.woff2` | 18 640 | — |
| STORY — Script | Courier Prime 700 | `courier-prime/courier-prime-700-latin.woff2` | 19 348 | — |

Total 152 396 bytes (limite 220 000). Preload 91 552 bytes em 2 arquivos (limite 100 000). Os limites são
de **performance** (download), verificados por `scripts/fonts.test.mjs` a partir de `manifest.json`.

## Origem (reprodutível)

Subset **latin** (U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC…), que cobre todo o português. Arquivos
baixados da API CSS2 do Google Fonts com user-agent moderno, mantendo só o bloco `/* latin */`:

```
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,72,400;0,72,500;1,72,400&family=Hanken+Grotesk:wght@400..600&family=Courier+Prime:wght@400;700&display=swap
```

Com o eixo `opsz` fixo em 72, a API devolve a Newsreader já instanciada no corte óptico display (peso ainda
variável). Não é preciso ferramenta de instanciação.

Licenças: `https://raw.githubusercontent.com/google/fonts/main/ofl/<família>/OFL.txt`.

## Fallback

`styles/fonts.css` define faces de fallback com `size-adjust` medido no Chromium para reduzir CLS:
Newsreader ≈ Times New Roman × 1.10 e Hanken Grotesk ≈ Arial × 1.00. A Courier Prime é metricamente
compatível com Courier New.
