import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import { isCreditQuantity } from '../domain/credit';
import { reverseConsumption, type LedgerDependencies } from './credit-ledger';

export const reverseCreditInput = z.strictObject({
  consumption_entry_id: z.uuid(),
  quantity: z.string().refine(isCreditQuantity, 'positive canonical decimal'),
  /** Base registrada (TECH-051): orientação na tela, sem dado pessoal. */
  basis: z.string().trim().min(1).max(2000),
});
export type ReverseCreditInput = z.infer<typeof reverseCreditInput>;

export type ReverseCreditResult = {
  readonly lot_id: string;
  readonly entry_id: string;
  readonly quantity: string;
  readonly to: 'available' | 'expired';
};

/**
 * `reverse_credit` (TECH-051: Admin + base registrada; TECH-070): reversão compensatória de um consumo — volta a
 * `available` antes do vencimento do lote e a `expired` depois, sem criar quantidade, mudar a party ou transferir. O
 * banco revalida a atribuição Admin, o par e o saldo do consumo. Sem tela nem rota na W17 (ADR-0033, D6).
 */
export function createReverseCreditHandler<Tx>(
  deps: LedgerDependencies<Tx>,
): CommandHandler<ReverseCreditInput, ReverseCreditResult, Tx> {
  return {
    command: 'reverse_credit',
    input: reverseCreditInput,
    async execute({ input, tx, locks, operationId, audit }) {
      const movement = await reverseConsumption({ tx, locks, operationId }, deps, {
        entryId: input.consumption_entry_id,
        quantity: input.quantity,
        basis: input.basis,
      });
      audit({
        objectType: 'credit_lot',
        objectId: movement.lotId,
        before: null,
        after: {
          movement: 'reverse',
          consumption_entry_id: input.consumption_entry_id,
          entry_id: movement.entryId,
          quantity: movement.quantity,
          to: movement.to,
        },
      });
      return {
        lot_id: movement.lotId,
        entry_id: movement.entryId,
        quantity: movement.quantity,
        to: movement.to,
      };
    },
  };
}
