# Spec: design-system

> Spec-Driven Development: este documento é o contrato do Design System Luxtory.
> Uso normativo (o "como usar"): [`docs/reference/design-system.md`](../reference/design-system.md).
> Decisão arquitetural: [ADR-0003](../adr/0003-design-system-camada-compartilhada.md).
> Plano de execução: [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) (ondas DS-0…DS-7).

## 1. Goal

Dar à Luxtory Branded Second Home um Design System único, autoral e acessível, para que qualquer pessoa
ou IA construa interfaces que **pareçam Luxtory sem reinventar a marca a cada tarefa**. A tese é
**LUXTORY = LUXURY + STORY**. *Show the luxury. Tell the story.*

- **LUXURY — a Planta.** Como a marca se apresenta: grid arquitetônico, proporção, hairlines, linhas de
  dimensão, espaço e fotografia em Frames de proporção fixa.
- **STORY — o Roteiro.** Como a marca se comunica: sequência de Scenes, Scene Markers com metadados reais
  (lugar, hora, luz, capítulo) e legendas que mudam a leitura da imagem.

A prioridade é o **R1 — site público: Discovery + Interesse** (02 §2).

## 2. Non-goals

- Componentes React/Next.js. Entram depois do W0 como wrappers finos das classes `lx-*` (ADR-0003).
- Área do Titular, Calendário, Club, Carteira e Admin (R2–R4). O sistema já prevê a expressão `product`, mas
  sem componentes específicos (tabelas, calendário, gráficos).
  - **Revisão 2026-09-27 ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md))**: as superfícies de
    produto entram no DS a partir da W2B (shell, layout focado, padrão de página e estados). Tabela, calendário,
    gráficos e demais componentes de produto continuam fora até uma wave consumi-los.
- Definir campos de contato ou qualificação do interesse (REQ-025 não os enumera; aguardam a Luxtory).
- Redesenhar, recolorir ou derivar versões do logo.
- Criar regra de negócio, preço, estado ou texto normativo que não exista nos canônicos 01/02/03.

## 3. Users / actors

- **Visitante anônimo** do site público (R1), em desktop e principalmente em mobile.
- **Desenvolvedores e IAs** que constroem telas: consomem tokens, classes e regras.
- **Luxtory (produto/marca)**: aprova direção, fornece logos, fotografia e campos pendentes.

## 4. User stories

- Como visitante, quero sentir a casa antes de entender o mecanismo, para desejar o Residence Concept com clareza.
- Como visitante, quero manifestar interesse como Owner ou Co-Owner em poucos passos e sem ambiguidade,
  sabendo que isso não é aquisição (BR-050) e que os dias indicados não são direito adquirido (REQ-025, BR-060).
- Como visitante com teclado, leitor de tela ou movimento reduzido, quero usar tudo sem barreiras (WCAG 2.2 AA).
- Como dev/IA, quero tokens e componentes prontos e testados, para não decidir cor, fonte ou espaço no improviso.

## 5. Contracts

### HTTP API / Events

Nenhum. O Design System não expõe endpoints nem eventos.

### Canônicos que o sistema respeita

| ID | Consequência no Design System |
|---|---|
| BR-001…004, REQ-020 | Residence Concept, Residence Edition e Residence são objetos visuais distintos; oferta só com Edition. |
| REQ-022, BR-030 | Interesse pode existir a partir do Concept sem Edition: o formulário aceita Edition ausente. |
| BR-010, BR-015, BR-021, REQ-021 | Marca de Brand Partner aparece só pelo slot `ConceptCredit`, controlado por dados autorizados. |
| REQ-024, REQ-025, BR-050, BR-060 | Microcopy do interesse: não é aquisição; dias são preferência, jamais direito adquirido. |
| REQ-100, BR-373 | Co-Owner = Ação com Direito de Uso. Nunca "cota" ou derivados; nunca "diária(s)"; sem preço por dia. |
| REQ-101, BR-374 | Nenhum componente ou exemplo promete rentabilidade, valorização, liquidez ou renda. |
| REQ-103, BR-376 | Owner e Co-Owner têm peso visual equivalente no Discovery e no formulário. |
| REQ-098 | Mensagens de erro informam causa funcional clara. |
| TECH-001, BR-352 | Valor ausente nunca recebe default: o `Evidence` sem valor não renderiza. |

### Identidade imutável

- **Paleta de marca** (valores exatos, verificados por teste):

  | Nome | Hex |
  |---|---|
  | Moroccan Blue | `#0F4E67` |
  | Dark Moroccan Blue | `#003D52` |
  | Warm Sand | `#CDAD8E` |
  | Dark Warm Sand | `#9E8567` |
  | Pure White | `#FFFFFF` |

- **Logo.** Arquivos oficiais usados verbatim, sem redesenho, recoloração, distorção ou texto substituto.
  Kit oficial recebido em 2026-09-25, em `src/design-system/brand/logo/`: horizontal, vertical e ícone em Moroccan Blue
  e Warm Sand. Referência por chave em `manifest.json`, com sha256 fixado; uso sempre como `<img>`.
- **Derivados funcionais** (não são cores de marca):

  | Token | Valor | Uso |
  |---|---|---|
  | `sand-wash` | `#F7F2ED` | Warm Sand a 16% sobre branco |
  | `error` | `#9B2226` | Erro sobre paper e wash |
  | `error-on-night` | `#F2B8B5` | Erro sobre night |

### Tipografia (três vozes, todas gratuitas, licença SIL OFL 1.1, self-hosted)

| Voz | Família | Uso | Nunca |
|---|---|---|---|
| LUXURY — Display | Newsreader (opsz 72; 400–500; itálico 400) | Opening Frames, headlines, nomes de Concept, statements | body, labels, botões |
| UTILITY — Sans | Hanken Grotesk (400–600) | body, navegação, formulários, Evidence, produto | headlines de Opening Frame |
| STORY — Script | Courier Prime (400/700) | Scene Markers, capítulos, lugar/hora, legendas | body, labels, botões, texto corrido |

### Modelo de tokens

- **Fonte única:** `src/design-system/tokens/tokens.json` (W3C DTCG: `$value`, `$type`, referências `{grupo.nome}`).
- `tokens.css` é **gerado** por `scripts/build-tokens.mjs`. Nunca editar à mão; o teste compara os dois.
- Camadas:
  1. **primitive** (`--lx-palette-*`, `--lx-derived-*`, escalas);
  2. **semantic por fundo** (`--lx-color-*`, redefinidos por `[data-ground]`);
  3. **component** (classes `lx-*` que só consomem tokens).
