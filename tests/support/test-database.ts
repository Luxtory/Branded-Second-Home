import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { withClient } from '../../scripts/lib/embedded-pg.mjs';

export interface TestDatabase {
  readonly url: string;
  readonly pool: pg.Pool;
  drop(): Promise<void>;
}

/** Banco isolado, clonado do modelo já migrado. Chamar `drop()` no fim do arquivo de teste. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const { adminUrl, template } = inject('postgres');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  await withClient(adminUrl, (client) =>
    client.query(`CREATE DATABASE ${name} TEMPLATE ${template}`),
  );
  const target = new URL(adminUrl);
  target.pathname = `/${name}`;
  const url = target.toString();
  const pool = new pg.Pool({ connectionString: url });
  return {
    url,
    pool,
    async drop() {
      await pool.end();
      await withClient(adminUrl, (client) =>
        client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
      );
    },
  };
}
