// Coreografia da Luxchange Request (revisão de UX de 2026-11-15): escolha da estadia → Créditos necessários × saldo →
// complementação opcional por depósito de datas elegíveis (controle + calendário do Direito de Uso) → depósito
// confirmado → revisão → Taxa de intermediação → pagamento e envio → Garantia (só no envio) → aceite expresso do
// Titular detentor → revalidação → Request Aceita + Reserva Confirmada na mesma operação (REQ-064).
// Todo valor exibido vem de requestScenario() e depositScenario() (data.js → rules.js). A capacidade pedida não fica
// bloqueada enquanto a Request está pendente (PD-005). Textos da demonstração, ainda não copy aprovada.
import { FICTITIOUS, depositScenario, requestScenario } from './data.js';
import { brl, credits } from './format.js';
import { ALWAYS, ICONS, calendarMonth, hours, icon, periodOf, press } from './shared.js';
import {
  datesCard,
  depositedCard,
  monthNavigation,
  needCard,
  selectionChoreography,
  selectionStates,
  topupCard,
} from './credits-step.js';

const s = requestScenario();
const dep = depositScenario();
const period = periodOf(s.checkin, s.checkout);
const route = `${icon('i-info')}<span><strong>Noites de outro Titular</strong>A reserva depende do aceite dele: Luxchange Request.</span>`;
// Etapas da seleção (fonte única: as datas). Primeiro o controle vai à primeira meta (14/05, 16.000); depois os toques
// em 15/05 e 16/05 levam o controle a 32.000 e 46.000 — metas alcançáveis, nunca fração de data.
const [d14, d15, d16] = dep.eligible.map((d) => d.night);
const SELECTION = [[d14], [d14, d15], [d14, d15, d16]];

// Lotes sem códigos internos: origem e quantidade, na ordem de consumo (PD-008). Antes do envio, a composição do saldo
// (anteriores + novo depósito); no envio, a parcela de cada lote que fica em Garantia.
const originOf = (lot) =>
  lot.id === FICTITIOUS.deposit.lotId ? 'Novo depósito' : 'Créditos anteriores';
const lotRows = s.lots.map(
  (lot) => `<li><span>${originOf(lot)}</span><span>${credits(lot.quantity)}</span></li>`,
);
const holdRows = s.hold.map((part) => {
  const lot = s.lots.find((l) => l.id === part.lotId);
  const origin = originOf(lot);
  const amount =
    part.quantity === lot.quantity
      ? credits(part.quantity)
      : `${credits(part.quantity)} de ${credits(lot.quantity)}`;
  return `<li><span>${origin}</span><span>${amount}</span></li>`;
});