- **Fundos (grounds).** Os componentes nunca escolhem cor por fundo: herdam de `data-ground`.

  | `data-ground` | Fundo | Momento narrativo |
  |---|---|---|
  | `paper` | Pure White | dia |
  | `wash` | Sand Wash | fim de tarde |
  | `night` | Dark Moroccan Blue, com grain | noite |

- **Expressão:** `data-expression="story"` (padrão, Discovery) ou `"product"` (densidade funcional, R2+).
  - `product` (ADR-0009; o App Shell a aplica): rótulos de interface — inclusive `lx-evidence__label` — ficam em
    Hanken Grotesk. Courier Prime só para metadata real e curta com valor semântico (ids, códigos, timestamps), nunca
    para rótulo nem decoração.

### Contrato de CSS

- Arquivos em `src/design-system/styles/`, ponto de entrada `index.css`.
- Cascade layers na ordem: `lx.tokens, lx.base, lx.layout, lx.components, lx.utilities`.
- Classes com prefixo `lx-`, BEM (`lx-bloco__elemento--modificador`). Estados via atributos ARIA/HTML
  (`aria-invalid`, `aria-busy`, `disabled`, `aria-current`, `aria-expanded`), nunca via classes de estado.
- Fora de `tokens.css` é proibido declarar literais de cor, `font-family`, duração, easing ou `z-index`
  (`scripts/check-hardcodes.mjs`). Media queries só usam os breakpoints dos tokens.
- **Mobile-first (ADR-0009):** media queries de largura só com `min-width`; `max-width` é recusado pelo
  `check-hardcodes`. O estilo base serve o celular e cada breakpoint só acrescenta — `max-width` criaria um segundo
  caminho de estilos e regressões nos cortes. Uma exceção futura é decisão deliberada do DS (esta spec + ADR), nunca
  workaround.
- Sem strings de produto em CSS: `content:` só para glifos decorativos, com texto alternativo vazio.
- Motion respeita `prefers-reduced-motion` e o atributo `[data-motion="reduce"]` no `<html>`.

### Componentes do R1 (API)

Uso detalhado, markup e exemplos: [`docs/reference/design-system.md`](../reference/design-system.md).

**Fundação e layout**

| Componente | Classe | Variantes | Estados / acessibilidade |
|---|---|---|---|
| Typography | `lx-display-{xl,l,m,s}`, `lx-lead`, `lx-body`, `lx-small`, `lx-label` | `em` dentro de display = virada em itálico (máx. 1 por headline) | headings semânticos (`h1`…`h3`) independentes do tamanho visual |
| Container | `lx-container` | `--narrow` | — |
| Grid | `lx-grid` + `lx-col-{full,text,media,rail,content}` | 4/8/12 colunas por breakpoint | ordem do DOM = ordem de leitura |
| Scene | `lx-scene` + `data-ground`, `data-expression` | `--media-end`, `--media-start`, `--statement`, `--opening` | `<section aria-labelledby>` |
| Scene Marker | `lx-marker` | — | texto real; máx. 1 por Scene; separador decorativo sem leitura |

**Narrativa e evidência**

| Componente | Classe | Variantes | Estados / acessibilidade |
|---|---|---|---|
| Frame | `lx-frame` | `--establishing`, `--living`, `--detail`, `--typographic`, `--scrim`, `--drift` | `alt` obrigatório (vazio só se decorativo); proporção declarada; drift ≤ 4.8s, 1×, desligado com movimento reduzido |
| Sequence | `lx-sequence` | — | `role="region"`, `aria-label`, `tabindex="0"`; rolagem por teclado |
| Evidence | `lx-evidence` (`dl`) | `--inline` | valor ausente = item não renderiza; algarismos tabulares |

**Interação e formulário**

| Componente | Classe | Variantes | Estados / acessibilidade |
|---|---|---|---|
| Button | `lx-button` | `--primary`, `--secondary`, `--quiet` (cor pelo fundo); `--destructive` (W3: ação irreversível, contorno e texto no token de erro, sem preenchimento) | hover, active, `:focus-visible`, `disabled`, `aria-busy="true"`; altura ≥ 48px |
| Text Link | `lx-link` | `--standalone` (com seta) | sublinhado visível; foco visível |
| Field | `lx-field` + `lx-label`, `lx-hint`, `lx-error` | — | label visível; `aria-describedby`; `aria-invalid`; erro com ícone + texto |
| Input / Textarea / Select | `lx-input`, `lx-textarea`, `lx-select` | — | nativos; altura ≥ 48px; borda ≥ 3:1 |
| Choice Group | `lx-choice-group` (`fieldset`) + `lx-choice` | — | `legend`; radio nativo; alvo inteiro clicável |
| Inline Message | `lx-message` | `--info`, `--success`, `--warning`, `--error` | ícone + texto; `role="status"` ou `role="alert"` |
| States | `lx-skeleton`, `lx-empty`, `lx-success` | — | skeleton com `aria-hidden`; região com `aria-busy` |

**Navegação, coleção e marca**

| Componente | Classe | Variantes | Estados / acessibilidade |
|---|---|---|---|
| Skip Link | `lx-skip-link` | — | primeiro foco da página |
| Header | `lx-header` | `--overlay` (sobre Opening Frame, com scrim) | `nav` rotulado; `aria-current="page"` |
| Mobile Navigation | `lx-mobile-nav` (`dialog`) | — | `showModal()`; foco preso; Esc fecha; foco volta ao gatilho |
| Footer | `lx-footer` | — | `contentinfo` |
| Collection Card | `lx-collection` (`ul`) + `lx-collection-card` | — | um link por card (área inteira clicável); sem caixa nem sombra |
| Concept Credit | `lx-credit` | — | não renderiza sem autorização nos dados; logo da parceira nunca recolorido |
| Logo | `lx-logo` | `--vertical`; `--pending` (só para asset ausente) | `<img alt="">` dentro de link com nome acessível; `<picture>` troca pelo ícone abaixo de 360px |

### Superfícies de produto (W2B, ADR-0009)

Regra global: **mobile-first com paridade funcional** — toda função alcançável e concluível a partir de 320 px; a
ergonomia pode mudar entre larguras, o resultado não. Exceção só como decisão explícita de produto, registrada na
spec da funcionalidade. Proibido overflow horizontal **não intencional** do documento; rolagem horizontal
deliberada só dentro de um componente de dados, contida e acessível.

