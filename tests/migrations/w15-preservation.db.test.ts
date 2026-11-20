import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseBefore,
  differences,
  migrationDown,
  snapshot,
  type Snapshot,
} from '../support/catalog-snapshot';
import { createTestDatabase } from '../support/test-database';

/**
 * W15 E2 — prova de preservação: a migration do Membership só acrescenta objetos. Nenhuma definição existente do schema
 * `app` (função, constraint, gatilho, política, view ou privilégio) muda — em particular, nada do uso próprio, da
 * indicação de convidados, da custódia, do Direito de Uso ou das holdings passa a depender de Membership.
 */
const W15 = '20261119234739_identity_membership';

/** Objetos que a W15 acrescenta, e só eles. */
const W15_OBJECTS = [
  /^acl app\.membership(_transition)?(_pkey|_membership_idx)?$/,
  /^acl app\.conflict_membership_party$/,
  /^constraint app\.membership(_transition)?\./,
  /^trigger app\.membership(_transition)?\./,
  /^policy membership(_transition)?\./,
  /^function(-acl)? app\.membership_(write|record_transition)\(\)$/,
];

describe('W15 — preservação do catálogo (E2)', () => {
  let w14: Awaited<ReturnType<typeof databaseBefore>>;
  let w14Snapshot: Snapshot;

  beforeAll(async () => {
    w14 = await databaseBefore(W15);
    w14Snapshot = await snapshot(w14.database);
  });

  afterAll(async () => {
    await w14?.dispose();
  });

  it('[TECH-110][REQ-050] a W15 só acrescenta os objetos do Membership; nenhuma definição anterior muda', async () => {
    const subject = await createTestDatabase();
    try {
      const after = await snapshot(subject);
      const changed = differences(w14Snapshot, after);
      expect(changed.filter((key) => w14Snapshot.has(key))).toEqual([]);
      const added = changed.filter((key) => !w14Snapshot.has(key));
      expect(added.length).toBeGreaterThan(0);
      expect(added.filter((key) => !W15_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });

  it('[TECH-110] desfazer a W15 restaura exatamente o catálogo da W14', async () => {
    const subject = await createTestDatabase();
    try {
      await subject.pool.query(await migrationDown(W15));
      expect(differences(w14Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
