// Síntese visual das três modalidades (filme completo, QUATRO-FILMES.md · Filme 4, bloco 6): o que diferencia Request,
// Direct e Luxplus, nos termos dos banners aprovados. Camada editorial, sem interface transacional nem números; não
// promete disponibilidade (toda reserva segue sujeita às validações e ao pagamento, como nas demonstrações).
import { ICONS } from './shared.js';

export const MODALIDADES = [
  {
    id: 'request',
    title: 'Luxchange Request',
    rows: ['Noites de outro Membro', 'Créditos + Taxa de intercâmbio', 'Depende do aceite'],
  },
  {
    id: 'direct',
    title: 'Luxchange Direct',
    rows: [
      'Noites do Inventário Luxtory',
      'Créditos + Taxa de intercâmbio',
      'Sem aceite de outro Membro',
    ],
  },
  {
    id: 'luxplus',
    title: 'Luxplus',
    rows: ['Noites adicionais', 'Pagamento em dinheiro', 'Sem utilizar Créditos'],
  },
];

const STAGGER = 600;
const FIRST_IN = 300;
const EXIT_AT = 8_400;

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <div class="demo-trio" id="sintese">
      ${MODALIDADES.map(
        (
          m,
        ) => `<section class="demo-card" id="sx-${m.id}" data-surface="deep" aria-label="${m.title}">
        <p class="demo-name">${m.title}</p>
        <ul class="demo-trio__rows">${m.rows.map((r) => `<li>${r}</li>`).join('')}</ul>
      </section>`,
      ).join('')}
    </div>`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  return {
    duration: 9_000,
    enter: MODALIDADES.map((m, i) => ({
      sel: `#sx-${m.id}`,
      in: FIRST_IN + i * STAGGER,
      out: EXIT_AT,
    })),
    set: [],
    tween: [],
    marks: [
      ...MODALIDADES.map((m, i) => ({ at: FIRST_IN + i * STAGGER, label: `síntese · ${m.title}` })),
      { at: 9_000, label: 'fim' },
    ],
  };
}

/** Pontos de verificação (check.mjs), nos dois formatos. */
export const qa = {
  checkpoints: [
    {
      t: 6_000,
      name: 'sintese',
      expect: MODALIDADES.flatMap((m) => [m.title, ...m.rows]),
    },
  ],
};
