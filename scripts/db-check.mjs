// npm run db:check [-- <pasta de migrations>] — prova up → down → up em PostgreSQL real descartável (TECH-110).
import { MIGRATIONS_DIR } from './lib/dbmate.mjs';
import { applySupabaseCompat, startPostgres } from './lib/embedded-pg.mjs';
import { checkMigrations } from './lib/migration-check.mjs';

const migrationsDir = process.argv[2] ?? MIGRATIONS_DIR;
const server = await startPostgres();
try {
  const url = await server.createDatabase('luxtory_check');
  await applySupabaseCompat(url);
  const checked = await checkMigrations(url, migrationsDir);
  console.log(`db:check ok — ${checked} migration(s) in ${migrationsDir}: up → down → up`);
} finally {
  await server.stop();
}
