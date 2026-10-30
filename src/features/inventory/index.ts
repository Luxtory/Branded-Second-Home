// Superfície pública do módulo inventory (TECH-011, W10): custódia por noite e Inventário Central (ADR-004 do 03).
// Na W10 só a custódia raiz é aberta, pela selagem do calendar na mesma transação (spec inventory).
import type { DatabaseTransaction } from '@/features/platform';
import { openRootCustodies, type OpenRootCustodiesInput } from './application/open-root-custodies';
import type { RootHolder } from './domain/root-custody';
import { createPostgresRootCustodyStore } from './infrastructure/postgres-root-custody-store';

export type { AcquisitionModality, RootHolder } from './domain/root-custody';
export type { OpenRootCustodiesInput } from './application/open-root-custodies';

export type RootCustodyOpener = (
  tx: DatabaseTransaction,
  input: OpenRootCustodiesInput,
) => Promise<RootHolder>;

export function createRootCustodyOpener(): RootCustodyOpener {
  const store = createPostgresRootCustodyStore();
  return (tx, input) => openRootCustodies(store, tx, input);
}