| Componente | Classe | Variantes | Estados / acessibilidade |
|---|---|---|---|
| App Shell | `lx-app` + `__bar` (< lg), `__nav` (≥ lg), `__nav-list`, `__nav-link`, `__account`, `__main`; gaveta = `lx-mobile-nav` | fundo da navegação por `data-ground` (`night` ou `paper`; o logo acompanha o fundo) | skip link; `nav` rotulado; `aria-current="page"`; gaveta fecha ao cruzar `lg` e o foco vai ao conteúdo |
| Page Header | `lx-page-header` + `__lead` | — | um `h1` por página; metadata em Courier só se for real e útil |
| Page Section | `lx-page-section` (`section` com `h2.lx-display-s`) | — | `aria-labelledby` no título; distância fixa título → conteúdo |
| Layout focado | `lx-focused` + `__panel` (`main`), `__body` | — | tarefa única, sem navegação: login, segundo fator, acesso negado, indisponível e erro; painel em tela cheia no celular e centralizado sobre `wash` a partir de `md` (`--lx-layout-focused-width`); logo sem link, a imagem leva o nome |
| Page Header — contexto e ações (W3) | `lx-page-header__context`, `lx-page-header__actions` | — | contexto = link para o nível de cima, antes do `h1`; ações depois do texto (no celular dividem a largura); confirmação `lx-message` logo abaixo do cabeçalho ganha a distância do conteúdo |
| Record List (W3, ADR-0010 §9) | `lx-record-list` (`ul`) + `__item`, `__title` (`h3`), `__link`, `__meta` (`dl`), `__meta-item`, `__meta-label`, `__meta-value` | — | lista nomeada (`aria-label`); um link por item, esticado (o item inteiro é o alvo e mostra o foco); atributos ausentes não são renderizados; mesma estrutura de 320 a 1920 px, atributos ao lado do título a partir de `md` — nenhuma tabela |
| Ações do formulário (W3) | `lx-form__actions` | — | principal primeiro no DOM; empilhadas em largura total no celular, em linha a partir de `md` |

- **Composição:** o shell recebe `navItems` e o bloco de conta por props, montados na `presentation` de cada slice.
  O DS não conhece módulos, papéis nem regras; textos chegam por props (i18n do slice).
- **React** (`src/design-system/react/`): `AppShell`, `PageHeader` (W3: `context` e `actions`), `RecordList` (W3),
  `FocusedLayout`, `Icon` (espelho de `icons/{menu,close,alert,check}.svg`) e `Logo` (por chave do
  manifest; com `href` é link para o início, sem `href` a imagem leva o nome).
- **Estados de produto:** vazio = `lx-empty`; acesso negado, indisponível e erro inesperado = layout focado com rótulo
  `lx-label`, `h1`, texto e ação (erro: `error.tsx` do App Router, com "Tentar de novo" e sem detalhe técnico na tela).
  Carregando fica para a primeira tela que carregue dados de forma perceptível (consumer-driven).
- **Logo no app:** `GET /brand/logo/<chave>` serve o arquivo da chave do manifest (bytes como fornecidos).
- **Consumer-driven:** componente, estado ou token novo só entra quando uma tela o consome ou o Lab precisa dele
  para demonstrar um componente existente.

## 6. Acceptance criteria

**Tokens e código**
- [ ] `node --test src/design-system/scripts/*.test.mjs` passa.
- [ ] Os 5 valores de marca em `tokens.json` são exatamente os da paleta imutável.
- [ ] `tokens.css` é idêntico à saída de `build-tokens.mjs`.
- [ ] Todo par texto/fundo declarado atinge ≥ 4.5:1, e UI/texto grande ≥ 3:1, em `paper`, `wash` e `night`.
- [ ] Texto branco sobre scrim no pior pixel (branco puro sob o scrim mínimo) atinge ≥ 4.5:1.
- [ ] Zero literais proibidos fora de `tokens.css`, incluindo no Lab.
- [ ] Zero termos vedados pelo REQ-100 em `src/design-system/`.

**Fontes**
- [ ] As três famílias estão self-hosted com `OFL.txt`.
- [ ] Total ≤ 220KB; arquivos com preload ≤ 100KB, no máximo 2 arquivos.

**Lab e acessibilidade**
- [ ] O Lab (`src/design-system/lab/index.html`) mostra todas as foundations e os componentes da §5, mais três
  composições R1: Opening Frame da Coleção, Scene de Concept, formulário de interesse.
- [ ] O Lab não tem overflow horizontal em 320, 360, 390, 768, 1024, 1440 e 1920px.
- [ ] axe-core (WCAG 2.2 AA) não aponta violações no Lab.
- [ ] O percurso completo por teclado funciona, com foco sempre visível.
- [ ] Com `prefers-reduced-motion: reduce`, não há transform nem animação.

**Superfícies de produto (ADR-0009)**
- [ ] Nenhuma media query de largura com `max-width` em `src/design-system/` (`check-hardcodes`).
- [ ] Telas de produto: axe 0 a 390 e 1440 px; sem overflow horizontal não intencional do documento de 320 a
  1920 px; zero erro de console; fluxo principal executado a 390 px com toque.
- [ ] Shell: 1023 px → barra + gaveta; 1024 px → navegação lateral; gaveta aberta fecha ao cruzar `lg` e o foco vai
  a um lugar válido; alvos ≥ 44 px; sem animação com movimento reduzido.
- [ ] Smoke Playwright WebKit do shell e do login (não equivale a Safari/iOS real).
- [ ] O Lab mostra as superfícies de produto: seção 17 e as páginas de demonstração `lab/produto-app.html` e
  `lab/produto-focado.html`, com axe 0 e sem overflow de 320 a 1920 px.
- [ ] W3: o Lab (seção 17) mostra o Page Header com contexto e ações (inclusive a destrutiva), a confirmação abaixo do
  cabeçalho, a Record List e as ações do formulário.
- [ ] W3: na expressão `product`, `lx-evidence--inline` fica em uma coluna no celular e ganha colunas a partir de `md`.

**Repositório**
- [ ] `frontend-design`, `CLAUDE.md` e `AGENTS.md` apontam para este sistema.
- [ ] `docs/specs/canonical/**` e `activate-ultronpx.mjs` permanecem intactos.

## 7. Edge cases

- **Sem fotografia oficial:** `lx-frame--typographic` (fundo night, nome em Display, metadados em Courier,
  moldura hairline). Nunca foto de banco fingindo ser o imóvel.
- **Concept sem Edition:** o card e a página mostram o Concept e aceitam interesse. Não mostram oferta nem
  condição comercial (REQ-022).
- **Brand Partner encerrada ou sem autorização:** `ConceptCredit` não renderiza (BR-021).
- **Valor de Evidence ausente:** o item some. Nada de "—", "0" ou valor presumido (TECH-001).
- **Headline longa em PT:** `text-wrap: balance`, medida máxima e hifenização desligada em display.
- **Texto sobre imagem:** só branco e só dentro da área com scrim mínimo de 68%.
- **Modalidade Co-Owner:** o campo de dias aproximados aparece com anúncio (`aria-live`) sem mover o foco.
  Com Owner, o campo sai do DOM.
