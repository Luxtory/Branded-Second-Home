// Passo de Créditos da Request e do Direct (revisão de UX de 2026-11-15). Depois da escolha da estadia:
//   1. Créditos necessários × saldo válido disponível (e quanto falta, se faltar) — uma decisão: continuar com o saldo
//      ou complementar;
//   2. complementação opcional por depósito de datas elegíveis: o controle "Créditos adicionais desejados" e o calendário
//      "Selecionar datas do meu Direito de Uso", sincronizados por uma fonte única — as datas selecionadas. O controle só
//      oferece metas alcançáveis com datas inteiras (rules.js#depositStops); nunca cria Créditos sem data;
//   3. depósito confirmado como operação própria, antes de os novos Créditos ficarem disponíveis (REQ-060, BR-200 a
//      BR-203). A data nunca paga a reserva: ela origina Créditos, que depois entram na Request ou no Direct.
// Owner e Co-Owner têm textos e estados próprios (BR-150, BR-151): o Owner não usa calendário de Direito de Uso.
// Camada de interface do protótipo do vídeo; valores de data.js/rules.js; nenhum depósito ou pagamento real.
import { DEPOSIT_STATUS, creditsOfSelection } from './rules.js';
import { civilFull, credits } from './format.js';
import { ALWAYS, icon, press } from './shared.js';

/** Exit do Core (duration.moderate): o valor novo só entra depois da saída do antigo, nunca em crossfade. */
const EXIT = 280;

export const ROLE_TEXT = {
  co_owner: {
    source: 'do meu Direito de Uso',
    complement: 'Complementar saldo',
    accordion: 'Selecionar datas do meu Direito de Uso',
    depositedNote:
      'As datas passam ao Inventário Luxtory e seguem consumidas do seu Direito de Uso.',
    // Rótulos curtos na legenda (cabem numa linha também no 9:16); a descrição completa está no nome acessível de cada
    // data (dayName): reservada e elegível, reservada e indisponível (menos de 14 dias), já comprometida, não reservada.
    legend: {
      [DEPOSIT_STATUS.eligible]: 'Elegível',
      selected: 'Selecionada',
      [DEPOSIT_STATUS.reservedUnavailable]: 'Indisponível',
      [DEPOSIT_STATUS.committed]: 'Comprometida',
      [DEPOSIT_STATUS.notReserved]: 'Não reservada',
    },
    dayName: {
      [DEPOSIT_STATUS.eligible]: 'reservada, elegível para depósito',
      [DEPOSIT_STATUS.reservedUnavailable]:
        'reservada, indisponível para depósito (menos de 14 dias)',
      [DEPOSIT_STATUS.committed]: 'já comprometida',
      [DEPOSIT_STATUS.notReserved]: 'não reservada',
    },
  },
  owner: {
    source: 'da minha Second Home',
    complement: 'Complementar saldo',
    accordion: 'Selecionar datas da minha Second Home',
    depositedNote:
      'As datas passam ao Inventário Luxtory e deixam de estar disponíveis para outros usos.',
    legend: {
      [DEPOSIT_STATUS.eligible]: 'Elegível',
      selected: 'Selecionada',
      [DEPOSIT_STATUS.unavailable]: 'Indisponível',
      [DEPOSIT_STATUS.committed]: 'Comprometida',
    },
    dayName: {
      [DEPOSIT_STATUS.eligible]: 'disponível, elegível para depósito',
      [DEPOSIT_STATUS.unavailable]: 'indisponível',
      [DEPOSIT_STATUS.committed]: 'já comprometida',
    },
  },
};

/** Classificação por mês (01 §8): Alta/Super Alta em janeiro, julho e dezembro; a janela de Carnaval (PD-003) é por data. */
export function seasonOf(ym) {
  const m = Number(ym.slice(5, 7));
  if (m === 2 || m === 3)
    throw new Error(`Classificação de ${ym} depende da janela de Carnaval (PD-003): não presumida`);
  return [1, 7, 12].includes(m) ? 'Alta/Super Alta' : 'Média/Baixa';
}

