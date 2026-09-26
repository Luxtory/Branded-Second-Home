import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDatabase, dropDatabase } from '../../scripts/lib/pg.mjs';

export interface TestDatabase {
  readonly url: string;
  /** Mesmo banco, conectando como o papel de aplicação `luxtory_app` (ADR-0006 §5). */
  readonly appUrl: string;
  readonly pool: pg.Pool;
  drop(): Promise<void>;
}

/**
 * Banco isolado, clonado do modelo já migrado. Chamar `drop()` no fim do teste. `migrated: false` cria um banco vazio
 * (sem as migrations do repositório nem histórico do dbmate), para testes do próprio harness com migrations de fixture.
 */
export async function createTestDatabase(
  options: { migrated?: boolean } = {},
): Promise<TestDatabase> {
  const { adminUrl, template, appRole } = inject('postgres');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const url = await createDatabase(adminUrl, name, options.migrated === false ? {} : { template });
  const pool = new pg.Pool({ connectionString: url });
  const appUrl = new URL(url);
  appUrl.username = appRole.user;
  appUrl.password = appRole.password;
  return {
    url,
    appUrl: appUrl.toString(),
    pool,
    async drop() {
      await pool.end();
      await dropDatabase(adminUrl, name);
    },
  };
}
