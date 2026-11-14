// Demonstração conceitual — coreografia do Luxchange Direct (Etapa B). Capacidade já no Inventário Luxtory: sem aceite
// de outro Titular (BR-220); Fee pago antes da confirmação (TECH-082); pagamento não reserva — revalidação e só então
// confirmação (ADR-008, TECH-080); Créditos consumidos na confirmação, por FEFO (BR-221, PD-008).
// Todo valor exibido vem de directScenario() (data.js → rules.js). Textos da demonstração, não copy aprovada.
import { directScenario } from './data.js';
import { brl, credits, instant } from './format.js';
import {
  ALWAYS,
  ICONS,
  calendarMonth,
  hours,
  icon,
  periodOf,
  press,
  rangeSteps,
  seal,
} from './shared.js';

const s = directScenario();
const period = periodOf(s.checkin, s.checkout);
const nightsLabel = `${s.nights.length} ${s.nights.length === 1 ? 'noite' : 'noites'}`;
const route = `${icon('i-info')}<span><strong>Noites do Inventário Luxtory</strong>Reserva direta, sem aceite de outro Titular: Luxchange Direct.</span>`;
const [lot] = s.lots.filter((l) => s.consumption.some((c) => c.lotId === l.id));
const consumed = s.consumption.find((c) => c.lotId === lot.id).quantity;

export function build(stage, fmt) {
  const [year, month] = s.checkin.split('-').map(Number);
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--ctx" id="home" data-surface="deep" aria-label="Second Home">
      <p class="lx-eyebrow">Luxtory Club · Luxchange</p>
      <div>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">Second Home fictícia · ${s.secondHome.homeEdition}</p>
      </div>
      <p class="demo-note demo-only-16x9" id="home-route">${route}</p>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="cal" data-surface="deep" aria-label="Escolha das noites">
      ${calendarMonth(year, month, s.secondHome.name, period)}
      <div class="demo-summary" id="cal-summary">
        <span class="lx-ordinal">${nightsLabel}</span>
        <span class="demo-sub">${period} · ${hours}</span>
      </div>
      <p class="demo-note demo-only-9x16" id="cal-route">${route}</p>
      <button class="lx-button lx-button--primary demo-only-16x9" type="button" id="cal-next" tabindex="-1">Revisar Direct</button>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão do Direct">
      <p class="lx-eyebrow">Revisar Direct</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos consumidos na confirmação</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.credits)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Luxchange Fee</dt><dd class="lx-evidence__value">${brl(s.feeCents)} <span class="demo-tag">ilustrativo</span></dd><dd class="demo-hint">Pago antes da confirmação, em dinheiro, separado dos Créditos</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Aceite de outro Titular</dt><dd class="lx-evidence__value">Não exigido</dd></div>
        <div class="lx-evidence__item demo-only-16x9"><dt class="lx-evidence__label">PRL do período</dt><dd class="lx-evidence__value">${brl(s.prlPeriodCents)} <span class="demo-tag">fictício</span></dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável<span class="lx-check__note">Etapa conceitual. Sem política vigente, nada é confirmado.</span></span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar Fee e confirmar</span><span id="send-busy">Pagamento simulado</span></span></button>
      ${seal}
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-figure demo-only-16x9"><span class="lx-ordinal" id="cr-before">${credits(s.balances.before.available)}</span><span class="lx-ordinal" id="cr-after">${credits(s.balances.after.available)}</span></div>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-used"></span></div>
      <dl class="demo-legend">
        <div><dt>Disponíveis</dt><dd><span id="lg-avail-before">${credits(s.balances.before.available)}</span><span id="lg-avail-after">${credits(s.balances.after.available)}</span></dd></div>
        <div><dt>Nesta reserva</dt><dd><span id="lg-used-before">${credits(s.balances.before.consumed)}</span><span id="lg-used-after">${credits(s.balances.after.consumed)}</span></dd></div>
      </dl>
      <ul class="demo-lots demo-only-16x9" id="lots">
        <li class="demo-lots__head">Consumo na confirmação, pelos lotes que vencem primeiro</li>
        <li><span class="lx-meta">${lot.id}</span><span>${credits(consumed)} de ${credits(lot.available)}</span><span class="lx-meta">vence ${instant(lot.expiresAt).slice(0, 10)}</span></li>
      </ul>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="reval" data-surface="deep" aria-label="Revalidação">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Pagamento aprovado</p>
      <p class="lx-display-s">Confirmando a reserva</p>
      <p class="demo-note">${icon('i-info')}<span>O pagamento não reserva as noites: a confirmação só acontece depois da revalidação.</span></p>
      <ul class="demo-check-list">
        <li id="rv-1">${icon('i-check')}Noites ainda no Inventário Luxtory</li>
        <li id="rv-2">${icon('i-check')}Membership vigente</li>
        <li id="rv-3">${icon('i-check')}Créditos suficientes</li>
        <li id="rv-4">${icon('i-check')}Política aceita</li>
      </ul>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${period}</p>
        <p class="demo-sub">${s.secondHome.name} · ${nightsLabel} · ${hours}</p>
      </div>
      <p class="demo-sub">${s.booking.channel} · ${credits(s.credits)} Créditos consumidos · sem aceite de outro Titular</p>
      <span class="lx-meta">Confirmada · ${instant(s.booking.confirmedAt)}</span>
      ${seal}
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

const share = (part) => part / s.balances.before.available;

