import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/features/platform/infrastructure/database/connection';
import { appDatabase } from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

describe('conexão encerrada pelo servidor (ADR-0022 §6)', () => {
  let database: TestDatabase;
  let db: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
  });
  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  it('[TECH-110] transaction_timeout durante espera externa recusa a transação sem derrubar o processo', async () => {
    const stalled = db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('transaction_timeout', '300ms', true)`.execute(tx);
      // Espera fora do banco (como uma chamada HTTP) com a conexão em transação.
      await new Promise((resolve) => setTimeout(resolve, 700));
      await sql`SELECT 1`.execute(tx);
    });
    await expect(stalled).rejects.toThrow();
    // O pool descarta a conexão encerrada e continua servindo.
    const { rows } = await sql<{ ok: number }>`SELECT 1 AS ok`.execute(db);
    expect(rows[0]!.ok).toBe(1);
  });
});
