# Design System Luxtory — referência

> Uso normativo. Contrato e decisões: [`docs/specs/design-system.md`](../specs/design-system.md) ·
> Arquitetura: [ADR-0003](../adr/0003-design-system-camada-compartilhada.md) ·
> Código: [`src/design-system/`](../../src/design-system/) · Lab: [`src/design-system/lab/index.html`](../../src/design-system/lab/index.html)

**LUXTORY = LUXURY + STORY.** *Show the luxury. Tell the story.*

| | Papel | Na interface |
|---|---|---|
| **LUXURY — a Planta** | Como a marca se apresenta | grid arquitetônico, proporção, hairlines, linhas de dimensão, espaço, fotografia em Frames |
| **STORY — o Roteiro** | Como a marca se comunica | sequência de Scenes, Scene Markers com metadado real, legendas, ritmo dia → noite |

---

## 1. Como usar

```html
<link rel="preload" href="…/fonts/newsreader/newsreader-opsz72-roman-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="…/fonts/hanken-grotesk/hanken-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="…/src/design-system/styles/index.css">
<body data-ground="paper">
```

- Importe **só** `styles/index.css`. Faça preload apenas dos dois arquivos marcados em `fonts/manifest.json`.
- Monte telas com as classes `lx-*` e os tokens `var(--lx-*)`. Nunca escreva cor, fonte, duração, easing ou z-index
  literais: o `check-hardcodes` falha.
- Para alterar um token, edite `tokens/tokens.json` e rode `node src/design-system/scripts/build-tokens.mjs`.
- Testes: `node --test src/design-system/scripts/*.test.mjs` (Node 22, sem dependências).
- Depois do W0, os componentes React são wrappers finos que só compõem estas classes (ADR-0003).

## 2. Gramática narrativa

Nomes para a equipe e as IAs. Não aparecem para o usuário.

| UI convencional | Luxtory | Implementação |
|---|---|---|
| Hero | **Opening Frame** | `lx-scene lx-scene--opening` + `lx-scene__backdrop` |
| Grupo de seções | **Chapter** | sequência de Scenes com a mesma paleta de ground |
| Section | **Scene** | `<section class="lx-scene" data-ground="…" aria-labelledby>` |
| Eyebrow | **Scene Marker** | `lx-marker` (Courier Prime) |
| Imagem | **Frame** | `lx-frame lx-frame--{establishing,living,detail}` |
| Galeria | **Sequence** | `lx-sequence` |
| Dado objetivo | **Evidence** | `lx-evidence` (`dl`) |

**Arco de página** (framework, não template): Opening Frame → Contexto → Desejo/Tensão → Descoberta →
Experiência → Evidence → Decisão.

Em páginas públicas, a função narrativa e a ordem das mensagens vêm dos 5Ps do Framework preenchido
([`docs/specs/communication.md`](../specs/communication.md) §7): relação semântica com esta gramática, não estrutural.
A ordem narrativa e a transição de consciência vêm do Framework da jornada —
[B2C](../specs/communication/framework-b2c.md) ou [Brand Partners](../specs/communication/framework-brand-partners.md)
(§7, §8); o arco acima é só vocabulário de composição.

## 3. Cor

### Paleta de marca (imutável)

| Token | Hex | Papel |
|---|---|---|
| `--lx-palette-moroccan-blue` | `#0F4E67` | ênfase, links, texto de apoio, foco em paper |
| `--lx-palette-dark-moroccan-blue` | `#003D52` | tinta (texto), ground night, ação primária em paper |
| `--lx-palette-warm-sand` | `#CDAD8E` | luz: hairlines, markers e ação em night |
| `--lx-palette-dark-warm-sand` | `#9E8567` | aviso (ícone/borda) |
| `--lx-palette-pure-white` | `#FFFFFF` | papel |

Derivados funcionais: `--lx-derived-sand-wash` `#F7F2ED`, `--lx-derived-error` `#9B2226` e
`--lx-derived-error-on-night` `#F2B8B5`. Não são cores de marca e não viram decoração.

### Grounds (fundos narrativos)

| `data-ground` | Fundo | Texto | Apoio / marker / link | Ação primária | Foco |
|---|---|---|---|---|---|
| `paper` (dia) | Pure White | Dark Moroccan | Moroccan Blue | Dark Moroccan + branco | Moroccan Blue |
| `wash` (fim de tarde) | Sand Wash | Dark Moroccan | Moroccan Blue | Dark Moroccan + branco | Moroccan Blue |
| `night` (noite, com grain) | Dark Moroccan | Pure White | Warm Sand | Warm Sand + Dark Moroccan | Warm Sand |

Os componentes leem `--lx-color-*`: `bg`, `surface`, `fg`, `fg-muted`, `accent`, `marker`, `rule`,
`rule-strong`, `focus`, `action-bg`, `action-bg-hover`, `action-fg`, `field-bg`, `field-fg`, `field-border`,
`error`, `success`, `warning`, `skeleton`, `selection-bg` e `selection-fg`. Para trocar o fundo, troque
`data-ground`; nunca a cor do componente.

### Regras de contraste (medidas; impostas por `check-contrast`)

- Texto sobre paper e wash é sempre azul (Dark Moroccan 11.74 · Moroccan Blue 9.11).
- **Warm Sand nunca é texto sobre branco** (2.11). Areia vira texto só sobre Dark Moroccan (5.57).
- Warm Sand sobre Moroccan Blue (4.32) serve só a texto grande e UI. Por isso night é Dark Moroccan.
- Dark Warm Sand (3.50) só em ícone, borda ou texto ≥ 24px.
- Borda de campo nunca em areia: sempre `field-border` (≥ 3:1).
- **Texto sobre imagem: só branco, sobre scrim Dark Moroccan ≥ 68%** (4.61:1 no pior pixel).

## 4. Tipografia

