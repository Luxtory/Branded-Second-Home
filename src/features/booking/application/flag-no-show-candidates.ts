import type { CommandHandler } from '@/features/platform';
import { isoFromMicros, noShowWindowOpen, type BookingState } from '../domain/own-use-lifecycle';
import {
  bookingJobInput,
  type BookingJobDependencies,
  type BookingJobInput,
} from './advance-booking-states';
import { reject } from './own-use-closing';

export type FlagNoShowCandidatesResult = {
  readonly booking_id: string;
  readonly flagged_at: string;
};

const FLAGGABLE: readonly BookingState[] = ['confirmed', 'in_use'];

/**
 * `flag_no_show_candidates` (TECH-046, TECH-090; ADR-0027 §7; spec booking §10.14): registra, uma vez, a reserva
 * `confirmed`/`in_use` com a janela `[1º check-in, check-out)` aberta no instante do banco. Só a trava da reserva (a mesma
 * das transições), antes de reler estado, janela e registro: serializa com cancelamento, exceção e declaração sem travar
 * a Ação. Nunca declara no-show — ato do Admin com autorização independente, que não depende deste registro. Fora das
 * condições → `ERR_STATE_TRANSITION`, sem efeito (nunca a violação de unicidade da PK).
 */
export function createFlagNoShowCandidatesHandler<Tx>(
  deps: BookingJobDependencies<Tx>,
): CommandHandler<BookingJobInput, FlagNoShowCandidatesResult, Tx> {
  return {
    command: 'flag_no_show_candidates',
    input: bookingJobInput,
    secondHomeId: (input) => input.second_home_id,
    async execute(context) {
      const { input, tx } = context;
      const found = await deps.store.findBooking(tx, input.booking_id);
      if (found === null || found.secondHomeId !== input.second_home_id)
        throw reject('ERR_NOT_FOUND');
      for (const key of context.locks.claim('booking', [found.id]))
        await deps.store.lockBooking(tx, key);
      const booking = await deps.store.findBooking(tx, found.id);
      if (booking === null || !FLAGGABLE.includes(booking.state))
        throw reject('ERR_STATE_TRANSITION');
      const period = await deps.store.period(tx, booking.id);
      const at = await deps.jobs.databaseNow(tx);
      if (!noShowWindowOpen(period.nights[0]!.checkinAt, period.checkoutAt, at))
        throw reject('ERR_STATE_TRANSITION');
      if (await deps.jobs.isFlagged(tx, booking.id)) throw reject('ERR_STATE_TRANSITION');
      const flaggedAt = isoFromMicros(await deps.jobs.flag(tx, booking.id, context.operationId));
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: { state: booking.state, act: 'flag_no_show_candidates', flagged_at: flaggedAt },
      });
      return { booking_id: booking.id, flagged_at: flaggedAt };
    },
  };
}
