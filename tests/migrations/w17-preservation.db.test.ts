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
 * W17 E1 — prova de preservação (ADR-0033): as migrations da W17 só acrescentam o snapshot econômico, os Créditos e a
 * função de invariantes, e mudam exatamente uma definição anterior — o CHECK de `app.capability_activation`, ampliado
 * com a K4 `credits` sem linha. Nada do PRL, dos parâmetros, do Membership, da reserva ou da custódia muda.
 */
const FIRST_W17 = '20261122120001_pricing_economic_snapshot';

const CHANGED = ['constraint app.capability_activation.capability_activation_capability_check'];

/** Objetos que a W17 acrescenta, e só eles. */
const W17_OBJECTS = [
  /^(acl|constraint|trigger) app\.(economic_snapshot|credit_lot|credit_entry)/,
  /^policy (economic_snapshot|economic_snapshot_parameter|credit_lot|credit_entry)\./,
  /^function(-acl)? app\.(economic_snapshot_(parameter_)?write|credit_[a-z_]+|assert_credits_active|assert_credit_membership)\(/,
];

describe('W17 — preservação do catálogo (E1)', () => {
  let w16: Awaited<ReturnType<typeof databaseBefore>>;
  let w16Snapshot: Snapshot;

  beforeAll(async () => {
    w16 = await databaseBefore(FIRST_W17);
    w16Snapshot = await snapshot(w16.database);
  });

  afterAll(async () => {
    await w16?.dispose();
  });

  it('[TECH-110][ADR-0033] a W17 só acrescenta os objetos dos Créditos e amplia o CHECK da K4', async () => {
    const subject = await createTestDatabase();
    try {
      const after = await snapshot(subject);
      const changed = differences(w16Snapshot, after);
      expect(changed.filter((key) => w16Snapshot.has(key)).sort()).toEqual(CHANGED);
      const added = changed.filter((key) => !w16Snapshot.has(key));
      expect(added.length).toBeGreaterThan(0);
      expect(added.filter((key) => !W17_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
      const check = after.get(CHANGED[0]!)!;
      expect(check.replace(", 'credits'::text", '')).toBe(w16Snapshot.get(CHANGED[0]!));
    } finally {
      await subject.drop();
    }
  });

  it('[TECH-110] desfazer a W17 restaura exatamente o catálogo da W16', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W17))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w16Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
