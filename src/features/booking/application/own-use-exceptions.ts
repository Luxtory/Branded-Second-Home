import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import {
  cancellationTerms,
  isoFromMicros,
  resolutionAllowed,
  timelyUntil,
  unstartedNights,
  type BookingState,
  type CancellationClass,
  type ExceptionType,
} from '../domain/own-use-lifecycle';
import { bookingTarget, incidentReference, referenceBasis } from './lifecycle-inputs';
import {
  adminTarget,
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
  withinScope,
} from './own-use-closing';
import {
  lifecycleEvent,
  nightsJson,
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
} from './own-use-lifecycle-events';
import type { LifecycleDependencies } from './own-use-lifecycle-ports';

/** Lista fechada da PD-010 (exceção operacional). */
const PD_010_REASONS = [
  'emergency_maintenance',
  'security',
  'casualty',
  'fortuitous_event',
  'force_majeure',
] as const;

export const openExceptionInput = z.discriminatedUnion('exception_type', [
  z.strictObject({
    ...bookingTarget,
    exception_type: z.literal('operational'),
    reason: z.enum(PD_010_REASONS),
    basis: referenceBasis,
  }),
  z.strictObject({
    ...bookingTarget,
    exception_type: z.literal('unauthorized_booking'),
    incident_ref: incidentReference,
    basis: referenceBasis,
  }),
]);
export type OpenExceptionInput = z.infer<typeof openExceptionInput>;

export type OpenExceptionResult = {
  readonly booking_id: string;
  readonly exception_id: string;
  readonly state: 'in_exception';
  readonly opened_at: string;
};

const OPENABLE: readonly BookingState[] = ['confirmed', 'in_use'];

/**
 * `open_exception` (PD-010, REQ-083, REQ-084; ADR-0027 §3; spec booking §10.5): Admin + base, sem efeito sobre saldo,
 * custódia ou ocupação. Exceção operacional (motivo da PD-010) ou apuração de reserva não autorizada (referência do
 * incidente). Só antes do check-out. Notifica a party; na exceção operacional do Co-Owner, com o prazo de 360 h.
 */
export function createOpenExceptionHandler<Tx>(
  deps: LifecycleDependencies<Tx>,
): CommandHandler<OpenExceptionInput, OpenExceptionResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'open_exception',
    input: openExceptionInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await adminTarget(deps, context);
      const booking = await lockTarget(deps, context, target, []);
      if (!OPENABLE.includes(booking.state)) throw reject('ERR_STATE_TRANSITION');
      const period = await deps.store.period(tx, booking.id);
      if (nowMicros(context) >= period.checkoutAt) throw reject('ERR_STATE_TRANSITION');

      const transition = await deps.store.insertTransition(tx, {
        id: newId(),
        booking,
        kind: 'exception_opening',
        toState: 'in_exception',
        operationId: context.operationId,
        expectedClass: null,
        expectedFirstAffectedDate: null,
        basis: input.basis,
      });
      const exceptionId = newId();
      const reason = input.exception_type === 'operational' ? input.reason : null;
      const incidentRef =
        input.exception_type === 'unauthorized_booking' ? input.incident_ref : null;
      await deps.store.insertException(tx, {
        id: exceptionId,
        bookingId: booking.id,
        type: input.exception_type,
        reason,
        incidentRef,
        openedByTransitionId: transition.id,
      });
      const timely =
        input.exception_type === 'operational' && modalityOf(booking) === 'co_owner'
          ? isoFromMicros(timelyUntil(period.nights[0]!.checkinAt))
          : null;
      context.emit(
        lifecycleEvent(OWN_USE_EXCEPTION_OPENED, transition.id, {
          booking_id: booking.id,
          second_home_id: booking.secondHomeId,
          recipient_party_id: await recipientOf(deps, tx, booking),
          exception_id: exceptionId,
          exception_type: input.exception_type,
          reason,
          timely_until: timely,
        }),
      );
      context.audit({
        objectType: 'booking',
        objectId: booking.id,
        before: { state: booking.state },
        after: {
          state: 'in_exception',
          act: 'open_exception',
          transition_id: transition.id,
          exception_id: exceptionId,
          exception_type: input.exception_type,
          reason,
          incident_ref: incidentRef,
          basis: input.basis,
        },
      });
      return {
        booking_id: booking.id,
        exception_id: exceptionId,
        state: 'in_exception',
        opened_at: isoFromMicros(transition.recordedAt),
      };
    },
  };
}

export const resolveExceptionInput = z.strictObject({
  ...bookingTarget,
  exception_id: z.uuid(),
  outcome: z.enum(['confirmed', 'completed', 'cancelled']),
  basis: referenceBasis,
});
export type ResolveExceptionInput = z.infer<typeof resolveExceptionInput>;

export type ResolveExceptionResult = {
  readonly booking_id: string;
  readonly exception_id: string;
  readonly state: 'confirmed' | 'completed' | 'cancelled';
  readonly resolved_at: string;
  readonly cancellation_class: CancellationClass | null;
  readonly released_dates: readonly string[];
};

/**
 * `resolve_exception` (PD-010, REQ-083, REQ-084; ADR-0027 §3; spec booking §10.5): resolução única da exceção aberta.
 * `confirmed` (antes do check-out) ou `completed` (a partir dele): só o estado. `cancelled`: na exceção operacional,
 * com a autorização `exception_cancellation` e a classe no instante (REQ-080); na apuração de reserva de Owner, é a
 * invalidação (autorização `invalidation`). Apuração de Co-Owner cancelada → recusada (usa `correct_use_right`).
 */