- **JS indisponível:** conteúdo visível (reveal é progressivo). O menu mobile degrada para lista de links.
- **Browser sem scroll-driven animations:** sem reveal, conteúdo estático.

## 8. Security considerations

- Sem nova superfície de ataque: nenhum endpoint, dado ou deploy. Threat model dispensado.
- Fontes self-hosted, sem requests a terceiros (menos rastreamento; bom para a LGPD).
- O Lab não é publicado. No W0, a rota interna é `noindex` e fica fora de produção.
- W2B: `GET /brand/logo/<chave>` é uma rota pública de asset — só chaves do manifest (o caminho do arquivo nunca
  vem do request; chave desconhecida → 404), SVG com CSP `default-src 'none'; style-src 'unsafe-inline'`, sem dado
  nem estado.

## 9. Observability

Não aplicável (camada visual). Performance acompanhada por Core Web Vitals no W0: LCP, CLS = 0 em Frames, INP.

## 10. Rollout plan

- Ondas DS-0…DS-7 em `docs/plan/implementation-waves.md`, sequenciais.
- Após o W0: wrappers React, `next/font/local` com os mesmos woff2, rota `/lab` interna adicional, e Vitest,
  Playwright, axe e regressão visual na CI.
- Mudanças de token são versionadas no `CHANGELOG.md`.
- W2B ([ADR-0009](../adr/0009-superficies-de-produto-mobile-first.md)): superfícies de produto — shell, layout focado,
  padrão de página e estados, com o Admin como primeiro consumidor.

## 11. Open questions

1. ~~Kit oficial de logos~~: **recebido em 2026-09-25** (manifest em `src/design-system/brand/logo/`). Falta ainda uma
   versão **Pure White** para uso sobre fotografia; até lá, Warm Sand sobre scrim ≥ 68%.
2. **Fotografia oficial** de Concepts e Residences.
3. **Campos de contato e qualificação** do interesse (REQ-025), incluindo base legal e consentimento LGPD.
4. **Regras de exposição de marca por Brand Partner** (BR-015).
5. **Rótulo público da vitrine:** "Coleção" (recomendado; `Collection` internamente, termo não canônico).

## 12. References

- ADR: [0003 — Design System como camada compartilhada](../adr/0003-design-system-camada-compartilhada.md)
- Canônicos: [01](canonical/01-business-model-business-rules.md) · [02](canonical/02-product-spec.md) ·
  [03](canonical/03-technical-spec.md)
- Referência histórica: `Luxtory/Luxtory2.0` (princípios de scrim, grain em tile, editorial; nada importado).

## 13. Core Design System Luxtory (2026-10-06)

> Plano FINAL aprovado pelo fundador em 2026-10-06. Esta seção **supersede a direção visual** das seções anteriores
> (que ficam como histórico) e é o contrato vigente do sistema. As decisões aceitas no
> [ADR-0003](../adr/0003-design-system-camada-compartilhada.md) continuam válidas: camada compartilhada em
> `src/design-system/`, `tokens.json` único (DTCG) → `tokens.css` gerado, cascade layers, classes `lx-*`, wrappers React
> finos, as mesmas três fontes, testes `node --test` e Lab com `lab/index.html` como entrada. Por isso não há ADR novo.

**Missão.** Um único Core Design System para toda a Luxtory. A primeira implementação real é a **Wave 4 — Discovery
público** (CP2); Auth (CP3) e Admin (CP4) vêm depois e não bloqueiam a W4. Club (R2/R3) consumirá o mesmo Core quando
uma wave real exigir (consumer-driven).

### 13.1 Precedência e herança

1. Direção atual do fundador. 2. Padrões recorrentes das páginas prioritárias do Luxtory2.0 (Home, Quero ser associado,
Candidatura, Develop & Sell), medidos no código e em produção. 3. UX, acessibilidade (WCAG 2.2 AA) e responsividade
(320–1920 px). 4. Necessidades reais da W4. 5. Código anterior só quando compatível.

- Do DS visual anterior, a única herança são as famílias tipográficas (§5): Newsreader, Hanken Grotesk, Courier Prime.
- Logo, copy, funcionalidade e regras de negócio seguem suas próprias fontes de verdade, não herança visual.
- Aprovações visuais de experimentos anteriores (CP1 B2C, Home) não são fonte de verdade; branches não integradas são
  só referência. O namespace `b2c` não entra no Core.
- Defeitos objetivos de contraste do legado não são herdados (ex.: corpo Moroccan Blue sobre Warm Sand, 4,32:1).

### 13.2 Migração sem big-bang

- **Flag único de geração:** `data-lx="core"` no elemento raiz de um shell ativa as regras do Core. Toda regra em
  `styles/core/` (exceto `surfaces.css`) começa por `[data-lx="core"]`, nas layers existentes, importada depois do legado
  em `styles/index.css`. Sem o flag, nada do Core se aplica (testado).
- **Superfícies** (`data-surface`) e os tokens novos não colidem com o legado (`data-ground`, `text.*`).
- Ordem: CP1 só o Lab liga o flag · CP2 shell público (W4) · CP3 FocusedLayout (Auth) · CP4 AppShell (Admin) · CP5 o flag
  vira default, o legado sai do entrypoint e os tokens superseded (§13.9) são removidos quando permitido. Arquivos não
  são apagados nem movidos (governança): ficam sem consumidores, com cabeçalho de supersessão.
- Cada checkpoint tem branch/PR próprio a partir da `main` com o anterior mergeado; STOP e aprovação do fundador antes
  do merge.

### 13.3 Foundations

**Paleta de marca** (inalterada, §5): exatamente os cinco valores. Cores funcionais não são cores de marca.

**Superfícies** (`data-surface`, grupo `surface` em `tokens.json`). Os papéis são referências à paleta; `lx.alpha`
compõe a cor sobre o fundo (testado contra o fundo da superfície).

| Superfície | Fundo | Headline (≥ 24 px) | Corpo / secundário | Ação (fundo / texto) | Foco | Divisor decorativo |
|---|---|---|---|---|---|---|
| `blue` | Moroccan Blue | Warm Sand (4,32) | White / White 80% | Warm Sand / Dark Blue; hover White | Warm Sand | White 20% |
| `deep` | Dark Moroccan Blue | Warm Sand (5,57) | White / White 80% | Warm Sand / Dark Blue; hover White | Warm Sand | White 20% |
| `sand` | Warm Sand | Moroccan Blue (4,32) | Dark Blue / Dark Blue | Dark Blue / White; hover Moroccan Blue | Dark Blue | Moroccan Blue 25% |
| `white` | Pure White | Moroccan Blue | Dark Blue / Moroccan Blue | Moroccan Blue / White; hover Dark Blue | Dark Blue | Moroccan Blue 15% |
| `wash` | Sand Wash | Moroccan Blue | Dark Blue / Moroccan Blue | Moroccan Blue / White; hover Dark Blue | Dark Blue | Moroccan Blue 15% |

