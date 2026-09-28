import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// Tabelas do catálogo (ADR-0010 §7, TECH-052): RLS só para o papel de aplicação, sem DELETE nem TRUNCATE.
const TABLES = [
  'brand_partner',
  'concept',
  'concept_version',
  'investor_authorization',
  'edition',
  'residence',
] as const;

describe('catálogo: RLS, privilégios e histórico (TECH-052)', () => {
  let database: TestDatabase;
  let app: pg.Client;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it('[TECH-052] anon e authenticated não leem nenhuma tabela do catálogo; RLS ligada em todas', async () => {
    for (const table of TABLES) {
      for (const role of ['anon', 'authenticated']) {
        const client = await database.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL ROLE ${role}`);
          await expect(client.query(`SELECT * FROM app.${table}`), `${role} ${table}`).rejects.toThrow(
            /permission denied/,
          );
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
    }
    const { rows } = await database.pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relnamespace = 'app'::regnamespace AND relname = ANY($1) ORDER BY relname`,
      [TABLES],
    );
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
    expect(rows).toHaveLength(TABLES.length);
  });

  it('[TECH-052] o papel de aplicação não apaga nem esvazia; o dono é barrado pelo gatilho', async () => {
    for (const table of TABLES) {
      await expect(app.query(`DELETE FROM app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(app.query(`TRUNCATE app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(database.pool.query(`TRUNCATE app.${table} CASCADE`), table).rejects.toThrow(
        /is not allowed/,
      );
    }
  });

  it('[TECH-052] UPDATE do papel de aplicação só nas colunas de transição', async () => {
    const { rows } = await database.pool.query<{ table_name: string; columns: string[] }>(
      `SELECT table_name, array_agg(column_name::text ORDER BY column_name) AS columns
       FROM information_schema.column_privileges
       WHERE grantee = 'luxtory_app' AND privilege_type = 'UPDATE' AND table_schema = 'app'
         AND table_name = ANY($1)
       GROUP BY table_name ORDER BY table_name`,
      [TABLES],
    );
    expect(rows).toEqual([
      {
        table_name: 'brand_partner',
        columns: [
          'exposure_authorization_ref',
          'exposure_authorized_at',
          'terminated_effective_at',
          'termination_basis',
          'termination_registered_at',
        ],
      },
      {
        table_name: 'concept_version',
        columns: [
          'approval_operation_id',
          'approval_refs',
          'approved_at',
          'approved_by_user_id',
          'approved_role',
          'state',
        ],
      },
      { table_name: 'investor_authorization', columns: ['revocation_basis', 'revoked_at'] },
    ]);
  });
});