export function build(stage, fmt) {
  const [year, month] = s.checkin.split('-').map(Number);
  const states = selectionStates(dep, [[], ...SELECTION], s.credits);
  stage.insertAdjacentHTML(
    'beforeend',
    `${ICONS}
    <section class="demo-card demo-card--ctx" id="home" data-surface="deep" aria-label="Second Home">
      <p class="lx-eyebrow">Luxtory Club · Luxchange</p>
      <div>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">${s.secondHome.homeEdition}</p>
      </div>
      <p class="demo-note demo-only-16x9" id="home-route">${route}</p>
    </section>

    <section class="demo-card demo-card--task" id="cal" data-surface="deep" aria-label="Escolha das noites">
      ${calendarMonth(year, month, s.secondHome.name, period)}
      <div class="demo-summary" id="cal-summary">
        <span class="lx-ordinal">${s.nights.length} noites</span>
        <span class="demo-sub">${period} · ${hours}</span>
      </div>
      <p class="demo-note demo-only-9x16" id="cal-route">${route}</p>
      <button class="lx-button lx-button--primary demo-only-16x9" type="button" id="cal-next" tabindex="-1">Continuar</button>
    </section>

    ${needCard({ title: `${s.secondHome.name} · ${period}`, needed: s.credits, available: dep.priorAvailable, role: dep.role, sufficient: false })}
    ${topupCard(dep, states)}
    ${datesCard(dep, states, { action: 'Depositar datas e gerar Créditos' })}
    ${depositedCard(dep, { next: 'Revisar Request' })}

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão da Request">
      <p class="lx-eyebrow">Revisar Request</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos necessários</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.credits)}</dd><dd class="demo-hint">Reservados no envio; consumidos só com o aceite</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Taxa de intermediação</dt><dd class="lx-evidence__value">${brl(s.feeCents)}</dd><dd class="demo-hint">Paga no envio, separada dos Créditos</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Prazo para o aceite</dt><dd class="lx-evidence__value">24 horas</dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável</span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar taxa e enviar</span><span id="send-busy">Processando pagamento</span></span></button>
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-figure demo-only-16x9"><span class="lx-ordinal" id="cr-before">${credits(s.balances.beforeSend.available)}</span><span class="lx-ordinal" id="cr-after">${credits(s.balances.afterSend.available)}</span></div>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-held"></span></div>
      <dl class="demo-legend">
        <div><dt>Disponíveis</dt><dd><span id="lg-avail-before">${credits(s.balances.beforeSend.available)}</span><span id="lg-avail-after">${credits(s.balances.afterSend.available)}</span></dd></div>
        <div id="lg-held"><dt>Em Garantia</dt><dd>${credits(s.balances.afterSend.held)}</dd></div>
      </dl>
      <div class="demo-swap demo-only-16x9">
        <ul class="demo-lots" id="lots-before">
          <li class="demo-lots__head">Seu saldo, do lote que vence primeiro</li>
          ${lotRows.join('')}
        </ul>
        <ul class="demo-lots" id="lots">
          <li class="demo-lots__head">Garantia pelos lotes que vencem primeiro</li>
          ${holdRows.join('')}
        </ul>
      </div>
    </section>

    <section class="demo-card demo-card--task" id="pending" data-surface="deep" aria-label="Request pendente">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Pendente</p>
      <p class="lx-display-s">Request enviada</p>
      <p class="demo-note">${icon('i-info')}<span>As noites não ficam bloqueadas enquanto a Request está pendente. A reserva só se confirma com o aceite e a revalidação.</span></p>
      <p class="demo-sub">O Titular tem até 24 horas para responder. Sem aceite, a Taxa de intermediação é devolvida e a Garantia é liberada.</p>
    </section>

    <section class="demo-card demo-card--task" id="holder" data-surface="deep" aria-label="Request recebida pelo Titular detentor">
      <p class="lx-eyebrow">Visão do Titular detentor · Co-Owner</p>
      <p class="lx-display-s">Request recebida</p>
      <p class="demo-sub">${s.secondHome.name} · ${period} · ${s.nights.length} noites da reserva de uso próprio desta Ação</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos para esta Ação</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.holder.lot.quantity)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Prazo para responder</dt><dd class="lx-evidence__value">24 horas</dd></div>
      </dl>
      <p class="demo-sub">Ao aceitar, as noites são cedidas e seguem consumidas do Direito de Uso desta Ação.</p>
      <div class="demo-swap">
        <div class="demo-actions" id="holder-actions">
          <button class="lx-button lx-button--primary" type="button" id="accept" tabindex="-1">Aceitar</button>
          <button class="lx-button lx-button--secondary" type="button" tabindex="-1">Recusar</button>
        </div>
        <div id="reval">
          <p class="lx-label">Revalidando antes de confirmar</p>
          <ul class="demo-check-list">
            <li id="rv-1">${icon('i-check')}Noites ainda elegíveis</li>
            <li id="rv-2">${icon('i-check')}Membership dos dois Titulares</li>
            <li id="rv-3">${icon('i-check')}Créditos em Garantia</li>
            <li id="rv-4">${icon('i-check')}Request dentro do prazo</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="demo-card demo-card--task" id="accepted" data-surface="deep" aria-label="Request aceita">
      <p class="lx-eyebrow">Visão do Titular detentor · Co-Owner</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Request aceita</p>
      <p><span class="lx-ordinal">${credits(s.holder.lot.quantity)}</span> <span class="demo-sub">Créditos para esta Ação, válidos por 24 meses</span></p>
    </section>

    <section class="demo-card demo-card--ctx" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="lx-eyebrow">Visão de quem solicitou</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${period}</p>
        <p class="demo-sub">${s.secondHome.name} · ${s.nights.length} noites · ${hours}</p>
      </div>
      <p class="demo-sub">${s.booking.channel} · ${credits(s.balances.afterAccept.consumed)} Créditos consumidos da Garantia, no momento do aceite</p>
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

const share = (part) => part / s.balances.beforeSend.available;

/** Instantes de cada formato. Depois do depósito confirmado, os dois formatos seguem juntos. */
export function times(fmt) {
  const v = fmt === '9x16';
  return {
    v,
    calIn: v ? 1_800 : 1_100,
    needIn: 5_800,
    topupPress: 8_200,
    stepOut: 8_600,
    topupIn: 8_900,
    // 16:9: controle e calendário lado a lado. 9:16: um cartão por vez — controle, depois calendário.
    slider: v ? 9_900 : 11_300,
    topupOut: v ? 11_400 : 15_700,
    datesIn: v ? 11_700 : 8_900,
    nav: v ? 12_400 : 10_000,
    taps: v ? [13_500, 14_100] : [12_900, 13_700],
    depositPress: 14_900,
    depositOut: 15_700,
    depositedIn: 16_000,
    reviewPress: 17_900,
    reviewOut: 18_300,
    reviewIn: 18_600,
    policy: 19_600,
    pay: 20_800,
    sendOut: 22_200,
    // Commit do envio: a Request aparece Pendente e a Garantia é constituída no mesmo instante (PD-005, PD-006).
    sendCommit: 22_500,
    pendingOut: 26_500,
    holderIn: 26_900,
    accept: 29_300,
    holderOut: 31_100,
    // Aceite válido: o cartão do detentor sai e, na mesma operação, entram Request Aceita e Reserva Confirmada.
    result: 31_400,
    duration: 35_000,
  };
}

export function timeline(fmt) {
  const t = times(fmt);
  const { v } = t;
  const tween = 900; // duration.cinematic (stage.js MOTION.tween)
  const selection = selectionChoreography(
    dep,
    [
      { at: t.slider, nights: SELECTION[0], via: 'slider' },
      { at: t.taps[0], nights: SELECTION[1], via: 'calendar' },
      { at: t.taps[1], nights: SELECTION[2], via: 'calendar' },
    ],
    { tween, needed: s.credits },
  );
  const nav = monthNavigation(dep, t.nav);
  const valueIn = t.sendCommit + 280;
  return {
    duration: t.duration,
    enter: [
      // Escolha da estadia
      { sel: '#home', in: 400, out: v ? 1_500 : t.stepOut },
      { sel: '#cal', in: t.calIn, out: 5_500 },
      { sel: '#cal-summary', in: 3_700 },
      { sel: '#home-route', in: 4_200 },
      { sel: '#cal-route', in: 4_200 },
      // Créditos necessários × saldo: uma decisão (complementar)
      { sel: '#need', in: t.needIn, out: t.stepOut },
      // Complementação: controle e calendário, sincronizados
      { sel: '#topup', in: t.topupIn, out: t.topupOut },
      { sel: '#dates', in: t.datesIn, out: t.depositOut },
      ...nav.enter,
      ...selection.enter,
      { sel: '#deposit-label', in: ALWAYS, out: t.depositPress + 100 },
      { sel: '#deposit-busy', in: t.depositPress + 200, dur: 0 },
      // Depósito confirmado (operação própria) e, no 16:9, o saldo de Créditos ao lado
      { sel: '#deposited', in: t.depositedIn, out: t.reviewOut },
      { sel: '#credits', in: v ? t.sendCommit : t.depositedIn, out: t.pendingOut },
      // Revisão, Taxa de intermediação, pagamento e envio
      { sel: '#review', in: t.reviewIn, out: t.sendOut },
      { sel: '#send-label', in: ALWAYS, out: t.pay + 100 },
      { sel: '#send-busy', in: t.pay + 200, dur: 0 },
      // Garantia só no envio
      { sel: '#lots-before', in: ALWAYS, out: t.sendCommit },
      { sel: '#lots', in: t.sendCommit + 280 },
      { sel: '#lg-held', in: valueIn },
      { sel: '#cr-before', in: ALWAYS, out: t.sendCommit },
      { sel: '#cr-after', in: valueIn },
      { sel: '#lg-avail-before', in: ALWAYS, out: t.sendCommit },
      { sel: '#lg-avail-after', in: valueIn },
      { sel: '#pending', in: t.sendCommit, out: t.pendingOut },
      // Aceite do detentor, revalidação e, na mesma operação, Request Aceita + Reserva Confirmada
      { sel: '#holder', in: t.holderIn, out: t.holderOut },
      { sel: '#holder-actions', in: ALWAYS, out: t.accept + 100 },
      { sel: '#reval', in: t.accept + 300 },
      { sel: '#rv-1', in: t.accept + 400 },
      { sel: '#rv-2', in: t.accept + 600 },
      { sel: '#rv-3', in: t.accept + 800 },
      { sel: '#rv-4', in: t.accept + 1_000 },
      { sel: '#accepted', in: t.result },
      { sel: '#booking', in: t.result },
    ],
    set: [
      { sel: '[data-day="2027-06-04"]', attr: 'data-range', at: 2_400, value: 'start' },
      { sel: '[data-day="2027-06-05"]', attr: 'data-range', at: 3_100, value: 'night' },
      { sel: '[data-day="2027-06-06"]', attr: 'data-range', at: 3_180, value: 'night' },
      { sel: '[data-day="2027-06-07"]', attr: 'data-range', at: 3_260, value: 'end' },
      ...press('#cal-next', 5_200),
      ...press('#need-topup', t.topupPress),
      ...nav.set,
      ...selection.set,
      ...press('#deposit-go', t.depositPress),
      { sel: '#deposit-go', attr: 'aria-busy', at: t.depositPress + 100, value: 'true' },
      { sel: '#deposit-go', attr: 'aria-busy', at: t.depositOut, value: null },
      ...press('#deposited-next', t.reviewPress),
      { sel: '#policy', attr: 'checked', at: t.policy, value: true },
      ...press('#send', t.pay),
      { sel: '#send', attr: 'aria-busy', at: t.pay + 100, value: 'true' },
      { sel: '#send', attr: 'aria-busy', at: t.sendOut, value: null },
      ...press('#accept', t.accept),
    ],
    tween: [
      ...selection.tween,
      {
        sel: '#bar-avail',
        prop: '--share',
        at: t.sendCommit,
        from: 1,
        to: share(s.balances.afterSend.available),
      },
      {
        sel: '#bar-held',
        prop: '--share',
        at: t.sendCommit,
        from: 0,
        to: share(s.balances.afterSend.held),
      },
    ],
    marks: [
      { at: 0, label: 'Request · início (palco vazio)' },
      { at: 2_400, label: 'toque · entrada 04/06' },
      { at: 3_100, label: 'toque · saída 07/06' },
      { at: 4_200, label: 'rota: noites de outro Titular → Luxchange Request' },
      ...(v ? [] : [{ at: 5_200, label: 'toque · Continuar' }]),
      { at: t.needIn, label: 'Créditos necessários 55.000 × saldo 48.000: faltam 7.000' },
      { at: t.topupPress, label: 'toque · Complementar saldo (datas do meu Direito de Uso)' },
      { at: t.nav, label: 'toque · próximo mês (abril → maio)' },
      { at: t.slider, label: 'controle · Créditos adicionais desejados → 16.000 (14/05)' },
      { at: t.taps[0], label: 'toque · 15/05 → 32.000' },
      { at: t.taps[1], label: 'toque · 16/05 → 46.000 (saldo projetado 94.000)' },
      { at: t.depositPress, label: 'toque · Depositar datas e gerar Créditos' },
      { at: t.depositedIn, label: 'depósito confirmado: 46.000 novos Créditos · saldo 94.000' },
      { at: t.reviewPress, label: 'toque · Revisar Request' },
      { at: t.policy, label: 'toque · aceite da política' },
      { at: t.pay, label: 'toque · Pagar taxa e enviar' },
      { at: t.sendCommit, label: 'Request Pendente; Garantia constituída (55.000)' },
      {
        at: t.holderIn - 400,
        label: 'corte sugerido · o outro Titular recebe a solicitação',
      },
      { at: t.accept, label: 'toque · Aceitar (Titular detentor)' },
      {
        at: t.result,
        label: 'aceite válido: Request Aceita + Reserva Confirmada (mesma operação)',
      },
      { at: t.duration, label: 'fim' },
    ].sort((a, b) => a.at - b.at),
  };
}

/** Pontos de verificação (check.mjs) e de captura (capture.mjs), nos dois formatos. */
const T = times('16x9');
export const qa = {
  checkpoints: [
    { t: 1_000, name: 'inicio', expect: [s.secondHome.name] },
    {
      t: 4_800,
      name: 'calendario',
      expect: ['3 noites', 'Noites de outro Titular', 'Luxchange Request'],
    },
    {
      t: 7_600,
      name: 'creditos',
      expect: [
        'Créditos necessários',
        credits(s.credits),
        'Saldo válido disponível',
        credits(dep.priorAvailable),
        credits(dep.shortfall),
        'Complementar saldo',
        'datas elegíveis do meu Direito de Uso',
      ],
      absent: ['Em Garantia'],
    },
    {
      t: 14_880,
      name: 'complemento',
      expect: [
        credits(dep.originated),
        credits(dep.afterDeposit),
        'Depositar datas e gerar Créditos',
      ],
      absent: ['Em Garantia'],
    },
    {
      t: 17_200,
      name: 'deposito',
      expect: ['Depósito confirmado', credits(dep.originated), credits(dep.afterDeposit)],
      absent: ['Em Garantia'],
    },
    {
      t: 20_400,
      name: 'revisao',
      expect: [credits(s.credits), 'Taxa de intermediação', brl(s.feeCents), '24 horas'],
      absent: ['Em Garantia'],
    },
    {
      t: 24_600,
      name: 'pendente',
      expect: [
        'Pendente',
        'não ficam bloqueadas',
        credits(s.balances.afterSend.available),
        credits(s.balances.afterSend.held),
        'Em Garantia',
      ],
    },
    {
      t: 28_300,
      name: 'recebida',
      expect: ['Request recebida', 'Co-Owner', 'seguem consumidas do Direito de Uso'],
    },
    {
      t: 30_900,
      name: 'revalidacao',
      expect: [
        'Revalidando antes de confirmar',
        'Membership dos dois Titulares',
        'Créditos em Garantia',
      ],
    },
    {
      t: 33_000,
      name: 'confirmacao',
      expect: [
        'Request aceita',
        'Reserva confirmada',
        'no momento do aceite',
        credits(s.balances.afterAccept.consumed),
      ],
    },
  ],
  calendar: {
    t: 4_800,
    range: Object.fromEntries([
      [s.nights[0], 'start'],
      ...s.nights.slice(1).map((d) => [d, 'night']),
      [s.checkout, 'end'],
    ]),
  },
  // Seleção esperada no calendário do depósito, ao fim da complementação (fonte única: as datas).
  deposit: { t: 14_880, selected: dep.selected },
  stills: {
    calendario: 4_800,
    creditos: 7_600,
    complemento: 14_880,
    deposito: 17_200,
    revisao: 20_400,
    pendente: 24_600,
    revalidacao: 30_900,
    confirmacao: 33_000,
  },
  // Trecho do aceite: toque em Aceitar, revalidação, saída do cartão e Request Aceita + Reserva Confirmada.
  alpha: { from: T.accept - 200, seconds: 4 },
  sample: { card: '#accepted', at: 33_000 },
  edge: { card: '#booking', at: 33_000 },
  motion: { card: '#holder', at: 28_300, enter: [T.holderIn, T.holderIn + 480] },
  plates: {
    claro: 'public/images/home/hero/hero-lifestyle.jpg',
    escuro: 'public/images/home/hero/luxury-property-facade-hero.jpg',
  },
};
