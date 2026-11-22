// Demonstração conceitual — Luxchange Request, no ritmo aprovado da v8.1. Direção v10 (2026-11-22), um estado por vez:
// banner → datas → Créditos necessários × saldo (faltam 7.000) → calendário do Direito de Uso (16/05 gera 14.000) →
// depósito realizado (novo saldo de 62.000 na Carteira) → destinação dos 55.000 Créditos à solicitação (controle próprio;
// permanecem 7.000) → revisão com a Taxa de intercâmbio, política e envio → solicitação enviada (55.000 em Garantia,
// 7.000 disponíveis) → solicitação recebida → aceite e revalidação → Créditos recebidos e reserva confirmada (a Garantia
// é consumida) → família na piscina (imagem aprovada da campanha) → assinatura oficial.
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
import { depositScenario, requestScenario } from '../../data.js';
import { brl, credits } from '../../format.js';
import { DEPOSIT_ACTION, REPLY_HOURS, times } from '../../sequence-request.js';
import { buildFilm } from './blocos.js';
import { fundo } from './fundo.js';

const ENTER = 480; // duration.slow: a leitura começa depois da entrada
const EXIT = 280; // duration.moderate: o valor novo entra depois da saída do antigo

const LEGAL = 'Imagens, interfaces e valores ilustrativos.';
// Valores lidos nas telas, da mesma fonte da interface (data.js → rules.js), nunca digitados à mão.
const scenario = requestScenario();
const dep = depositScenario();
const { allocation } = scenario;

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
      // Depósito de novas datas (direção v10): o calendário do Direito de Uso entra logo depois do toque em
      // "Complementar saldo", sem corte; o Membro toca em 16/05, que gera os 14.000 Créditos inteiros dela (não existe
      // depósito de só 7.000), e deposita. Um instante de processamento e corte em tempo morto.
      kind: 'ui',
      seq: 'request',
      scene: 'R3',
      parts: [
        {
          from: t.topupPress + 200,
          to: t.depositPress - 100,
          beat: {
            label: 'calendário: 16/05 gera 14.000 Créditos',
            type: 'mensagem',
            essential: `Selecionar datas do meu Direito de Uso 16/05 Créditos a gerar ${credits(dep.originated)} ${DEPOSIT_ACTION}`,
            readFrom: t.datesIn + ENTER,
          },
        },
        { from: t.depositPress - 100, to: t.depositOut },
      ],
      sfx: [
        { ms: t.daySelect, kind: 'tap', note: '16/05' },
        { ms: t.depositPress, kind: 'tap', note: DEPOSIT_ACTION },
      ],
      shot: { continue: true },
      contact: 3_000,
    },
    {
      // Depósito realizado (operação própria: o novo saldo já está na Carteira) e, só depois dele, a destinação dos
      // Créditos à solicitação: o controle anda de 0 a 55.000 e a revisão se habilita com a necessidade coberta.
      kind: 'ui',
      seq: 'request',
      scene: 'R4',
      parts: [
        {
          from: t.depositOut + 100,
          to: t.allocPress - 50,
          hold: 600,
          beat: {
            label: 'depósito realizado: novo saldo na Carteira',
            type: 'mensagem',
            essential: `Depósito realizado +${credits(dep.originated)} Créditos na sua Carteira Novo saldo disponível ${credits(dep.afterDeposit)}`,
            readFrom: t.depositedIn + ENTER,
          },
        },
        {
          from: t.allocPress - 50,
          to: t.reviewPress - 50,
          hold: 450,
          beat: {
            label: 'destinação dos Créditos à solicitação',
            type: 'mensagem',
            essential: `Créditos destinados à solicitação Destinados ${credits(allocation.allocated)} Disponíveis ${credits(allocation.available)} Necessários ${credits(allocation.needed)} Permanecerá disponível ${credits(allocation.remaining)}`,
            readFrom: t.allocIn + ENTER,
          },
        },
      ],
      sfx: [
        { ms: t.depositedIn, kind: 'state', note: 'depósito realizado' },
        { ms: t.allocPress, kind: 'tap', note: 'Destinar Créditos' },
        { ms: t.allocSlide, kind: 'tap', note: `destinação 0 → ${credits(allocation.allocated)}` },
      ],
      shot: { continue: true },
      contact: 4_000,
    },
    {
      // Revisão: Créditos destinados, Taxa de intercâmbio, política e envio.
      kind: 'ui',
      seq: 'request',
      scene: 'R4b',
      parts: [
        {
          from: t.reviewPress - 50,
          to: t.pay - 100,
          hold: 1_000,
          beat: {
            label: 'revisão: Créditos destinados e Taxa de intercâmbio',
            type: 'mensagem',
            essential: `${credits(allocation.allocated)} Créditos destinados Taxa de intercâmbio ${brl(scenario.feeCents)} Pagar taxa e enviar`,
            readFrom: t.reviewIn + ENTER,
          },
        },
        // Toque em "Pagar taxa e enviar" e um instante de processamento; o resto do processamento sai num corte.
        { from: t.pay - 100, to: t.pay + 500 },
        { from: t.sendOut - 300, to: t.sendCommit - 100 },
      ],
      sfx: [
        { ms: t.reviewPress, kind: 'tap', note: 'Revisar solicitação' },
        { ms: t.policy, kind: 'tap', note: 'aceite da política' },
        { ms: t.pay, kind: 'tap', note: 'Pagar taxa e enviar' },
      ],
      vo: {
        after: 500,
        text: 'Seus Créditos ficam em Garantia e a Taxa de intercâmbio é paga no envio.',
      },
      shot: { continue: true },
      contact: 2_000,
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
            readFrom: t.sendCommit + EXIT + ENTER,
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