| Voz | Família | Classe | Tamanho (fluido) | Uso |
|---|---|---|---|---|
| LUXURY | Newsreader 400 | `lx-display-xl` | 44 → 96px | Opening Frame |
| | | `lx-display-l` | 36 → 68px | headline de Scene |
| | | `lx-display-m` | 28 → 44px | nomes de Concept, títulos de seção |
| | Newsreader 500 | `lx-display-s` | 22 → 28px | subtítulos, statements curtos |
| UTILITY | Hanken Grotesk | `lx-lead` | 19 → 22px | abertura de texto |
| | | `lx-body` | 17 → 18px | texto corrido (≤ 66ch) |
| | | `lx-small` | 15px | apoio (cor `fg-muted`) |
| | Hanken Grotesk 500 | `lx-label` | 16px | rótulos, botões, navegação |
| STORY | Courier Prime | `lx-marker`, `lx-caption` | 13px | markers (caixa alta) e legendas |

- **Virada em itálico:** no máximo **uma** expressão em `<em>` por headline, o "momento story".
- Headline de 1 a 2 linhas; parágrafo de 2 a 3 linhas (máximo habitual de 4); uma ideia por bloco.
- O nível do heading (`h1`…`h3`) segue a hierarquia do conteúdo; o tamanho vem da classe.
- As três fontes são gratuitas (SIL OFL 1.1), hospedadas no próprio site: 152 KB no total, 91.5 KB críticos.

## 5. Courier Prime e Scene Markers

| Faça | Não faça |
|---|---|
| Metadado real: lugar, hora, luz, capítulo (`VARANDA · 18:37`, `CAPÍTULO II · A CASA`) | Marker decorativo sem informação ("SCENE 01" em todo bloco) |
| No máximo 1 marker por Scene | Courier em texto corrido, label, botão ou formulário |
| `INT.`/`EXT.` só em Opening Frame com fotografia real | `INT.`/`EXT.` como gimmick ou sobre Typographic Frame |
| Legenda (`lx-caption`) que muda a leitura da imagem | Legenda que descreve o óbvio |

Markup: `<p class="lx-marker"><span>Varanda</span><span>18:37</span></p>`. O separador "·" é decorativo e não
é lido, e nunca começa uma linha quebrada. No rail (≥ 1024px), as partes empilham como nota de margem de roteiro.

## 6. Layout

| Token | Valor |
|---|---|
| Breakpoints | `sm` 30rem · `md` 48rem · `lg` 64rem · `xl` 80rem · `2xl` 100rem |
| Colunas | 4 (< md) · 8 (md–lg) · 12 (≥ lg) |
| Container | `--lx-layout-container-max` 90rem + `--lx-layout-margin` fluida (20 → 96px) |
| Gutter | `--lx-layout-gutter` 16 → 32px |
| Espaço | base 4px: `--lx-space-{1,2,3,4,6,8,12,16,24,32,48}`; `--lx-space-scene` (64 → 160px) entre Scenes |

- `lx-grid` com filhos `lx-col-{full, rail, content, text, media}`. No lg: rail = colunas 1–2, content = 3–12,
  text = 3–7, media = 8–12.
- **Marker Rail:** no desktop, o marker fica na margem (`lx-scene__rail`, sticky). No mobile, sobe para cima do headline.
- **Assimetria:** texto em 5 colunas e Frame sangrando até a borda (`lx-scene__media`). `lx-scene--media-start` espelha.
- **Mobile é projetado, não comprimido:** Frames em largura total, Establishing em 4:5, Sequence com parte do
  próximo quadro visível, menu em tela cheia com CTA fixo.
- Nada de grade uniforme de cards. A Coleção alterna 7 e 4 colunas, com deslocamento vertical.
- **Mobile-first com paridade funcional em toda superfície** ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)):
  o estilo base é o do celular e cada breakpoint só acrescenta (`@media (min-width: <token>)`; `max-width` é
  recusado pelo `check-hardcodes`). Toda função é alcançável e concluível a partir de 320 px; a ergonomia pode mudar
  (por exemplo, uma tabela **pode** virar cartões), o resultado não. Exceção só como decisão de produto registrada
  na spec da funcionalidade.
- **Overflow:** nada de rolagem horizontal não intencional do documento. Rolagem horizontal deliberada só dentro de
  um componente de dados, contida e acessível (região com nome e alcançável por teclado).

## 7. Forma, profundidade e z-index

- Raio `0` em tudo (`--lx-radius-hairline` 2px só em checkbox).
- Hairline de 1px (`--lx-border-hairline`).
- **Uma** sombra: `--lx-shadow-overlay`, só para overlays.
- Proibidos: glassmorphism, glow, gradiente decorativo, cards com sombra, cantos arredondados.
- z-index: `--lx-z-{base, raised, sticky, overlay, modal, toast, skip-link}`.

## 8. Imagem

| Frame | Proporção | Conteúdo |
|---|---|---|
| **Establishing** | 21:9 (4:5 no mobile) | arquitetura, paisagem, destino, relação com o entorno |
| **Living** | 3:2 | a casa sendo vivida |
| **Detail** | 4:5 | materiais, arte, luz, gastronomia, paisagismo |

- Toda imagem acrescenta à história; todo texto muda a leitura da imagem.
- `alt` obrigatório: descreve a cena, não "foto de". `alt=""` só para decoração pura.
- Proporção sempre declarada (CLS zero). O Opening Frame usa `fetchpriority="high"`; os demais, `loading="lazy"`.
- **Sem fotografia oficial:** `lx-frame--typographic` com `data-ground="wash"` (manhã e dia) ou `"night"` (noite)
  no `__media`, conforme a hora narrada. **Nunca** foto de banco fingindo ser o imóvel.
- Scrim (`lx-frame--scrim`, `--scrim-top`) só onde há texto sobre a imagem.
- A Coleção é curadoria de experiências, não grade de imóveis.

## 9. Motion

| Token | Valor | Uso |
|---|---|---|
| `--lx-duration-{instant,quick,base,slow,cinematic}` | 80 · 160 · 240 · 480 · 900ms | micro → transições de cena |
| `--lx-duration-drift` | 4800ms | drift do Opening Frame (1×, ≤ 5s — WCAG 2.2.2) |
| `--lx-ease-{settle,cinematic,exit}` | cubic-bezier | entrada, cena, saída |

