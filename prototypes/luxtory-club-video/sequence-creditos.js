// Motion graphic editorial dos Créditos (ROTEIRO.md C04), conceitual: Créditos válidos que você já tem + novos
// Créditos de datas elegíveis depositadas → um só saldo para viver outras Second Homes, com Membership vigente, em
// Luxchange Request ou Direct. Comunica liberdade, não contrato: sem números nem personagem; a formação do saldo de Helena (48.000 + 46.000 =
// 94.000) acontece uma única vez no filme, na Request (credits-step.js). Camada editorial da montagem, não interface:
// nenhum botão, nenhuma etapa transacional.
//
// Regras que a composição respeita: Créditos só se usam com Membership vigente (BR-195, escrito no painel); valem 24
// meses (BR-191: "válidos"); o depósito origina Créditos e a capacidade entra no Inventário Luxtory (REQ-060,
// BR-202) — a data nunca paga a reserva diretamente; no Co-Owner, só data já reservada é depositada (BR-151, nota do painel);
// lotes diferentes compõem o saldo (PD-008, mostrado na Request, não aqui). Obrigatórias pela L3 de b2c.md: a condição
// de Membership vigente (painel e narração), "Crédito não é moeda" e a regra do Co-Owner (nota do painel); a taxa de cada
// modalidade fica nos títulos das modalidades.
import { ICONS, icon } from './shared.js';

// Proporções da barra só como forma (dois lotes anteriores e um novo); nenhum valor aparece.
const SEGMENTS = { prior: [0.32, 0.19], fresh: 0.49 };

// Ressalvas exigidas pela L3 de b2c.md, com o texto aprovado da resposta "Consigo usar outros lugares?" (b2c.md §4).
export const SUPERS = {
  credits: 'Créditos não são moeda nem garantem disponibilidade.',
  // Regra do Co-Owner (L3 de b2c.md, BR-151) no contexto de propriedade compartilhada (D-B2C-20), sem estender ao
  // Owner; decisão da Luxtory de 2026-11-19.
  coOwner: 'Nas Second Homes compartilhadas, só datas já reservadas podem ser depositadas.',
};
// Uma nota só, dentro do painel: a informação fica junto do que ela qualifica e o terço inferior do quadro fica livre
// para a fotografia (antes, duas legendas na faixa inferior, trocando no meio da cena).
export const FOOTNOTE = `${SUPERS.credits} ${SUPERS.coOwner}`;

export const ROWS = {
  prior: 'Créditos válidos que você já tem',
  fresh: 'Novos Créditos, de datas elegíveis depositadas',
  total: 'Um só saldo para viver outras Second Homes',
};

export function build(stage, fmt) {
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--creditos" id="cr-panel" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange</p>
      <div class="demo-bar demo-bar--lots" aria-hidden="true">
        ${SEGMENTS.prior.map((_, i) => `<span class="demo-bar__seg demo-bar__seg--prior" id="cr-seg-${i}"></span>`).join('')}
        <span class="demo-bar__seg" id="cr-seg-new"></span>
      </div>
      <ol class="demo-equation">
        <li id="cr-row-prior"><span class="demo-equation__op" aria-hidden="true"></span><span>${ROWS.prior}</span></li>
        <li id="cr-row-deposit"><span class="demo-equation__op" aria-hidden="true">+</span><span>${ROWS.fresh}</span></li>
        <li id="cr-row-total" class="demo-equation__total"><span class="demo-equation__op" aria-hidden="true">=</span><span>${ROWS.total}</span></li>
      </ol>
      <p class="demo-note" id="cr-use">${icon('i-info')}<span>${USE_LINE}</span></p>
      <p class="demo-hint demo-footnote" id="cr-legal">${FOOTNOTE}</p>
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

// Batidas alinhadas à narração (ROTEIRO.md §4): "usa os Créditos válidos que já tem" → "deposita datas elegíveis
// para gerar novos" → "ou combina os dois" → "para viver outras Second Homes". Exportadas para o filme completo cortar
// o painel só depois da leitura da última linha.
export const BEATS = { prior: 1_300, deposit: 3_200, total: 5_400, use: 7_000 };
export const USE_LINE = 'Com Membership vigente, em Luxchange Request ou Direct.';

export function timeline() {
  const { prior, deposit, total, use } = BEATS;
  return {
    duration: 10_500,
    enter: [
      // O painel chega com a primeira batida (nunca um cartão vazio na tela).
      { sel: '#cr-panel', in: prior - 300, out: 9_900 },
      { sel: '#cr-row-prior', in: prior },
      { sel: '#cr-row-deposit', in: deposit },
      { sel: '#cr-row-total', in: total },
      { sel: '#cr-use', in: use },
      // A nota entra quando o depósito é mencionado e fica até a saída do painel (tempo de leitura: ≥ 1 s a cada 3
      // palavras + 0,5 s).
      { sel: '#cr-legal', in: deposit },
    ],
    set: [],
    // A barra enche: os lotes que já existiam com a primeira batida, o lote novo com a segunda.
    tween: [
      ...SEGMENTS.prior.map((share, i) => ({
        sel: `#cr-seg-${i}`,
        prop: '--share',
        at: prior + i * 120,
        from: 0,
        to: share,
      })),
      { sel: '#cr-seg-new', prop: '--share', at: deposit, from: 0, to: SEGMENTS.fresh },
    ],
    marks: [
      { at: prior - 300, label: 'painel dos Créditos (conceitual, sem números)' },
      { at: prior, label: 'Créditos válidos que você já tem' },
      {
        at: deposit,
        label: '+ novos Créditos de datas elegíveis depositadas (entra a nota com as ressalvas)',
      },
      { at: total, label: '= um só saldo para viver outras Second Homes' },
      { at: use, label: 'com Membership vigente, em Request ou Direct' },
      { at: 10_500, label: 'fim (corte para C05)' },
    ],
  };
}

export const qa = {
  checkpoints: [
    {
      t: 2_200,
      name: 'carteira',
      expect: ['Créditos Luxchange', ROWS.prior],
      absent: [ROWS.total],
    },
    {
      t: 4_400,
      name: 'deposito',
      expect: [ROWS.prior, ROWS.fresh],
      absent: [ROWS.total],
    },
    {
      t: 8_600,
      name: 'saldo',
      // A condição de Membership fica escrita no painel: a vertical é vista sem som (L3, BR-195). Sem números nem
      // personagem: o saldo de Helena só se forma na Request.
      expect: [ROWS.total, 'Com Membership vigente, em Luxchange Request ou Direct', FOOTNOTE],
      absent: ['48.000', '46.000', '94.000', 'Helena'],
    },
  ],
  stills: { carteira: 2_200, deposito: 4_400, saldo: 8_600 },
  alpha: { from: 4_000, seconds: 5 },
  sample: { card: '#cr-panel', at: 8_600 },
  motion: { card: '#cr-panel', at: 8_600, enter: [1_000, 1_480] },
  // Placa interna de teste da Satori Home (foto provisória de pedra, madeira e vidro), onde Helena está em C03–C04.
  plates: { serra: 'public/images/home/hero/luxury-property-facade-hero.jpg' },
};
