// Demonstração conceitual — filme completo "Luxtory Club — Luxchange Request, Luxchange Direct e Luxplus"
// (QUATRO-FILMES.md · Filme 4). Ritmo próprio, sem concatenar os tutoriais:
// abertura (ideia aprovada do Como funciona) → Créditos Luxchange explicados uma vez (painel C04, com as ressalvas da L3)
// → Request completa (a única com depósito, Garantia, aceite e revalidação) → Direct e Luxplus só com o que os
// diferencia (a revisão corta direto para a confirmação) → síntese das três modalidades → família → assinatura.
// Um plano contínuo do hero da home (fundo.js) do início à família; som só de operações.
import { FOOTNOTE, ROWS } from '../../sequence-creditos.js';
import { MODALIDADES } from '../../sequence-sintese.js';
import { buildFilm } from './blocos.js';
import { blocks as directBlocks } from './edl-direct-curta.js';
import { blocks as luxplusBlocks } from './edl-luxplus-curta.js';
import { blocks as requestBlocks } from './edl-request-curta.js';
import { assinatura, familia } from './encerramento.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada
const CREDITS_PRIOR = 1_300; // primeira batida do painel (sequence-creditos.js)
const SINTESE_FIRST_IN = 300; // primeiro cartão da síntese (sequence-sintese.js)

function blocks(fmt) {
  return [
    {
      kind: 'banner',
      scene: 'C0',
      dur: 4_000,
      banner: {
        title: 'Luxtory Club',
        lines: ['Sua Second Home pode ser o ponto de partida — não o limite.'],
      },
      vo: { after: 300, text: 'Tudo começa na sua Second Home.' },
      shot: fundo(fmt),
      contact: 2_000,
    },
    {
      // Créditos explicados uma vez: o que já tem + o que gera ao depositar = um só saldo, com Membership vigente.
      kind: 'ui',
      seq: 'creditos',
      scene: 'C1',
      parts: [
        {
          from: CREDITS_PRIOR - 600,
          to: CREDITS_PRIOR + ENTER + 7_020,
          fadeOut: 400,
          beat: {
            label: 'Créditos Luxchange: um só saldo',
            type: 'complexa',
            essential: `${ROWS.prior} ${ROWS.fresh} ${ROWS.total} Com Membership vigente, em Luxchange Request ou Direct. ${FOOTNOTE}`,
            readFrom: CREDITS_PRIOR + ENTER,
          },
        },
      ],
      vo: {
        after: 300,
        text: 'Com Membership vigente, você usa os Créditos válidos que já tem, deposita datas elegíveis para gerar novos — ou combina os dois para viver outras Second Homes.',
      },
      shot: { continue: true },
      contact: 5_000,
    },
    ...requestBlocks(fmt, { resumo: true }),
    ...directBlocks(fmt, { resumo: true }),
    ...luxplusBlocks(fmt, { resumo: true }),
    {
      kind: 'ui',
      seq: 'sintese',
      scene: 'C9',
      parts: [
        {
          from: 0,
          to: SINTESE_FIRST_IN + ENTER + 6_040,
          fadeOut: 500,
          beat: {
            label: 'síntese das três modalidades',
            type: 'complexa',
            essential: MODALIDADES.map((m) => `${m.title} ${m.rows.join(' ')}`).join(' '),
            readFrom: SINTESE_FIRST_IN + ENTER,
          },
        },
      ],
      shot: { continue: true },
      contact: 4_000,
    },
    familia(fmt, 'C10'),
    assinatura(),
  ];
}

/** EDL do filme completo num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'club-completo',
    out: 'out/club-completo',
    audio: { modo: 'efeitos', vo: 'club-completo-vo', trilha: 'club-completo-trilha', trilhaIn: 0 },
    blocks,
  });
