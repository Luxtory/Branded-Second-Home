import type { CoOwnerInvalidationPort, CorrectUseRightInput } from '@/features/calendar/booking';
import { isoFromMicros, unstartedNights } from '../domain/own-use-lifecycle';
import {
  adminTarget,
  assertLifecycleOpen,
  closeOwnUseBooking,
  lockTarget,
  nightsAudit,
  nowMicros,
  openExceptionOf,
  recipientOf,
  reject,
  withinScope,
} from './own-use-closing';
import {
  lifecycleEvent,
  nightsJson,
  OWN_USE_BOOKING_INVALIDATED,
} from './own-use-lifecycle-events';
import type { LifecycleDependencies } from './own-use-lifecycle-ports';

/**
 * A parte da reserva do `correct_use_right` (REQ-084; TECH-022, TECH-026; ADR-0027 §3; spec booking §10.5, §10.12 D3):
 * só apuração aberta de reserva de Co-Owner, com a autorização `invalidation` da mesma operação. Uma operação: resolve
 * a apuração, libera e devolve à `spe_pool` cada noite não iniciada e grava a `correction` que o calendar define.
 */
export function createCoOwnerInvalidation<Tx>(
  deps: LifecycleDependencies<Tx>,
): CoOwnerInvalidationPort<Tx> {
  return {
    async invalidate(context, correct) {
      const { input, tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await adminTarget<CorrectUseRightInput, Tx>(deps, context);
      if (target.stakeId === null) throw reject('ERR_STATE_TRANSITION');
      const period = await deps.store.period(tx, target.id);
      const booking = await lockTarget(
        deps,
        context,
        target,
        period.nights.map((night) => night.stayDate),
      );
      const exception = await openExceptionOf(deps, tx, booking);
      if (
        exception === null ||
        exception.id !== input.exception_id ||
        exception.type !== 'unauthorized_booking'
      )
        throw reject('ERR_STATE_TRANSITION');
      const unstarted = unstartedNights(period.nights, nowMicros(context)).map(
        (night) => night.stayDate,
      );
      if (unstarted.length === 0) throw reject('ERR_STATE_TRANSITION');
      const authorization = await deps.store.liveAuthorization(tx, {
        bookingId: booking.id,
        purpose: 'invalidation',
        exceptionId: exception.id,
      });
      if (authorization === null || !withinScope(unstarted, authorization.scopeDates))
        throw reject('ERR_PERMISSION');

      const outcome = await closeOwnUseBooking(deps, context, {
        booking,
        period,
        exception,
        kind: 'invalidation',
        toState: 'cancelled',
        expected: null,
        basis: input.basis,
        authorizationId: authorization.id,
        reverse: (innerTx, night) => correct(innerTx, night),
      });
      const corrected = outcome.reversed ?? { alta: 0, media: 0, leap: 0 };
      context.emit(
        lifecycleEvent(OWN_USE_BOOKING_INVALIDATED, outcome.transition.id, {
          booking_id: booking.id,
          second_home_id: booking.secondHomeId,
          recipient_party_id: await recipientOf(deps, tx, booking),
          exception_id: exception.id,
          released_nights: outcome.released.length,
          first_released_date: outcome.released[0]!,
          corrected: nightsJson(corrected),
        }),
      );
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: {
          state: 'cancelled',
          act: 'correct_use_right',
          transition_id: outcome.transition.id,
          exception_id: exception.id,
          authorization_id: authorization.id,
          basis: input.basis,
          nights: nightsAudit(outcome),
        },
      });
      return {
        booking_id: booking.id,
        exception_id: exception.id,
        state: 'cancelled',
        invalidated_at: isoFromMicros(outcome.transition.recordedAt),
        released_dates: outcome.released,
        corrected,
      };
    },
  };
}
