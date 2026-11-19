// Coreografia da Luxchange Request (revisão de UX de 2026-11-15): escolha da estadia → Créditos necessários × saldo →
// complementação opcional por depósito de datas elegíveis (controle + calendário do Direito de Uso) → depósito
// confirmado → revisão → Taxa de intermediação → pagamento e envio → Garantia (só no envio) → aceite expresso do
// membro que recebe a solicitação → revalidação → solicitação aceita + reserva confirmada na mesma operação (REQ-064).
// Todo valor exibido vem de requestScenario() e depositScenario() (data.js → rules.js). A capacidade pedida não fica
// bloqueada enquanto a Request está pendente (PD-005).
// Copy do filme (direção final, 2026-11-19): "Membro" na comunicação (quem solicita / quem recebe), sem Owner, Co-Owner
// nem Ação; saldo e Garantia em dois indicadores e uma frase (os lotes e o FEFO continuam em rules.js e data.js, fora
// da tela). Papéis e regras do domínio não mudam: quem recebe é Co-Owner em data.js, e as noites cedidas são do Direito
// de Uso já reservado (BR-151, PD-007).
import { depositScenario, requestScenario } from './data.js';
import { selectionForTarget } from './rules.js';
import { PLATES } from './placas-caminhos.js';
import { brl, credits } from './format.js';
import {
  ALWAYS,
  ICONS,
  calendarMonth,
  hours,
  icon,
  periodCompact,
  periodOf,
  press,
  swapIn,
} from './shared.js';
import {
  datesCard,
  depositedCard,
  openingMonth,
  needCard,
  selectionChoreography,
  selectionStates,
  topupCard,
} from './credits-step.js';

