// Demonstração conceitual — camada editorial das montagens (filme/prova/): banners das modalidades, ressalva da
// primeira interface e etiqueta "prova interna", com os tokens e o movimento do Core (fade-up curto, durações do
// tokens.css), renderizados com alfa como as interfaces. Textos e tempos vêm da EDL escolhida por `?edl=`:
// - sem `edl`: prova de montagem da Request (filme/prova/edl.js, só 16:9);
// - `?edl=<nome>`: filme/prova/edl-<nome>.js, que exporta edlFor(fmt) (16:9 e 9:16 com os mesmos textos e tempos).
// Banner = título da modalidade + até três linhas curtas, que entram uma a uma para a leitura acompanhar.
import { EDL as EDL_REQUEST } from './filme/prova/edl.js';
import { ALWAYS, FINAL } from './shared.js';

const query = new URLSearchParams(globalThis.location?.search ?? '');
// Etiqueta interna e ressalva sobre a imagem só com `?marcas=1` (inspeção no navegador). A montagem não as desenha: a
// prévia limpa sai sem marcas e a cópia de revisão as leva na tarja (direção v8.4).
const MARKS = query.get('marcas') === '1';
const EDL_NAME = query.get('edl');
if (EDL_NAME && !/^[a-z0-9-]+$/.test(EDL_NAME)) throw new Error(`EDL inválida: ${EDL_NAME}`);
const EDL = EDL_NAME
  ? (await import(`./filme/prova/edl-${EDL_NAME}.js`)).edlFor(query.get('fmt') ?? '16x9')
  : EDL_REQUEST;

// Formato antigo (um título com descritor) vira um banner de uma linha.
const { title, legal, tag, tagOut } = EDL.editorial;
const BANNERS =
  EDL.editorial.banners ??
  (title ? [{ in: title.in, out: title.out, title: title.title, lines: [title.desc] }] : []);
const LEGALS = MARKS ? (Array.isArray(legal) ? legal : legal ? [legal] : []) : [];
const TAG = MARKS && !FINAL;
// Intervalo padrão entre as linhas do banner; a EDL pode definir `lineDelay` e `lineGap` em cada banner.
const LINE_GAP = 280;
const LINE_DELAY = 320;

export function build(stage, fmt) {
  const banners = BANNERS.map(
    (b, i) => `<div class="demo-ed demo-ed--shade" id="ed-shade-${i}" aria-hidden="true"></div>
    <div class="demo-ed demo-ed--title" id="ed-banner-${i}" data-surface="deep">
      <p class="demo-ed__title">${b.title}</p>
      ${b.lines.map((line, k) => `<p class="demo-ed__desc" id="ed-banner-${i}-${k}">${line}</p>`).join('')}
    </div>`,
  );
  const legals = LEGALS.map(
    (l, i) =>
      `<p class="demo-ed demo-ed--legal" id="ed-legal-${i}" data-surface="deep"><span>${l.text}</span></p>`,
  );
  stage.insertAdjacentHTML(
    'beforeend',
    `${banners.join('')}${legals.join('')}
    ${TAG ? `<p class="demo-ed demo-ed--tag" id="ed-tag" data-surface="deep">${tag}</p>` : ''}`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  return {
    duration: EDL.duration,
    enter: [
      ...BANNERS.flatMap((b, i) => [
        { sel: `#ed-shade-${i}`, in: b.in, out: b.out, rise: 0 },
        { sel: `#ed-banner-${i}`, in: b.in, out: b.out },
        ...b.lines.map((_, k) => ({
          sel: `#ed-banner-${i}-${k}`,
          in:
            b.lines.length > 1
              ? b.in + (b.lineDelay ?? LINE_DELAY) + k * (b.lineGap ?? LINE_GAP)
              : b.in,
          out: b.out,
        })),
      ]),
      ...LEGALS.map((l, i) => ({ sel: `#ed-legal-${i}`, in: l.in, out: l.out })),
      // Etiqueta interna só na prévia (sai antes da assinatura); a exportação final (?final=1) não a carrega.
      ...(TAG ? [{ sel: '#ed-tag', in: ALWAYS, ...(tagOut ? { out: tagOut } : {}) }] : []),
    ],
    set: [],
    tween: [],
    marks: [
      ...BANNERS.map((b) => ({ at: b.in, label: `banner · ${b.title}` })),
      ...LEGALS.map((l) => ({ at: l.in, label: 'ressalva da primeira interface' })),
    ].sort((a, b) => a.at - b.at),
  };
}
