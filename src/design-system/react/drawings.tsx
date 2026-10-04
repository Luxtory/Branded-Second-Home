/**
 * Desenhos de linha do DS (LUXURY — "a Planta"): hairlines em `currentColor`, cores só pelo ground (`lx-triad`,
 * `lx-horizon`, `lx-measure` em drawings.css). São ilustração do texto ao lado — nunca o único portador da informação —,
 * por isso saem da árvore de acessibilidade. Nenhum desenho representa uma Residence (P-LX-02).
 */

export type TriadVertex = 'patrimony' | 'freedom' | 'belonging';

const VERTICES: Readonly<Record<TriadVertex, { readonly x: number; readonly y: number }>> = {
  patrimony: { x: 64, y: 84 },
  freedom: { x: 336, y: 84 },
  belonging: { x: 200, y: 316 },
};

const EDGES: readonly (readonly [TriadVertex, TriadVertex])[] = [
  ['patrimony', 'freedom'],
  ['freedom', 'belonging'],
  ['belonging', 'patrimony'],
];

const LABEL_POSITION: Readonly<
  Record<TriadVertex, { readonly x: number; readonly y: number; readonly anchor: 'start' | 'middle' | 'end' }>
> = {
  patrimony: { x: 40, y: 40, anchor: 'start' },
  freedom: { x: 360, y: 40, anchor: 'end' },
  belonging: { x: 200, y: 360, anchor: 'middle' },
};

/**
 * A Tríade: três vértices (Patrimônio, Liberdade, Pertencimento) ligados por três linhas. Vértice ausente fica vazado
 * e as linhas que dependem dele, tracejadas; `focus` destaca um vértice (capítulo). Rótulos só no tamanho grande.
 */
export function TriadDrawing({
  present = ['patrimony', 'freedom', 'belonging'],
  focus,
  labels,
  size = 'large',
}: {
  readonly present?: readonly TriadVertex[];
  readonly focus?: TriadVertex;
  /** Textos dos vértices (i18n do slice); ausente = sem rótulos. */
  readonly labels?: Readonly<Record<TriadVertex, string>>;
  readonly size?: 'large' | 'small' | 'mini';
}) {
  const has = (vertex: TriadVertex) => present.includes(vertex);
  return (
    <svg
      className={`lx-triad lx-triad--${size}`}
      viewBox="0 0 400 380"
      aria-hidden="true"
      focusable="false"
    >
      {EDGES.map(([from, to]) => {
        const complete = has(from) && has(to);
        return (
          <line
            key={`${from}-${to}`}
            className={complete ? 'lx-triad__edge' : 'lx-triad__edge lx-triad__edge--absent'}
            x1={VERTICES[from].x}
            y1={VERTICES[from].y}
            x2={VERTICES[to].x}
            y2={VERTICES[to].y}
            pathLength={1}
          />
        );
      })}
      {(Object.keys(VERTICES) as TriadVertex[]).map((vertex) => {
        const { x, y } = VERTICES[vertex];
        const classes = ['lx-triad__node'];
        if (!has(vertex)) classes.push('lx-triad__node--absent');
        if (focus === vertex) classes.push('lx-triad__node--focus');
        return (
          <g key={vertex} className={classes.join(' ')}>
            <circle className="lx-triad__ring" cx={x} cy={y} r={18} />
            <circle className="lx-triad__dot" cx={x} cy={y} r={7} />
          </g>
        );
      })}
      {labels === undefined
        ? null
        : (Object.keys(LABEL_POSITION) as TriadVertex[]).map((vertex) => {
            const { x, y, anchor } = LABEL_POSITION[vertex];
            return (
              <text
                key={vertex}
                className={
                  has(vertex) ? 'lx-triad__label' : 'lx-triad__label lx-triad__label--absent'
                }
                x={x}
                y={y}
                textAnchor={anchor}
              >
                {labels[vertex]}
              </text>
            );
          })}
    </svg>
  );
}

const COLUMNS = 12;

/**
 * Horizonte do Opening Frame sem fotografia: a régua das colunas do grid é a linha do horizonte e um sol de fim de tarde
 * em arco nasce dela (`sun={false}`: só a régua). Vai dentro da linha que tem o filete (`lx-opening-row`), atrás do
 * texto. Geometria abstrata — nunca a imagem de um lugar.
 */
export function HorizonDrawing({ sun = true }: { readonly sun?: boolean }) {
  return (
    <div className="lx-horizon" aria-hidden="true">
      {sun ? (
        <div className="lx-horizon__sky">
          <svg className="lx-horizon__sun" viewBox="0 0 600 300" focusable="false">
            <path className="lx-horizon__halo" d="M 24 300 A 276 276 0 0 1 576 300" />
            <path d="M 96 300 A 204 204 0 0 1 504 300" />
            <path className="lx-horizon__core" d="M 228 300 A 72 72 0 0 1 372 300" />
          </svg>
        </div>
      ) : null}
      <div className="lx-horizon__ticks">
        {Array.from({ length: COLUMNS }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

export interface MeasureSegment {
  readonly value: number;
  readonly fill: 'solid' | 'outline';
}

/**
 * Medida proporcional (Evidence desenhada): segmentos sobre uma régua de `total` unidades. Os valores estão no texto ao
 * lado; o desenho só mostra a proporção.
 */
export function MeasureBar({
  total,
  segments,
}: {
  readonly total: number;
  readonly segments: readonly MeasureSegment[];
}) {
  // Início de cada segmento: a soma dos anteriores.
  const starts = segments.map((_, index) =>
    segments.slice(0, index).reduce((sum, segment) => sum + segment.value, 0),
  );
  return (
    <svg
      className="lx-measure"
      viewBox={`0 0 ${total} 20`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <line className="lx-measure__track" x1={0} y1={19} x2={total} y2={19} />
      <line className="lx-measure__tick" x1={0} y1={14} x2={0} y2={20} />
      <line className="lx-measure__tick" x1={total} y1={14} x2={total} y2={20} />
      {segments.map((segment, index) => (
        <rect
          key={`${starts[index]}-${segment.value}`}
          className={`lx-measure__segment lx-measure__segment--${segment.fill}`}
          x={starts[index]}
          y={2}
          width={segment.value}
          height={12}
        />
      ))}
    </svg>
  );
}