- Reveal: classe `lx-reveal` (fade + 12px por scroll-driven animation). O conteúdo é visível sem suporte e sem JS.
- Drift: `lx-frame--drift` (escala 1.03 → 1, uma vez).
- `prefers-reduced-motion: reduce` ou `<html data-motion="reduce">` zeram animações e transições.
- Proibidos: parallax pesado, bounce, glow, efeitos gratuitos.

## 10. Componentes do R1

Estados usam atributos (`disabled`, `aria-invalid`, `aria-busy`, `aria-current`, `aria-expanded`, `[hidden]`),
nunca classes. A cor vem do ground.

### Button · `lx-button`

```html
<a class="lx-button lx-button--primary" href="#interesse">Manifestar interesse
  <svg class="lx-button__icon" aria-hidden="true" focusable="false">…arrow-right…</svg></a>
```

- `--primary`: uma por bloco.
- `--secondary`: alternativa.
- `--quiet`: ação leve, sublinhada.
- `--block`: largura total.
- `--destructive` (W3, superfícies de produto): ação irreversível (encerrar, revogar). Contorno e texto no token de
  erro, sem preenchimento; no hover, só o fundo `surface`. Discreta: não concorre com a ação principal da página.

Altura 48px. Os estados `:hover`, `:active`, `:focus-visible`, `disabled` e `aria-busy="true"` (spinner) já estão
estilizados.

### Text Link · `lx-link`

Sempre sublinhado. `--standalone` acrescenta ícone (`lx-link__icon`) e alvo de 44px.

### Field · `lx-field`

```html
<div class="lx-field">
  <label class="lx-label" for="regiao">Região desejada</label>
  <p class="lx-hint" id="regiao-dica">…</p>
  <div class="lx-select-wrap"><select class="lx-select" id="regiao" aria-describedby="regiao-dica regiao-erro">…</select></div>
  <p class="lx-error" id="regiao-erro" hidden><svg class="lx-error__icon" aria-hidden="true">…alert…</svg>Escolha uma região.</p>
</div>
```

- Controles: `lx-input`, `lx-textarea`, `lx-select` (nativo, dentro de `lx-select-wrap`).
- Label sempre visível; placeholder nunca substitui label.
- Opcional: `<span class="lx-label__optional">(opcional)</span>`.
- Erro: `aria-invalid="true"` no controle, mais `lx-error` com ícone e texto, ligado por `aria-describedby`.
- Número de dias: `type="text" inputmode="numeric"`.
- Opções de `select` vêm dos dados, nunca de lista inventada.

### Choice Group · `lx-choice-group`

`fieldset` + `legend.lx-label` + `lx-choice-group__options` com `label.lx-choice`
(`input` radio/checkbox + `lx-choice__title` + `lx-choice__desc`). O card inteiro é alvo. Owner e Co-Owner têm
peso visual idêntico (REQ-103).

### Inline Message · `lx-message--{info,success,warning,error}`

Ícone (`lx-message__icon`) + `lx-message__title` + `lx-message__body`. Use `role="status"` ou, para erro que
bloqueia, `role="alert"`.

### States

- `lx-skeleton` (`--text`, `--frame`; estático, sem shimmer; `aria-hidden`). A região recebe `aria-busy="true"` e
  um texto `lx-visually-hidden` ("Carregando…"). Nunca `aria-label` em `div` sem role.
- `lx-empty` e `lx-success`: marker + statement + ação.

### Scene · `lx-scene`

- Variantes: `--opening`, `--media-end`, `--media-start`, `--statement`.
- Partes: `__rail`, `__body`, `__header`, `__media`, `__actions`, `__backdrop`.

### Frame · `lx-frame`

- Tipos: `--establishing`, `--living`, `--detail`.
- Modificadores: `--typographic`, `--scrim`, `--scrim-top`, `--drift`.
- Partes: `__media`, `__caption`, `__title`, `__meta`.

### Sequence · `lx-sequence`

```html
<div class="lx-sequence" role="region" aria-label="Sequência: um dia na Casa" tabindex="0">
  <ol class="lx-sequence__track"><li class="lx-sequence__item">…Frame…</li></ol>
</div>
```

### Evidence · `lx-evidence`

```html
<dl class="lx-evidence">
  <div class="lx-evidence__item"><dt class="lx-evidence__label">Região</dt><dd class="lx-evidence__value">…</dd></div>
</dl>
```

- `--inline` para densidade menor. Na expressão `product` (W3): uma coluna no celular, colunas a partir de `md`.
- **Valor ausente: o item não é renderizado** (TECH-001).
- Sem preço por dia para Co-Owner (REQ-100) e sem promessa de retorno (REQ-101).
- Termos compostos em `<span class="lx-nowrap">Co-Owner</span>`.

### Header · `lx-header`

- Sticky sobre paper. `--overlay` com `data-ground="night"` sobre Opening Frame com `--scrim-top`.
- Partes: `__inner`, `__nav` (≥ lg), `__list`, `__link` (`aria-current="page"`), `__actions`, `__cta` (≥ md),
  `__menu-button` (< lg; é `lx-icon-button`, 48×48, com nome acessível).

### Mobile Navigation · `lx-mobile-nav`

- `<dialog data-ground="night">` aberto com `showModal()`. O foco fica preso, Esc fecha e o foco volta ao gatilho.
- Partes: `__top`, `__body`, `__list`, `__link`, `__footer` (CTA fixo).

### Footer · `lx-footer`

`data-ground="night"`. Partes: `__nav-list`, `__link`, `__legal`. Serve também de fallback de navegação sem JS.

### Coleção · `lx-collection` + `lx-collection-card`

`ul` + `article` com Frame, `lx-marker` (região), `h3.lx-collection-card__title > a.lx-collection-card__link`
(link único que estica sobre o card), `__summary` e `lx-credit`. Sem caixa nem sombra.

### Concept Credit · `lx-credit`

- Slot da Brand Partner: `__mark` (logo da parceira, como fornecido) ou `__name`.
- **Só renderiza com autorização ativa nos dados** (BR-015, BR-021).

### Logo · `lx-logo`

- Link com `aria-label="Luxtory — página inicial"` e imagem `alt=""`.
- Kit oficial via chaves de [`manifest.json`](../../src/design-system/brand/logo/manifest.json): `horizontal`, `vertical` e `icon`, cada um
  em `moroccan-blue` (paper/wash) e `warm-sand` (night).
