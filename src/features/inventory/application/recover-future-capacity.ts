import { z } from 'zod';
import {
  isNonPersonalReference,
  type CommandContext,
  type CommandHandler,
} from '@/features/platform';
import { OwnUseLifecycleWriteError } from './own-use-lifecycle';

/**
 * `recover_future_capacity` (BR-283, BR-284; TECH-022, TECH-051; ADR-0027 §3–§4; spec booking §10.5): a capacidade
 * futura perdida (`use_right/forfeited_right`) de um cancelamento tardio ou no-show vai ao Inventário Luxtory
 * (`luxtory/inventory/recovered_future_capacity`), só com a autorização independente `recovery` da mesma operação. Sem
 * `restore`, Crédito, remuneração ou notificação (BR-284). Definido no `inventory` (módulo do registro fechado); a parte
 * da reserva — K2, autoridade, travas e uso da autorização — vem do booking pela porta `RecoveryBookingPort`.
 */
export const recoverFutureCapacityInput = z.strictObject({
  second_home_id: z.uuid(),
  booking_id: z.uuid(),
  // Base registrada: referência não pessoal a registro verificável (spec booking §10.12, D11).
  basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
});
export type RecoverFutureCapacityInput = z.infer<typeof recoverFutureCapacityInput>;

export interface RecoverableCustody {
  readonly custodyId: string;
  readonly stayDate: string;
}

/** Preparação feita pelo booking: depois dela, a autorização já foi usada na operação e as custódias estão travadas. */
export interface RecoveryPreparation {
  readonly bookingId: string;
  readonly secondHomeId: string;
  readonly authorizationId: string;
  /** Custódias da autorização ainda ativas e futuras no instante do uso, em ordem crescente de noite. */
  readonly custodies: readonly RecoverableCustody[];
}

export interface RecoveryBookingPort<Tx> {
  prepare(context: CommandContext<RecoverFutureCapacityInput, Tx>): Promise<RecoveryPreparation>;
}

export interface ForfeitedCapacityRecovery<Tx> {
  /** Fecha a `forfeited_right` e abre a capacidade recuperada com `authorization_ref`; `false` se não estava ativa. */
  recover(
    tx: Tx,
    move: {
      readonly custodyId: string;
      readonly authorizationId: string;
      readonly operationId: string;
    },
  ): Promise<boolean>;
}

export type RecoverFutureCapacityResult = {
  readonly booking_id: string;
  readonly recovered_dates: readonly string[];
};

export function createRecoverFutureCapacityHandler<Tx>(deps: {
  readonly booking: RecoveryBookingPort<Tx>;
  readonly custody: ForfeitedCapacityRecovery<Tx>;
}): CommandHandler<RecoverFutureCapacityInput, RecoverFutureCapacityResult, Tx> {
  return {
    command: 'recover_future_capacity',
    input: recoverFutureCapacityInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const prepared = await deps.booking.prepare(context);
      // TECH-053 classe 6: custódias em ordem crescente de noite.
      for (const custody of prepared.custodies) {
        const moved = await deps.custody.recover(context.tx, {
          custodyId: custody.custodyId,
          authorizationId: prepared.authorizationId,
          operationId: context.operationId,
        });
        if (!moved) throw new OwnUseLifecycleWriteError(`forfeited custody ${custody.custodyId}`);
      }
      const recoveredDates = prepared.custodies.map((custody) => custody.stayDate);
      context.audit({
        objectType: 'booking',
        objectId: prepared.bookingId,
        before: null,
        after: {
          act: 'recover_future_capacity',
          authorization_id: prepared.authorizationId,
          basis: context.input.basis,
          recovered: prepared.custodies.map((custody) => ({
            custody_id: custody.custodyId,
            stay_date: custody.stayDate,
          })),
        },
      });
      return { booking_id: prepared.bookingId, recovered_dates: recoveredDates };
    },
  };
}
