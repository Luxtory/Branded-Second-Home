# Logo Luxtory — regras de uso

> **Status: aguardando o kit oficial** (a Luxtory vai enviar). Nenhum arquivo provisório é versionado aqui:
> a regra do repositório proíbe apagar ou renomear arquivos, então só o kit definitivo entra, num commit
> aditivo. Até lá, a UI usa o slot `lx-logo--pending`, que nunca é substituído por texto estilizado.

## Kit esperado

| Arquivo (nome sugerido) | Lockup | Cor | Uso principal |
|---|---|---|---|
| `luxtory-horizontal-moroccan-blue.svg` | horizontal | Moroccan Blue `#0F4E67` | Header e footer sobre `paper`/`wash` |
| `luxtory-horizontal-warm-sand.svg` | horizontal | Warm Sand `#CDAD8E` | Header e footer sobre `night` |
| `luxtory-horizontal-white.svg` | horizontal | Pure White | Sobre fotografia (com scrim) |
| `luxtory-vertical-moroccan-blue.svg` / `-warm-sand.svg` | vertical | idem | Momentos de marca (encerramento, splash) |
| `luxtory-icon-moroccan-blue.svg` / `-warm-sand.svg` | ícone | idem | Favicon, avatar, espaços < 120px |

A Luxtory confirma qual lockup horizontal é o canônico. No Luxtory2.0 havia duas proporções diferentes.

## Regras

- **Imutável.** Sem redesenho, recoloração, distorção, contorno, sombra, gradiente ou filtro (inclusive
  `filter: invert`). Proporção sempre travada (`height` definido, `width: auto`).
- **Fundo permitido:**

  | Fundo | Versão |
  |---|---|
  | `paper` / `wash` | Moroccan Blue |
  | `night` | Warm Sand ou Pure White |
  | Fotografia | Pure White, somente sobre scrim ≥ 68% |

  Nunca Warm Sand sobre branco. O contraste de 2.11:1 enfraquece a marca.
- **Respiro mínimo:** metade da altura do ícone em todos os lados. Nenhum texto, borda ou imagem entra nessa área.
- **Tamanho mínimo:** horizontal com 120px de largura (digital); ícone com 24px.
- **Header:** altura controlada por `--lx-logo-height` (padrão 2rem). O link tem nome acessível
  "Luxtory — página inicial"; a imagem usa `alt=""`.
- **Responsivo:** horizontal a partir de 360px de largura de viewport; abaixo disso, o ícone.
