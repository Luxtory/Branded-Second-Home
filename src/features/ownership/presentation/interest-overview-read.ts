import type { ExercisedAdminSession } from '@/features/admin';
import { readConceptLabels, type ConceptLabel } from '@/features/catalog';
import { getDatabase, recordAdminRead, systemClock, type Database } from '@/features/platform';
import { groupInterests, type ConceptGroup } from '../application/interest-overview';
import { postgresInterestReader } from '../infrastructure/postgres-interest-reader';

/**
 * Leitura do Admin (ADR-0010 §7): como `luxtory_app`, depois do portão com o papel exercido, na mesma transação que
 * grava o `admin_read` (TECH-092; objeto `interest`, `*`). Os rótulos dos Concepts vêm da consulta do catálogo.
 */
export function readInterestOverview(
  session: ExercisedAdminSession,
  db: Database = getDatabase(),
): Promise<readonly ConceptGroup<ConceptLabel>[]> {
  return db.transaction().execute(async (tx) => {
    await recordAdminRead(tx, {
      actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
      objectType: 'interest',
      objectId: '*',
      authorizationRef: session.authorizationRef,
      at: systemClock.now(),
    });
    const counts = await postgresInterestReader.counts(tx);
    const labels = await readConceptLabels(tx, [...new Set(counts.map((row) => row.conceptId))]);
    return groupInterests(counts, labels);
  });
}
