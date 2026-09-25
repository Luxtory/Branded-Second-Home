import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDatabase, dropDatabase } from '../../scripts/lib/pg.mjs';

export interface TestDatabase {
  readonly url: string;
  readonly pool: pg.Pool;
  drop(): Promise<void>;
}

/** Banco isolado, clonado do modelo já migrado. Chamar `drop()` no fim do teste. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const { adminUrl, template } = inject('postgres');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const url = await createDatabase(adminUrl, name, { template });
  const pool = new pg.Pool({ connectionString: url });
  return {
    url,
    pool,
    async drop() {
      await pool.end();
      await dropDatabase(adminUrl, name);
    },
  };
}
