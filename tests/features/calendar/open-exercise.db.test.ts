import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import { createOpenExerciseHandler } from '@/features/calendar/application/open-exercise';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { createPostgresSealingStore } from '@/features/calendar/infrastructure/postgres-sealing-store';
import { createPostgresUseRightStore } from '@/features/calendar/infrastructure/postgres-use-right-store';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import { createRootCustodyOpener } from '@/features/inventory';
import { findFormalizedSecondHome, findUseRightFacts } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  CommandRegistry,
  systemCommandGuard,
  type CommandHandler,
  type DatabaseTransaction,
} from '@/features/platform';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import {
  createDatabase,
  parseDatabaseUrl,
} from '@/features/platform/infrastructure/database/connection';
import { allowAll, waitForLockWaiter } from '../../support/platform-fixtures';
import {
  asOwner,
  nextYear,
  nightsIn,
  NEXT_YEAR,
  SEALING_YEAR,
  sealingHarness,
  type SealingHarness,
} from './sealing-support';

const Y = SEALING_YEAR;
const N = NEXT_YEAR;
const full = (year: number, holder: string) => ({
  exercise_year: year,
  nights: nightsIn(year),
  alta: 103,
  media: 262,
  leap: nightsIn(year) - 365,
  roots: nightsIn(year),
  holders: [holder],
});
const sealedBoth = [
  [Y, nightsIn(Y), nightsIn(Y)],
  [N, nightsIn(N), nightsIn(N)],
];

async function exerciseFacts(h: SealingHarness, home: string) {
  const { rows } = await h.database.pool.query<{
    exercise_year: number;
    nights: number;
    alta: number;
    media: number;
    leap: number;
    roots: number;
    holders: string[];
  }>(
    `SELECT d.exercise_year, count(*)::int AS nights,
            count(*) FILTER (WHERE d.season = 'alta')::int AS alta,
            count(*) FILTER (WHERE d.season = 'media' AND NOT d.is_leap_day)::int AS media,
            count(*) FILTER (WHERE d.is_leap_day)::int AS leap,
            count(c.id)::int AS roots, array_agg(DISTINCT c.holder_kind) AS holders
       FROM app.second_home_date d
       JOIN app.date_custody c ON c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date
        AND c.closed_at IS NULL AND c.parent_custody_id IS NULL
      WHERE d.second_home_id = $1 GROUP BY d.exercise_year ORDER BY d.exercise_year`,
    [home],
  );
  return rows;
}

async function lockSecondHome(h: SealingHarness, home: string) {
  const holder = new pg.Client({ connectionString: h.database.url });
  await holder.connect();
  await holder.query('BEGIN');
  await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `app.second_home:${home}`,
  ]);
  return {
    async release() {
      await holder.query('ROLLBACK');
      await holder.end();
    },
  };
}

