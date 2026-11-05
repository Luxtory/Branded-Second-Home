import { randomUUID } from 'node:crypto';
import type { UseRightBucket } from '@/features/calendar/booking';
import { OwnUseLifecycleWriteError } from '@/features/inventory';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  type CommandContext,
  type JsonObject,
  type RejectionCode,
} from '@/features/platform';
import {
  closingEffect,
  microsFromMillis,
  type CancellationTerms,
  type ClosingKind,
  type Micros,
  type Modality,
} from '../domain/own-use-lifecycle';
import type { NightsByBucket } from './own-use-lifecycle-events';
import type {
  LifecycleBooking,
  LifecycleDependencies,
  LifecyclePeriod,
  OpenException,
  RecordedTransition,
} from './own-use-lifecycle-ports';

/**
 * Peças comuns dos commands do ciclo da reserva (W13; TECH-051, TECH-053, TECH-054; ADR-0027; spec booking §10.5,
 * §10.11.1, §10.12): K2, autoridade, travas determinísticas e o motor de fechamento (transição → resolução → por noite:
 * liberação, custódia, reversão). O banco confere de novo cada escrita no instante dela (T3); a revalidação aqui só
 * recusa cedo e na ordem das recusas da spec.
 */

/** K2 do ADR-0027 §5. */
export const OWN_USE_LIFECYCLE_CAPABILITY = 'own_use_lifecycle';

export const reject = (code: RejectionCode) => new CommandRejection(code);

export const modalityOf = (booking: LifecycleBooking): Modality =>
  booking.stakeId === null ? 'owner' : 'co_owner';

export const nowMicros = (context: { readonly now: Date }): Micros =>
  microsFromMillis(context.now.getTime());

interface BookingTarget {
  readonly second_home_id: string;
  readonly booking_id: string;
}

/** A leitura da K2 vem primeiro e dentro da transação (como a K1 na W12): sem a linha, nada acontece. */
export async function assertLifecycleOpen<Tx>(deps: LifecycleDependencies<Tx>, tx: Tx) {
  if (!(await deps.store.lifecycleActivated(tx)))
    throw new CapabilityNotActivatedError(OWN_USE_LIFECYCLE_CAPABILITY);
}

/** Ato Admin: autoridade revalidada na transação, depois a reserva (inexistente ou de outra casa → ERR_NOT_FOUND). */
export async function adminTarget<I extends BookingTarget, Tx>(
  deps: LifecycleDependencies<Tx>,
  context: CommandContext<I, Tx>,
): Promise<LifecycleBooking> {
  await deps.assertAdmin(context.tx, context.actor, context.authorizationRef);
  const booking = await deps.store.findBooking(context.tx, context.input.booking_id);
  if (booking === null || booking.secondHomeId !== context.input.second_home_id)
    throw reject('ERR_NOT_FOUND');
  return booking;
}

/**
 * Ato do Titular: delegação ativa travada `FOR SHARE` e holding vigente igual à `holding_id` da reserva. Reserva
 * inexistente e reserva de outra party respondem igual (T-1309): `ERR_PERMISSION`.
 */
export async function titularTarget<I extends BookingTarget, Tx>(
  deps: LifecycleDependencies<Tx>,
  context: CommandContext<I, Tx>,
): Promise<LifecycleBooking> {
  const { actor, tx, input } = context;
  if (actor.kind !== 'user' || actor.actingPartyId === null) throw reject('ERR_PERMISSION');
  const representation = await deps.store.lockRepresentation(tx, {
    userId: actor.userId,
    partyId: actor.actingPartyId,
    secondHomeId: input.second_home_id,
    at: context.now,
  });
  const booking = await deps.store.findBooking(tx, input.booking_id);
  if (
    representation === null ||
    booking === null ||
    booking.secondHomeId !== input.second_home_id ||
    booking.holdingId !== representation.holdingId
  )
    throw reject('ERR_PERMISSION');
  return booking;
}

