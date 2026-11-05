/**
 * Ciclo da reserva de uso próprio (W13; TECH-043, TECH-046, TECH-055; spec booking §10). Funções puras, gêmeas das
 * funções SQL da E1 (`app.own_use_cancellation_timely`, `app.booking_no_show_window_open`,
 * `app.booking_release_reason`, `app.own_use_reserved_right_successor`) — a equivalência é testada contra o banco. O
 * banco é a autoridade do instante (T3): estas funções servem para recusar cedo e para a prévia, nunca para decidir
 * efeito.
 */

export type BookingState =
  'confirmed' | 'in_use' | 'completed' | 'cancelled' | 'no_show' | 'in_exception';

/** Natureza econômica da transição (spec booking §10.11), como no `CHECK` de `app.booking_state_transition`. */
export type TransitionKind =
  | 'advance'
  | 'cancellation'
  | 'no_show'
  | 'exception_opening'
  | 'exception_resolution'
  | 'invalidation';

/** Transições que liberam noites (`cancelled` ou `no_show`). */
export type ClosingKind = 'cancellation' | 'no_show' | 'exception_resolution' | 'invalidation';

export type CancellationClass = 'timely' | 'late';
export type ExceptionType = 'operational' | 'unauthorized_booking';
export type Modality = 'owner' | 'co_owner';
export type ReleaseReason = 'cancelled' | 'no_show' | 'exception' | 'invalidation';

/**
 * Instante em microssegundos desde a época Unix: a resolução do `timestamptz` (D10). Nunca `Date` nas regras do ciclo
 * da reserva — a conversão para milissegundos perderia as fronteiras de 1 µs.
 */
export type Micros = bigint;

const MICROS_PER_MILLI = 1000n;
const MICROS_PER_HOUR = 3_600_000_000n;
/** D11 da W13 (decisão funcional expressa do fundador): 15 dias = 360 h sobre instantes (TECH-040, TECH-044). */
export const CANCELLATION_NOTICE_HOURS = 360n;

/** Instante de um relógio em milissegundos (o `Clock` do servidor), sem perda: só tem precisão menor. */
export const microsFromMillis = (millis: number): Micros => BigInt(millis) * MICROS_PER_MILLI;

const MICROS_PER_SECOND = 1_000_000n;
const ISO_SECONDS = 19; // `YYYY-MM-DDTHH:MM:SS`

/** ISO 8601 em UTC com 6 casas (`…SS.ffffffZ`): o `timestamptz` guarda e devolve sem arredondar. */
export function isoFromMicros(value: Micros): string {
  const seconds = value / MICROS_PER_SECOND - (value % MICROS_PER_SECOND < 0n ? 1n : 0n);
  const fraction = value - seconds * MICROS_PER_SECOND;
  const whole = new Date(Number(seconds) * 1000).toISOString().slice(0, ISO_SECONDS);
  return `${whole}.${fraction.toString().padStart(6, '0')}Z`;
}

/** TECH-055: pares permitidos por natureza (o `CHECK conflict_booking_transition_pair` repete a regra no banco). */
const TRANSITIONS: Readonly<
  Record<TransitionKind, readonly (readonly [BookingState, BookingState])[]>
> = {
  advance: [
    ['confirmed', 'in_use'],
    ['in_use', 'completed'],
  ],
  cancellation: [
    ['confirmed', 'cancelled'],
    ['in_use', 'cancelled'],
    ['in_exception', 'cancelled'],
  ],
  no_show: [
    ['confirmed', 'no_show'],
    ['in_use', 'no_show'],
  ],
  exception_opening: [
    ['confirmed', 'in_exception'],
    ['in_use', 'in_exception'],
  ],
  exception_resolution: [
    ['in_exception', 'confirmed'],
    ['in_exception', 'completed'],
    ['in_exception', 'cancelled'],
  ],
  invalidation: [['in_exception', 'cancelled']],
};

export function isAllowedTransition(
  kind: TransitionKind,
  from: BookingState,
  to: BookingState,
): boolean {
  return TRANSITIONS[kind].some(([a, b]) => a === from && b === to);
}

/** Último instante tempestivo: 1º check-in − 360 h, inclusive (spec booking §10.4). */
export const timelyUntil = (firstCheckinAt: Micros): Micros =>
  firstCheckinAt - CANCELLATION_NOTICE_HOURS * MICROS_PER_HOUR;

