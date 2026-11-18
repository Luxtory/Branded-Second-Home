// Demonstração conceitual — camada editorial da prova de montagem (Etapa C). Título da modalidade, ressalva da
// primeira interface e etiqueta "prova interna", com os tokens e o movimento do Core (fade-up curto, durações do
// tokens.css), renderizados com alfa como as interfaces. Textos e tempos vêm da EDL (filme/prova/edl.js).
// A prova de montagem é só 16:9 (a vertical do filme tem composição própria, ROTEIRO.md §6); a prova cinematográfica
// (?edl=cinema, filme/prova/edl-cinema.js) tem 16:9 e 9:16 com os mesmos textos e tempos.
import { EDL as EDL_REQUEST } from './filme/prova/edl.js';
import { edlFor } from './filme/prova/edl-cinema.js';
import { ALWAYS, FINAL } from './shared.js';

const query = new URLSearchParams(globalThis.location?.search ?? '');
const EDL = query.get('edl') === 'cinema' ? edlFor(query.get('fmt') ?? '16x9') : EDL_REQUEST;

const { title, legal, tag } = EDL.editorial;

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `<div class="demo-ed demo-ed--shade" id="ed-shade" aria-hidden="true"></div>
    <div class="demo-ed demo-ed--title" id="ed-title" data-surface="deep">
      <p class="demo-ed__title">${title.title}</p>
      <p class="demo-ed__desc">${title.desc}</p>
    </div>
    <p class="demo-ed demo-ed--legal" id="ed-legal" data-surface="deep"><span>${legal.text}</span></p>
    ${FINAL ? '' : `<p class="demo-ed demo-ed--tag" id="ed-tag" data-surface="deep">${tag}</p>`}`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  return {
    duration: EDL.duration,
    enter: [
      { sel: '#ed-shade', in: title.in, out: title.out, rise: 0 },
      { sel: '#ed-title', in: title.in, out: title.out },
      { sel: '#ed-legal', in: legal.in, out: legal.out },
      // Etiqueta interna só na prévia; a exportação final (?final=1) não a carrega.
      ...(FINAL ? [] : [{ sel: '#ed-tag', in: ALWAYS }]),
    ],
    set: [],
    tween: [],
    marks: [
      { at: title.in, label: 'título da modalidade' },
      { at: legal.in, label: 'ressalva da primeira interface (4 s)' },
    ],
  };
}
