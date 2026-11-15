// Demonstração conceitual — EDL da prova de montagem (Etapa C): um trecho da Request montado como no master
// (ROTEIRO.md C05, C06, C07, C08, C09), em ≈ 24,8 s. É dado, não código: montar.mjs renderiza a partir daqui e a camada
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
const PLACA_SERRA = 'public/images/home/hero/luxury-property-facade-hero.jpg';
const PLACEHOLDER_FOTO =
  'placeholder · foto de referência provisória do site (1344 px), não é footage';

// Trechos de interface: quadros já capturados (out/etapa-a), sem acelerar nem desacelerar. `at` = início no tempo da
// prova; `from`/`to` = trecho no tempo da sequência (Request com o passo de Créditos, 35 s; sequence-request.js#times).
const UI = [
  { seq: 'request', at: 2_400, from: 0, to: 4_800 },
  // Complementação: abril → maio, controle a 16.000 (14/05), toques em 15 e 16/05 → 46.000.
  { seq: 'request', at: 7_200, from: 9_700, to: 14_700 },
  // Pagamento da Taxa de intermediação, envio, Pendente e Garantia.
  { seq: 'request', at: 12_200, from: 21_400, to: 24_400 },
  { seq: 'request', at: 15_200, from: 26_700, to: 31_200 },
  // O último trecho vai até o fim do fade da interface, senão ela sumiria num quadro.
  { seq: 'request', at: 19_700, from: 31_200, to: 34_300 },
];
/** Instante da prova de um instante `ms` da sequência dentro do trecho `i` (efeitos alinhados às `marks`). */
const onUi = (i, ms) => UI[i].at + (ms - UI[i].from);

export const EDL = {
  id: 'prova-request',
  fmt: '16x9',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 24_800,
  fadeOut: { at: 24_300, dur: 500 },

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
      scene: 'C06',
      plan: 'S05',
      from: 7_200,
      to: 12_200,
      asset: 'S05',
      label: `C06 · S05 Helena em Mirante · Serra, complementando o saldo · ${PLACEHOLDER_FOTO.replace('(1344 px)', '(1672 px)')}; pessoas e imóvel ≠ bíblia`,
      placeholder: { image: PLACA_SERRA, start: [0, 0, 1920], end: [100, 56, 1720] },
    },
    {
      scene: 'C07',
      plan: 'S07',
      from: 12_200,
      to: 15_200,
      asset: 'S07',
      label: `C07 · S07 borda da piscina · ${PLACEHOLDER_FOTO} (recorte ampliado)`,
      placeholder: { image: PLACA_LITORAL, start: [0, 560, 900], end: [60, 590, 820] },
    },
    {
      scene: 'C08',
      plan: 'S09',
      from: 15_200,
      to: 19_700,
      asset: 'S09',
      label:
        'C08 · S09 o outro Titular no próprio apartamento, ao anoitecer · placeholder neutro: plano a produzir',
      placeholder: { neutral: true },
    },
    {
      scene: 'C09',
      plan: 'S10',
      from: 19_700,
      to: 24_800,
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
  uiFadeOut: { at: 22_300, dur: 500 },
  // Profundidade: a imagem suaviza o foco quando a interface entra e volta a ficar nítida quando ela sai.
  focus: { soften: { at: 2_400, dur: 500 }, sharpen: { at: 22_300, dur: 500 }, sigma: 4 },

  // Camada editorial (Design System). O título fica no terço inferior esquerdo, sobre a parte mais escura da imagem,
  // e sai antes de o cartão de contexto ocupar o mesmo lugar (saída + 280 ms); a ressalva entra com a primeira
  // interface, na faixa inferior, e fica 4 s.
  editorial: {
    title: {
      in: 300,
      out: 2_400,
      title: 'Luxchange Request',
      // Gramática dos títulos de modalidade: de onde vêm as noites · como se paga (ROTEIRO.md §2).
      desc: 'noites de outro Titular · Créditos + Taxa de intermediação',
    },
    legal: {
      in: 2_800,
      out: 6_800,
      // Indicação neutra de material ilustrativo (não nega o produto); ROTEIRO.md §5.
      text: 'Imagens, interfaces e valores ilustrativos.',
    },
    tag: 'Prova interna · imagens e sons provisórios',
  },

  // Narração-guia (tempo de leitura natural ≈ 2,6 palavras/s). Frases da narração do ROTEIRO.md §4; as de C07 e C09
  // estão encurtadas porque a prova comprime as cenas.
  vo: [
    {
      from: 400,
      to: 5_800,
      text: 'Quando as noites que você deseja estão com outro Titular, você envia uma Request.',
    },
    {
      from: 7_400,
      to: 11_800,
      text: 'Se faltarem Créditos, você completa com datas do seu Direito de Uso.',
    },
    {
      from: 12_300,
      to: 15_400,
      text: 'Seus Créditos ficam em Garantia enquanto o Titular decide.',
    },
    { from: 15_900, to: 18_100, text: 'Do outro lado, o Titular aceita.' },
    {
      from: 19_700,
      to: 23_500,
      text: 'Estando tudo certo, a reserva se confirma na mesma operação.',
    },
  ],

  // Efeitos nos `marks` da Request (sequence-request.js), convertidos para o tempo da prova; ambientes por plano.
  sfx: [
    { at: onUi(0, 2_400), kind: 'tap', note: 'entrada 04/06' },
    { at: onUi(0, 3_100), kind: 'tap', note: 'saída 07/06' },
    { at: onUi(1, 10_000), kind: 'tap', note: 'próximo mês' },
    { at: onUi(1, 11_300), kind: 'tap', note: 'controle → 16.000' },
    { at: onUi(1, 12_900), kind: 'tap', note: '15/05' },
    { at: onUi(1, 13_700), kind: 'tap', note: '16/05 → 46.000' },
    { at: onUi(2, 22_500), kind: 'state', note: 'Request Pendente; Garantia constituída' },
    { at: onUi(3, 29_300), kind: 'tap', note: 'Aceitar' },
    ...[29_700, 29_900, 30_100, 30_300].map((ms) => ({ at: onUi(3, ms), kind: 'check' })),
    { at: onUi(4, 31_400), kind: 'chord', note: 'Request Aceita + Reserva Confirmada' },
  ],
  ambience: [
    { from: 0, to: 7_200, kind: 'mar' },
    { from: 7_200, to: 12_200, kind: 'vento' },
    { from: 12_200, to: 15_200, kind: 'mar' },
    { from: 15_200, to: 19_700, kind: 'interior' },
    { from: 19_700, to: 24_800, kind: 'mar' },
  ],
  // Instantes da folha de contato.
  contact: [1_200, 4_000, 8_400, 11_000, 13_400, 16_800, 20_200, 24_000],
};

/** Plano ativo no instante t (ms). */
export const shotAt = (t) => EDL.shots.find((s) => t >= s.from && t < s.to) ?? EDL.shots.at(-1);