- **Headline sobre Blue/Deep (D1-A):** a headline principal é Warm Sand quando o contraste permite (Blue: só ≥ 24 px;
  Deep: qualquer tamanho; sobre foto: medido nos pixels). `em` só quando a copy autoriza ênfase: Newsreader itálico,
  herdando tamanho, métricas e cor da headline. O padrão "headline White + `em` Warm Sand" não é regra do sistema.
- **Sobre `sand`:** texto sempre Dark Blue 100% (nenhuma transparência em texto); Moroccan Blue só em display ≥ 24 px.
  Formulários e mensagens de estado não são permitidos sobre `sand`.
- **Estados semânticos (funcionais).** Consumidores reais: `error`, `success`, `warning` (avisos e campos do Admin/Auth);
  `info` só com consumidor. Estado = cor semântica + ícone/texto + ARIA, nunca só cor.
  - `error`: `#9B2226` nas superfícies claras e `#F2B8B5` nas escuras — valores existentes reavaliados no CP1 e mantidos
    (7,92 white · 7,12 wash · 5,33 blue · 6,87 deep). Sobre `sand` reprova (3,76): por isso estados não vão sobre `sand`.
  - `success`: Moroccan Blue (claro) / White (escuro), com ícone de confirmação. `warning`: indicador Dark Warm Sand
    (claro, ≥ 3:1) / Warm Sand (escuro), texto na cor do corpo. Distinguíveis entre si quando coexistem.
- **Tipografia** (grupo `type`; leading e tracking nos grupos existentes):

| Papel | Família | Tamanho (390 → 1440 px) | Leading |
|---|---|---|---|
| `type.statement` | Newsreader 400 | 2,25 → 4,5rem | `leading.display` |
| `type.headline` (hero = H2) | Newsreader 400 | 1,75 → 3rem | `leading.heading` |
| `type.page-title` (produto) / `type.ordinal` | Newsreader 400 | 1,5 → 2,25rem | `leading.heading` |
| `type.section-title` (produto) | Newsreader 400 | 1,25 → 1,5rem | `leading.heading` |
| `type.title` (tópico) | Newsreader 400 | 1,125 → 1,25rem | `leading.title` |
| `type.closing` / `type.subheadline` | Newsreader / Hanken 400 | 1,125 → 1,5rem | `leading.support` |
| `type.body` | Hanken 400 | 1 → 1,125rem | `leading.reading` |
| `type.compact` | Hanken 400 | 0,9375rem | `leading.compact` |
| `type.label` | Hanken 500 | 0,875rem | `leading.tight` |
| `type.button` / `type.button-large` | Hanken 500, uppercase, `tracking.button` | 0,8125rem / 1rem | — |
| `type.eyebrow` | Hanken 600, uppercase, `tracking.eyebrow` | 0,75rem | — |
| `type.meta` | Courier Prime 400 | 0,8125rem | só ids, códigos e timestamps no produto; nunca no público |

- **Espaço e layout:** escala de 4 pt existente; `space.section` 64 → 144 px (editorial); `space.section-operational`
  32 → 48 px; margem `layout.margin`; `layout.container` 87,5rem · `layout.content` 72rem · `layout.measure` 45rem ·
  `layout.split-text` 32,5rem · `layout.split-text-wide` 38,75rem · `layout.faq` 50rem · `layout.split-media-min` 35rem ·
  `layout.focused-panel` 28rem · `layout.bar-height` 4rem; colunas 4/8/12; breakpoints atuais.
- **Forma:** radius 0 em superfícies e mídia, `radius.hairline` (2 px) em controles; pill só em indicadores (nenhum
  consumidor no CP1). Borda: hairline decorativa 1 px; controle 1 px com ≥ 3:1; `border.outline` 1,5 px. Sombra: só
  `shadow.overlay` (dialog e drawer); sem glass, glow, grain; gradiente só como scrim. `opacity.disabled` 0,5.
- **Motion:** `duration.quick` 160 · `duration.moderate` 280 · `duration.slow` 480 · `duration.cinematic` 900 ms;
  `ease.editorial`; reveal = fade-up único (≤ 8 px, 480 ms) como melhoria progressiva (conteúdo visível sem JS);
  sem zoom, ScrollProgress, pulse ou drift; reduced motion = nenhuma animação nem transform.
- **Foco e alvos:** outline 2 px, `focus.ring-offset` 2 px, cor pelo papel `focus`; alvos ≥ 44 px, controles 48 px, CTA do
  hero `target.hero` 56 px.
- **Imagery:** fotografia só com relação semântica e asset autorizado; crop por imagem e breakpoint com as classes
  `lx-crop-x-*`/`lx-crop-y-*` (e `lx-crop-lg-*`), sem atributo `style` — a CSP de produção bloqueia estilo inline;
  proporções `ratio.media-sm/md/lg` (5:4 → 4:3 → 3:2) e altura livre ≥ 35rem a partir de `lg`; scrim localizado em
  Dark Blue (nunca camada global), validado nos pixels reais sob o texto. Sem mídia adequada, usar um pattern sem
  mídia. Concept sem fotografia oficial = composição tipográfica (P-1).

**Política de tokens.** Tokenizado: paleta, papéis de superfície, cores funcionais, tipografia, escala de espaço,
layout, breakpoints, borda e radius globais, sombra, opacidade, motion, foco, z-index, alvos, proporções e scrim. Uma
dimensão local, específica de um componente e sem significado sistêmico, pode ficar local (sem token soup). O
`check-hardcodes` proíbe fora do `tokens.css`: literais de cor, `font-family`, duração, easing, z-index, `border-radius`
(exceto `0` e `50%`) e comprimentos em `box-shadow`; `@media` só com breakpoints e só `min-width` — proibido
`@media (max-width: …)`. A **propriedade** `max-width:` é permitida (containers, medida, componentes).
**Contextos não duplicam foundations:** nenhum grupo `b2c.*`, `admin.*`, `auth.*`, `club.*` ou `public.*`; aliases
contextuais só como referência ao Core e expressando função (testado).

### 13.4 Primitives (classes existentes, expressão do Core sob o flag)

