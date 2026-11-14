// Demonstração conceitual — assinatura do filme (Etapa C, prova de composição). Logo oficial do manifest, sempre <img>,
// arquivo intacto (sha256 conferido em prototype.test.mjs): vertical Warm Sand sobre Dark Moroccan Blue (superfície
// `deep`). A logo entra só em opacidade (900 ms, duration.cinematic), sem deslocamento, escala ou efeito.
// Assinatura: corte da headline aprovada do Hero (D-B2C-19), a confirmar pela Luxtory.
// Hierarquia (v2, auditoria): primeiro um tempo limpo só com logo e assinatura (o momento da marca, com a voz); a linha
// legal entra depois, curta, e fica até o fim com tempo de leitura (≥ 1 s a cada 3 palavras + 0,5 s). As demais
// ressalvas ficam onde fazem sentido no filme (ROTEIRO.md §5: selo nos cartões, supers de C04/C05, descrição).
// "Ainda não estão disponíveis para reservas" vale enquanto for verdade; a Luxtory confirma na data da publicação, e a
// copy final passa por aprovação e revisão jurídica.
export const LOGO = { key: 'vertical/warm-sand', file: 'Logo-Luxtory-Warm-Sand-Vertical.svg' };
export const TAGLINE = 'Seja protagonista de histórias extraordinárias.';
export const LEGAL =
  'Demonstração conceitual. Os mecanismos do Luxtory Club ainda não estão disponíveis para reservas.';
// Tempo limpo (logo + assinatura) até a linha legal, e duração total do cartão no master (ROTEIRO.md C17).
export const LEGAL_IN = 4_000;
export const DURATION = 9_000;

// Uma frase por linha no 9:16 (CSS): sem palavra solta no fim da linha.
const legalLines = LEGAL.split(/(?<=\.)\s+/)
  .map((sentence) => `<span>${sentence}</span>`)
  .join(' ');

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `<section class="demo-card demo-card--endcard" id="endcard" data-surface="deep" aria-label="Assinatura Luxtory">
      <img class="demo-endcard__logo" id="endcard-logo" src="/src/design-system/brand/logo/${LOGO.file}" alt="Luxtory" width="1176" height="542">
      <p class="lx-closing" id="endcard-line">${TAGLINE}</p>
      <p class="demo-seal demo-endcard__legal" id="endcard-legal">${legalLines}</p>
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
      { sel: '#endcard-legal', in: LEGAL_IN },
    ],
    set: [],
    tween: [],
    marks: [
      { at: 0, label: 'assinatura · cartão Dark Moroccan Blue (dissolve da imagem na montagem)' },
      { at: 400, label: 'logo oficial em fade puro (900 ms)' },
      { at: 1_500, label: 'assinatura (tempo limpo: só logo e assinatura, com a voz)' },
      { at: LEGAL_IN, label: 'linha legal, num segundo tempo, até o fim' },
      { at: DURATION, label: 'fim' },
    ],
  };
}

export const qa = {
  checkpoints: [
    // Tempo limpo: logo e assinatura, sem linha legal competindo com a marca.
    { t: 3_500, name: 'limpa', expect: [TAGLINE], absent: ['Demonstração conceitual'] },
    {
      t: 7_500,
      name: 'assinatura',
      expect: [TAGLINE, 'Demonstração conceitual', 'ainda não estão disponíveis para reservas'],
    },
  ],
  stills: { 'assinatura-limpa': 3_500, assinatura: 7_500 },
  alpha: { from: 0, seconds: 9 },
  sample: { card: '#endcard', at: 7_500 },
  motion: { card: '#endcard-logo', at: 7_500, enter: [400, 1_300] },
  plates: {},
  // Cartão de quadro inteiro, opaco por definição: sem área transparente a conferir.
  opaque: true,
};