/** Gêmea de `app.own_use_cancellation_timely`: tempestivo ⇔ `at ≤ 1º check-in − 360 h`. */
export const isTimelyCancellation = (firstCheckinAt: Micros, at: Micros): boolean =>
  at <= timelyUntil(firstCheckinAt);

/** Gêmea de `app.booking_no_show_window_open`: janela estrita `[1º check-in, check-out)` (TECH-046, D8). */
export const noShowWindowOpen = (firstCheckinAt: Micros, checkoutAt: Micros, at: Micros): boolean =>
  firstCheckinAt <= at && at < checkoutAt;

/** Resolução sem cancelamento (REQ-084): `confirmed` só antes do check-out; `completed` só a partir dele. */
export const resolutionAllowed = (
  outcome: 'confirmed' | 'completed',
  checkoutAt: Micros,
  at: Micros,
): boolean => (outcome === 'confirmed' ? at < checkoutAt : at >= checkoutAt);

export interface LifecycleNight {
  readonly stayDate: string;
  readonly checkinAt: Micros;
}

/** Noites não iniciadas no instante (`at < checkin_at`, TECH-043), em ordem crescente de data. */
export const unstartedNights = (
  nights: readonly LifecycleNight[],
  at: Micros,
): readonly LifecycleNight[] =>
  [...nights]
    .filter((night) => at < night.checkinAt)
    .sort((a, b) => (a.stayDate < b.stayDate ? -1 : 1));

export interface CancellationTerms {
  readonly cancellationClass: CancellationClass | null;
  readonly firstAffectedDate: string | null;
}

/**
 * Termos do cancelamento no instante (REQ-080, D7): classe só no Co-Owner (REQ-081: o Owner não tem classe) e a
 * primeira noite não iniciada. É o que a prévia mostra e o que o banco recalcula na escrita.
 */
export function cancellationTerms(
  modality: Modality,
  nights: readonly LifecycleNight[],
  at: Micros,
): CancellationTerms {
  const ordered = [...nights].sort((a, b) => (a.stayDate < b.stayDate ? -1 : 1));
  const first = ordered[0];
  return {
    cancellationClass:
      modality === 'owner' || first === undefined
        ? null
        : isTimelyCancellation(first.checkinAt, at)
          ? 'timely'
          : 'late',
    firstAffectedDate: unstartedNights(ordered, at)[0]?.stayDate ?? null,
  };
}

/** Gêmea de `app.booking_release_reason`: motivo da liberação de ocupação pela natureza da transição. */
export const RELEASE_REASON: Readonly<Record<ClosingKind, ReleaseReason>> = {
  cancellation: 'cancelled',
  no_show: 'no_show',
  exception_resolution: 'exception',
  invalidation: 'invalidation',
};

export interface ClosingEffect {
  readonly releaseReason: ReleaseReason;
  /** Sucessora da `reserved_right` (Co-Owner); `null` no Owner, cuja custódia `owner` não muda (REQ-081). */
  readonly successor: 'spe_pool' | 'forfeited_right' | null;
  /** `restore` (tempestivo, BR-280), `correction` (invalidação, TECH-026) ou nada (tardio, no-show, Owner). */
  readonly reversal: 'restore' | 'correction' | null;
}

/**
 * Efeito por noite não iniciada (matriz da spec booking §10.3): gêmea de `app.own_use_reserved_right_successor` — a
 * invalidação e o cancelamento tempestivo devolvem a `spe_pool`; tardio e no-show mantêm o consumo como
 * `forfeited_right`.
 */
export function closingEffect(
  modality: Modality,
  kind: ClosingKind,
  cancellationClass: CancellationClass | null,
): ClosingEffect {
  const releaseReason = RELEASE_REASON[kind];
  if (modality === 'owner') return { releaseReason, successor: null, reversal: null };
  if (kind === 'invalidation')
    return { releaseReason, successor: 'spe_pool', reversal: 'correction' };
  return cancellationClass === 'timely'
    ? { releaseReason, successor: 'spe_pool', reversal: 'restore' }
    : { releaseReason, successor: 'forfeited_right', reversal: null };
}
