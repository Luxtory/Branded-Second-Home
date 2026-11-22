// Coreografia da Luxchange Request (direção v10, 2026-11-22): escolha da estadia → Créditos necessários × saldo →
// depósito de uma data do Direito de Uso (calendário) → depósito realizado (novo saldo na Carteira) → destinação dos
// Créditos à solicitação (controle próprio, só com a necessidade coberta por inteiro) → revisão → Taxa de intercâmbio →
// pagamento e envio → Garantia (só no envio) → aceite expresso do membro que recebe a solicitação → revalidação →
// solicitação aceita + reserva confirmada na mesma operação (REQ-064), quando a Garantia é consumida.
// Todo valor exibido vem de requestScenario() e depositScenario() (data.js → rules.js). A capacidade pedida não fica
// bloqueada enquanto a Request está pendente (PD-005).
// Copy do filme (direção final, 2026-11-19): "Membro" na comunicação (quem solicita / quem recebe), sem Owner, Co-Owner
// nem Ação; saldo e Garantia em dois indicadores (os lotes e o FEFO continuam em rules.js e data.js, fora da tela);
// textos enxutos da v8.1 (uma ideia por cartão, o prazo de 24 horas só no cartão de quem recebe). Papéis e regras do domínio não mudam: quem recebe é Co-Owner em data.js, e as noites cedidas são do Direito
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
  allocationCard,
  allocationChoreography,
  datesCard,
  depositedCard,
  openingMonth,
  needCard,
  selectionChoreography,
  selectionStates,
} from './credits-step.js';