describe('open_exercise com PostgreSQL real (W10)', () => {
  let h: SealingHarness;
  beforeAll(async () => {
    h = await sealingHarness();
  });
  afterAll(async () => h.close());

  it('[REQ-024] [TECH-021] Second Home Owner formalizada: corrente e seguinte selados com a custódia owner', async () => {
    const home = await h.formalizeOwner();
    const result = await h.runJob();
    expect(result).toMatchObject({ due: 2, sealed: 2, failed: 0, deferred: 0 });
    expect(await exerciseFacts(h, home)).toEqual([full(Y, 'owner'), full(N, 'owner')]);
    const { rows } = await h.database.pool.query<{ command: string; role: string; state: string }>(
      `SELECT DISTINCT o.command, o.role, o.state FROM app.date_custody c
         JOIN app.operation o ON o.id = c.opened_by_operation WHERE c.second_home_id = $1`,
      [home],
    );
    expect(rows).toEqual([{ command: 'open_exercise', role: 'system', state: 'committed' }]);
    const audit = await h.database.pool.query<{ object_id: string; role: string }>(
      `SELECT object_id, role FROM app.audit_log WHERE object_type = 'second_home_exercise'
        AND object_id LIKE $1 ORDER BY object_id`,
      [`${home}:%`],
    );
    expect(audit.rows).toEqual([
      { object_id: `${home}:${Y}`, role: 'system' },
      { object_id: `${home}:${N}`, role: 'system' },
    ]);
  });

  it('[TECH-021] Second Home Co-Owner: custódia raiz spe_pool; capacidade não reservada fica coletiva da SPE', async () => {
    const { homeId } = await h.formalizeCoOwner();
    await h.runJob();
    const facts = await exerciseFacts(h, homeId);
    // Data-base em 01/01 do ano seguinte: só esse exercício é devido.
    expect(facts.map((row) => [row.exercise_year, row.roots, row.holders])).toEqual([
      [N, nightsIn(N), ['spe_pool']],
    ]);
  });

  it('[TECH-041] exercício parcial: da data-base a 31/12; o seguinte é completo', async () => {
    const home = await h.formalizeOwner(`${Y}-03-01`);
    await h.runJob();
    const facts = await exerciseFacts(h, home);
    expect(facts.map((row) => [row.exercise_year, row.nights])).toEqual([
      [Y, 306],
      [N, nightsIn(N)],
    ]);
    const first = await h.database.pool.query<{ first: string }>(
      `SELECT min(stay_date)::text AS first FROM app.second_home_date WHERE second_home_id = $1`,
      [home],
    );
    expect(first.rows[0]?.first).toBe(`${Y}-03-01`);
  });

  it('[TECH-090] repetição e execução duplicada não selam de novo nem criam operação', async () => {
    const before = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.operation WHERE command = 'open_exercise'`,
    );
    const again = await h.runJob();
    expect(again).toMatchObject({ sealed: 0, failed: 0 });
    expect(again.already_sealed).toBe(again.due);
    const after = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.operation WHERE command = 'open_exercise'`,
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });
});