export function createResolveExceptionHandler<Tx>(
  deps: LifecycleDependencies<Tx>,
): CommandHandler<ResolveExceptionInput, ResolveExceptionResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'resolve_exception',
    input: resolveExceptionInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await adminTarget(deps, context);
      const period = await deps.store.period(tx, target.id);
      const cancels = input.outcome === 'cancelled';
      const booking = await lockTarget(
        deps,
        context,
        target,
        cancels ? period.nights.map((night) => night.stayDate) : [],
      );
      const exception = await openExceptionOf(deps, tx, booking);
      if (exception === null || exception.id !== input.exception_id)
        throw reject('ERR_STATE_TRANSITION');
      const now = nowMicros(context);
      const recipient = await recipientOf(deps, tx, booking);

      if (input.outcome !== 'cancelled') {
        if (!resolutionAllowed(input.outcome, period.checkoutAt, now))
          throw reject('ERR_STATE_TRANSITION');
        const transition = await deps.store.insertTransition(tx, {
          id: newId(),
          booking,
          kind: 'exception_resolution',
          toState: input.outcome,
          operationId: context.operationId,
          expectedClass: null,
          expectedFirstAffectedDate: null,
          basis: input.basis,
        });
        await deps.store.insertResolution(tx, {
          exceptionId: exception.id,
          bookingId: booking.id,
          transitionId: transition.id,
          outcome: input.outcome,
          source: 'admin',
        });
        context.emit(
          lifecycleEvent(OWN_USE_EXCEPTION_RESOLVED, transition.id, {
            booking_id: booking.id,
            second_home_id: booking.secondHomeId,
            recipient_party_id: recipient,
            exception_id: exception.id,
            exception_type: exception.type,
            outcome: input.outcome,
          }),
        );
        context.audit({
          objectType: 'booking',
          objectId: booking.id,
          before: { state: booking.state },
          after: {
            state: input.outcome,
            act: 'resolve_exception',
            transition_id: transition.id,
            exception_id: exception.id,
            basis: input.basis,
          },
        });
        return {
          booking_id: booking.id,
          exception_id: exception.id,
          state: input.outcome,
          resolved_at: isoFromMicros(transition.recordedAt),
          cancellation_class: null,
          released_dates: [],
        };
      }

      const modality = modalityOf(booking);
      const invalidation = cancelledAsInvalidation(exception.type, modality === 'owner');
      const terms = cancellationTerms(modality, period.nights, now);
      if (terms.firstAffectedDate === null) throw reject('ERR_STATE_TRANSITION');
      const authorization = await deps.store.liveAuthorization(tx, {
        bookingId: booking.id,
        purpose: invalidation ? 'invalidation' : 'exception_cancellation',
        exceptionId: exception.id,
      });
      const unstarted = unstartedNights(period.nights, now).map((night) => night.stayDate);
      if (
        authorization === null ||
        !withinScope(unstarted, authorization.scopeDates) ||
        (!invalidation && authorization.expectedClass !== terms.cancellationClass)
      )
        throw reject('ERR_PERMISSION');

      const outcome = await closeOwnUseBooking(deps, context, {
        booking,
        period,
        exception,
        kind: invalidation ? 'invalidation' : 'exception_resolution',
        toState: 'cancelled',
        expected: null,
        basis: input.basis,
        authorizationId: authorization.id,
        reverse: ledgerReversal(deps),
      });
      const common = {
        booking_id: booking.id,
        second_home_id: booking.secondHomeId,
        recipient_party_id: recipient,
        exception_id: exception.id,
        released_nights: outcome.released.length,
        first_released_date: outcome.released[0]!,
      };
      context.emit(
        invalidation
          ? lifecycleEvent(OWN_USE_BOOKING_INVALIDATED, outcome.transition.id, {
              ...common,
              corrected: null,
            })
          : lifecycleEvent(OWN_USE_BOOKING_CANCELLED, outcome.transition.id, {
              ...common,
              cause: 'exception',
              exception_type: exception.type,
              cancellation_class: outcome.transition.cancellationClass,
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
          act: invalidation ? 'resolve_exception:invalidation' : 'resolve_exception:cancellation',
          transition_id: outcome.transition.id,
          exception_id: exception.id,
          authorization_id: authorization.id,
          cancellation_class: outcome.transition.cancellationClass,
          basis: input.basis,
          nights: nightsAudit(outcome),
        },
      });
      return {
        booking_id: booking.id,
        exception_id: exception.id,
        state: 'cancelled',
        resolved_at: isoFromMicros(outcome.transition.recordedAt),
        cancellation_class: outcome.transition.cancellationClass,
        released_dates: outcome.released,
      };
    },
  };
}

/**
 * Cancelamento pela resolução: exceção operacional → cancelamento P-A; apuração de Owner → invalidação (REQ-084);
 * apuração de Co-Owner → recusada aqui, porque a invalidação dele corrige o consumo (`correct_use_right`).
 */
function cancelledAsInvalidation(type: ExceptionType, owner: boolean): boolean {
  if (type === 'operational') return false;
  if (!owner) throw reject('ERR_STATE_TRANSITION');
  return true;
}
