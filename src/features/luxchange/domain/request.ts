/**
 * Regras da Request sobre fatos já lidos (W21; PD-005, PD-007, PD-012; REQ-062; TECH-022, TECH-023, TECH-024, TECH-043,
 * TECH-073; ADR-0037). Puro: a prévia e o command usam as mesmas regras, e o banco confere de novo cada escrita e a
 * completude no COMMIT. Créditos são decimais exatos em texto (TECH-033), nunca `Number`.
 */
import {
  bookingNights,
  compareCredits,
  subtractCredits,
  sumCredits,
  withinNotice,
  type DepositBookingFacts,
  type DepositNightFacts,
} from './deposit';

/** Período máximo da Request: o mesmo do PRL (TECH-033). */
export const MAX_REQUEST_NIGHTS = 366;

export type RequestModality = 'owner' | 'co_owner';

/** Holding vigente de uma party numa Second Home (solicitante ou detentor). */
export interface RequestHolding {
  readonly id: string;
  readonly partyId: string;
  readonly secondHomeId: string;
  readonly modality: RequestModality;
  readonly stakeId: string | null;
}

export type RequestRefusal =
  'ERR_CAPACITY_UNAVAILABLE' | 'ERR_MIN_NOTICE' | 'ERR_PERMISSION' | 'ERR_VALIDATION';

const DAY_MS = 86_400_000;

/** Noites `[checkin, checkout)` em datas civis; período vazio, invertido ou acima do limite → `null`. */
export function periodNights(checkin: string, checkout: string): string[] | null {
  const from = Date.parse(`${checkin}T00:00:00Z`);
  const to = Date.parse(`${checkout}T00:00:00Z`);
  const count = (to - from) / DAY_MS;
  if (!Number.isInteger(count) || count < 1 || count > MAX_REQUEST_NIGHTS) return null;
  return Array.from({ length: count }, (_, i) =>
    new Date(from + i * DAY_MS).toISOString().slice(0, 10),
  );
}

const isOwnUseBooking = (booking: DepositBookingFacts | undefined, holding: RequestHolding) =>
  booking !== undefined &&
  booking.channel === 'own_use' &&
  booking.state === 'confirmed' &&
  booking.holdingId === holding.id &&
  booking.stakeId === holding.stakeId;

/** A noite é da reserva Co-Owner confirmada da holding (custódia `reserved_right` da Ação e ocupação da reserva). */
function bookedByHolding(
  night: DepositNightFacts,
  holding: RequestHolding,
  bookingOf: (id: string) => DepositBookingFacts | undefined,
): DepositBookingFacts | null {
  const custody = night.custody;
  if (
    custody?.holderKind !== 'use_right' ||
    custody.basis !== 'reserved_right' ||
    custody.stakeId !== holding.stakeId ||
    night.occupancy?.channel !== 'own_use'
  )
    return null;
  const booking = bookingOf(night.occupancy.bookingId);
  return isOwnUseBooking(booking, holding) ? booking! : null;
}

const isFreeOwnerNight = (night: DepositNightFacts) =>
  night.custody?.holderKind === 'owner' && night.occupancy === null;

/** Reservas tocadas entram inteiras: toda noite de cada reserva está em `nights`. */
const wholeBookings = (bookings: readonly DepositBookingFacts[], nights: ReadonlySet<string>) =>
  bookings.every((booking) => bookingNights(booking).every((night) => nights.has(night)));

export type RequestedVerdict =
  | {
      readonly ok: true;
      /** Reserva Co-Owner de cada noite solicitada (Owner: `null`), na ordem das noites. */
      readonly bookingByNight: readonly (string | null)[];
    }
  | { readonly ok: false; readonly code: RequestRefusal };

/**
 * Capacidade solicitada (TECH-022, TECH-023, TECH-024; ADR-0037 §4): noites seladas do detentor, todas futuras, sem
 * compromisso efetivo de complemento; Owner só livres; Co-Owner só reservas confirmadas inteiras da holding. Não há
 * antecedência mínima para a capacidade solicitada (a da Request é o prazo de resposta).
 */
export function evaluateRequested(input: {
  readonly holder: RequestHolding;
  readonly selected: readonly string[];
  readonly nights: readonly DepositNightFacts[];
  readonly bookings: readonly DepositBookingFacts[];
  /** Noites com compromisso efetivo de complemento (de outra Request). */
  readonly committed: ReadonlySet<string>;
  readonly nowMs: number;
}): RequestedVerdict {
  const facts = new Map(input.nights.map((night) => [night.stayDate, night]));
  const bookings = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const bookingByNight: (string | null)[] = [];
  const touched = new Map<string, DepositBookingFacts>();
  for (const date of input.selected) {
    const night = facts.get(date);
    if (
      night === undefined ||
      Date.parse(night.checkinAt) <= input.nowMs ||
      input.committed.has(date)
    )
      return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
    if (input.holder.modality === 'owner') {
      if (!isFreeOwnerNight(night)) return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
      bookingByNight.push(null);
    } else {
      const booking = bookedByHolding(night, input.holder, (id) => bookings.get(id));
      if (booking === null) return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
      touched.set(booking.id, booking);
      bookingByNight.push(booking.id);
    }
  }
  if (!wholeBookings([...touched.values()], new Set(input.selected)))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  return { ok: true, bookingByNight };
}

