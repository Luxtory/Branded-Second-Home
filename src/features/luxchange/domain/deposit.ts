/**
 * Regras do depósito Luxchange sobre fatos já lidos (W20; REQ-051, REQ-060, BR-151, BR-200, TECH-023, TECH-043;
 * ADR-0036). Puro: a mesma regra serve à leitura da jornada (calendário) e ao command, que o banco confere de novo no
 * instante de cada escrita. Créditos são decimais exatos em texto (TECH-033), nunca `Number`.
 */

/** TECH-043: `now ≤ checkin_at − 14 dias`, em instantes (precedente: 360 h para os 15 dias do cancelamento). */
export const DEPOSIT_MIN_NOTICE_HOURS = 336;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type DepositModality = 'owner' | 'co_owner';

/** Holding vigente da party representada na Second Home do depósito. */
export interface DepositHolding {
  readonly id: string;
  readonly modality: DepositModality;
  readonly stakeId: string | null;
}

export interface NightCustody {
  readonly holderKind: string;
  readonly stakeId: string | null;
  readonly basis: string | null;
  readonly inventoryOrigin: string | null;
}

/** Fatos de uma noite selada: check-in, custódia ativa e ocupação ativa. */
export interface DepositNightFacts {
  readonly stayDate: string;
  /** Instante do check-in, ISO 8601. */
  readonly checkinAt: string;
  readonly custody: NightCustody | null;
  readonly occupancy: { readonly bookingId: string; readonly channel: string } | null;
}

export interface DepositBookingFacts {
  readonly id: string;
  readonly holdingId: string;
  readonly stakeId: string | null;
  readonly channel: string;
  readonly state: string;
  readonly checkinDate: string;
  readonly checkoutDate: string;
}

/**
 * Situação de uma noite para o depósito, do ponto de vista da holding: elegível (Co-Owner: dentro de uma reserva
 * cedível) ou o motivo funcional da indisponibilidade (REQ-098).
 */
export type NightAvailability =
  | { readonly kind: 'eligible'; readonly bookingId: string | null }
  | { readonly kind: 'ceded' }
  | { readonly kind: 'notice' }
  | { readonly kind: 'booked' }
  | { readonly kind: 'not_reserved' }
  | { readonly kind: 'unavailable' };

/** A noite ainda respeita a antecedência mínima no instante (TECH-043). */
export const withinNotice = (checkinAt: string, nowMs: number) =>
  nowMs <= Date.parse(checkinAt) - DEPOSIT_MIN_NOTICE_HOURS * HOUR_MS;

/** Noites `[checkin, checkout)` de uma reserva, em datas civis. */
export function bookingNights(booking: Pick<DepositBookingFacts, 'checkinDate' | 'checkoutDate'>) {
  const nights: string[] = [];
  const end = Date.parse(`${booking.checkoutDate}T00:00:00Z`);
  for (let at = Date.parse(`${booking.checkinDate}T00:00:00Z`); at < end; at += DAY_MS)
    nights.push(new Date(at).toISOString().slice(0, 10));
  return nights;
}

const isCession = (custody: NightCustody | null) =>
  custody?.holderKind === 'luxtory' && custody.inventoryOrigin === 'luxchange_cession';

/** Reserva de uso próprio Co-Owner da holding, confirmada (a única cedível; ADR-0036 §1). */
const cedableBooking = (holding: DepositHolding, booking: DepositBookingFacts | undefined) =>
  booking !== undefined &&
  booking.channel === 'own_use' &&
  booking.state === 'confirmed' &&
  booking.holdingId === holding.id &&
  booking.stakeId === holding.stakeId;

/**
 * Situação da noite (ordem dos motivos: já depositada, antecedência, regra da modalidade). Owner: `owner` sem ocupação
 * (com reserva de uso próprio: cancelar antes, TECH-023). Co-Owner: `reserved_right` da Ação com a ocupação da reserva
 * confirmada da holding (sem reserva: reservar antes, REQ-060).
 */
