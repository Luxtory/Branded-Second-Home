// Demonstração conceitual — prévia curta da Luxchange Request no novo ritmo (filme/QUATRO-FILMES.md §5, etapa 4):
// banner → escolha das datas → uma decisão de Créditos (complementar o saldo) e o depósito confirmado → solicitação
// enviada com saldo e Garantia simplificados → solicitação recebida → aceite e revalidação → Créditos recebidos e
// reserva confirmada → plano humano → assinatura oficial. A interface toca no tempo da sequência (sequence-request.js),
// com pausas de leitura depois de cada entrada; nada é acelerado.
//
// Imagens: os planos usam assets de out/entrada quando existem (nomes do plano, como em edl-cinema.js); sem eles,
// placeholders identificados. O footage humano (S17a) é o mesmo da prova cinematográfica.
import { times } from '../../sequence-request.js';
import { buildFilm } from './blocos.js';

const PLACA_LITORAL = 'public/images/home/hero/hero-lifestyle.jpg';
const PLACA_SERRA = 'public/images/home/hero/luxury-property-facade-hero.jpg';
const FOTO = 'placeholder: foto provisória do site, não é a Second Home do filme';

/** Plano de imagem estática com câmera lenta; placeholder com o mesmo movimento. */
const still = (plan, asset, what, image, move) => ({
  plan,
  asset,
  what,
  move,
  placeholder: image
    ? { image, note: FOTO, move }
    : { neutral: true, note: `placeholder neutro: ${what} a gerar` },
});
const PUSH = { from: [0.5, 0.5, 1.0], to: [0.5, 0.49, 1.04], ease: 'smooth' };
const DRIFT = { from: [0.48, 0.5, 1.05], to: [0.52, 0.5, 1.05] };
const CRANE = { from: [0.5, 0.482, 1.04], to: [0.5, 0.528, 1.06], ease: 'smooth' };