| Primitive | Classe | Core |
|---|---|---|
| Button | `lx-button` + `--primary` `--secondary` `--quiet` `--destructive` `--large` `--block` | uppercase `type.button`, `tracking.button`, 48 px (`--large` 56 px), radius 2 px; secundário com contorno 1,5 px; destrutivo no papel `error`; `disabled`/`aria-busy` |
| Link | `lx-link`, `--standalone` | sempre sublinhado; cor do papel `link`; hover engrossa o traço |
| Icon Button | `lx-icon-button` | 48 × 48, nome acessível obrigatório |
| Logo | `lx-logo` | kit oficial por `manifest.json`, sempre `<img>`; Warm Sand sobre Blue/Deep, Moroccan Blue sobre claros |
| Field | `lx-field`, `lx-label`, `lx-hint`, `lx-error`, `lx-input`, `lx-textarea`, `lx-select` | 48 px, texto 16 px, radius 2 px, borda ≥ 3:1, label em sentence case; erro = papel `error` + ícone + texto + `aria-invalid` |
| Radio/Choice | `lx-choice-group`, `lx-choice` | retangular, 48 px, borda ≥ 3:1, alvo inteiro |
| Form Message | `lx-message--success/--warning/--error` | barra semântica + ícone + título; `role="status"`/`"alert"` |
| Disclosure | `lx-disclosure` | `<details>` nativo, pergunta em Newsreader, hairlines, seta que gira; sem caixa nem sombra |
| Dialog / Drawer | `lx-mobile-nav` | `<dialog>` nativo à direita (largura total no celular), superfície `blue`, links em Newsreader; foco preso, Esc, retorno do foco |
| Skeleton / Empty / Error | `lx-skeleton`, `lx-empty`, layout focado | estáticos; erro sem detalhe técnico |
| Tipografia | `lx-statement`, `lx-headline`, `lx-title`, `lx-subheadline`, `lx-closing`, `lx-ordinal`, `lx-eyebrow`, `lx-meta`, `lx-compact`; legado sob o flag: `lx-display-m` → título de página, `lx-display-s` → título de seção, `lx-lead`, `lx-body`, `lx-small`, `lx-label`; opt-in `main.lx-titles-headline` (`SiteShell titleRole="headline"`): `lx-display-s` e subheadlines em heading no papel de headline da superfície — sobre Blue, abaixo de 24 px, Warm Sand com 10% do branco do corpo (4,69:1); opt-in `main.lx-type-ceiling` (`SiteShell typeCeiling="home-hero"`): nenhum texto maior que a Headline do Hero da Home (`--lx-type-home-hero`) — headlines, statements, display e ordinais usam `min()` da própria escala com a do Hero | §13.3 |

Só contrato (sem consumidor; entram com a primeira wave que consumir): Checkbox, Badge, Tabs, Table, Pagination,
Loading, KPI e Filter.

### 13.5 Components

SiteHeader (`lx-header`: sólido `blue` e `--overlay` transparente sobre a mídia; com JS, fixo e sólido após rolagem),
Menu (`lx-mobile-nav`), Footer (`lx-footer`, superfície `deep`), AppShell (`lx-app`: navegação `blue`, conteúdo `white`,
item ativo Warm Sand + Dark Blue), FocusedLayout (`lx-focused`: canvas `blue`, painel `deep` com hairline, sem sombra),
PageHeader, PageSection, RecordList, FormActions, Evidence (`lx-evidence`, `dl` de atributos), Media (`lx-media`),
HeroCarousel, CollectionCard e ConceptCredit.
Componentes novos só com consumidor real.

### 13.6 Patterns oficiais

Requisitos definidos pelo fundador; composições CSS, não automaticamente React. Uma página escolhe só os que servem à
sua função.

| Pattern | Classe | Estrutura obrigatória | Mobile |
|---|---|---|---|
| Cinematic Hero | `lx-hero` | foto protagonista full-bleed; conteúdo baixo; header sobre a mídia; CTA e controles discretos; scrim só localizado | assunto preservado por crop; carrossel pausável; reduced motion sem autoplay |
| Problem / Triad Comparison | `lx-triad-comparison` | copy + Tríade de valor no topo; três alternativas equivalentes abaixo; uma única composição | copy → tríade → alternativas |
| Triad Statement | `lx-triad-statement` | 01 Patrimônio · 02 Liberdade · 03 Pertencimento; divisores; grande statement; sem cards | células em linha (número + palavra) |
| Editorial Comparison | `lx-comparison` | colunas abertas, sem caixas preenchidas; respiro + hairlines | unidades com regra horizontal |
| Panel Comparison | `lx-panels` | versão densa; painéis irmãos com a mesma geometria e hierarquia (subgrid) | painéis completos, mesma ordem |
| Numbered Editorial List / Disclosure | `lx-numbered` | número, título, descrição, divisor; affordance quando interativa | número + título, descrição abaixo |
| Editorial Split | `lx-split` (`--media-start`, `--wide-text`) | text/media e media/text; mídia preenche a massa; 50/50 de referência, 58/42 quando justificado | ordem do DOM; sem mídia = uma coluna, nunca vazio |

Complementares consumidos pela W4 (receitas em [`catalog.md` §13.9](catalog.md)): Text + Diagram (`lx-diagram`),
Statement/Pause (`lx-pause`, com `--opening` para aberturas tipográficas), FAQ (`lx-faq`) e Sibling Blocks
(`lx-siblings`). Final CTA e Form Section esperam consumidor. Cabeçalho de seção: `lx-section-head` (índice, filete,
eyebrow, título).

**Diagramas** — dois ativos distintos, geometria original preservada (assinatura testada contra o original):

| Diagrama | Arquivo | Representa | Uso |
|---|---|---|---|
| Tríade de valor desejado | `public/diagrams/core/triade-valor-desejado.svg` | Patrimônio + Liberdade + Pertencimento como tensão | Problem / Triad Comparison |
| Diagrama de solução Luxtory | `public/diagrams/core/diagrama-solucao-luxtory.svg` | integração das dimensões | "E se você não precisasse escolher?" (Text + Diagram) |

Originais em `Luxtory2.0/src/assets/`. Só fonte (Newsreader/Hanken embutidas, OFL), pintura canônica e contraste foram
adaptados; a versão em `public/diagrams/triade-valor-desejado.svg` continua servindo a Home legada até o CP2.

### 13.7 Contextos

| Contexto | Superfícies e expressão | Shell | Patterns | Proibido |
|---|---|---|---|---|
| Public (W4) | `blue`/`sand` alternados, `white` (FAQ, leitura densa), `deep` (painéis), foto; editorial | SiteHeader, Menu, Footer | oficiais + complementares consumidos | KPIs, densidade |
| Auth | canvas `blue` + painel `deep`; operacional | FocusedLayout | Focused Task | foto, hero, storytelling, mais de 1 CTA |
| Admin | papel `white`, navegação `blue`, Sand como acento; densidade controlada | AppShell | Operational Page, Record List, Form, Focused Task | storytelling, foto, hero |
| Club | R2/R3 consumirão o mesmo Core | — | consumer-driven | criar qualquer coisa agora |

