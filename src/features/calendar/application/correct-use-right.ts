import { z } from 'zod';
import {
  isNonPersonalReference,
  type CommandContext,
  type CommandHandler,
} from '@/features/platform';
import type { UseRightBucket } from '../domain/use-right';

/**
 * `correct_use_right` (TECH-026, TECH-110; REQ-084; ADR-0027 §3, §8; spec booking §10.5): a invalidação de reserva de
 * Co-Owner não autorizada — numa operação, com a autorização independente `invalidation` — cancela a reserva, libera e
 * devolve à `spe_pool` as noites não iniciadas e **corrige o consumo** de cada uma: `correction` que reverte o `consume`
 * da criação, com a mesma quantidade (`consumed − quantity`). Nunca sobre concessão ou expiração (a de expiração
 * continua fechada no banco). Definido no `calendar` (módulo do registro fechado, dono do Direito de Uso); a parte da
 * reserva vem do booking pela porta `CoOwnerInvalidationPort`.
 */
export const correctUseRightInput = z.strictObject({
  second_home_id: z.uuid(),
  booking_id: z.uuid(),
  exception_id: z.uuid(),
  // Base registrada: referência não pessoal a registro verificável (spec booking §10.12, D11).
  basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
});
export type CorrectUseRightInput = z.infer<typeof correctUseRightInput>;

/** Reversão do `consume` gravado pela operação de criação da reserva, na noite (TECH-026, TECH-110). */
export interface CreationConsumptionReversal {
  readonly bookingOperationId: string;
  readonly stayDate: string;
  readonly movement: 'restore' | 'correction';
  readonly operationId: string;
}

export interface UseRightReversal<Tx> {
  /** Grava a reversão e devolve o bucket da noite; `null` se a criação não consumiu a noite. */
  reverseCreationConsumption(
    tx: Tx,
    reversal: CreationConsumptionReversal,
  ): Promise<UseRightBucket | null>;
}

export type NightCorrection<Tx> = (
  tx: Tx,
  night: {
    readonly bookingOperationId: string;
    readonly stayDate: string;
    readonly operationId: string;
  },
) => Promise<UseRightBucket>;

export type CorrectUseRightResult = {
  readonly booking_id: string;
  readonly exception_id: string;
  readonly state: 'cancelled';
  readonly invalidated_at: string;
  readonly released_dates: readonly string[];
  readonly corrected: { readonly alta: number; readonly media: number; readonly leap: number };
};

export interface CoOwnerInvalidationPort<Tx> {
  invalidate(
    context: CommandContext<CorrectUseRightInput, Tx>,
    correct: NightCorrection<Tx>,
  ): Promise<CorrectUseRightResult>;
}

/** A criação não consumiu a noite que a invalidação precisa corrigir: bug ou dado inconsistente, nunca recusa. */
export class UseRightCorrectionTargetError extends Error {
  constructor(stayDate: string) {
    super(`No creation consumption to correct on ${stayDate}`);
    this.name = 'UseRightCorrectionTargetError';
  }
}

export function createCorrectUseRightHandler<Tx>(deps: {
  readonly invalidation: CoOwnerInvalidationPort<Tx>;
  readonly reversal: UseRightReversal<Tx>;
}): CommandHandler<CorrectUseRightInput, CorrectUseRightResult, Tx> {
  return {
    command: 'correct_use_right',
    input: correctUseRightInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    execute: (context) =>
      deps.invalidation.invalidate(context, async (tx, night) => {
        const bucket = await deps.reversal.reverseCreationConsumption(tx, {
          ...night,
          movement: 'correction',
        });
        if (bucket === null) throw new UseRightCorrectionTargetError(night.stayDate);
        return bucket;
      }),
  };
}
