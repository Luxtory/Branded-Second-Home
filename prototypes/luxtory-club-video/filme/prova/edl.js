// Demonstração conceitual — EDL da prova de montagem (Etapa C): um trecho da Request montado como no master
// (ROTEIRO.md C05, C07, C08, C09), em ≈ 19,8 s. É dado, não código: montar.mjs renderiza a partir daqui e a camada
// editorial (sequence-prova.js) lê os mesmos textos e tempos.
//
// Tempos em ms do tempo da prova. Enquadramentos dos placeholders em pixels do espaço 1920×1080 da imagem (largura
// 1920, recorte central de 16:9); `start`/`end` = [x, y, largura] do retângulo visível no primeiro e no último quadro do
// plano (altura = largura × 9/16), interpolados em velocidade constante (push-in de dolly).
//
// Quando o footage aprovado existir em out/entrada/<asset>.mp4|.mov, montar.mjs usa o arquivo no lugar do placeholder.
// A voz (vo.wav) e a trilha (trilha.wav) entram do mesmo jeito; sem elas, a prova traz só efeitos e ambientes
// sintéticos gerados aqui e a narração como legenda-guia na cópia de revisão.

const PLACA_LITORAL = 'public/images/home/hero/hero-lifestyle.jpg';
const PLACEHOLDER_FOTO =
  'placeholder · foto de referência provisória do site (1344 px), não é footage';

// Trechos de interface: quadros já capturados (out/etapa-a), sem acelerar nem desacelerar. `at` = início no tempo da
// prova; `from`/`to` = trecho no tempo da sequência.
const UI = [
  { seq: 'request', at: 2_400, from: 0, to: 4_800 },
  { seq: 'request', at: 7_200, from: 10_600, to: 13_600 },
  { seq: 'request', at: 10_200, from: 15_900, to: 20_400 },
  // O último trecho vai até o fim do fade da interface (17,3 s + 0,5 s), senão ela sumiria num quadro.
  { seq: 'request', at: 14_700, from: 20_400, to: 23_500 },
];
/** Instante da prova de um instante `ms` da sequência dentro do trecho `i` (efeitos alinhados às `marks`). */
const onUi = (i, ms) => UI[i].at + (ms - UI[i].from);

export const EDL = {
  id: 'prova-request',
  fmt: '16x9',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 19_800,
  fadeOut: { at: 19_300, dur: 500 },

  // Imagem (um plano por cena; os cortes coincidem com os cortes da interface).
  shots: [
    {
      scene: 'C05',
      plan: 'S06',
      from: 0,
      to: 7_200,
      asset: 'S06',
      label: `C05 · S06 Varanda · Litoral, plano de apresentação · ${PLACEHOLDER_FOTO}`,
      placeholder: { image: PLACA_LITORAL, start: [0, 0, 1920], end: [40, 150, 1640] },
    },
    {
      scene: 'C07',
      plan: 'S07',
      from: 7_200,
      to: 10_200,
      asset: 'S07',
      label: `C07 · S07 borda da piscina · ${PLACEHOLDER_FOTO} (recorte ampliado)`,
      placeholder: { image: PLACA_LITORAL, start: [0, 560, 900], end: [60, 590, 820] },
    },
    {
      scene: 'C08',
      plan: 'S09',
      from: 10_200,
      to: 14_700,
      asset: 'S09',
      label:
        'C08 · S09 mãos do outro Titular num interior neutro · placeholder neutro: plano a produzir',
      placeholder: { neutral: true },
    },
    {
      scene: 'C09',
      plan: 'S10',
      from: 14_700,
      to: 19_800,
      asset: 'S10',
      label: `C09 · S10 chegada a Varanda · Litoral · ${PLACEHOLDER_FOTO}; pessoas da foto ≠ Helena`,
      // Câmera parada enquanto há interface (as pessoas ficam atrás do cartão da direita, nunca no vão entre cartões);
      // quando a interface sai, o movimento revela a família.
      placeholder: {
        image: PLACA_LITORAL,
        start: [560, 300, 1200],
        end: [880, 360, 1000],
        moveFrom: 2_600,
        ease: 'smooth',
      },
    },
  ],

  ui: UI,
  // A interface sai em fade e o plano humano respira sem tela (ROTEIRO.md §2).
  uiFadeOut: { at: 17_300, dur: 500 },
  // Profundidade: a imagem suaviza o foco quando a interface entra e volta a ficar nítida quando ela sai.
  focus: { soften: { at: 2_400, dur: 500 }, sharpen: { at: 17_300, dur: 500 }, sigma: 4 },

  // Camada editorial (Design System). O título fica no terço inferior esquerdo, sobre a parte mais escura da imagem,
  // e sai antes de o cartão de contexto ocupar o mesmo lugar (saída + 280 ms); a ressalva entra com a primeira
  // interface, na faixa inferior, e fica 4 s.
  editorial: {
    title: {
      in: 300,
      out: 2_400,
      eyebrow: 'Luxtory Club',
      title: 'Luxchange Request',
      desc: 'noites de outro Titular',
    },
    legal: {
      in: 2_800,
      out: 6_800,
      text: 'Demonstração conceitual: interfaces, imóveis e valores ilustrativos.',
    },
    tag: 'Prova interna · imagens e sons provisórios',
  },

  // Narração-guia (tempo de leitura natural ≈ 2,6 palavras/s). Frases da narração aprovada; as de C07 e C09 estão
  // encurtadas porque a prova comprime cinco cenas em quatro.
  vo: [
    {
      from: 400,
      to: 5_800,
      text: 'Quando as noites que você deseja estão com outro Titular, você envia uma Request.',
    },
    { from: 7_400, to: 10_800, text: 'Seus Créditos ficam em Garantia enquanto o Titular decide.' },
    { from: 11_000, to: 13_200, text: 'Do outro lado, o Titular aceita.' },
    {
      from: 14_700,
      to: 18_500,
      text: 'Estando tudo certo, a reserva se confirma na mesma operação.',
    },
  ],

  // Efeitos nos `marks` da Request (sequence-request.js), convertidos para o tempo da prova; ambientes por plano.
  sfx: [
    { at: onUi(0, 2_400), kind: 'tap', note: 'entrada 04/06' },
    { at: onUi(0, 3_100), kind: 'tap', note: 'saída 07/06' },
    { at: onUi(1, 11_700), kind: 'state', note: 'Request Pendente; Garantia constituída' },
    { at: onUi(2, 18_500), kind: 'tap', note: 'Aceitar' },
    ...[18_900, 19_100, 19_300, 19_500].map((ms) => ({ at: onUi(2, ms), kind: 'check' })),
    { at: onUi(3, 20_600), kind: 'chord', note: 'Request Aceita + Reserva Confirmada' },
  ],
  ambience: [
    { from: 0, to: 10_200, kind: 'mar' },
    { from: 10_200, to: 14_700, kind: 'interior' },
    { from: 14_700, to: 19_800, kind: 'mar' },
  ],
};

/** Plano ativo no instante t (ms). */
export const shotAt = (t) => EDL.shots.find((s) => t >= s.from && t < s.to) ?? EDL.shots.at(-1);