const s = requestScenario();
const dep = depositScenario();
const period = periodOf(s.checkin, s.checkout);
const periodShort = periodCompact(s.checkin, s.checkout);
const route = `${icon('i-info')}<span><strong>Noites reservadas por outro Membro</strong>A reserva depende do aceite: Luxchange Request.</span>`;
// Etapas da seleção (fonte única: as datas). O controle vai ao mínimo que cobre o que falta (14.000: a sugestão para essa
// meta é 16/05); depois Helena escolhe no calendário 14/05 (30.000) e 15/05 (46.000) para manter Créditos para as
// próximas experiências. Todas são metas alcançáveis com datas inteiras (rules.js#depositStops).
const [d14, d15, d16] = dep.eligible.map((d) => d.night);
const SELECTION = [
  selectionForTarget(dep.eligible, dep.minimum.credits),
  [d14, ...selectionForTarget(dep.eligible, dep.minimum.credits)].sort(),
  [d14, d15, d16],
];

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
        <p class="demo-sub">${s.secondHome.region} · Second Home Luxtory</p>
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
    ${depositedCard(dep, { next: 'Revisar solicitação' })}

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão da solicitação">
      <p class="lx-eyebrow">Revisar solicitação</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos necessários</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.credits)}</dd><dd class="demo-hint">Garantia constituída no envio; utilizados só com o aceite</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Taxa de intermediação</dt><dd class="lx-evidence__value">${brl(s.feeCents)}</dd><dd class="demo-hint">Paga no envio, separada dos Créditos</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Prazo para o aceite</dt><dd class="lx-evidence__value">24 horas</dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável</span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar taxa e enviar</span><span id="send-busy">Processando pagamento</span></span></button>
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-held"></span></div>
      <dl class="demo-legend">
        <div><dt>Saldo disponível</dt><dd><span id="lg-avail-before">${credits(s.balances.beforeSend.available)}</span><span id="lg-avail-after">${credits(s.balances.afterSend.available)}</span></dd></div>
        <div id="lg-held"><dt>Créditos em Garantia</dt><dd>${credits(s.balances.afterSend.held)}</dd></div>
      </dl>
      <p class="demo-sub" id="held-note">Se a solicitação for aceita e validada, os Créditos em Garantia são utilizados para confirmar a reserva.</p>
    </section>

    <section class="demo-card demo-card--task" id="pending" data-surface="deep" aria-label="Solicitação pendente">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Pendente</p>
      <p class="lx-display-s">Solicitação enviada</p>
      <p class="demo-note">${icon('i-info')}<span>A reserva só se confirma com o aceite e a revalidação.</span></p>
      <p class="demo-sub">Quem recebe tem até 24 horas para responder. Sem aceite, a Taxa de intermediação é devolvida e a Garantia é liberada.</p>
    </section>

    <section class="demo-card demo-card--task" id="holder" data-surface="deep" aria-label="Solicitação recebida">
      <p class="lx-eyebrow">Visão do membro que recebe a solicitação</p>
      <p class="lx-display-s">Solicitação de troca recebida</p>
      <p class="demo-sub">${s.secondHome.name} · ${periodShort}<br>${s.nights.length} noites reservadas do seu Direito de Uso</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos a receber</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.holder.lot.quantity)}</dd><dd class="demo-hint">Receba esses Créditos se aceitar a solicitação e as condições forem confirmadas.</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Prazo para responder</dt><dd class="lx-evidence__value">24 horas</dd></div>
      </dl>
      <p class="demo-sub">Ao aceitar, você cede essas noites e recebe Créditos Luxchange.</p>
      <div class="demo-swap">
        <div class="demo-actions" id="holder-actions">
          <button class="lx-button lx-button--primary" type="button" id="accept" tabindex="-1">Aceitar</button>
          <button class="lx-button lx-button--secondary" type="button" tabindex="-1">Recusar</button>
        </div>
        <div id="reval">
          <p class="lx-label">Revalidando antes de confirmar</p>
          <ul class="demo-check-list">
            <li id="rv-1">${icon('i-check')}Noites ainda elegíveis</li>
            <li id="rv-2">${icon('i-check')}Membership vigente dos dois Membros</li>
            <li id="rv-3">${icon('i-check')}Créditos em Garantia</li>
            <li id="rv-4">${icon('i-check')}Solicitação dentro do prazo</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="demo-card demo-card--task" id="accepted" data-surface="deep" aria-label="Solicitação aceita">
      <p class="lx-eyebrow">Visão do membro que recebeu a solicitação</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Solicitação aceita</p>
      <p><span class="lx-ordinal">${credits(s.holder.lot.quantity)}</span> <span class="demo-sub">Créditos recebidos</span></p>
      <p class="demo-sub">Válidos por 24 meses a partir da originação.</p>
    </section>

    <section class="demo-card demo-card--ctx" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="lx-eyebrow">Visão do membro solicitante</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">${periodShort} · ${s.nights.length} noites</p>
      </div>
      <p class="demo-sub">${credits(s.balances.afterAccept.consumed)} Créditos utilizados na confirmação.</p>
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
    // Cada valor troca sem crossfade (saída 280 ms + entrada 480 ms): os intervalos deixam 14.000, 30.000 e 46.000
    // legíveis por pelo menos ~0,6 s antes do próximo toque (o valor final segue visível até a saída do cartão).
    slider: v ? 9_500 : 10_700,
    topupOut: v ? 10_900 : 15_700,
    datesIn: v ? 11_200 : 8_900,
    taps: v ? [12_650, 14_000] : [12_200, 13_600],
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
  // O calendário do depósito abre direto em maio, o primeiro mês com datas elegíveis (sem navegar a partir de abril).
  const opening = openingMonth(dep);
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
      ...opening.enter,
      ...selection.enter,
      { sel: '#deposit-label', in: ALWAYS, out: t.depositPress + 100 },
      { sel: '#deposit-busy', in: swapIn(t.depositPress + 100), dur: 0 },
      // Depósito confirmado (operação própria) e, no 16:9, o saldo de Créditos ao lado
      { sel: '#deposited', in: t.depositedIn, out: t.reviewOut },
      { sel: '#credits', in: v ? t.sendCommit : t.depositedIn, out: t.pendingOut },
      // Revisão, Taxa de intermediação, pagamento e envio
      { sel: '#review', in: t.reviewIn, out: t.sendOut },
      { sel: '#send-label', in: ALWAYS, out: t.pay + 100 },
      { sel: '#send-busy', in: swapIn(t.pay + 100), dur: 0 },
      // Garantia só no envio: dois indicadores e uma frase (sem a lista de lotes).
      { sel: '#lg-held', in: valueIn },
      { sel: '#held-note', in: valueIn },
      { sel: '#lg-avail-before', in: ALWAYS, out: t.sendCommit },
      { sel: '#lg-avail-after', in: valueIn },
      { sel: '#pending', in: t.sendCommit, out: t.pendingOut },
      // Aceite de quem recebe, revalidação e, na mesma operação, solicitação aceita + reserva confirmada
      { sel: '#holder', in: t.holderIn, out: t.holderOut },
      { sel: '#holder-actions', in: ALWAYS, out: t.accept + 100 },
      { sel: '#reval', in: swapIn(t.accept + 100) },
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
      { at: 4_200, label: 'rota: noites reservadas por outro Membro → Luxchange Request' },
      ...(v ? [] : [{ at: 5_200, label: 'toque · Continuar' }]),
      { at: t.needIn, label: 'Créditos necessários 55.000 × saldo 48.000: faltam 7.000' },
      { at: t.topupPress, label: 'toque · Complementar saldo (datas do meu Direito de Uso)' },
      {
        at: t.slider,
        label: 'controle · Créditos adicionais desejados → 14.000, o mínimo (16/05)',
      },
      { at: t.taps[0], label: 'toque · 14/05 → 30.000' },
      {
        at: t.taps[1],
        label: 'toque · 15/05 → 46.000, para as próximas experiências (saldo projetado 94.000)',
      },
      { at: t.depositPress, label: 'toque · Depositar datas e gerar Créditos' },
      { at: t.depositedIn, label: 'depósito confirmado: 46.000 novos Créditos · saldo 94.000' },
      { at: t.reviewPress, label: 'toque · Revisar Request' },
      { at: t.policy, label: 'toque · aceite da política' },
      { at: t.pay, label: 'toque · Pagar taxa e enviar' },
      { at: t.sendCommit, label: 'solicitação pendente; Garantia constituída (55.000)' },
      {
        at: t.holderIn - 400,
        label: 'corte sugerido · o membro que recebe a solicitação',
      },
      { at: t.accept, label: 'toque · Aceitar (membro que recebe a solicitação)' },
      {
        at: t.result,
        label: 'aceite válido: solicitação aceita + reserva confirmada (mesma operação)',
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
      expect: ['3 noites', 'Noites reservadas por outro Membro', 'Luxchange Request'],
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
        'Solicitação enviada',
        'Saldo disponível',
        credits(s.balances.afterSend.available),
        'Créditos em Garantia',
        credits(s.balances.afterSend.held),
        'utilizados para confirmar a reserva',
        'Taxa de intermediação é devolvida',
      ],
      // Sem detalhamento por lote no filme (o FEFO continua nas regras e nos dados).
      absent: ['lote', 'Créditos anteriores', 'Novo depósito'],
    },
    {
      t: 28_300,
      name: 'recebida',
      expect: [
        'Visão do membro que recebe a solicitação',
        'Solicitação de troca recebida',
        '04 a 07/06/2027',
        'noites reservadas do seu Direito de Uso',
        'Créditos a receber',
        credits(s.holder.lot.quantity),
        'se aceitar a solicitação e as condições forem confirmadas',
        '24 horas',
        'Ao aceitar, você cede essas noites e recebe Créditos Luxchange',
      ],
    },
    {
      t: 30_900,
      name: 'revalidacao',
      expect: [
        'Revalidando antes de confirmar',
        'Membership vigente dos dois Membros',
        'Créditos em Garantia',
      ],
    },
    {
      t: 33_000,
      name: 'confirmacao',
      expect: [
        'Solicitação aceita',
        'Créditos recebidos',
        'Válidos por 24 meses a partir da originação',
        'Visão do membro solicitante',
        'Reserva confirmada',
        'Créditos utilizados na confirmação',
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
  // Placas internas de teste da Azzura Home: a foto provisória do litoral e a mesma foto escurecida (placas.mjs).
  plates: {
    claro: 'public/images/home/hero/hero-lifestyle.jpg',
    escuro: PLATES.azzuraNoite,
  },
};
