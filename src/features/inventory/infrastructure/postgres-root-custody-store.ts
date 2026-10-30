import type { DatabaseTransaction } from '@/features/platform';
import type { RootCustodyStore } from '../application/open-root-custodies';

/** Custódias raiz por SQL direto do servidor (ADR-002 do 03); o papel da aplicação só tem INSERT na W10. */
export function createPostgresRootCustodyStore(): RootCustodyStore<DatabaseTransaction> {
  return {
    async insert(tx, custodies) {
      if (custodies.length === 0) return;
      await tx
        .insertInto('app.date_custody')
        .values(
          custodies.map((custody) => ({
            id: custody.id,
            second_home_id: custody.secondHomeId,
            stay_date: custody.stayDate,
            holder_kind: custody.holderKind,
            opened_by_operation: custody.operationId,
          })),
        )
        .execute();
    },
  };
}
