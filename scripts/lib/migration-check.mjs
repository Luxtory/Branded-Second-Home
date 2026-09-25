// Prova de rollback (ADR-0006, TECH-110): as migrations sobem, descem por completo e sobem de novo.
// "Descer por completo" = depois de todos os rollbacks o catálogo volta exatamente ao estado anterior.
import { countMigrationFiles, dbmate, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from './dbmate.mjs';
import { withClient } from './pg.mjs';

export class MigrationCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationCheckError';
  }
}

// Objetos que migrations criam: schemas, relações, funções, tipos, extensões e papéis.
const CATALOG_SNAPSHOT_SQL = `
  WITH user_ns AS (
    SELECT oid, nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', $1)
      AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'
  )
  SELECT 'schema ' || nspname AS item FROM user_ns
  UNION ALL SELECT 'relation ' || n.nspname || '.' || c.relname || ' ' || c.relkind::text
    FROM pg_class c JOIN user_ns n ON n.oid = c.relnamespace
  UNION ALL SELECT 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p JOIN user_ns n ON n.oid = p.pronamespace
  UNION ALL SELECT 'type ' || n.nspname || '.' || t.typname
    FROM pg_type t JOIN user_ns n ON n.oid = t.typnamespace
    WHERE t.typtype IN ('e', 'd', 'c', 'r', 'm') AND t.typrelid = 0
  UNION ALL SELECT 'extension ' || extname FROM pg_extension
  UNION ALL SELECT 'role ' || rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%'
  ORDER BY 1`;

/** @param {string} url @returns {Promise<string[]>} */
async function catalogSnapshot(url) {
  return withClient(url, async (client) => {
    const { rows } = await client.query(CATALOG_SNAPSHOT_SQL, [MIGRATIONS_SCHEMA]);
    return rows.map((row) => row.item);
  });
}

/** @param {string} url @returns {Promise<number>} */
async function appliedCount(url) {
  return withClient(url, async (client) => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${MIGRATIONS_TABLE}`);
    return rows[0].n;
  });
}

/** @param {string[]} before @param {string[]} after */
function diff(before, after) {
  const removed = before.filter((item) => !after.includes(item)).map((item) => `- ${item}`);
  const added = after.filter((item) => !before.includes(item)).map((item) => `+ ${item}`);
  return [...removed, ...added].join('\n');
}

/**
 * Sobe, desce tudo e sobe de novo as migrations de `migrationsDir` no banco de `url` (sem migrations aplicadas).
 * @param {string} url
 * @param {string} migrationsDir
 * @returns {Promise<number>} quantidade de migrations verificadas
 */
export async function checkMigrations(url, migrationsDir) {
  const expected = countMigrationFiles(migrationsDir);
  if (expected === 0) return 0;
  const run = (/** @type {string[]} */ args) => dbmate(args, { url, migrationsDir });
  const baseline = await catalogSnapshot(url);

  await run(['up', '--strict']);
  const applied = await appliedCount(url);
  if (applied !== expected) {
    throw new MigrationCheckError(`up applied ${applied} of ${expected} migration file(s)`);
  }
  const migrated = await catalogSnapshot(url);

  for (let i = 0; i < applied; i += 1) await run(['rollback']);
  const leftovers = diff(baseline, await catalogSnapshot(url));
  if ((await appliedCount(url)) !== 0 || leftovers !== '') {
    throw new MigrationCheckError(`rollback did not restore the catalog:\n${leftovers}`);
  }

  await run(['up', '--strict']);
  const drift = diff(migrated, await catalogSnapshot(url));
  if (drift !== '') throw new MigrationCheckError(`second up differs from the first:\n${drift}`);
  return expected;
}