- **Sempre `<img>`/`<picture>`, nunca SVG inline**: os arquivos usam `mix-blend-mode`, e inline o "LUXTORY" some
  sobre fundo claro.
- Respiro: metade da altura do logo, garantido por `lx-logo`. Ícone abaixo de 360px de viewport; `lx-logo--vertical`
  para o lockup vertical.
- `--pending` só para asset ausente (nunca texto estilizado).
- Regras: [`src/design-system/brand/logo/README.md`](../../src/design-system/brand/logo/README.md).

### Superfícies de produto (ADR-0009)

Vale para toda área logada: Admin (primeiro consumidor), Área do Titular, calendário, reservas, Club, Luxchange,
Luxplus. Componente, estado ou token novo só entra quando uma tela o consome (**consumer-driven**).

**App Shell · `lx-app`** — React: `AppShell` (`@/design-system/react`).

- Abaixo de `lg`: `lx-app__bar` é a barra superior (logo + `lx-app__menu-button`) e a gaveta é a `lx-mobile-nav`.
  A partir de `lg`, a mesma `<header>` vira a navegação lateral (`--lx-layout-app-nav-width`) com `lx-app__nav` e
  `lx-app__account` no rodapé. Um só banner; um só logo visível por largura.
- Composição na `presentation` de cada slice: o shell recebe `navItems` (`href`, `label`, `current`), o bloco de
  conta (`account`) e os textos (`labels`, do i18n do slice). Não conhece módulos, papéis nem regras; nenhum slice
  importa internals de outro. Item de navegação só para tela que existe.
- Fundo da navegação: `navGround` = `night` (padrão, logo Warm Sand) ou `paper` (logo Moroccan Blue).
- O shell aplica `data-expression="product"`: rótulos de interface em Hanken Grotesk (o `lx-evidence__label` deixa o
  Courier); Courier Prime só para metadata real e curta (ids, códigos, timestamps).
- Gaveta: `showModal()` (foco preso, Esc fecha, foco volta ao botão). Ao cruzar o `lg` aberta, fecha e o foco vai ao
  `<main id="conteudo">`. Página atual: `aria-current="page"`.

```tsx
<AppShell homeHref="/admin" labels={messages.shell} navItems={items} account={<Account />}>
  <div className="lx-container">
    <PageHeader title="Administração" lead="…" />
    …
  </div>
</AppShell>
```

**Page Header · `lx-page-header`** — React: `PageHeader`. O único `h1` da página (`lx-display-m`), a descrição
(`__lead`) e o filete que separa do conteúdo. Courier só para metadata real e útil — nunca informação criada para
efeito editorial (como a data de hoje).

Com contexto e ações (W3): `context={{ href, label }}` vira o link `lx-page-header__context` antes do `h1` (o caminho
de volta no celular); `actions` vai em `lx-page-header__actions`, depois do texto — no celular os botões dividem a
largura. Uma confirmação (`lx-message` com `role="status"`) logo depois do cabeçalho ganha a mesma distância do
conteúdo. Aviso fixo da página não é região viva: sem `role`.

**Record List · `lx-record-list`** — React: `RecordList` (`items`, `label`). A lista das superfícies de produto
(ADR-0010 §9): um item por registro, título em Newsreader que leva ao detalhe (link esticado: o item inteiro é o alvo
e mostra o foco) e atributos em `dl` ao lado a partir de `md`. Atributo sem valor não é passado (TECH-001). Serve de
320 a 1920 px sem tabela; tabela e filtros só quando houver comparação densa ou volume que peça filtro.

```tsx
<RecordList
  label="Brand Partners"
  items={[{ id, href, title: 'Maison Aurora', attributes: [{ label: 'Situação', value: 'Ativa' }] }]}
/>
```

**Ações do formulário · `lx-form__actions`** — a ação principal primeiro no DOM; no celular empilhadas em largura
total, em linha a partir de `md`. "Cancelar" é `lx-button--quiet` apontando para a página de origem.

**Page Section · `lx-page-section`** — `section[aria-labelledby]` com `h2.lx-display-s`: distância fixa entre título
e conteúdo e separação maior entre seções. Sem caixa nem sombra; o filete do próprio conteúdo divide.

**Layout focado · `lx-focused`** — React: `FocusedLayout` (`brand`). Tarefa única sem navegação: login, segundo
fator, acesso negado, indisponível e erro inesperado. No celular, o painel (`__panel`, que é o `main`) ocupa a tela; a
partir de `md` fica centralizado sobre `wash`, com filete fino, sem sombra. Estados usam rótulo `lx-label` (nunca
Courier), `h1`, texto e uma ação. Demonstração: `lab/produto-focado.html`; o shell: `lab/produto-app.html`.

**Logo no app** — React: `Logo` (`ground`, `href?`, `label`). Escolhe a cor pelo fundo, usa o ícone abaixo de 360 px e
aponta para `GET /brand/logo/<chave>`, que serve o arquivo da chave do manifest byte a byte. Sem `href` (layout
focado), a imagem leva o nome acessível.

**Gate de UI de toda tela nova** — `tests/e2e/support/ui.ts`: `expectResponsive(page, consoleErrors)` = sem overflow
não intencional do documento em 320, 360, 390, 768, 1023, 1024, 1440 e 1920 px, zero erro de console e axe 0 a 390 e
1440 px (página assentada: título aplicado, ponteiro fora dos controles, sem transição em curso). O fluxo principal
roda a 390 px com toque (`test.use({ viewport, hasTouch: true, isMobile: true })`). Capturas a 390 e 1440 px vão no
PR como material de revisão, não como baseline.

**Smoke Playwright WebKit** — `tests/e2e/*.webkit.spec.ts`, projeto `webkit` (emulação de iPhone) ligado por
`PLAYWRIGHT_WEBKIT=1`. A CI instala as dependências (`npx playwright install --with-deps webkit`); localmente elas
exigem `sudo npx playwright install-deps webkit`. Não equivale a Safari/iOS real: aparelhos reais (Safari/iOS,
Chrome/Android) ficam na QA de release/go-live.

### Utilitários

