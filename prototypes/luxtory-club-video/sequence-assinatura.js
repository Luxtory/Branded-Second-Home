// Assinatura do filme: exclusivamente o momento da marca. Logo oficial do manifest, sempre <img> e com o arquivo
// intacto (sha256 conferido em prototype.test.mjs): vertical Warm Sand sobre Dark Moroccan Blue (superfície `deep`),
// e a frase "Seja protagonista de histórias extraordinárias." (corte da headline aprovada do Hero, D-B2C-19, a
// confirmar pela Luxtory). Nenhum aviso, texto técnico ou informação comercial no encerramento: as ressalvas do filme
// ficam onde fazem sentido (ROTEIRO.md §5). A logo entra só em opacidade (900 ms, duration.cinematic), sem
// deslocamento, escala ou efeito; a frase entra em seguida com o fade-up curto do Core.
export const LOGO = { key: 'vertical/warm-sand', file: 'Logo-Luxtory-Warm-Sand-Vertical.svg' };
export const TAGLINE = 'Seja protagonista de histórias extraordinárias.';
export const DURATION = 6_000;

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `<section class="demo-card demo-card--endcard" id="endcard" data-surface="deep" aria-label="Assinatura Luxtory">
      <img class="demo-endcard__logo" id="endcard-logo" src="/src/design-system/brand/logo/${LOGO.file}" alt="Luxtory" width="1176" height="542">
      <p class="lx-closing" id="endcard-line">${TAGLINE}</p>
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  return {
    duration: DURATION,
    enter: [
      // Cartão opaco desde o primeiro quadro: a montagem faz o dissolve da imagem para ele.
      { sel: '#endcard', in: 0, dur: 0 },
      { sel: '#endcard-logo', in: 400, dur: 900, rise: 0 },
      { sel: '#endcard-line', in: 1_500 },
    ],
    set: [],
    tween: [],
    marks: [
      { at: 0, label: 'assinatura · cartão Dark Moroccan Blue (dissolve da imagem na montagem)' },
      { at: 400, label: 'logo oficial em fade puro (900 ms)' },
      { at: 1_500, label: 'assinatura (com a voz); quadro limpo até o fim' },
      { at: DURATION, label: 'fim' },
    ],
  };
}

export const qa = {
  checkpoints: [
    {
      t: 3_500,
      name: 'assinatura',
      expect: [TAGLINE],
      // Encerramento só da marca: nenhum aviso, selo ou marca de revisão.
      absent: ['Demonstração', 'disponíveis', 'Prova interna', 'ilustrativ'],
    },
  ],
  stills: { assinatura: 3_500 },
  alpha: { from: 0, seconds: 6 },
  sample: { card: '#endcard', at: 3_500 },
  motion: { card: '#endcard-logo', at: 3_500, enter: [400, 1_300] },
  plates: {},
  // Cartão de quadro inteiro, opaco por definição: sem área transparente a conferir.
  opaque: true,
  // Encerramento exclusivo da marca: sem selo (as indicações de dados ilustrativos ficam nos cartões de interface).
  seal: false,
};
