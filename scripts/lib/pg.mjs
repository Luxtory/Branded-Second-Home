// Utilitários de cliente PostgreSQL (driver `pg`) para scripts e testes. Sem servidor embutido: importar este
// módulo não registra nenhum hook de saída no processo.
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const SUPABASE_COMPAT_SQL = new URL('./supabase-compat.sql', import.meta.url);

export class PostgresHarnessError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PostgresHarnessError';
  }
}

/** @param {string} name */
export function assertIdentifier(name) {
  if (!IDENTIFIER.test(name))
    throw new PostgresHarnessError(`Invalid database identifier: ${name}`);
  return name;
}

/** URL de outro banco no mesmo servidor de `serverUrl`. */
export function databaseUrl(serverUrl, database) {
  const url = new URL(serverUrl);
  url.pathname = `/${assertIdentifier(database)}`;
  return url.toString();
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
 * Cria `name` no servidor de `adminUrl` (opcionalmente a partir de `template`) e devolve a URL do banco novo.
 * @param {string} adminUrl
 * @param {string} name
 * @param {{ template?: string }} [options]
 */
export async function createDatabase(adminUrl, name, options = {}) {
  const template = options.template ? ` TEMPLATE ${assertIdentifier(options.template)}` : '';
  await withClient(adminUrl, (client) =>
    client.query(`CREATE DATABASE ${assertIdentifier(name)}${template}`),
  );
  return databaseUrl(adminUrl, name);
}

/** @param {string} adminUrl @param {string} name */
export async function dropDatabase(adminUrl, name) {
  await withClient(adminUrl, (client) =>
    client.query(`DROP DATABASE IF EXISTS ${assertIdentifier(name)} WITH (FORCE)`),
  );
}
