import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import { advanceSteps, type BookingState } from '../domain/own-use-lifecycle';
import { reject } from './own-use-closing';
import type { BookingJobStore } from './own-use-lifecycle-jobs';
import type { BookingAdvanceStore, BookingLifecycleStore } from './own-use-lifecycle-ports';

export const bookingJobInput = z.strictObject({
  second_home_id: z.uuid(),
  booking_id: z.uuid(),
});
export type BookingJobInput = z.infer<typeof bookingJobInput>;

export type AdvanceBookingStatesResult = {
  readonly booking_id: string;
  readonly from_state: BookingState;
  readonly to_state: BookingState;
  readonly transitions: number;
};

export interface BookingJobDependencies<Tx, Store = BookingLifecycleStore<Tx>> {
  readonly store: Store;
  readonly jobs: BookingJobStore<Tx>;
  readonly newId?: () => string;
}

/**
 * `advance_booking_states` (TECH-055, TECH-090; spec booking §10.2, §10.14): avança o estado informativo da reserva pelo
 * instante do banco — `in_use` a partir do 1º check-in, `completed` a partir do check-out, as duas na mesma operação
 * quando o job atrasou. Trava a Ação (se houver) e a reserva, na ordem do ADR-0027 §2, antes de reler; reserva em
 * exceção ou terminal → `ERR_STATE_TRANSITION`, sem efeito. Nenhum evento nem escrita de ledger, custódia ou ocupação.
 */
export function createAdvanceBookingStatesHandler<Tx>(
  deps: BookingJobDependencies<Tx, BookingAdvanceStore<Tx>>,
): CommandHandler<BookingJobInput, AdvanceBookingStatesResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'advance_booking_states',
    input: bookingJobInput,
    secondHomeId: (input) => input.second_home_id,
    async execute(context) {
      const { input, tx, locks } = context;
      const found = await deps.store.findAdvanceBooking(tx, input.booking_id);
      if (found === null || found.secondHomeId !== input.second_home_id)
        throw reject('ERR_NOT_FOUND');
      if (found.stakeId !== null)
        for (const key of locks.claim('stake', [found.stakeId]))
          await deps.store.lockStake(tx, key);
      for (const key of locks.claim('booking', [found.id])) await deps.store.lockBooking(tx, key);
      const booking = await deps.store.findAdvanceBooking(tx, found.id);
      if (booking === null) throw reject('ERR_NOT_FOUND');
      const period = await deps.store.advancePeriod(tx, booking.id);
      const at = await deps.jobs.databaseNow(tx);
      const steps = advanceSteps(booking.state, period.firstCheckinAt, period.checkoutAt, at);
      if (steps.length === 0) throw reject('ERR_STATE_TRANSITION');
      let current = booking;
      const transitionIds: string[] = [];
      for (const toState of steps) {
        const transition = await deps.store.insertTransition(tx, {
          id: newId(),
          booking: current,
          kind: 'advance',
          toState,
          operationId: context.operationId,
          expectedClass: null,
          expectedFirstAffectedDate: null,
          basis: null,
        });
        transitionIds.push(transition.id);
        current = { ...current, state: toState, lastTransitionId: transition.id };
      }
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: {
          state: current.state,
          act: 'advance_booking_states',
          transition_ids: transitionIds,
        },
      });
      return {
        booking_id: booking.id,
        from_state: booking.state,
        to_state: current.state,
        transitions: transitionIds.length,
      };
    },
  };
}
