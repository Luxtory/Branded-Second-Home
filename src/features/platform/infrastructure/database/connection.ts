import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import { loadEnv, loadRuntimeConfig, type EnvSource } from '../env';
import type { DB } from './schema';
import { SUPABASE_ROOT_CA } from './supabase-root-ca';

export type Database = Kysely<DB>;
export type DatabaseTransaction = Transaction<DB>;

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

/** Conexão recusada fora de Production na Vercel: Previews não recebem o banco canônico (D3, ADR-0007). */
export class DatabaseEnvironmentError extends Error {
  constructor(readonly vercelEnv: string) {
    super(`Database access is disabled in the ${vercelEnv} environment (ADR-0007)`);
    this.name = 'DatabaseEnvironmentError';
  }
}

export interface ConnectionSettings {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly ssl:
    false | { readonly ca: string; readonly rejectUnauthorized: true; readonly servername: string };
}

const DEFAULT_POSTGRES_PORT = 5432;

/**
 * `sslmode` é obrigatório e só aceita `verify-full` (Supabase, CA raiz fixada, host conferido) ou `disable`
 * (PostgreSQL local). Credenciais nunca entram nas mensagens de erro.
 */
export function parseDatabaseUrl(url: string): ConnectionSettings {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode !== 'verify-full' && sslmode !== 'disable') {
    throw new DatabaseConfigError('DATABASE_URL must set sslmode=verify-full or sslmode=disable');
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.hostname === '' || parsed.username === '' || database === '') {
    throw new DatabaseConfigError('DATABASE_URL must name the host, the user and the database');
  }
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? DEFAULT_POSTGRES_PORT : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    ssl:
      sslmode === 'disable'
        ? false
        : { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true, servername: parsed.hostname },
  };
}

/** Kysely sobre um pool `pg`. Sem prepared statements nomeados: compatível com o Supavisor em modo transação. */
export function createDatabase(settings: ConnectionSettings): Database {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ ...settings }) }) });
}

let shared: Database | undefined;

/** Banco da aplicação (papel `luxtory_app`, ADR-0006), um pool por instância. */
export function getDatabase(source: EnvSource = process.env): Database {
  const { VERCEL_ENV } = loadEnv(source);
  if (VERCEL_ENV !== undefined && VERCEL_ENV !== 'production') {
    throw new DatabaseEnvironmentError(VERCEL_ENV);
  }
  if (shared === undefined) {
    const { DATABASE_URL } = loadRuntimeConfig(['DATABASE_URL'], source);
    shared = createDatabase(parseDatabaseUrl(DATABASE_URL));
  }
  return shared;
}
