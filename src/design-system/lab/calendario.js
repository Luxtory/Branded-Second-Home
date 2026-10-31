// Lab — protótipo E5a do seletor híbrido de período (W12). Dados FICTÍCIOS; a "prévia" aqui imita a do servidor só para
// demonstrar a interface. No app (E5b), o componente React recebe a disponibilidade do servidor e a prévia é calculada
// e conferida no servidor — o calendário nunca decide disponibilidade, janela ou saldo (03 §13).
// Interação: 1º toque = entrada; 2º = saída (posterior; a saída não consome noite, PD-002); novo toque recomeça. Campos
// de data nativos sempre sincronizados. Teclado no padrão WAI-ARIA APG (setas, Home/End, PageUp/PageDown, Shift+Page).
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

  let sc;
  let checkin = null;
  let checkout = null;
  let anchor = null; // primeiro mês visível
  let focusDate = null;
  let preview = null; // { checkin, checkout, ok, … }
  let previewToken = 0;

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
  const STATUS_TEXT = {
    available: 'disponível',
    unavailable: 'indisponível',
    mine: 'sua reserva',
    past: 'noite passada',
    outside: 'fora do calendário aberto',
    'leap-other': 'direito extraordinário de outra Ação neste exercício',
  };
  const statusText = (s, status) =>
    status === 'closed' ? `sua janela de ${s.slice(0, 4)} abre em ${fullDate(sc.windows[s.slice(0, 4)])}` : STATUS_TEXT[status];

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

  function selectable(s) {
    const status = nightStatus(s);
    if (phase() === 'checkout') return s === checkin || validCheckout(checkin, s) || status === 'available';
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
      if (sc.role === 'co_owner' && isLeapDay(s) && sc.leapBeneficiary)
        button.append(el('span', { class: 'lx-calendar__mark', 'aria-hidden': 'true', text: '◆' }));
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

  function legend(months) {
    const item = (text, attrs, sample = '8') =>
      el('li', { class: 'lx-calendar__legend-item' }, [el('span', { class: 'lx-calendar__swatch', 'aria-hidden': 'true', ...attrs, text: sample }), text]);
    // Só o que está em tela: seleção quando existe; 29/02 quando aparece e a Ação tem o direito.
    const items = [
      item('Disponível', {}),
      item('Indisponível', { 'data-state': 'unavailable' }),
      item('Sua reserva', { 'data-state': 'mine' }),
    ];
    if (sc.role === 'co_owner') items.push(item('Alta/Super Alta', { 'data-season': 'alta' }));
    const visible = months.flatMap((month) => {
      const first = `${month}-01`;
      return Array.from({ length: diff(first, add(lastDay(month), 1)) }, (_, i) => add(first, i));
    });
    const inactive = new Set(visible.map(nightStatus).filter((status) => status === 'past' || status === 'closed'));
    if (inactive.size)
      items.push(item(inactive.has('closed') ? 'Sem ação: janela ainda não aberta' : 'Sem ação: noite passada', { 'data-inactive': 'true' }));
    if (sc.role === 'co_owner' && sc.leapBeneficiary && months.some((month) => month.endsWith('-02') && leapYear(Number(month.slice(0, 4)))))
      items.push(item('29/02: seu direito extraordinário', {}, '29◆'));
    if (checkin) items.push(item('Entrada', { 'data-range': 'start' }));
    if (checkin && checkout) items.push(item('Noites do período', { 'data-range': 'night' }), item('Saída (não consome noite)', { 'data-range': 'end' }));
    return el('ul', { class: 'lx-calendar__legend', 'aria-label': 'Legenda do calendário' }, items);
  }

  function navButton(direction, disabled) {
    const label = direction < 0 ? 'Mês anterior' : 'Próximo mês';
    const button = el('button', { class: 'lx-calendar__nav-button', type: 'button', 'aria-label': label, disabled }, []);
    button.innerHTML = `<svg aria-hidden="true" focusable="false"><use href="#i-${direction < 0 ? 'prev' : 'next'}"/></svg>`;
    button.addEventListener('click', () => {
      anchor = addMonths(anchor, direction);
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
      root.append(messageBox('error', 'Não foi possível carregar a disponibilidade.', 'As datas digitadas acima ainda podem ser verificadas.', retry));
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
      legend(months),
      el('p', { class: 'lx-calendar__note', text: `Calendário ${sc.role === 'owner' ? 'disponível' : 'aberto'} até ${fullDate(sc.sealedUntil)}.` }),
    );
    if (checkin) {
      const clear = el('button', { class: 'lx-calendar__clear', type: 'button', text: 'Limpar datas' });
      clear.addEventListener('click', () => setSelection(null, null, true));
      root.append(clear);
    }
  }

  function focusDay(s) {
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
      statusEl.textContent = `${dayMonth(s)}: ${statusText(s, nightStatus(s))}.`;
      return;
    }
    if (phase() === 'checkout') {
      if (s === checkin) setSelection(null, null, true);
      else if (validCheckout(checkin, s)) setSelection(checkin, s, true);
      else setSelection(s, null, true);
    } else setSelection(s, null, true);
    focusDate = s;
    root.querySelector(`[data-date="${s}"]`)?.focus();
  }

  // Prévia simulada (no app: do servidor). Nunca ajusta datas: aponta o problema.
  function computePreview(start, end) {
    const issues = [];
    if (end <= start) return { ok: false, issues: ['A saída precisa ser depois da entrada.'], nights: [] };
    const nights = [];
    for (let s = start; s < end; s = add(s, 1)) nights.push(s);
    const blocked = (kind) => nights.filter((s) => nightStatus(s) === kind);
    const list = (dates) => dates.map(dayMonth).join(', ');
    if (blocked('past').length) issues.push(`Noite que já começou: ${list(blocked('past'))}.`);
    if (blocked('outside').length) issues.push(`Fora do calendário aberto: ${list(blocked('outside'))}.`);
    if (blocked('unavailable').length) issues.push(`Noite indisponível: ${list(blocked('unavailable'))}.`);
    if (blocked('mine').length) issues.push(`Você já tem reserva em: ${list(blocked('mine'))}.`);
    for (const year of new Set(blocked('closed').map((s) => s.slice(0, 4))))
      issues.push(`Sua janela de ${year} abre em ${fullDate(sc.windows[year])}.`);
    if (blocked('leap-other').length) issues.push('O 29/02 de 2028 é direito extraordinário de outra Ação neste exercício.');
    const byBucket = new Map();
    for (const s of nights) {
      const key = `${s.slice(0, 4)}:${bucketOf(s)}`;
      byBucket.set(key, (byBucket.get(key) ?? 0) + 1);
    }
    const usage = [...byBucket].map(([key, count]) => {
      const [year, bucket] = key.split(':');
      const left = sc.remaining?.[year]?.[bucket] ?? 0;
      return { year, bucket, count, left };
    });
    let stay = nights.length;
    if (sc.role === 'co_owner') {
      stay = stayWith(start, end);
      if (stay > MAX_STAY)
        issues.push(stay === nights.length
          ? `A permanência teria ${stay} noites seguidas; o máximo é ${MAX_STAY}.`
          : `Com suas reservas adjacentes, a permanência teria ${stay} noites seguidas; o máximo é ${MAX_STAY}.`);
      for (const u of usage)
        if (u.count > u.left)
          issues.push(`Saldo de ${BUCKET[u.bucket]} em ${u.year}: ${u.left} ${u.left === 1 ? 'noite' : 'noites'}; o período usa ${u.count}.`);
    }
    return { ok: issues.length === 0, issues, nights, usage, stay };
  }

  function summaryRow(label, value) {
    return el('div', { class: 'lx-evidence__item' }, [el('dt', { class: 'lx-evidence__label', text: label }), el('dd', { class: 'lx-evidence__value', text: value })]);
  }

  function showPreview(result) {
    summaryEl.replaceChildren();
    const nightsText = result.nights.length === 0 ? '0' : result.nights.length === 1
      ? `1 (${dayMonth(result.nights[0])})`
      : result.nights.length === 2
        ? `2 (${dayMonth(result.nights[0])} e ${dayMonth(result.nights[1])})`
        : `${result.nights.length} (${dayMonth(result.nights[0])} a ${dayMonth(result.nights.at(-1))})`;
    summaryEl.append(
      summaryRow(
        'Período',
        checkin.slice(0, 4) === checkout.slice(0, 4)
          ? `${compactDate(checkin)}, 14h → ${compactDate(checkout)}, 10h · ${checkin.slice(0, 4)}`
          : `${shortDate(checkin)}, 14h → ${shortDate(checkout)}, 10h`,
      ),
      summaryRow('Noites', nightsText),
    );
    if (sc.role === 'co_owner' && result.usage?.length) {
      // Categorias e impacto no saldo, por exercício.
      for (const u of result.usage) {
        const granted = u.bucket === 'leap' ? 1 : sc.granted[u.bucket];
        const after = Math.max(u.left - u.count, 0);
        summaryEl.append(summaryRow(`${BUCKET[u.bucket]} ${u.year}`, `${u.count} ${u.count === 1 ? 'noite' : 'noites'} · saldo ${u.left} → ${after} de ${granted}`));
      }
      summaryEl.append(summaryRow('Permanência', `${result.stay} de ${MAX_STAY} noites seguidas`));
    }
    summaryEl.hidden = false;
    issuesEl.replaceChildren(...result.issues.map((text) => el('li', { text })));
    issuesEl.hidden = result.issues.length === 0;
  }

  function updateSummary() {
    const token = ++previewToken;
    preview = null;
    confirmEl.disabled = true;
    if (!checkin && !checkout) {
      statusEl.textContent = sc.load ? '—' : 'Escolha a data de entrada.';
      summaryEl.hidden = true;
      issuesEl.hidden = true;
      return;
    }
    if (checkin && !checkout) {
      statusEl.textContent = `Entrada em ${shortDate(checkin)}. Agora escolha a saída.`;
      summaryEl.hidden = true;
      issuesEl.hidden = true;
      return;
    }
    if (!checkin) {
      statusEl.textContent = 'Escolha também a data de entrada.';
      return;
    }
    statusEl.textContent = 'Verificando disponibilidade…';
    issuesEl.hidden = true;
    const start = checkin;
    const end = checkout;
    window.setTimeout(() => {
      if (token !== previewToken) return; // datas mudaram: a prévia antiga não vale
      const result = computePreview(start, end);
      preview = { ...result, checkin: start, checkout: end };
      showPreview(result);
      statusEl.textContent = result.ok ? 'Período disponível para reserva.' : 'Não é possível reservar este período.';
      confirmEl.disabled = !(result.ok && preview.checkin === checkin && preview.checkout === checkout);
    }, PREVIEW_DELAY_MS);
  }

  // Entrada direta: mesmas regras, sem ajuste silencioso.
  function fromInputs() {
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

  function renderRights() {
    const title = document.querySelector('[data-rights-title]');
    const rights = document.querySelector('[data-rights]');
    document.querySelector('[data-context]').textContent = sc.context ?? 'Dados de demonstração';
    rights.replaceChildren();
    if (sc.load) {
      title.textContent = 'Seu Direito de Uso';
      rights.append(summaryRow('Situação', sc.load === 'loading' ? 'Carregando…' : '—'));
      return;
    }
    if (sc.role === 'owner') {
      title.textContent = 'Sua Second Home';
      rights.append(
        summaryRow('Capacidade', 'Todas as noites livres do calendário'),
        summaryRow('Calendário', `Disponível até ${fullDate(sc.sealedUntil)}; novos exercícios entram a cada ano`),
      );
      return;
    }
    title.textContent = 'Seu Direito de Uso';
    for (const year of Object.keys(sc.windows)) {
      if (sc.today < sc.windows[year]) {
        rights.append(summaryRow(`Janela de ${year}`, `Abre em ${fullDate(sc.windows[year])}`));
        continue;
      }
      const left = sc.remaining[year];
      rights.append(
        summaryRow(`Alta/Super Alta ${year}`, `${left.alta} de ${sc.granted.alta} noites`),
        summaryRow(`Média/Baixa ${year}`, `${left.media} de ${sc.granted.media} noites`),
      );
      if (year === '2028' && sc.leapBeneficiary && left.leap > 0)
        rights.append(summaryRow('29/02/2028 · seu direito extraordinário', '1 noite'));
    }
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
    renderRights();
    const start = params.get('entrada');
    const end = params.get('saida');
    if (params.get('mes') && live) anchor = params.get('mes');
    checkin = live ? start : null;
    checkout = live ? end : null;
    checkinInput.value = checkin ?? '';
    checkoutInput.value = checkout ?? '';
    if (checkin) focusDate = checkin;
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