function blocks(fmt) {
  const t = times(fmt);
  const enter = 480; // duration.slow: a leitura começa depois da entrada
  return [
    {
      kind: 'banner',
      scene: 'B1',
      dur: 5_000,
      banner: {
        title: 'Luxchange Request',
        lines: [
          'Solicite noites reservadas por outro Membro.',
          'Utilize Créditos + Taxa de intermediação.',
          'Depende do aceite de quem recebeu a solicitação.',
        ],
      },
      shot: still('S06', 'S06', 'Azzura Home ao entardecer (K-AZ)', PLACA_LITORAL, CRANE),
      ambience: 'mar',
      contact: 2_500,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R1',
      parts: [
        {
          from: 0,
          to: 4_700,
          hold: 4_700,
          beat: {
            label: 'Second Home e datas',
            type: 'mensagem',
            essential: 'Azzura Home 3 noites Noites reservadas por outro Membro',
            readFrom: 4_200 + enter,
          },
        },
      ],
      legal: 'Imagens, interfaces e valores ilustrativos.',
      sfx: [
        { ms: 2_400, kind: 'tap', note: 'entrada 04/06' },
        { ms: 3_100, kind: 'tap', note: 'saída 07/06' },
      ],
      vo: {
        after: 400,
        text: 'Quando as noites que você deseja estão com outro Membro, você envia uma Request.',
      },
      // O plano do banner continua (grua lenta): sem corte na mesma imagem.
      shot: { continue: true },
      ambience: 'mar',
      contact: 4_000,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R2',
      parts: [
        {
          from: 4_700,
          to: t.topupPress - 100,
          hold: 5_400,
          beat: {
            label: 'Créditos necessários × saldo',
            type: 'multi',
            essential: 'Créditos necessários 55.000 Saldo 48.000 faltam 7.000 Complementar saldo',
            readFrom: t.needIn + enter,
          },
        },
        { from: t.topupPress - 100, to: t.stepOut + 280 },
      ],
      sfx: [
        ...(fmt === '16x9' ? [{ ms: 5_200, kind: 'tap', note: 'Continuar' }] : []),
        { ms: t.topupPress, kind: 'tap', note: 'Complementar saldo' },
      ],
      vo: {
        after: 1_400,
        text: 'Se o saldo não bastar, você completa com datas do seu Direito de Uso — e pode depositar mais, para as próximas experiências.',
      },
      shot: still('S05', 'S05', 'Helena no terraço da Satori Home', PLACA_SERRA, PUSH),
      ambience: 'vento',
      contact: 4_500,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R3',
      parts: [
        {
          from: t.depositedIn,
          to: t.depositedIn + enter + 20,
          hold: 4_700,
          beat: {
            label: 'depósito confirmado e saldo atualizado',
            type: 'mensagem',
            essential: 'Depósito confirmado 46.000 novos Créditos saldo 94.000',
            readFrom: t.depositedIn + enter,
          },
        },
      ],
      sfx: [{ ms: t.depositedIn, kind: 'state', note: 'depósito confirmado' }],
      shot: still('S03', 'S03', 'luz da manhã no interior da Satori Home', PLACA_SERRA, DRIFT),
      ambience: 'vento',
      contact: 2_500,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R4',
      parts: [
        {
          from: t.sendCommit,
          to: t.sendCommit + 780,
          hold: 7_300,
          beat: {
            label: 'solicitação enviada · saldo e Garantia',
            type: 'multi',
            essential:
              'Solicitação enviada Pendente Saldo disponível 39.000 Créditos em Garantia 55.000 utilizados para confirmar a reserva',
            readFrom: t.sendCommit + 280 + enter,
          },
        },
      ],
      sfx: [
        { ms: t.sendCommit, kind: 'state', note: 'solicitação pendente; Garantia constituída' },
      ],
      vo: {
        after: 600,
        text: 'Seus Créditos ficam em Garantia e a Taxa de intermediação é paga no envio.',
      },
      shot: still('S07', 'S07', 'borda infinita da Azzura Home', PLACA_LITORAL, DRIFT),
      ambience: 'mar',
      contact: 4_000,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R5',
      parts: [
        {
          from: t.holderIn,
          to: t.accept - 100,
          hold: 6_500,
          beat: {
            label: 'solicitação recebida · Créditos a receber',
            type: 'multi',
            essential:
              'Solicitação de troca recebida 3 noites reservadas do seu Direito de Uso 55.000 Créditos a receber 24 horas',
            readFrom: t.holderIn + enter,
          },
        },
        {
          from: t.accept - 100,
          to: t.accept + 1_500,
          hold: 1_400,
          beat: {
            label: 'aceite e revalidação',
            type: 'clique',
            essential: 'Revalidando',
            readFrom: t.accept + 1_000 + enter,
          },
        },
      ],
      sfx: [
        { ms: t.accept, kind: 'tap', note: 'Aceitar' },
        ...[400, 600, 800, 1_000].map((d) => ({ ms: t.accept + d, kind: 'check' })),
      ],
      vo: { after: 1_000, text: 'Do outro lado, quem recebe a solicitação decide se aceita.' },
      shot: still('S09', 'S09', 'o membro que recebe a solicitação, sem rosto'),
      ambience: 'interior',
      contact: 4_000,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R6',
      parts: [
        {
          from: t.accept + 1_500,
          to: t.result + enter,
          hold: 6_000,
          fadeOut: 600,
          beat: {
            label: 'Créditos recebidos e reserva confirmada',
            type: 'confirmacao',
            essential:
              'Solicitação aceita 55.000 Créditos recebidos Reserva confirmada Azzura Home',
            readFrom: t.result + enter,
          },
        },
      ],
      sfx: [{ ms: t.result, kind: 'chord', note: 'solicitação aceita + reserva confirmada' }],
      vo: {
        after: 600,
        text: 'Com o aceite, tudo é verificado de novo — e, estando tudo certo, a reserva se confirma na mesma operação.',
      },
      shot: still(
        'S10',
        'S10',
        'chegada: interior da Azzura Home aberto ao mar (K-AZ-i)',
        PLACA_LITORAL,
        PUSH,
      ),
      ambience: 'mar',
      contact: 4_000,
    },
    {
      kind: 'moment',
      scene: 'R7',
      dur: 6_500,
      vo: { after: 1_200, text: 'Mais lugares para viver com quem você ama.' },
      shot: {
        plan: 'S17a',
        asset: 'S17a',
        what: 'gesto humano real na praia ao entardecer (footage gratuito)',
        dissolve: 625,
        footage: { conform: 'retime', in: fmt === '9x16' ? 9_000 : 0, focus: [0.5, 0.5] },
        placeholder: {
          neutral: true,
          colors: ['0x9a7a5e', '0x1b2731'],
          note: 'placeholder neutro',
        },
      },
      ambience: 'mar',
      contact: 3_000,
    },
    {
      kind: 'signature',
      dissolve: 700,
      vo: 'Luxtory. Seja protagonista de histórias extraordinárias.',
    },
  ];
}

/** EDL da prévia curta num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'request-curta',
    out: 'out/request-curta',
    audio: { vo: 'request-curta-vo', trilha: 'request-curta-trilha', trilhaIn: 0 },
    blocks,
  });