export function timeline(fmt) {
  const v = fmt === '9x16';
  // Ritmo direto: nenhuma espera por terceiro. Trocas no mesmo lugar só depois da saída de 280 ms.
  const calIn = v ? 1_500 : 800;
  const startAt = v ? 2_100 : 1_500;
  const endAt = startAt + 500;
  const reviewIn = 4_200;
  const reviewOut = 7_300;
  const revalIn = 7_600;
  const revalOut = 9_100;
  // Confirmação: a reserva nasce e os Créditos são consumidos no mesmo instante (BR-221).
  const confirmed = 9_400;
  const valueIn = confirmed + 280;
  return {
    duration: 14_000,
    enter: [
      { sel: '#home', in: 300, out: v ? 1_200 : 3_900 },
      { sel: '#cal', in: calIn, out: 3_900 },
      { sel: '#cal-summary', in: endAt + 300 },
      { sel: '#home-route', in: endAt + 700 },
      { sel: '#cal-route', in: endAt + 700 },
      { sel: '#review', in: reviewIn, out: reviewOut },
      { sel: '#send-label', in: ALWAYS, out: 6_600 },
      { sel: '#send-busy', in: 6_700, dur: 0 },
      { sel: '#credits', in: v ? confirmed : 4_500 },
      { sel: '#lots', in: 5_000 },
      { sel: '#cr-before', in: ALWAYS, out: confirmed },
      { sel: '#cr-after', in: valueIn },
      { sel: '#lg-avail-before', in: ALWAYS, out: confirmed },
      { sel: '#lg-avail-after', in: valueIn },
      { sel: '#lg-used-before', in: ALWAYS, out: confirmed },
      { sel: '#lg-used-after', in: valueIn },
      { sel: '#reval', in: revalIn, out: revalOut },
      { sel: '#rv-1', in: 7_900 },
      { sel: '#rv-2', in: 8_100 },
      { sel: '#rv-3', in: 8_300 },
      { sel: '#rv-4', in: 8_500 },
      { sel: '#booking', in: confirmed },
    ],
    set: [
      ...rangeSteps(s.nights, s.checkout, { startAt, endAt }),
      ...press('#cal-next', 3_300),
      { sel: '#policy', attr: 'checked', at: 5_900, value: true },
      ...press('#send', 6_500),
      { sel: '#send', attr: 'aria-busy', at: 6_600, value: 'true' },
      { sel: '#send', attr: 'aria-busy', at: reviewOut, value: null },
    ],
    tween: [
      {
        sel: '#bar-avail',
        prop: '--share',
        at: confirmed,
        from: 1,
        to: share(s.balances.after.available),
      },
      {
        sel: '#bar-used',
        prop: '--share',
        at: confirmed,
        from: 0,
        to: share(s.balances.after.consumed),
      },
    ],
    marks: [
      { at: 0, label: 'Direct · início (palco vazio)' },
      { at: startAt, label: 'toque · entrada 28/05' },
      { at: endAt, label: 'toque · saída 29/05' },
      {
        at: endAt + 700,
        label: 'rota: Inventário Luxtory → Luxchange Direct, sem aceite de outro Titular',
      },
      ...(v ? [] : [{ at: 3_300, label: 'toque · Revisar Direct' }]),
      { at: 5_900, label: 'toque · aceite da política (etapa conceitual)' },
      { at: 6_500, label: 'toque · Pagar Fee e confirmar' },
      { at: revalIn, label: 'pagamento aprovado · revalidação (o pagamento não reserva)' },
      { at: confirmed, label: 'Reserva Confirmada; Créditos consumidos no mesmo instante' },
      { at: 14_000, label: 'fim' },
    ],
  };
}

/** Pontos de verificação (check.mjs) e de captura (capture.mjs), nos dois formatos. */
export const qa = {
  checkpoints: [
    { t: 790, name: 'inicio', expect: [s.secondHome.name] },
    {
      t: 3_850,
      name: 'calendario',
      expect: [nightsLabel, 'Noites do Inventário Luxtory', 'Luxchange Direct'],
    },
    {
      t: 6_200,
      name: 'revisao',
      expect: [
        credits(s.credits),
        brl(s.feeCents),
        'ilustrativo',
        'Não exigido',
        'política comercial aplicável',
        'Etapa conceitual',
      ],
    },
    {
      t: 9_050,
      name: 'revalidacao',
      expect: [
        'Pagamento aprovado',
        'não reserva as noites',
        'Noites ainda no Inventário Luxtory',
        'Membership vigente',
        'Créditos suficientes',
      ],
    },
    {
      t: 11_500,
      name: 'confirmacao',
      expect: [
        'Reserva confirmada',
        period,
        `${s.booking.channel} · ${credits(s.credits)} Créditos consumidos`,
        `Confirmada · ${instant(s.booking.confirmedAt)}`,
        credits(s.balances.after.available),
      ],
    },
  ],
  calendar: {
    t: 3_850,
    range: Object.fromEntries([
      [s.nights[0], 'start'],
      ...s.nights.slice(1).map((d) => [d, 'night']),
      [s.checkout, 'end'],
    ]),
  },
  stills: { calendario: 3_850, revisao: 6_200, revalidacao: 9_050, confirmacao: 11_500 },
  alpha: { from: 6_400, seconds: 5 },
  sample: { card: '#booking', at: 11_000 },
  motion: { card: '#booking', at: 11_500, enter: [9_400, 9_880] },
  plates: { campo: 'public/images/home/kaizen/kaizen-k05.jpg' },
};