/** "14, 15 e 16/05/2027" para noites do mesmo mês. */
export function nightsList(nights) {
  const days = nights.map((n) => String(Number(n.slice(8, 10))).padStart(2, '0'));
  const head = days.slice(0, -1).join(', ');
  return `${head ? `${head} e ` : ''}${civilFull(nights.at(-1))}`;
}

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** Cartão 1 — Créditos necessários × saldo. `sufficient` decide a ação principal (uma decisão por momento). */
export function needCard({ title, needed, available, role, sufficient }) {
  const t = ROLE_TEXT[role];
  const missing = Math.max(0, needed - available);
  const decision = sufficient
    ? `<p class="demo-state demo-state--done">${icon('i-check')}Saldo suficiente</p>
      <button class="lx-button lx-button--primary" type="button" id="need-continue" tabindex="-1">Continuar com meu saldo</button>
      <details class="lx-disclosure demo-accordion demo-accordion--closed"><summary class="lx-disclosure__summary">Complementar saldo com datas ${t.source}${icon('i-next', 'demo-icon lx-disclosure__icon')}</summary></details>`
    : `<p class="demo-note">${icon('i-info')}<span>Você pode completar com datas elegíveis ${t.source}. O depósito gera novos Créditos, que se somam ao seu saldo.</span></p>
      <button class="lx-button lx-button--primary" type="button" id="need-topup" tabindex="-1">${t.complement}</button>`;
  return `
    <section class="demo-card demo-card--task" id="need" data-surface="deep" aria-label="Créditos para esta estadia">
      <p class="lx-eyebrow">Créditos para esta estadia</p>
      <p class="lx-title">${title}</p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos necessários</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(needed)}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Saldo válido disponível</dt><dd class="lx-evidence__value">${credits(available)}</dd></div>
        ${missing ? `<div class="lx-evidence__item"><dt class="lx-evidence__label">Créditos adicionais necessários</dt><dd class="lx-evidence__value">${credits(missing)}</dd></div>` : ''}
      </dl>
      ${decision}
    </section>`;
}

/** Valores de cada etapa da seleção (fonte única: as datas selecionadas). */
export function selectionStates(dep, selections, needed) {
  return selections.map((nights) => {
    const added = creditsOfSelection(dep.eligible, nights);
    const projected = dep.priorAvailable + added;
    return { nights, added, projected, afterUse: projected - needed };
  });
}

const swapSpans = (prefix, values) =>
  values.map((v, i) => `<span id="${prefix}-${i}">${v}</span>`).join('');

/**
 * Cartão 2a — controle "Créditos adicionais desejados", saldo projetado e saldo após o uso. Neste protótipo o controle
 * é coreografado para o vídeo (role="slider" fora da ordem de foco, valores acessíveis atualizados pela linha do tempo);
 * não é um controle interativo. A lógica que ele representa (metas, sugestão, sincronia) está em rules.js e é testada.
 * No produto: foco visível do DS; setas e Page Up/Down andam entre as metas alcançáveis; Home/End vão a 0 e ao máximo.
 */
export function topupCard(dep, states) {
  const max = dep.stops.at(-1).credits;
  const after = (st) =>
    st.afterUse >= 0 ? credits(st.afterUse) : `faltam ${credits(-st.afterUse)}`;
  // Uma marca por meta alcançável na trilha; rótulos só nas pontas (as metas próximas não se atropelam).
  const marks = dep.stops
    .map((s) => `<span class="demo-slider__stop" style="--at: ${s.credits / max}"></span>`)
    .join('');
  const hint = dep.minimum
    ? `Mínimo para esta reserva: ${credits(dep.minimum.credits)} (${dep.minimum.nights.length} ${dep.minimum.nights.length === 1 ? 'data' : 'datas'}). O que passar disso fica no saldo para as próximas experiências.`
    : 'Valores possíveis com datas inteiras.';
  return `
    <section class="demo-card demo-card--ctx" id="topup" data-surface="deep" aria-label="Complementar saldo">
      <p class="lx-eyebrow">Complementar saldo</p>
      <div class="demo-slider-field">
        <div class="demo-slider-head">
          <span class="lx-label" id="topup-label">Créditos adicionais desejados</span>
          <span class="demo-slider-value"><span class="demo-figure">${swapSpans(
            'tv',
            states.map((s) => credits(s.added)),
          )}</span><span class="demo-unit">Créditos</span></span>
        </div>
        <div class="demo-slider" id="topup-slider" role="slider" tabindex="-1" aria-labelledby="topup-label" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${states[0].added}" aria-valuetext="${credits(states[0].added)} Créditos" style="--pos: 0; --need: ${dep.shortfall / max}">
          <span class="demo-slider__track"></span>
          <span class="demo-slider__fill"></span>
          ${marks}
          ${dep.shortfall ? '<span class="demo-slider__need" aria-hidden="true"></span>' : ''}
          <span class="demo-slider__thumb"></span>
        </div>
        <div class="demo-slider-scale" aria-hidden="true"><span>0</span><span>${credits(max)}</span></div>
        <p class="demo-hint">${hint}</p>
      </div>
      <ul class="demo-picks" aria-label="Créditos por data elegível">
        ${dep.eligible.map((d) => `<li data-pick="${d.night}">${icon('i-check')}<span>${civilFull(d.night).slice(0, 5)}</span><span>${credits(d.credits)}</span></li>`).join('')}
      </ul>
      <dl class="demo-legend">
        <div><dt>Saldo projetado</dt><dd>${swapSpans(
          'tp',
          states.map((s) => credits(s.projected)),
        )}</dd></div>
        <div><dt>Após esta reserva</dt><dd>${swapSpans('ta', states.map(after))}</dd></div>
      </dl>
    </section>`;
}

