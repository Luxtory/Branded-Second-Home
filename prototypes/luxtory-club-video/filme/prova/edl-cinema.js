// Demonstração conceitual — EDL da prova cinematográfica (PROVA-CINEMATOGRAFICA.md §3): ≈ 24 s da Request na Azzura
// Home, a 24 fps, em 16:9 e 9:16. Junta arquitetura exclusiva (imagens do ChatGPT com câmera subpixel), interface
// aprovada (renderizada nativamente a 24 fps a partir do palco, sem conversão de cadência), um plano humano real
// (footage gratuito), dissolve, trilha gratuita e narração de teste. É dado, não código: montar.mjs --edl=cinema
// renderiza a partir daqui e a camada editorial (sequence-prova.js?edl=cinema) lê os mesmos textos e tempos.
//
// Assets aprovados entram por nome em out/entrada/ (fora do Git), primeiro `<asset>-<fmt>.<ext>`, depois
// `<asset>.<ext>`: vídeo (mov, mp4) ou imagem (png, jpg, jpeg, webp). Sem o asset, o plano usa o placeholder
// identificado na tarja da cópia de revisão. Voz e trilha: `prova-cinema-vo.wav` e `prova-cinema-trilha.(wav|mp3)`.
//
// Movimento de câmera sobre imagem: `[cx, cy, zoom]` normalizados no quadro de saída (centro do recorte e
// ampliação sobre a imagem já ajustada ao formato), interpolados do primeiro ao último quadro; nunca acima de 1,06 de
// ampliação (PROVA-CINEMATOGRAFICA.md §4); o centro fica em [0,5/zoom, 1 − 0,5/zoom] (com zoom 1 não há pan).
// Footage: conformado por retemporização (cada quadro da fonte vira um quadro do master; nenhum quadro inventado ou
// descartado), salvo `conform: 'realtime'`, que exige verificação visual de judder.

import { times } from '../../sequence-request.js';

// Instantes da Request atual (sequence-request.js#times): os trechos depois da revisão seguem a sequência, com as
// mesmas durações de antes (envio, recebida e aceite, confirmação).
const T = times('16x9');
const PLACA_LITORAL = 'public/images/home/hero/hero-lifestyle.jpg';
const FOTO_PROVISORIA = 'placeholder: foto provisória do site (1344 px), não é a Azzura Home';
const SEQ_REQUEST_MS = T.duration;

// Trechos da Request (sequence-request.js#times), sem acelerar nem desacelerar; `at` = início no tempo da prova. Cortes e
// trechos na grade de 125 ms (3 quadros a 24 fps), para o corte de imagem e a troca da interface caírem no mesmo quadro.
const UI = [
  // Datas e rota: noites de outro Titular → Luxchange Request (ROTEIRO.md C05).
  { seq: 'request', at: 2_000, from: 0, to: 4_625 },
  // Pagamento enviado: Request Pendente, Garantia constituída (C07).
  { seq: 'request', at: 6_625, from: T.sendCommit - 1_100, to: T.sendCommit + 1_900 },
  // O outro Titular recebe e aceita; verificações (C08).
  { seq: 'request', at: 9_625, from: T.holderIn - 200, to: T.result - 200 },
  // Request Aceita + Reserva Confirmada, até o fim do fade da interface (C09).
  { seq: 'request', at: 14_125, from: T.result - 200, to: T.result + 2_925 },
];
const onUi = (i, ms) => UI[i].at + (ms - UI[i].from);
const UI_END = UI.at(-1).at + (UI.at(-1).to - UI.at(-1).from);