/**
 * Travas na ordem do ADR-0027 §2 (spec booking §10.11.1): Ação (Co-Owner) → noites em ordem crescente (se houver) →
 * reserva — cada chave numa instrução própria. Devolve a reserva relida depois delas (READ COMMITTED: a transição
 * concorrente que venceu já está visível).
 */
export async function lockTarget<I, Tx>(
  deps: LifecycleDependencies<Tx>,
  context: CommandContext<I, Tx>,
  booking: LifecycleBooking,
  nights: readonly string[],
): Promise<LifecycleBooking> {
  const { locks, tx } = context;
  if (booking.stakeId !== null)
    for (const key of locks.claim('stake', [booking.stakeId])) await deps.store.lockStake(tx, key);
  const nightKeys = locks.claim(
    'second_home_date',
    nights.map((night) => [booking.secondHomeId, night] as const),
  );
  if (nightKeys.length > 0)
    await deps.store.lockNights(
      tx,
      booking.secondHomeId,
      nightKeys.map(([, night]) => night),
    );
  for (const key of locks.claim('booking', [booking.id])) await deps.store.lockBooking(tx, key);
  const current = await deps.store.findBooking(tx, booking.id);
  if (current === null) throw new OwnUseLifecycleWriteError(`booking ${booking.id}`);
  return current;
}

/** A exceção aberta de uma reserva `in_exception` (invariante da E1: exatamente uma). */
export async function openExceptionOf<Tx>(
  deps: LifecycleDependencies<Tx>,
  tx: Tx,
  booking: LifecycleBooking,
): Promise<OpenException | null> {
  if (booking.state !== 'in_exception') return null;
  const exception = await deps.store.openException(tx, booking.id);
  if (exception === null) throw new OwnUseLifecycleWriteError(`open exception of ${booking.id}`);
  return exception;
}

export type NightReversal<Tx> = (
  tx: Tx,
  night: {
    readonly bookingOperationId: string;
    readonly stayDate: string;
    readonly operationId: string;
  },
  movement: 'restore' | 'correction',
) => Promise<UseRightBucket>;

/** Reversão pelo ledger do calendar (`restore` do cancelamento tempestivo). */
export function ledgerReversal<Tx>(deps: LifecycleDependencies<Tx>): NightReversal<Tx> {
  return async (tx, night, movement) => {
    const bucket = await deps.reversal.reverseCreationConsumption(tx, { ...night, movement });
    if (bucket === null) throw new OwnUseLifecycleWriteError(`consumption on ${night.stayDate}`);
    return bucket;
  };
}

export interface ClosingRequest<Tx> {
  readonly booking: LifecycleBooking;
  readonly period: LifecyclePeriod;
  readonly exception: OpenException | null;
  readonly kind: ClosingKind;
  readonly toState: 'cancelled' | 'no_show';
  /** Termos esperados da prévia (cancelamento do Titular); `null` nos atos Admin. */
  readonly expected: CancellationTerms | null;
  readonly basis: string | null;
  readonly authorizationId: string | null;
  readonly reverse: NightReversal<Tx>;
}

export type NightOutcome = 'reverted' | 'released' | 'kept';

export interface ClosingOutcome {
  readonly transition: RecordedTransition;
  readonly released: readonly string[];
  /** Revertido por bucket (`restore` ou `correction`); `null` quando não há reversão. */
  readonly reversed: NightsByBucket | null;
  /** Noites que viram `forfeited_right`; `null` quando a sucessora não é `forfeited_right`. */
  readonly forfeited: number | null;
  readonly nights: readonly { readonly stayDate: string; readonly outcome: NightOutcome }[];
}

/**
 * Motor de fechamento (spec booking §10.3, §10.11.1): uso da autorização (atos Admin) → transição (o banco calcula
 * instante, classe e primeira noite afetada) → resolução da exceção aberta → por noite não iniciada no instante da
 * transição, em ordem crescente: liberação, sucessora da `reserved_right` e reversão. Os efeitos saem do que o banco
 * gravou, nunca do relógio do servidor (D10).
 */
