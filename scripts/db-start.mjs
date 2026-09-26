// npm run db:start — PostgreSQL local persistente para desenvolvimento, com as migrations aplicadas.
// Dados em ~/.local/share/luxtory/pg-dev (ext4 do WSL; /mnt/c não serve para a pasta de dados).
// Este script é o próprio processo do servidor: pode importar embedded-pg.mjs (ver o aviso naquele módulo).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { migrateUp } from './lib/dbmate.mjs';
import { startPostgres } from './lib/embedded-pg.mjs';
import { applySupabaseCompat, createDatabase, databaseUrl, withClient } from './lib/pg.mjs';

const DEV_PORT = 54329;
const DEV_DATABASE = 'luxtory';

const server = await startPostgres({
  dataDir: join(homedir(), '.local', 'share', 'luxtory', 'pg-dev'),
  port: DEV_PORT,
  persistent: true,
});
const exists = await withClient(server.adminUrl, async (client) => {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    DEV_DATABASE,
  ]);
  return rowCount === 1;
});
const url = exists
  ? databaseUrl(server.adminUrl, DEV_DATABASE)
  : await createDatabase(server.adminUrl, DEV_DATABASE);
await applySupabaseCompat(url);
await migrateUp(url);

console.log(`PostgreSQL local pronto: ${url}`);
console.log('Ctrl+C para parar.');
const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