// Planos. `move` por formato; o placeholder tem enquadramento próprio (a foto provisória não é a imagem-chave).
const SHOTS = [
  {
    scene: 'C05',
    plan: 'S06',
    from: 0,
    to: 6_625,
    asset: 'S06',
    what: 'Azzura Home, plano aberto ao entardecer (K-AZ)',
    // Grua descendo devagar: o recorte desce sobre a imagem e aproxima 2%.
    move: {
      '16x9': { from: [0.5, 0.482, 1.04], to: [0.5, 0.528, 1.06], ease: 'smooth' },
      '9x16': { from: [0.5, 0.486, 1.03], to: [0.5, 0.523, 1.05], ease: 'smooth' },
    },
    placeholder: {
      image: PLACA_LITORAL,
      note: FOTO_PROVISORIA,
      move: {
        '16x9': { from: [0.5, 0.482, 1.04], to: [0.5, 0.528, 1.06], ease: 'smooth' },
        '9x16': {
          from: [0.5, 0.5, 1.0],
          to: [0.5, 0.5, 1.02],
          ease: 'smooth',
          anchor: [0.62, 0.5],
        },
      },
    },
  },
  {
    scene: 'C07',
    plan: 'S07',
    from: 6_625,
    to: 9_625,
    asset: 'S07',
    what: 'borda infinita e o mar (edição da K-AZ)',
    // Travelling lateral curto, em velocidade constante, na direção da linha d'água.
    move: {
      '16x9': { from: [0.48, 0.5, 1.05], to: [0.52, 0.5, 1.05] },
      '9x16': { from: [0.48, 0.5, 1.05], to: [0.52, 0.5, 1.05] },
    },
    placeholder: {
      image: PLACA_LITORAL,
      note: `${FOTO_PROVISORIA} (recorte ampliado)`,
      move: {
        '16x9': { from: [0.26, 0.74, 2.0], to: [0.29, 0.74, 2.0] },
        '9x16': { from: [0.47, 0.5, 1.08], to: [0.53, 0.5, 1.08], anchor: [0.3, 0.5] },
      },
    },
  },
  {
    scene: 'C08',
    plan: 'S08',
    from: 9_625,
    to: 14_125,
    asset: 'S08',
    what: 'pérgola de madeira vazia, o mar ao fundo, luz caindo (edição da K-AZ)',
    move: {
      '16x9': { from: [0.5, 0.5, 1.0], to: [0.5, 0.49, 1.03] },
      '9x16': { from: [0.5, 0.5, 1.0], to: [0.5, 0.49, 1.03] },
    },
    placeholder: {
      image: PLACA_LITORAL,
      note: `${FOTO_PROVISORIA} (recorte ampliado)`,
      move: {
        '16x9': { from: [0.62, 0.42, 1.5], to: [0.62, 0.42, 1.55] },
        '9x16': { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.03], anchor: [0.8, 0.5] },
      },
    },
  },
  {
    scene: 'C09',
    plan: 'S10',
    from: 14_125,
    to: 17_250,
    asset: 'S10',
    what: 'chegada: interior da Azzura Home aberto para o mar (K-AZ-i)',
    move: {
      '16x9': { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.03], ease: 'smooth' },
      '9x16': { from: [0.5, 0.5, 1.0], to: [0.5, 0.5, 1.03], ease: 'smooth' },
    },
    placeholder: { neutral: true, note: 'placeholder neutro: imagem K-AZ-i a gerar' },
  },
  {
    scene: 'C16',
    plan: 'S17a',
    from: 17_250,
    to: 24_000,
    asset: 'S17a',
    what: 'gesto humano real: casal caminhando na praia ao entardecer, sem rosto (footage gratuito)',
    // A interface já saiu: dissolve curto para o plano humano, que respira até o fim.
    dissolve: 625,
    // Candidatos verificados em 18/11/2026 (PROVA-CINEMATOGRAFICA.md §6): 16:9 Mixkit 44490 (o casal aparece nos
    // primeiros segundos); 9:16 Mixkit 1224, vertical nativo (mãos dadas que se aproximam, a partir de 9 s).
    footage: {
      conform: 'retime',
      in: { '16x9': 0, '9x16': 9_000 },
      focus: { '16x9': [0.5, 0.5], '9x16': [0.5, 0.5] },
    },
    placeholder: {
      neutral: true,
      colors: ['0x9a7a5e', '0x1b2731'],
      note: 'placeholder neutro: footage gratuito a escolher (PROVA-CINEMATOGRAFICA.md §6)',
    },
  },
];

