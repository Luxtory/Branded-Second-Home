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

/** 01 §24 — Luxchange Fee = maior entre o percentual do PRL do período e o mínimo (BR-230, BR-231). */
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
  if (missing > 0) throw new Error(`Créditos insuficientes para a Garantia: faltam ${missing}`);
  return parts;
}

/** TECH-043 — depósito exige now ≤ checkin_at − antecedência (BR-200). */
export function canDeposit(checkinAt, now, params) {
  return now <= checkinAt - params.depositMinNoticeDays * DAY_MS;
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
