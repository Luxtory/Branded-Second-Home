// Coreografia do Luxchange Direct (revisão de UX de 2026-11-15). Capacidade já no Inventário Luxtory: sem aceite de
// outro Titular (BR-220). Depois da escolha da estadia, o mesmo passo de Créditos da Request: aqui o saldo cobre a
// reserva (39.000 para 11.500), então a ação principal é continuar com o saldo, sem novo depósito; a complementação fica
// disponível, fechada. Taxa de intermediação paga antes da confirmação (TECH-082); o pagamento não reserva —
// revalidação e só então confirmação (ADR-008, TECH-080); Créditos consumidos na confirmação, por FEFO (BR-221, PD-008).
// Todo valor exibido vem de directScenario() (data.js → rules.js). Textos da demonstração, ainda não copy aprovada.
import { FICTITIOUS, directScenario } from './data.js';
import { brl, credits } from './format.js';
import {
  ALWAYS,
  ICONS,
  calendarMonth,
  hours,
  icon,
  periodOf,
  press,
  rangeSteps,
  swapIn,
} from './shared.js';
import { needCard } from './credits-step.js';
import { PLATES } from './placas-caminhos.js';

const s = directScenario();
const period = periodOf(s.checkin, s.checkout);
const nightsLabel = `${s.nights.length} ${s.nights.length === 1 ? 'noite' : 'noites'}`;
const route = `${icon('i-info')}<span><strong>Noites do Inventário Luxtory</strong>Reserva direta, sem aceite de outro Membro: Luxchange Direct.</span>`;

