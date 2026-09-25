// Única definição das flags do dbmate (ADR-0006): migrations em migrations/, histórico fora do schema public.
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

export const MIGRATIONS_DIR = 'migrations';
export const MIGRATIONS_SCHEMA = 'dbmate';
export const MIGRATIONS_TABLE = `${MIGRATIONS_SCHEMA}.schema_migrations`;

const run = promisify(execFile);
const CREDENTIALS_IN_URL = /(postgres(?:ql)?:\/\/)[^@\s]*@/g;
const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('dbmate/package.json');
const { bin } = require(packageJsonPath);
const DBMATE_CLI = join(dirname(packageJsonPath), typeof bin === 'string' ? bin : bin.dbmate);

export class DbmateError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'DbmateError';
  }
}

/** Quantidade de arquivos de migration em `dir`. */
export function countMigrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir).filter((name) => name.endsWith('.sql')).length;
}

/**
 * Executa o dbmate com as flags do projeto. A URL (com credencial) nunca aparece em erros ou logs.
 * @param {string[]} args comando e opções, ex.: ['up', '--strict']
 * @param {{ url?: string, migrationsDir?: string }} [options]
 */
export async function dbmate(args, options = {}) {
  const flags = [
    '--migrations-dir',
    options.migrationsDir ?? MIGRATIONS_DIR,
    '--migrations-table',
    MIGRATIONS_TABLE,
    '--no-dump-schema',
  ];
  const env = { ...process.env };
  if (options.url !== undefined) env.DATABASE_URL = options.url;
  try {
    return await run(process.execPath, [DBMATE_CLI, ...flags, ...args], { env });
  } catch (error) {
    const stderr = /** @type {{ stderr?: string }} */ (error).stderr ?? '';
    const safe = stderr.replace(CREDENTIALS_IN_URL, '$1***@').trim();
    throw new DbmateError(`dbmate ${args.join(' ')} failed: ${safe}`);
  }
}

/**
 * Aplica as migrations pendentes (`up --strict`). Sem nenhum arquivo de migration não há o que aplicar: o dbmate
 * trata isso como erro, aqui é um no-op (estado da W0).
 * @param {string} url
 * @param {string} [migrationsDir]
 */
export async function migrateUp(url, migrationsDir = MIGRATIONS_DIR) {
  if (countMigrationFiles(migrationsDir) === 0) return;
  await dbmate(['up', '--strict'], { url, migrationsDir });
}
