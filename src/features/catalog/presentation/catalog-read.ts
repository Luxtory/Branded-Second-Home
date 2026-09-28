import type { ExercisedAdminSession } from '@/features/admin';
import {
  getDatabase,
  recordAdminRead,
  systemClock,
  type DatabaseTransaction,
} from '@/features/platform';

/** Objeto lido; `id: '*'` = a coleção inteira (lista). */
export interface ReadObject {
  readonly type: string;
  readonly id: string;
}

/**
 * Leitura do Admin sobre o catálogo (ADR-0010 §7): como `luxtory_app`, depois do portão de acesso com o papel
 * exercido, e na mesma transação que grava o `admin_read` (TECH-092).
 */
export function readCatalog<T>(
  session: ExercisedAdminSession,
  object: ReadObject,
  read: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDatabase()
    .transaction()
    .execute(async (tx) => {
      await recordAdminRead(tx, {
        actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
        objectType: object.type,
        objectId: object.id,
        authorizationRef: session.authorizationRef,
        at: systemClock.now(),
      });
      return read(tx);
    });
}
