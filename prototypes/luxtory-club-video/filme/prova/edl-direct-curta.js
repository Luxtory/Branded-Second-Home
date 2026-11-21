// Demonstração conceitual — prévia do Luxchange Direct, na mesma direção da Request v8.4: banner → noites do Inventário
// Luxtory → Créditos necessários e saldo suficiente (continua sem novo depósito) → revisão com a Taxa de intercâmbio →
// pagamento e revalidação → reserva confirmada sem aceite de outro Membro → família → assinatura oficial.
// Carteira própria de Marina: 39.000 → 27.500 (11.500 utilizados na confirmação). Fundo: o hero da home (fundo.js).
// Som só de operações. A interface toca no tempo da sequência (sequence-direct.js); a edição só pausa e corta tempo morto.
import { times } from '../../sequence-direct.js';
import { buildFilm } from './blocos.js';
import { assinatura, familia } from './encerramento.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada

function blocks(fmt) {
  const t = times(fmt);
  // No 9:16 a rota aparece dentro do calendário; o trecho vai até ela assentar.
  const calEnd = t.v ? t.calOut - 50 : t.calNext - 50;
  return [
    {
      kind: 'banner',
      scene: 'D0',
      dur: 4_750,
      banner: {
        title: 'Luxchange Direct',
        lines: [
          'Reserve noites do Inventário Luxtory.',
          'Use Créditos e pague a Taxa de intercâmbio, sem aceite de outro Membro.',
        ],
      },
      shot: fundo(fmt),
      contact: 2_000,
    },
    {
      kind: 'ui',
      seq: 'direct',
      scene: 'D1',
      parts: [
        {
          from: 500,
          to: calEnd,
          hold: 2_550,
          beat: {
            label: 'noites do Inventário Luxtory',
            type: 'mensagem',
            essential:
              'Olivar Home 1 noite Noites do Inventário Luxtory sem aceite de outro Membro',
            readFrom: t.routeIn + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.startAt, kind: 'tap', note: 'entrada' },
        { ms: t.endAt, kind: 'tap', note: 'saída' },
      ],
      vo: {
        after: 200,
        text: 'Se as noites já fazem parte do Inventário Luxtory, o caminho é mais curto: o Luxchange Direct dispensa o aceite de outro Membro.',
      },
      shot: { continue: true },
      contact: 3_000,
    },
    {
      kind: 'ui',
      seq: 'direct',
      scene: 'D2',
      parts: [
        {
          from: calEnd,
          to: t.continueAt - 100,
          hold: 2_200,
          beat: {
            label: 'Créditos necessários e saldo suficiente',
            type: 'decisao',
            essential:
              '11.500 necessários 39.000 disponível Saldo suficiente Continuar com meu saldo',
            readFrom: t.needIn + ENTER,
          },
        },
      ],
      sfx: [
        ...(t.v ? [] : [{ ms: t.calNext, kind: 'tap', note: 'Continuar' }]),
        { ms: t.continueAt, kind: 'tap', note: 'Continuar com meu saldo' },
      ],
      shot: { continue: true },
      contact: 3_000,
    },
    {
      kind: 'ui',
      seq: 'direct',
      scene: 'D3',
      parts: [
        {
          from: t.continueAt - 100,
          to: t.policy - 150,
          hold: 1_550,
          beat: {
            label: 'revisão: Créditos e Taxa de intercâmbio',
            type: 'mensagem',
            essential:
              '11.500 Créditos Taxa de intercâmbio R$ 120,00 Aceite de outro Membro Não exigido',
            readFrom: t.reviewIn + ENTER,
          },
        },
        // Política e "Pagar taxa e confirmar"; o resto do processamento sai num corte.
        { from: t.policy - 150, to: t.pay + 300 },
        {
          from: t.reviewOut - 50,
          to: t.revalOut - 150,
          hold: 300,
          beat: {
            label: 'pagamento aprovado e revalidação',
            type: 'acao',
            essential: 'Pagamento aprovado Confirmando a reserva',
            readFrom: t.revalIn + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.policy, kind: 'tap', note: 'aceite da política' },
        { ms: t.pay, kind: 'tap', note: 'Pagar taxa e confirmar' },
        { ms: t.revalIn, kind: 'state', note: 'pagamento aprovado' },
        ...[300, 500, 700, 900].map((d) => ({
          ms: t.revalIn + d,
          kind: 'check',
          note: 'revalidação',
        })),
      ],
      shot: { continue: true },
      contact: 3_000,
    },
    {
      kind: 'ui',
      seq: 'direct',
      scene: 'D4',
      parts: [
        {
          from: t.revalOut - 150,
          to: t.confirmed + ENTER,
          hold: 3_100,
          fadeOut: 500,
          beat: {
            label: 'reserva confirmada sem aceite de outro Membro',
            type: 'confirmacao',
            essential: 'Reserva confirmada sem aceite de outro Membro Créditos disponíveis 27.500',
            readFrom: t.confirmed + ENTER,
          },
        },
      ],
      sfx: [{ ms: t.confirmed, kind: 'confirm', note: 'reserva confirmada' }],
      shot: { continue: true },
      contact: 2_500,
    },
    familia(fmt, 'D5'),
    assinatura(),
  ];
}

/** EDL da prévia num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'direct-curta',
    out: 'out/direct-curta',
    audio: { modo: 'efeitos', vo: 'direct-curta-vo', trilha: 'direct-curta-trilha', trilhaIn: 0 },
    blocks,
  });