/**
 * Capacidade solicitável de uma Second Home para o calendário (W21 E3; spec luxchange §13.5 item 2): as regras de
 * `evaluateRequested` sobre todas as noites lidas, sem PRL nem Membership (a leitura aplica). Owner: noites livres;
 * Co-Owner: só reservas confirmadas que entram inteiras, das holdings informadas (quem lê nunca vê a própria capacidade).
 * Devolve noite → reserva (Owner: `null`); o que não aparece é "Indisponível", sem motivo.
 */
export function requestableCapacity(input: {
  readonly owner: RequestHolding | null;
  /** Holdings Co-Owner vigentes que podem ser solicitadas, por id. */
  readonly holdings: ReadonlyMap<string, RequestHolding>;
  readonly nights: readonly DepositNightFacts[];
  readonly bookings: readonly DepositBookingFacts[];
  readonly committed: ReadonlySet<string>;
  readonly nowMs: number;
}): Map<string, string | null> {
  const capacity = new Map<string, string | null>();
  const open = (night: DepositNightFacts) =>
    Date.parse(night.checkinAt) > input.nowMs && !input.committed.has(night.stayDate);
  if (input.owner !== null) {
    for (const night of input.nights)
      if (open(night) && isFreeOwnerNight(night)) capacity.set(night.stayDate, null);
    return capacity;
  }
  const facts = new Map(input.nights.map((night) => [night.stayDate, night]));
  const bookings = new Map(input.bookings.map((booking) => [booking.id, booking]));
  for (const booking of input.bookings) {
    const holding = input.holdings.get(booking.holdingId);
    if (holding === undefined) continue;
    const dates = bookingNights(booking);
    const whole = dates.every((date) => {
      const night = facts.get(date);
      return (
        night !== undefined &&
        open(night) &&
        bookedByHolding(night, holding, (id) => bookings.get(id))?.id === booking.id
      );
    });
    if (whole) for (const date of dates) capacity.set(date, booking.id);
  }
  return capacity;
}

/** Unidade do complemento escolhida pelo solicitante (PD-012): noite Owner livre ou reserva Co-Owner inteira. */
export type ComplementUnitInput =
  | { readonly kind: 'owner_night'; readonly secondHomeId: string; readonly stayDate: string }
  | { readonly kind: 'co_owner_booking'; readonly bookingId: string };

/** Unidade resolvida: holding do solicitante e noites (Owner: uma; Co-Owner: as da reserva). */
export interface ComplementUnit {
  readonly kind: ComplementUnitInput['kind'];
  readonly holding: RequestHolding;
  readonly bookingId: string | null;
  readonly secondHomeId: string;
  readonly nights: readonly string[];
}

export type ComplementVerdict =
  { readonly ok: true } | { readonly ok: false; readonly code: RequestRefusal };

/**
 * Complemento por datas (PD-012; TECH-043): unidades de holdings vigentes do solicitante, elegíveis como no depósito e com
 * a antecedência de 336 h cumprida no instante máximo de aceite (`expires_at`), sem compromisso efetivo (de outra Request
 * do solicitante). Antecedência primeiro (o motivo mais acionável).
 */
export function evaluateComplement(input: {
  readonly units: readonly ComplementUnit[];
  /** Fatos das noites do complemento, por `${second_home_id}:${data}`. */
  readonly nights: ReadonlyMap<string, DepositNightFacts>;
  readonly bookings: readonly DepositBookingFacts[];
  readonly committed: ReadonlySet<string>;
  readonly expiresAtMs: number;
}): ComplementVerdict {
  const bookings = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const keys = input.units.flatMap((unit) =>
    unit.nights.map((night) => `${unit.secondHomeId}:${night}`),
  );
  if (new Set(keys).size !== keys.length) return { ok: false, code: 'ERR_VALIDATION' };
  const facts = keys.map((key) => input.nights.get(key));
  if (facts.some((night) => night === undefined))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  if (facts.some((night) => !withinNotice(night!.checkinAt, input.expiresAtMs)))
    return { ok: false, code: 'ERR_MIN_NOTICE' };
  if (keys.some((key) => input.committed.has(key)))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  for (const unit of input.units) {
    const unitFacts = unit.nights.map((night) =>
      input.nights.get(`${unit.secondHomeId}:${night}`)!,
    );
    if (unit.kind === 'owner_night') {
      if (unit.holding.modality !== 'owner' || !unitFacts.every(isFreeOwnerNight))
        return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
      continue;
    }
    const booking = unit.bookingId === null ? undefined : bookings.get(unit.bookingId);
    if (
      unit.holding.modality !== 'co_owner' ||
      !isOwnUseBooking(booking, unit.holding) ||
      unitFacts.some(
        (night) =>
          bookedByHolding(night, unit.holding, (id) => bookings.get(id))?.id !== booking!.id,
      ) ||
      !wholeBookings([booking!], new Set(unit.nights))
    )
      return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  }
  return { ok: true };
}

