import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createCivilCalendar } from '@/features/calendar';
import { createCloseExerciseHandler } from '@/features/calendar/application/close-exercise';
import { createOpenExerciseHandler } from '@/features/calendar/application/open-exercise';
import { buildUseRightConsumers } from '@/features/calendar/application/use-right-consumers';
import { isLeapYear } from '@/features/calendar/domain/use-right';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { createPostgresSealingStore } from '@/features/calendar/infrastructure/postgres-sealing-store';
import { createPostgresUseRightStore } from '@/features/calendar/infrastructure/postgres-use-right-store';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import { createRootCustodyOpener } from '@/features/inventory';
import { initialDrawConsumers } from '@/features/ownership/application/initial-draw';
import { roundTime } from '@/features/ownership/domain/initial-draw';
import { postgresInitialDrawStore } from '@/features/ownership/infrastructure/postgres-initial-draw-store';
import { findFormalizedSecondHome, findUseRightFacts, stakeHolders } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  enqueueOutboxEvent,
  recordNotification,
  systemClock,
  systemCommandGuard,
  type DatabaseTransaction,
} from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import type { AcquisitionHarness } from '../ownership/acquisition-support';
import { testBeacon, waitUntil } from '../ownership/initial-draw-support';
import { openOperation, SEALING_YEAR } from './sealing-support';

export const TZ = 'America/Sao_Paulo';
export const civil = createCivilCalendar();
export const rights = createUseRightCalendar(temporalCivilTime);

const firstLeapFrom = (year: number, step: 1 | -1) => {
  let y = year;
  while (!isLeapYear(y)) y += step;
  return y;
};
/** Primeiro ano bissexto depois do corrente: sempre futuro, fora do horizonte de selagem quando é o seguinte + 1. */
export const LEAP_AHEAD = firstLeapFrom(SEALING_YEAR + 1, 1);
/** Último ano bissexto antes do corrente: exercício já encerrado. */
export const PAST_LEAP = firstLeapFrom(SEALING_YEAR - 1, -1);

/**
 * Autoridade Admin concedida no passado (fixture do dono do schema): permite formalizar com o relógio injetado num
 * exercício já encerrado ou no início do corrente. O guard confere `granted_at <= relógio` (W2).
 */
export async function backdateAuthority(h: AcquisitionHarness): Promise<void> {
  await h.database.pool.query(
    `UPDATE app.staff_role SET revoked_at = now(), revocation_basis = 'test: backdated authority' WHERE id = $1`,
    [h.roleId],
  );
  await h.database.pool.query(
    `INSERT INTO app.staff_role (id, user_id, role, basis, granted_at)
     VALUES ($1, $2, 'admin', 'Test backdated authority', '2000-01-01T00:00:00Z')`,
    [randomUUID(), h.userId],
  );
}

export interface CoOwnerHome {
  readonly homeId: string;
  readonly acquisitionId: string;
  readonly formalizedAt: Date;
  /** Ações em ordem de `allocation_position`. */
  readonly stakes: readonly string[];
}

/** Co-Owner com exercício completo começando em `start` (01/01), formalizada com o relógio em `at` (W8). */
export async function formalizeCoOwnerAt(
  h: AcquisitionHarness,
  n: number,
  start: string,
  at: Date,
): Promise<CoOwnerHome> {
  const previous = h.clock.now();
  h.clock.set(at);
  try {
    const { home } = await h.root();
    const outcome = await h.run(h.handlers.formalizeAcquisition, {
      ...(await h.coOwner(home.id, n)),
      operation_start_date: start,
    });
    if (outcome.status !== 'committed') throw new Error(`co-owner formalization ${outcome.status}`);
    const acquisition = await h.db
      .selectFrom('app.acquisition')
      .select(['id', 'formalized_at'])
      .where('second_home_id', '=', home.id)
      .executeTakeFirstOrThrow();
    const stakes = await h.db
      .selectFrom('app.stake')
      .select('id')
      .where('second_home_id', '=', home.id)
      .orderBy('allocation_position')
      .execute();
    return {
      homeId: home.id,
      acquisitionId: acquisition.id,
      formalizedAt: new Date(acquisition.formalized_at),
      stakes: stakes.map((stake) => stake.id),
    };
  } finally {
    h.clock.set(previous);
  }
}

/**
 * Fixture estrutural (dono do schema, `session_replication_role = replica`): sela um exercício fora do horizonte do
 * relógio real — o próximo ano bissexto —, com as mesmas noites canônicas e custódias raiz `spe_pool` do
 * `open_exercise`. As regras da W11 sob teste rodam depois, em transações normais e com o papel da aplicação.
 */
