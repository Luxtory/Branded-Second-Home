// Processo dedicado ao PostgreSQL embutido (ver scripts/lib/embedded-pg.mjs). Escreve `{"adminUrl": …}` numa linha
// do stdout quando está pronto e para quando o stdin fecha (inclusive se o processo pai morrer) ou com SIGTERM.
import { startPostgres } from './lib/embedded-pg.mjs';

const server = await startPostgres();
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
};
process.stdin.on('end', stop);
process.stdin.resume();
process.on('SIGTERM', stop);
process.stdout.write(`${JSON.stringify({ adminUrl: server.adminUrl })}\n`);
