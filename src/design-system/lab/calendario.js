// Lab — protótipo E5a do seletor híbrido de período (W12). Dados FICTÍCIOS; a "prévia" aqui imita a do servidor só para
// demonstrar a interface. No app (E5b), o componente React recebe a disponibilidade do servidor e a prévia é calculada
// e conferida no servidor — o calendário nunca decide disponibilidade, janela ou saldo (03 §13).
// Interação: 1º toque = entrada; 2º = saída (posterior; a noite da saída não é usada, PD-002). Com a entrada escolhida,
// datas posteriores que não servem de saída ficam sem ação e, tocadas, explicam o limite e oferecem "Usar dd/mm como
// entrada" — nada é ajustado em silêncio.
// Campos de data nativos sempre sincronizados. Teclado adaptado do WAI-ARIA APG (grade de datas) a um calendário inline:
// setas, Home/End, PageUp/PageDown (mês), Shift+PageUp/PageDown (ano), Enter/Espaço escolhem; Tab sai da grade.
(() => {
  const DAY = 86_400_000;
  const MAX_STAY = 14; // BR-111, TECH-045 (Co-Owner)
  const PREVIEW_DELAY_MS = 450; // latência simulada da prévia do servidor
  const root = document.querySelector('[data-calendar]');
  if (!root) return;

  const toDate = (s) => new Date(`${s}T00:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const add = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const diff = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const ym = (s) => s.slice(0, 7);
  const addMonths = (month, n) => {
    const d = toDate(`${month}-01`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return ym(iso(d));
  };
  const lastDay = (month) => add(`${addMonths(month, 1)}-01`, -1);
  const fmt = (options) => new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' });
  const longDate = (s) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(s));
  const shortDate = (s) => fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(s));
  const compactDate = (s) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(s));
  const weekdayDay = (s) => `${fmt({ weekday: 'short' }).format(toDate(s))}, ${dayMonth(s)}`;
  const dayMonth = (s) => fmt({ day: '2-digit', month: '2-digit' }).format(toDate(s));
  const fullDate = (s) => fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(s));
  const monthName = (month) => fmt({ month: 'long', year: 'numeric' }).format(toDate(`${month}-01`));
  const WEEKDAYS = [
    ['dom', 'domingo'], ['seg', 'segunda-feira'], ['ter', 'terça-feira'], ['qua', 'quarta-feira'],
    ['qui', 'quinta-feira'], ['sex', 'sexta-feira'], ['sáb', 'sábado'],
  ];

  // Classificação canônica (TECH-041): janeiro, julho, dezembro e a janela de Carnaval; 29/02 é Média/Baixa com bucket
  // próprio. Carnaval de 2028 (terça 29/02) e de 2029 (terça 13/02), dez datas válidas sem o 29/02.
  const CARNIVAL = new Set([
    '2028-02-25', '2028-02-26', '2028-02-27', '2028-02-28', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04',
    '2028-03-05', '2028-03-06', '2029-02-09', '2029-02-10', '2029-02-11', '2029-02-12', '2029-02-13', '2029-02-14',
    '2029-02-15', '2029-02-16', '2029-02-17', '2029-02-18',
  ]);
  const isLeapDay = (s) => s.endsWith('-02-29');
  const leapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const season = (s) => (['01', '07', '12'].includes(s.slice(5, 7)) || CARNIVAL.has(s) ? 'alta' : 'media');
  const bucketOf = (s) => (isLeapDay(s) ? 'leap' : season(s));
  const BUCKET = { alta: 'Alta/Super Alta', media: 'Média/Baixa', leap: '29/02' };

  const coOwner = {
    role: 'co_owner',
    context: 'Casa Ipê · Co-Owner · Ação de Ana Souza, que você representa',
    today: '2028-02-04',
    sealedFrom: '2028-01-01',
    sealedUntil: '2029-12-31',
    windows: { 2028: '2027-09-15', 2029: '2028-09-15' },
    granted: { alta: 48, media: 128 },
    remaining: { 2028: { alta: 41, media: 121, leap: 1 }, 2029: { alta: 48, media: 128, leap: 0 } },
    leapBeneficiary: true,
    mine: [['2028-02-07', '2028-02-10']],
    others: [['2028-02-14', '2028-02-17'], ['2028-03-20', '2028-03-22']],
  };
  const SCENARIOS = {
    'co-owner': coOwner,
    'co-owner-fechada': { ...coOwner, today: '2027-09-10', windows: { 2028: '2027-09-22', 2029: '2028-09-22' }, mine: [] },
    'co-owner-saldo': { ...coOwner, remaining: { 2028: { alta: 1, media: 121, leap: 1 }, 2029: coOwner.remaining[2029] } },
    'co-owner-29': { ...coOwner, leapBeneficiary: false, remaining: { 2028: { alta: 41, media: 121, leap: 0 }, 2029: coOwner.remaining[2029] } },
    'co-owner-virada': { ...coOwner, today: '2028-10-02', mine: [['2028-12-20', '2028-12-24']] },
    'co-owner-instavel': { ...coOwner, previewFailures: 1 },
    owner: {
      role: 'owner',
      context: 'Casa Jacarandá · Owner · propriedade integral de Bruno Lima, que você representa',
      today: '2028-02-04',
      sealedFrom: '2028-01-01',
      sealedUntil: '2029-12-31',
      mine: [['2028-04-01', '2028-04-08']],
      others: [['2028-05-10', '2028-05-13']],
    },
    carregando: { load: 'loading' },
    erro: { load: 'error' },
    vazio: { load: 'empty' },
  };

  const params = new URLSearchParams(window.location.search);
  const select = document.getElementById('cenario');
  const checkinInput = document.getElementById('entrada');
  const checkoutInput = document.getElementById('saida');
  const statusEl = document.querySelector('[data-status]');
  const summaryEl = document.querySelector('[data-summary]');
  const issuesEl = document.querySelector('[data-issues]');
  const confirmEl = document.querySelector('[data-confirm]');
  const retryEl = document.querySelector('[data-retry]');
  const selectionTextEl = document.querySelector('[data-selection-text]');
  const clearEl = document.querySelector('[data-clear]');
  const restartEl = document.querySelector('[data-restart]');
  const legendEl = document.querySelector('[data-legend]');

  let sc;
  let checkin = null;
  let checkout = null;
  let anchor = null; // primeiro mês visível
  let focusDate = null;
  let preview = null; // { checkin, checkout, ok, … }
  let previewToken = 0;
  let previewFailures = 0; // cenário de servidor indisponível na prévia
  let guidance = null; // explicação de um dia sem ação tocado; some na próxima ação
  let restartDate = null; // data tocada além do limite da saída: oferecida como nova entrada, nunca aplicada sozinha

  const inRanges = (ranges, s) => ranges.some(([a, b]) => s >= a && s < b);
  const firstMonth = () => ym(sc.today > sc.sealedFrom ? sc.today : sc.sealedFrom);
  const lastMonth = () => ym(sc.sealedUntil);
  // Dois meses quando cada um comporta sete alvos mínimos (41rem, como a container query do CSS).
  const visibleCount = () =>
    root.clientWidth >= 41 * parseFloat(getComputedStyle(document.documentElement).fontSize) ? 2 : 1;

  // Situação e disponibilidade da noite (camadas 1 e 2 da hierarquia).
  function nightStatus(s) {
    if (s < sc.sealedFrom || s > sc.sealedUntil) return 'outside';
    if (s < sc.today) return 'past';
    if (inRanges(sc.mine, s)) return 'mine';
    if (inRanges(sc.others, s)) return 'unavailable';
    if (sc.role === 'co_owner') {
      if (sc.today < sc.windows[s.slice(0, 4)]) return 'closed';
      if (isLeapDay(s) && !sc.leapBeneficiary) return 'leap-other';
    }
    return 'available';
  }
  // O motivo, na linguagem do Titular — nunca quem ocupa a noite.
  const STATUS_TEXT = {
    available: 'disponível',
    unavailable: 'indisponível',
    mine: 'sua reserva',
    past: 'já passou',
    outside: 'fora do calendário aberto',
  };
  const statusText = (s, status) => {
    if (status === 'closed') return `sua janela de ${s.slice(0, 4)} abre em ${fullDate(sc.windows[s.slice(0, 4)])}`;
    if (status === 'leap-other') return `não faz parte do seu Direito de Uso em ${s.slice(0, 4)}`;
    return STATUS_TEXT[status];
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // "20/03", "20/03 e 21/03", "20/03, 21/03 e 22/03"; sequência longa vira "de 01/03 a 20/03".
  function dateList(dates) {
    if (dates.length > 3 && diff(dates[0], dates.at(-1)) === dates.length - 1)
      return `de ${dayMonth(dates[0])} a ${dayMonth(dates.at(-1))}`;
    const parts = dates.map(dayMonth);
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
  }

  // Reservas próprias adjacentes contam para a permanência (BR-112).
  function mineRunBefore(s) {
    let n = 0;
    while (inRanges(sc.mine, add(s, -n - 1))) n += 1;
    return n;
  }
  function mineRunFrom(s) {
    let n = 0;
    while (inRanges(sc.mine, add(s, n))) n += 1;
    return n;
  }
  const stayWith = (start, end) =>
    sc.role === 'co_owner' ? mineRunBefore(start) + diff(start, end) + mineRunFrom(end) : diff(start, end);

  // Saída válida: posterior à entrada, só noites disponíveis no meio — a própria data de saída pode ser uma noite
  // indisponível (PD-002) — e, no Co-Owner, permanência de até 14 noites com as adjacentes.
  function validCheckout(start, end) {
    if (end <= start || end > add(sc.sealedUntil, 1)) return false;
    for (let s = start; s < end; s = add(s, 1)) if (nightStatus(s) !== 'available') return false;
    return sc.role !== 'co_owner' || stayWith(start, end) <= MAX_STAY;
  }
  const phase = () => (checkin !== null && checkout === null ? 'checkout' : 'checkin');

  // Saída mais distante para uma entrada — para orientar o Titular, nunca para ajustar a escolha.
  function maxCheckout(start) {
    let best = null;
    for (let end = add(start, 1); end <= add(sc.sealedUntil, 1); end = add(end, 1)) {
      if (nightStatus(add(end, -1)) !== 'available') break;
      if (sc.role === 'co_owner' && stayWith(start, end) > MAX_STAY) break;
      best = end;
    }
    return best;
  }
  function checkoutLimitReason(start, limit) {
    const status = nightStatus(limit);
    if (status === 'available' && sc.role === 'co_owner') return `o máximo é de ${MAX_STAY} noites seguidas`;
    if (status === 'mine') return `a noite de ${dayMonth(limit)} já é sua reserva`;
    if (status === 'closed') return `a janela de ${limit.slice(0, 4)} ainda não abriu`;
    if (status === 'leap-other') return `o 29/02 não faz parte do seu Direito de Uso em ${limit.slice(0, 4)}`;
    if (status === 'outside') return 'o calendário aberto termina aí';
    return `a noite de ${dayMonth(limit)} está indisponível`;
  }
  function explain(s) {
    const status = nightStatus(s);
    if (phase() === 'checkout' && s > checkin && status !== 'past') {
      const limit = maxCheckout(checkin);
      if (limit) return `Com entrada em ${dayMonth(checkin)}, a saída pode ser até ${dayMonth(limit)}: ${checkoutLimitReason(checkin, limit)}.`;
    }
    return `${dayMonth(s)}: ${statusText(s, status)}.`;
  }

  // Com a entrada escolhida: ela mesma (desfaz), uma saída válida ou uma data anterior disponível (nova entrada).
  function selectable(s) {
    const status = nightStatus(s);
    if (phase() === 'checkout') return s === checkin || validCheckout(checkin, s) || (s < checkin && status === 'available');
    return status === 'available';
  }

  function dayLabel(s) {
    const status = nightStatus(s);
    const parts = [longDate(s)];
    if (sc.role === 'co_owner' && status !== 'outside') {
      if (isLeapDay(s) && sc.leapBeneficiary) parts.push('29/02, seu direito extraordinário');
      else parts.push(BUCKET[season(s)]);
    }
    parts.push(statusText(s, status));
    if (phase() === 'checkout' && status !== 'available' && validCheckout(checkin, s)) parts.push('pode ser a data de saída');
    if (phase() === 'checkout' && s > checkin && status === 'available' && !validCheckout(checkin, s))
      parts.push('não pode ser a saída desta entrada');
    if (s === checkin) parts.push('entrada selecionada');
    else if (s === checkout) parts.push('saída selecionada');
    else if (checkin && checkout && s > checkin && s < checkout) parts.push('noite do período selecionado');
    return parts.join(', ');
  }

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children) node.append(child);
    return node;
  };

  function monthTable(month, nav) {
    const titleId = `mes-${month}`;
    const first = `${month}-01`;
    const lead = toDate(first).getUTCDay();
    const days = diff(first, add(lastDay(month), 1));
    const tbody = el('tbody');
    let row = el('tr');
    for (let i = 0; i < lead; i += 1) row.append(el('td'));
    for (let d = 0; d < days; d += 1) {
      const s = add(first, d);
      const status = nightStatus(s);
      let range = null;
      if (s === checkin) range = 'start';
      else if (s === checkout) range = 'end';
      else if (checkin && checkout && s > checkin && s < checkout) range = 'night';
      const showSeason = sc.role === 'co_owner' && season(s) === 'alta' && !isLeapDay(s);
      const button = el(
        'button',
        {
          class: 'lx-calendar__day',
          type: 'button',
          tabindex: s === focusDate ? '0' : '-1',
          'data-date': s,
          'aria-label': dayLabel(s),
          'aria-disabled': selectable(s) ? null : 'true',
        },
        [el('span', { class: 'lx-calendar__number', text: String(d + 1) })],
      );
      row.append(
        el('td', { 'data-state': status === 'available' ? null : status, 'data-season': showSeason ? 'alta' : null, 'data-range': range }, [button]),
      );
      if ((lead + d + 1) % 7 === 0) {
        tbody.append(row);
        row = el('tr');
      }
    }
    if (row.children.length > 0) {
      while (row.children.length < 7) row.append(el('td'));
      tbody.append(row);
    }
    const head = el('tr', {}, WEEKDAYS.map(([short, long]) => el('th', { scope: 'col', abbr: long, text: short })));
    const notes = [];
    const year = month.slice(0, 4);
    if (sc.role === 'co_owner' && sc.today < sc.windows[year])
      notes.push(el('p', { class: 'lx-calendar__note', text: `Sua janela de ${year} abre em ${fullDate(sc.windows[year])}.` }));
    return el('div', { class: 'lx-calendar__month' }, [
      el('div', { class: 'lx-calendar__header' }, [
        nav.prev ?? el('span', { 'aria-hidden': 'true' }),
        el('h3', { class: 'lx-calendar__title', id: titleId, text: monthName(month) }),
        nav.next ?? el('span', { 'aria-hidden': 'true' }),
      ]),
      ...notes,
      el('table', { class: 'lx-calendar__table', 'aria-labelledby': titleId }, [el('thead', {}, [head]), tbody]),
    ]);
  }

  // Legenda mínima: quatro estados por cor; o traço de Alta/Super Alta só quando aparece nos meses exibidos (Co-Owner).
  function legend(months) {
    const item = (text, attrs = {}) =>
      el('li', { class: 'lx-calendar__legend-item' }, [el('span', { class: 'lx-calendar__swatch', 'aria-hidden': 'true', ...attrs }), text]);
    const items = [
      item('Disponível'),
      item('Indisponível', { 'data-state': 'unavailable' }),
      item('Sua reserva', { 'data-state': 'mine' }),
      item('Selecionado', { 'data-range': 'start' }),
    ];
    const visible = months.flatMap((month) => {
      const first = `${month}-01`;
      return Array.from({ length: diff(first, add(lastDay(month), 1)) }, (_, i) => add(first, i));
    });
    if (sc.role === 'co_owner' && visible.some((s) => season(s) === 'alta' && !isLeapDay(s)))
      items.push(item('Alta/Super Alta', { 'data-season': 'alta' }));
    return items;
  }

  function navButton(direction, disabled) {
    const label = direction < 0 ? 'Mês anterior' : 'Próximo mês';
    const button = el('button', { class: 'lx-calendar__nav-button', type: 'button', 'aria-label': label, disabled }, []);
    button.innerHTML = `<svg aria-hidden="true" focusable="false"><use href="#i-${direction < 0 ? 'prev' : 'next'}"/></svg>`;
    button.addEventListener('click', () => {
      anchor = addMonths(anchor, direction);
      guidance = null;
      restartDate = null;
      render();
    });
    return button;
  }

  function messageBox(kind, title, body, action) {
    const box = el('div', { class: `lx-message lx-message--${kind}`, role: kind === 'error' ? 'alert' : 'status' });
    box.innerHTML = '<svg class="lx-message__icon" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg>';
    box.append(el('p', { class: 'lx-message__title', text: title }), el('p', { class: 'lx-message__body', text: body }));
    if (action) box.append(action);
    return box;
  }

  function render() {
    root.replaceChildren();
    legendEl.replaceChildren();
    renderSelection();
    if (sc.load === 'loading') {
      const month = el('div', { class: 'lx-calendar__month' }, [
        el('h3', { class: 'lx-calendar__title', text: 'Carregando disponibilidade…' }),
        el('table', { class: 'lx-calendar__table', 'aria-busy': 'true', 'aria-label': 'Carregando disponibilidade' }, [
          el('tbody', {}, Array.from({ length: 5 }, () => el('tr', {}, Array.from({ length: 7 }, () => el('td'))))),
        ]),
      ]);
      root.append(el('div', { class: 'lx-calendar__months' }, [month]));
      return;
    }
    if (sc.load === 'error') {
      const retry = el('button', { class: 'lx-button lx-button--quiet', type: 'button', text: 'Tentar de novo' });
      retry.addEventListener('click', () => load('co-owner'));
      root.append(messageBox('error', 'Não foi possível carregar a disponibilidade.', 'Tente de novo em instantes.', retry));
      return;
    }
    if (sc.load === 'empty') {
      root.append(messageBox('info', 'Ainda não há noites abertas no calendário.', 'Elas aparecem quando o exercício da Second Home é aberto.'));
      return;
    }
    const count = visibleCount();
    const minMonth = firstMonth();
    const maxMonth = addMonths(lastMonth(), 1 - count);
    if (anchor < minMonth) anchor = minMonth;
    if (anchor > maxMonth) anchor = maxMonth < minMonth ? minMonth : maxMonth;
    const months = Array.from({ length: count }, (_, i) => addMonths(anchor, i));
    const visibleFirst = `${months[0]}-01`;
    const visibleLast = lastDay(months.at(-1));
    if (!focusDate || focusDate < visibleFirst || focusDate > visibleLast) {
      const candidate = checkin && checkin >= visibleFirst && checkin <= visibleLast ? checkin : null;
      focusDate = candidate ?? (sc.today >= visibleFirst && sc.today <= visibleLast ? sc.today : visibleFirst);
    }
    const prev = navButton(-1, anchor <= minMonth);
    const next = navButton(1, anchor >= maxMonth);
    const tables = months.map((month, i) =>
      monthTable(month, { prev: i === 0 ? prev : null, next: i === months.length - 1 ? next : null }),
    );
    root.append(
      el('p', { class: 'lx-visually-hidden', 'aria-live': 'polite', text: `Mostrando ${months.map(monthName).join(' e ')}` }),
      el('div', { class: 'lx-calendar__months' }, tables),
    );
    legendEl.replaceChildren(...legend(months));
  }

  // Retorno logo abaixo da grade: o que foi escolhido e o próximo passo (com o limite da saída, quando há).
  function renderSelection() {
    clearEl.hidden = Boolean(sc.load) || !(checkin || checkout);
    restartEl.hidden = Boolean(sc.load) || !restartDate;
    restartEl.textContent = restartDate ? `Usar ${dayMonth(restartDate)} como entrada` : '';
    if (sc.load) selectionTextEl.textContent = '';
    else if (guidance) selectionTextEl.textContent = guidance;
    else if (checkin && !checkout) {
      const limit = maxCheckout(checkin);
      const bounded = limit && limit < add(sc.sealedUntil, 1);
      selectionTextEl.textContent = `Entrada em ${weekdayDay(checkin)}. Agora escolha a saída${bounded ? `, até ${dayMonth(limit)}` : ''}.`;
    } else if (checkin && checkout && checkout > checkin)
      selectionTextEl.textContent = `Entrada ${dayMonth(checkin)}, saída ${dayMonth(checkout)}: ${plural(diff(checkin, checkout), 'noite', 'noites')}.`;
    else selectionTextEl.textContent = '';
  }

  function focusDay(s) {
    guidance = null;
    restartDate = null;
    const visibleFirst = `${anchor}-01`;
    const visibleLast = lastDay(addMonths(anchor, visibleCount() - 1));
    if (s < `${firstMonth()}-01` || s > lastDay(lastMonth())) return;
    focusDate = s;
    if (s < visibleFirst) anchor = ym(s);
    else if (s > visibleLast) anchor = addMonths(ym(s), 1 - visibleCount());
    render();
    root.querySelector(`[data-date="${s}"]`)?.focus();
  }

  function setSelection(start, end, announce) {
    guidance = null;
    restartDate = null;
    checkin = start;
    checkout = end;
    checkinInput.value = start ?? '';
    checkoutInput.value = end ?? '';
    if (start) focusDate = start;
    render();
    updateSummary(announce);
  }

  function choose(s) {
    if (!selectable(s)) {
      guidance = explain(s);
      // Entrada errada: a data tocada além do limite vira uma oferta explícita de nova entrada (um toque), não um reinício.
      restartDate = phase() === 'checkout' && s > checkin && nightStatus(s) === 'available' ? s : null;
      renderSelection();
      return;
    }
    if (phase() === 'checkout') {
      if (s === checkin) setSelection(null, null, true);
      else if (validCheckout(checkin, s)) setSelection(checkin, s, true);
      else setSelection(s, null, true); // anterior à entrada: nova entrada
    } else setSelection(s, null, true);
    focusDate = s;
    root.querySelector(`[data-date="${s}"]`)?.focus();
  }

  // Prévia simulada (no app: do servidor). Nunca ajusta datas: diz o motivo e o que fazer. Período impossível não mostra
  // saldo projetado.
  function computePreview(start, end) {
    if (end <= start) return { ok: false, issues: ['A saída precisa ser depois da entrada.'], nights: [] };
    const issues = [];
    const nights = [];
    for (let s = start; s < end; s = add(s, 1)) nights.push(s);
    const blocked = (kind) => nights.filter((s) => nightStatus(s) === kind);
    const past = blocked('past');
    if (past.length)
      issues.push(`${dateList(past)} já ${past.length === 1 ? 'passou' : 'passaram'}. Escolha uma entrada a partir de ${dayMonth(sc.today)}.`);
    if (blocked('outside').length) issues.push(`O calendário está aberto até ${fullDate(sc.sealedUntil)}.`);
    const unavailable = blocked('unavailable');
    if (unavailable.length)
      issues.push(`${dateList(unavailable)} ${unavailable.length === 1 ? 'está indisponível' : 'estão indisponíveis'}.`);
    if (blocked('mine').length) issues.push(`Você já tem reserva em ${dateList(blocked('mine'))}.`);
    for (const year of new Set(blocked('closed').map((s) => s.slice(0, 4))))
      issues.push(`Sua janela de ${year} abre em ${fullDate(sc.windows[year])}; até lá, as noites de ${year} não podem ser reservadas.`);
    for (const s of blocked('leap-other'))
      issues.push(`O 29/02/${s.slice(0, 4)} não faz parte do seu Direito de Uso neste exercício. Ele pode ser a data de saída, mas não uma noite da reserva.`);
    let stay = nights.length;
    if (sc.role === 'co_owner') {
      stay = stayWith(start, end);
      if (stay > MAX_STAY)
        issues.push(stay === nights.length
          ? `Seriam ${stay} noites seguidas; o máximo é ${MAX_STAY}.`
          : `Somando sua reserva adjacente, seriam ${stay} noites seguidas; o máximo é ${MAX_STAY}.`);
    }
    // O que fazer: a saída mais distante para esta entrada (uma vez só), ou outra entrada.
    if (issues.length && !past.length) {
      const limit = nightStatus(start) === 'available' ? maxCheckout(start) : null;
      issues.push(limit ? `Com entrada em ${dayMonth(start)}, a saída pode ser até ${dayMonth(limit)}.` : 'Escolha outra data de entrada.');
    }
    const byBucket = new Map();
    for (const s of nights) {
      const key = `${s.slice(0, 4)}:${bucketOf(s)}`;
      byBucket.set(key, (byBucket.get(key) ?? 0) + 1);
    }
    const usage = [...byBucket].map(([key, count]) => {
      const [year, bucket] = key.split(':');
      return { year, bucket, count, left: sc.remaining?.[year]?.[bucket] ?? 0 };
    });
    if (sc.role === 'co_owner' && issues.length === 0)
      for (const u of usage)
        if (u.count > u.left)
          issues.push(`O período usa ${plural(u.count, 'noite', 'noites')} de ${BUCKET[u.bucket]} de ${u.year}, e você tem ${u.left} ${u.left === 1 ? 'disponível' : 'disponíveis'}. Faltam ${plural(u.count - u.left, 'noite', 'noites')} nessa categoria.`);
    return { ok: issues.length === 0, issues, nights, usage, stay };
  }

  function fact(label, value) {
    return el('div', { class: 'lx-booking__fact' }, [el('dt', { text: label }), el('dd', { text: value })]);
  }

  function showPreview(result) {
    const n = result.nights.length;
    const period = checkin.slice(0, 4) === checkout.slice(0, 4)
      ? `${compactDate(checkin)}, 14h → ${compactDate(checkout)}, 10h · ${checkin.slice(0, 4)}`
      : `${shortDate(checkin)}, 14h → ${shortDate(checkout)}, 10h`;
    const rows = [fact('Período', period)];
    if (n > 0) rows.push(fact('Noites', `${n} · ${dateList(result.nights)}`));
    // Consumo e saldo que restará: só quando o período é possível.
    if (result.ok && sc.role === 'co_owner') {
      for (const u of result.usage)
        rows.push(u.bucket === 'leap'
          ? fact(`29/02/${u.year}`, 'usa seu direito extraordinário')
          : fact(`${BUCKET[u.bucket]} ${u.year}`, `usa ${plural(u.count, 'noite', 'noites')} · restarão ${u.left - u.count} de ${sc.granted[u.bucket]}`));
      if (result.stay > n) rows.push(fact('Noites seguidas', `${result.stay} de até ${MAX_STAY}, somando sua reserva adjacente`));
    }
    summaryEl.replaceChildren(...rows);
    summaryEl.hidden = false;
    issuesEl.replaceChildren(...result.issues.map((text) => el('li', { text })));
    issuesEl.hidden = result.issues.length === 0;
  }

  function updateSummary() {
    const token = ++previewToken;
    preview = null;
    confirmEl.disabled = true;
    retryEl.hidden = true;
    summaryEl.hidden = true;
    issuesEl.hidden = true;
    if (sc.load) {
      statusEl.textContent = { error: 'Não foi possível verificar agora.', loading: 'Carregando…', empty: 'Ainda não há noites abertas.' }[sc.load];
      return;
    }
    if (!checkin || !checkout) {
      statusEl.textContent = checkin ? 'Escolha a saída para ver a prévia.' : checkout ? 'Escolha também a entrada.' : 'Escolha a entrada e a saída.';
      return;
    }
    statusEl.textContent = 'Verificando o período…';
    const start = checkin;
    const end = checkout;
    window.setTimeout(() => {
      if (token !== previewToken) return; // datas mudaram: a prévia antiga não vale
      if (previewFailures < (sc.previewFailures ?? 0)) {
        previewFailures += 1;
        statusEl.textContent = 'Não foi possível verificar o período agora.';
        issuesEl.replaceChildren(el('li', { text: 'Suas datas foram mantidas. Tente de novo em instantes.' }));
        issuesEl.hidden = false;
        retryEl.hidden = false;
        return;
      }
      const result = computePreview(start, end);
      preview = { ...result, checkin: start, checkout: end };
      showPreview(result);
      statusEl.textContent = result.ok ? 'Período disponível.' : 'Não é possível reservar este período.';
      confirmEl.disabled = !(result.ok && preview.checkin === checkin && preview.checkout === checkout);
    }, PREVIEW_DELAY_MS);
  }
  retryEl.addEventListener('click', () => updateSummary());
  restartEl.addEventListener('click', () => {
    const s = restartDate;
    setSelection(s, null, true);
    root.querySelector(`[data-date="${s}"]`)?.focus();
  });
  clearEl.addEventListener('click', () => {
    setSelection(null, null, true);
    checkinInput.focus();
  });

  // Entrada direta: mesmas regras, sem ajuste silencioso.
  function fromInputs() {
    guidance = null;
    restartDate = null;
    const start = checkinInput.value || null;
    const end = checkoutInput.value || null;
    checkin = start;
    checkout = end;
    if (start) {
      focusDate = start;
      anchor = ym(start);
    }
    render();
    updateSummary();
  }
  checkinInput.addEventListener('change', fromInputs);
  checkoutInput.addEventListener('change', fromInputs);

  root.addEventListener('click', (event) => {
    const button = event.target.closest('.lx-calendar__day');
    if (button) choose(button.dataset.date);
  });

  root.addEventListener('keydown', (event) => {
    const button = event.target.closest('.lx-calendar__day');
    if (!button) return;
    const s = button.dataset.date;
    const weekday = toDate(s).getUTCDay();
    const sameDayIn = (month) => {
      const day = Math.min(Number(s.slice(8, 10)), Number(lastDay(month).slice(8, 10)));
      return `${month}-${String(day).padStart(2, '0')}`;
    };
    const moves = {
      ArrowLeft: () => add(s, -1),
      ArrowRight: () => add(s, 1),
      ArrowUp: () => add(s, -7),
      ArrowDown: () => add(s, 7),
      Home: () => add(s, -weekday),
      End: () => add(s, 6 - weekday),
      PageUp: () => sameDayIn(addMonths(ym(s), event.shiftKey ? -12 : -1)),
      PageDown: () => sameDayIn(addMonths(ym(s), event.shiftKey ? 12 : 1)),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDay(move());
  });

  confirmEl.addEventListener('click', () => {
    statusEl.textContent = 'Demonstração do Lab: no app, a confirmação vai ao servidor, que confere tudo de novo antes de reservar.';
  });

  // Estável durante a escolha (não muda ao navegar nem ao selecionar): a grade não se move sob o dedo.
  function renderRights() {
    const title = document.querySelector('[data-rights-title]');
    const rights = document.querySelector('[data-rights]');
    const note = document.querySelector('[data-rights-note]');
    document.querySelector('[data-context]').textContent = sc.context ?? 'Dados de demonstração';
    rights.replaceChildren();
    rights.hidden = true;
    if (sc.load) {
      title.textContent = 'Seu Direito de Uso';
      note.textContent = { loading: 'Carregando…', error: 'Indisponível no momento.', empty: 'Sem exercício aberto.' }[sc.load];
      return;
    }
    if (sc.role === 'owner') {
      title.textContent = 'Uso próprio';
      note.textContent = `Você pode reservar qualquer noite livre do calendário, aberto até ${fullDate(sc.sealedUntil)}, sem limite de noites seguidas.`;
      return;
    }
    // Linhas só para o exercício pertinente — os abertos ou, sem nenhum, o próximo a abrir; os demais vão à nota.
    const years = Object.keys(sc.windows).sort();
    const open = years.filter((year) => sc.today >= sc.windows[year]);
    const shown = open.length ? open : years.slice(0, 1);
    title.textContent = `Seu Direito de Uso em ${shown.join(' e ')}`;
    for (const year of shown) {
      if (!open.includes(year)) {
        rights.append(fact(`Janela de ${year}`, `abre em ${fullDate(sc.windows[year])}`));
        continue;
      }
      const suffix = shown.length > 1 ? ` ${year}` : '';
      const left = sc.remaining[year];
      rights.append(
        fact(`Alta/Super Alta${suffix}`, `${left.alta} ${left.alta === 1 ? 'disponível' : 'disponíveis'} de ${sc.granted.alta} noites`),
        fact(`Média/Baixa${suffix}`, `${left.media} ${left.media === 1 ? 'disponível' : 'disponíveis'} de ${sc.granted.media} noites`),
      );
      if (sc.leapBeneficiary && leapYear(Number(year)) && left.leap > 0)
        rights.append(fact(`29/02/${year}`, '1 noite · seu direito extraordinário'));
    }
    rights.hidden = false;
    const later = years.filter((year) => !shown.includes(year)).map((year) => `Janela de ${year}: abre em ${fullDate(sc.windows[year])}.`);
    note.textContent = [`Até ${MAX_STAY} noites seguidas, somando reservas suas adjacentes.`, ...later, `Calendário aberto até ${fullDate(sc.sealedUntil)}.`].join(' ');
  }

  function load(name) {
    sc = SCENARIOS[name] ?? coOwner;
    select.value = name in SCENARIOS ? name : 'co-owner';
    const live = !sc.load;
    checkinInput.disabled = false;
    checkoutInput.disabled = false;
    if (live) {
      checkinInput.min = sc.today;
      checkoutInput.min = add(sc.today, 1);
      checkinInput.max = sc.sealedUntil;
      checkoutInput.max = add(sc.sealedUntil, 1);
    }
    anchor = live ? firstMonth() : null;
    focusDate = null;
    previewFailures = 0;
    guidance = null;
    restartDate = null;
    renderRights();
    const start = params.get('entrada');
    const end = params.get('saida');
    if (params.get('mes') && live) anchor = params.get('mes');
    checkin = live ? start : null;
    checkout = live ? end : null;
    checkinInput.value = checkin ?? '';
    checkoutInput.value = checkout ?? '';
    if (checkin) {
      focusDate = checkin;
      if (!params.get('mes')) anchor = ym(checkin);
    }
    render();
    updateSummary();
  }

  select.addEventListener('change', () => {
    params.delete('entrada');
    params.delete('saida');
    params.delete('mes');
    load(select.value);
  });
  // Um mês no celular, dois quando cabem (o container decide): redesenha só quando essa contagem muda.
  let lastCount = 0;
  new ResizeObserver(() => {
    const count = visibleCount();
    if (count === lastCount || !sc || sc.load) return;
    lastCount = count;
    render();
  }).observe(root);
  load(params.get('cenario') ?? 'co-owner');
})();
