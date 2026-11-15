// Coreografia do Luxplus (linguagem harmonizada na revisão comercial de 2026-11-15). Noites adicionais do Inventário Luxtory pagas em dinheiro
// (01 §25, BR-240): Membership elegível; sem consumo de Créditos (BR-241); sem Luxchange Fee (BR-230 só alcança Request e
// Direct); política aceita antes da confirmação (PD-009); pagamento não reserva — revalidação e confirmação (TECH-080).
// Preço canônico com referência no PRL (BR-243, REQ-070: PRL × (1 − desconto aplicável), congelado na compra); como o
// desconto não está publicado (BR-244, P-5), a tela mostra só um valor ilustrativo da estadia, sem PRL nem desconto.
// Textos da demonstração, não copy aprovada.
import { luxplusScenario } from './data.js';
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
} from './shared.js';

const s = luxplusScenario();
const period = periodOf(s.checkin, s.checkout);
const nightsLabel = `${s.nights.length} ${s.nights.length === 1 ? 'noite' : 'noites'}`;
const route = `${icon('i-info')}<span><strong>Noites adicionais do Inventário Luxtory</strong>Pagas em dinheiro, sem usar Créditos: Luxplus.</span>`;

export function build(stage, fmt) {
  const [year, month] = s.checkin.split('-').map(Number);
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--ctx" id="home" data-surface="deep" aria-label="Second Home">
      <p class="lx-eyebrow">Luxtory Club · Luxplus</p>
      <div>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">${s.secondHome.homeEdition}</p>
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
      <button class="lx-button lx-button--primary demo-only-16x9" type="button" id="cal-next" tabindex="-1">Revisar Luxplus</button>
    </section>

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão do Luxplus">
      <p class="lx-eyebrow">Revisar Luxplus</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Valor da estadia</dt><dd class="lx-evidence__value lx-evidence__value--strong">${brl(s.stayValueCents)}</dd><dd class="demo-hint">Pago em dinheiro</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos Luxchange</dt><dd class="lx-evidence__value">Não utilizados</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Membership</dt><dd class="lx-evidence__value">Vigente</dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável</span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar e confirmar</span><span id="send-busy">Processando pagamento</span></span></button>
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-figure demo-only-16x9"><span class="lx-ordinal">${credits(s.credits.available)}</span></div>
      <dl class="demo-legend">
        <div><dt>Disponíveis</dt><dd><span>${credits(s.credits.available)}</span></dd></div>
        <div><dt>Usados no Luxplus</dt><dd><span>${credits(s.credits.used)}</span></dd></div>
      </dl>
      <p class="demo-note">${icon('i-info')}<span>O Luxplus não usa Créditos: o saldo continua o mesmo.</span></p>
    </section>

    <section class="demo-card demo-card--task" id="reval" data-surface="deep" aria-label="Revalidação">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Pagamento aprovado</p>
      <p class="lx-display-s">Confirmando a reserva</p>
      <p class="demo-note">${icon('i-info')}<span>O pagamento não reserva as noites: a confirmação só acontece depois da revalidação.</span></p>
      <ul class="demo-check-list">
        <li id="rv-1">${icon('i-check')}Noites ainda no Inventário Luxtory</li>
        <li id="rv-2">${icon('i-check')}Membership vigente</li>
        <li id="rv-3">${icon('i-check')}Política aceita</li>
      </ul>
    </section>

    <section class="demo-card demo-card--task" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="lx-eyebrow">Noites adicionais</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${period}</p>
        <p class="demo-sub">${s.secondHome.name} · ${nightsLabel} · ${hours}</p>
      </div>
      <p class="demo-sub">${s.booking.channel} · Créditos inalterados</p>
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

export function timeline(fmt) {
  const v = fmt === '9x16';
  // Ritmo contemplativo: mais tempo na escolha e na estadia confirmada. Trocas no mesmo lugar só após a saída (280 ms).
  const calIn = v ? 1_700 : 1_000;
  const startAt = v ? 2_400 : 1_900;
  const endAt = startAt + 700;
  const reviewIn = 4_900;
  const reviewOut = 8_600;
  const revalIn = 8_900;
  const revalOut = 10_400;
  const confirmed = 10_700;
  return {
    duration: 15_500,
    enter: [
      { sel: '#home', in: 400, out: v ? 1_400 : 4_600 },
      { sel: '#cal', in: calIn, out: 4_600 },
      { sel: '#cal-summary', in: endAt + 400 },
      { sel: '#home-route', in: endAt + 900 },
      { sel: '#cal-route', in: endAt + 900 },
      { sel: '#review', in: reviewIn, out: reviewOut },
      { sel: '#send-label', in: ALWAYS, out: 7_700 },
      { sel: '#send-busy', in: 7_800, dur: 0 },
      { sel: '#credits', in: v ? confirmed : 5_300 },
      { sel: '#reval', in: revalIn, out: revalOut },
      { sel: '#rv-1', in: 9_200 },
      { sel: '#rv-2', in: 9_400 },
      { sel: '#rv-3', in: 9_600 },
      { sel: '#booking', in: confirmed },
    ],
    set: [
      ...rangeSteps(s.nights, s.checkout, { startAt, endAt }),
      ...press('#cal-next', 4_100),
      { sel: '#policy', attr: 'checked', at: 6_800, value: true },
      ...press('#send', 7_600),
      { sel: '#send', attr: 'aria-busy', at: 7_700, value: 'true' },
      { sel: '#send', attr: 'aria-busy', at: reviewOut, value: null },
    ],
    tween: [],
    marks: [
      { at: 0, label: 'Luxplus · início (palco vazio)' },
      { at: startAt, label: 'toque · entrada 13/08' },
      { at: endAt, label: 'toque · saída 15/08' },
      {
        at: endAt + 900,
        label: 'rota: noites adicionais do Inventário Luxtory, em dinheiro → Luxplus',
      },
      ...(v ? [] : [{ at: 4_100, label: 'toque · Revisar Luxplus' }]),
      { at: 6_800, label: 'toque · aceite da política' },
      { at: 7_600, label: 'toque · Pagar e confirmar' },
      { at: revalIn, label: 'pagamento aprovado · revalidação (o pagamento não reserva)' },
      { at: confirmed, label: 'Reserva Confirmada; Créditos inalterados' },
      { at: 15_500, label: 'fim' },
    ],
  };
}

/** Pontos de verificação (check.mjs) e de captura (capture.mjs), nos dois formatos. */
export const qa = {
  checkpoints: [
    { t: 900, name: 'inicio', expect: [s.secondHome.name] },
    {
      t: 4_520,
      name: 'calendario',
      expect: [nightsLabel, 'Noites adicionais do Inventário Luxtory', 'sem usar Créditos'],
    },
    {
      t: 7_200,
      name: 'revisao',
      expect: [
        brl(s.stayValueCents),
        'Pago em dinheiro',
        'Não utilizados',
        'Vigente',
        'política comercial aplicável',
      ],
    },
    {
      t: 10_300,
      name: 'revalidacao',
      expect: [
        'Pagamento aprovado',
        'não reserva as noites',
        'Noites ainda no Inventário Luxtory',
        'Membership vigente',
        'Política aceita',
      ],
    },
    {
      t: 12_500,
      name: 'confirmacao',
      expect: [
        'Reserva confirmada',
        period,
        'Luxplus · Créditos inalterados',
        credits(s.credits.available),
        'O Luxplus não usa Créditos',
      ],
    },
  ],
  calendar: {
    t: 4_520,
    range: Object.fromEntries([
      [s.nights[0], 'start'],
      ...s.nights.slice(1).map((d) => [d, 'night']),
      [s.checkout, 'end'],
    ]),
  },
  stills: { calendario: 4_520, revisao: 7_200, revalidacao: 10_300, confirmacao: 12_500 },
  alpha: { from: 7_400, seconds: 5 },
  sample: { card: '#booking', at: 12_000 },
  motion: { card: '#booking', at: 12_500, enter: [10_700, 11_180] },
  // Placa de teste de legibilidade (não representa Pátio · Campo; PRODUCAO.md §2.1).
  plates: { escuro: 'public/images/home/hero/luxury-property-facade-hero.jpg' },
};
