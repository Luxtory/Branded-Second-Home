import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createCommandExecutor,
  recordAdminRead,
  withUserRead,
  type CommandHandler,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import { createPostgresCommandStore } from '@/features/platform/infrastructure/commands/postgres-command-store';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { ownerDelegation, ownerParty } from '../../../support/party-fixtures';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import type { VerifiedSession } from '@/features/identity/domain/session';
import { appDatabase } from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';
import {
  PARTNER_OPERATION,
  PARTNER_REGISTRY,
  PARTNER_USER,
  PARTY,
  SCOPE,
  STAFF_USER,
} from '../../../support/identity-fixtures';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const clock = { now: () => NOW };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Operação de parceiro só de teste: age sobre um Concept (escopo) e audita. */
const partnerHandler: CommandHandler<{ homeConcept: string }, { ok: true }, DatabaseTransaction> = {
  command: PARTNER_OPERATION.name,
  input: z.strictObject({ homeConcept: z.string() }),
  scope: (input) => ({ type: 'home_concept', id: input.homeConcept }),
  execute({ audit }) {
    audit({
      objectType: 'home_concept',
      objectId: 'home-concept-1',
      before: null,
      after: { touched: true },
    });
    return Promise.resolve({ ok: true });
  },
};

async function seedGrant(
  database: TestDatabase,
  id: string,
  overrides: { commands?: string; from?: string; until?: string; scopeId?: string } = {},
) {
  const operation = id.replace('d', 'b');
  await database.pool.query(
    `INSERT INTO app.operation VALUES ($1, 'grant_authorization', $2, NULL, 'admin', NULL, $3, 'corr', 'staff_role:r',
       'committed', now(), now())`,
    [operation, STAFF_USER, `seed-${id}`],
  );
  await database.pool.query(
    `INSERT INTO app.authorization_grant (id, grantee_party_id, commands, scope_type, scope_id, valid_from,
       valid_until, basis, granted_by_user_id, granted_role, operation_id, created_at)
     VALUES ($1, $2, $3::text[], 'home_concept', $4, $5, $6, 'instrumento', $7, 'admin', $8, now())`,
    [
      id,
      PARTY,
      overrides.commands ?? `{${PARTNER_OPERATION.name}}`,
      overrides.scopeId ?? SCOPE.id,
      overrides.from ?? '2026-09-01T00:00:00Z',
      overrides.until ?? '2026-10-01T00:00:00Z',
      STAFF_USER,
      operation,
    ],
  );
}

