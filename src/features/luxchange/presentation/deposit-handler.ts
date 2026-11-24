import { createOwnUseCessionPort } from '@/features/booking';
import { createPostgresCreditStore } from '@/features/credits';
import { createLuxchangeCessionInventory } from '@/features/inventory';
import type { CommandHandler, DatabaseTransaction } from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  postgresEconomicSnapshotRecorder,
} from '@/features/pricing';
import {
  createDepositCapacityHandler,
  type DepositCapacityInput,
  type DepositCapacityResult,
} from '../application/deposit-capacity';
import { createPostgresDepositStore } from '../infrastructure/postgres-deposit-store';

/** `deposit_capacity` com as dependências de produção (superfícies públicas de booking, credits, inventory e pricing). */
export function createDepositHandler(): CommandHandler<
  DepositCapacityInput,
  DepositCapacityResult,
  DatabaseTransaction
> {
  return createDepositCapacityHandler<DatabaseTransaction>({
    store: createPostgresDepositStore(),
    bookings: createOwnUseCessionPort(),
    inventory: createLuxchangeCessionInventory(),
    terms: createPostgresEconomicTermsStore(),
    credits: createPostgresCreditStore(),
    snapshots: postgresEconomicSnapshotRecorder,
  });
}
