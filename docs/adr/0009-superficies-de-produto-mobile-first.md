# 0009. Superfícies de produto mobile-first e shell de aplicação

- **Date**: 2026-09-27
- **Status**: Accepted
- **Deciders**: Luxtory, Engenharia
- **Tags**: frontend, design-system, architecture, accessibility

## Context

O Design System nasceu para o R1 público (expressão `story`) e deixou as superfícies de produto como non-goal: a
spec prevê `data-expression="product"`, mas sem componentes (tabelas, calendário, gráficos). A W2 entregou a
primeira superfície logada (`/entrar`, `/entrar/mfa`, `/admin`) funcional, porém provisória: sem logo oficial, sem
navegação, sem padrão de página e sem pensar primeiro no celular.

A plataforma inteira será usada no navegador do desktop e do celular: site público, autenticação, Admin, Área do
Titular, calendário, reservas, Club, Luxchange, Luxplus e módulos futuros. A W3 começa a escalar telas; decidir a
base agora evita refazer cada tela depois.

Fatos verificados em 2026-09-27: o CSS do DS já é mobile-first na prática (14 media queries `min-width`, nenhuma
`max-width`), os breakpoints vêm só dos tokens (`lg` = 64rem) e há tokens de alvo de toque (44 e 48 px). O kit
oficial tem logos Warm Sand para fundo `night`. Nenhum script, hook ou teste lê o número das waves.

## Decision

1. **Mobile-first com paridade funcional, regra global.** Toda superfície é projetada primeiro para o celular e toda
   função é alcançável e concluível a partir de 320 px. A ergonomia pode mudar entre larguras (por exemplo, uma
   tabela pode virar cartões); o resultado não. Exceção só como **decisão explícita de produto**, caso a caso,
   registrada na spec da funcionalidade ("Exceção mobile", com a data de aprovação da Luxtory) — nunca implícita.
2. **Overflow.** É proibido overflow horizontal **não intencional** do viewport ou do documento. Um componente de
   dados pode ter rolagem horizontal deliberada, contida e acessível quando a semântica exigir (região rolável com
   nome acessível e alcançável por teclado).
3. **CSS só com `min-width`.** Media queries de largura usam apenas `min-width` com os tokens de breakpoint; o
   `check-hardcodes` recusa `max-width`. Razão: no contrato mobile-first o estilo base serve o celular e cada
   breakpoint só acrescenta; `max-width` cria um segundo caminho de estilos e regressões nos cortes. Uma exceção
   futura é decisão deliberada do Design System (spec + ADR), não workaround.
4. **O DS passa a cobrir superfícies de produto**, com nomes genéricos (`lx-app-*`, `lx-page-header`). O Admin é o
   primeiro consumidor, não o limite.
5. **Dois layouts de aplicação.** *Shell* das áreas logadas com navegação: abaixo de `lg`, barra superior (logo e
   botão de menu; o título da página fica no cabeçalho da página, `lx-page-header`) e gaveta (`lx-mobile-nav`,
   `dialog` nativo); a partir de `lg`, navegação lateral. *Layout focado* para
   tarefas únicas sem navegação (login, MFA e fluxos futuros do mesmo tipo). O site público mantém `lx-header` e
   `lx-footer`. Navegação inferior só será avaliada quando a Área do Titular existir (W7).
6. **Composição, sem regra de negócio no shell.** O shell recebe `navItems` e o bloco de conta por composição na
   camada de apresentação; não conhece módulos, papéis nem regras. Cada slice monta os seus itens; nenhum slice
   importa internals de outro (só a API pública, `index.ts`).
7. **Consumer-driven.** Componente, estado ou token novo só entra quando uma tela o consome (ou quando o Lab precisa
   dele para demonstrar um componente que existe). Tabela, filtros, formulários de produto, barras de ação,
   stepper, calendário, gráficos, toasts e navegação inferior entram na wave que os usar.
8. **React fino.** Wrappers React só para o que tem comportamento (gaveta) ou estrutura repetida (shell, cabeçalho
   de página, logo); o resto continua classe `lx-*` (ADR-0003). Nenhuma string de produto dentro do DS: textos
   chegam por props, vindos do i18n do slice.
9. **Direção visual editorial, sujeita a checkpoint.** Hipótese para o Admin: navegação em `night` com o logo Warm
   Sand, conteúdo em `paper`, Newsreader nos títulos, Hanken Grotesk na interface, filetes finos em vez de cartões
   com sombra. Courier Prime só para metadata real e útil — nunca informação criada para efeito editorial (por
   exemplo, a data de hoje). A decisão final sai do checkpoint visual com capturas.
10. **Qualidade sem deixar as waves lentas.** Gate de toda tela nova: axe 0 a 390 e 1440 px, sem overflow não
    intencional de 320 a 1920 px, zero erro de console e fluxo principal executado a 390 px com toque. Uma vez no
    shell: cortes em 1023/1024 px, gaveta que fecha ao cruzar o `lg` com foco devolvido a um lugar válido, teclado,
    alvos ≥ 44 px e movimento reduzido. Smoke **Playwright WebKit** do shell e do login — não equivale a Safari/iOS
    real. Aparelhos reais (Safari/iOS, Chrome/Android) entram na QA de release/go-live, não como gate de PR.
    Capturas de tela são material de revisão, não baseline automatizada.

## Consequences

### Positive

- Uma base única para todas as superfícies logadas; a W3 começa com shell, padrão de página e estados prontos.
- A regra mobile-first vira verificação mecânica (CSS e E2E), não só intenção.
- A identidade da Luxtory continua no produto, sem uma biblioteca de UI genérica por cima do DS.

### Negative

- Paridade funcional encarece telas densas futuras (conciliação, listas grandes): cada uma precisa de um padrão
  mobile real ou de uma exceção de produto registrada.
- Uma wave a mais antes da W3.

### Neutral / follow-ups

- W3: tabela (com rolagem contida quando a semântica pedir), filtros e formulários de produto, sobre dados reais.
- W7: decidir navegação inferior para a Área do Titular com os destinos reais.
- Release/go-live: QA em aparelhos reais.

## Alternatives considered

**Incorporar a fundação na W3.** Menos uma wave, mas o shell nasceria acoplado ao Catálogo e a W3 ficaria grande
demais para um PR. Rejeitada.

**Admin desktop-first, "mobile por padrão" nas demais áreas.** Mais rápido para telas densas, mas cria uma
plataforma com duas qualidades e abre exceções implícitas. Rejeitada em favor da paridade com exceção explícita.

**Biblioteca de UI pronta (Tailwind, shadcn/ui, MUI).** Acelera no início, mas duplica o DS, puxa para a estética de
dashboard genérico e cria um segundo sistema de tokens. Rejeitada.

**Baseline visual automatizada (screenshots comparados na CI).** Frágil entre o WSL local e o runner Linux (fontes,
antialiasing), com manutenção alta por wave. Rejeitada: capturas viram artefato de revisão.

## References

- Related ADRs: [ADR-0003](0003-design-system-camada-compartilhada.md), [ADR-0008](0008-autenticacao-e-autorizacao-administrativa.md)
- `docs/specs/design-system.md` (Superfícies de produto), `docs/reference/design-system.md`
- `docs/plan/implementation-waves.md` → Wave 2B
- `03`: TECH-100 (sem mudança de superfície de ataque). `02` §2 (superfícies).
