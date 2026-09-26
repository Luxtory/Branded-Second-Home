// npm run db:types — regenera os tipos do Kysely a partir das migrations (ADR-0006 §8): sobe um PostgreSQL
// descartável, aplica as migrations e grava o arquivo. O teste `tests/migrations/database-types.db.test.ts` falha
// se o arquivo commitado divergir.
import { writeFile } from 'node:fs/promises';
import { DATABASE_TYPES_FILE, generateDatabaseTypes } from './lib/db-types.mjs';
import { migrateUp } from './lib/dbmate.mjs';
import { applySupabaseCompat, createDatabase } from './lib/pg.mjs';
import { startPostgresProcess } from './lib/postgres-process.mjs';

const server = await startPostgresProcess();
try {
  const url = await createDatabase(server.adminUrl, 'luxtory_types');
  await applySupabaseCompat(url);
  await migrateUp(url);
  await writeFile(DATABASE_TYPES_FILE, await generateDatabaseTypes(url));
  console.log(`db:types ok — ${DATABASE_TYPES_FILE}`);
} finally {
  await server.stop();
}
