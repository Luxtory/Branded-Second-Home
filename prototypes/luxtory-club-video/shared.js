// Demonstração conceitual — peças comuns às sequências (Request, Direct, Luxplus). Markup idêntico ao da Etapa A:
// a Request aprovada continua gerando os mesmos bytes (regressão conferida por hash dos quadros).
import { CANONICAL } from './data.js';
import { civilFull, civilShort } from './format.js';

// Exportação final (?final=1, capture.mjs --final): o selo interno dá lugar a uma indicação neutra de dados
// ilustrativos, numa linha como antes (layout e coreografia aprovados não mudam). Prévias internas mantêm o selo.
export const FINAL =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('final') === '1';
export const SEAL = FINAL ? 'Dados ilustrativos' : 'Demonstração conceitual · dados fictícios';
export const seal = `<p class="demo-seal">${SEAL}</p>`;
export const hours = `entrada ${CANONICAL.checkinHour}h, saída ${CANONICAL.checkoutHour}h`; // PD-002
export const periodOf = (checkin, checkout) => `${civilShort(checkin)} a ${civilFull(checkout)}`;
/** Elemento sempre visível na linha do tempo (entra antes do início). */
export const ALWAYS = -10_000;

export const ICONS = `
  <svg width="0" height="0" class="lx-visually-hidden" aria-hidden="true" focusable="false">
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></g></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g></symbol>
  </svg>`;
export const icon = (id, cls = 'demo-icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

/** Toque num botão: estado de hover do Core por 200 ms. */
export const press = (sel, at) => [
  { sel, attr: 'data-pressed', at, value: true },
  { sel, attr: 'data-pressed', at: at + 200, value: null },
];

/** Mês do calendário do DS (lx-calendar), sem navegação; `context` só aparece no 9:16. */
export function calendarMonth(year, month, context, period) {
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

/** Faixa de noites no calendário: entrada, noites e saída (PD-002), com os instantes dos toques. */
export function rangeSteps(nights, checkout, { startAt, endAt, stagger = 80 }) {
  return [
    { sel: `[data-day="${nights[0]}"]`, attr: 'data-range', at: startAt, value: 'start' },
    ...nights.slice(1).map((day, i) => ({
      sel: `[data-day="${day}"]`,
      attr: 'data-range',
      at: endAt + i * stagger,
      value: 'night',
    })),
    {
      sel: `[data-day="${checkout}"]`,
      attr: 'data-range',
      at: endAt + (nights.length - 1) * stagger,
      value: 'end',
    },
  ];
}
