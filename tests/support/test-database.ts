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
 * Violação de invariante encontrada no fim de um teste db: inventário (TECH-021, INV-1, INV-2, INV-3, TECH-022, W10),
 * Direito de Uso (TECH-026, TECH-027, INV-4, INV-5, W11), reserva (W12/W13), Créditos (INV-6, TECH-044, W17) e pagamentos (TECH-025, TECH-082, W19).
 */
export class InventoryInvariantError extends Error {
  constructor(readonly breaches: readonly string[]) {
    super(`Inventory invariants broken after the test: ${breaches.join(', ')}`);
    this.name = 'InventoryInvariantError';
  }
}

/**
 * Funções de invariantes consultadas após todo teste db (ADR-0005): inventário (W10), Direito de Uso (W11), reserva
 * (W12/W13) e Créditos (W17, INV-6). Uma linha por violação, já formatada.
 */
const INVARIANT_QUERIES: readonly (readonly [string, string])[] = [
  [
    'app.inventory_invariant_breaches()',
    `SELECT concat(invariant, '@', second_home_id, '/', stay_date) AS breach
       FROM app.inventory_invariant_breaches() LIMIT 10`,
  ],
  [
    'app.use_right_invariant_breaches()',
    `SELECT concat(invariant, '@', second_home_id, '/', detail) AS breach
       FROM app.use_right_invariant_breaches() LIMIT 10`,
  ],
  [
    'app.booking_invariant_breaches()',
    `SELECT concat(invariant, '@', second_home_id, '/', detail) AS breach
       FROM app.booking_invariant_breaches() LIMIT 10`,
  ],
  [
    'app.credit_invariant_breaches()',
    `SELECT concat(invariant, '@', lot_id, '/', detail) AS breach
       FROM app.credit_invariant_breaches() LIMIT 10`,
  ], // W19 (ADR-0035): estornos, Fee e settlement.
  [
    'app.billing_invariant_breaches()',
    `SELECT concat(invariant, '@', object_id, '/', detail) AS breach
       FROM app.billing_invariant_breaches() LIMIT 10`,
  ], // W20 (ADR-0036): depósito completo e cessão só por depósito ou aceite.
  [
    'app.luxchange_invariant_breaches()',
    `SELECT concat(invariant, '@', operation_id, '/', detail) AS breach
       FROM app.luxchange_invariant_breaches() LIMIT 10`,
  ],
];

/**
 * Consultas de invariantes após todo teste db (ADR-0005, W10), numa conexão própria — o pool do teste pode ter sido
 * encerrado ou ter conexões derrubadas de propósito. Função ausente (banco vazio ou migrations desfeitas) não tem o
 * que consultar.
 */
async function inventoryBreaches(url: string): Promise<readonly string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const breaches: string[] = [];
    for (const [procedure, query] of INVARIANT_QUERIES) {
      const present = await client.query<{ present: boolean }>(
        'SELECT to_regprocedure($1) IS NOT NULL AS present',
        [procedure],
      );
      if (present.rows[0]?.present !== true) continue;
      const { rows } = await client.query<{ breach: string }>(query);
      breaches.push(...rows.map((row) => row.breach));
    }
    return breaches;
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