const s = requestScenario();
const dep = depositScenario();
const period = periodOf(s.checkin, s.checkout);
const periodShort = periodCompact(s.checkin, s.checkout);
// Prazo de resposta derivado da própria simulação (expira de fato nesse prazo; proposta de 48 horas, PD-005): o vídeo
// nunca mostra um prazo diferente do que a Request simulada usa.
const HOUR_MS = 3_600_000;
export const REPLY_HOURS = (s.expiresAt - s.sentAt) / HOUR_MS;
const GROW_MS = 480; // duration.slow
export const DEPOSIT_ACTION = `Depositar ${dep.selected.length === 1 ? 'data' : 'datas'} e gerar Créditos`;
// Segunda tela (direção v8.2): só a dependência do aceite, sem repetir o banner.
const route = `${icon('i-info')}<span>Esta reserva depende do aceite do Membro que reservou as noites solicitadas.</span>`;
// Seleção (fonte única: as datas): a menor seleção que cobre o que falta (14.000, só 16/05), que é o que Helena deposita
// (direção v8.2). Cada data gera seus Créditos por inteiro (rules.js#depositStops); não há depósito de só 7.000. Na
// direção v10 a data se escolhe no calendário, e a seleção coincide com o depósito dos dados.
const SELECTION = [selectionForTarget(dep.eligible, dep.minimum.credits)];
if (SELECTION.at(-1).join() !== dep.selected.join())
  throw new Error('Seleção da coreografia diferente do depósito de data.js');

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

    ${needCard({ title: `${periodShort} · ${s.nights.length} noites`, needed: s.credits, available: dep.priorAvailable, role: dep.role, sufficient: false })}
    ${datesCard(dep, states, { action: DEPOSIT_ACTION })}
    ${depositedCard(dep, { next: 'Destinar Créditos' })}
    ${allocationCard({ ...s.allocation, next: 'Revisar solicitação' })}

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão da solicitação">
      <p class="lx-eyebrow">Revisar solicitação</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos destinados</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.allocation.allocated)}</dd><dd class="demo-hint">Vão para a Garantia no envio</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Taxa de intercâmbio</dt><dd class="lx-evidence__value">${brl(s.feeCents)}</dd><dd class="demo-hint">Paga no envio, separada dos Créditos; devolvida se não houver aceite</dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável</span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar taxa e enviar</span><span id="send-busy">Processando pagamento</span></span></button>
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-held"></span></div>
      <dl class="demo-legend">
        <div><dt>Créditos disponíveis</dt><dd><span id="lg-avail-before">${credits(s.balances.beforeSend.available)}</span><span id="lg-avail-after">${credits(s.balances.afterSend.available)}</span></dd></div>
        <div id="lg-held"><dt>Créditos em Garantia</dt><dd>${credits(s.balances.afterSend.held)}</dd></div>
      </dl>
    </section>

    <section class="demo-card demo-card--task" id="pending" data-surface="deep" aria-label="Solicitação pendente">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Aguardando resposta</p>
      <p class="lx-display-s">Solicitação enviada</p>
      <p class="demo-note">${icon('i-info')}<span>A reserva depende do aceite e da validação das condições.</span></p>
    </section>

    <section class="demo-card demo-card--task" id="holder" data-surface="deep" aria-label="Solicitação recebida">
      <p class="lx-eyebrow">Membro que recebe</p>
      <p class="lx-display-s">Solicitação recebida</p>
      <p class="demo-sub">${s.secondHome.name} · ${periodShort}<br>${s.nights.length} noites do seu Direito de Uso</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos a receber</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.holder.lot.quantity)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Responda em até</dt><dd class="lx-evidence__value">${REPLY_HOURS} horas</dd></div>
      </dl>
      <p class="demo-sub">Ao aceitar, você cede as noites e recebe os Créditos após a confirmação.</p>
      <div class="demo-swap" id="holder-swap" data-grow>
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

    <div class="demo-pair" id="result-pair">
      <section class="demo-card" id="booking" data-surface="deep" aria-label="Reserva confirmada">
        <p class="lx-eyebrow">Membro que solicita</p>
        <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
        <p class="demo-name">${s.secondHome.name}</p>
        <p class="demo-sub">${periodShort} · ${s.nights.length} noites</p>
      </section>
      <section class="demo-card" id="accepted" data-surface="deep" aria-label="Solicitação aceita">
        <p class="lx-eyebrow">Membro que recebe</p>
        <p class="demo-state demo-state--done">${icon('i-check')}Solicitação aceita</p>
        <p class="demo-name">${credits(s.holder.lot.quantity)}</p>
        <p class="demo-sub">Créditos recebidos</p>
      </section>
    </div>`,
  );
  stage.dataset.fmt = fmt;
}

const share = (part) => part / s.balances.beforeSend.available;

/**
 * Instantes de cada formato. Direção v10: um estado por vez — saldo insuficiente → calendário (16/05) → depósito
 * realizado → destinação dos Créditos → revisão → envio. Depois da escolha das datas, os dois formatos seguem juntos.
 */
export function times(fmt) {
  const v = fmt === '9x16';
  return {
    v,
    calIn: v ? 1_800 : 1_100,
    needIn: 5_800,
    topupPress: 8_200,
    stepOut: 8_600,
    datesIn: 8_900,
    // Toque em 16/05: o calendário já foi lido (título e legenda) e a data gera os Créditos inteiros dela.
    daySelect: 11_000,
    depositPress: 13_300,
    depositOut: 14_100,
    depositedIn: 14_400,
    allocPress: 16_900,
    allocOut: 17_300,
    allocIn: 17_600,
    // O controle de destinação anda de 0 até a necessidade (55.000); só na chegada a revisão se habilita.
    allocSlide: 18_600,
    allocSlideMs: 1_200,
    reviewPress: 20_900,
    reviewOut: 21_300,
    reviewIn: 21_600,
    policy: 22_600,
    pay: 23_800,
    sendOut: 25_200,
    // Commit do envio: a Request aparece Pendente e a Garantia é constituída no mesmo instante (PD-005, PD-006).
    sendCommit: 25_500,
    pendingOut: 29_500,
    holderIn: 29_900,
    accept: 32_300,
    holderOut: 34_100,
    // Aceite válido: o cartão do detentor sai e, na mesma operação, entram Request Aceita e Reserva Confirmada.
    result: 34_400,
    duration: 38_000,
  };
}

export function timeline(fmt) {
  const t = times(fmt);
  const { v } = t;
  const tween = 900; // duration.cinematic (stage.js MOTION.tween)
  const selection = selectionChoreography(
    dep,
    [{ at: t.daySelect, nights: SELECTION[0], via: 'calendar' }],
    { tween, needed: s.credits, slider: false },
  );
  // O calendário do depósito abre direto em maio, o primeiro mês com datas elegíveis (sem navegar a partir de abril).
  const opening = openingMonth(dep);
  const allocation = allocationChoreography(s.allocation, {
    at: t.allocSlide,
    dur: t.allocSlideMs,
  });
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
      // Depósito de novas datas: o calendário do Direito de Uso, um cartão só
      { sel: '#dates', in: t.datesIn, out: t.depositOut },
      ...opening.enter,
      ...selection.enter,
      { sel: '#deposit-label', in: ALWAYS, out: t.depositPress + 100 },
      { sel: '#deposit-busy', in: swapIn(t.depositPress + 100), dur: 0 },
      // Depósito realizado (operação própria): os Créditos já estão na Carteira
      { sel: '#deposited', in: t.depositedIn, out: t.allocOut },
      // Destinação dos Créditos à solicitação: só depois do depósito realizado
      { sel: '#alloc', in: t.allocIn, out: t.reviewOut },
      // Saldo e Garantia só no envio: antes disso o depósito confirmado já mostra o saldo (sem informação duplicada).
      { sel: '#credits', in: t.sendCommit, out: t.pendingOut },
      // Revisão, Taxa de intercâmbio, pagamento e envio
      { sel: '#review', in: t.reviewIn, out: t.sendOut },
      { sel: '#send-label', in: ALWAYS, out: t.pay + 100 },
      { sel: '#send-busy', in: swapIn(t.pay + 100), dur: 0 },
      // Garantia só no envio: dois indicadores (sem a lista de lotes); a dependência do aceite fica no cartão pendente.
      { sel: '#lg-held', in: valueIn },
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
      ...press(`[data-deposit-day="${SELECTION[0][0]}"] .lx-calendar__day`, t.daySelect),
      ...selection.set,
      ...press('#deposit-go', t.depositPress),
      { sel: '#deposit-go', attr: 'aria-busy', at: t.depositPress + 100, value: 'true' },
      { sel: '#deposit-go', attr: 'aria-busy', at: t.depositOut, value: null },
      ...press('#deposited-next', t.allocPress),
      ...allocation.set,
      ...press('#alloc-go', t.reviewPress),
      { sel: '#policy', attr: 'checked', at: t.policy, value: true },
      ...press('#send', t.pay),
      { sel: '#send', attr: 'aria-busy', at: t.pay + 100, value: 'true' },
      { sel: '#send', attr: 'aria-busy', at: t.sendOut, value: null },
      ...press('#accept', t.accept),
    ],
    tween: [
      ...selection.tween,
      ...allocation.tween,
      // O cartão de quem recebe começa compacto (ações logo abaixo do texto); depois do toque em Aceitar, a área cresce
      // até a revalidação em duration.slow, sem vão reservado antes e sem salto de layout (v8.4).
      { sel: '#holder-swap', prop: '--grow', at: t.accept + 100, from: 0, to: 1, dur: GROW_MS },
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
      { at: t.daySelect, label: 'toque · 16/05 (gera 14.000 Créditos, a data inteira)' },
      { at: t.depositPress, label: `toque · ${DEPOSIT_ACTION}` },
      {
        at: t.depositedIn,
        label: `depósito realizado: +${credits(dep.originated)} · novo saldo ${credits(dep.afterDeposit)}`,
      },
      { at: t.allocPress, label: 'toque · Destinar Créditos' },
      {
        at: t.allocSlide,
        label: `destinação: 0 → ${credits(s.allocation.allocated)} (permanecem ${credits(s.allocation.remaining)})`,
      },
      { at: t.reviewPress, label: 'toque · Revisar solicitação' },
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
      expect: [
        '3 noites',
        'Esta reserva depende do aceite do Membro que reservou as noites solicitadas',
      ],
    },
    {
      t: 7_600,
      name: 'creditos',
      expect: [
        'Créditos necessários',
        credits(s.credits),
        'Saldo disponível',
        credits(dep.priorAvailable),
        'Faltam',
        credits(dep.shortfall),
        'Complementar saldo',
        'Datas inteiras do meu Direito de Uso geram novos Créditos',
      ],
      absent: ['Em Garantia', 'Destinados'],
    },
    {
      t: T.depositPress - 100,
      name: 'complemento',
      expect: [
        'Selecionar datas do meu Direito de Uso',
        'Disponível para depósito',
        'Já comprometida',
        'Créditos a gerar',
        credits(dep.originated),
        DEPOSIT_ACTION,
      ],
      // Nada de saldo projetado como se estivesse disponível, nem de destinação, antes do depósito realizado.
      absent: ['Em Garantia', 'Elegível', 'Destinados', credits(dep.afterDeposit)],
    },
    {
      t: T.allocPress - 200,
      name: 'deposito',
      expect: [
        'Depósito realizado',
        `+${credits(dep.originated)}`,
        'Créditos na sua Carteira',
        'Novo saldo disponível',
        credits(dep.afterDeposit),
      ],
      absent: ['Em Garantia', 'Destinados'],
    },
    {
      t: T.allocSlide - 200,
      name: 'destinacao-inicio',
      expect: [
        'Créditos destinados à solicitação',
        'Disponíveis',
        credits(s.allocation.available),
        'Necessários',
        credits(s.allocation.needed),
        'Permanecerá disponível',
      ],
      absent: ['Em Garantia'],
    },
    {
      t: T.reviewPress - 200,
      name: 'destinacao',
      expect: [
        'Créditos destinados à solicitação',
        credits(s.allocation.available),
        credits(s.allocation.needed),
        credits(s.allocation.remaining),
      ],
      absent: ['Em Garantia'],
    },
    {
      t: T.pay - 200,
      name: 'revisao',
      expect: [
        'Créditos destinados',
        credits(s.allocation.allocated),
        'Vão para a Garantia no envio',
        'Taxa de intercâmbio',
        brl(s.feeCents),
        'separada dos Créditos',
        'devolvida se não houver aceite',
        'Li e aceito a política comercial aplicável',
      ],
      absent: ['Em Garantia'],
    },
    {
      t: T.sendCommit + 2_100,
      name: 'pendente',
      expect: [
        'Aguardando resposta',
        'Solicitação enviada',
        'Créditos disponíveis',
        credits(s.balances.afterSend.available),
        'Créditos em Garantia',
        credits(s.balances.afterSend.held),
        'A reserva depende do aceite e da validação das condições',
      ],
      // Sem detalhamento por lote no filme (o FEFO continua nas regras e nos dados); o prazo fica com quem recebe.
      absent: ['lote', 'Créditos anteriores', 'Novo depósito', `${REPLY_HOURS} horas`],
    },
    {
      t: T.holderIn + 1_400,
      name: 'recebida',
      expect: [
        'Membro que recebe',
        'Solicitação recebida',
        '04 a 07/06/2027',
        '3 noites do seu Direito de Uso',
        'Créditos a receber',
        credits(s.holder.lot.quantity),
        'Responda em até',
        `${REPLY_HOURS} horas`,
        'Ao aceitar, você cede as noites e recebe os Créditos após a confirmação',
      ],
    },
    {
      t: T.accept + 1_600,
      name: 'revalidacao',
      expect: [
        'Revalidando antes de confirmar',
        'Membership vigente dos dois Membros',
        'Créditos em Garantia',
      ],
    },
    {
      t: T.result + 1_600,
      name: 'confirmacao',
      expect: [
        'Solicitação aceita',
        'Créditos recebidos',
        'Membro que solicita',
        'Reserva confirmada',
        `04 a 07/06/2027 · ${s.nights.length} noites`,
        credits(s.holder.lot.quantity),
      ],
      absent: ['Créditos utilizados'],
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
  // Seleção esperada no calendário do depósito, antes do toque em depositar (fonte única: as datas).
  deposit: { t: T.depositPress - 100, selected: dep.selected },
  stills: {
    calendario: 4_800,
    creditos: 7_600,
    complemento: T.depositPress - 100,
    deposito: T.allocPress - 200,
    destinacao: T.reviewPress - 200,
    revisao: T.pay - 200,
    pendente: T.sendCommit + 2_100,
    revalidacao: T.accept + 1_600,
    confirmacao: T.result + 1_600,
  },
  // Trecho do aceite: toque em Aceitar, revalidação, saída do cartão e Request Aceita + Reserva Confirmada.
  alpha: { from: T.accept - 200, seconds: 4 },
  sample: { card: '#accepted', at: T.result + 1_600 },
  edge: { card: '#booking', at: T.result + 1_600 },
  motion: { card: '#holder', at: T.holderIn + 1_400, enter: [T.holderIn, T.holderIn + 480] },
  // Placas internas de teste da Azzura Home: a foto provisória do litoral e a mesma foto escurecida (placas.mjs).
  plates: {
    claro: 'public/images/home/hero/hero-lifestyle.jpg',
    escuro: PLATES.azzuraNoite,
  },
};