describe('open_exercise: concorrência e recuperação (W10)', () => {
  let h: SealingHarness;
  beforeAll(async () => {
    h = await sealingHarness();
  });
  afterAll(async () => h.close());

  it('[TECH-090] [TECH-053] duas execuções simultâneas: uma única selagem e uma custódia ativa por noite', async () => {
    const home = await h.formalizeOwner();
    const [a, b] = await Promise.all([h.runJob('concurrent-a'), h.runJob('concurrent-b')]);
    expect((a.sealed ?? 0) + (b.sealed ?? 0)).toBe(2);
    expect((a.failed ?? 0) + (b.failed ?? 0)).toBe(0);
    const facts = await exerciseFacts(h, home);
    expect(facts.map((row) => [row.exercise_year, row.nights, row.roots])).toEqual(sealedBoth);
    const committed = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.operation WHERE command = 'open_exercise' AND state = 'committed'
         AND second_home_id = $1`,
      [home],
    );
    expect(committed.rows[0]?.n).toBe(2);
  });

  it('[TECH-090] [TECH-101] falha → alerta à staff; depois da correção a execução seguinte sela', async () => {
    const home = await h.formalizeOwner();
    // Defeito simulado pelo dono do schema: a selagem desta Second Home falha.
    await h.database.pool.query(`
      CREATE FUNCTION app.test_defect() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.second_home_id = '${home}' THEN RAISE EXCEPTION 'simulated defect'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_defect BEFORE INSERT ON app.second_home_date
        FOR EACH ROW EXECUTE FUNCTION app.test_defect();`);
    const failing = await h.runJob('defect-run');
    expect(failing).toMatchObject({ sealed: 0, failed: 2 });
    expect(await exerciseFacts(h, home)).toEqual([]);
    const notice = h.staff.sent.at(-1)!;
    expect(notice).toMatchObject({
      kind: 'open_exercise_failure',
      scope: 'item',
      correlationId: 'defect-run',
    });
    expect(JSON.stringify(notice.details)).not.toMatch(/@|cpf|cnpj|nome|name/i);
    await h.database.pool.query(
      'DROP TRIGGER test_defect ON app.second_home_date; DROP FUNCTION app.test_defect()',
    );
    const fixed = await h.runJob('fixed-run');
    expect(fixed).toMatchObject({ sealed: 2, failed: 0 });
  });

  it('[TECH-090] queda da conexão no meio da selagem: nada parcial, e a retomada completa', async () => {
    const home = await h.formalizeOwner();
    const lock = await lockSecondHome(h, home);
    const running = h.runJob('crash-run');
    await waitForLockWaiter(h.database.pool);
    await h.database.pool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
    );
    await lock.release();
    const crashed = await running;
    expect(crashed.failed).toBeGreaterThanOrEqual(1);
    const resumed = await h.runJob('resume-run');
    expect(resumed.failed).toBe(0);
    expect(
      (await exerciseFacts(h, home)).map((row) => [row.exercise_year, row.nights, row.roots]),
    ).toEqual(sealedBoth);
  });

  it('[TECH-053] timeout de lock é transitório: o item falha sem efeito e a próxima execução sela', async () => {
    const home = await h.formalizeOwner();
    const lock = await lockSecondHome(h, home);
    const timedOut = await h.job({ source: { COMMAND_LOCK_TIMEOUT_MS: '200' } })({
      correlationId: 'timeout-run',
    });
    await lock.release();
    expect(timedOut).toMatchObject({ sealed: 0, failed: 2 });
    expect(h.staff.sent.at(-1)?.details).toMatchObject({
      items: [
        { second_home_id: home, exercise_year: Y, reason: 'ERR_UNAVAILABLE' },
        { second_home_id: home, exercise_year: N, reason: 'ERR_UNAVAILABLE' },
      ],
    });
    expect(await h.runJob('after-timeout')).toMatchObject({ sealed: 2, failed: 0 });
  });

  it('[TECH-090] orçamento esgotado adia sem selar; a execução seguinte continua', async () => {
    const home = await h.formalizeOwner();
    const deferred = await h.job({ timeBudgetMs: 0 })({ correlationId: 'budget-run' });
    expect(deferred).toMatchObject({ sealed: 0, deferred: 2, failed: 0 });
    expect(await exerciseFacts(h, home)).toEqual([]);
    expect(await h.runJob('after-budget')).toMatchObject({ sealed: 2, deferred: 0 });
  });
});

describe('recusas pelo executor (W10) [TECH-056]', () => {
  let h: SealingHarness;
  let home: string;
  beforeAll(async () => {
    h = await sealingHarness();
    home = await h.formalizeOwner();
    await h.runJob();
  });
  afterAll(async () => h.close());

  const registry = new CommandRegistry([
    {
      name: 'test_inventory_write',
      module: 'inventory',
      authority: 'admin',
      membership: 'not_applicable',
      critical: false,
    },
  ]);

  async function attempt(statements: (operationId: string) => readonly string[]) {
    const db = createDatabase(parseDatabaseUrl(h.database.url));
    try {
      const executor = createCommandExecutor({
        store: createPostgresCommandStore(db),
        guard: allowAll,
        clock: h.clock,
        limits: { maxAttempts: 1, lockTimeoutMs: 5_000 },
        log: h.log,
        registry,
      });
      const handler: CommandHandler<Record<string, never>, { ok: boolean }, DatabaseTransaction> = {
        command: 'test_inventory_write',
        input: (await import('zod')).z.strictObject({}),
        async execute({ tx, operationId, audit }) {
          for (const statement of statements(operationId)) await sql.raw(statement).execute(tx);
          audit({ objectType: 'test', objectId: 'inventory', before: null, after: null });
          return { ok: true };
        },
      };
      return await executor.execute(handler, {
        actor: h.actor,
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        input: {},
      });
    } finally {
      await db.destroy();
    }
  }

  const custodyOf = (stayDate: string) =>
    `(SELECT id FROM app.date_custody WHERE second_home_id = '${home}' AND stay_date = '${stayDate}' AND closed_at IS NULL)`;
  const occupancy = (operationId: string, stayDate: string, channel: string) =>
    `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, opened_by_operation)
     VALUES ('${randomUUID()}', '${home}', '${stayDate}', '${randomUUID()}', '${channel}', ${custodyOf(stayDate)}, '${operationId}')`;

  it('[TECH-090] selagem única pelo estado: já selado, anterior à data-base ou sem formalização → ERR_STATE_TRANSITION', async () => {
    const executor = createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard: systemCommandGuard,
      clock: h.clock,
      limits: { maxAttempts: 1, lockTimeoutMs: 5_000 },
      log: h.log,
      registry: commandRegistry,
    });
    const handler = createOpenExerciseHandler({
      calendar: createCivilCalendar(),
      useRightCalendar: createUseRightCalendar(temporalCivilTime),
      store: createPostgresSealingStore(),
      useRights: createPostgresUseRightStore(),
      findFormalized: findFormalizedSecondHome,
      findUseRightFacts,
      openRoots: createRootCustodyOpener(),
    });
    const seal = (secondHomeId: string, exerciseYear: number) =>
      executor.execute(handler, {
        actor: { kind: 'system', job: 'open_exercise' },
        idempotencyKey: `open_exercise:${secondHomeId}:${exerciseYear}:${randomUUID()}`,
        correlationId: randomUUID(),
        input: { second_home_id: secondHomeId, exercise_year: exerciseYear },
      });
    const nights = async () =>
      (
        await h.database.pool.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM app.second_home_date',
        )
      ).rows[0]?.n;
    const before = await nights();
    const { home: loose } = await h.root();
    for (const [secondHomeId, year] of [
      [home, Y],
      [home, Y - 1],
      [loose.id, Y],
    ] as const)
      await expect(seal(secondHomeId, year)).resolves.toMatchObject({
        status: 'rejected',
        code: 'ERR_STATE_TRANSITION',
      });
    expect(await nights()).toBe(before);
    // Um usuário nunca executa o command de sistema.
    await expect(
      executor.execute(handler, {
        actor: h.actor,
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        input: { second_home_id: home, exercise_year: N },
      }),
    ).resolves.toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
  });

  it('[INV-2] par ocupação/custódia fora da matriz falha com ERR_CAPACITY_UNAVAILABLE', async () => {
    await expect(
      attempt((op) => [occupancy(op, nextYear('05-05'), 'luxtory_use')]),
    ).resolves.toMatchObject({
      status: 'rejected',
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
  });

  it('[TECH-056] segunda ocupação ativa da noite falha com ERR_BOOKING_CONFLICT (uq_occupancy_active)', async () => {
    await expect(
      attempt((op) => [
        occupancy(op, nextYear('05-06'), 'own_use'),
        occupancy(op, nextYear('05-06'), 'rental_external'),
      ]),
    ).resolves.toMatchObject({ status: 'rejected', code: 'ERR_BOOKING_CONFLICT' });
  });

  it('[TECH-110] noite selada sem custódia ativa falha no COMMIT com ERR_CAPACITY_UNAVAILABLE', async () => {
    await expect(
      attempt((op) => [
        `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = '${op}'
          WHERE second_home_id = '${home}' AND stay_date = '${nextYear('05-07')}' AND closed_at IS NULL`,
      ]),
    ).resolves.toMatchObject({ status: 'rejected', code: 'ERR_CAPACITY_UNAVAILABLE' });
  });

  it('[TECH-110] noite não selada: custódia recusada com ERR_CAPACITY_UNAVAILABLE (operação segura)', async () => {
    // Mesmo com a operação de sistema que sela, sem a noite selada não há custódia (FK custody_night_sealed).
    const refused = asOwner(
      h,
      async (client, op) => {
        await client.query(
          `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation)
           VALUES ($1, $2, $3, 'owner', $4)`,
          [randomUUID(), home, `${N + 2}-01-01`, op],
        );
      },
      'open_exercise',
      null,
    );
    await expect(refused).rejects.toMatchObject({ constraint: 'custody_night_sealed' });
    expect(rejectionForConstraint('custody_night_sealed')).toBe('ERR_CAPACITY_UNAVAILABLE');
  });
});
