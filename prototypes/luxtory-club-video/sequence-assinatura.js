// Demonstração conceitual — assinatura do filme (Etapa C, prova de composição). Logo oficial do manifest, sempre <img>,
// arquivo intacto (sha256 conferido em prototype.test.mjs): vertical Warm Sand sobre Dark Moroccan Blue (superfície
// `deep`). A logo entra só em opacidade (900 ms, duration.cinematic), sem deslocamento, escala ou efeito.
// Assinatura: corte da headline aprovada do Hero (D-B2C-19), a confirmar pela Luxtory.
export const LOGO = { key: 'vertical/warm-sand', file: 'Logo-Luxtory-Warm-Sand-Vertical.svg' };
export const TAGLINE = 'Seja protagonista de histórias extraordinárias.';
export const LEGAL =
  'Demonstração conceitual: interfaces, valores e imóveis ilustrativos. Os mecanismos do Luxtory Club exigem Membership vigente e seguem regras e disponibilidade; no Co-Owner, só datas já reservadas no Direito de Uso podem ser cedidas.';

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `<section class="demo-card demo-card--endcard" id="endcard" data-surface="deep" aria-label="Assinatura Luxtory">
      <img class="demo-endcard__logo" id="endcard-logo" src="/src/design-system/brand/logo/${LOGO.file}" alt="Luxtory" width="1176" height="542">
      <p class="lx-closing" id="endcard-line">${TAGLINE}</p>
      <p class="demo-seal demo-endcard__legal" id="endcard-legal">${LEGAL}</p>
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  return {
    duration: 6_000,
    enter: [
      // Cartão opaco desde o primeiro quadro: a montagem faz o dissolve da imagem para ele.
      { sel: '#endcard', in: 0, dur: 0 },
      { sel: '#endcard-logo', in: 400, dur: 900, rise: 0 },
      { sel: '#endcard-line', in: 1_500 },
      { sel: '#endcard-legal', in: 2_300 },
    ],
    set: [],
    tween: [],
    marks: [
      { at: 0, label: 'assinatura · cartão Dark Moroccan Blue (dissolve da imagem na montagem)' },
      { at: 400, label: 'logo oficial em fade puro (900 ms)' },
      { at: 1_500, label: 'assinatura' },
      { at: 2_300, label: 'linha legal (≥ 3 s em tela)' },
      { at: 6_000, label: 'fim' },
    ],
  };
}

export const qa = {
  checkpoints: [
    {
      t: 4_000,
      name: 'assinatura',
      expect: [TAGLINE, 'Demonstração conceitual', 'Membership vigente'],
    },
  ],
  stills: { assinatura: 4_000 },
  alpha: { from: 0, seconds: 6 },
  sample: { card: '#endcard', at: 4_000 },
  motion: { card: '#endcard-logo', at: 4_000, enter: [400, 1_300] },
  plates: {},
  // Cartão de quadro inteiro, opaco por definição: sem área transparente a conferir.
  opaque: true,
};
