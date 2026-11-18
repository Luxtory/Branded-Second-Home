// Banco descartável do sandbox da E5 (spec booking §10.16): só no job do repositório de teste
// Luxtory/luxtory-e5-authorizer-sandbox, contra o service container PostgreSQL do próprio job. Aplica as migrations do
// commit, confere a prontidão do ciclo (`app.assert_own_use_activation_ready`) e grava o verificador SCRAM sintético do
// papel autorizador — a senha fica só no secret do Environment, como no runbook real. Nunca contata outro banco.
import { migrateUp } from '../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, withClient } from '../../scripts/lib/pg.mjs';

const SCRAM_VERIFIER =
  /^SCRAM-SHA-256\$[1-9][0-9]{3,6}:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;

class SandboxDatabaseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SandboxDatabaseError';
  }
}

/** @param {string | undefined} value */
function disposableAdminUrl(value) {
  if (!value) throw new SandboxDatabaseError('SANDBOX_ADMIN_URL is missing');
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.searchParams.get('sslmode') !== 'disable') {
    throw new SandboxDatabaseError(
      'Refusing a database that is not the loopback service container',
    );
  }
  return url.toString();
}

const url = disposableAdminUrl(process.env.SANDBOX_ADMIN_URL);
const verifier = process.env.SANDBOX_AUTHORIZER_VERIFIER ?? '';
if (!SCRAM_VERIFIER.test(verifier))
  throw new SandboxDatabaseError('SANDBOX_AUTHORIZER_VERIFIER is invalid');

await applySupabaseCompat(url);
await migrateUp(url);
await withClient(url, async (client) => {
  await client.query('SELECT app.assert_own_use_activation_ready()');
  // O verificador passou pelo formato fechado acima: não há como fechar a string literal.
  await client.query(`ALTER ROLE luxtory_booking_authorizer WITH PASSWORD '${verifier}'`);
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM dbmate.schema_migrations)::int AS migrations,
            (SELECT count(*) FROM app.capability_activation)::int AS activation`,
  );
  process.stdout.write(
    `sandbox database ready: ${rows[0].migrations} migrations, activation ${rows[0].activation}\n`,
  );
});
