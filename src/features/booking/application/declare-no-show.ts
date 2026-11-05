import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import {
  isoFromMicros,
  noShowWindowOpen,
  unstartedNights,
  type BookingState,
} from '../domain/own-use-lifecycle';
import { bookingTarget, referenceBasis } from './lifecycle-inputs';
import {
  adminTarget,
  assertLifecycleOpen,
  closeOwnUseBooking,
  ledgerReversal,
  lockTarget,
  nightsAudit,
  nowMicros,
  recipientOf,
  reject,
  withinScope,
} from './own-use-closing';
import { lifecycleEvent, OWN_USE_NO_SHOW_DECLARED } from './own-use-lifecycle-events';
import type { LifecycleDependencies } from './own-use-lifecycle-ports';

export const declareNoShowInput = z.strictObject({
  ...bookingTarget,
  /** Referência ao registro verificável de não comparecimento, atestada pelo Admin (spec booking §10.5). */
  basis: referenceBasis,
});
export type DeclareNoShowInput = z.infer<typeof declareNoShowInput>;

export type DeclareNoShowResult = {
  readonly booking_id: string;
  readonly state: 'no_show';
  readonly declared_at: string;
  readonly released_dates: readonly string[];
  readonly forfeited_nights: number | null;
};

const DECLARABLE: readonly BookingState[] = ['confirmed', 'in_use'];

/**
 * `declare_no_show` (BR-282, REQ-081; TECH-046, TECH-051; ADR-0027 §3–§4; spec booking §10.5): Admin + base + a
 * autorização independente `no_show` da mesma operação, na janela estrita `[1º check-in, check-out)`. As noites não
 * iniciadas são liberadas; no Co-Owner viram `forfeited_right` (consumo mantido); no Owner a custódia segue `owner`.
 * Reserva de uma noite ou ausência na última noite: só o estado. Em apuração (P-B) o no-show fica suspenso: a
 * reserva está `in_exception`, fora da TECH-055 para o no-show.
 */
export function createDeclareNoShowHandler<Tx>(
  deps: LifecycleDependencies<Tx>,
): CommandHandler<DeclareNoShowInput, DeclareNoShowResult, Tx> {
  return {
    command: 'declare_no_show',
    input: declareNoShowInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await adminTarget(deps, context);
      const period = await deps.store.period(tx, target.id);
      const booking = await lockTarget(
        deps,
        context,
        target,
        period.nights.map((night) => night.stayDate),
      );
      if (!DECLARABLE.includes(booking.state)) throw reject('ERR_STATE_TRANSITION');
      const now = nowMicros(context);
      if (!noShowWindowOpen(period.nights[0]!.checkinAt, period.checkoutAt, now))
        throw reject('ERR_STATE_TRANSITION');
      const authorization = await deps.store.liveAuthorization(tx, {
        bookingId: booking.id,
        purpose: 'no_show',
        exceptionId: null,
      });
      const unstarted = unstartedNights(period.nights, now).map((night) => night.stayDate);
      if (authorization === null || !withinScope(unstarted, authorization.scopeDates))
        throw reject('ERR_PERMISSION');

      const outcome = await closeOwnUseBooking(deps, context, {
        booking,
        period,
        exception: null,
        kind: 'no_show',
        toState: 'no_show',
        expected: null,
        basis: input.basis,
        authorizationId: authorization.id,
        reverse: ledgerReversal(deps),
      });
      context.emit(
        lifecycleEvent(OWN_USE_NO_SHOW_DECLARED, outcome.transition.id, {
          booking_id: booking.id,
          second_home_id: booking.secondHomeId,
          recipient_party_id: await recipientOf(deps, tx, booking),
          released_nights: outcome.released.length,
          first_released_date: outcome.released[0] ?? null,
          forfeited_nights: outcome.forfeited,
        }),
      );
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: {
          state: 'no_show',
          act: 'declare_no_show',
          transition_id: outcome.transition.id,
          authorization_id: authorization.id,
          basis: input.basis,
          nights: nightsAudit(outcome),
        },
      });
      return {
        booking_id: booking.id,
        state: 'no_show',
        declared_at: isoFromMicros(outcome.transition.recordedAt),
        released_dates: outcome.released,
        forfeited_nights: outcome.forfeited,
      };
    },
  };
}
