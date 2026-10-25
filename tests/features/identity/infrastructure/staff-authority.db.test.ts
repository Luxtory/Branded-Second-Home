import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  appDatabase,
  createWidgetTable,
  deferred,
  testRegistry,
  waitForLockWaiter,
} from '../../../support/platform-fixtures';
import { STAFF_USER, staffActor } from '../../../support/identity-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';
import {
  createCommandExecutor,
  type Actor,
  type CommandHandler,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import { createPostgresCommandStore } from '@/features/platform/infrastructure/commands/postgres-command-store';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { assertTransactionalAdminAuthority } from '@/features/identity/infrastructure/transactional-admin-authority';

describe('autoridade Admin transacional (ADR-0021, TECH-050/054)', () => {
  let database: TestDatabase;
  let db: Database;
  let roleId: string;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    await database.pool.query('INSERT INTO auth.users (id) VALUES ($1)', [STAFF_USER]);
    const result = await database.pool.query<{ id: string }>(
      "SELECT app.assign_staff_role($1, 'admin', 'Ata de teste') AS id",
      [STAFF_USER],
    );
    roleId = result.rows[0]!.id;
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const assertAuthority = (ref: string, actor: Actor = staffActor('admin')) =>
    db.transaction().execute((tx) => assertTransactionalAdminAuthority(tx, actor, ref));

  it('[TECH-050] exige o id/user/admin exato e não amplia privilégios do papel de aplicação', async () => {
    await expect(assertAuthority(`staff_role:${roleId}`)).resolves.toBeUndefined();
    await expect(assertAuthority(`staff_role:${roleId.toUpperCase()}`)).resolves.toBeUndefined();
    const privilege = await sql<{ update: boolean; revoke: boolean }>`SELECT
      has_table_privilege(current_user, 'app.staff_role', 'UPDATE') AS update,
      has_function_privilege(current_user, 'app.revoke_staff_role(uuid,text)', 'EXECUTE') AS revoke`.execute(
      db,
    );
    expect(privilege.rows).toEqual([{ update: false, revoke: false }]);
    for (const [ref, actor] of [
      ['staff_role:not-a-uuid', staffActor('admin')],
      [`authorization_grant:${roleId}`, staffActor('admin')],
      [`staff_role:${roleId}`, staffActor('admin', '00000000-0000-4000-8000-0000000000b9')],
      [`staff_role:${roleId}`, staffActor('super_admin')],
      [`staff_role:${roleId}`, { kind: 'system', job: 'outbox' }],
      ['staff_role:00000000-0000-4000-8000-000000000000', staffActor('admin')],
    ] as const) {
      await expect(assertAuthority(ref, actor)).rejects.toMatchObject({ code: 'ERR_PERMISSION' });
    }
    const superId = (
      await database.pool.query<{ id: string }>(
        "SELECT app.assign_staff_role($1, 'super_admin', 'Outra função') AS id",
        [STAFF_USER],
      )
    ).rows[0]!.id;
    await expect(assertAuthority(`staff_role:${superId}`)).rejects.toMatchObject({
      code: 'ERR_PERMISSION',
    });
  });

  it('[ADR-0021] revogação e nova atribuição do mesmo Admin nunca substituem a linha que autorizou', async () => {
    await database.pool.query("SELECT app.revoke_staff_role($1, 'Fim')", [roleId]);
    const replacement = (
      await database.pool.query<{ id: string }>(
        "SELECT app.assign_staff_role($1, 'admin', 'Novo ato') AS id",
        [STAFF_USER],
      )
    ).rows[0]!.id;
    await expect(assertAuthority(`staff_role:${roleId}`)).rejects.toMatchObject({
      code: 'ERR_PERMISSION',
    });
    await expect(assertAuthority(`staff_role:${replacement}`)).resolves.toBeUndefined();
  });

  it('[ADR-0021] leitores compartilhados coexistem e rollback libera a autoridade para revogação', async () => {
    const locked = deferred();
    const release = deferred();
    const first = db.transaction().execute(async (tx) => {
      await assertTransactionalAdminAuthority(tx, staffActor('admin'), `staff_role:${roleId}`);
      locked.resolve();
      await release.promise;
      throw new Error('rollback');
    });
    const failed = expect(first).rejects.toThrow('rollback');
    await locked.promise;
    try {
      await db.transaction().execute(async (tx) => {
        await sql`SET LOCAL lock_timeout = '1000ms'`.execute(tx);
        await assertTransactionalAdminAuthority(tx, staffActor('admin'), `staff_role:${roleId}`);
      });
    } finally {
      release.resolve();
      await failed;
    }
    await database.pool.query("SELECT app.revoke_staff_role($1, 'Após rollback')", [roleId]);
    await expect(assertAuthority(`staff_role:${roleId}`)).rejects.toMatchObject({
      code: 'ERR_PERMISSION',
    });
  });

  const executor = () =>
    createCommandExecutor({
      store: createPostgresCommandStore(db),
      guard: createAuthorizationGuard({
        session: { userId: STAFF_USER, assurance: 'aal2' },
        staff: createPostgresStaffDirectory(() => db),
        grants: createPostgresGrantDirectory(() => db),
        delegations: createPostgresDelegationDirectory(() => db),
        clock: { now: () => new Date() },
      }),
      clock: { now: () => new Date() },
      limits: { maxAttempts: 1, lockTimeoutMs: 10000 },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registry: testRegistry,
    });

  const mutating = (
    before = async () => {},
    after = async () => {},
  ): CommandHandler<null, null, DatabaseTransaction> => ({
    command: 'test_command',
    input: z.null(),
    async execute({ tx, actor, authorizationRef, audit, emit }) {
      await before();
      await assertTransactionalAdminAuthority(tx, actor, authorizationRef);
      await sql`UPDATE app.test_widget SET n = n + 1 WHERE id = 'w-1'`.execute(tx);
      audit({ objectType: 'test_widget', objectId: 'w-1', before: null, after: { n: 1 } });
      emit({ type: 'platform.test_happened', dedupKey: 'once', payload: {} });
      await after();
      return null;
    },
  });
  const request = {
    actor: staffActor('admin'),
    idempotencyKey: 'k-authority',
    correlationId: 'corr-authority',
    input: null,
  };

  it('[ADR-0021] comando primeiro: segura a revogação até commit; depois do revoke nem replay é autorizado', async () => {
    await createWidgetTable(database.pool);
    const entered = deferred();
    const release = deferred();
    const command = executor().execute(
      mutating(undefined, async () => {
        entered.resolve();
        await release.promise;
      }),
      request,
    );
    const revoker = await database.pool.connect();
    let revoke: Promise<unknown> | undefined;
    try {
      await entered.promise;
      revoke = revoker.query("SELECT app.revoke_staff_role($1, 'Fim')", [roleId]);
      expect(
        await Promise.race([
          revoke.then(() => 'revoked'),
          waitForLockWaiter(database.pool).then(() => 'waiting'),
        ]),
      ).toBe('waiting');
      release.resolve();
      await expect(command).resolves.toMatchObject({ status: 'committed', replayed: false });
      await revoke;
      await expect(executor().execute(mutating(), request)).resolves.toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
        replayed: false,
        operationId: null,
      });
      expect(
        (await database.pool.query("SELECT n FROM app.test_widget WHERE id = 'w-1'")).rows,
      ).toEqual([{ n: 1 }]);
      expect(
        (
          await database.pool.query(
            "SELECT authorization_ref FROM app.operation WHERE command = 'test_command'",
          )
        ).rows,
      ).toEqual([{ authorization_ref: `staff_role:${roleId}` }]);
      expect((await database.pool.query('SELECT count(*)::int AS n FROM app.outbox')).rows).toEqual(
        [{ n: 1 }],
      );
    } finally {
      release.resolve();
      await command;
      await revoke;
      revoker.release();
    }
  });

  it('[ADR-0021] revoke primeiro: command já autorizado espera e relê revogação sem domínio/audit/outbox', async () => {
    await createWidgetTable(database.pool);
    const authorized = deferred();
    const release = deferred();
    const command = executor().execute(
      mutating(async () => {
        authorized.resolve();
        await release.promise;
      }),
      request,
    );
    const revoker = await database.pool.connect();
    try {
      await authorized.promise;
      await revoker.query('BEGIN');
      await revoker.query("SELECT app.revoke_staff_role($1, 'Fim')", [roleId]);
      release.resolve();
      await waitForLockWaiter(database.pool);
      await revoker.query('COMMIT');
      await expect(command).resolves.toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
        replayed: false,
      });
      expect(
        (await database.pool.query("SELECT n FROM app.test_widget WHERE id = 'w-1'")).rows,
      ).toEqual([{ n: 0 }]);
      expect(
        (
          await database.pool.query(
            "SELECT count(*)::int AS n FROM app.audit_log WHERE object_type = 'test_widget'",
          )
        ).rows,
      ).toEqual([{ n: 0 }]);
      expect((await database.pool.query('SELECT count(*)::int AS n FROM app.outbox')).rows).toEqual(
        [{ n: 0 }],
      );
      expect(
        (
          await database.pool.query(
            "SELECT state FROM app.operation WHERE command = 'test_command'",
          )
        ).rows,
      ).toEqual([{ state: 'failed' }]);
    } finally {
      await revoker.query('ROLLBACK');
      release.resolve();
      await command;
      revoker.release();
    }
  });

  it('[ADR-0021] revoke_staff_role espera a chave compartilhada exata antes de revogar', async () => {
    const command = await database.pool.connect();
    const revoker = await database.pool.connect();
    let revoke: Promise<unknown> | undefined;
    try {
      await command.query('BEGIN');
      await command.query(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended('app.staff_role:' || $1, 0))",
        [roleId],
      );
      revoke = revoker.query("SELECT app.revoke_staff_role($1, 'Fim de acesso')", [roleId]);
      const order = await Promise.race([
        revoke.then(() => 'revoked'),
        waitForLockWaiter(database.pool).then(() => 'waiting'),
      ]);
      expect(order).toBe('waiting');
      expect(
        (await database.pool.query('SELECT revoked_at FROM app.staff_role WHERE id = $1', [roleId]))
          .rows[0]?.revoked_at,
      ).toBeNull();
    } finally {
      await command.query('ROLLBACK');
      await revoke;
      command.release();
      revoker.release();
    }
  });
});
