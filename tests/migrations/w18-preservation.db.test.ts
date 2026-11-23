import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseBefore,
  differences,
  migrationDown,
  migrationsFromNewest,
  snapshot,
  type Snapshot,
} from '../support/catalog-snapshot';
import { createTestDatabase } from '../support/test-database';

/**
 * W18 E1 — prova de preservação (ADR-0034): a migration da W18 só acrescenta `app.commercial_policy`, suas funções e
 * políticas de RLS, e não muda nenhuma definição anterior — PRL, parâmetros, snapshot, Créditos, Membership, reserva e
 * custódia (W13–W17) ficam intactos. Desfazer a W18 restaura exatamente o catálogo da W17.
 */
const FIRST_W18 = '20261122180001_pricing_commercial_policy';

/** Objetos que a W18 acrescenta, e só eles. */
const W18_OBJECTS = [
  /^(acl|constraint|trigger|table|index) app\.commercial_policy\b/,
  /^acl app\.(conflict_)?commercial_policy_[a-z_]+$/,
  /^policy commercial_policy\./,
  /^function(-acl)? app\.commercial_policy_[a-z_]+\(/,
];

describe('W18 — preservação do catálogo (E1)', () => {
  let w17: Awaited<ReturnType<typeof databaseBefore>>;
  let w17Snapshot: Snapshot;

  beforeAll(async () => {
    w17 = await databaseBefore(FIRST_W18);
    w17Snapshot = await snapshot(w17.database);
  });

  afterAll(async () => {
    await w17?.dispose();
  });

  it('[TECH-110][ADR-0034] a W18 só acrescenta os objetos das políticas comerciais e não muda nada anterior', async () => {
    const subject = await createTestDatabase();
    try {
      const changed = differences(w17Snapshot, await snapshot(subject));
      expect(changed.filter((key) => w17Snapshot.has(key))).toEqual([]);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.filter((key) => !W18_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });

  it('[TECH-110] desfazer a W18 restaura exatamente o catálogo da W17', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W18))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w17Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
