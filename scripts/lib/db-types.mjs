// Tipos do Kysely gerados do banco já migrado, nunca o contrário (ADR-0006 §8, TECH-010). Usado por
// `npm run db:types` (grava) e pelo teste que falha quando o arquivo commitado está desatualizado.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { format, resolveConfig } from 'prettier';

export const DATABASE_TYPES_FILE = 'src/features/platform/infrastructure/database/schema.ts';
const CODEGEN_BIN = 'node_modules/kysely-codegen/dist/cli/bin.js';
const run = promisify(execFile);

/**
 * Conteúdo formatado (Prettier do projeto) dos tipos do schema `app` do banco em `url`.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function generateDatabaseTypes(url) {
  const dir = await mkdtemp(join(tmpdir(), 'luxtory-db-types-'));
  try {
    const outFile = join(dir, 'schema.ts');
    await run(process.execPath, [
      CODEGEN_BIN,
      '--dialect',
      'postgres',
      '--url',
      url,
      '--include-pattern',
      'app.*',
      '--log-level',
      'error',
      '--out-file',
      outFile,
    ]);
    const generated = await readFile(outFile, 'utf8');
    const config = await resolveConfig(DATABASE_TYPES_FILE);
    return format(generated, { ...config, filepath: DATABASE_TYPES_FILE });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
