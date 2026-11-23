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
 * W19 E1 — prova de preservação (ADR-0035): a migration da W19 só acrescenta pagamentos, Fee, estornos, settlement,
 * inbox de webhooks e a função de invariantes, e muda exatamente uma definição anterior — o CHECK de
 * `app.capability_activation`, ampliado com a K5 `payments` sem linha. Nada das W13–W18 muda.
 */
const FIRST_W19 = '20261123032330_billing_payments';
const LAST_W19 = FIRST_W19;

const CHANGED = ['constraint app.capability_activation.capability_activation_capability_check'];

const W19_TABLES = 'payment|fee_charge|fee_charge_reversal|refund|settlement|webhook_inbox';
const W19_OBJECTS = [
  new RegExp(`^(acl|constraint|trigger|table|index) app\\.(${W19_TABLES})\\b`),
  new RegExp(`^policy (${W19_TABLES})\\.`),
  // Índices e constraints de unicidade das tabelas novas (acl por nome de relação).
  /^acl app\.(billing_payment_|payment_|refund_|settlement_|webhook_inbox_|fee_charge_|conflict_fee_charge_)[a-z_]+$/,
  /^function(-acl)? app\.(payment_open|payment_advance|fee_charge_write|fee_charge_reversal_write|refund_open|refund_advance|settlement_write|webhook_inbox_write|assert_payments_active|billing_invariant_breaches)\(/,
];

describe('W19 — preservação do catálogo (E1)', () => {
  let w18: Awaited<ReturnType<typeof databaseBefore>>;
  let w18Snapshot: Snapshot;

  beforeAll(async () => {
    w18 = await databaseBefore(FIRST_W19);
    w18Snapshot = await snapshot(w18.database);
  });

  afterAll(async () => {
    await w18?.dispose();
  });

  it('[TECH-110][ADR-0035] a W19 só acrescenta os objetos do billing e amplia o CHECK da K5', async () => {
    // Banco só até a W19: as waves seguintes (W20+) têm a própria prova de preservação.
    const newer = (await migrationsFromNewest(FIRST_W19)).filter((name) => name > LAST_W19);
    const upToW19 = newer.length > 0 ? await databaseBefore(newer.at(-1)!) : null;
    const subject = upToW19?.database ?? (await createTestDatabase());
    try {
      const after = await snapshot(subject);
      const changed = differences(w18Snapshot, after);
      expect(changed.filter((key) => w18Snapshot.has(key)).sort()).toEqual(CHANGED);
      const added = changed.filter((key) => !w18Snapshot.has(key));
      expect(added.length).toBeGreaterThan(0);
      expect(added.filter((key) => !W19_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
      const check = after.get(CHANGED[0]!)!;
      expect(check.replace(", 'payments'::text", '')).toBe(w18Snapshot.get(CHANGED[0]!));
    } finally {
      await (upToW19 ? upToW19.dispose() : subject.drop());
    }
  });

  it('[TECH-110] desfazer a W19 restaura exatamente o catálogo da W18', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W19))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w18Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
