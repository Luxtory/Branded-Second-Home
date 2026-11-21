// Demonstração conceitual — prévia da Luxchange Request (v8.2, filme/QUATRO-FILMES.md §5), no ritmo aprovado da v8.1.
// Banner → datas → Créditos necessários × saldo → complementação com o depósito mínimo (16/05, 14.000 novos Créditos)
// → depósito confirmado (saldo 62.000) → revisão com a Taxa de intercâmbio, política e envio → solicitação enviada
// (55.000 em Garantia, 7.000 disponíveis) → solicitação recebida → aceite e revalidação → Créditos recebidos e reserva
// confirmada → família na piscina (imagem aprovada da campanha) → assinatura oficial.
//
// Fundo (decisão de 2026-11-21): a simulação inteira acontece sobre o hero da home, sem overlay, num plano contínuo
// (fundo.js), como ambientação do Luxtory Club; os nomes das Second Homes ficam só na interface. A família só no
// encerramento.
//
// A interface toca no tempo da sequência (sequence-request.js), sem acelerar. A edição usa só cortes em tempo morto (a
// saída de um cartão, o processamento do pagamento) e pausas curtas quando a informação principal pede leitura.
//
// Imagens: um arquivo em out/entrada com o nome do asset tem prioridade (ex.: HERO-9x16.jpg em maior resolução).
// Som: só efeitos de operação (audio.modo 'efeitos', decisão da campanha).
import { REPLY_HOURS, times } from '../../sequence-request.js';
import { buildFilm } from './blocos.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada

const LEGAL = 'Imagens, interfaces e valores ilustrativos.';
// Texto do controle que precisa ser lido na complementação (credits-step.js, direção v8.3).
const COMPLEMENT_COPY =
  'Faltam 7.000 Créditos. Uma data elegível gera 14.000 Créditos. O excedente permanece disponível.';

/**
 * Blocos do filme. `resumo` (filme completo): o plano do fundo continua do bloco anterior e família e assinatura ficam
 * para o fim do filme.
 */