`lx-visually-hidden`, `lx-nowrap`, `lx-container` (`--narrow`), `lx-prose`, `lx-form` / `lx-form__row`,
`lx-skip-link` (primeiro foco da página).

## 11. Copy e voz

- **Clara, curta, coloquial, aspiracional, sofisticada, segura.** Cenas concretas em vez de adjetivos vazios.
- Sem pompa, jargão imobiliário ou vulgaridade.
- **Terminologia (02 §1):**
  - Co-Owner tem **Ação** com **Direito de Uso**.
  - Nunca "cota" ou derivados.
  - Nunca "diária(s)" para Co-Owner.
  - Sem preço por dia para Co-Owner.
- **Nunca prometer** rentabilidade, valorização, liquidez ou renda garantida (REQ-101).
- Interesse: "Manifestar interesse não é uma aquisição" (BR-050). Os dias indicados são preferência, não direito
  adquirido (REQ-025, BR-060).
- Erros dizem a causa funcional e o que fazer (REQ-098).
- As strings de produto passam pela camada i18n do W0 (`pt-BR`), nunca por CSS.
- Posicionamento, personalidade, tom detalhado e provas das páginas públicas:
  [camada de comunicação](../specs/communication.md). Voz e tom das páginas públicas vêm do §11 do Framework da
  jornada — [B2C](../specs/communication/framework-b2c.md) ou
  [Brand Partners](../specs/communication/framework-brand-partners.md) —, que prevalece sobre os adjetivos do primeiro
  item. Esta seção mantém microcopy e terminologia.

## 12. Acessibilidade (WCAG 2.2 AA)

| Garantia | Como |
|---|---|
| Foco visível | anel de 2px com offset de 3px, cor por ground; nunca `outline: none` sem substituto |
| Contraste | 64 pares + scrim verificados por teste |
| Alvos | 44px mínimo; 48px para controles e botões |
| Teclado | skip link; dialog com foco preso; Sequence e tabelas roláveis focáveis (`tabindex="0"` + rótulo) |
| Semântica | landmarks rotulados; headings pela hierarquia; `fieldset`/`legend`; `dl` para Evidence |
| Estados | erro, aviso e sucesso com ícone + texto; `aria-invalid`, `aria-describedby`, `aria-live` |
| Movimento | reduced motion respeitado; nada se move automaticamente por mais de 5s |
| Reflow | sem rolagem horizontal da página de 320px a 1920px |

## 13. Performance

- Fontes: woff2 subset latin, `font-display: swap`, fallback com `size-adjust` medido, preload de 2 arquivos (91.5 KB).
- Imagens: proporção declarada; AVIF/WebP via `next/image` no W0; `loading="lazy"` fora do Opening Frame.
- CSS puro. O JS só entra no menu (dialog) e no formulário. O reveal é CSS.
- Grain é tile de 120px (barato de pintar), só em night e no Typographic Frame.
- Sem bibliotecas de animação, carrosséis JS ou ícones em fonte.

## 14. Anti-patterns

Estética genérica de IA, SaaS ou template Tailwind/shadcn · excesso de cards · cantos arredondados · gradientes
decorativos · glassmorphism · glow · foto de banco · lorem ipsum · cor literal · Courier em excesso ·
`SCENE`/`INT.`/`EXT.` como gimmick · componente sem acessibilidade · design system documentado mas não usado ·
duas fontes de verdade (edite `tokens.json`, nunca `tokens.css`) · recolorir ou reconstruir o logo · `@media
(max-width…)` · dashboard SaaS genérico (avatares, ícones em excesso, cartões de KPI com número inventado) · componente
de produto criado sem tela que o consuma.

## 15. Core Design System — uso (CP1, 2026-10-06)

> Contrato: [`docs/specs/design-system.md` §13](../specs/design-system.md). Lab: `/lab/lab/core.html` (Public),
> `core-auth.html`, `core-admin.html`. As seções 1–14 acima documentam o DS anterior, que continua servindo as páginas
> ainda não migradas (CP2–CP4) e sai de uso no CP5.

### Ativar o Core

- O Core só vale dentro de `data-lx="core"`, no elemento raiz do shell. Fora dele, nada muda (contrato testado).
- Cada bloco declara a superfície em `data-surface` (`white`, `wash`, `sand`, `blue`, `deep`); componentes nunca
  escolhem cor pelo fundo. Painéis aninhados declaram a própria superfície (ex.: `data-surface="deep"` sobre `sand`).
- Sobre `sand`: sem formulários nem mensagens de estado.

```html
<html lang="pt-BR" data-lx="core">
  <body data-surface="white">
    <section class="lx-section" data-surface="blue" aria-labelledby="t-1">…</section>
  </body>
</html>
```

### Tipografia

| Classe | Uso |
|---|---|
| `lx-statement` | grande statement editorial (Triad Statement) |
| `lx-headline` | H1 do hero e H2 de seção (mesmo papel); cor `headline` da superfície |
| `lx-ordinal` | numerais de sequência (01, 02…), cor de acento |
| `lx-title` | título de tópico (h3) e itens de lista |
| `lx-closing` | linha de fechamento de seção |
| `lx-subheadline` · `lx-body` · `lx-compact` | apoio, corpo (leading 1,75) e texto compacto |
| `lx-eyebrow` | rótulo acima do título (uppercase, `tracking.eyebrow`) |
| `lx-meta` | Courier Prime: só ids, códigos e horários no produto |

`em` só onde a copy autoriza ênfase: itálico, mesma cor e métricas da headline. No produto, `lx-display-m` (título de
página) e `lx-display-s` (título de seção) são reexpressos pelo Core.

### Cabeçalho de seção

```html
<div class="lx-section-head">
  <div class="lx-section-head__mark">
    <span class="lx-ordinal" aria-hidden="true">01</span>
    <span class="lx-section-head__rule" aria-hidden="true"></span>
    <p class="lx-eyebrow">Eyebrow</p>
  </div>
  <h2 id="t-1" class="lx-headline">Headline <em>com ênfase autorizada.</em></h2>
</div>
```

### Patterns oficiais (markup mínimo)

