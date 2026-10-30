import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCloseExerciseJob } from '@/features/calendar/jobs';
import { leapDayBeneficiary, ordinaryOrder } from '@/features/calendar/domain/use-right';
import { createOpenExerciseHandler } from '@/features/calendar/application/open-exercise';
import { createPostgresSealingStore } from '@/features/calendar/infrastructure/postgres-sealing-store';
import { createPostgresUseRightStore } from '@/features/calendar/infrastructure/postgres-use-right-store';
import { createRootCustodyOpener } from '@/features/inventory';
import { findFormalizedSecondHome, findUseRightFacts } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemCommandGuard,
} from '@/features/platform';
import { waitForLockWaiter } from '../../support/platform-fixtures';
import { NEXT_YEAR, SEALING_YEAR, sealingHarness, type SealingHarness } from './sealing-support';
import {
  backdateAuthority,
  balances,
  civil,
  completeDrawWithCalendar,
  drawnPositions,
  formalizeCoOwnerAt,
  LEAP_AHEAD,
  ledger,
  outboxSweep,
  PAST_LEAP,
  rights,
  sealByFixture,
  TZ,
  useRightRunner,
} from './use-right-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });
const CONFIG = {
  2: { alta: 48, media: 128, la: 7, lm: 6 },
  4: { alta: 24, media: 64, la: 7, lm: 6 },
} as const;