export async function closeOwnUseBooking<I, Tx>(
  deps: LifecycleDependencies<Tx>,
  context: CommandContext<I, Tx>,
  request: ClosingRequest<Tx>,
): Promise<ClosingOutcome> {
  const { tx, operationId } = context;
  const { booking } = request;
  if (request.authorizationId !== null)
    await deps.store.useAuthorization(tx, {
      authorizationId: request.authorizationId,
      bookingId: booking.id,
      operationId,
    });
  const transition = await deps.store.insertTransition(tx, {
    id: (deps.newId ?? randomUUID)(),
    booking,
    kind: request.kind,
    toState: request.toState,
    operationId,
    expectedClass: request.expected?.cancellationClass ?? null,
    expectedFirstAffectedDate: request.expected?.firstAffectedDate ?? null,
    basis: request.basis,
  });
  if (request.exception !== null)
    await deps.store.insertResolution(tx, {
      exceptionId: request.exception.id,
      bookingId: booking.id,
      transitionId: transition.id,
      outcome: 'cancelled',
      source: request.kind === 'cancellation' ? 'titular_cancellation' : 'admin',
    });
  const effect = closingEffect(modalityOf(booking), request.kind, transition.cancellationClass);
  const first = transition.firstAffectedDate;
  const released =
    first === null
      ? []
      : request.period.nights.map((night) => night.stayDate).filter((date) => date >= first);
  const reversed = { alta: 0, media: 0, leap: 0 };
  for (const stayDate of released) {
    const freed = await deps.inventory.releaseOccupancy(tx, {
      bookingId: booking.id,
      stayDate,
      reason: effect.releaseReason,
      operationId,
    });
    if (!freed) throw new OwnUseLifecycleWriteError(`occupancy of ${booking.id} on ${stayDate}`);
    if (effect.successor !== null && booking.stakeId !== null) {
      const moved = await deps.inventory.succeedReservedRight(tx, {
        secondHomeId: booking.secondHomeId,
        stayDate,
        stakeId: booking.stakeId,
        successor: effect.successor,
        operationId,
      });
      if (!moved) throw new OwnUseLifecycleWriteError(`reserved right on ${stayDate}`);
    }
    if (effect.reversal !== null) {
      const bucket = await request.reverse(
        tx,
        { bookingOperationId: booking.openedByOperation, stayDate, operationId },
        effect.reversal,
      );
      reversed[bucket] += 1;
    }
  }
  const outcome: NightOutcome = effect.reversal === null ? 'released' : 'reverted';
  return {
    transition,
    released,
    reversed: effect.reversal === null ? null : reversed,
    forfeited: effect.successor === 'forfeited_right' ? released.length : null,
    nights: request.period.nights.map((night) => ({
      stayDate: night.stayDate,
      outcome: released.includes(night.stayDate) ? outcome : 'kept',
    })),
  };
}

/** Destinatário das notificações: a party da holding da reserva, fixada no COMMIT (ADR-0026 D6). */
export async function recipientOf<Tx>(
  deps: LifecycleDependencies<Tx>,
  tx: Tx,
  booking: LifecycleBooking,
): Promise<string> {
  const party = await deps.store.holdingParty(tx, booking.holdingId);
  if (party === null) throw new OwnUseLifecycleWriteError(`party of holding ${booking.holdingId}`);
  return party;
}

/** Auditoria por noite (ADR-0027 §3): revertida, liberada ou mantida (iniciada). */
export const nightsAudit = (outcome: ClosingOutcome): JsonObject[] =>
  outcome.nights.map((night) => ({ stay_date: night.stayDate, outcome: night.outcome }));

/** Datas não iniciadas ⊆ escopo gravado na autorização (o banco repete a conferência por noite). */
export const withinScope = (dates: readonly string[], scope: readonly string[]): boolean =>
  dates.every((date) => scope.includes(date));
