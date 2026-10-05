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

## CP1 — rebase visual B2C (2026-10-05)

Plano e clarificações aprovados pelo fundador na conversa de 2026-10-05. Escopo deste checkpoint:
foundations aditivas e demonstração privada em `/lab/lab/b2c.html`; nenhuma página do produto migra nesta etapa.
Este registro supersede a direção estética anterior somente para a expressão pública B2C, respeitando os gates abaixo.
Admin e demais consumidores internos mantêm seus contratos e sua aparência.

- Composição/UI: padrões recorrentes nas páginas prioritárias do Luxtory2.0 (Home, Associação/Candidatura,
  Develop & Sell) prevalecem sobre soluções isoladas. Empates estéticos reais são apresentados no CP1 ao fundador.
- Marca: paleta canônica do Luxtory2.0, equivalente aos tokens existentes; drift RGB publicado não é referência.
- Preservações visuais obrigatórias: Newsreader, Hanken e ênfase inline. Ênfase = Newsreader da headline,
  mesmo tamanho/peso/métricas, itálico e Warm Sand, com contraste acessível. Palavras vêm da copy autorizada.
  Logo oficial é ativo de marca; reutilizar primitives preserva comportamento/semântica/acessibilidade quando
  adequados, sem congelar a aparência anterior.
- Composição: equilíbrio de massa; split 50/50 de referência, variações justificadas; mídia contextual preenchendo
  sua área; ordem mobile narrativa/DOM. Sem mídia adequada, composição editorial própria, sem coluna residual.
- Implementação: grupo aditivo `b2c` em tokens.json; valores dimensionais são propostas do CP1. Foundations e
  variantes escopadas em `.lx-b2c`, importadas exclusivamente pela nova demonstração, sem alterar o entrypoint atual.
- Mídia: legado e Kaizen são candidatos identificados de avaliação privada. Autorização definitiva não bloqueia
  CP1; aprovação/contexto devem ser confirmados antes de produção. Kaizen não é Edition disponível, prova de outro
  Concept ou benefício atual. A tríade preserva a geometria original, com fontes e contraste adaptados no Lab.
- Forms: exemplos genéricos sem envio/armazenamento ou definição de campos da W6. Sem backend, API, migration,
  dependência ou componente React antecipado.
- Gates: CP1 DS → aprovação explícita → Home → aprovação explícita → demais superfícies. Cada aprovação autoriza
  somente a etapa seguinte. A rota interna mantém 404 em Production e noindex/no-store fora dela.

Aceite do CP1: evidências acessíveis em 1440/390; paleta e fontes corretas; equivalência métrica da ênfase;
composição/crops contextualizados; irmãos coerentes; teclado/foco/disclosures/forms; axe e overflow 320–1920.
Pendências externas da Wave 4 ficam fora desta iniciativa.
