// Superfície pública do módulo inventory (TECH-011, W10): custódia por noite e Inventário Central (ADR-004 do 03).
// Na W10 só a custódia raiz é aberta, pela selagem do calendar na mesma transação (spec inventory). W12: a transição
// `spe_pool → reserved_right` e a ocupação `own_use` da reserva de uso próprio, na transação do command do booking.
import type { DatabaseTransaction } from '@/features/platform';
import { openRootCustodies, type OpenRootCustodiesInput } from './application/open-root-custodies';
import type { OwnUseInventory } from './application/own-use';
import type { RootHolder } from './domain/root-custody';
import { createPostgresOwnUseInventory } from './infrastructure/postgres-own-use-inventory';
import { createPostgresRootCustodyStore } from './infrastructure/postgres-root-custody-store';

export type { AcquisitionModality, RootHolder } from './domain/root-custody';
export type { OpenRootCustodiesInput } from './application/open-root-custodies';
export type {
  NightCustodyState,
  OwnUseInventory,
  OwnUseOccupancy,
  ReservedRightTransition,
} from './application/own-use';

export type RootCustodyOpener = (
  tx: DatabaseTransaction,
  input: OpenRootCustodiesInput,
) => Promise<RootHolder>;

export function createRootCustodyOpener(): RootCustodyOpener {
  const store = createPostgresRootCustodyStore();
  return (tx, input) => openRootCustodies(store, tx, input);
}

export function createOwnUseInventory(): OwnUseInventory<DatabaseTransaction> {
  return createPostgresOwnUseInventory();
}
