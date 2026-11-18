// Autorizador independente do luxtory_app (W13 E5; ADR-0027 §4; spec booking §10.7 e §10.16).
// Executado só pelo workflow `.github/workflows/booking-authorizer.yml`, no passo protegido pelo GitHub Environment
// `booking-authorizer` (runbook: docs/how-to/autorizador-de-reservas.md). Entradas só por variáveis de ambiente; o banco
// deriva e confere o escopo (`app.authorize_booking_action`). Saída pública (repositório público): só `result=<código>`
// e, na emissão, `authorization_id=<uuid>` — nunca a mensagem do erro, a conexão ou dado da reserva.
// Dependências: só `pg` e módulos do Node (o job instala sem devDependencies e sem scripts de instalação).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const AUTHORIZER_ROLE = 'luxtory_booking_authorizer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mesmo schema fechado de `app.authorize_booking_action` e `app.revoke_booking_authorization`.
const APPROVAL_REF = /^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$/;
// Papel autorizador direto ou pelo Supavisor (`<papel>.<project-ref>`); qualquer outro papel é recusado antes de conectar.
const USERNAME = /^luxtory_booking_authorizer(\.[a-z0-9]{1,64})?$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const PUBLIC_CODE = /^[a-z][a-z0-9_]{0,62}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const DEFAULT_PORT = 5432;
const CONNECT_TIMEOUT_MS = 15_000;
// A função espera a trava consultiva da reserva (ADR-0027 §4); um command da aplicação em curso não segura o job.
const STATEMENT_TIMEOUT_MS = 30_000;
const CA_SOURCE = new URL(
  '../src/features/platform/infrastructure/database/supabase-root-ca.ts',
  import.meta.url,
);
const CERTIFICATE = /-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----/g;

const ACTIONS = Object.freeze({
  authorize: {
    sql: 'SELECT app.authorize_booking_action($1::uuid, $2::text) AS id',
    result: 'authorized',
  },
  revoke: { sql: 'SELECT app.revoke_booking_authorization($1::uuid, $2::text)', result: 'revoked' },
});

/** Recusa com código público (sem dado da entrada nem da conexão). */
export class AuthorizerRefusal extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`booking authorizer refused: ${code}`);
    this.name = 'AuthorizerRefusal';
    this.code = code;
  }
}

/**
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {{ action: 'authorize' | 'revoke', id: string, approvalRef: string }}
 */
export function parseInputs(env) {
  const action = env.AUTHORIZER_ACTION ?? '';
  const id = env.AUTHORIZER_ID ?? '';
  const approvalRef = env.AUTHORIZER_APPROVAL_REF ?? '';
  if (!Object.hasOwn(ACTIONS, action) || !UUID.test(id) || !APPROVAL_REF.test(approvalRef)) {
    throw new AuthorizerRefusal('input_invalid');
  }
  return { action: /** @type {'authorize' | 'revoke'} */ (action), id, approvalRef };
}

/** CA raiz do Supabase fixada no código da aplicação (fonte única; ADR-0006). */
export function supabaseRootCa(source = readFileSync(CA_SOURCE, 'utf8')) {
  const certificates = source.match(CERTIFICATE) ?? [];
  if (certificates.length !== 1) throw new Error('Expected exactly one pinned Supabase root CA');
  return certificates[0];
}

/**
 * Conexão do secret do Environment: só o papel autorizador, com senha, sem parâmetros além de `sslmode`; TLS
 * `verify-full` com a CA fixada, ou `disable` só em loopback (PostgreSQL descartável dos testes e do sandbox).
 * @param {string | undefined} value
 */
export function connectionConfig(value) {
  if (!value) throw new AuthorizerRefusal('configuration_missing');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AuthorizerRefusal('configuration_invalid');
  }
  const user = decodeURIComponent(url.username);
  const sslmode = url.searchParams.get('sslmode');
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  const onlySslmode = [...url.searchParams.keys()].every((key) => key === 'sslmode');
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !USERNAME.test(user) ||
    !url.password ||
    !url.hostname ||
    !onlySslmode ||
    !(sslmode === 'verify-full' || (loopback && sslmode === 'disable'))
  ) {
    throw new AuthorizerRefusal('configuration_invalid');
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  return {
    host,
    port: url.port ? Number(url.port) : DEFAULT_PORT,
    database: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    user,
    password: decodeURIComponent(url.password),
    ssl:
      sslmode === 'disable'
        ? false
        : { ca: supabaseRootCa(), rejectUnauthorized: true, servername: url.hostname },
    application_name: 'booking-authorizer',
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  };
}

/**
 * Código público de uma falha: a constraint nomeada da recusa no banco, o SQLSTATE ou `connection_failed`.
 * @param {unknown} error
 */
export function refusalCode(error) {
  if (error instanceof AuthorizerRefusal) return error.code;
  const { constraint, code } = /** @type {{ constraint?: unknown, code?: unknown }} */ (
    typeof error === 'object' && error !== null ? error : {}
  );
  if (typeof constraint === 'string' && PUBLIC_CODE.test(constraint)) return constraint;
  if (typeof code === 'string' && SQLSTATE.test(code)) return `sqlstate_${code}`;
  return 'connection_failed';
}

/**
 * @param {pg.ClientConfig} config
 * @param {{ action: 'authorize' | 'revoke', id: string, approvalRef: string }} input
 * @param {(line: string) => void} write
 */
async function execute(config, input, write) {
  const client = new pg.Client(config);
  // Queda da conexão chega pela rejeição da consulta pendente; sem este ouvinte o evento derrubaria o processo com a
  // mensagem do erro no log público.
  client.on('error', () => undefined);
  await client.connect();
  try {
    const role = await client.query('SELECT current_user = $1 AND session_user = $1 AS ok', [
      AUTHORIZER_ROLE,
    ]);
    if (role.rows[0]?.ok !== true) throw new AuthorizerRefusal('role_mismatch');
    const { rows } = await client.query(ACTIONS[input.action].sql, [input.id, input.approvalRef]);
    const outcome = [`result=${ACTIONS[input.action].result}`];
    if (input.action === 'authorize') {
      const id = String(rows[0]?.id ?? '');
      if (!UUID.test(id)) throw new AuthorizerRefusal('unexpected_result');
      outcome.push(`authorization_id=${id}`);
    }
    outcome.forEach(write);
  } finally {
    // O resultado já foi gravado e impresso (ou a falha vai ser): fechar a conexão não muda o desfecho.
    await client.end().catch(() => undefined);
  }
}

/**
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {(line: string) => void} write
 * @returns {Promise<0 | 1>}
 */
export async function runAuthorizer(env, write) {
  try {
    const input = parseInputs(env);
    await execute(connectionConfig(env.BOOKING_AUTHORIZER_DATABASE_URL), input, write);
    return 0;
  } catch (error) {
    write(`result=${refusalCode(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAuthorizer(process.env, (line) => process.stdout.write(`${line}\n`));
}
