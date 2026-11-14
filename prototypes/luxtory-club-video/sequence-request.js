// Demonstração conceitual — coreografia da Luxchange Request (Etapa A: R1 e R2 completos, R3/R4 resumidos).
// Todo valor exibido vem de requestScenario() (data.js → rules.js). Os textos são da demonstração, não copy aprovada.
// Hipótese visual (não especificada no 02): quem solicita escolhe o período e recebe a rota; não vê calendário,
// disponibilidade nem identidade de outro Titular.
import { CANONICAL, requestScenario } from './data.js';
import { brl, civilFull, civilShort, credits, instant } from './format.js';

const s = requestScenario();
const period = `${civilShort(s.checkin)} a ${civilFull(s.checkout)}`;
const SEAL = 'Demonstração conceitual · dados fictícios';
const hours = `entrada ${CANONICAL.checkinHour}h, saída ${CANONICAL.checkoutHour}h`; // PD-002

const ICONS = `
  <svg width="0" height="0" class="lx-visually-hidden" aria-hidden="true" focusable="false">
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></g></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g></symbol>
  </svg>`;
const icon = (id, cls = 'demo-icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
const seal = `<p class="demo-seal">${SEAL}</p>`;

function calendarMonth(year, month, context) {
  const weekdays = [
    ['dom', 'domingo'],
    ['seg', 'segunda-feira'],
    ['ter', 'terça-feira'],
    ['qua', 'quarta-feira'],
    ['qui', 'quinta-feira'],
    ['sex', 'sexta-feira'],
    ['sáb', 'sábado'],
  ];
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [...Array(first.getUTCDay()).fill('<td></td>')];
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(
      `<td data-day="${iso}"><span class="lx-calendar__day"><span class="lx-calendar__number">${d}</span></span></td>`,
    );
  }
  while (cells.length % 7) cells.push('<td></td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  const title = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(first);
  return `
    <div class="lx-calendar">
      <div class="lx-calendar__month">
        <div class="lx-calendar__header demo-cal-head"><h2 class="lx-calendar__title">${title}</h2><span class="demo-sub demo-only-9x16">${context}</span></div>
        <table class="lx-calendar__table">
          <caption>${title}: período escolhido de ${period}</caption>
          <thead><tr>${weekdays.map(([short, long]) => `<th scope="col" abbr="${long}">${short}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>`;
}

const [lotA, lotB, lotC] = s.lots;
const holdOf = (id) => s.hold.find((h) => h.lotId === id)?.quantity ?? 0;
const lotRow = (lot) => {
  const part = holdOf(lot.id);
  const amount =
    part === lot.quantity ? credits(part) : `${credits(part)} de ${credits(lot.quantity)}`;
  return `<li><span class="lx-meta">${lot.id}</span><span>${amount}</span><span class="lx-meta">vence ${instant(lot.expiresAt).slice(0, 10)}</span></li>`;
};

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
      <p class="demo-note demo-only-16x9" id="home-route">${icon('i-info')}<span><strong>Noites de outro Titular</strong>A reserva depende do aceite dele: Luxchange Request.</span></p>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="cal" data-surface="deep" aria-label="Escolha das noites">
      ${calendarMonth(year, month, s.secondHome.name)}
      <div class="demo-summary" id="cal-summary">
        <span class="lx-ordinal">${s.nights.length} noites</span>
        <span class="demo-sub">${period} · ${hours}</span>
      </div>
      <p class="demo-note demo-only-9x16" id="cal-route">${icon('i-info')}<span><strong>Noites de outro Titular</strong>A reserva depende do aceite dele: Luxchange Request.</span></p>
      <button class="lx-button lx-button--primary demo-only-16x9" type="button" id="cal-next" tabindex="-1">Revisar Request</button>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="review" data-surface="deep" aria-label="Revisão da Request">
      <p class="lx-eyebrow">Revisar Request</p>
      <p class="lx-title">${s.secondHome.name} · ${period}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos em Garantia</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.credits)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Luxchange Fee</dt><dd class="lx-evidence__value">${brl(s.feeCents)} <span class="demo-tag">ilustrativo</span></dd><dd class="demo-hint">Pago no envio, em dinheiro, separado dos Créditos</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Prazo para o aceite</dt><dd class="lx-evidence__value">24 horas</dd></div>
        <div class="lx-evidence__item demo-only-16x9"><dt class="lx-evidence__label">PRL do período</dt><dd class="lx-evidence__value">${brl(s.prlPeriodCents)} <span class="demo-tag">fictício</span></dd></div>
      </dl>
      <label class="lx-check"><input type="checkbox" id="policy" tabindex="-1"><span>Li e aceito a política comercial aplicável<span class="lx-check__note">Etapa conceitual. Sem política vigente, nada é enviado.</span></span></label>
      <button class="lx-button lx-button--primary" type="button" id="send" tabindex="-1"><span class="demo-swap"><span id="send-label">Pagar Fee e enviar</span><span id="send-busy">Pagamento simulado</span></span></button>
      ${seal}
    </section>

    <section class="demo-card demo-card--ctx" id="credits" data-surface="deep" aria-label="Créditos Luxchange">
      <p class="lx-eyebrow">Créditos Luxchange de ${s.requesterName}</p>
      <div class="demo-figure demo-only-16x9"><span class="lx-ordinal" id="cr-before">${credits(s.balances.beforeSend.available)}</span><span class="lx-ordinal" id="cr-after">${credits(s.balances.afterSend.available)}</span></div>
      <div class="demo-bar" aria-hidden="true"><span class="demo-bar__seg" id="bar-avail"></span><span class="demo-bar__seg demo-bar__seg--held" id="bar-held"></span></div>
      <dl class="demo-legend">
        <div><dt>Disponíveis</dt><dd><span id="lg-avail-before">${credits(s.balances.beforeSend.available)}</span><span id="lg-avail-after">${credits(s.balances.afterSend.available)}</span></dd></div>
        <div><dt>Em Garantia</dt><dd><span id="lg-held-before">${credits(s.balances.beforeSend.held)}</span><span id="lg-held-after">${credits(s.balances.afterSend.held)}</span></dd></div>
      </dl>
      <ul class="demo-lots demo-only-16x9" id="lots">
        <li class="demo-lots__head">Garantia pelos lotes que vencem primeiro</li>
        ${[lotA, lotB, lotC].map(lotRow).join('')}
      </ul>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="pending" data-surface="deep" aria-label="Request pendente">
      <p class="demo-state demo-state--pending">${icon('i-clock')}Pendente</p>
      <p class="lx-display-s">Request enviada</p>
      <div class="demo-times"><span class="lx-meta">Enviada ${instant(s.sentAt)}</span><span class="lx-meta">Expira ${instant(s.expiresAt)}</span></div>
      <p class="demo-note">${icon('i-info')}<span>As noites não ficam bloqueadas enquanto a Request está pendente. A reserva só se confirma com o aceite e a revalidação.</span></p>
      <p class="demo-sub">Fee de ${brl(s.feeCents)} pago. Sem aceite, ele é revertido integralmente e a Garantia é liberada.</p>
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="holder" data-surface="deep" aria-label="Request recebida pelo Titular detentor">
      <p class="lx-eyebrow">Visão do Titular detentor · Co-Owner</p>
      <p class="lx-display-s">Request recebida</p>
      <p class="demo-sub">${s.secondHome.name} · ${period} · ${s.nights.length} noites da reserva de uso próprio desta Ação</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos para esta Ação</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(s.holder.lot.quantity)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Expira</dt><dd class="lx-evidence__value"><span class="lx-meta">${instant(s.expiresAt)}</span></dd></div>
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
      ${seal}
    </section>

    <section class="demo-card demo-card--task" id="accepted" data-surface="deep" aria-label="Request aceita">
      <p class="lx-eyebrow">Visão do Titular detentor · Co-Owner</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Request aceita</p>
      <p><span class="lx-ordinal">${credits(s.holder.lot.quantity)}</span> <span class="demo-sub">Créditos originados para esta Ação</span></p>
      <div class="demo-times"><span class="lx-meta">Lote ${s.holder.lot.id} · originado ${instant(s.holder.lot.originatedAt)}</span><span class="lx-meta">Vence ${instant(s.holder.lot.expiresAt)}</span></div>
      ${seal}
    </section>

    <section class="demo-card demo-card--ctx" id="booking" data-surface="deep" aria-label="Reserva confirmada">
      <p class="lx-eyebrow">Visão de quem solicitou</p>
      <p class="demo-state demo-state--done">${icon('i-check')}Reserva ${s.booking.state.toLowerCase()}</p>
      <div>
        <p class="demo-name">${period}</p>
        <p class="demo-sub">${s.secondHome.name} · ${s.nights.length} noites · ${hours}</p>
      </div>
      <p class="demo-sub">${s.booking.channel} · ${credits(s.balances.afterAccept.consumed)} Créditos consumidos da Garantia</p>
      <span class="lx-meta">Mesma operação · ${instant(s.booking.confirmedAt)}</span>
      ${seal}
    </section>`,
  );
  stage.dataset.fmt = fmt;
}