### 13.8 Aceite do CP1

- Contratos do DS (`npm run test:ds`): exatamente os cinco valores da paleta (não proíbe cores funcionais justificadas);
  exatamente as três famílias; sha do logo; matriz completa papel semântico × superfície (`white`, `sand`, `blue`,
  `deep`, `wash`) conforme os papéis permitidos em cada uma; `check-hardcodes` ampliado; nenhum grupo de token por
  contexto; regras do Core só sob o flag; nenhum shell do produto liga o flag no CP1; assinatura dos diagramas;
  terminologia.
- Lab do Core (`lab/core.html`, `lab/core-auth.html`, `lab/core-admin.html`): axe 0 a 390 e 1440 px; sem overflow de 320
  a 1920 px; teclado e foco; dialog; carrossel pausável; reduced motion; alvos ≥ 44 px; contraste do hero medido nos
  pixels; evidências a 390, 768, 1024 e 1440 px e patterns isolados.
- Superfícies da W4 idênticas ao baseline da `main` (nenhuma página liga o flag); lint, typecheck e build verdes.

### 13.9 Superseded (removidos no CP5, quando permitido)

Grupos e tokens: `ground.*` (`paper`, `wash`, `night`), `text.*`, `measure.*`, `space.scene`, `ratio.establishing*`,
`ratio.living`, `ratio.detail`, `grain.*`, `layout.container-max`, `layout.container-narrow`, `layout.header-height`,
`layout.focused-width`, `duration.drift`, `duration.base`, `ease.settle`, `ease.cinematic`, `focus.offset`,
`leading.body`, `tracking.label`, `tracking.marker`. CSS: `narrative.css`, `home-hero.css`, `scene.css`, `frame.css`,
`marker.css`, `sequence.css`, `pair.css`, `blocks.css`, `drawings.css` e as regras legadas dos componentes que o
Core reexpressa. React: `Scene`, `TriadDrawing`, `HorizonDrawing`, `TypographicFrame` e o `SiteShell` com `data-ground`. A lista final é conferida no CP5
pelo teste de zero consumidores.

### 13.10 CP2 — Wave 4: refinamentos do Core pelo primeiro consumidor (2026-10-06)

> O site público (`SiteShell` + `SiteHeader`) é o primeiro consumidor do flag `data-lx="core"` (contrato
> `APPROVED_FLAG_CONSUMERS`). Os refinamentos abaixo vêm da Especificação Visual Final da Home do fundador
> ([`catalog.md` §13.10](catalog.md)) e são do Core — servem a qualquer página, não só à Home.

**Tratamentos por superfície (regras globais da especificação, dentro do AA).** Headline sobre Sand = Dark Moroccan
Blue (5,57:1). O eyebrow usa o papel `marker`, agora na matriz de contraste como texto (4,5:1): White 80% em Blue
(Warm Sand mediria 4,32:1), Warm Sand em Deep, Dark Moroccan Blue em Sand, Moroccan Blue em White. Hairlines (`rule`) em
Blue e Deep = Warm Sand com opacidade 0,4. Chevron dos disclosures no papel `marker`.

| Peça | Classe | Uso |
|---|---|---|
| Columns | `lx-columns` (`--7-5`, `--5-7`; padrão 6/6) | splits do grid de 12 colunas dentro do container; uma coluna até `lg` |
| Stack | `lx-stack` | fluxo vertical de uma coluna (eyebrow, headline, parágrafos) |
| Section split | `lx-section-split` | seção que abre com um Editorial Split full-bleed e continua no container |
| Panel Switch | `lx-panel-switch` | um painel interativo: opções de texto sobre hairline (radios nativos), linhas ATRIBUTO ——— VALOR; ativo = sublinhado Warm Sand + semibold |
| Editorial List | `lx-editorial-list` | palavras em ritmo vertical entre hairlines, sem bullets |
| Cinematic Hero | `lx-hero` (`--closing`), `lx-hero__title`, `__index`, `__progress`, `__step` | headline White com virada Warm Sand (só no Hero); no celular, fotografia → conteúdo; controles só com duas ou mais fotos; `--closing` = CTA final sobre fotografia |
| Triad Comparison | `lx-triad-comparison__copy`, `__alternatives` | 7/5; alternativas numeradas entre hairlines (superior, verticais, inferior) |
| Editorial Comparison | `lx-comparison--divided` | Owner \| Co-Owner: hairline superior e divisor central; empilhado no celular |
| Editorial Split | `lx-split--wide-media`; `--media-start` reordena a partir do `lg` | 7/12 para a fotografia; texto → imagem no celular com a imagem à esquerda no desktop |
| Text + Diagram | `lx-diagram--even` | 6/6 |
| Value Equation | `lx-equation`, `__term`, `__operator`, `__result` | desde `D-BP-25`, card reto `deep`, três frases Warm Sand em itálico (`lx-display-s`), + em linha própria e régua antes do resultado; substitui a apresentação anterior: conta vertical (`D-BP-23`; antes, `D-BP-21` com círculos e `D-BP-22` com resultado maior): premissa, + premissa, a linha de cálculo (hairline `rule-strong` de ponta a ponta), = resultado; as três linhas num só papel da marcação (`lx-display-s`); + e = iguais, fonte utility em peso medium, opacidade total, num gutter, com o texto num só eixo; nunca card (Brand Partners) |
| Columns --aside-text | `lx-columns--aside-text` (quatro filhos) | desde `D-BP-26`, card centrado verticalmente somente no texto corrido lateral, excluindo eyebrow e headline (`grid-row: 2 / span 2`, `align-self: center`; em `D-BP-25`, incluía o bloco lateral completo); DOM e sequência no celular preservados: cabeça → introdução → card → corpo. Substitui somente o alinhamento anterior: cabeça no topo da coluna inicial; do `lg`, o texto corrido abaixo dela e o elemento principal ao lado do texto, com o topo na primeira linha dele; no celular, cabeça → texto → principal → resto do texto (substitui o `--aside-even` de `D-BP-22`) |
| Text + Diagram de referência | `lx-diagram--reference`, `lx-diagram__item` | do `lg` em diante, o diagrama no tamanho renderizado da Home B2C a 1440 px (437 × 490 px, proporção preservada), topo no primeiro bloco, texto na largura restante e itens no ritmo dos Sibling Blocks; empilhado abaixo (Brand Partners, `D-BP-20`) |
| Statement / Pause | `lx-pause--start` | abertura tipográfica alinhada ao início, sob o header sólido |
| Numbered List | `lx-numbered--compact`, `lx-numbered__text--wide` | índice de links; linha sem título |
| FAQ | `lx-faq--start` | alinhado ao cabeçalho |
| Media | `lx-media__caption` | legenda curta sobre a foto, com scrim local (ex.: "Imagem conceitual") |
| Ícones | `chevron-left`, `chevron-right`, `pause`, `play` | controles do carrossel e disclosures |