- **Cinematic Hero** — `section.lx-hero[data-surface=blue]` > `ul.lx-hero__slides[aria-hidden]` > `li.lx-hero__slide[data-active]`
  > `img.lx-hero__image.lx-crop-*`; `div.lx-container.lx-hero__content` > `div.lx-hero__copy` (h1 `lx-headline`,
  `lx-subheadline`, `div.lx-hero__actions` com `lx-button--primary lx-button--large`) + `div.lx-hero__controls[role=group]`
  (contador + anterior/pausar/próxima, `aria-pressed` no pausar). O scrim é local (`.lx-hero__copy::before`).
- **Problem / Triad Comparison** — `section.lx-triad-comparison` > `.lx-triad-comparison__top` (copy +
  `figure.lx-triad-comparison__diagram` com `/diagrams/core/triade-valor-desejado.svg`) +
  `ol.lx-triad-comparison__alternatives` > `li.lx-triad-comparison__alternative`.
- **Triad Statement** — `ol.lx-triad-statement__cells` > `li.lx-triad-statement__cell` (`lx-ordinal` +
  `.lx-triad-statement__word`) + `p.lx-statement.lx-triad-statement__statement` + `p.lx-closing.lx-triad-statement__closing`.
- **Editorial Comparison** — `div.lx-comparison` > `article.lx-comparison__item` (eyebrow, `lx-title`,
  `ul.lx-comparison__list`). Owner e Co-Owner com a mesma estrutura (REQ-103).
- **Panel Comparison** — `div.lx-panels` > `article.lx-panels__panel[data-surface=deep]` com eyebrow, título, descrição,
  `ul.lx-panels__list` e `.lx-panels__closing` (sempre os cinco, para o subgrid alinhar).
- **Numbered Editorial List** — `ol.lx-numbered` > `li.lx-numbered__item` (`span.lx-ordinal.lx-numbered__number`,
  `h3.lx-title`, `p.lx-numbered__text`); interativa: `details.lx-numbered__details` > `summary.lx-numbered__summary`.
- **Editorial Split** — `section.lx-split` > `.lx-split__text` > `.lx-split__inner` + `figure.lx-split__media.lx-media` >
  `img.lx-crop-*`. `--media-start` (media/text), `--wide-text` (58/42). Sem `figure`, vira uma coluna.

Complementares consumidos pela W4: `lx-diagram` (Text + Diagram, `/diagrams/core/diagrama-solucao-luxtory.svg`),
`lx-pause` (`--opening` para abertura tipográfica), `lx-faq` (com `lx-disclosure`), `lx-siblings` (`--pair` = 2 × 2),
`lx-section-closing`.

### Mídia e recorte

- `lx-crop-x-{20,35,50,65,80}` e `lx-crop-y-{…}` definem o foco da foto; `lx-crop-lg-*` muda a partir de `lg`.
  `lx-crop-md-x-*` muda a partir de `md` (antes do `lg`): num hero de tablet o texto fica sobre a foto.
- Nunca `style` inline (a CSP de produção bloqueia) e nunca foto pequena num grande vazio: sem mídia adequada, outro
  pattern.

### Contextos

- **Auth:** `div.lx-focused[data-surface=blue]` > `main.lx-focused__panel[data-surface=deep]`; título `lx-display-m`.
- **Admin:** `div.lx-app` > `header.lx-app__bar[data-surface=blue]` + `main.lx-app__main[data-surface=white]`.
- **Club:** consumirá o mesmo Core quando uma wave real exigir.

### Site público no Core (CP2, 2026-10-06)

- O `SiteShell` liga o flag (`div[data-lx=core]`): header e menu em `blue`, rodapé em `deep`; na Home o header fica
  sobre o Cinematic Hero e o `SiteHeader` o torna sólido depois da rolagem.
- Splits do grid de 12 colunas: `div.lx-columns.lx-columns--5-7` (ou `--7-5`; padrão 6/6) com dois filhos; cada coluna
  de texto é um `lx-stack`.
- Seção que abre com foto em metade: `section.lx-section-split[data-surface]` > `div.lx-split` (+ `--wide-media`,
  `--wide-text`, `--media-start`) > `figure.lx-media.lx-split__media` + `div.lx-split__text > div.lx-split__inner`; o
  que vem depois vai num `lx-container`.
- Painel interativo de alternativas: `div.lx-panel-switch` > `fieldset.lx-panel-switch__options` (legend oculta;
  `label.lx-panel-switch__option > input[type=radio]`) + região viva com `dl.lx-panel-switch__rows` +
  `p.lx-panel-switch__caption`. Desde `D-B2C-22`, o painel é um container de tamanho inline; opções, atributos e
  valores usam `--lx-panel-type`, entre `type.label` e `type.section-title`, reservando os dois gaps antes de calcular
  a escala. As opções ficam em uma linha, inclusive a 320 px. Seleção = texto e sublinhado Warm Sand + peso 500;
  radios, foco, região viva e alvo de toque preservados.
- Fechamentos discretos (`D-B2C-22`): `SiteShell closingStyle="subtle"` põe `main.lx-closings-subtle`, usado somente
  pelo `DiscoverySite`. Desde `D-B2C-23`, todos os textos dos fechamentos (inclusive tríade e Hero final) usam
  `type.page-title` (24–36 px), como a frase lifestyle da Home, com a face Newsreader itálica. A escala anterior era
  `type.section-title` nos statements e `type.body` no apoio. Grupos de parágrafos usam gap `space-4` (16 px).
  Sobre Blue, statements agora usam Warm Sand em toda a escala (mínimo de 24 px); a derivação anterior para texto
  pequeno deixa de ser necessária. Texto sobre fotografia em branco. Ações e headlines de abertura não mudam.
- Owner | Co-Owner: `div.lx-comparison.lx-comparison--divided` > dois `div.lx-comparison__item` com a mesma estrutura.
- Eyebrow: `p.lx-eyebrow` — a cor vem do papel `marker` da superfície; nunca forçar Warm Sand em Blue.
- Perguntas do leitor com a resposta ao lado (Como funciona): `div.lx-answers` > `div.lx-answers__row` >
  `h3.lx-answers__label` (pergunta em `lx-subheadline` ou rótulo em `lx-eyebrow`) + `div.lx-answers__content`;
  `div.lx-answers__full` para um bloco na largura inteira da linha.
