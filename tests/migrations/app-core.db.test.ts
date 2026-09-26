import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scramVerifier } from '../../scripts/lib/scram.mjs';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

const OPERATION_ID = '00000000-0000-4000-8000-00000000b001';

describe('schema app: auditoria só de inserção e menor privilégio (TECH-052, ADR-0006)', () => {
  let database: TestDatabase;
  let app: pg.Client;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      INSERT INTO app.operation VALUES ('${OPERATION_ID}', 'set_parameter', NULL, NULL, 'system', NULL, 'k-1',
        'corr-1', 'job:test', 'committed', now(), now());
      INSERT INTO app.audit_log (event_type, operation_id, occurred_at, role, object_type, object_id,
        authorization_ref) VALUES ('command', '${OPERATION_ID}', now(), 'system', 'parameter', 'p-1', 'job:test');
    `);
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it.each([
    ['UPDATE', `UPDATE app.audit_log SET object_id = 'p-2'`],
    ['DELETE', 'DELETE FROM app.audit_log'],
    ['TRUNCATE', 'TRUNCATE app.audit_log'],
  ])('[TECH-052] %s em audit_log falha até para o dono das tabelas', async (_op, statement) => {
    await expect(database.pool.query(statement)).rejects.toThrow(/not allowed/);
  });

  it.each([
    ['UPDATE', `UPDATE app.audit_log SET object_id = 'p-2'`],
    ['DELETE', 'DELETE FROM app.audit_log'],
    ['TRUNCATE', 'TRUNCATE app.audit_log'],
    ['SELECT', 'SELECT * FROM app.audit_log'],
  ])('[TECH-052] %s em audit_log é negado ao papel de aplicação', async (_op, statement) => {
    await expect(app.query(statement)).rejects.toThrow(/permission denied/);
  });

  it('[TECH-052] operation só avança de estado; demais colunas e DELETE são recusados', async () => {
    await expect(
      database.pool.query(`UPDATE app.operation SET state = 'pending' WHERE id = '${OPERATION_ID}'`),
    ).rejects.toThrow(/invalid state transition/);
    await expect(
      database.pool.query(`UPDATE app.operation SET command = 'x' WHERE id = '${OPERATION_ID}'`),
    ).rejects.toThrow(/only state and updated_at/);
    await expect(database.pool.query('DELETE FROM app.operation')).rejects.toThrow(/not allowed/);
    await expect(app.query(`UPDATE app.operation SET command = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('[ADR-0006] o papel de aplicação não faz DDL nem enxerga o histórico de migrations', async () => {
    await expect(app.query('CREATE TABLE app.x (id int)')).rejects.toThrow(/permission denied/);
    await expect(app.query('SELECT * FROM dbmate.schema_migrations')).rejects.toThrow(
      /permission denied/,
    );
    const { rows } = await app.query<{ user: string }>('SELECT current_user AS user');
    expect(rows[0]?.user).toBe('luxtory_app');
  });

  it('[ADR-0006] o verificador SCRAM gerado localmente autentica; outra senha é recusada', async () => {
    const wrong = new URL(database.appUrl);
    wrong.password = randomUUID();
    const intruder = new pg.Client({ connectionString: wrong.toString() });

    await expect(intruder.connect()).rejects.toThrow(/password authentication failed/);
    expect(scramVerifier('pencil', { salt: Buffer.alloc(16), iterations: 4096 })).toMatch(
      /^SCRAM-SHA-256\$4096:A{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
    );
    expect(() => scramVerifier('com espaço')).toThrow(/visible ASCII/);
  });
});
