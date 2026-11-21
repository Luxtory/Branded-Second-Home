// Demonstração conceitual — prévia do Luxplus, na mesma direção da Request v8.4: banner → noites adicionais do
// Inventário Luxtory → valor da estadia em dinheiro, sem Créditos → política e pagamento → revalidação → reserva
// confirmada → família → assinatura oficial. Sem Créditos Luxchange e sem Taxa de intercâmbio (BR-241, BR-230); sem
// desconto de Membership (BR-244, não publicado): o valor da estadia é ilustrativo, pendente de aprovação comercial.
// Fundo: o hero da home (fundo.js). Som só de operações. A interface toca no tempo da sequência (sequence-luxplus.js).
import { times } from '../../sequence-luxplus.js';
import { buildFilm } from './blocos.js';
import { assinatura, familia } from './encerramento.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada

/**
 * Blocos do filme. `resumo` (filme completo): o plano do fundo continua do bloco anterior, a revisão corta direto para
 * a confirmação (pagamento e revalidação já aparecem na Request) e família e assinatura ficam para o fim do filme.
 */
export function blocks(fmt, { resumo = false } = {}) {
  const t = times(fmt);
  // No 9:16 a rota aparece dentro do calendário; o trecho vai até ela assentar.
  const calEnd = t.v ? t.calOut - 50 : t.calNext - 50;
  return [
    {
      kind: 'banner',
      scene: 'L0',
      dur: 4_250,
      banner: {
        title: 'Luxplus',
        lines: [
          'Reserve noites adicionais no Luxtory Club.',
          'Pagamento em dinheiro, sem utilizar Créditos.',
        ],
      },
      shot: resumo ? { continue: true } : fundo(fmt),
      contact: 2_000,
    },
    {
      kind: 'ui',
      seq: 'luxplus',
      scene: 'L1',
      parts: [
        {
          from: 600,
          to: calEnd,
          hold: 3_000,
          beat: {
            label: 'noites adicionais do Inventário Luxtory',
            type: 'mensagem',
            essential:
              'Olivar Home 2 noites Noites adicionais do Inventário Luxtory Pagas em dinheiro, sem usar Créditos',
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
        text: 'Para viver novas experiências, há também o Luxplus: noites adicionais do Inventário Luxtory, pagas em dinheiro, sem usar seus Créditos.',
      },
      shot: { continue: true },
      contact: 3_000,
    },
    {
      kind: 'ui',
      seq: 'luxplus',
      scene: 'L2',
      parts: [
        {
          from: calEnd,
          to: t.policy - 150,
          hold: 1_550,
          beat: {
            label: 'valor da estadia em dinheiro, sem Créditos',
            type: 'mensagem',
            essential:
              'Valor da estadia R$ 2.480,00 Pago em dinheiro Créditos Luxchange Não utilizados Membership Vigente',
            readFrom: t.reviewIn + ENTER,
          },
        },
        // Política, pagamento e revalidação: no resumo (filme completo), a revisão corta direto para a confirmação.
        ...(resumo
          ? []
          : [
              // Política e "Pagar e confirmar"; o resto do processamento sai num corte.
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
            ]),
      ],
      sfx: [
        ...(t.v ? [] : [{ ms: t.calNext, kind: 'tap', note: 'Revisar Luxplus' }]),
        ...(resumo
          ? []
          : [
              { ms: t.policy, kind: 'tap', note: 'aceite da política' },
              { ms: t.pay, kind: 'tap', note: 'Pagar e confirmar' },
              { ms: t.revalIn, kind: 'state', note: 'pagamento aprovado' },
              ...[300, 500, 700].map((d) => ({
                ms: t.revalIn + d,
                kind: 'check',
                note: 'revalidação',
              })),
            ]),
      ],
      shot: { continue: true },
      contact: 3_000,
    },
    {
      kind: 'ui',
      seq: 'luxplus',
      scene: 'L3',
      parts: [
        {
          from: resumo ? t.confirmed - 20 : t.revalOut - 150,
          to: t.confirmed + ENTER,
          hold: 3_100,
          fadeOut: 500,
          beat: {
            label: 'reserva confirmada, Créditos inalterados',
            type: 'confirmacao',
            essential: 'Reserva confirmada Noites adicionais Créditos inalterados',
            readFrom: t.confirmed + ENTER,
          },
        },
      ],
      sfx: [{ ms: t.confirmed, kind: 'confirm', note: 'reserva confirmada' }],
      shot: { continue: true },
      contact: 2_500,
    },
    ...(resumo ? [] : [familia(fmt, 'L4'), assinatura()]),
  ];
}

/** EDL da prévia num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'luxplus-curta',
    out: 'out/luxplus-curta',
    audio: { modo: 'efeitos', vo: 'luxplus-curta-vo', trilha: 'luxplus-curta-trilha', trilhaIn: 0 },
    blocks,
  });