function depositMonth(ym, days, role, { first, last }) {
  const t = ROLE_TEXT[role];
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const cells = [...Array(start.getUTCDay()).fill('<td></td>')];
  for (const d of days.filter((x) => x.night.startsWith(ym))) {
    const state =
      d.status === DEPOSIT_STATUS.committed
        ? 'unavailable'
        : [DEPOSIT_STATUS.eligible, DEPOSIT_STATUS.reservedUnavailable].includes(d.status)
          ? 'mine'
          : '';
    const name = `${DAY_LONG.format(new Date(`${d.night}T00:00:00Z`))}, ${t.dayName[d.status]}${d.credits ? `, ${credits(d.credits)} Créditos` : ''}`;
    cells.push(
      `<td data-deposit-day="${d.night}" data-deposit="${d.status}"${state ? ` data-state="${state}"` : ''}><span class="lx-calendar__day" aria-label="${name}"><span class="lx-calendar__number">${Number(d.night.slice(8))}</span></span></td>`,
    );
  }
  while (cells.length % 7) cells.push('<td></td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  const title = MONTH.format(start);
  const nav = (dir, enabled) =>
    `<button class="lx-calendar__nav-button" type="button" tabindex="-1" aria-label="${dir === 'prev' ? 'Mês anterior' : 'Próximo mês'}"${enabled ? ` id="dm-${dir}-${ym}"` : ' disabled'}>${icon(dir === 'prev' ? 'i-prev' : 'i-next', '')}</button>`;
  return `
    <div class="lx-calendar__month" id="dm-${ym}">
      <div class="lx-calendar__header">
        ${nav('prev', !first)}
        <h2 class="lx-calendar__title demo-month-title">${title}<span class="demo-season">${seasonOf(ym)}</span></h2>
        ${nav('next', !last)}
      </div>
      <table class="lx-calendar__table">
        <caption>${title}, datas ${t.source}</caption>
        <thead><tr>${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<th scope="col">${d}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

/** Cartão 2b — acordeão aberto com o calendário navegável do Direito de Uso, legenda acessível e a ação de depósito. */
export function datesCard(dep, states, { action }) {
  const t = ROLE_TEXT[dep.role];
  const months = dep.months
    .map((ym, i) =>
      depositMonth(ym, dep.days, dep.role, { first: i === 0, last: i === dep.months.length - 1 }),
    )
    .join('');
  const legend = Object.entries(t.legend)
    .map(
      ([key, label]) =>
        `<li class="lx-calendar__legend-item"><span class="lx-calendar__swatch demo-swatch" data-swatch="${key}"></span>${label}</li>`,
    )
    .join('');
  return `
    <section class="demo-card demo-card--task demo-card--dates" id="dates" data-surface="deep" aria-label="${t.accordion}">
      <details class="lx-disclosure demo-accordion" open>
        <summary class="lx-disclosure__summary">${t.accordion}${icon('i-next', 'demo-icon lx-disclosure__icon')}</summary>
        <div class="lx-calendar demo-deposit-cal">
          <div class="demo-swap">${months}</div>
          <ul class="lx-calendar__legend">${legend}</ul>
        </div>
        <p class="demo-sync demo-only-9x16">
          <span>A gerar <strong class="demo-figure">${swapSpans(
            'ts',
            states.map((s) => credits(s.added)),
          )}</strong></span>
          <span>Saldo projetado <strong class="demo-figure">${swapSpans(
            'tq',
            states.map((s) => credits(s.projected)),
          )}</strong></span>
        </p>
      </details>
      <button class="lx-button lx-button--primary" type="button" id="deposit-go" tabindex="-1"${states[0].nights.length ? '' : ' aria-disabled="true"'}><span class="demo-swap"><span id="deposit-label">${action}</span><span id="deposit-busy">Confirmando o depósito</span></span></button>
    </section>`;
}

/** Cartão 3 — depósito confirmado (operação própria): novos Créditos e saldo disponível. */
export function depositedCard(dep, { next }) {
  return `
    <section class="demo-card demo-card--task" id="deposited" data-surface="deep" aria-label="Depósito confirmado">
      <p class="demo-state demo-state--done">${icon('i-check')}Depósito confirmado</p>
      <p><span class="lx-ordinal">${credits(dep.originated)}</span> <span class="demo-sub">novos Créditos</span></p>
      <dl class="lx-evidence">
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Datas depositadas</dt><dd class="demo-evidence-text">${nightsList(dep.selected)} · ${dep.secondHome.name}</dd></div>
        <div class="lx-evidence__item"><dt class="lx-evidence__label">Saldo disponível</dt><dd class="lx-evidence__value lx-evidence__value--strong">${credits(dep.afterDeposit)}</dd></div>
      </dl>
      <p class="demo-note">${icon('i-info')}<span>${ROLE_TEXT[dep.role].depositedNote}</span></p>
      <button class="lx-button lx-button--primary" type="button" id="deposited-next" tabindex="-1">${next}</button>
    </section>`;
}

/**
 * Coreografia da seleção a partir de uma lista de etapas {at, nights, via}: `via: 'slider'` (o controle vai à meta e o
 * calendário segue) ou `via: 'calendar'` (o toque na data move o controle). Gera, da mesma fonte, as células
 * selecionadas, a posição e o valor acessível do controle, e as trocas dos números (saída antes da entrada).
 */
export function selectionChoreography(dep, steps, { tween, needed }) {
  const max = dep.stops.at(-1).credits;
  const states = selectionStates(dep, [[], ...steps.map((s) => s.nights)], needed);
  const enter = [];
  const set = [];
  const tweens = [];
  const valueIds = ['tv', 'tp', 'ta', 'ts', 'tq'];
  // A linha do tempo é a fonte do estado em cada quadro (stage.js remove o atributo antes do primeiro passo): sem datas,
  // a ação de depósito começa desabilitada.
  if (!states[0].nights.length)
    set.push({ sel: '#deposit-go', attr: 'aria-disabled', at: ALWAYS, value: 'true' });
  states.forEach((state, i) => {
    const at = i === 0 ? ALWAYS : steps[i - 1].at;
    const out = i < steps.length ? steps[i].at : undefined;
    for (const id of valueIds)
      enter.push({ sel: `#${id}-${i}`, in: i === 0 ? ALWAYS : at + EXIT, ...(out ? { out } : {}) });
    if (i === 0) return;
    const step = steps[i - 1];
    const prev = states[i - 1];
    // O valor acompanha o controle: posição animada, valor acessível no fim do movimento.
    tweens.push({
      sel: '#topup-slider',
      prop: '--pos',
      at,
      from: prev.added / max,
      to: state.added / max,
    });
    set.push(
      { sel: '#topup-slider', attr: 'aria-valuenow', at: at + EXIT, value: String(state.added) },
      {
        sel: '#topup-slider',
        attr: 'aria-valuetext',
        at: at + EXIT,
        value: `${credits(state.added)} Créditos`,
      },
    );
    // Datas novas na seleção: no toque (calendário) ou quando o controle chega à meta (metade do movimento).
    const selectedAt = step.via === 'slider' ? at + tween / 2 : at;
    // A ação de depósito só fica habilitada com pelo menos uma data selecionada (sem datas, não há o que depositar).
    if (!prev.nights.length !== !state.nights.length)
      set.push({
        sel: '#deposit-go',
        attr: 'aria-disabled',
        at: selectedAt,
        value: state.nights.length ? null : 'true',
      });
    for (const night of state.nights.filter((n) => !prev.nights.includes(n)))
      set.push(
        {
          sel: `[data-deposit-day="${night}"]`,
          attr: 'data-selected',
          at: selectedAt,
          value: true,
        },
        { sel: `[data-pick="${night}"]`, attr: 'data-selected', at: selectedAt, value: true },
      );
  });
  return { enter, set, tween: tweens, states };
}

/** Mês fora de cena no vídeo: continua navegável no produto (botões de mês), mas nunca entra no quadro. */
const OFFSTAGE = Number.POSITIVE_INFINITY;

/**
 * O calendário do depósito abre no primeiro mês com data elegível: é onde estão as datas que o controle oferece, sem um
 * passo de navegação antes. Os demais meses do Direito de Uso seguem acessíveis pelos botões de mês.
 */
export function openingMonth(dep) {
  const month =
    dep.months.find((ym) =>
      dep.days.some((d) => d.night.startsWith(ym) && d.status === DEPOSIT_STATUS.eligible),
    ) ?? dep.months[0];
  return {
    month,
    enter: dep.months.map((ym) => ({ sel: `#dm-${ym}`, in: ym === month ? ALWAYS : OFFSTAGE })),
  };
}

/** Navegação do calendário: toque no "próximo mês", saída do mês atual e entrada do seguinte. */
export function monthNavigation(dep, at) {
  const [from, to] = dep.months;
  return {
    enter: [
      { sel: `#dm-${from}`, in: ALWAYS, out: at + 100 },
      { sel: `#dm-${to}`, in: at + 100 + EXIT + 20 },
    ],
    set: press(`#dm-next-${from}`, at),
  };
}
