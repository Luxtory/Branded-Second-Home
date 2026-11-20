// Demonstração conceitual — dados do protótipo do vídeo do Luxtory Club.
// Três grupos, nunca misturados:
//   CANONICAL  — parâmetros atuais escritos nos canônicos (01/02/03). Não são valores comerciais novos.
//   FICTITIOUS — dados sintéticos: pessoas, Second Homes, PRLs, lotes, instantes. Nada disso existe.
//   scenario() — valores derivados de FICTITIOUS pelas fórmulas de rules.js (nunca digitados à mão).
import {
  DEPOSIT_STATUS,
  canDeposit,
  cessionEffect,
  creditsOfSelection,
  depositNightStatus,
  depositStops,
  minimumCovering,
  creditExpiresAt,
  creditsForPrl,
  consumeCreditsFefo,
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
  // Nomes das Second Homes fictícias do filme (propostas criativas, sujeitas a validação comercial e de marca): o nome é
  // protagonista e a região vem em segundo plano. Identificadores internos estáveis (mirante, varanda, patio). A Home
  // Edition fica no dado do produto, sem aparecer nos cartões promocionais.
  secondHomes: {
    mirante: { name: 'Satori Home', region: 'Serra', homeEdition: 'Home Edition Satori' },
    varanda: { name: 'Azzura Home', region: 'Litoral', homeEdition: 'Home Edition Azzura' },
    patio: { name: 'Olivar Home', region: 'Campo', homeEdition: 'Home Edition Olivar' },
  },
  // Quem solicita: Co-Owner de Satori Home. Quem detém as noites pedidas: Co-Owner de Azzura Home, cuja
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
    // Datas que Helena deposita: só 16/05, o menor depósito que cobre os 7.000 que faltam (14.000). O excedente
    // (62.000 − 55.000 = 7.000) fica disponível para experiências futuras (direção v8.2, 2026-11-20).
    selected: ['2027-05-16'],
  },
  // Membro do Luxchange Direct e do Luxplus: outra família, com carteira própria e lotes de origem identificável
  // (INV-6). O Direct não herda o saldo de Helena: cada filme mostra uma carteira coerente (direção v8.2).
  directMember: {
    name: 'Marina',
    role: 'co_owner',
    secondHome: 'mirante',
    membership: 'Vigente',
    lots: [
      {
        id: 'L-0201',
        origin: 'Depósito no Luxchange',
        originatedAt: '2026-11-09T11:20:00-03:00',
        quantity: 24_000,
      },
      {
        id: 'L-0202',
        origin: 'Request aceita como cedente',
        originatedAt: '2027-01-27T15:40:00-03:00',
        quantity: 15_000,
      },
    ],
  },
  // Calendário do Direito de Uso de Helena em Satori Home (Co-Owner) para o depósito opcional: datas já
  // reservadas, uma reserva dentro da antecedência mínima (24–25/04, menos de 14 dias antes de 12/04) e uma cessão já
  // comprometida (22–23/05, origem do L-0002). As noites elegíveis são as do depósito acima (14, 15 e 16/05).
  useRight: {
    secondHome: 'mirante',
    role: 'co_owner',
    months: ['2027-04', '2027-05'],
    reserved: ['2027-04-24', '2027-04-25', '2027-05-14', '2027-05-15', '2027-05-16'],
    committed: ['2027-05-22', '2027-05-23'],
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
  // Luxplus: o PRL do período é a referência de preço (BR-180, BR-243, REQ-070): Preço Luxplus = PRL × (1 − desconto
  // aplicável) (01 §25), congelado na compra. O desconto aplicável varia por Membership e não está publicado (BR-244,
  // P-5); presumir 0% seria inventar um parâmetro (TECH-001). Por isso a demonstração usa um valor ilustrativo da
  // estadia, sem calcular, exibir ou insinuar PRL, desconto ou condição comercial.
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

/** Lotes com validade e saldo disponível (validade por adição calendárica, TECH-044). */
const walletLots = (lots, params) =>
  lots.map((lot) => {
    const originatedAt = at(lot.originatedAt);
    return {
      ...lot,
      originatedAt,
      expiresAt: creditExpiresAt(originatedAt, params),
      available: lot.quantity,
    };
  });

/** Lotes de quem solicita no instante do envio da Request: os dois iniciais + o lote originado pelo depósito. */
function lotsAtRequest(data, params) {
  const d = data.deposit;
  const nights = nightsOf(d.checkin, d.checkout);
  // Cada data depositada tem antecedência própria (BR-200, TECH-043) e é inteira (BR-201): o lote soma as datas
  // escolhidas, nunca o período inteiro.
  for (const night of d.selected) {
    if (!nights.includes(night))
      throw new Error(`Data depositada fora do período elegível: ${night}`);
    if (!canDeposit(checkinInstant(night, params), at(d.at), params))
      throw new Error('Depósito fictício sem antecedência');
  }
  const deposited = {
    id: d.lotId,
    origin: 'Depósito no Luxchange',
    originatedAt: d.at,
    quantity: creditsForPrl(
      prlOfPeriod(d.selected.map((n) => d.prlCents[nights.indexOf(n)])),
      params,
    ),
  };
  return walletLots([...data.lots, deposited], params);
}

/**
 * Depósito opcional antes da Request (REQ-060, BR-200 a BR-203): calendário do Direito de Uso, situação de cada noite,
 * Créditos origináveis por data elegível (PRL da data × multiplicador, BR-201), metas alcançáveis do controle e o
 * resultado do depósito confirmado (lote próprio, antes de os Créditos ficarem disponíveis).
 */
export function depositScenario(data = FICTITIOUS, params = CANONICAL) {
  const u = data.useRight;
  const d = data.deposit;
  const now = at(d.at);
  const depositNights = nightsOf(d.checkin, d.checkout);
  const prior = data.lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const days = [];
  for (const ym of u.months) {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let day = 1; day <= last; day++) {
      const night = `${ym}-${String(day).padStart(2, '0')}`;
      const status = depositNightStatus(
        {
          role: u.role,
          reserved: u.reserved.includes(night),
          committed: u.committed.includes(night),
        },
        checkinInstant(night, params),
        now,
        params,
      );
      const i = depositNights.indexOf(night);
      days.push({
        night,
        status,
        credits: status === DEPOSIT_STATUS.eligible ? creditsForPrl(d.prlCents[i], params) : 0,
      });
    }
  }
  const eligible = days.filter((day) => day.status === DEPOSIT_STATUS.eligible);
  if (eligible.map((e) => e.night).join() !== depositNights.join())
    throw new Error('Calendário fictício incoerente com o depósito');
  const request = creditsForPrl(prlOfPeriod(data.request.prlCents), params);
  const selected = [...d.selected];
  const originated = creditsOfSelection(eligible, selected);
  return {
    secondHome: data.secondHomes[u.secondHome],
    role: u.role,
    months: u.months,
    days,
    eligible,
    stops: depositStops(eligible),
    // Menor complemento que cobre a reserva (14.000, só 16/05), que é o que Helena deposita (direção v8.2).
    minimum: minimumCovering(eligible, Math.max(0, request - prior)),
    priorAvailable: prior,
    requestCredits: request,
    shortfall: Math.max(0, request - prior),
    selected,
    originated,
    afterDeposit: prior + originated,
    confirmedAt: now,
  };
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

/**
 * Cenário do Luxchange Direct (Inventário Luxtory): sem aceite de terceiro (BR-220); Créditos consumidos por FEFO
 * na confirmação (BR-221, PD-008); Fee pago antes da confirmação (TECH-082) — aqui, o ramo do mínimo (01 §24).
 * Carteira própria do Membro do Direct (direção v8.2): não herda o saldo de quem fez a Request.
 */
export function directScenario(data = FICTITIOUS, params = CANONICAL) {
  const d = data.direct;
  const now = at(d.at);
  const lots = walletLots(data.directMember.lots, params);
  const available = lots.reduce((sum, lot) => sum + lot.available, 0);
  const prlPeriodCents = prlOfPeriod(d.prlCents);
  const credits = creditsForPrl(prlPeriodCents, params);
  return {
    requesterName: data.directMember.name,
    secondHome: data.secondHomes[d.secondHome],
    nights: nightsOf(d.checkin, d.checkout),
    checkin: d.checkin,
    checkout: d.checkout,
    prlPeriodCents,
    credits,
    feeCents: luxchangeFee(prlPeriodCents, params),
    lots,
    consumption: consumeCreditsFefo(lots, credits, { now }),
    balances: {
      before: { available, consumed: 0 },
      after: { available: available - credits, consumed: credits },
    },
    booking: { state: 'Confirmada', channel: 'Luxchange Direct', confirmedAt: now },
    policy: data.policy,
  };
}

/**
 * Cenário do Luxplus (Inventário Luxtory, em dinheiro): não usa Créditos (BR-241); sem Fee (BR-230 só alcança Request e
 * Direct). Canonicamente o preço tem o PRL como referência (BR-243, REQ-070); aqui, valor ilustrativo da estadia, porque
 * o desconto aplicável não está publicado (BR-244, P-5) e não é presumido (TECH-001).
 */
export function luxplusScenario(data = FICTITIOUS, params = CANONICAL) {
  const l = data.luxplus;
  const direct = directScenario(data, params);
  return {
    // A mesma família do Direct: o saldo mostrado é o dela, intocado pelo Luxplus.
    requesterName: direct.requesterName,
    secondHome: data.secondHomes[l.secondHome],
    nights: nightsOf(l.checkin, l.checkout),
    checkin: l.checkin,
    checkout: l.checkout,
    stayValueCents: l.stayValueCents,
    credits: { available: direct.balances.after.available, used: 0 },
    booking: { state: 'Confirmada', channel: 'Luxplus', confirmedAt: at(l.at) },
    policy: data.policy,
  };
}
