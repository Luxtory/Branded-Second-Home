// Demonstração conceitual — prévia da Luxchange Request no ritmo da v8.1 (filme/QUATRO-FILMES.md §5): ≈ 53 s com a
// assinatura. Banner → datas → Créditos necessários × saldo → complementação (controle e datas do Direito de Uso,
// 46.000 novos Créditos) → depósito confirmado → revisão com a Taxa de intermediação, política e envio → solicitação
// enviada com a Garantia → solicitação recebida → aceite e revalidação → Créditos recebidos e reserva confirmada →
// plano humano → assinatura oficial.
//
// A interface toca no tempo da sequência (sequence-request.js), sem acelerar. A edição usa só cortes em tempo morto (a
// saída de um cartão, o processamento do pagamento) e pausas curtas quando a informação principal pede leitura.
//
// Imagens: os planos usam assets de out/entrada quando existem (nomes do plano, como em edl-cinema.js); sem eles,
// placeholders identificados. O footage humano (S17a) é o mesmo da prova cinematográfica.
import { times } from '../../sequence-request.js';
import { buildFilm } from './blocos.js';

const PLACA_LITORAL = 'public/images/home/hero/hero-lifestyle.jpg';
const PLACA_SERRA = 'public/images/home/hero/luxury-property-facade-hero.jpg';
const FOTO = 'placeholder: foto provisória do site, não é a Second Home do filme';
const ENTER = 480; // duration.slow: a leitura começa depois da entrada

