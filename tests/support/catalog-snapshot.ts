import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { inject } from 'vitest';
import { dbmate, MIGRATIONS_DIR } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat } from '../../scripts/lib/pg.mjs';
import { createTestDatabase, type TestDatabase } from './test-database';

/**
 * Prova de preservação do catálogo (W14 E2, reusada na W15): o `db:check` compara só nomes de objetos; aqui se comparam
 * as definições completas do schema `app` — funções, constraints, gatilhos, políticas, views e privilégios.
 */
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

export type Snapshot = ReadonlyMap<string, string>;

export async function snapshot(database: TestDatabase): Promise<Snapshot> {
  const { rows } = await database.pool.query<{ name: string; def: string }>(SNAPSHOT_SQL);
  return new Map(rows.map((row) => [row.name, row.def]));
}

/** Chaves cuja definição difere entre os dois snapshots (presentes em um só também contam). */
export function differences(before: Snapshot, after: Snapshot): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (key) => before.get(key) !== after.get(key),
  );
}

export const migrationDown = async (name: string) =>
  (await readFile(join(MIGRATIONS_DIR, `${name}.sql`), 'utf8')).split('-- migrate:down')[1]!;

/** Migrations a partir de `first` (inclusive), da mais nova para a mais antiga — a ordem de desfazer. */
export async function migrationsFromNewest(first: string): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql') && file >= first)
    .sort()
    .reverse()
    .map((file) => file.replace(/\.sql$/, ''));
}

/** Chave da trava consultiva que serializa migrações do zero entre arquivos de teste (DDL de papéis do cluster). */
const FROM_SCRATCH_LOCK = 15_000_064;

/**
 * Migrar um banco vazio roda DDL de papéis, que são do cluster: dois arquivos fazendo isso ao mesmo tempo colidem
 * (`tuple concurrently updated`). A trava consultiva no banco de administração os põe em fila.
 */
async function migrateFromScratch(url: string, migrationsDirs: readonly string[]): Promise<void> {
  const admin = new pg.Client({ connectionString: inject('postgres').adminUrl });
  await admin.connect();
  try {
    await admin.query('SELECT pg_advisory_lock($1)', [FROM_SCRATCH_LOCK]);
    await applySupabaseCompat(url);
    for (const migrationsDir of migrationsDirs)
      await dbmate(['up', '--strict'], { url, migrationsDir });
  } finally {
    await admin.query('SELECT pg_advisory_unlock($1)', [FROM_SCRATCH_LOCK]).catch(() => undefined);
    await admin.end();
  }
}

/** Banco migrado só até antes de `first`, pelo mesmo dbmate do repositório; `dir` guarda essas migrations. */
export async function databaseBefore(first: string): Promise<{
  readonly database: TestDatabase;
  readonly dir: string;
  readonly dispose: () => Promise<void>;
  /** Aplica `dir` e depois todas as migrations num banco vazio novo (com a mesma fila da migração do zero). */
  readonly migrateThenAll: (url: string) => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-preservation-'));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files.filter((name) => name < first))
    await copyFile(join(MIGRATIONS_DIR, file), join(dir, file));
  const database = await createTestDatabase({ migrated: false });
  await migrateFromScratch(database.url, [dir]);
  return {
    database,
    dir,
    migrateThenAll: (url) => migrateFromScratch(url, [dir, MIGRATIONS_DIR]),
    dispose: async () => {
      await database.drop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
