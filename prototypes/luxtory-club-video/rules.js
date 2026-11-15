// Demonstração conceitual — fórmulas canônicas usadas pelo protótipo do vídeo do Luxtory Club.
// Não é código de produto: nada aqui decide disponibilidade, saldo, preço ou autorização reais (03 §13).
// Cada função cita a regra que reproduz; os parâmetros vêm de CANONICAL (data.js), nunca de defaults locais.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** TECH-044 — adição calendárica em UTC, ajustada ao último dia válido do mês (nunca "24 meses = N dias"). */
export function addMonthsUTC(ms, months) {
  const d = new Date(ms);
  const target = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/** TECH-044 — validade do lote: originated_at + credit_validity_months (BR-191). */
export function creditExpiresAt(originatedAt, params) {
  return addMonthsUTC(originatedAt, params.creditValidityMonths);
}

/** TECH-044 — expires_at = sent_at + request_expiry_hours (PD-005); nunca prorrogado. */
export function requestExpiresAt(sentAt, params) {
  return sentAt + params.requestExpiryHours * HOUR_MS;
}

/** 01 §19 — PRL do período = soma do PRL das datas (valores em centavos, TECH-033). */
export function prlOfPeriod(prlByNightCents) {
  return prlByNightCents.reduce((sum, cents) => sum + cents, 0);
}

/** 01 §20 — Créditos da data = PRL da data × multiplicador (BR-201). PRL em centavos → Créditos exatos. */
export function creditsForPrl(prlCents, params) {
  if (prlCents % 100 !== 0)
    throw new Error(`PRL fictício com centavos não previsto na demonstração: ${prlCents}`);
  return (prlCents / 100) * params.creditMultiplier;
}

/** TECH-033 — HALF_UP uma única vez no valor monetário final. */
function percentHalfUp(cents, percent) {
  return Math.floor((cents * percent + 50) / 100);
}

/** 01 §24 — Luxchange Fee (rótulo comercial na tela: "Taxa de intermediação") = maior entre o percentual do PRL do período e o mínimo (BR-230, BR-231). */
export function luxchangeFee(prlPeriodCents, params) {
  return Math.max(percentHalfUp(prlPeriodCents, params.feePercent), params.feeMinimumCents);
}

/**
 * PD-006, PD-008, TECH-071 — Garantia por FEFO: ordena por (expires_at, originated_at, id); só lotes com
 * now < expires_at e expires_at ≥ expires_at da Request. Retorna as parcelas retidas de cada lote.
 */
export function holdCreditsFefo(lots, amount, { now, requestExpiresAt: limit }) {
  const usable = lots
    .filter((lot) => now < lot.expiresAt && lot.expiresAt >= limit && lot.available > 0)
    .sort(
      (a, b) =>
        a.expiresAt - b.expiresAt || a.originatedAt - b.originatedAt || a.id.localeCompare(b.id),
    );
  const parts = [];
  let missing = amount;
  for (const lot of usable) {
    if (missing === 0) break;
    const take = Math.min(lot.available, missing);
    parts.push({ lotId: lot.id, quantity: take });
    missing -= take;
  }
  if (missing > 0) throw new Error(`Créditos insuficientes: faltam ${missing}`);
  return parts;
}

/** PD-008 — consumo no Direct (BR-221): o mesmo FEFO, só com lotes válidos agora (sem o limite de uma Request). */
export function consumeCreditsFefo(lots, amount, { now }) {
  return holdCreditsFefo(lots, amount, { now, requestExpiresAt: now });
}

/** TECH-043 — depósito exige now ≤ checkin_at − antecedência (BR-200). */
export function canDeposit(checkinAt, now, params) {
  return now <= checkinAt - params.depositMinNoticeDays * DAY_MS;
}

/**
 * BR-151, BR-200, REQ-060 — situação de uma noite no calendário do depósito, por modalidade.
 * Co-Owner: só data já reservada no Direito de Uso e ainda não comprometida, com a antecedência mínima.
 * Owner: capacidade própria disponível e não comprometida, com a mesma antecedência (sem "reservada/não reservada").
 */
export const DEPOSIT_STATUS = Object.freeze({
  eligible: 'eligible',
  reservedUnavailable: 'reserved_unavailable',
  notReserved: 'not_reserved',
  committed: 'committed',
  unavailable: 'unavailable',
});
export function depositNightStatus(
  { role, reserved, committed, ownAvailable },
  checkinAt,
  now,
  params,
) {
  if (committed) return DEPOSIT_STATUS.committed;
  if (role === 'co_owner') {
    if (!reserved) return DEPOSIT_STATUS.notReserved;
    return canDeposit(checkinAt, now, params)
      ? DEPOSIT_STATUS.eligible
      : DEPOSIT_STATUS.reservedUnavailable;
  }
  if (role === 'owner')
    return ownAvailable && canDeposit(checkinAt, now, params)
      ? DEPOSIT_STATUS.eligible
      : DEPOSIT_STATUS.unavailable;
  throw new Error(`Modalidade desconhecida: ${role}`);
}

/** Fonte única de verdade: o conjunto de datas selecionadas. O controle mostra a soma; mover o controle escolhe a meta. */
export function creditsOfSelection(eligible, nights) {
  return nights.reduce((sum, night) => {
    const date = eligible.find((d) => d.night === night);
    if (!date) throw new Error(`Data não elegível para depósito: ${night}`);
    return sum + date.credits;
  }, 0);
}

/** Limite da enumeração direta: o calendário do depósito mostra poucas datas elegíveis por vez. */
const MAX_ELIGIBLE_DATES = 16;

/**
 * Todas as seleções possíveis de datas elegíveis inteiras (subconjuntos), cada uma com seus Créditos. Para poucas datas
 * a enumeração direta é exata e fácil de testar; acima do limite, recusa em vez de presumir.
 */
function selectionsOf(eligible) {
  if (eligible.length > MAX_ELIGIBLE_DATES)
    throw new Error(`Datas elegíveis demais para enumerar: ${eligible.length}`);
  const all = [];
  for (let mask = 0; mask < 1 << eligible.length; mask++) {
    const nights = eligible
      .filter((_, i) => mask & (1 << i))
      .map((d) => d.night)
      .sort();
    all.push({ nights, credits: creditsOfSelection(eligible, nights) });
  }
  return all;
}

/**
 * Sugestão determinística para uma meta, usada quando é o controle que se move: entre as seleções com exatamente
 * aquela soma, (1) a que mais preserva as datas já escolhidas; (2) a com menos datas; (3) a com as datas mais cedo.
 * A escolha explícita do Titular no calendário sempre prevalece: o calendário não passa por aqui.
 */
export function selectionForTarget(eligible, target, current = []) {
  const candidates = selectionsOf(eligible).filter((s) => s.credits === target);
  if (!candidates.length) throw new Error(`Meta não alcançável com datas inteiras: ${target}`);
  const kept = (s) => s.nights.filter((n) => current.includes(n)).length;
  candidates.sort(
    (a, b) =>
      kept(b) - kept(a) ||
      a.nights.length - b.nights.length ||
      a.nights.join().localeCompare(b.nights.join()),
  );
  return candidates[0].nights;
}

/**
 * Metas do controle "Créditos adicionais desejados": todas as somas distintas de datas elegíveis inteiras (01 §20:
 * Créditos por data; nunca fração), com a seleção sugerida para cada uma. No cenário: 0, 14.000, 16.000, 30.000,
 * 32.000 e 46.000.
 */
export function depositStops(eligible) {
  const totals = [...new Set(selectionsOf(eligible).map((s) => s.credits))].sort((a, b) => a - b);
  return totals.map((credits) => ({ credits, nights: selectionForTarget(eligible, credits) }));
}

/** Menor meta que cobre o que falta para a reserva; null se nem todas as datas elegíveis bastam. */
export function minimumCovering(eligible, shortfall) {
  return depositStops(eligible).find((s) => s.credits > 0 && s.credits >= shortfall) ?? null;
}

/** PD-002 — noites de [entrada, saída): a data de saída não é usada. Datas civis 'AAAA-MM-DD'. */
export function nightsOf(checkinDate, checkoutDate) {
  const nights = [];
  for (
    let t = Date.parse(`${checkinDate}T00:00:00Z`);
    t < Date.parse(`${checkoutDate}T00:00:00Z`);
    t += DAY_MS
  ) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
}

/**
 * BR-151, TECH-022, TECH-023 — efeito da cessão por modalidade do detentor. Owner: capacidade própria disponível,
 * sem Direito de Uso. Co-Owner: só data já reservada no Direito de Uso, que segue consumida após a cessão.
 */
export function cessionEffect(role) {
  if (role === 'owner') return { capacity: 'own_available', useRightConsumed: false };
  if (role === 'co_owner') return { capacity: 'reserved_right', useRightConsumed: true };
  throw new Error(`Modalidade desconhecida: ${role}`);
}

/** REQ-096 / TECH-055 — estados e transições da Request representados no protótipo. */
export const REQUEST_STATES = Object.freeze({
  pending: 'Pendente',
  accepted: 'Aceita',
  declined: 'Recusada',
  expired: 'Expirada',
  cancelled_pre_accept: 'Cancelada pré-aceite',
});
const REQUEST_TRANSITIONS = {
  pending: ['accepted', 'declined', 'expired', 'cancelled_pre_accept'],
};
export function canTransitionRequest(from, to) {
  return (REQUEST_TRANSITIONS[from] ?? []).includes(to);
}
