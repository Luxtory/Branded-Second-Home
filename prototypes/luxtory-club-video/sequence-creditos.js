// Demonstração conceitual — motion graphic editorial dos Créditos (ROTEIRO.md C04): Créditos válidos que já estão na
// Carteira + Créditos de um novo depósito de datas elegíveis → um só saldo, de lotes diferentes → Luxchange Request ou
// Direct, com o Fee de cada modalidade. Camada editorial da montagem, não interface: nenhum botão, nenhuma etapa
// transacional. Os números saem do mesmo cenário da Request (data.js), não são digitados aqui.
//
// Regras que a composição respeita: Créditos só se usam com Membership vigente (BR-195, dito na narração); valem 24
// meses (BR-191: "válidos"); o depósito origina Créditos e a capacidade entra no Inventário Luxtory (REQ-060,
// BR-202) — a data nunca paga a reserva diretamente; no Co-Owner, só data já reservada é depositada (BR-151, super);
// lotes diferentes compõem o saldo e o consumo segue o lote que vence primeiro (PD-008, TECH-071, mostrado na Request).
import { FICTITIOUS, requestScenario } from './data.js';
import { credits } from './format.js';
import { ICONS, icon, seal } from './shared.js';

const s = requestScenario();
const depositLot = s.lots.find((lot) => lot.id === FICTITIOUS.deposit.lotId);
const priorLots = s.lots.filter((lot) => lot !== depositLot);
const sum = (lots) => lots.reduce((total, lot) => total + lot.available, 0);
export const FIGURES = {
  prior: sum(priorLots),
  deposit: depositLot.available,
  total: s.balances.beforeSend.available,
  priorLots: priorLots.length,
};
const share = (part) => part / FIGURES.total;

export const SUPERS = {
  coOwner: 'No Co-Owner, só data já reservada é cedida.',
  credits: 'Créditos não são moeda, investimento nem garantia de disponibilidade.',
};

export function build(stage, fmt) {
  const lotLabel = (n) => `${n} ${n === 1 ? 'lote' : 'lotes'}`;
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--creditos" id="cr-panel" data-surface="deep" aria-label="Créditos Luxchange de ${s.requesterName}">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-bar demo-bar--lots" aria-hidden="true">
        ${priorLots.map((lot, i) => `<span class="demo-bar__seg demo-bar__seg--prior" id="cr-seg-${i}"></span>`).join('')}
        <span class="demo-bar__seg" id="cr-seg-new"></span>
      </div>
      <dl class="demo-sum">
        <div class="demo-sum__row" id="cr-row-prior">
          <dt class="demo-sum__label">Créditos válidos na Carteira <span class="lx-meta">${lotLabel(FIGURES.priorLots)}</span></dt>
          <dd class="demo-sum__figure">${credits(FIGURES.prior)}</dd>
        </div>
        <div class="demo-sum__row" id="cr-row-deposit">
          <dt class="demo-sum__label">De um novo depósito de datas elegíveis <span class="lx-meta">${lotLabel(1)}</span></dt>
          <dd class="demo-sum__figure"><span class="demo-sum__op" aria-hidden="true">+</span> ${credits(FIGURES.deposit)}</dd>
        </div>
        <div class="demo-sum__row demo-sum__row--total" id="cr-row-total">
          <dt class="demo-sum__label">Um só saldo, de lotes diferentes</dt>
          <dd class="demo-sum__figure">${credits(FIGURES.total)}</dd>
        </div>
      </dl>
      <p class="demo-note" id="cr-use">${icon('i-info')}<span><strong>Para Luxchange Request ou Direct, com Membership vigente</strong>Créditos + Fee, em cada modalidade.</span></p>
      ${seal}
    </section>
    <p class="demo-ed demo-ed--legal" id="cr-legal-coowner" data-surface="deep"><span>${SUPERS.coOwner}</span></p>
    <p class="demo-ed demo-ed--legal" id="cr-legal-credits" data-surface="deep"><span>${SUPERS.credits}</span></p>`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline() {
  // Batidas alinhadas à narração (ROTEIRO.md §4): "usa os Créditos válidos que já tem" → "deposita datas elegíveis
  // para gerar novos" → "ou combina os dois" → "para viver outras Second Homes".
  const prior = 1_600;
  const deposit = 3_800;
  const total = 6_300;
  const use = 7_800;
  return {
    duration: 11_000,
    enter: [
      // O painel chega com a primeira batida (nunca um cartão vazio na tela).
      { sel: '#cr-panel', in: prior - 300, out: 10_400 },
      { sel: '#cr-row-prior', in: prior },
      { sel: '#cr-row-deposit', in: deposit },
      { sel: '#cr-row-total', in: total },
      { sel: '#cr-use', in: use },
      // Supers da cena, cada um com tempo de leitura (≥ 1 s a cada 3 palavras + 0,5 s); o segundo só entra depois da
      // saída do primeiro (duration.moderate), no mesmo lugar.
      { sel: '#cr-legal-coowner', in: 3_600, out: 6_800 },
      { sel: '#cr-legal-credits', in: 7_100, out: 10_650 },
    ],
    set: [],
    // A barra da Carteira enche: os lotes que já existiam com a primeira batida, o lote novo com a segunda.
    tween: [
      ...priorLots.map((lot, i) => ({
        sel: `#cr-seg-${i}`,
        prop: '--share',
        at: prior + i * 120,
        from: 0,
        to: share(lot.available),
      })),
      { sel: '#cr-seg-new', prop: '--share', at: deposit, from: 0, to: share(FIGURES.deposit) },
    ],
    marks: [
      { at: prior - 300, label: 'painel dos Créditos' },
      { at: prior, label: `Créditos válidos na Carteira: ${credits(FIGURES.prior)}` },
      { at: deposit, label: `novo depósito: + ${credits(FIGURES.deposit)} (super do Co-Owner)` },
      { at: total, label: `um só saldo: ${credits(FIGURES.total)}` },
      { at: use, label: 'Luxchange Request ou Direct · Créditos + Fee (super dos Créditos)' },
      { at: 11_000, label: 'fim (corte para C05)' },
    ],
  };
}

export const qa = {
  checkpoints: [
    {
      t: 2_600,
      name: 'carteira',
      expect: [`Créditos Luxchange de ${s.requesterName}`, credits(FIGURES.prior)],
      absent: [credits(FIGURES.total)],
    },
    {
      t: 5_200,
      name: 'deposito',
      expect: [credits(FIGURES.prior), credits(FIGURES.deposit)],
      absent: [credits(FIGURES.total)],
    },
    {
      t: 9_200,
      name: 'saldo',
      // A condição de Membership fica escrita no painel: a vertical é vista sem som (L3, BR-195).
      expect: [
        credits(FIGURES.total),
        'Para Luxchange Request ou Direct, com Membership vigente',
        'Créditos + Fee',
      ],
    },
  ],
  stills: { carteira: 2_600, deposito: 5_200, saldo: 9_200 },
  alpha: { from: 5_000, seconds: 5 },
  sample: { card: '#cr-panel', at: 9_200 },
  motion: { card: '#cr-panel', at: 9_200, enter: [1_300, 1_780] },
  plates: { serra: 'public/images/home/hero/luxury-property-facade-hero.jpg' },
};
