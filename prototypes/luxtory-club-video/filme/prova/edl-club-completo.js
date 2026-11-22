// Demonstração conceitual — filme completo "Luxtory Club — Luxchange Request, Luxchange Direct e Luxplus"
// (QUATRO-FILMES.md · Filme 4). Ritmo próprio, sem concatenar os tutoriais:
// abertura (ideia aprovada do Como funciona) → Créditos Luxchange explicados uma vez (painel C04, com as ressalvas da L3)
// → Request completa (a única com depósito, Garantia, aceite e revalidação) → Direct e Luxplus só com o que os
// diferencia (a revisão corta direto para a confirmação) → síntese das três modalidades → família → assinatura.
// Um plano contínuo do hero da home (fundo.js) do início à família; som só de operações.
import { BEATS, FOOTNOTE, ROWS, USE_LINE } from '../../sequence-creditos.js';
import { MODALIDADES } from '../../sequence-sintese.js';
import { buildFilm, GRID_MS, skimMs } from './blocos.js';
import { blocks as directBlocks } from './edl-direct-curta.js';
import { blocks as luxplusBlocks } from './edl-luxplus-curta.js';
import { blocks as requestBlocks } from './edl-request-curta.js';
import { assinatura, familia } from './encerramento.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada
// O painel dos Créditos se monta por batidas (sequence-creditos.js) e é lido em duas etapas: o que já tem + o que gera,
// depois o saldo único com a condição da Membership. O corte espera a leitura da última linha e a da ressalva
// (≥ 1 s a cada 3 palavras + 0,5 s, desde a entrada); a primeira etapa fecha exatamente na grade (sem pausa no meio).
const LEAD_MS = 600;
const legalReadMs = (text) => (text.split(/\s+/).length / 3 + 0.5) * 1000;
const CREDITS_FROM =
  BEATS.total - Math.ceil((BEATS.total - BEATS.prior + LEAD_MS) / GRID_MS) * GRID_MS;
const CREDITS_TO = Math.max(
  BEATS.use + ENTER + skimMs(USE_LINE),
  BEATS.deposit + legalReadMs(FOOTNOTE),
);
const SINTESE_FIRST_IN = 300; // primeiro cartão da síntese (sequence-sintese.js)

/** Blocos do filme completo (também usados pelos trechos de QA, edl-qa-*.js, sem cópia). */
export function blocks(fmt) {
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
          from: CREDITS_FROM,
          to: BEATS.total,
          beat: {
            label: 'Créditos disponíveis + que podem ser gerados',
            type: 'mensagem',
            essential: `${ROWS.prior} ${ROWS.fresh}`,
            readFrom: BEATS.prior + ENTER,
          },
        },
        {
          from: BEATS.total,
          to: CREDITS_TO,
          fadeOut: 400,
          beat: {
            label: '= saldo potencial, com Membership vigente',
            type: 'mensagem',
            essential: `${ROWS.total} ${USE_LINE}`,
            readFrom: BEATS.total + ENTER,
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
          to: SINTESE_FIRST_IN + ENTER + 7_020,
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