- Números comparáveis (configurações Co-Owner): `ul.lx-figures` > `li.lx-figures__item` > título + `dl.lx-figures__data`
  com `div > dt + dd` (`dd.lx-figures__value` para o número principal).
- Índice de capítulos no Hero: `nav.lx-hero__chapters[aria-label]` > `ol` > `li` > `a.lx-hero__chapter` com
  `span.lx-hero__chapter-number[aria-hidden]` + `span.lx-hero__chapter-name`.
- Scrim uniforme (opt-in, só onde o fundador decidiu): `section.lx-hero.lx-hero--uniform` — uma camada sobre 100% da
  foto em `scrim.display-alpha`; uma foto que medir menos pode sobrescrever `--lx-hero-scrim-alpha`. Sem o modificador,
  o Cinematic Hero mantém o scrim local.
- Momentos de uma sequência: `div.lx-answers.lx-answers--phases`; número que responde à pergunta:
  `dd.lx-figures__value.lx-figures__value--primary`.
- Coleção — busca GET no servidor: `form.lx-discovery[role=search][data-surface=white]` > `div.lx-discovery__search`
  (`input.lx-discovery__input` + `button.lx-discovery__submit`) + `div.lx-discovery__facets` > `details.lx-facet` >
  `summary.lx-facet__summary` (`span.__label` + `span.__value`) + `div.lx-facet__panel` (fieldsets `lx-facet__options`
  com `label.lx-check > input + span`, `div.lx-facet__range`, `p.lx-facet__note`, botão "Aplicar"). No celular, o botão
  `div.lx-discovery__mobile > button.lx-discovery__open` abre `dialog.lx-filters` (formulário próprio, fora da busca;
  grupos com título em `section.lx-filters__group > h3.lx-eyebrow.lx-filters__heading`). Barra fixa (lg+):
  `form.lx-discovery--compact` > `div.lx-discovery__search` + `div.lx-discovery__tools` (facetas com
  `span.lx-facet__count`, `a.lx-discovery__count`, envio); a dica visível é `span.lx-discovery__placeholder` com
  `__placeholder-long`/`__placeholder-short` sobre `input[placeholder=" "]`.
- Card de Home Concept: `ul.lx-concept-grid[aria-label] > li > article.lx-concept-card` — mídia (`figure.lx-media` com
  `srcset` ou `div.lx-concept-card__media--type[data-surface=blue][aria-hidden] > span.__word`) + `div.__body` (eyebrow,
  `h3.lx-display-m.__title > a.__link`, `p.__meta`, `p.__facts`, `ul.__editions > li.__edition`, `span.__cta[aria-hidden]`).
  Destaque: `lx-concept-card--featured`. Grupos: `section.lx-concept-group > div.__head` + a lista.
- Filtros ativos: `ul.lx-chips > li > a.lx-chip[aria-label="Remover filtro: …"]`; ordenação: `nav.lx-sort` com
  `a.lx-sort__option[aria-current=true]`; jornada em passos: `ol.lx-steps > li.lx-steps__item`.

### Brand Partners no Core (BP1, 2026-10-10)

Mesmo Core, sem paleta, escala ou biblioteca B2B (spec `catalog` §14.8). Complementos genéricos que a BP1 consome:

- Hero sem fotografia autorizada: `section.lx-hero.lx-hero--typographic[data-surface=deep]` > `div.lx-container.lx-hero__content`
  > `div.lx-hero__copy` — a mesma gramática do Cinematic Hero (conteúdo baixo à esquerda, o lugar da foto como espaço
  negativo), sem `lx-hero__slides`, sem scrim, sob o header sólido.
- Uma batida a mais antes do fechamento de uma passagem: `p.lx-stack__pause` dentro de um `lx-stack` (mesmo papel de
  tipo). Coluna editorial de ~8 das 12 colunas, alinhada ao início: `div.lx-stack.lx-stack--editorial`.
- Três unidades iguais lado a lado a partir do `lg` (4/4/4): `ol.lx-siblings.lx-siblings--trio` > `li.lx-siblings__item`.
- Limite ou condição que fecha uma composição, em largura ampla e tamanho de corpo: `div.lx-section-note > p.lx-body`.
- Split 5/7 cuja coluna inicial continua depois da principal (ex.: introdução | formulário, finalidade abaixo da
  introdução): `div.lx-columns.lx-columns--aside` com três filhos — ordem do DOM e do celular cabeça → principal → aside.
- Índice da página como âncoras: `nav.lx-anchors[aria-label] > ul > li > a[href="#…"]` — lista entre hairlines no celular
  (alvos de 44 px), uma linha editorial com pontos médios a partir do `md`.
- Termo destacado pela copy dentro do texto corrido: `strong` em `lx-body`/`lx-subheadline` (semibold).
- `MobileNav`: ativar um link do menu fecha o diálogo antes de navegar (âncora na própria página).

### Brand Partners no Core (BP1.1, 2026-10-12)

Complementos genéricos e opt-in que a BP1.1 consome (spec `catalog` §14.9); o B2C não usa nenhum e não muda:

- Header com a nav no fim da barra, junto das ações: `SiteShell navAlign="end"` (`header.lx-header--nav-end`). Item de
  navegação que é uma ação de conversão: `{ action: true }` em `navItems` — botão secundário (`lx-button--secondary`)
  na barra do `lg` em diante, link comum no menu e no rodapé.
- Ícone oficial no gatilho do menu também fora do modo retrátil: `SiteShell menuTrigger="mark"` (no retrátil, já é o
  padrão).
- Sequência de quatro partes numa linha do `lg` em diante (1 → 2 → 4 colunas): `ol.lx-steps.lx-steps--four`.
- Uma composição a mais dentro da mesma seção (depois de um fechamento, lista ou sequência), com meio ritmo de seção
  acima: `div.lx-section-group` > rótulo + blocos.
- Lugar de fotografia ainda em produção: `div.lx-media-placeholder` > `span.lx-media-placeholder__label`, dentro de
  `figure.lx-media.lx-split__media` ou de `div.lx-hero__slide` (no Hero, o rótulo fica sob o header e acima do scrim).
  É apoio de revisão, nunca visual final: o go-live exige o ativo aprovado no lugar.