export async function sealByFixture(
  h: AcquisitionHarness,
  home: string,
  year: number,
): Promise<void> {
  const nights = civil.exerciseNights({
    exerciseYear: year,
    operationStartDate: `${year}-01-01`,
    timezone: TZ,
  });
  const client = new pg.Client({ connectionString: h.database.url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const operationId = await openOperation(client, 'open_exercise', null);
    for (const night of nights) {
      await client.query(
        `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at) VALUES ($1, $2, $3, $4)`,
        [home, night.stayDate, night.season, night.checkInAt],
      );
      await client.query(
        `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation)
         VALUES ($1, $2, $3, 'spe_pool', $4)`,
        [randomUUID(), home, night.stayDate, operationId],
      );
    }
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [operationId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Executor real (guard de sistema, banco como `luxtory_app`) com os handlers da W11. */
export function useRightRunner(h: AcquisitionHarness) {
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(h.db),
    guard: systemCommandGuard,
    clock: h.clock,
    limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
    log: h.log,
    registry: commandRegistry,
  });
  const sealing = createPostgresSealingStore();
  const useRights = createPostgresUseRightStore();
  const open = createOpenExerciseHandler({
    calendar: civil,
    useRightCalendar: rights,
    store: sealing,
    useRights,
    findFormalized: findFormalizedSecondHome,
    findUseRightFacts,
    openRoots: createRootCustodyOpener(),
  });
  const close = createCloseExerciseHandler({
    useRightCalendar: rights,
    useRights,
    lockSecondHome: sealing.lockSecondHome,
    findUseRightFacts,
  });
  return {
    step: (home: string, year: number, step: 'seal' | 'leap_day') =>
      executor.execute(open, {
        actor: { kind: 'system', job: 'open_exercise' },
        idempotencyKey: `open_exercise:${home}:${year}:${step}:${randomUUID()}`,
        correlationId: randomUUID(),
        input: { second_home_id: home, exercise_year: year, step },
      }),
    close: (home: string, year: number) =>
      executor.execute(close, {
        actor: { kind: 'system', job: 'close_exercise' },
        idempotencyKey: `close_exercise:${home}:${year}:${randomUUID()}`,
        correlationId: randomUUID(),
        input: { second_home_id: home, exercise_year: year },
      }),
  };
}

/** Varredura do outbox com os consumidores do sorteio e do Direito de Uso juntos, como em produção. */
export function outboxSweep(h: AcquisitionHarness) {
  const { beacon } = testBeacon();
  return () =>
    dispatchOutbox({
      store: createPostgresOutboxStore(h.db),
      consumers: new ConsumerRegistry<DatabaseTransaction>([
        ...initialDrawConsumers<DatabaseTransaction>({
          store: postgresInitialDrawStore,
          beacon: () => beacon,
          config: () => ({ transactionTimeoutMs: 1_000, beaconTimeoutMs: 500, leadSeconds: 1 }),
          clock: h.clock,
        }),
        ...buildUseRightConsumers<DatabaseTransaction>({
          clock: systemClock,
          useRightCalendar: rights,
          useRights: createPostgresUseRightStore(),
          lockSecondHome: createPostgresSealingStore().lockSecondHome,
          findUseRightFacts,
          enqueue: enqueueOutboxEvent,
          stakeHolders,
          notify: recordNotification,
        }),
      ]),
      clock: systemClock,
      batchSize: 50,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
}

/** Conclui o sorteio pela varredura completa: compromisso, espera da rodada e revelação. */
export async function completeDrawWithCalendar(h: AcquisitionHarness, acquisitionId: string) {
  const sweep = outboxSweep(h);
  await sweep();
  const { rows } = await h.database.pool.query<{ target_round: string }>(
    'SELECT target_round FROM app.initial_draw WHERE acquisition_id = $1',
    [acquisitionId],
  );
  await waitUntil(new Date(roundTime(Number(rows[0]!.target_round)).getTime() + 3_000));
  await sweep();
  return sweep;
}

/** Posições sorteadas (W9), na ordem de `allocation_position` das Ações. */
export async function drawnPositions(h: AcquisitionHarness, acquisitionId: string) {
  const { rows } = await h.database.pool.query<{ stake_id: string; position: number }>(
    `SELECT p.stake_id, p.position FROM app.initial_draw d
       JOIN app.initial_draw_position p ON p.draw_id = d.id
       JOIN app.stake s ON s.id = p.stake_id
      WHERE d.acquisition_id = $1 ORDER BY s.allocation_position`,
    [acquisitionId],
  );
  return rows.map((row) => ({ stakeId: row.stake_id, position: row.position }));
}

export interface LedgerRow {
  readonly stake_id: string;
  readonly exercise_year: number;
  readonly bucket: string;
  readonly movement: string;
  readonly source: string | null;
  readonly quantity: number;
  readonly effective_at: Date | null;
}

export async function ledger(h: AcquisitionHarness, home: string): Promise<readonly LedgerRow[]> {
  const { rows } = await h.database.pool.query<LedgerRow>(
    `SELECT stake_id, exercise_year, bucket, movement, source, quantity, effective_at
       FROM app.use_right_ledger WHERE second_home_id = $1
      ORDER BY exercise_year, movement, bucket, stake_id`,
    [home],
  );
  return rows;
}

export async function balances(h: AcquisitionHarness, home: string) {
  const { rows } = await h.database.pool.query<{
    stake_id: string;
    exercise_year: number;
    bucket: string;
    granted: number;
    consumed: number;
    expired: number;
    remaining: number;
  }>(
    `SELECT stake_id, exercise_year, bucket, granted, consumed, expired, remaining
       FROM app.use_right_balance WHERE second_home_id = $1 ORDER BY exercise_year, bucket, stake_id`,
    [home],
  );
  return rows;
}
