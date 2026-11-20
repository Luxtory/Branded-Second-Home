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
 * W14 E2 — prova de preservação: a W14 não altera nada da W12/W13 além do ramo da seleção. O `db:check` compara só
 * nomes de objetos; aqui se comparam as definições completas (funções, constraints, gatilhos, políticas, views e
 * privilégios do schema `app`).
 */
const W14 = [
  '20261119061707_inventory_luxtory_selection',
  '20261119061704_booking_guest_nomination',
  '20261119061701_admin_parameter',
];
const FIRST_W14 = [...W14].sort()[0]!;

/** Linhas inseridas por `after` sobre `before`: prefixo e sufixo comuns; o resto de `before` volta como `removed`. */
function lineDelta(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end])
    end += 1;
  return { removed: a.slice(start, a.length - end), added: b.slice(start, b.length - end) };
}

describe('W14 — preservação das funções e do catálogo da W12/W13 (E2)', () => {
  let w13: Awaited<ReturnType<typeof databaseBefore>>;
  let w13Snapshot: Snapshot;

  beforeAll(async () => {
    // Banco só com as migrations anteriores à W14 (estado da main 001ef0d); as waves seguintes (W15+) também ficam de
    // fora, senão o `up --strict` da W14 sairia de ordem.
    w13 = await databaseBefore(FIRST_W14);
    w13Snapshot = await snapshot(w13.database);
  });

  afterAll(async () => {
    await w13?.dispose();
  });

  it('[TECH-110][ADR-0030] desfazer a W14 restaura exatamente o catálogo da W13 (definições, não só nomes)', async () => {
    const subject = await createTestDatabase();
    try {
      expect((await snapshot(subject)).size).toBeGreaterThan(w13Snapshot.size);
      // A W14 e as posteriores, da mais nova para a mais antiga.
      for (const name of await migrationsFromNewest(FIRST_W14))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w13Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });

  it('[ADR-0030] a W14 só acrescenta o ramo da seleção às funções de custódia e o INV-4 às invariantes', async () => {
    const subject = await createTestDatabase({ migrated: false });
    try {
      await w13.migrateThenAll(subject.url);
      const after = await snapshot(subject);
      const changed = [...w13Snapshot.keys()].filter((key) => after.get(key) !== w13Snapshot.get(key));
      expect(changed.sort()).toEqual([
        'constraint app.capability_activation.capability_activation_capability_check',
        'function app.date_custody_close()',
        'function app.date_custody_open()',
        'function app.inventory_invariant_breaches()',
      ]);

      const open = lineDelta(w13Snapshot.get('function app.date_custody_open()')!, after.get('function app.date_custody_open()')!);
      expect(open.removed).toEqual([]);
      expect(open.added[0]).toBe("    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'luxtory' THEN");
      expect(open.added.join('\n')).toContain('app.assert_luxtory_selection_write(NEW.opened_by_operation');
      expect(open.added.join('\n')).toContain('app.assert_luxtory_capacity_available(NEW.second_home_id');

      const close = lineDelta(w13Snapshot.get('function app.date_custody_close()')!, after.get('function app.date_custody_close()')!);
      expect(close.removed).toEqual(["    IF OLD.holder_kind = 'spe_pool' THEN"]);
      expect(close.added[0]).toBe("    IF OLD.holder_kind = 'spe_pool'");
      expect(close.added.at(-1)).toBe("    ELSIF OLD.holder_kind = 'spe_pool' THEN");
      expect(close.added.join('\n')).toContain("= 'select_luxtory_capacity' THEN");

      const breaches = lineDelta(
        w13Snapshot.get('function app.inventory_invariant_breaches()')!,
        after.get('function app.inventory_invariant_breaches()')!,
      );
      expect(breaches.removed).toEqual([]);
      expect(breaches.added[0]).toBe('  UNION ALL');
      expect(breaches.added.join('\n')).toContain("SELECT 'INV-4'");

      const check = after.get('constraint app.capability_activation.capability_activation_capability_check')!;
      expect(check).toContain("'luxtory_selection'");
      expect(check.replace(", 'luxtory_selection'::text", '')).toBe(
        w13Snapshot.get('constraint app.capability_activation.capability_activation_capability_check'),
      );
    } finally {
      await subject.drop();
    }
  });
});
