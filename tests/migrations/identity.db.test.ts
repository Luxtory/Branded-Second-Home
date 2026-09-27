import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

const USER = '00000000-0000-4000-8000-00000000a001';
const PARTY = '00000000-0000-4000-8000-00000000c001';
const OPERATION = '00000000-0000-4000-8000-00000000b101';

const insertGrant = (id: string, partyId = PARTY) => `
  INSERT INTO app.authorization_grant (id, grantee_party_id, commands, scope_type, scope_id, valid_from, valid_until,
    basis, granted_by_user_id, granted_role, operation_id, created_at)
  VALUES ('${id}', '${partyId}', ARRAY['test_partner_operation'], 'concept', 'concept-1', now(),
    now() + interval '30 days', 'instrumento', '${USER}', 'admin', '${OPERATION}', now())`;

describe('staff_role e funções de operação (TECH-050, REQ-015, ADR-0008)', () => {
  let database: TestDatabase;
  let app: pg.Client;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`INSERT INTO auth.users (id) VALUES ('${USER}')`);
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it('[REQ-015] atribuir papel grava staff_role, operation (runbook, system) e audit_log com o depois', async () => {
    const { rows } = await database.pool.query<{ id: string }>(
      `SELECT app.assign_staff_role('${USER}', 'admin', 'Ata da diretoria 2026-09') AS id`,
    );
    const roleId = rows[0]?.id;
    const audit = await database.pool.query(
      `SELECT a.role, a.object_type, a.authorization_ref, a.before, a.after, o.command, o.state, o.idempotency_key
         FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id WHERE a.object_id = $1`,
      [roleId],
    );

    expect(audit.rows).toEqual([
      expect.objectContaining({
        role: 'system',
        object_type: 'staff_role',
        authorization_ref: 'Ata da diretoria 2026-09',
        before: null,
        after: expect.objectContaining({ id: roleId, user_id: USER, role: 'admin', revoked_at: null }),
        command: 'assign_staff_role',
        state: 'committed',
        idempotency_key: expect.stringMatching(/^runbook:/),
      }),
    ]);
  });

  it('[TECH-050] sem hierarquia: o mesmo usuário pode ter Admin e Super Admin; papel ativo repetido é recusado', async () => {
    await database.pool.query(`SELECT app.assign_staff_role('${USER}', 'super_admin', 'Ata 2')`);
    await expect(
      database.pool.query(`SELECT app.assign_staff_role('${USER}', 'admin', 'Ata 3')`),
    ).rejects.toThrow(/staff_role_active_idx/);
    await expect(
      database.pool.query(`SELECT app.assign_staff_role('${USER}', 'owner', 'Ata 4')`),
    ).rejects.toThrow(/check/);
  });

  it('[REQ-015] usuário inexistente no Supabase Auth é recusado sem gravar nada', async () => {
    await expect(
      database.pool.query(
        `SELECT app.assign_staff_role('00000000-0000-4000-8000-00000000a999', 'admin', 'Ata')`,
      ),
    ).rejects.toThrow(/does not exist in auth.users/);
  });

  it('[REQ-015] revogar grava antes/depois; revogar de novo e alterar outra coluna são recusados', async () => {
    const { rows } = await database.pool.query<{ id: string }>(
      `SELECT id FROM app.staff_role WHERE user_id = '${USER}' AND role = 'super_admin'`,
    );
    const roleId = rows[0]?.id as string;
    await database.pool.query(`SELECT app.revoke_staff_role('${roleId}', 'Desligamento 2026-09')`);
    const audit = await database.pool.query(
      `SELECT before, after FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id
        WHERE o.command = 'revoke_staff_role' AND a.object_id = $1`,
      [roleId],
    );

    expect(audit.rows[0]?.before).toMatchObject({ revoked_at: null });
    expect(audit.rows[0]?.after).toMatchObject({ revocation_basis: 'Desligamento 2026-09' });
    await expect(
      database.pool.query(`SELECT app.revoke_staff_role('${roleId}', 'De novo')`),
    ).rejects.toThrow(/single revocation/);
    await expect(
      database.pool.query(`UPDATE app.staff_role SET role = 'admin' WHERE id = '${roleId}'`),
    ).rejects.toThrow(/single revocation/);
    await expect(database.pool.query('DELETE FROM app.staff_role')).rejects.toThrow(/not allowed/);
  });

  it('[TECH-052] o papel de aplicação só lê staff_role e não executa as funções de operação', async () => {
    await expect(app.query('SELECT count(*) FROM app.staff_role')).resolves.toBeDefined();
    for (const statement of [
      `UPDATE app.staff_role SET revoked_at = now(), revocation_basis = 'x'`,
      'DELETE FROM app.staff_role',
      `INSERT INTO app.staff_role VALUES (gen_random_uuid(), '${USER}', 'admin', 'x', now(), NULL, NULL)`,
      `SELECT app.assign_staff_role('${USER}', 'admin', 'x')`,
      `SELECT app.revoke_staff_role('${USER}', 'x')`,
      `SELECT app.revoke_authorization_grant('${USER}', 'x')`,
    ]) {
      await expect(app.query(statement), statement).rejects.toThrow(/permission denied/);
    }
  });

  it('[TECH-052] anon e authenticated não leem staff_role nem authorization_grant', async () => {
    for (const table of ['app.staff_role', 'app.authorization_grant']) {
      for (const role of ['anon', 'authenticated']) {
        const client = await database.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL ROLE ${role}`);
          await expect(client.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
      // O papel de aplicação, ao virar authenticated para uma leitura de usuário, também não lê.
      await app.query('BEGIN');
      await app.query('SET LOCAL ROLE authenticated');
      await expect(app.query(`SELECT * FROM ${table}`)).rejects.toThrow(/permission denied/);
      await app.query('ROLLBACK');
    }
  });
});

describe('authorization_grant: dívida transitória fechada para falhas e revogação (REQ-014, D-W2-1)', () => {
  let database: TestDatabase;
  let app: pg.Client;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      INSERT INTO app.operation VALUES ('${OPERATION}', 'grant_authorization', '${USER}', NULL, 'admin', NULL,
        'k-1', 'corr-1', 'staff_role:r1', 'committed', now(), now())`);
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it('[REQ-014] sem app.party (antes da W7) nenhum grant entra, nem pelo dono das tabelas', async () => {
    const attempt = app.query(insertGrant('00000000-0000-4000-8000-00000000d001'));

    await expect(attempt).rejects.toMatchObject({
      code: '23503',
      constraint: 'authorization_grant_grantee_party_fk',
    });
    await expect(
      database.pool.query(insertGrant('00000000-0000-4000-8000-00000000d002')),
    ).rejects.toThrow(/grantee party .* does not exist/);
  });

  it('[REQ-014] com app.party, só entra grant de party existente (mesma semântica da FK da W7)', async () => {
    await database.pool.query(`CREATE TABLE app.party (id uuid PRIMARY KEY)`);
    await database.pool.query(`INSERT INTO app.party VALUES ('${PARTY}')`);

    await expect(
      app.query(insertGrant('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c999')),
    ).rejects.toMatchObject({ constraint: 'authorization_grant_grantee_party_fk' });
    await expect(app.query(insertGrant('00000000-0000-4000-8000-00000000d004'))).resolves.toBeDefined();
  });

  it('[REQ-015] revogação só pela função do dono, auditada; o grant nunca é alterado nem apagado de outra forma', async () => {
    const grantId = '00000000-0000-4000-8000-00000000d004';
    await expect(
      app.query(`UPDATE app.authorization_grant SET revoked_at = now(), revocation_basis = 'x'`),
    ).rejects.toThrow(/permission denied/);
    await expect(app.query('DELETE FROM app.authorization_grant')).rejects.toThrow(/permission denied/);

    await database.pool.query(`SELECT app.revoke_authorization_grant('${grantId}', 'Fim do contrato')`);
    const audit = await database.pool.query(
      `SELECT a.before, a.after FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id
        WHERE o.command = 'revoke_authorization_grant' AND a.object_id = $1`,
      [grantId],
    );

    expect(audit.rows[0]?.before).toMatchObject({ revoked_at: null });
    expect(audit.rows[0]?.after).toMatchObject({ revocation_basis: 'Fim do contrato' });
    await expect(
      database.pool.query(`SELECT app.revoke_authorization_grant('${grantId}', 'De novo')`),
    ).rejects.toThrow(/single revocation/);
    await expect(
      database.pool.query(`UPDATE app.authorization_grant SET scope_id = 'x' WHERE id = '${grantId}'`),
    ).rejects.toThrow(/single revocation/);
    await expect(database.pool.query('DELETE FROM app.authorization_grant')).rejects.toThrow(/not allowed/);
  });
});
