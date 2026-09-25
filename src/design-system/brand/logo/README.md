# Logo Luxtory — kit oficial e regras de uso

> **Status: kit oficial recebido em 2026-09-25** (upload `53c4a5c`). Os arquivos ficam **byte a byte** como
> enviados, com hash sha256 fixado em [`manifest.json`](manifest.json) e verificado por
> `scripts/brand.test.mjs`. Os nomes originais foram mantidos, porque a regra do repositório proíbe renomear:
> **o código e a documentação usam só as chaves do manifest**, nunca o nome do arquivo de memória.

## Kit

| Chave (manifest) | Arquivo | Proporção (viewBox) | Fundos | Uso |
|---|---|---|---|---|
| `horizontal/moroccan-blue` | `Logo-Luxtory-Moroccan-Blue-Horizontal.svg` | 6.41 : 1 (1474 × 230) | paper, wash | Header e footer de dia (**lockup canônico**) |
| `horizontal/warm-sand` | `Logo-Luxtory-Warm-Sand-Horizontal.svg` | 6.41 : 1 (1474 × 230) | night | Header noturno, header overlay, menu mobile |
| `vertical/moroccan-blue` | `Luxtory_logo_vertical_moroccan_blue.svg` | 2.17 : 1 (1176 × 542) | paper, wash | Momentos de marca (encerramento, confirmação) |
| `vertical/warm-sand` | `Logo-Luxtory-Warm-Sand-Vertical.svg` | 2.17 : 1 (1176 × 542) | night | Footer, momentos de marca à noite |
| `icon/moroccan-blue` | `Logo-Luxtory-Moroccan-Blue-Icone.svg` | 1.14 : 1 (370 × 324) | paper, wash | Favicon, avatar, header < 360px, espaços < 120px |
| `icon/warm-sand` | `Logo-Luxtory-Warm-Sand-Icone.png.svg` | 1.14 : 1 (370 × 324) | night | Idem, à noite |

**Falta no kit:** versão Pure White. Sobre fotografia use `horizontal/warm-sand` com scrim ≥ 68% até a Luxtory
decidir se haverá uma versão branca.

## Análise técnica do kit (2026-09-25)

- **Seguro:** vetor puro (8 paths por arquivo), sem raster, script, link externo ou texto como fonte. As cores
  visíveis são só da paleta (`#0F4E67`, `#CDAD8E`). O `#ffffff` é apenas o fill padrão do grupo, sempre
  sobrescrito.
- **Mesmo desenho:** a geometria é idêntica entre as variantes de cor de cada lockup. O horizontal Warm Sand é o
  mesmo arquivo do Luxtory2.0 (md5 igual). O lockup horizontal canônico é o de 1474 × 230, e o antigo "branco" de
  outra proporção do Luxtory2.0 fica descartado.
- **`mix-blend-mode: lighten`** herdado do Inkscape nos grupos do wordmark. **Inline no HTML, o "LUXTORY" some
  sobre fundo claro** (verificado em render). Como `<img>`, a imagem é isolada e renderiza corretamente.
- **Os ícones são recortes:** os arquivos "Icone" são o logo vertical com o viewBox recortado no símbolo. O
  wordmark continua no arquivo, fora da área visível (por isso o ícone Moroccan Blue tem formas em areia: elas não
  aparecem). O que se vê é o símbolo em uma cor só.
- **Sem respiro embutido:** nos horizontais e verticais, o conteúdo ocupa o viewBox inteiro. O respiro vem do CSS
  (`lx-logo`).
- **Nomes e metadados inconsistentes** (snake_case, `.png.svg`, `sodipodi:docname` antigo): não afetam o render. O
  manifest resolve.
- **Otimização (SVGO)** fica como sugestão para o W0, em cópia derivada gerada no build e com os originais
  preservados. Cada arquivo tem cerca de 15 KB.

## Regras

- **Imutável.** Sem redesenho, recoloração, distorção, contorno, sombra, gradiente ou filtro (inclusive
  `filter: invert`). Proporção sempre travada (`height` definido, `width: auto`).
- **Sempre `<img>`** (ou `<picture>` / `background-image`). **Nunca SVG inline.** Se um dia for inevitável, use
  `isolation: isolate` no `<svg>` e `overflow: hidden`.
- **Fundo permitido:**

  | Fundo | Versão |
  |---|---|
  | `paper` / `wash` | Moroccan Blue |
  | `night` | Warm Sand |
  | Fotografia | Warm Sand sobre scrim ≥ 68% (até existir uma versão Pure White) |

  Nunca Warm Sand sobre branco: o contraste de 2.11:1 enfraquece a marca. Nunca Moroccan Blue sobre night: o
  contraste de 1.29:1 faz o logo sumir.
- **Respiro mínimo:** metade da altura do logo em todos os lados. No horizontal, isso equivale à metade da altura do
  ícone. Nenhum texto, borda ou imagem entra nessa área. `lx-logo` garante o respiro com padding e margin.
- **Tamanho mínimo:** horizontal com 120px de largura (cerca de 19px de altura); ícone com 24px de altura.
- **Header:** altura por `--lx-logo-height` (padrão 2rem; `lx-logo--vertical` usa 4.5rem). O link tem o nome
  acessível "Luxtory — página inicial" e a imagem usa `alt=""`. Fora de link, use `alt="Luxtory"`.
- **Responsivo:** horizontal a partir de 360px de viewport; abaixo disso, o ícone, via `<picture>`:

```html
<a class="lx-logo" href="/" aria-label="Luxtory — página inicial">
  <picture>
    <source media="(max-width: 22.49rem)" srcset="…/Logo-Luxtory-Moroccan-Blue-Icone.svg">
    <img src="…/Logo-Luxtory-Moroccan-Blue-Horizontal.svg" alt="" width="1474" height="230">
  </picture>
</a>
```
