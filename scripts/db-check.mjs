// npm run db:check [-- <pasta de migrations>] — prova up → down → up em PostgreSQL real descartável (TECH-110).
import { MIGRATIONS_DIR } from './lib/dbmate.mjs';
import { checkMigrations } from './lib/migration-check.mjs';
import { applySupabaseCompat, createDatabase } from './lib/pg.mjs';
import { startPostgresProcess } from './lib/postgres-process.mjs';

const migrationsDir = process.argv[2] ?? MIGRATIONS_DIR;
const server = await startPostgresProcess();
try {
  const url = await createDatabase(server.adminUrl, 'luxtory_check');
  await applySupabaseCompat(url);
  const checked = await checkMigrations(url, migrationsDir);
  console.log(`db:check ok — ${checked} migration(s) in ${migrationsDir}: up → down → up`);
} finally {
  await server.stop();
}