Diagrama de solução: os rótulos "Venda Integral", "Aluguel de Temporada" e "Clube de Lazer" foram removidos do SVG
(decisão do fundador, 2026-10-06); círculos e traços intactos, assinatura do contrato atualizada. Home: eyebrow
`lx-eyebrow--accent` (Warm Sand) sobre Moroccan Blue com exceção de contraste registrada (catalog §13.10); o Hero
volta à composição `lx-home-hero` da W4 com um scrim sobre toda a fotografia. A `Collection` (React) passa a gerar
os cards tipográficos do Core em Sibling Blocks; `MobileNav` aceita `surface` (Core) além de `ground` (legado).

**Como funciona (2026-10-06).** Complementos do Core com o Como funciona como consumidor (catalog §13.11), só tokens e
atrás do flag: **Answer Rows** `div.lx-answers` > `div.lx-answers__row` > `h3.lx-answers__label` +
`div.lx-answers__content` (+ `div.lx-answers__full` na largura da linha) — a pergunta do leitor ou o rótulo de um
momento à esquerda, a resposta à direita (4/8 a partir do `lg`, para que um par Owner | Co-Owner fique em até três
linhas), uma hairline entre linhas; **Figures** `ul.lx-figures` > `li.lx-figures__item` > `dl.lx-figures__data`
(`dd.lx-figures__value` em Newsreader) — conjuntos comparáveis com a mesma geometria, 1 → 2 × 2 → 4 colunas, nunca
aparência de plano; **índice de capítulos do Hero** `nav.lx-hero__chapters` > `ol` > `a.lx-hero__chapter`
(`__chapter-number` no papel `marker`, `__chapter-name` em Newsreader), alvos ≥ 44 px; **nota de modalidade**
`div.lx-numbered__note` dentro de um item numerado; recortes `lx-crop-md-x-*` (a partir de `md`, antes do `lg`); ícone
`arrow-down`. Refinamentos aprovados pelo fundador (2026-10-07): `lx-answers--phases` (cada momento abre com a
hairline forte); a pergunta do leitor (`lx-answers__label.lx-subheadline`) em Hanken `weight.medium`, o mesmo peso de
labels e botões, para se distinguir dos leads do mesmo tamanho; `lx-figures__value--primary` (o número que responde à
pergunta, em `type.headline`). **Scrim uniforme (opt-in)** `lx-hero--uniform`: uma camada Dark Moroccan Blue sobre
100% da foto, sem a placa local nem a faixa do header, na opacidade `--lx-hero-scrim-alpha` = token novo
`scrim.display-alpha` 0,80 — o nível em que um headline Warm Sand mantém 3:1 até sobre um pixel branco, com o alfa em
8 bits como o navegador o renderiza (0,79 vira 0,788 e cai para 2,998:1; verificado por `check-contrast`). É decisão do fundador para a composição do Como funciona e prevalece, só nela, sobre a regra
"scrim só localizado"; o Cinematic Hero padrão (Lab, fechamento da Home) continua com o scrim local.

**Coleção (2026-10-07).** Complementos do Core com a `/colecao` final como consumidora (catalog §13.12, `D-B2C-21`),
num arquivo próprio `styles/core/collection.css`, só tokens e atrás do flag: **Discovery** `form.lx-discovery[role=search]`
(busca `__search` > `__input` + `__submit`, sempre dentro da barra branca; no celular o envio ocupa a largura com o rótulo
"Explorar a Coleção", ≥ 48 px) com **Facets** `__facets` > `details.lx-facet` (`__summary` = `__label` em `type.label` +
`__value` em `type.body`, que quebra linha e nunca é cortado; `__panel` em popover a partir do `md`, `--end` para os
últimos) e escolhas `label.lx-check` (alvo ≥ 44 px, `__note` opcional); sem JS (`[data-lx-js]` ausente) as facetas valem
em qualquer largura. **Barra fixa** `div.lx-discovery-sticky` + `form.lx-discovery--compact` (lg+, fixa no topo só quando
a barra do Hero sai da tela; nome de landmark próprio): `div.lx-discovery__search` + `div.lx-discovery__tools` (facetas
só com o rótulo numa linha + `span.lx-facet__count` quando ativa, `a.lx-discovery__count` "Filtros (n)", envio) — flex
que quebra sozinho: o grupo ao lado da busca quando cabe, numa segunda linha quando não; o `gap` de 1 px sobre
`color.rule` desenha o fio entre eles. A dica da busca é `span.lx-discovery__placeholder` (longa só no Hero a partir do
`lg`, curta no resto; mesma fonte, nunca cortada). **Resultados** `div.lx-results-head`, `ul.lx-chips` >
`a.lx-chip` (filtro ativo removível), `nav.lx-sort` > `a.lx-sort__option[aria-current]`, grupos
`section.lx-concept-group` > `__head`. **Concept Card** `ul.lx-concept-grid` > `li` > `article.lx-concept-card`
(`--featured` = Editorial Split nas 12 colunas a partir do `lg`) > `figure.lx-media.lx-concept-card__media` (4:3 no
celular, 4:5 a partir do `md`, 3:2 no destaque; recorte `lx-crop-*`) ou o quadro tipográfico
`div.__media--type[data-surface=blue]` > `span.__word` (lifestyle principal ou título, decorativo) + `div.__body`
(`__title` > `a.__link` que torna o card inteiro o alvo, `__meta`, `__facts`, `ul.__editions` > `li.__edition` com
`__region` e uma linha por base, hairline entre Editions, `__none`, `__cta` no pé, alinhado na linha). **Steps**
`ol.lx-steps` > `li.lx-steps__item` (3 · 2 · 1 colunas, hairlines). **Filtros no celular** `dialog.lx-filters` >
`form.__form` (`__bar` · `__body` com rolagem · `__foot` fixo; "Faixa de valor" e "Mais filtros" em
`section.__group` > `h3.lx-eyebrow.__heading`, o mesmo nome do desktop). Controles nativos dentro da barra, da barra fixa e do
diálogo seguem a superfície branca (`color-scheme: light`). Ícone novo `arrow-up` ("Refinar a busca ↑").
