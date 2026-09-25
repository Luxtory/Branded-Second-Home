// PostgreSQL 17 real para testes e desenvolvimento, sem Docker (ADR-0005, TECH-110).
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const PG_USER = 'postgres';
// Senha do PostgreSQL local descartável, ouvindo só em loopback. Nunca é credencial de ambiente real.
const PG_PASSWORD = 'postgres';
const INITDB_FLAGS = ['--encoding=UTF8', '--locale=C.UTF-8'];
const MAX_BUFFERED_LOG_LINES = 50;
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const SUPABASE_COMPAT_SQL = new URL('./supabase-compat.sql', import.meta.url);

export class EmbeddedPostgresError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EmbeddedPostgresError';
  }
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/** @param {string} name */
function assertIdentifier(name) {
  if (!IDENTIFIER.test(name))
    throw new EmbeddedPostgresError(`Invalid database identifier: ${name}`);
  return name;
}

/**
 * Executa `fn` com um cliente conectado a `url` e sempre fecha a conexão.
 * @template T
 * @param {string} url
 * @param {(client: pg.Client) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Aplica a compatibilidade mínima com o Supabase (papéis, schema auth) no banco de `url`. */
export async function applySupabaseCompat(url) {
  const sql = await readFile(SUPABASE_COMPAT_SQL, 'utf8');
  await withClient(url, (client) => client.query(sql));
}

/**
 * Sobe um PostgreSQL local. A pasta de dados precisa estar num sistema de arquivos com permissões POSIX
 * (ext4/tmpfs do WSL), nunca em /mnt/c (drvfs): o padrão é uma pasta temporária descartável.
 * @param {{ dataDir?: string, port?: number, persistent?: boolean }} [options]
 */
export async function startPostgres(options = {}) {
  const persistent = options.persistent ?? false;
  const dataDir = options.dataDir ?? join(await mkdtemp(join(tmpdir(), 'luxtory-pg-')), 'data');
  const port = options.port ?? (await freePort());
  /** @type {string[]} */
  const recentLog = [];
  const remember = (/** @type {unknown} */ line) => {
    recentLog.push(String(line));
    if (recentLog.length > MAX_BUFFERED_LOG_LINES) recentLog.shift();
  };
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: PG_USER,
    password: PG_PASSWORD,
    persistent,
    initdbFlags: INITDB_FLAGS,
    onLog: remember,
    onError: remember,
  });
  try {
    if (!existsSync(join(dataDir, 'PG_VERSION'))) await server.initialise();
    await server.start();
  } catch (error) {
    throw new EmbeddedPostgresError(
      `PostgreSQL did not start (dataDir=${dataDir}, port=${port}):\n${recentLog.join('\n')}`,
      { cause: error },
    );
  }
  // Servidor só em loopback: sem TLS (o driver do dbmate exige TLS por padrão).
  /** @param {string} database */
  const url = (database) =>
    `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${assertIdentifier(database)}?sslmode=disable`;
  const adminUrl = url('postgres');
  return {
    port,
    dataDir,
    url,
    /** @param {string} name @param {{ template?: string }} [opts] */
    async createDatabase(name, opts = {}) {
      const template = opts.template ? ` TEMPLATE ${assertIdentifier(opts.template)}` : '';
      await withClient(adminUrl, (c) =>
        c.query(`CREATE DATABASE ${assertIdentifier(name)}${template}`),
      );
      return url(name);
    },
    /** @param {string} name */
    async dropDatabase(name) {
      await withClient(adminUrl, (c) =>
        c.query(`DROP DATABASE IF EXISTS ${assertIdentifier(name)} WITH (FORCE)`),
      );
    },
    stop: () => server.stop(),
  };
}