- Par (`lx-comparison`) dentro do texto de um item numerado (`lx-numbered__text`): fica empilhado em toda largura,
  como no celular — ao lado do número (`md`) ou na última de três colunas (`lg`), lado a lado cada metade caía a poucas
  palavras por linha. Mesma ordem, tipo e peso dos dois lados (auditoria de concisão da BP1.1).
- Limite com mais de um parágrafo: `div.lx-section-note.lx-stack` > `p.lx-body` (um por frase).
- Headline do Cinematic Hero que abre uma Home: `h1.lx-headline.lx-headline--home-hero` — o papel tipográfico do Home
  Hero B2C (`lx-home-hero__title`: mesmo tamanho e entrelinha nas três faixas), mantendo a cor e a quebra do Cinematic
  Hero. Paridade B2C → Brand Partners por papel: o B2C é a referência (spec `catalog` §14.9).

### Brand Partners no Core (refinamento pós-merge, 2026-10-13)

Opt-in, sem efeito no B2C (spec `catalog` §14.9, `D-BP-20`):

- Títulos no papel de headline: `SiteShell titleRole="headline"` põe `main.lx-titles-headline`. Ali, `lx-display-s` e
  subheadlines usadas como heading (`h3.lx-subheadline`, inclusive a pergunta de `lx-answers`) saem da cor do corpo
  para o papel de headline da superfície: Moroccan Blue sobre White/Wash, Dark Moroccan Blue sobre Sand (já igual ao
  corpo no Design System), Warm Sand sobre Deep. Sobre Blue, abaixo de 24 px, a variação derivada
  `color-mix(in srgb, headline 90%, fg)` (4,69:1; o Warm Sand puro mede 4,32:1); do `xl` em diante, o `lx-display-s`
  (24 px, texto grande) volta ao Warm Sand. Tamanhos e o `lx-display-m` (já headline) não mudam; rótulos `lx-eyebrow`
  seguem o papel `marker`.
- Diagrama no tamanho de referência: `div.lx-diagram.lx-diagram--reference` > `div.lx-stack` de
  `div.lx-stack.lx-diagram__item` (rótulo, título, texto) + `figure.lx-diagram__figure`. Do `lg` em diante, a figura
  tem o tamanho renderizado do diagrama da Home B2C a 1440 px (437 × 490 px), o topo no primeiro item e o texto na
  largura restante; os itens usam o ritmo dos Sibling Blocks (`space-3`). Abaixo do `lg`, como qualquer Text + Diagram.
  O `lx-diagram--even` não muda.
- Equação de valor (`D-BP-21`): `div.lx-equation` > `p.lx-equation__term` + `p.lx-equation__operator > span` (+) +
  `p.lx-equation__term` + `p.lx-equation__operator > span` (=) + `p.lx-equation__result`. As premissas têm o mesmo papel
  (Newsreader no tamanho do título de seção, cor do corpo); o sinal fica num círculo de hairline no início de uma régua
  até o fim da coluna; o resultado usa o tamanho do numeral (`type-ordinal`) no papel de headline. Os sinais vêm do i18n
  e são lidos pelo leitor de tela ("mais", "igual").
  - Desde `D-BP-22`, uma conta de somar: `div.lx-equation` > `p.lx-equation__term.lx-display-s` +
    `p.lx-equation__operator` (+) + `p.lx-equation__term.lx-display-s` + `p.lx-equation__result.lx-headline` (com
    `span.lx-visually-hidden` "= " no início). O + fica num gutter (`space-8`; `space-12` do `md`), no tamanho da
    headline, centrado na primeira linha da segunda premissa; o resultado ocupa a largura inteira com a linha de cálculo
    (hairline `rule-strong`) no topo e o texto alinhado às premissas. Sem círculos, card, caixa ou fundo.
  - Desde `D-BP-23`, uma conta vertical numa só tipografia: `div.lx-equation` > três `p.lx-equation__term.lx-display-s`,
    cada um com `span` de texto; a segunda e a terceira abrem com `span.lx-equation__operator` (+ e =, do i18n, lidos
    pelo leitor de tela) e a terceira também é `.lx-equation__result` (a linha de cálculo no topo). Os operadores usam
    a fonte utility em peso medium, no tamanho da linha, num gutter (`space-8`; `space-12` do `md`); o texto das três
    linhas começa num só eixo. Nenhuma linha maior que as outras.
  - Desde `D-BP-25`, `div.lx-equation[data-surface="deep"]` é um card reto, com padding dos tokens de espaço,
    texto Warm Sand em Newsreader itálico, mantendo `lx-display-s`. O + fica em um parágrafo próprio
    (`lx-equation__operator.lx-display-s`, utility medium) entre as premissas; o resultado usa a régua no topo,
    sem =. `lx-columns--aside-text` mantém os quatro filhos e a ordem de leitura: cabeça → introdução → card → corpo.
    No desktop, desde `D-BP-26`, o card se centraliza verticalmente somente no texto corrido, sem a headline (`grid-row: 2 / span 2`,
    `align-self: center`); as três linhas da grade usam tamanho `auto`.
- Cabeça, texto corrido e o elemento principal ao lado do texto: `div.lx-columns.lx-columns--aside-text` com quatro
  filhos — cabeça (eyebrow, Headline), o primeiro bloco do texto, o principal e o resto do texto. Do `lg`, a cabeça no topo
  da coluna inicial, o texto abaixo dela e o principal na coluna final, centrado verticalmente ao texto corrido (`D-BP-26`; em `D-BP-25`, incluía a headline;
  em `D-BP-23`, o topo ficava na primeira linha). No celular, nessa ordem, com um gap a mais em volta do principal.
  (Substitui o `--aside-even` de `D-BP-22`, que centralizava.)
- Teto tipográfico: `SiteShell typeCeiling="home-hero"` põe `main.lx-type-ceiling`. A escala do Hero da Home
  (`--lx-type-home-hero`, a mesma do `h1.lx-headline--home-hero`) limita `lx-headline`, `lx-statement`, `lx-display-*` e
  `lx-ordinal` com `min()`; os outros papéis já ficam abaixo dela. O Hero não muda.