const FORMATS = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const DURATION = 24_000;

/** EDL no formato lido por montar.mjs, para um formato (`16x9` ou `9x16`). */
export function edlFor(fmt) {
  const size = FORMATS[fmt];
  if (!size) throw new Error(`Formato desconhecido para a prova cinematográfica: ${fmt}`);
  const [width, height] = size;
  return {
    id: 'prova-cinema',
    out: 'out/prova-cinema',
    fmt,
    width,
    height,
    fps: 24,
    duration: DURATION,
    // Interface renderizada do palco na cadência da EDL (não usa os quadros de 30 fps de out/etapa-a).
    uiSource: 'stage',
    stills: true,
    fadeOut: { at: 23_300, dur: 700 },
    shots: SHOTS.map(({ move, placeholder, ...shot }) => ({
      ...shot,
      move: move?.[fmt],
      placeholder: { ...placeholder, move: placeholder.move?.[fmt] },
      footage: shot.footage && {
        ...shot.footage,
        in: shot.footage.in[fmt],
        focus: shot.footage.focus[fmt],
      },
    })),
    ui: UI,
    uiFadeOut: { at: UI_END - 500, dur: 500 },
    focus: {
      soften: { at: UI[0].at, dur: 500 },
      sharpen: { at: UI_END - 500, dur: 500 },
      sigma: 4,
    },
    editorial: {
      title: {
        in: 300,
        out: 2_000,
        title: 'Luxchange Request',
        desc: 'noites de outro Titular · Créditos + Taxa de intermediação',
      },
      legal: { in: 2_400, out: 6_400, text: 'Imagens, interfaces e valores ilustrativos.' },
      tag: 'Prova interna · imagens e sons provisórios',
    },
    // Narração de teste: frases do ROTEIRO.md §4 (C05, C09 e C16) e da prova de montagem aprovada (C07, C08).
    vo: [
      {
        from: 400,
        to: 5_800,
        text: 'Quando as noites que você deseja estão com outro Titular, você envia uma Request.',
      },
      {
        from: 6_700,
        to: 9_400,
        text: 'Seus Créditos ficam em Garantia enquanto o Titular decide.',
      },
      { from: 10_100, to: 12_300, text: 'Do outro lado, o Titular aceita.' },
      {
        from: 14_200,
        to: 17_000,
        text: 'Estando tudo certo, a reserva se confirma na mesma operação.',
      },
      { from: 18_400, to: 21_200, text: 'Mais lugares para viver com quem você ama.' },
    ],
    audio: { vo: 'prova-cinema-vo', trilha: 'prova-cinema-trilha', trilhaIn: 0 },
    sfx: [
      { at: onUi(0, 2_400), kind: 'tap', note: 'entrada 04/06' },
      { at: onUi(0, 3_100), kind: 'tap', note: 'saída 07/06' },
      { at: onUi(1, T.sendCommit), kind: 'state', note: 'Request Pendente; Garantia constituída' },
      { at: onUi(2, T.accept), kind: 'tap', note: 'Aceitar' },
      ...[400, 600, 800, 1_000]
        .map((d) => T.accept + d)
        .map((ms) => ({ at: onUi(2, ms), kind: 'check' })),
      { at: onUi(3, T.result), kind: 'chord', note: 'Request Aceita + Reserva Confirmada' },
    ],
    ambience: [
      { from: 0, to: 14_125, kind: 'mar' },
      { from: 14_125, to: 17_250, kind: 'interior' },
      { from: 17_250, to: DURATION, kind: 'mar' },
    ],
    contact: [1_200, 4_600, 8_000, 11_600, 13_400, 15_800, 18_800, 22_400],
  };
}

export const CINEMA = { UI, SHOTS, DURATION, SEQ_REQUEST_MS, FORMATS };
