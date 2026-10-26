// Servidor de E2E (ADR-0005): PostgreSQL embutido com as migrations do repositório, usuários de teste e `next start`
// com autenticação de teste (`AUTH_MODE=test`, nunca na Vercel). Uso: node tests/support/e2e-server.mjs <porta>.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { migrateUp } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, createDatabase, withClient } from '../../scripts/lib/pg.mjs';
import { startPostgresProcess } from '../../scripts/lib/postgres-process.mjs';
import { scramVerifier } from '../../scripts/lib/scram.mjs';
import {
  E2E_ACQUISITION_DATABASE_FILE,
  validateE2eAcquisitionDatabase,
} from './e2e-acquisition-database.mjs';

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
  return { databaseUrl: appUrl.toString(), ownerUrl: url };
}

// This harness only owns an embedded disposable database, never a deployment or an external DATABASE_URL.
const source = process.env;
if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E server is local/CI only');
const acquisitionFixtureFile = join(process.cwd(), E2E_ACQUISITION_DATABASE_FILE);
const port = process.argv[2] ?? '3100';
const postgres = await startPostgresProcess();
let next;
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  next?.kill('SIGTERM');
  rmSync(acquisitionFixtureFile, { force: true });
  await postgres.stop();
  process.exit(code);
}

process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));

try {
  const { databaseUrl, ownerUrl } = await prepareDatabase(postgres.adminUrl);
  const disposableOwnerUrl = validateE2eAcquisitionDatabase(ownerUrl);
  mkdirSync(dirname(acquisitionFixtureFile), { recursive: true });
  writeFileSync(acquisitionFixtureFile, JSON.stringify({ ownerUrl: disposableOwnerUrl }), {
    mode: 0o600,
  });
  chmodSync(acquisitionFixtureFile, 0o600);
  next = spawn('npx', ['next', 'start', '--port', port, '--hostname', '127.0.0.1'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AUTH_MODE: 'test',
      DATABASE_URL: databaseUrl,
      // Valores só de teste; os de produção vêm do runbook (TECH-001).
      COMMAND_MAX_ATTEMPTS: '3',
      // W8 is opened only in this disposable local/CI child; a separate closed run exercises its read state.
      ACQUISITION_WRITES: source.E2E_ACQUISITION_GATE === 'closed' ? 'closed' : 'open',
      COMMAND_LOCK_TIMEOUT_MS: '5000',
      OUTBOX_BATCH_SIZE: '100',
      // Mídia do catálogo em diretório local descartável (ADR-0015; `local` é recusado na Vercel).
      MEDIA_STORAGE: 'local',
      MEDIA_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'luxtory-e2e-media-')),
      // Contato Brand Partners (spec catalog §14.6): envio e limitador determinísticos em memória — nenhum e-mail real,
      // nenhum Upstash. Origem permitida = o próprio servidor do E2E; limites folgados (o 429 é provado nos testes da
      // rota e na interface por interceptação).
      BRAND_PARTNERS_CONTACT_MODE: 'fake',
      BRAND_PARTNERS_CONTACT_HMAC_SECRET: randomBytes(32).toString('base64url'),
      BRAND_PARTNERS_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
      BRAND_PARTNERS_CONTACT_NETWORK_LIMIT: '200',
      BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS: '60',
      BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT: '500',
      BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS: '60',
      // Interesse (spec ownership §5): limitador determinístico em memória (nenhum Upstash) e limites folgados — o 429
      // é provado nos testes da rota. O segredo da pseudonimização é o mesmo da BP1, com domínio próprio.
      INTEREST_LIMITER_MODE: 'fake',
      INTEREST_NETWORK_LIMIT: '200',
      INTEREST_NETWORK_WINDOW_SECONDS: '60',
      INTEREST_GLOBAL_LIMIT: '500',
      INTEREST_GLOBAL_WINDOW_SECONDS: '60',
      // W6 (ADR-0018): segredos próprios de teste, gerados a cada execução — hash de idempotência e contexto de
      // apresentação da Home Edition. O E2E lê o contexto da própria página.
      INTEREST_REQUEST_HMAC_SECRET: randomBytes(32).toString('base64url'),
      INTEREST_CONTEXT_HMAC_SECRET: randomBytes(32).toString('base64url'),
      // W7 (ADR-0020): anéis de teste da party, gerados a cada execução (cifra e HMAC com material separado).
      PII_ENCRYPTION_KEYRING: `e2e1:${randomBytes(32).toString('base64')}`,
      PII_ENCRYPTION_ACTIVE_KEY_ID: 'e2e1',
      PII_HMAC_KEYRING: `h2e1:${randomBytes(32).toString('base64')}`,
      PII_HMAC_ACTIVE_KEY_ID: 'h2e1',
      // Vazio = ausente para a aplicação, e impede que um arquivo `.env*` local o defina.
      VERCEL_ENV: '',
    },
  });
  next.once('exit', (code) => void stop(code ?? 1));
} catch (error) {
  console.error(error);
  await stop(1);
}