/** Plano de imagem estática com câmera lenta; placeholder com o mesmo movimento. */
const still = (plan, what, image, move) => ({
  plan,
  asset: plan,
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
  return [
    {
      kind: 'banner',
      scene: 'B1',
      dur: 4_250,
      // Diferença da modalidade em duas linhas (direção v8.1): de quem são as noites, como se paga e do que depende.
      banner: {
        title: 'Luxchange Request',
        lines: [
          'Solicite noites reservadas por outro Membro.',
          'Créditos + Taxa de intermediação · depende do aceite.',
        ],
      },
      shot: still('S06', 'Azzura Home ao entardecer (K-AZ)', PLACA_LITORAL, CRANE),
      ambience: 'mar',
      contact: 2_000,
    },
    {
      // Escolha da Second Home e das datas: os toques acontecem; a pausa só deixa ler "3 noites".
      kind: 'ui',
      seq: 'request',
      scene: 'R1',
      parts: [
        {
          from: 900,
          to: 5_000,
          hold: 1_700,
          beat: {
            label: 'Second Home e datas',
            type: 'mensagem',
            essential: 'Azzura Home 3 noites',
            readFrom: 3_700 + ENTER,
          },
        },
      ],
      legal: 'Imagens, interfaces e valores ilustrativos.',
      sfx: [
        { ms: 2_400, kind: 'tap', note: 'entrada 04/06' },
        { ms: 3_100, kind: 'tap', note: 'saída 07/06' },
      ],
      vo: {
        after: 200,
        text: 'Quando as noites que você deseja estão com outro Membro, você envia uma Request.',
      },
      // O plano do banner continua (grua lenta): sem corte na mesma imagem.
      shot: { continue: true },
      ambience: 'mar',
      contact: 3_500,
    },
    {
      // Por que Helena precisa de Créditos: 55.000 necessários, 48.000 disponíveis, faltam 7.000.
      kind: 'ui',
      seq: 'request',
      scene: 'R2',
      parts: [
        {
          from: 5_000,
          to: t.topupPress - 100,
          hold: 1_700,
          beat: {
            label: 'Créditos necessários × saldo',
            type: 'decisao',
            essential: '55.000 necessários 48.000 disponíveis faltam 7.000 Complementar saldo',
            readFrom: t.needIn + ENTER,
          },
        },
        // O toque em "Complementar saldo"; corta antes da saída do cartão.
        { from: t.topupPress - 100, to: t.topupPress + 200 },
      ],
      sfx: [
        ...(fmt === '16x9' ? [{ ms: 5_200, kind: 'tap', note: 'Continuar' }] : []),
        { ms: t.topupPress, kind: 'tap', note: 'Complementar saldo' },
      ],
      vo: {
        after: 600,
        text: 'Se o saldo não bastar, você completa com datas do seu Direito de Uso — e pode depositar mais, para as próximas experiências.',
      },
      shot: still('S05', 'Helena no terraço da Satori Home', PLACA_SERRA, PUSH),
      ambience: 'vento',
      contact: 3_000,
    },
    {
      // Complementação: o controle vai ao mínimo (14.000, uma data) e Helena escolhe mais duas datas elegíveis do seu
      // Direito de Uso (46.000 novos Créditos, saldo projetado de 94.000). Entra com os cartões já abertos (corte na
      // ação) e só segura um instante antes de depositar.
      kind: 'ui',
      seq: 'request',
      scene: 'R3',
      parts: [
        {
          // Antes do primeiro movimento do controle (10,7 s no 16:9; 9,5 s no 9:16, com o cartão ainda entrando).
          from: Math.min(9_600, t.slider - 200),
          to: t.depositPress - 100,
          hold: 800,
          beat: {
            label: 'datas escolhidas: 46.000 novos Créditos',
            type: 'acao',
            essential: '46.000 saldo 94.000',
            readFrom: Math.min(t.depositPress - 100, t.taps[1] + 900),
          },
        },
        { from: t.depositPress - 100, to: t.depositOut },
      ],
      sfx: [
        { ms: t.slider, kind: 'tap', note: 'controle → 14.000, o mínimo' },
        { ms: t.taps[0], kind: 'tap', note: '14/05 → 30.000' },
        { ms: t.taps[1], kind: 'tap', note: '15/05 → 46.000' },
        { ms: t.depositPress, kind: 'tap', note: 'Depositar datas e gerar Créditos' },
      ],
      shot: still('S04', 'Helena com o celular, horizonte ao fundo', PLACA_SERRA, DRIFT),
      ambience: 'vento',
      contact: 3_500,
    },
    {
      // Depósito confirmado (operação própria) e revisão: Créditos, Taxa de intermediação, política e envio.
      kind: 'ui',
      seq: 'request',
      scene: 'R4',
      parts: [
        {
          from: t.depositOut + 100,
          to: t.reviewPress - 50,
          hold: 1_150,
          beat: {
            label: 'depósito confirmado e saldo atualizado',
            type: 'mensagem',
            essential: 'Depósito confirmado 46.000 novos Créditos saldo 94.000',
            readFrom: t.depositedIn + ENTER,
          },
        },
        {
          from: t.reviewPress - 50,
          to: t.pay - 100,
          hold: 1_000,
          beat: {
            label: 'revisão: Créditos e Taxa de intermediação',
            type: 'mensagem',
            essential: '55.000 Créditos Taxa de intermediação R$ 550,00 Pagar taxa e enviar',
            readFrom: t.reviewIn + ENTER,
          },
        },
        // Toque em "Pagar taxa e enviar" e um instante de processamento; o resto do processamento sai num corte.
        { from: t.pay - 100, to: t.pay + 500 },
        { from: t.sendOut - 300, to: t.sendCommit - 100 },
      ],
      sfx: [
        { ms: t.depositedIn, kind: 'state', note: 'depósito confirmado' },
        { ms: t.reviewPress, kind: 'tap', note: 'Revisar solicitação' },
        { ms: t.policy, kind: 'tap', note: 'aceite da política' },
        { ms: t.pay, kind: 'tap', note: 'Pagar taxa e enviar' },
      ],
      vo: {
        after: 3_300,
        text: 'Seus Créditos ficam em Garantia e a Taxa de intermediação é paga no envio.',
      },
      shot: still('S03', 'luz da manhã no interior da Satori Home', PLACA_SERRA, DRIFT),
      ambience: 'vento',
      contact: 4_500,
    },
    {
      kind: 'ui',
      seq: 'request',
      scene: 'R5',
      parts: [
        {
          from: t.sendCommit - 100,
          to: t.sendCommit + 780,
          hold: 2_600,
          beat: {
            label: 'solicitação enviada · Garantia',
            type: 'mensagem',
            essential: 'Solicitação enviada 55.000 em Garantia 39.000 disponíveis',
            readFrom: t.sendCommit + 280 + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.sendCommit, kind: 'state', note: 'solicitação pendente; Garantia constituída' },
      ],
      shot: still('S07', 'borda infinita da Azzura Home', PLACA_LITORAL, DRIFT),
      ambience: 'mar',
      contact: 2_500,
    },
    {
      // Quem recebe: o benefício (55.000 Créditos a receber), o prazo e a decisão; aceite e revalidação.
      kind: 'ui',
      seq: 'request',
      scene: 'R6',
      parts: [
        {
          from: t.pendingOut + 300,
          to: t.accept - 100,
          hold: 1_700,
          beat: {
            label: 'solicitação recebida · Créditos a receber',
            type: 'decisao',
            essential: 'Solicitação recebida 55.000 Créditos a receber 24 horas Aceitar',
            readFrom: t.holderIn + ENTER,
          },
        },
        {
          from: t.accept - 100,
          to: t.accept + 1_600,
          hold: 600,
          beat: {
            label: 'aceite e revalidação',
            type: 'acao',
            essential: 'Revalidando',
            readFrom: t.accept + 1_000 + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.accept, kind: 'tap', note: 'Aceitar' },
        ...[400, 600, 800, 1_000].map((d) => ({ ms: t.accept + d, kind: 'check' })),
      ],
      vo: { after: 300, text: 'Do outro lado, quem recebe a solicitação decide se aceita.' },
      shot: still('S09', 'o membro que recebe a solicitação, sem rosto'),
      ambience: 'interior',
      contact: 3_000,
    },
    {
      // A mesma operação: solicitação aceita (quem recebe) e reserva confirmada (quem solicita), lado a lado no 16:9.
      kind: 'ui',
      seq: 'request',
      scene: 'R7',
      parts: [
        {
          from: t.accept + 1_600,
          to: t.result + ENTER,
          hold: 3_200,
          fadeOut: 500,
          beat: {
            label: 'Créditos recebidos e reserva confirmada',
            type: 'confirmacao',
            essential: 'Solicitação aceita 55.000 Créditos recebidos Reserva confirmada',
            readFrom: t.result + ENTER,
          },
        },
      ],
      sfx: [{ ms: t.result, kind: 'chord', note: 'solicitação aceita + reserva confirmada' }],
      vo: { after: 0, text: 'Estando tudo certo, a reserva se confirma na mesma operação.' },
      shot: still(
        'S10',
        'chegada: interior da Azzura Home aberto ao mar (K-AZ-i)',
        PLACA_LITORAL,
        PUSH,
      ),
      ambience: 'mar',
      contact: 2_500,
    },
    {
      kind: 'moment',
      scene: 'R8',
      dur: 3_500,
      vo: { after: 200, text: 'Mais lugares para viver com quem você ama.' },
      shot: {
        plan: 'S17a',
        asset: 'S17a',
        what: 'gesto humano real na praia ao entardecer (footage gratuito)',
        dissolve: 500,
        footage: { conform: 'retime', in: fmt === '9x16' ? 10_500 : 0, focus: [0.5, 0.5] },
        placeholder: {
          neutral: true,
          colors: ['0x9a7a5e', '0x1b2731'],
          note: 'placeholder neutro',
        },
      },
      ambience: 'mar',
      contact: 1_750,
    },
    {
      kind: 'signature',
      dissolve: 700,
      vo: 'Luxtory. Seja protagonista de histórias extraordinárias.',
    },
  ];
}

/** EDL da prévia num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'request-curta',
    out: 'out/request-curta',
    audio: { vo: 'request-curta-vo', trilha: 'request-curta-trilha', trilhaIn: 0 },
    blocks,
  });
