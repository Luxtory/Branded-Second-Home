import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import {
  createCommandExecutor,
  createPostgresCommandStore,
  commandRegistry,
  type Database,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { createAcquisitionHandlers } from '@/features/ownership/presentation/acquisition-handlers';
import { catalogHarness, controlledClock } from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase } from '../../support/test-database';
import { ownerParty } from '../../support/party-fixtures';

export async function acquisitionHarness(institution = true) {
  const database = await createTestDatabase();
  const db = appDatabase(database.appUrl);
  const userId = randomUUID();
  await database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
  const assigned = await database.pool.query<{ id: string }>(
    `SELECT app.assign_staff_role($1,'admin','Test acquisition authority') AS id`,
    [userId],
  );
  const roleId = assigned.rows[0]!.id;
  const clock = controlledClock(new Date('2027-01-01T12:00:00Z'));
  const institutionId = institution
    ? await ownerParty(database.pool, undefined, { type: 'cnpj' })
    : null;
  if (institutionId !== null)
    await database.pool.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
      institutionId,
      'Synthetic institutional act',
    ]);
  const actor = { kind: 'user', userId, actingPartyId: null, role: 'admin' } as const;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const guard = createAuthorizationGuard({
    session: { userId, assurance: 'aal2' },
    staff: createPostgresStaffDirectory(() => db),
    grants: createPostgresGrantDirectory(() => db),
    delegations: createPostgresDelegationDirectory(() => db),
    clock,
  });
  const commandStore = createPostgresCommandStore(db);
  const executor = createCommandExecutor({
    store: commandStore,
    guard,
    clock,
    limits: { maxAttempts: 1, lockTimeoutMs: 10000 },
    log,
    registry: commandRegistry,
  });
  const source = { ACQUISITION_WRITES: 'open' };
  const handlers = createAcquisitionHandlers({ source, clock });
  const catalog = catalogHarness(db, clock);
  async function root() {
    const built = await catalog.build.finalizedHomeEdition();
    const home = await catalog.build.secondHome(built.homeEdition.id);
    return { ...built, home };
  }
  const run = <I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    key = randomUUID(),
  ) =>
    executor.execute(handler, { actor, input, idempotencyKey: key, correlationId: randomUUID() });
  const party = (type: 'cpf' | 'cnpj' = 'cpf') => ownerParty(database.pool, undefined, { type });
  async function owner(home: string) {
    return {
      second_home_id: home,
      modality: 'owner',
      location: 'Localização sintética',
      operation_start_date: '2027-01-01',
      acquirer_party_ids: [await party()],
      basis_ref: 'synthetic:acquisition',
    };
  }
  async function coOwner(home: string, n = 2) {
    return {
      second_home_id: home,
      modality: 'co_owner',
      location: 'Localização sintética',
      operation_start_date: '2027-01-01',
      acquirer_party_ids: await Promise.all(Array.from({ length: n }, () => party())),
      configuration_id: n,
      spe_party_id: await party('cnpj'),
      basis_ref: 'synthetic:acquisition',
    };
  }
  return {
    database,
    db,
    clock,
    userId,
    roleId,
    actor,
    institutionId,
    handlers,
    catalog,
    source,
    run,
    root,
    party,
    owner,
    coOwner,
    guard,
    commandStore,
    log,
    async close() {
      await db.destroy();
      await database.drop();
    },
  };
}
export type AcquisitionHarness = Awaited<ReturnType<typeof acquisitionHarness>>;
export async function factCounts(db: Database, home: string) {
  const count = async (
    table: 'app.acquisition' | 'app.holding' | 'app.stake' | 'app.spe' | 'app.use_right_ledger',
  ) =>
    Number(
      (
        await db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll().as('n'))
          .where('second_home_id', '=', home)
          .executeTakeFirstOrThrow()
      ).n,
    );
  return Promise.all([
    count('app.acquisition'),
    count('app.holding'),
    count('app.stake'),
    count('app.spe'),
    count('app.use_right_ledger'),
  ]);
}