/** Composição da cobertura (PD-012, TECH-073): `N`, `P`, `G = max(0, N − P)`, `C = N − G`, `E = P − C`. */
export interface RequestComposition {
  readonly creditsRequired: string;
  readonly complementCredits: string;
  readonly guaranteeCredits: string;
  readonly complementConsumption: string;
  readonly complementExcess: string;
}

/**
 * `N` = soma dos Créditos das noites solicitadas; `P` = soma dos Créditos potenciais das unidades. Se `P ≥ N`, nenhuma
 * unidade pode ser dispensável (`P − min(unidade) < N`) — sobra evitável → `null`.
 */
export function composeRequest(
  nightCredits: readonly string[],
  unitCredits: readonly string[],
): RequestComposition | null {
  const required = sumCredits(nightCredits);
  const complement = sumCredits(unitCredits);
  if (unitCredits.length > 0 && compareCredits(complement, required) >= 0) {
    const smallest = [...unitCredits].sort(compareCredits)[0]!;
    if (compareCredits(subtractCredits(complement, smallest), required) >= 0) return null;
  }
  const guarantee =
    compareCredits(required, complement) > 0 ? subtractCredits(required, complement) : '0';
  const consumption = subtractCredits(required, guarantee);
  return {
    creditsRequired: required,
    complementCredits: complement,
    guaranteeCredits: guarantee,
    complementConsumption: consumption,
    complementExcess: subtractCredits(complement, consumption),
  };
}

/** Créditos de uma noite do complemento, com a Second Home (ordem do consentimento: Second Home, data). */
export interface ComplementNightCredits {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly credits: string;
}

/**
 * Termos vinculantes apresentados e consentidos (PD-012 item 4; ADR-0037 §1), no formato que o banco recompõe
 * (`app.luxchange_request_terms`): decimais canônicos e inteiros em texto. O `expires_at` exato não entra — nasce no envio;
 * a duração consentida (`deadline_hours`) entra.
 */
export interface RequestTermsDocument {
  readonly credits_required: string;
  readonly guarantee_credits: string;
  readonly complement_credits: string;
  readonly complement_consumption: string;
  readonly complement_excess: string;
  readonly fee_amount_minor: string;
  readonly fee_currency: string;
  readonly deadline_hours: string;
  readonly credit_validity_months: string;
  readonly policy_id: string;
  readonly requested_nights: readonly { readonly date: string; readonly credits: string }[];
  readonly complement_nights: readonly {
    readonly second_home_id: string;
    readonly date: string;
    readonly credits: string;
  }[];
}

export function requestTerms(input: {
  readonly composition: RequestComposition;
  readonly feeAmountMinor: bigint;
  readonly feeCurrency: string;
  readonly deadlineHours: string;
  readonly validityMonths: string;
  readonly policyId: string;
  readonly requestedNights: readonly { readonly stayDate: string; readonly credits: string }[];
  readonly complementNights: readonly ComplementNightCredits[];
}): RequestTermsDocument {
  const byHomeAndDate = (a: ComplementNightCredits, b: ComplementNightCredits) =>
    a.secondHomeId === b.secondHomeId
      ? a.stayDate.localeCompare(b.stayDate)
      : a.secondHomeId < b.secondHomeId
        ? -1
        : 1;
  return {
    credits_required: input.composition.creditsRequired,
    guarantee_credits: input.composition.guaranteeCredits,
    complement_credits: input.composition.complementCredits,
    complement_consumption: input.composition.complementConsumption,
    complement_excess: input.composition.complementExcess,
    fee_amount_minor: input.feeAmountMinor.toString(),
    fee_currency: input.feeCurrency,
    deadline_hours: input.deadlineHours,
    credit_validity_months: input.validityMonths,
    policy_id: input.policyId,
    requested_nights: [...input.requestedNights]
      .sort((a, b) => a.stayDate.localeCompare(b.stayDate))
      .map((night) => ({ date: night.stayDate, credits: night.credits })),
    complement_nights: [...input.complementNights].sort(byHomeAndDate).map((night) => ({
      second_home_id: night.secondHomeId,
      date: night.stayDate,
      credits: night.credits,
    })),
  };
}

/** Motivos de encerramento pré-aceite decididos pelo banco (ADR-0037 §5, §7). */
export const REQUEST_CLOSURE_REASONS = [
  'withdrawn',
  'expired',
  'period_started',
  'requester_membership',
  'holder_membership',
  'capacity_unavailable',
  'complement_unavailable',
] as const;
export type RequestClosureReason = (typeof REQUEST_CLOSURE_REASONS)[number];