export function nightAvailability(
  holding: DepositHolding,
  night: DepositNightFacts,
  bookingOf: (id: string) => DepositBookingFacts | undefined,
  nowMs: number,
): NightAvailability {
  const custody = night.custody;
  if (isCession(custody)) return { kind: 'ceded' };
  if (!withinNotice(night.checkinAt, nowMs)) return { kind: 'notice' };
  if (holding.modality === 'owner') {
    if (custody?.holderKind !== 'owner') return { kind: 'unavailable' };
    return night.occupancy === null ? { kind: 'eligible', bookingId: null } : { kind: 'booked' };
  }
  if (custody?.holderKind === 'spe_pool') return { kind: 'not_reserved' };
  const booking = night.occupancy === null ? undefined : bookingOf(night.occupancy.bookingId);
  if (
    custody?.holderKind === 'use_right' &&
    custody.basis === 'reserved_right' &&
    custody.stakeId === holding.stakeId &&
    night.occupancy?.channel === 'own_use' &&
    cedableBooking(holding, booking)
  )
    return { kind: 'eligible', bookingId: booking!.id };
  return { kind: 'unavailable' };
}

export type DepositRefusal = 'ERR_MIN_NOTICE' | 'ERR_CAPACITY_UNAVAILABLE';

export type DepositVerdict<B extends DepositBookingFacts = DepositBookingFacts> =
  | {
      readonly ok: true;
      /** Reservas cedidas por inteiro (Co-Owner), em ordem de id. */
      readonly bookings: readonly B[];
    }
  | { readonly ok: false; readonly code: DepositRefusal };

/**
 * Seleção depositável (command e prévia): toda noite selada e elegível; antecedência primeiro (o motivo mais acionável);
 * no Co-Owner, cada reserva tocada entra inteira (ADR-0036 §2).
 */
export function evaluateDeposit<B extends DepositBookingFacts>(input: {
  readonly holding: DepositHolding;
  readonly selected: readonly string[];
  readonly nights: readonly DepositNightFacts[];
  readonly bookings: readonly B[];
  readonly nowMs: number;
}): DepositVerdict<B> {
  const facts = new Map(input.nights.map((night) => [night.stayDate, night]));
  const bookings = new Map(input.bookings.map((booking) => [booking.id, booking]));
  if (input.selected.some((date) => !facts.has(date)))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  const verdicts = input.selected.map((date) =>
    nightAvailability(input.holding, facts.get(date)!, (id) => bookings.get(id), input.nowMs),
  );
  if (verdicts.some((verdict) => verdict.kind === 'notice'))
    return { ok: false, code: 'ERR_MIN_NOTICE' };
  if (verdicts.some((verdict) => verdict.kind !== 'eligible'))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  const selected = new Set(input.selected);
  const ceded = [
    ...new Set(
      verdicts.flatMap((verdict) =>
        verdict.kind === 'eligible' && verdict.bookingId !== null ? [verdict.bookingId] : [],
      ),
    ),
  ]
    .sort()
    .map((id) => bookings.get(id)!);
  if (ceded.some((booking) => bookingNights(booking).some((night) => !selected.has(night))))
    return { ok: false, code: 'ERR_CAPACITY_UNAVAILABLE' };
  return { ok: true, bookings: ceded };
}

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;

/** Escala comum de decimais canônicos não negativos (`"12"`, `"0.5"`) para soma e comparação exatas em `bigint`. */
function scaled(values: readonly string[]) {
  for (const value of values)
    if (!DECIMAL.test(value)) throw new RangeError(`not a canonical decimal: ${value}`);
  const digits = Math.max(0, ...values.map((value) => value.split('.')[1]?.length ?? 0));
  const units = values.map((value) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(`${whole}${fraction.padEnd(digits, '0')}`);
  });
  return { digits, units };
}

function fromUnits(units: bigint, digits: number): string {
  const text = units.toString().padStart(digits + 1, '0');
  const whole = text.slice(0, text.length - digits);
  const fraction = text.slice(text.length - digits).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/** Soma exata de quantidades de Créditos (texto decimal canônico). */
export function sumCredits(values: readonly string[]): string {
  if (values.length === 0) return '0';
  const { digits, units } = scaled(values);
  return fromUnits(
    units.reduce((total, value) => total + value, 0n),
    digits,
  );
}

/** Igualdade exata de duas quantidades em texto decimal canônico. */
export function sameCredits(left: string, right: string): boolean {
  if (!DECIMAL.test(left) || !DECIMAL.test(right)) return false;
  const { units } = scaled([left, right]);
  return units[0] === units[1];
}

/**
 * Termos revisados por noite (ADR-0036 §8): os Créditos que a revisão mostrou para cada data, na ordem das datas, são
 * exatamente os recalculados — mesma quantidade de noites e igualdade decimal exata em cada posição.
 */
export function sameNightCredits(reviewed: readonly string[], current: readonly string[]): boolean {
  return (
    reviewed.length === current.length &&
    reviewed.every((credits, index) => sameCredits(credits, current[index]!))
  );
}