export function blocks(fmt, { resumo = false } = {}) {
  const t = times(fmt);
  const list = [
    {
      kind: 'banner',
      scene: 'B1',
      dur: 4_500,
      // Primeira tela (direção v8.3): de quem são as noites e como se paga; a dependência do aceite fica na segunda
      // tela. "Taxa de intercâmbio" é o rótulo comercial decidido pela Luxtory (revisão comercial e jurídica pendente
      // antes da publicação); o conceito técnico continua Luxchange Fee.
      banner: {
        title: 'Luxchange Request',
        lines: [
          'Solicite noites reservadas por outro Membro.',
          'Use Créditos e pague a Taxa de intercâmbio.',
        ],
      },
      // 9:16: a ressalva fica no banner; no R1 o calendário ocupa a faixa acima dos 20% inferiores (v8.3).
      ...(fmt === '9x16' ? { legal: LEGAL } : {}),
      shot: resumo ? { continue: true } : fundo(fmt),
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
            essential: 'Azzura Home 3 noites depende do aceite do Membro',
            readFrom: 3_700 + ENTER,
          },
        },
      ],
      ...(fmt === '16x9' ? { legal: LEGAL } : {}),
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
        text: 'Se o saldo não bastar, você completa com datas do seu Direito de Uso — e o que sobrar fica para as próximas experiências.',
      },
      shot: { continue: true },
      contact: 3_000,
    },
    {
      // Complementação com o depósito mínimo (direção v8.2): o controle vai a 14.000, que é 16/05 inteira; saldo
      // projetado de 62.000 e 7.000 depois da reserva, que ficam para experiências futuras. Entra com os cartões já
      // abertos (corte na ação).
      kind: 'ui',
      seq: 'request',
      scene: 'R3',
      // O controle vai ao mínimo (14.000, 16/05) e a copy da direção v8.3 diz por quê: "Faltam 7.000 Créditos. Uma
      // data elegível gera 14.000 Créditos. O excedente permanece disponível." No 16:9 o calendário já está ao lado;
      // no 9:16 o controle tem a própria pausa e o calendário entra depois, só para mostrar 16/05 e o toque. O tempo
      // parado até o depósito sai num corte invisível.
      parts: [
        ...(fmt === '9x16'
          ? [
              {
                from: Math.min(9_600, t.slider - 200),
                to: t.topupOut - 100,
                hold: 1_625,
                beat: {
                  label: 'complementação: faltam 7.000, uma data gera 14.000',
                  type: 'mensagem',
                  essential: `${COMPLEMENT_COPY} 62.000 7.000`,
                  readFrom: t.topupIn + ENTER,
                },
              },
              {
                from: t.topupOut - 100,
                to: t.datesIn + ENTER + 20,
                hold: 1_200,
                beat: {
                  label: 'calendário: 16/05 selecionada',
                  type: 'acao',
                  essential: '16/05 Depositar datas e gerar Créditos',
                  readFrom: t.datesIn + ENTER,
                },
              },
            ]
          : [
              {
                from: Math.min(9_600, t.slider - 200),
                to: t.slider + 1_200,
                hold: 2_200,
                beat: {
                  label: 'complementação: faltam 7.000, uma data gera 14.000 (16/05)',
                  type: 'mensagem',
                  essential: `${COMPLEMENT_COPY} 16/05 62.000 7.000`,
                  readFrom: t.slider,
                },
              },
            ]),
        { from: t.depositPress - 300, to: t.depositOut },
      ],
      sfx: [
        { ms: t.slider, kind: 'tap', note: 'controle → 14.000, o mínimo (16/05)' },
        { ms: t.depositPress, kind: 'tap', note: 'Depositar datas e gerar Créditos' },
      ],
      shot: { continue: true },
      contact: 3_500,
    },
    {
      // Depósito confirmado (operação própria) e revisão: Créditos, Taxa de intercâmbio, política e envio.
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
            essential: 'Depósito confirmado 14.000 novos Créditos saldo 62.000',
            readFrom: t.depositedIn + ENTER,
          },
        },
        {
          from: t.reviewPress - 50,
          to: t.pay - 100,
          hold: 1_000,
          beat: {
            label: 'revisão: Créditos e Taxa de intercâmbio',
            type: 'mensagem',
            essential: '55.000 Créditos Taxa de intercâmbio R$ 550,00 Pagar taxa e enviar',
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
        text: 'Seus Créditos ficam em Garantia e a Taxa de intercâmbio é paga no envio.',
      },
      shot: { continue: true },
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
            essential: 'Solicitação enviada 55.000 em Garantia 7.000 disponíveis',
            readFrom: t.sendCommit + 280 + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.sendCommit, kind: 'state', note: 'solicitação pendente; Garantia constituída' },
      ],
      shot: { continue: true },
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
            // Prazo derivado da simulação (o mesmo da interface), nunca literal.
            essential: `Solicitação recebida 55.000 Créditos a receber ${REPLY_HOURS} horas Aceitar`,
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
      shot: { continue: true },
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
      sfx: [{ ms: t.result, kind: 'confirm', note: 'solicitação aceita + reserva confirmada' }],
      vo: { after: 0, text: 'Estando tudo certo, a reserva se confirma na mesma operação.' },
      shot: { continue: true },
      contact: 2_500,
    },
    {
      kind: 'moment',
      scene: 'R8',
      dur: 4_000,
      // Sem cartão, legenda ou etiqueta sobre a família (encerramento emocional).
      clean: true,
      vo: { after: 300, text: 'Mais lugares para viver com quem você ama.' },
      shot: {
        plan: 'S17b',
        asset: 'S17b',
        what: 'família na piscina ao pôr do sol (imagem aprovada da campanha)',
        dissolve: 500,
        // 16:9: recorte da largura inteira (família, pôr do sol e casa) e aproximação lenta. 9:16 provisório: a imagem
        // inteira, nítida, emoldurada no Moroccan Blue da assinatura (S17b-9x16.png), sem extensão artificial, até a
        // versão 9:16 editada no ChatGPT. Nenhum rosto ou corpo cortado.
        move:
          fmt === '9x16'
            ? { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.05] }
            : { from: [0.5, 0.5, 1.0], to: [0.48, 0.5, 1.06], anchor: [0.5, 0.547] },
        placeholder: {
          neutral: true,
          colors: ['0x9a7a5e', '0x1b2731'],
          note: 'placeholder neutro: imagem da família ausente em out/entrada',
        },
      },
      contact: 2_000,
    },
    {
      kind: 'signature',
      // Dissolve de 0,8 s da família para o cartão Dark Moroccan Blue da assinatura oficial.
      dissolve: 800,
      vo: 'Luxtory. Seja protagonista de histórias extraordinárias.',
    },
  ];
  return resumo ? list.slice(0, -2) : list;
}

/** EDL da prévia num formato (`16x9` ou `9x16`). */
export const edlFor = (fmt) =>
  buildFilm(fmt, {
    id: 'request-curta',
    out: 'out/request-curta',
    audio: { modo: 'efeitos', vo: 'request-curta-vo', trilha: 'request-curta-trilha', trilhaIn: 0 },
    blocks,
  });
