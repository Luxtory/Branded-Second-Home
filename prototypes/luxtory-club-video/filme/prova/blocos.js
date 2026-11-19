// Demonstração conceitual — montagem por blocos dos filmes do Luxtory Club (filme/QUATRO-FILMES.md). Um filme é uma
// lista de blocos, montados em sequência, que vira uma EDL no formato lido por montar.mjs e sequence-prova.js:
// - `banner`: banner da modalidade sobre um plano (título + até três linhas curtas);
// - `ui`: trechos de uma sequência de interface tocados no tempo dela, cada um com pausa de leitura opcional (`hold`,
//   o quadro congela depois da animação de entrada; a imagem continua em movimento por baixo);
// - `moment`: plano sem interface (experiência, respiro);
// - `signature`: assinatura oficial (sequence-assinatura.js) com dissolve da imagem para o cartão.
// Nada aqui acelera ou desacelera interface: a sequência toca em tempo real e só ganha pausas. Os cortes e trechos caem
// na grade de 3 quadros (125 ms a 24 fps), para o corte de imagem e a troca de interface coincidirem.
import { DURATION as SIGNATURE_MS } from '../../sequence-assinatura.js';

export const FPS = 24;
export const GRID_MS = 125;
const FORMATS = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const FOCUS_RAMP_MS = 500;
const BANNER_EDGE_MS = 400; // entrada e saída do banner dentro do bloco
const LEGAL_MS = 4_000;
// Narração: ritmo de conversa (≈ 2,6 palavras por segundo, ROTEIRO.md §4).
const VO_WORDS_PER_S = 2.6;

/**
 * Legibilidade (filme/QUATRO-FILMES.md §3): a janela de leitura começa quando a animação de entrada termina e vai até a
 * troca seguinte. Faixas por tipo de tela, em ms, e leitura mínima do texto essencial (1 s de orientação + 2,5 palavras
 * por segundo).
 */
export const READING = {
  ranges: {
    banner: [2_500, 4_000],
    clique: [1_000, 2_000],
    mensagem: [4_500, 6_000],
    multi: [7_000, 10_000],
    confirmacao: [5_000, 7_000],
    assinatura: [5_500, 6_500],
  },
  baseMs: 1_000,
  wordsPerS: 2.5,
};
const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const ceilGrid = (ms) => Math.ceil(ms / GRID_MS) * GRID_MS;

/** Tempo mínimo de leitura do texto essencial de uma tela, em ms. */
export const readingMs = (text) =>
  Math.round(READING.baseMs + (words(text) / READING.wordsPerS) * 1000);

/** Monta a EDL de um filme num formato. `spec.blocks(fmt)` devolve os blocos daquele formato. */
export function buildFilm(fmt, spec) {
  const size = FORMATS[fmt];
  if (!size) throw new Error(`Formato desconhecido: ${fmt}`);
  const acc = {
    t: 0,
    shots: [],
    ui: [],
    banners: [],
    legal: [],
    vo: [],
    sfx: [],
    ambience: [],
    windows: [],
    beats: [],
    contact: [],
  };
  for (const block of spec.blocks(fmt)) PLACE[block.kind](acc, block);
  const duration = acc.t;
  const [width, height] = size;
  const signature = acc.ui.find((u) => u.seq === 'assinatura');
  return {
    id: spec.id,
    out: spec.out,
    fmt,
    width,
    height,
    fps: FPS,
    duration,
    uiSource: 'stage',
    stills: true,
    shots: acc.shots,
    ui: acc.ui,
    focus: { sigma: 4, windows: acc.windows },
    editorial: {
      banners: acc.banners,
      legal: acc.legal,
      tag: 'Prova interna · imagens e sons provisórios',
      // Nada de etiqueta, aviso ou selo na assinatura.
      tagOut: signature?.at,
    },
    vo: acc.vo,
    audio: spec.audio,
    // A imagem termina no cartão da assinatura (sem fade para o preto); o som resolve e silencia nos últimos 200 ms.
    audioOut: { at: duration - 1_200, dur: 1_000 },
    sfx: acc.sfx.sort((a, b) => a.at - b.at),
    ambience: acc.ambience,
    beats: acc.beats,
    contact: acc.contact,
  };
}

