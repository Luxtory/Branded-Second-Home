import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { bookingHarness, type BookingHarness } from '../booking/booking-support';

export type StaffRole = 'admin' | 'super_admin';

export interface Staff {
  readonly userId: string;
  readonly roleId: string;
  readonly role: StaffRole;
}

type Handler<I, R extends JsonValue> = CommandHandler<I, R, DatabaseTransaction>;

/** Owner com data-base em 01/01 do corrente: corrente e seguinte selados (W10), com Titular para a RLS. */
export async function pricingHarness() {
  const h = await bookingHarness();
  const owner = await h.ownerScenario();
  return { h, owner };
}

export async function addStaff(h: BookingHarness, role: StaffRole): Promise<Staff> {
  const userId = randomUUID();
  await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
  const { rows } = await h.database.pool.query<{ id: string }>(
    `SELECT app.assign_staff_role($1, $2, 'Test W16 authority') AS id`,
    [userId, role],
  );
  return { userId, roleId: rows[0]!.id, role };
}

/**
 * Executor de produção (TECH-054) com o guard real — staff por AAL2 + papel ativo — sobre o PostgreSQL do harness, com
 * os privilégios reais do `luxtory_app`. O papel exercido é o da atribuição (ou outro, para provar a recusa).
 */
export function staffRunner(h: BookingHarness) {
  const log = captureLogger();

  function executor(session: { userId: string; assurance: 'aal1' | 'aal2' }) {
    const guard = createAuthorizationGuard({
      session,
      staff: createPostgresStaffDirectory(() => h.db),
      grants: createPostgresGrantDirectory(() => h.db),
      delegations: createPostgresDelegationDirectory(() => h.db),
      clock: systemClock,
    });
    return createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard,
      clock: systemClock,
      limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
      log: log.logger,
      registry: commandRegistry,
    });
  }

  function as<I, R extends JsonValue>(
    staff: Staff,
    handler: Handler<I, R>,
    input: unknown,
    options: { key?: string; role?: StaffRole; assurance?: 'aal1' | 'aal2' } = {},
  ) {
    return executor({ userId: staff.userId, assurance: options.assurance ?? 'aal2' }).execute(
      handler,
      {
        actor: {
          kind: 'user',
          userId: staff.userId,
          actingPartyId: null,
          role: options.role ?? staff.role,
        },
        idempotencyKey: options.key ?? randomUUID(),
        correlationId: randomUUID(),
        input,
      },
    );
  }

  return { as, logs: log.entries };
}

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}