describe('guard com PostgreSQL real e pipeline de commands (REQ-014, TECH-050/051)', () => {
  let database: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    database = await createTestDatabase();
    // W7: party real (FK validada do grant) e delegação ativa do parceiro para ela (cadeia do TECH-050).
    await ownerParty(database.pool, PARTY);
    await ownerDelegation(database.pool, {
      partyId: PARTY,
      userId: PARTNER_USER,
      validFrom: "'2026-09-01T00:00:00Z'",
    });
    await database.pool.query(`INSERT INTO auth.users (id) VALUES ('${STAFF_USER}')`);
    db = appDatabase(database.appUrl);
  });

  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  const execute = (session: VerifiedSession, key: string, homeConcept: string = SCOPE.id) =>
    createCommandExecutor({
      store: createPostgresCommandStore(db),
      guard: createAuthorizationGuard({
        session,
        staff: createPostgresStaffDirectory(() => db),
        grants: createPostgresGrantDirectory(() => db),
        delegations: createPostgresDelegationDirectory(() => db),
        clock,
      }),
      clock,
      limits: { maxAttempts: 3, lockTimeoutMs: 1_000 },
      log,
      registry: PARTNER_REGISTRY,
    }).execute(partnerHandler, {
      actor: { kind: 'user', userId: PARTNER_USER, actingPartyId: PARTY, role: 'grantee' },
      idempotencyKey: key,
      correlationId: 'corr-grantee',
      input: { homeConcept },
    });

  const partner: VerifiedSession = { userId: PARTNER_USER, assurance: 'aal1' };

  it('[REQ-014] sem grant, o command do parceiro é negado e nada é gravado', async () => {
    await expect(execute(partner, 'k-none')).resolves.toMatchObject({
      status: 'rejected',
      code: 'ERR_PERMISSION',
      operationId: null,
    });
    const { rows } = await database.pool.query(
      `SELECT count(*)::int AS n FROM app.operation WHERE command = $1`,
      [PARTNER_OPERATION.name],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('[REQ-014] grant vencido, ainda não vigente, de outro command ou de outro escopo não autoriza', async () => {
    await seedGrant(database, '00000000-0000-4000-8000-00000000d010', {
      until: '2026-09-15T12:00:00Z',
    });
    await seedGrant(database, '00000000-0000-4000-8000-00000000d011', {
      from: '2026-09-16T00:00:00Z',
    });
    await seedGrant(database, '00000000-0000-4000-8000-00000000d012', {
      commands: '{other_operation}',
    });
    await seedGrant(database, '00000000-0000-4000-8000-00000000d013', {
      scopeId: 'home-concept-2',
    });

    await expect(execute(partner, 'k-invalid')).resolves.toMatchObject({ code: 'ERR_PERMISSION' });
  });

  it('[REQ-014] grant válido autoriza e a operation registra authorization_grant como base', async () => {
    const grantId = '00000000-0000-4000-8000-00000000d020';
    await seedGrant(database, grantId);

    const outcome = await execute(partner, 'k-valid');
    expect(outcome).toMatchObject({ status: 'committed', result: { ok: true } });
    const { rows } = await database.pool.query(
      `SELECT o.authorization_ref, o.role, a.authorization_ref AS audit_ref
         FROM app.operation o JOIN app.audit_log a ON a.operation_id = o.id WHERE o.idempotency_key = 'k-valid'`,
    );
    expect(rows).toEqual([
      {
        authorization_ref: `authorization_grant:${grantId}`,
        role: 'grantee',
        audit_ref: `authorization_grant:${grantId}`,
      },
    ]);
    await expect(execute(partner, 'k-other-scope', 'home-concept-3')).resolves.toMatchObject({
      code: 'ERR_PERMISSION',
    });
  });

  it('[REQ-014] grant revogado deixa de autorizar no command seguinte', async () => {
    await database.pool.query(
      `SELECT app.revoke_authorization_grant('00000000-0000-4000-8000-00000000d020', 'Fim do contrato')`,
    );

    await expect(execute(partner, 'k-after-revoke')).resolves.toMatchObject({
      code: 'ERR_PERMISSION',
    });
  });

  it('[TECH-050] papel de staff lido do banco: ativo autoriza, revogado deixa de autorizar', async () => {
    const staff = createPostgresStaffDirectory(() => db);
    const { rows } = await database.pool.query<{ id: string }>(
      `SELECT app.assign_staff_role('${STAFF_USER}', 'admin', 'Ata') AS id`,
    );
    const roleId = rows[0]?.id as string;

    await expect(staff.activeRoles(STAFF_USER, new Date())).resolves.toEqual([
      { id: roleId, role: 'admin' },
    ]);
    await expect(staff.activeRoles(STAFF_USER, new Date('2000-01-01T00:00:00Z'))).resolves.toEqual(
      [],
    );
    await database.pool.query(`SELECT app.revoke_staff_role('${roleId}', 'Desligamento')`);
    await expect(staff.activeRoles(STAFF_USER, new Date())).resolves.toEqual([]);
  });
});

describe('leituras sob RLS e leitura administrativa auditada (TECH-052, TECH-092, ADR-0006 §6)', () => {
  let database: TestDatabase;
  let db: Database;
  const OTHER = '00000000-0000-4000-8000-0000000000b9';

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      CREATE TABLE app.rls_fixture (owner uuid NOT NULL, note text NOT NULL);
      ALTER TABLE app.rls_fixture ENABLE ROW LEVEL SECURITY;
      CREATE POLICY rls_fixture_owner ON app.rls_fixture FOR SELECT TO authenticated USING (owner = auth.uid());
      GRANT USAGE ON SCHEMA app TO authenticated;
      GRANT SELECT, INSERT ON app.rls_fixture TO authenticated;
      INSERT INTO app.rls_fixture VALUES ('${STAFF_USER}', 'minha'), ('${OTHER}', 'de outro');`);
    db = appDatabase(database.appUrl);
  });

  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  const claims = (sub: string) => ({ sub, role: 'authenticated' as const, aal: 'aal2' });

  it('[TECH-052] cada usuário lê só as próprias linhas, pelas claims verificadas', async () => {
    const read = (sub: string) =>
      withUserRead(db, claims(sub), (tx) =>
        tx
          .selectFrom('app.rls_fixture' as never)
          .select('note' as never)
          .execute(),
      );

    await expect(read(STAFF_USER)).resolves.toEqual([{ note: 'minha' }]);
    await expect(read(OTHER)).resolves.toEqual([{ note: 'de outro' }]);
  });

  it('[TECH-052] papel e claims valem só na transação; a leitura é só de leitura', async () => {
    await withUserRead(db, claims(STAFF_USER), async (tx) => {
      const { rows } = await sql<{ role: string }>`SELECT current_user AS role`.execute(tx);
      expect(rows[0]?.role).toBe('authenticated');
      await expect(
        sql`INSERT INTO app.rls_fixture VALUES (${STAFF_USER}, 'x')`.execute(tx),
      ).rejects.toThrow(/read-only transaction/);
    });
    const { rows } = await sql<{ role: string; claims: string | null }>`
      SELECT current_user AS role, nullif(current_setting('request.jwt.claims', true), '') AS claims`.execute(
      db,
    );
    expect(rows[0]).toEqual({ role: 'luxtory_app', claims: null });
  });

  it('[TECH-092] leitura administrativa grava audit_log do tipo admin_read com ator, papel e base', async () => {
    await recordAdminRead(db, {
      actor: { kind: 'user', userId: STAFF_USER, actingPartyId: null, role: 'admin' },
      objectType: 'authorization_grant',
      objectId: 'g-1',
      authorizationRef: 'staff_role:r1',
      at: NOW,
    });
    const { rows } = await database.pool.query(
      `SELECT event_type, operation_id, actor_user_id, role, object_type, object_id, authorization_ref
         FROM app.audit_log WHERE event_type = 'admin_read'`,
    );

    expect(rows).toEqual([
      {
        event_type: 'admin_read',
        operation_id: null,
        actor_user_id: STAFF_USER,
        role: 'admin',
        object_type: 'authorization_grant',
        object_id: 'g-1',
        authorization_ref: 'staff_role:r1',
      },
    ]);
  });
});