describe('W11 — concessões, 29/02, janelas e expiração (PostgreSQL real)', () => {
  let h: SealingHarness;
  let runner: ReturnType<typeof useRightRunner>;

  beforeAll(async () => {
    h = await sealingHarness();
    await backdateAuthority(h);
    runner = useRightRunner(h);
  });
  afterAll(() => h.close());

  const startOf = (year: number) => `${year}-01-01`;
  const at = (year: number) => new Date(`${year}-01-01T12:00:00Z`);

  it('[INV-4][REQ-033][TECH-090] o job concede a configuração inteira no exercício seguinte, nunca no primeiro', async () => {
    const home = await formalizeCoOwnerAt(h, 4, startOf(SEALING_YEAR), at(SEALING_YEAR));
    const first = await h.runJob();
    expect(first.failed).toBe(0);
    const rows = await ledger(h, home.homeId);
    // Primeiro exercício: só as 2N concessões da formalização (W8). Seguinte: 2N da configuração (BR-108).
    const byYear = (year: number) => rows.filter((row) => row.exercise_year === year);
    expect(byYear(SEALING_YEAR)).toHaveLength(8);
    expect(byYear(NEXT_YEAR)).toHaveLength(8);
    for (const row of byYear(NEXT_YEAR)) {
      expect(row).toMatchObject({ movement: 'grant', source: 'configuration' });
      expect(row.quantity).toBe(row.bucket === 'alta' ? CONFIG[4].alta : CONFIG[4].media);
    }
    // Folga zero: N × limite + capacidade Luxtory = 103 / 262 em cada categoria.
    const sum = (bucket: string) =>
      byYear(NEXT_YEAR)
        .filter((row) => row.bucket === bucket)
        .reduce((total, row) => total + row.quantity, 0);
    expect(sum('alta') + CONFIG[4].la).toBe(103);
    expect(sum('media') + CONFIG[4].lm).toBe(262);
    expect(await balances(h, home.homeId)).toHaveLength(16);
    // Repetição: estado já completo → nenhuma linha nova.
    const again = await h.runJob();
    expect(again.failed).toBe(0);
    expect(await ledger(h, home.homeId)).toHaveLength(16);
  });

  it('[INV-4][TECH-110] exercício Co-Owner posterior ao primeiro não termina selado sem as concessões', async () => {
    const home = await formalizeCoOwnerAt(h, 2, startOf(SEALING_YEAR), at(SEALING_YEAR));
    const store = createPostgresUseRightStore();
    const broken = createOpenExerciseHandler({
      calendar: civil,
      useRightCalendar: rights,
      store: createPostgresSealingStore(),
      useRights: { ...store, insertGrant: () => Promise.resolve() },
      findFormalized: findFormalizedSecondHome,
      findUseRightFacts,
      openRoots: createRootCustodyOpener(),
    });
    const executor = createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard: systemCommandGuard,
      clock: h.clock,
      limits: { maxAttempts: 1, lockTimeoutMs: 5_000 },
      log: h.log,
      registry: commandRegistry,
    });
    await expect(
      executor.execute(broken, {
        actor: { kind: 'system', job: 'open_exercise' },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        input: { second_home_id: home.homeId, exercise_year: NEXT_YEAR, step: 'seal' },
      }),
    ).rejects.toEqual(constraint('use_right_exercise_grants'));
    const { rows } = await h.database.pool.query(
      'SELECT 1 FROM app.second_home_date WHERE second_home_id = $1 AND exercise_year = $2',
      [home.homeId, NEXT_YEAR],
    );
    expect(rows).toHaveLength(0);
  });

  it('[REQ-031][PD-004][REQ-032] sorteio pendente: o 29/02 espera; revelado, a lista é a do primeiro 29/02 e vale uma vez', async () => {
    const home = await formalizeCoOwnerAt(h, 4, startOf(LEAP_AHEAD), new Date());
    await sealByFixture(h, home.homeId, LEAP_AHEAD);
    // Antes da revelação ninguém sabe a Ação contemplada: passo não aplicável, sem efeito e sem falha permanente.
    await expect(runner.step(home.homeId, LEAP_AHEAD, 'leap_day')).resolves.toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
    await completeDrawWithCalendar(h, home.acquisitionId);
    const drawn = await drawnPositions(h, home.acquisitionId);
    const expected = leapDayBeneficiary({
      drawn,
      operationStartDate: startOf(LEAP_AHEAD),
      exerciseYear: LEAP_AHEAD,
    });
    await expect(runner.step(home.homeId, LEAP_AHEAD, 'leap_day')).resolves.toMatchObject({
      status: 'committed',
      result: { step: 'leap_day', stake_id: expected },
    });
    const leap = (await ledger(h, home.homeId)).filter((row) => row.bucket === 'leap');
    expect(leap).toEqual([
      expect.objectContaining({
        stake_id: expected,
        movement: 'grant',
        source: 'configuration',
        quantity: 1,
      }),
    ]);
    // Uma vez: a segunda tentativa não é aplicável e não duplica.
    await expect(runner.step(home.homeId, LEAP_AHEAD, 'leap_day')).resolves.toMatchObject({
      code: 'ERR_STATE_TRANSITION',
    });
    // Banco e TypeScript derivam a mesma lista por quatro ciclos (inclui anos comuns, que não têm 29/02).
    for (let year = LEAP_AHEAD; year <= LEAP_AHEAD + 64; year += 1) {
      const { rows } = await h.database.pool.query<{ stake: string | null }>(
        'SELECT app.leap_day_beneficiary($1, $2) AS stake',
        [home.homeId, year],
      );
      expect(rows[0]?.stake ?? null).toBe(
        leapDayBeneficiary({ drawn, operationStartDate: startOf(LEAP_AHEAD), exerciseYear: year }),
      );
    }
    // Direito ao 29/02 notificado na base (15/09 do ano anterior), não antes.
    const { rows: events } = await h.database.pool.query<{
      occurred_at: Date;
      available_at: Date;
      payload: Record<string, unknown>;
    }>(`SELECT occurred_at, available_at, payload FROM app.outbox WHERE dedup_key = $1`, [
      `calendar.leap_day_granted:${home.homeId}:${LEAP_AHEAD}`,
    ]);
    expect(events).toHaveLength(1);
    const base = rights.windowBase({
      exerciseYear: LEAP_AHEAD,
      formalizedAt: home.formalizedAt,
      timezone: TZ,
    });
    expect(events[0]!.available_at.getTime()).toBe(
      Math.max(base.getTime(), events[0]!.occurred_at.getTime()),
    );
    expect(events[0]!.payload).toEqual({
      second_home_id: home.homeId,
      stake_id: expected,
      exercise_year: LEAP_AHEAD,
      expires_at: rights.effectiveEnd('leap', LEAP_AHEAD, TZ).toISOString(),
    });
  });

  it('[REQ-032][D4] selado antes do sorteio: a revelação agenda uma janela por Ação, no instante canônico, sem duplicar', async () => {
    const home = await formalizeCoOwnerAt(h, 4, startOf(LEAP_AHEAD), new Date());
    await sealByFixture(h, home.homeId, LEAP_AHEAD);
    const sweep = await completeDrawWithCalendar(h, home.acquisitionId);
    await sweep();
    const drawn = await drawnPositions(h, home.acquisitionId);
    const order = ordinaryOrder(drawn, startOf(LEAP_AHEAD), LEAP_AHEAD);
    const { rows } = await h.database.pool.query<{
      dedup_key: string;
      occurred_at: Date;
      available_at: Date;
      payload: { position: number; stake_id: string };
    }>(
      `SELECT dedup_key, occurred_at, available_at, payload FROM app.outbox
        WHERE event_type = 'calendar.use_window_opened' AND payload->>'second_home_id' = $1 ORDER BY (payload->>'position')::int`,
      [home.homeId],
    );
    expect(rows.map((row) => row.payload.stake_id)).toEqual(order);
    for (const row of rows) {
      const opensAt = rights.windowOpensAt({
        exerciseYear: LEAP_AHEAD,
        position: row.payload.position,
        stakes: 4,
        formalizedAt: home.formalizedAt,
        timezone: TZ,
      });
      // Nunca antes do instante da emissão (CHECK do outbox); janela futura fica agendada.
      expect(row.available_at.getTime()).toBe(
        Math.max(opensAt.getTime(), row.occurred_at.getTime()),
      );
    }
  });

  it('[REQ-032][D4] sorteio antes da selagem: o passo seal agenda as janelas; entrega só das já abertas, aos titulares vigentes', async () => {
    const home = await formalizeCoOwnerAt(h, 2, startOf(NEXT_YEAR), new Date());
    await completeDrawWithCalendar(h, home.acquisitionId);
    const job = await h.runJob();
    expect(job.failed).toBe(0);
    const sweep = outboxSweep(h);
    await sweep();
    const { rows: events } = await h.database.pool.query<{
      available_at: Date;
      delivered_at: Date | null;
      payload: { stake_id: string; position: number };
    }>(
      `SELECT available_at, delivered_at, payload FROM app.outbox
        WHERE event_type = 'calendar.use_window_opened' AND payload->>'second_home_id' = $1`,
      [home.homeId],
    );
    expect(events).toHaveLength(2);
    const now = Date.now();
    const { rows: notes } = await h.database.pool.query<{
      kind: string;
      data: Record<string, unknown>;
      recipient_party_id: string;
    }>(
      `SELECT n.kind, n.data, n.recipient_party_id FROM app.notification n
         JOIN app.outbox o ON o.id = n.event_id
        WHERE o.event_type = 'calendar.use_window_opened' AND o.payload->>'second_home_id' = $1`,
      [home.homeId],
    );
    const open = events.filter((event) => event.available_at.getTime() <= now);
    expect(notes).toHaveLength(open.length);
    for (const event of events)
      expect(event.delivered_at !== null).toBe(event.available_at.getTime() <= now);
    for (const note of notes) {
      expect(note.kind).toBe('calendar.use_window_opened');
      // Só ids e números: nenhum dado pessoal no payload da notificação.
      expect(Object.keys(note.data).sort()).toEqual([
        'exercise_year',
        'position',
        'second_home_id',
      ]);
    }
    // Repetir a varredura e o job não duplica nada (dedup_key e recibo do consumidor).
    await sweep();
    await h.runJob();
    const { rows: again } = await h.database.pool.query(
      `SELECT 1 FROM app.outbox WHERE event_type = 'calendar.use_window_opened' AND payload->>'second_home_id' = $1`,
      [home.homeId],
    );
    expect(again).toHaveLength(2);
  });

  it('[INV-5][PD-004][TECH-090] close_exercise recupera expiração atrasada: exatamente o restante, no fim canônico, uma vez', async () => {
    const past = SEALING_YEAR - 2;
    const home = await formalizeCoOwnerAt(h, 2, startOf(past), at(past));
    const close = createCloseExerciseJob({
      log: h.jobLog,
      database: h.db,
      clock: h.clock,
      source: { COMMAND_MAX_ATTEMPTS: '1', COMMAND_LOCK_TIMEOUT_MS: '10000' },
    });
    const result = await close({ correlationId: randomUUID() });
    expect(result.failed).toBe(0);
    const expired = (await ledger(h, home.homeId)).filter((row) => row.movement === 'expire');
    expect(expired).toHaveLength(4);
    for (const row of expired) {
      expect(row.quantity).toBe(row.bucket === 'alta' ? CONFIG[2].alta : CONFIG[2].media);
      // O instante canônico (00:00 de 01/01 seguinte em São Paulo), nunca o da execução atrasada.
      expect(row.effective_at).toEqual(rights.effectiveEnd('media', past, TZ));
    }
    expect((await balances(h, home.homeId)).every((balance) => balance.remaining === 0)).toBe(true);
    // Saldo zero: nada a expirar de novo, nem em execuções seguintes.
    await close({ correlationId: randomUUID() });
    expect((await ledger(h, home.homeId)).filter((row) => row.movement === 'expire')).toHaveLength(
      4,
    );
    await expect(runner.close(home.homeId, past)).resolves.toMatchObject({
      code: 'ERR_STATE_TRANSITION',
    });
  });

  it('[PD-004][EC-4][INV-5] o 29/02 vence com a data e expira sozinho, sem transporte nem Inventário', async () => {
    const home = await formalizeCoOwnerAt(h, 2, startOf(PAST_LEAP), at(PAST_LEAP));
    await completeDrawWithCalendar(h, home.acquisitionId);
    const drawn = await drawnPositions(h, home.acquisitionId);
    const stake = leapDayBeneficiary({
      drawn,
      operationStartDate: startOf(PAST_LEAP),
      exerciseYear: PAST_LEAP,
    })!;
    // Fixture do direito concedido a tempo (o banco não aceita mais concedê-lo: o 29/02 já venceu).
    const client = new pg.Client({ connectionString: h.database.url });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      const op = randomUUID();
      await client.query(
        `INSERT INTO app.operation (id, command, actor_user_id, role, idempotency_key, correlation_id, authorization_ref, state, created_at, updated_at)
         VALUES ($1, 'open_exercise', NULL, 'system', $2, $3, 'test:leap', 'committed', now(), now())`,
        [op, `test:${op}`, randomUUID()],
      );
      await client.query(
        `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement, source, quantity, operation_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'leap', 'grant', 'configuration', 1, $6, now())`,
        [randomUUID(), home.homeId, home.acquisitionId, stake, PAST_LEAP, op],
      );
      await client.query(
        `INSERT INTO app.use_right_balance (second_home_id, stake_id, exercise_year, bucket, granted) VALUES ($1, $2, $3, 'leap', 1)`,
        [home.homeId, stake, PAST_LEAP],
      );
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
    await expect(runner.close(home.homeId, PAST_LEAP)).resolves.toMatchObject({
      status: 'committed',
    });
    const leap = (await ledger(h, home.homeId)).filter(
      (row) => row.bucket === 'leap' && row.movement === 'expire',
    );
    expect(leap).toEqual([
      expect.objectContaining({
        stake_id: stake,
        quantity: 1,
        effective_at: rights.effectiveEnd('leap', PAST_LEAP, TZ),
      }),
    ]);
    // Sem transporte: nenhum saldo leap em outro exercício nem para outra Ação.
    const others = (await balances(h, home.homeId)).filter((balance) => balance.bucket === 'leap');
    expect(others).toEqual([
      expect.objectContaining({ stake_id: stake, exercise_year: PAST_LEAP, remaining: 0 }),
    ]);
  });

  it('[TECH-053][TECH-090] passos e expirações concorrentes: exatamente um efeito; o consumidor espera a trava da Second Home', async () => {
    const home = await formalizeCoOwnerAt(h, 4, startOf(LEAP_AHEAD), new Date());
    await sealByFixture(h, home.homeId, LEAP_AHEAD);
    await completeDrawWithCalendar(h, home.acquisitionId);
    const [a, b] = await Promise.all([
      runner.step(home.homeId, LEAP_AHEAD, 'leap_day'),
      runner.step(home.homeId, LEAP_AHEAD, 'leap_day'),
    ]);
    expect([a.status, b.status].sort()).toEqual(['committed', 'rejected']);
    expect((await ledger(h, home.homeId)).filter((row) => row.bucket === 'leap')).toHaveLength(1);

    const past = SEALING_YEAR - 2;
    const old = await formalizeCoOwnerAt(h, 2, startOf(past), at(past));
    const [c, d] = await Promise.all([
      runner.close(old.homeId, past),
      runner.close(old.homeId, past),
    ]);
    expect([c.status, d.status].sort()).toEqual(['committed', 'rejected']);
    expect((await ledger(h, old.homeId)).filter((row) => row.movement === 'expire')).toHaveLength(
      4,
    );

    // O consumidor da revelação serializa com a selagem pela mesma trava consultiva.
    const late = await formalizeCoOwnerAt(h, 2, startOf(LEAP_AHEAD), new Date());
    await sealByFixture(h, late.homeId, LEAP_AHEAD);
    const holder = new pg.Client({ connectionString: h.database.url });
    await holder.connect();
    try {
      const sweep = outboxSweep(h);
      await sweep();
      const { rows } = await h.database.pool.query<{ target_round: string }>(
        'SELECT target_round FROM app.initial_draw WHERE acquisition_id = $1',
        [late.acquisitionId],
      );
      const { roundTime } = await import('@/features/ownership/domain/initial-draw');
      const { waitUntil } = await import('../ownership/initial-draw-support');
      await waitUntil(new Date(roundTime(Number(rows[0]!.target_round)).getTime() + 3_000));
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `app.second_home:${late.homeId}`,
      ]);
      const pending = sweep();
      await waitForLockWaiter(h.database.pool);
      await holder.query('COMMIT');
      await pending;
    } finally {
      await holder.end();
    }
    const { rows: windows } = await h.database.pool.query(
      `SELECT 1 FROM app.outbox WHERE event_type = 'calendar.use_window_opened' AND payload->>'second_home_id' = $1`,
      [late.homeId],
    );
    expect(windows).toHaveLength(2);
  });
});