/** Coloca o plano de um bloco (do início ao fim do bloco); `shot.continue` estende o plano anterior, sem corte. */
function placeShot(acc, block, from) {
  if (block.shot.continue) acc.shots.at(-1).to = acc.t;
  else acc.shots.push({ scene: block.scene, ...block.shot, from, to: acc.t });
  if (block.ambience) acc.ambience.push({ from, to: acc.t, kind: block.ambience });
  if (block.vo) acc.vo.push(voLine(from + (block.vo.after ?? 0), block.vo.text));
  if (block.contact !== undefined) acc.contact.push(from + block.contact);
}

const voLine = (from, text) => ({
  from,
  to: from + Math.round((words(text) / VO_WORDS_PER_S) * 1000),
  text,
});

const PLACE = {
  banner(acc, block) {
    const from = acc.t;
    acc.t = ceilGrid(from + block.dur);
    const banner = {
      in: from + BANNER_EDGE_MS,
      out: acc.t - BANNER_EDGE_MS,
      title: block.banner.title,
      lines: block.banner.lines,
    };
    acc.banners.push(banner);
    // Leitura do banner: as linhas entram uma a uma (sequence-prova.js), então a leitura começa quando a primeira
    // assenta e vai até a saída.
    acc.beats.push({
      label: `banner · ${banner.title}`,
      type: 'banner',
      essential: [banner.title, ...banner.lines].join(' '),
      from: banner.in + 320 + 480,
      to: banner.out,
    });
    placeShot(acc, block, from);
  },

  ui(acc, block) {
    const from = acc.t;
    const map = [];
    for (const part of block.parts) {
      const at = acc.t;
      const playEnd = at + (part.to - part.from);
      // A pausa fecha o trecho na grade de 3 quadros (no mínimo o que foi pedido).
      const end = ceilGrid(playEnd + (part.hold ?? 0));
      acc.ui.push({
        seq: block.seq,
        at,
        from: part.from,
        to: part.to,
        hold: end - playEnd,
        ...(part.fadeOut ? { fadeOut: part.fadeOut } : {}),
      });
      map.push({ at, from: part.from, to: part.to });
      if (part.beat)
        acc.beats.push({
          label: part.beat.label,
          type: part.beat.type,
          essential: part.beat.essential,
          from: at + (part.beat.readFrom - part.from),
          to: end,
        });
      acc.t = end;
    }
    // Efeitos no instante da sequência, convertidos para o tempo do filme.
    for (const fx of block.sfx ?? []) {
      const m = map.find((p) => fx.ms >= p.from && fx.ms <= p.to);
      if (m) acc.sfx.push({ at: m.at + (fx.ms - m.from), kind: fx.kind, note: fx.note });
    }
    if (block.legal)
      acc.legal.push({ in: from + 400, out: from + 400 + LEGAL_MS, text: block.legal });
    acc.windows.push({ from, to: acc.t, ramp: FOCUS_RAMP_MS });
    placeShot(acc, block, from);
  },

  moment(acc, block) {
    const from = acc.t;
    acc.t = ceilGrid(from + block.dur);
    placeShot(acc, block, from);
  },

  signature(acc, block) {
    const at = acc.t;
    acc.ui.push({ seq: 'assinatura', at, from: 0, to: SIGNATURE_MS, fadeIn: block.dissolve });
    acc.t = at + SIGNATURE_MS;
    // A imagem anterior continua por baixo do dissolve até o fim.
    acc.shots.at(-1).to = acc.t;
    const amb = acc.ambience.at(-1);
    if (amb && amb.to === at) amb.to = at + block.dissolve;
    acc.sfx.push({ at: at + 1_500, kind: 'resolve', note: 'assinatura' });
    if (block.vo) acc.vo.push(voLine(at + 1_500, block.vo));
    acc.beats.push({
      label: 'assinatura oficial',
      type: 'assinatura',
      essential: 'Luxtory',
      from: at,
      to: acc.t,
    });
    acc.contact.push(at + 3_500);
  },
};

/** Relatório de legibilidade: janela real de cada tela, faixa do tipo e leitura mínima do texto essencial. */
export function legibility(edl) {
  return edl.beats.map((b) => {
    const window = b.to - b.from;
    const [min, max] = READING.ranges[b.type];
    // Banner e assinatura seguem a faixa do tipo; as telas de interface também a leitura do texto essencial.
    const need = ['banner', 'assinatura'].includes(b.type)
      ? min
      : Math.max(min, readingMs(b.essential));
    return { ...b, window, min: need, max, ok: window >= need && window <= max + GRID_MS };
  });
}