const ALWAYS = -10_000;
const share = (part) => part / s.balances.beforeSend.available;

export function timeline(fmt) {
  const v = fmt === '9x16';
  // 9:16 tem composição própria: um cartão de cada vez quando dois não cabem (contexto no alto, tarefa embaixo).
  const calIn = v ? 1_700 : 1_100;
  const creditsIn = v ? 11_600 : 6_400;
  const tweenAt = v ? 12_200 : 11_600;
  const press = (sel, at) => [
    { sel, attr: 'data-pressed', at, value: true },
    { sel, attr: 'data-pressed', at: at + 200, value: null },
  ];
  return {
    duration: 25_000,
    enter: [
      // R1 — escolher noites
      { sel: '#home', in: 400, out: v ? 1_500 : 5_500 },
      { sel: '#cal', in: calIn, out: 5_500 },
      { sel: '#cal-summary', in: 3_700 },
      { sel: '#home-route', in: 4_200 },
      { sel: '#cal-route', in: 4_200 },
      // R2 — revisão, política, pagamento do Fee, Pendente
      { sel: '#review', in: 5_800, out: 11_400 },
      { sel: '#send-label', in: ALWAYS, out: 10_100 },
      { sel: '#send-busy', in: 10_200, dur: 0 },
      { sel: '#credits', in: creditsIn, out: 15_700 },
      { sel: '#lots', in: 7_000 },
      { sel: '#cr-before', in: ALWAYS, out: tweenAt },
      { sel: '#cr-after', in: tweenAt + 120 },
      { sel: '#lg-avail-before', in: ALWAYS, out: tweenAt },
      { sel: '#lg-avail-after', in: tweenAt + 120 },
      { sel: '#lg-held-before', in: ALWAYS, out: tweenAt },
      { sel: '#lg-held-after', in: tweenAt + 120 },
      { sel: '#pending', in: 11_600, out: 15_700 },
      // R3/R4 — aceite do detentor, revalidação e, na mesma operação, Request Aceita + Reserva Confirmada
      { sel: '#holder', in: 16_100, out: 20_000 },
      { sel: '#holder-actions', in: ALWAYS, out: 18_600 },
      { sel: '#reval', in: 18_800 },
      { sel: '#rv-1', in: 18_900 },
      { sel: '#rv-2', in: 19_100 },
      { sel: '#rv-3', in: 19_300 },
      { sel: '#rv-4', in: 19_500 },
      { sel: '#accepted', in: 20_100 },
      { sel: '#booking', in: 20_100 },
    ],
    set: [
      { sel: '[data-day="2027-06-04"]', attr: 'data-range', at: 2_400, value: 'start' },
      { sel: '[data-day="2027-06-05"]', attr: 'data-range', at: 3_100, value: 'night' },
      { sel: '[data-day="2027-06-06"]', attr: 'data-range', at: 3_180, value: 'night' },
      { sel: '[data-day="2027-06-07"]', attr: 'data-range', at: 3_260, value: 'end' },
      ...press('#cal-next', 5_200),
      { sel: '#policy', attr: 'checked', at: 8_800, value: true },
      ...press('#send', 10_000),
      { sel: '#send', attr: 'aria-busy', at: 10_100, value: 'true' },
      { sel: '#send', attr: 'aria-busy', at: 11_400, value: null },
      ...press('#accept', 18_500),
    ],
    tween: [
      {
        sel: '#bar-avail',
        prop: '--share',
        at: tweenAt,
        from: 1,
        to: share(s.balances.afterSend.available),
      },
      {
        sel: '#bar-held',
        prop: '--share',
        at: tweenAt,
        from: 0,
        to: share(s.balances.afterSend.held),
      },
    ],
    marks: [
      { at: 0, label: 'R1 · início (palco vazio)' },
      { at: 2_400, label: 'toque · entrada 04/06' },
      { at: 3_100, label: 'toque · saída 07/06' },
      { at: 4_200, label: 'rota: noites de outro Titular → Luxchange Request' },
      ...(v ? [] : [{ at: 5_200, label: 'toque · Revisar Request' }]),
      { at: 5_500, label: 'corte sugerido · início de R2' },
      { at: 8_800, label: 'toque · aceite da política (etapa conceitual)' },
      { at: 10_000, label: 'toque · Pagar Fee e enviar' },
      { at: 11_600, label: 'Request Pendente; Garantia constituída' },
      { at: 15_900, label: 'corte sugerido · início de R3/R4' },
      { at: 18_500, label: 'toque · Aceitar (Titular detentor)' },
      { at: 20_100, label: 'aceite válido: Request Aceita + Reserva Confirmada (mesma operação)' },
      { at: 25_000, label: 'fim' },
    ],
  };
}
