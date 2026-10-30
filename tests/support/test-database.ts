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
 * Violação de invariante encontrada no fim de um teste db: inventário (TECH-021, INV-1, INV-2, INV-3, TECH-022, W10) e
 * Direito de Uso (TECH-026, TECH-027, INV-4, INV-5, W11).
 */
export class InventoryInvariantError extends Error {
  constructor(readonly breaches: readonly string[]) {
    super(`Inventory invariants broken after the test: ${breaches.join(', ')}`);
    this.name = 'InventoryInvariantError';
  }
}

/**
 * Consultas de invariantes após todo teste db (ADR-0005, W10), numa conexão própria — o pool do teste pode ter sido
 * encerrado ou ter conexões derrubadas de propósito. Sem a função (banco vazio ou migrations desfeitas), não há o
 * que consultar.
 */
async function inventoryBreaches(url: string): Promise<readonly string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const present = await client.query<{ present: boolean }>(
      `SELECT to_regprocedure('app.inventory_invariant_breaches()') IS NOT NULL AS present`,
    );
    if (present.rows[0]?.present !== true) return [];
    const { rows } = await client.query<{
      invariant: string;
      second_home_id: string;
      stay_date: string;
    }>(
      `SELECT invariant, second_home_id, stay_date::text AS stay_date
         FROM app.inventory_invariant_breaches() LIMIT 10`,
    );
    const breaches = rows.map((row) => `${row.invariant}@${row.second_home_id}/${row.stay_date}`);
    const useRights = await client.query<{ present: boolean }>(
      `SELECT to_regprocedure('app.use_right_invariant_breaches()') IS NOT NULL AS present`,
    );
    if (useRights.rows[0]?.present !== true) return breaches;
    const ledger = await client.query<{
      invariant: string;
      second_home_id: string;
      detail: string;
    }>(`SELECT invariant, second_home_id, detail FROM app.use_right_invariant_breaches() LIMIT 10`);
    return [
      ...breaches,
      ...ledger.rows.map((row) => `${row.invariant}@${row.second_home_id}/${row.detail}`),
    ];
  } finally {
    await client.end();
  }
}

/**
 * Banco isolado, clonado do modelo já migrado. Chamar `drop()` no fim do teste: ele confere os invariantes do
 * inventário antes de apagar o banco e falha o teste se houver violação. `migrated: false` cria um banco vazio (sem as
 * migrations do repositório nem histórico do dbmate), para testes do próprio harness com migrations de fixture.
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
      const breaches = options.migrated === false ? [] : await inventoryBreaches(url);
      await pool.end();
      await dropDatabase(adminUrl, name);
      if (breaches.length > 0) throw new InventoryInvariantError(breaches);
    },
  };
}
