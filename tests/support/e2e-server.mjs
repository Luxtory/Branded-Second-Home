// Servidor de E2E (ADR-0005): PostgreSQL embutido com as migrations do repositório, usuários de teste e `next start`
// com autenticação de teste (`AUTH_MODE=test`, nunca na Vercel). Uso: node tests/support/e2e-server.mjs <porta>.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { migrateUp } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, createDatabase, withClient } from '../../scripts/lib/pg.mjs';
import { startPostgresProcess } from '../../scripts/lib/postgres-process.mjs';
import { scramVerifier } from '../../scripts/lib/scram.mjs';

// E-mails dos usuários de teste: os mesmos de tests/e2e/admin-access.spec.ts.
const E2E_STAFF_EMAIL = 'staff@luxtory.test';
const E2E_VISITOR_EMAIL = 'visitante@luxtory.test';

const APP_ROLE = 'luxtory_app';
const DATABASE = 'luxtory_e2e';

// Mesmo id que `testUserId` do adapter de teste (src/features/identity/infrastructure/auth/test-auth-gateway.ts); se
// divergir, o login do staff no E2E cai na tela 403.
function testUserId(email) {
  const hex = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function prepareDatabase(adminUrl) {
  const url = await createDatabase(adminUrl, DATABASE);
  await applySupabaseCompat(url);
  await migrateUp(url);
  const password = randomBytes(24).toString('base64url');
  const staff = testUserId(E2E_STAFF_EMAIL);
  const visitor = testUserId(E2E_VISITOR_EMAIL);
  await withClient(url, async (client) => {
    await client.query(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${scramVerifier(password)}'`);
    await client.query('INSERT INTO auth.users (id) VALUES ($1), ($2)', [staff, visitor]);
    // Mesmo caminho do runbook: função do dono, com operation e audit_log. O visitante não tem papel.
    await client.query(`SELECT app.assign_staff_role($1, 'admin', 'E2E')`, [staff]);
  });
  const appUrl = new URL(url);
  appUrl.username = APP_ROLE;
  appUrl.password = password;
  return appUrl.toString();
}

const port = process.argv[2] ?? '3100';
const postgres = await startPostgresProcess();
let next;
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  next?.kill('SIGTERM');
  await postgres.stop();
  process.exit(code);
}

process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));

try {
  const databaseUrl = await prepareDatabase(postgres.adminUrl);
  next = spawn('npx', ['next', 'start', '--port', port, '--hostname', '127.0.0.1'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AUTH_MODE: 'test',
      DATABASE_URL: databaseUrl,
      // Valores só de teste; os de produção vêm do runbook (TECH-001).
      COMMAND_MAX_ATTEMPTS: '3',
      COMMAND_LOCK_TIMEOUT_MS: '5000',
      OUTBOX_BATCH_SIZE: '100',
      // Vazio = ausente para a aplicação, e impede que um arquivo `.env*` local o defina.
      VERCEL_ENV: '',
    },
  });
  next.once('exit', (code) => void stop(code ?? 1));
} catch (error) {
  console.error(error);
  await stop(1);
}
