import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbmate, MIGRATIONS_DIR } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat } from '../../scripts/lib/pg.mjs';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

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

const SNAPSHOT_SQL = `
  SELECT 'function ' || p.oid::regprocedure::text AS name, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.prokind = 'f'
  UNION ALL
  SELECT 'function-acl ' || p.oid::regprocedure::text, coalesce(p.proacl::text, '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'
  UNION ALL
  SELECT 'constraint ' || c.conrelid::regclass::text || '.' || c.conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'app'
  UNION ALL
  SELECT 'trigger ' || t.tgrelid::regclass::text || '.' || t.tgname, pg_get_triggerdef(t.oid)
    FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'app' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'policy ' || tablename || '.' || policyname,
         concat_ws(' | ', cmd, roles::text, coalesce(qual, ''), coalesce(with_check, ''))
    FROM pg_policies WHERE schemaname = 'app'
  UNION ALL
  SELECT 'view ' || c.oid::regclass::text, pg_get_viewdef(c.oid)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relkind = 'v'
  UNION ALL
  SELECT 'acl ' || c.oid::regclass::text,
         coalesce(c.relacl::text, '') || ' ' ||
         coalesce((SELECT string_agg(a.attname || '=' || a.attacl::text, ',' ORDER BY a.attnum)
                     FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL), '')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app'
  ORDER BY 1`;

type Snapshot = ReadonlyMap<string, string>;

async function snapshot(database: TestDatabase): Promise<Snapshot> {
  const { rows } = await database.pool.query<{ name: string; def: string }>(SNAPSHOT_SQL);
  return new Map(rows.map((row) => [row.name, row.def]));
}

const down = async (name: string) =>
  (await readFile(join(MIGRATIONS_DIR, `${name}.sql`), 'utf8')).split('-- migrate:down')[1]!;

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
  let w13: TestDatabase;
  let w13Snapshot: Snapshot;
  let partialDir: string;

  beforeAll(async () => {
    // Banco só com as migrations anteriores à W14 (estado da main 001ef0d), pelo mesmo dbmate do repositório.
    partialDir = await mkdtemp(join(tmpdir(), 'w14-preservation-'));
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files.filter((name) => !W14.some((w) => name.startsWith(w))))
      await copyFile(join(MIGRATIONS_DIR, file), join(partialDir, file));
    w13 = await createTestDatabase({ migrated: false });
    await applySupabaseCompat(w13.url);
    await dbmate(['up', '--strict'], { url: w13.url, migrationsDir: partialDir });
    w13Snapshot = await snapshot(w13);
  });

  afterAll(async () => {
    await w13?.drop();
    if (partialDir !== undefined) await rm(partialDir, { recursive: true, force: true });
  });

  it('[TECH-110][ADR-0030] desfazer a W14 restaura exatamente o catálogo da W13 (definições, não só nomes)', async () => {
    const subject = await createTestDatabase();
    try {
      expect((await snapshot(subject)).size).toBeGreaterThan(w13Snapshot.size);
      for (const name of W14) await subject.pool.query(await down(name));
      const restored = await snapshot(subject);
      const differences = [...new Set([...w13Snapshot.keys(), ...restored.keys()])].filter(
        (key) => w13Snapshot.get(key) !== restored.get(key),
      );
      expect(differences).toEqual([]);
    } finally {
      await subject.drop();
    }
  });

  it('[ADR-0030] a W14 só acrescenta o ramo da seleção às funções de custódia e o INV-4 às invariantes', async () => {
    const subject = await createTestDatabase({ migrated: false });
    try {
      await applySupabaseCompat(subject.url);
      await dbmate(['up', '--strict'], { url: subject.url, migrationsDir: partialDir });
      await dbmate(['up', '--strict'], { url: subject.url, migrationsDir: MIGRATIONS_DIR });
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
