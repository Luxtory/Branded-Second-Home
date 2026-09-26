import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TYPES_FILE, generateDatabaseTypes } from '../../scripts/lib/db-types.mjs';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// O kysely-codegen roda em processo próprio e carrega muitos módulos: no drvfs (/mnt/c) passa de 1 min.
const CODEGEN_TIMEOUT_MS = 240_000;

describe('tipos do Kysely (ADR-0006 §8, TECH-010)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  it('[TECH-010] o arquivo de tipos é o gerado do banco migrado (rodar `npm run db:types` se falhar)', async () => {
    const committed = await readFile(DATABASE_TYPES_FILE, 'utf8');

    expect(await generateDatabaseTypes(database.url)).toBe(committed);
  }, CODEGEN_TIMEOUT_MS);
});
