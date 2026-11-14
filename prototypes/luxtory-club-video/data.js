// Demonstração conceitual — dados do protótipo do vídeo do Luxtory Club.
// Três grupos, nunca misturados:
//   CANONICAL  — parâmetros atuais escritos nos canônicos (01/02/03). Não são valores comerciais novos.
//   FICTITIOUS — dados sintéticos: pessoas, Second Homes, PRLs, lotes, instantes. Nada disso existe.
//   scenario() — valores derivados de FICTITIOUS pelas fórmulas de rules.js (nunca digitados à mão).
import {
  canDeposit,
  cessionEffect,
  creditExpiresAt,
  creditsForPrl,
  holdCreditsFefo,
  luxchangeFee,
  nightsOf,
  prlOfPeriod,
  requestExpiresAt,
} from './rules.js';

export const CANONICAL = Object.freeze({
  creditMultiplier: 10, // 01 §20 — "Créditos da data = PRL da data × 10" (parâmetro atual)
  creditValidityMonths: 24, // BR-191 — validade atual de 24 meses
  feePercent: 10, // 01 §24 — "maior entre 10% do PRL do período e R$ 120" (parâmetro atual)
  feeMinimumCents: 12_000, // 01 §24 — R$ 120,00
  requestExpiryHours: 24, // PD-005 — prazo padrão da Request
  depositMinNoticeDays: 14, // BR-200, TECH-043
  checkinHour: 14, // PD-002
  checkoutHour: 10, // PD-002
});

export const FICTITIOUS = Object.freeze({
  timeZone: 'America/Sao_Paulo',
  secondHomes: {
    mirante: { name: 'Mirante · Serra', homeEdition: 'Home Edition Mirante' },
    varanda: { name: 'Varanda · Litoral', homeEdition: 'Home Edition Varanda' },
    patio: { name: 'Pátio · Campo', homeEdition: 'Home Edition Pátio' },
  },
  // Quem solicita: Co-Owner de Mirante · Serra. Quem detém as noites pedidas: Co-Owner de Varanda · Litoral, cuja
  // identidade não é exibida a quem solicita (hipótese da demonstração, sem especificação no 02).
  requester: { name: 'Helena', role: 'co_owner', secondHome: 'mirante', membership: 'Vigente' },
  holder: { role: 'co_owner', secondHome: 'varanda', membership: 'Vigente' },
  // Lotes de quem solicita antes da Request (origem identificável, INV-6). L-0003 nasce do depósito abaixo.
  lots: [
    {
      id: 'L-0001',
      origin: 'Depósito no Luxchange',
      originatedAt: '2027-01-18T09:30:00-03:00',
      quantity: 30_000,
    },
    {
      id: 'L-0002',
      origin: 'Request aceita como cedente',
      originatedAt: '2027-02-22T16:05:00-03:00',
      quantity: 18_000,
    },
  ],
  deposit: {
    secondHome: 'mirante',
    checkin: '2027-05-14',
    checkout: '2027-05-17',
    prlCents: [160_000, 160_000, 140_000],
    at: '2027-04-12T10:02:00-03:00',
    lotId: 'L-0003',
  },
  request: {
    secondHome: 'varanda',
    checkin: '2027-06-04',
    checkout: '2027-06-07',
    prlCents: [190_000, 190_000, 170_000],
    sentAt: '2027-04-12T10:06:00-03:00',
    acceptedAt: '2027-04-12T10:14:00-03:00',
    holderLotId: 'L-0104',
  },
  direct: {
    secondHome: 'patio',
    checkin: '2027-05-28',
    checkout: '2027-05-29',
    prlCents: [115_000],
    at: '2027-04-12T10:20:00-03:00',
  },
  // Luxplus: valor ilustrativo da estadia, NÃO derivado de PRL × (1 − desconto aplicável). O desconto aplicável não
  // está definido (BR-244, pendência P-5); por isso não há PRL nem desconto aqui e a tela não os exibirá.
  luxplus: {
    secondHome: 'patio',
    checkin: '2027-08-13',
    checkout: '2027-08-15',
    at: '2027-04-12T10:24:00-03:00',
    stayValueCents: 248_000,
  },
  // PD-009: etapa conceitual. Não existe política vigente; sem ela, nenhuma operação real avança.
  policy: { status: 'conceitual', version: null, content: null },
});

const at = (iso) => Date.parse(iso);
const checkinInstant = (date, params) =>
  Date.parse(`${date}T${String(params.checkinHour).padStart(2, '0')}:00:00-03:00`);

/** Lotes de quem solicita no instante do envio da Request: os dois iniciais + o lote originado pelo depósito. */
function lotsAtRequest(data, params) {
  const d = data.deposit;
  if (!canDeposit(checkinInstant(d.checkin, params), at(d.at), params))
    throw new Error('Depósito fictício sem antecedência');
  const deposited = {
    id: d.lotId,
    origin: 'Depósito no Luxchange',
    originatedAt: d.at,
    quantity: creditsForPrl(prlOfPeriod(d.prlCents), params),
  };
  return [...data.lots, deposited].map((lot) => {
    const originatedAt = at(lot.originatedAt);
    return {
      ...lot,
      originatedAt,
      expiresAt: creditExpiresAt(originatedAt, params),
      available: lot.quantity,
    };
  });
}

/** Cenário derivado da Request (R1–R4). Tudo o que a tela mostra sai daqui. */
export function requestScenario(data = FICTITIOUS, params = CANONICAL) {
  const r = data.request;
  const lots = lotsAtRequest(data, params);
  const sentAt = at(r.sentAt);
  const acceptedAt = at(r.acceptedAt);
  const expiresAt = requestExpiresAt(sentAt, params);
  if (!(acceptedAt < expiresAt)) throw new Error('Aceite fictício fora do prazo');
  const prlPeriodCents = prlOfPeriod(r.prlCents);
  const credits = creditsForPrl(prlPeriodCents, params);
  const hold = holdCreditsFefo(lots, credits, { now: sentAt, requestExpiresAt: expiresAt });
  const total = lots.reduce((sum, lot) => sum + lot.available, 0);
  return {
    requesterName: data.requester.name,
    secondHome: data.secondHomes[r.secondHome],
    nights: nightsOf(r.checkin, r.checkout),
    checkin: r.checkin,
    checkout: r.checkout,
    prlPeriodCents,
    credits,
    feeCents: luxchangeFee(prlPeriodCents, params),
    sentAt,
    expiresAt,
    acceptedAt,
    lots,
    hold,
    balances: {
      beforeSend: { available: total, held: 0, consumed: 0 },
      afterSend: { available: total - credits, held: credits, consumed: 0 },
      afterAccept: { available: total - credits, held: 0, consumed: credits },
    },
    holder: {
      role: data.holder.role,
      effect: cessionEffect(data.holder.role),
      lot: {
        id: r.holderLotId,
        origin: 'Request aceita como cedente',
        quantity: credits,
        originatedAt: acceptedAt,
        expiresAt: creditExpiresAt(acceptedAt, params),
      },
    },
    request: { states: ['pending', 'accepted'], acceptedAt },
    // Mesma operação: a reserva nasce confirmada no instante do aceite válido (REQ-064); nunca antes.
    booking: { state: 'Confirmada', channel: 'Luxchange Request', confirmedAt: acceptedAt },
    policy: data.policy,
  };
}
