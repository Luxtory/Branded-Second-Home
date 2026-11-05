import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import {
  cancellationTerms,
  isoFromMicros,
  type BookingState,
  type CancellationClass,
} from '../domain/own-use-lifecycle';
import { bookingTarget, civilDate } from './lifecycle-inputs';
import {
  assertLifecycleOpen,
  closeOwnUseBooking,
  ledgerReversal,
  lockTarget,
  modalityOf,
  nightsAudit,
  nowMicros,
  openExceptionOf,
  recipientOf,
  reject,
  titularTarget,
} from './own-use-closing';
import { lifecycleEvent, nightsJson, OWN_USE_BOOKING_CANCELLED } from './own-use-lifecycle-events';
import type { LifecycleDependencies } from './own-use-lifecycle-ports';

export const cancelOwnUseBookingInput = z.strictObject({
  ...bookingTarget,
  /** Termos da prévia (D7): classe (Co-Owner; `null` no Owner) e a primeira noite afetada. */
  expected_cancellation_class: z.enum(['timely', 'late']).nullable(),
  expected_first_affected_date: civilDate,
});
export type CancelOwnUseBookingInput = z.infer<typeof cancelOwnUseBookingInput>;

export type CancelOwnUseBookingResult = {
  readonly booking_id: string;
  readonly state: 'cancelled';
  readonly cancelled_at: string;
  readonly cancellation_class: CancellationClass | null;
  readonly released_dates: readonly string[];
  readonly restored: {
    readonly alta: number;
    readonly media: number;
    readonly leap: number;
  } | null;
  readonly forfeited_nights: number | null;
};

const CANCELLABLE: readonly BookingState[] = ['confirmed', 'in_use', 'in_exception'];

/**
 * `cancel_own_use_booking` (REQ-080, REQ-081, REQ-084; BR-280–BR-283; TECH-043, TECH-051; ADR-0027 §3; spec booking
 * §10.5): o Titular cancela a reserva inteira. Representação, K2 e prazo no banco — sem autorização independente.
 * Tempestivo (Co-Owner): libera todas, `spe_pool` e `restore` por noite; tardio: as não iniciadas viram
 * `forfeited_right`, consumo mantido; Owner: libera as não iniciadas, custódia `owner`. Termos diferentes da prévia →
 * `ERR_CANCELLATION_TERMS_CHANGED`, sem efeito (D7). Em apuração (P-B), o Co-Owner só cancela tempestivamente.
 */
export function createCancelOwnUseBookingHandler<Tx>(
  deps: LifecycleDependencies<Tx>,
): CommandHandler<CancelOwnUseBookingInput, CancelOwnUseBookingResult, Tx> {
  return {
    command: 'cancel_own_use_booking',
    input: cancelOwnUseBookingInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await titularTarget(deps, context);
      const period = await deps.store.period(tx, target.id);
      const booking = await lockTarget(
        deps,
        context,
        target,
        period.nights.map((night) => night.stayDate),
      );
      if (!CANCELLABLE.includes(booking.state)) throw reject('ERR_STATE_TRANSITION');
      const exception = await openExceptionOf(deps, tx, booking);
      const terms = cancellationTerms(modalityOf(booking), period.nights, nowMicros(context));
      if (terms.firstAffectedDate === null) throw reject('ERR_STATE_TRANSITION');
      // REQ-084: na apuração, o cancelamento tardio do Co-Owner fica suspenso.
      if (exception?.type === 'unauthorized_booking' && terms.cancellationClass === 'late')
        throw reject('ERR_STATE_TRANSITION');
      if (
        terms.cancellationClass !== input.expected_cancellation_class ||
        terms.firstAffectedDate !== input.expected_first_affected_date
      )
        throw reject('ERR_CANCELLATION_TERMS_CHANGED');

      const outcome = await closeOwnUseBooking(deps, context, {
        booking,
        period,
        exception,
        kind: 'cancellation',
        toState: 'cancelled',
        expected: {
          cancellationClass: input.expected_cancellation_class,
          firstAffectedDate: input.expected_first_affected_date,
        },
        basis: null,
        authorizationId: null,
        reverse: ledgerReversal(deps),
      });
      const cancellationClass = outcome.transition.cancellationClass;
      context.emit(
        lifecycleEvent(OWN_USE_BOOKING_CANCELLED, outcome.transition.id, {
          booking_id: booking.id,
          second_home_id: booking.secondHomeId,
          recipient_party_id: await recipientOf(deps, tx, booking),
          cause: 'titular',
          exception_id: exception?.id ?? null,
          exception_type: exception?.type ?? null,
          cancellation_class: cancellationClass,
          released_nights: outcome.released.length,
          first_released_date: outcome.released[0]!,
          restored: nightsJson(outcome.reversed),
          forfeited_nights: outcome.forfeited,
        }),
      );
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: {
          state: 'cancelled',
          act: 'cancel_own_use_booking',
          transition_id: outcome.transition.id,
          cancellation_class: cancellationClass,
          first_affected_date: outcome.transition.firstAffectedDate,
          exception_id: exception?.id ?? null,
          nights: nightsAudit(outcome),
        },
      });
      return {
        booking_id: booking.id,
        state: 'cancelled',
        cancelled_at: isoFromMicros(outcome.transition.recordedAt),
        cancellation_class: cancellationClass,
        released_dates: outcome.released,
        restored: outcome.reversed,
        forfeited_nights: outcome.forfeited,
      };
    },
  };
}
