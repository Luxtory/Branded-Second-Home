// Demonstração conceitual — camada editorial da prova de montagem (Etapa C). Título da modalidade, ressalva da
// primeira interface e etiqueta "prova interna", com os tokens e o movimento do Core (fade-up curto, durações do
// tokens.css), renderizados com alfa como as interfaces. Textos e tempos vêm da EDL (filme/prova/edl.js).
// Só 16:9 nesta prova; a vertical tem composição própria (ROTEIRO.md §6) e não é derivada desta camada.
import { EDL } from './filme/prova/edl.js';
import { ALWAYS } from './shared.js';

const { title, legal, tag } = EDL.editorial;

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `<div class="demo-ed demo-ed--shade" id="ed-shade" aria-hidden="true"></div>
    <div class="demo-ed demo-ed--title" id="ed-title" data-surface="deep">
      <p class="lx-eyebrow">${title.eyebrow}</p>
      <p class="demo-ed__title">${title.title}</p>
      <p class="demo-ed__desc">${title.desc}</p>
    </div>
    <p class="demo-ed demo-ed--legal" id="ed-legal" data-surface="deep"><span>${legal.text}</span></p>
    <p class="demo-ed demo-ed--tag" id="ed-tag" data-surface="deep">${tag}</p>`,
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
      { sel: '#ed-tag', in: ALWAYS },
    ],
    set: [],
    tween: [],
    marks: [
      { at: title.in, label: 'título da modalidade' },
      { at: legal.in, label: 'ressalva da primeira interface (4 s)' },
    ],
  };
}
