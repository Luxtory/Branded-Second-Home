// npm run db:migrate — aplica migrations pendentes no banco de DATABASE_URL_MIGRATIONS.
// Usado só pela CI (job migrate, push em main). Sem a variável, falha de forma explícita.
import { countMigrationFiles, dbmate } from './lib/dbmate.mjs';

const url = process.env.DATABASE_URL_MIGRATIONS;
if (url === undefined || url === '') {
  console.error('DATABASE_URL_MIGRATIONS is not set: no migration was applied.');
  process.exit(1);
}
if (countMigrationFiles() === 0) {
  console.log('No migration files: nothing to apply.');
} else {
  const { stdout } = await dbmate(['up', '--strict'], { url });
  process.stdout.write(stdout);
}
