import type { ExercisedAdminSession } from '@/features/admin';
import { readHomeEditionLabels, type HomeEditionLabel } from '@/features/catalog';
import { getDatabase, recordAdminRead, systemClock, type Database } from '@/features/platform';
import { groupInterests, type HomeEditionGroup } from '../application/interest-overview';
import { postgresInterestReader } from '../infrastructure/postgres-interest-reader';

/**
 * Leitura do Admin (ADR-0010 §7): como `luxtory_app`, depois do portão com o papel exercido, na mesma transação que
 * grava o `admin_read` (TECH-092; objeto `interest`, `*`). Os rótulos das Home Editions vêm da consulta do catálogo.
 */
export function readInterestOverview(
  session: ExercisedAdminSession,
  db: Database = getDatabase(),
): Promise<readonly HomeEditionGroup<HomeEditionLabel>[]> {
  return db.transaction().execute(async (tx) => {
    await recordAdminRead(tx, {
      actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
      objectType: 'interest',
      objectId: '*',
      authorizationRef: session.authorizationRef,
      at: systemClock.now(),
    });
    const counts = await postgresInterestReader.counts(tx);
    const labels = await readHomeEditionLabels(tx, [
      ...new Set(counts.map((row) => row.homeEditionId)),
    ]);
    return groupInterests(counts, labels);
  });
}
