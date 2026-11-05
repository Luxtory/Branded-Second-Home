import type { RecoverFutureCapacityInput, RecoveryBookingPort } from '@/features/inventory';
import type { CommandContext } from '@/features/platform';
import {
  adminTarget,
  assertLifecycleOpen,
  lockTarget,
  modalityOf,
  nowMicros,
  reject,
} from './own-use-closing';
import type { LifecycleDependencies } from './own-use-lifecycle-ports';

/**
 * A parte da reserva do `recover_future_capacity` (BR-283, BR-284; ADR-0027 §3–§4; spec booking §10.5, §10.11.1):
 * K2 → autoridade → Ação → noites das custódias (crescente) → reserva → uso da autorização `recovery`. Só as custódias
 * gravadas na autorização, ainda ativas e futuras no instante do uso; nenhuma → `ERR_CAPACITY_UNAVAILABLE`.
 */
export function createRecoveryPreparation<Tx>(
  deps: LifecycleDependencies<Tx>,
): RecoveryBookingPort<Tx> {
  return {
    async prepare(context: CommandContext<RecoverFutureCapacityInput, Tx>) {
      const { tx } = context;
      await assertLifecycleOpen(deps, tx);
      const target = await adminTarget(deps, context);
      if (modalityOf(target) === 'owner' || !['no_show', 'cancelled'].includes(target.state))
        throw reject('ERR_STATE_TRANSITION');
      const authorization = await deps.store.liveAuthorization(tx, {
        bookingId: target.id,
        purpose: 'recovery',
        exceptionId: null,
      });
      if (authorization === null) throw reject('ERR_PERMISSION');
      const scoped = await deps.store.recoverableNights(tx, authorization.scopeCustodyIds);
      const booking = await lockTarget(
        deps,
        context,
        target,
        scoped.map((night) => night.stayDate),
      );
      const now = nowMicros(context);
      const nights = await deps.store.recoverableNights(tx, authorization.scopeCustodyIds);
      if (!nights.some((night) => now < night.checkinAt)) throw reject('ERR_CAPACITY_UNAVAILABLE');
      const usedAt = await deps.store.useAuthorization(tx, {
        authorizationId: authorization.id,
        bookingId: booking.id,
        operationId: context.operationId,
      });
      // O banco move exatamente as autorizadas ainda futuras no instante do uso (constraint no COMMIT).
      const future = nights.filter((night) => usedAt < night.checkinAt);
      if (future.length === 0) throw reject('ERR_CAPACITY_UNAVAILABLE');
      return {
        bookingId: booking.id,
        secondHomeId: booking.secondHomeId,
        authorizationId: authorization.id,
        custodies: future.map((night) => ({
          custodyId: night.custodyId,
          stayDate: night.stayDate,
        })),
      };
    },
  };
}