export function build(stage, fmt) {
  const [year, month] = s.checkin.split('-').map(Number);
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--ctx" id="home" data-surface="deep" aria-label="Second Home">
      <p class="lx-eyebrow">Luxtory Club · Luxchange</p>
      <div>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">${s.secondHome.region} · Second Home Luxtory</p>
      </div>
      <p class="demo-note demo-only-16x9" id="home-route">${route}</p>
    </section>

    <section class="demo-card demo-card--task" id="cal" data-surface="deep" aria-label="Escolha das noites">
      ${calendarMonth(year, month, s.secondHome.name, period)}
      <div class="demo-summary" id="cal-summary">
        <span class="lx-ordinal">${nightsLabel}</span>
        <span class="demo-sub">${period} · ${hours}</span>
      </div>
      <p class="demo-note demo-only-9x16" id="cal-route">${route}</p>
      <button class="lx-button lx-button--primary demo-only-16x9" type="button" id="cal-next" tabindex="-1">Continuar</button>
    </section>

    ${needCard({ title: `${s.secondHome.name} · ${period}`, needed: s.credits, available: s.balances.before.available, role: FICTITIOUS.requester.role, sufficient: true })}

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão do Direct">
      <p class="lx-eyebrow">Revisar Direct</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos utilizados na confirmação</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.credits)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Taxa de intermediação</dt><dd class="lx-evidence__value">${brl(s.feeCents)}</dd><dd class="demo-hint">Paga antes da confirmação, separada dos Créditos</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Aceite de outro Membro</dt><dd class="lx-evidence__value">Não exigido</dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável</span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar taxa e confirmar</span><span id="send-busy">Processando pagamento</span></span></button>
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-figure demo-only-16x9"><span class="lx-ordinal" id="cr-before">${credits(s.balances.before.available)}</span><span class="lx-ordinal" id="cr-after">${credits(s.balances.after.available)}</span></div>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-used"></span></div>
      <dl class="demo-legend">
        <div><dt>Disponíveis</dt><dd><span id="lg-avail-before">${credits(s.balances.before.available)}</span><span id="lg-avail-after">${credits(s.balances.after.available)}</span></dd></div>
        <div><dt>Nesta reserva</dt><dd><span id="lg-used-before">${credits(s.balances.before.consumed)}</span><span id="lg-used-after">${credits(s.balances.after.consumed)}</span></dd></div>
      </dl>
      <p class="demo-sub demo-only-16x9" id="lots">Utilizados só na confirmação.</p>
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
    </section>

    <section class="demo-card demo-card--task" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${period}</p>
        <p class="demo-sub">${s.secondHome.name} · ${nightsLabel} · ${hours}</p>
      </div>
      <p class="demo-sub">${s.booking.channel} · ${credits(s.credits)} Créditos utilizados · sem aceite de outro Membro</p>
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
  // Créditos × saldo: saldo suficiente, continuar sem novo depósito (a complementação fica fechada).
  const needIn = 4_200;
  const continueAt = 6_100;
  const needOut = 6_600;
  const reviewIn = 6_900;
  const reviewOut = 10_000;
  const revalIn = 10_300;
  const revalOut = 11_800;
  // Confirmação: a reserva nasce e os Créditos são consumidos no mesmo instante (BR-221).
  const confirmed = 12_100;
  const valueIn = confirmed + 280;
  return {
    duration: 16_700,
    enter: [
      { sel: '#home', in: 300, out: v ? 1_200 : needOut },
      { sel: '#cal', in: calIn, out: 3_900 },
      { sel: '#cal-summary', in: endAt + 300 },
      { sel: '#home-route', in: endAt + 700 },
      { sel: '#cal-route', in: endAt + 700 },
      { sel: '#need', in: needIn, out: needOut },
      { sel: '#review', in: reviewIn, out: reviewOut },
      { sel: '#send-label', in: ALWAYS, out: 9_300 },
      { sel: '#send-busy', in: swapIn(9_300), dur: 0 },
      { sel: '#credits', in: v ? confirmed : reviewIn },
      { sel: '#lots', in: reviewIn + 500 },
      { sel: '#cr-before', in: ALWAYS, out: confirmed },
      { sel: '#cr-after', in: valueIn },
      { sel: '#lg-avail-before', in: ALWAYS, out: confirmed },
      { sel: '#lg-avail-after', in: valueIn },
      { sel: '#lg-used-before', in: ALWAYS, out: confirmed },
      { sel: '#lg-used-after', in: valueIn },
      { sel: '#reval', in: revalIn, out: revalOut },
      { sel: '#rv-1', in: revalIn + 300 },
      { sel: '#rv-2', in: revalIn + 500 },
      { sel: '#rv-3', in: revalIn + 700 },
      { sel: '#rv-4', in: revalIn + 900 },
      { sel: '#booking', in: confirmed },
    ],
    set: [
      ...rangeSteps(s.nights, s.checkout, { startAt, endAt }),
      ...press('#cal-next', 3_300),
      ...press('#need-continue', continueAt),
      { sel: '#policy', attr: 'checked', at: 8_600, value: true },
      ...press('#send', 9_200),
      { sel: '#send', attr: 'aria-busy', at: 9_300, value: 'true' },
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
        label: 'rota: Inventário Luxtory → Luxchange Direct, sem aceite de outro Membro',
      },
      ...(v ? [] : [{ at: 3_300, label: 'toque · Continuar' }]),
      { at: needIn, label: 'Créditos necessários 11.500 × saldo 39.000: saldo suficiente' },
      { at: continueAt, label: 'toque · Continuar com meu saldo (sem novo depósito)' },
      { at: 8_600, label: 'toque · aceite da política' },
      { at: 9_200, label: 'toque · Pagar taxa e confirmar' },
      { at: revalIn, label: 'pagamento aprovado · revalidação (o pagamento não reserva)' },
      { at: confirmed, label: 'Reserva Confirmada; Créditos consumidos no mesmo instante' },
      { at: 16_700, label: 'fim' },
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
      t: 5_600,
      name: 'creditos',
      expect: [
        credits(s.credits),
        credits(s.balances.before.available),
        'Saldo suficiente',
        'Continuar com meu saldo',
        'Complementar saldo com datas do meu Direito de Uso',
      ],
      absent: ['Créditos adicionais necessários'],
    },
    {
      t: 8_900,
      name: 'revisao',
      expect: [
        credits(s.credits),
        'Taxa de intermediação',
        brl(s.feeCents),
        'Não exigido',
        'política comercial aplicável',
      ],
    },
    {
      t: 11_750,
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
      t: 14_200,
      name: 'confirmacao',
      expect: [
        'Reserva confirmada',
        period,
        `${s.booking.channel} · ${credits(s.credits)} Créditos utilizados`,
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
  stills: {
    calendario: 3_850,
    creditos: 5_600,
    revisao: 8_900,
    revalidacao: 11_750,
    confirmacao: 14_200,
  },
  alpha: { from: 9_100, seconds: 5 },
  sample: { card: '#booking', at: 13_700 },
  motion: { card: '#booking', at: 14_200, enter: [12_100, 12_580] },
  // Placa interna de teste da Olivar Home (campo neutro de tarde; placas.mjs): não representa o imóvel final.
  plates: { claro: PLATES.olivarTarde },
};
