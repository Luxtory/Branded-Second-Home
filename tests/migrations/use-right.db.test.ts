import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  firstLeapExercise,
  isLeapYear,
  leapDayBeneficiary,
  leapYearsBetween,
  ordinaryPosition,
} from '@/features/calendar/domain/use-right';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import {
  NEXT_YEAR,
  SEALING_YEAR,
  openOperation,
  sealingHarness,
  type SealingHarness,
} from '../features/calendar/sealing-support';
import {
  backdateAuthority,
  balances,
  civil,
  completeDrawWithCalendar,
  drawnPositions,
  formalizeCoOwnerAt,
  LEAP_AHEAD,
  PAST_LEAP,
  rights,
  sealByFixture,
  TZ,
  useRightRunner,
  type CoOwnerHome,
} from '../features/calendar/use-right-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });

interface Movement {
  readonly home: CoOwnerHome;
  readonly stake: string;
  readonly year: number;
  readonly bucket: 'alta' | 'media' | 'leap';
  readonly movement: 'grant' | 'consume' | 'restore' | 'expire' | 'correction';
  readonly source?: string | null;
  readonly quantity: number;
  readonly stayDate?: string | null;
  readonly refersTo?: string | null;
  readonly operationId?: string;
}

async function insertMovement(client: pg.Client, operationId: string, m: Movement): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
       source, quantity, stay_date, refers_to_id, effective_at, operation_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())`,
    [
      id,
      m.home.homeId,
      m.home.acquisitionId,
      m.stake,
      m.year,
      m.bucket,
      m.movement,
      m.source ?? null,
      m.quantity,
      m.stayDate ?? null,
      m.refersTo ?? null,
      m.movement === 'expire' ? new Date() : null,
      m.operationId ?? operationId,
    ],
  );
  return id;
}

/** Transação com a operação `pending` do próprio papel (como o executor), marcada `committed` antes do COMMIT. */
async function inTransaction<T>(
  url: string,
  command: string,
  work: (client: pg.Client, operationId: string) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const operationId = await openOperation(client, command, null);
    const result = await work(client, operationId);
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [operationId]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

describe('W11 — ledger do Direito de Uso: banco, privilégios reais e estrutura', () => {
  let h: SealingHarness;
  let runner: ReturnType<typeof useRightRunner>;
  /** Primeiro exercício no corrente; o seguinte selado com as concessões da configuração (N = 4). */
  let current: CoOwnerHome;
  /** Primeiro exercício no seguinte (N = 10): noites futuras seladas para os testes estruturais de consumo. */
  let future: CoOwnerHome;
  /** Próximo ano bissexto selado por fixture, sorteio revelado e 29/02 concedido (N = 4). */
  let leap: CoOwnerHome;
  let leapStake: string;
  /** Último ano bissexto (encerrado), sorteio revelado e o 29/02 selado por fixture (N = 2). */
  let past: CoOwnerHome;
  let owner: string;

  const app = <T>(command: string, work: (client: pg.Client, op: string) => Promise<T>) =>
    inTransaction(h.database.appUrl, command, work);
  const asOwner = <T>(command: string, work: (client: pg.Client, op: string) => Promise<T>) =>
    inTransaction(h.database.url, command, work);

  beforeAll(async () => {
    h = await sealingHarness();
    await backdateAuthority(h);
    runner = useRightRunner(h);
    current = await formalizeCoOwnerAt(h, 4, `${SEALING_YEAR}-01-01`, new Date(`${SEALING_YEAR}-01-01T12:00:00Z`));
    future = await formalizeCoOwnerAt(h, 10, `${NEXT_YEAR}-01-01`, new Date());
    owner = await h.formalizeOwner(`${NEXT_YEAR}-01-01`);
    const job = await h.runJob();
    if (job.failed !== 0) throw new Error('open_exercise fixture failed');
    leap = await formalizeCoOwnerAt(h, 4, `${LEAP_AHEAD}-01-01`, new Date());
    await sealByFixture(h, leap.homeId, LEAP_AHEAD);
    await completeDrawWithCalendar(h, leap.acquisitionId);
    const granted = await runner.step(leap.homeId, LEAP_AHEAD, 'leap_day');
    if (granted.status !== 'committed') throw new Error('leap day fixture failed');
    leapStake = (granted.result as { stake_id: string }).stake_id;
    past = await formalizeCoOwnerAt(h, 2, `${PAST_LEAP}-01-01`, new Date(`${PAST_LEAP}-01-01T12:00:00Z`));
    await completeDrawWithCalendar(h, past.acquisitionId);
    // Só a noite do 29/02 encerrado, com a custódia raiz (estrutura fora do horizonte de selagem).
    const client = new pg.Client({ connectionString: h.database.url });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      const op = await openOperation(client, 'open_exercise', null);
      const date = `${PAST_LEAP}-02-29`;
      await client.query(
        `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at) VALUES ($1, $2, 'media', $3)`,
        [past.homeId, date, civil.checkInAt(date, TZ)],
      );
      await client.query(
        `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation)
         VALUES ($1, $2, $3, 'spe_pool', $4)`,
        [randomUUID(), past.homeId, date, op],
      );
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
    const closed = await runner.close(past.homeId, PAST_LEAP);
    if (closed.status !== 'committed') throw new Error('close_exercise fixture failed');
  }, 120_000);
  afterAll(() => h.close());

  describe('TypeScript e SQL derivam o mesmo calendário do Direito de Uso', () => {
    it('[REQ-031][TECH-110] anos bissextos, contagem e primeiro 29/02 da operação (1600–2800)', async () => {
      const years: number[] = [];
      for (let year = 1600; year <= 2800; year += 7) years.push(year);
      const { rows } = await h.database.pool.query<{ y: number; leap: boolean; between: number; first: number }>(
        `SELECT y, app.is_leap_year(y) AS leap, app.leap_years_between(y, y + 401) AS between,
                app.first_leap_exercise(make_date(y, 3, 1)) AS first
           FROM unnest($1::int[]) AS y`,
        [years],
      );
      for (const row of rows) {
        expect(row.leap).toBe(isLeapYear(row.y));
        expect(row.between).toBe(leapYearsBetween(row.y, row.y + 401));
        expect(row.first).toBe(firstLeapExercise(`${row.y}-03-01`));
      }
      const edges = ['2028-02-29', '2028-02-28', '2096-03-01', '2196-03-01', '2296-03-01', '2397-05-01'];
      for (const date of edges) {
        const { rows: one } = await h.database.pool.query<{ first: number }>(
          'SELECT app.first_leap_exercise($1::date) AS first',
          [date],
        );
        expect(one[0]!.first).toBe(firstLeapExercise(date));
      }
    });

    it('[REQ-032][TECH-110] posição ordinária com módulo não negativo, N = 2, 4, 8 e 10, por mais de um ciclo', async () => {
      const cases: [number, number, number][] = [];
      for (const n of [2, 4, 8, 10]) {
        for (let p = 1; p <= n; p += 1) for (let k = 0; k <= 3 * n; k += 1) cases.push([p, n, k]);
      }
      const { rows } = await h.database.pool.query<{ p: number; n: number; k: number; position: number }>(
        `SELECT c[1] AS p, c[2] AS n, c[3] AS k, app.ordinary_position(c[1], c[2], 2027, 2027 + c[3]) AS position
           FROM (SELECT ARRAY[(x->>0)::int, (x->>1)::int, (x->>2)::int] AS c FROM jsonb_array_elements($1::jsonb) x) s`,
        [JSON.stringify(cases)],
      );
      for (const row of rows) {
        expect(row.position).toBe(
          ordinaryPosition({ initialPosition: row.p, stakes: row.n, operationStartDate: '2027-01-01', exerciseYear: 2027 + row.k }),
        );
      }
    });

    it('[PD-004][INV-5] fim efetivo no fuso: 00:00 de 01/03 (29/02) e 00:00 de 01/01 seguinte, nas viradas de ano', async () => {
      for (const zone of ['America/Sao_Paulo', 'America/Noronha', 'America/Manaus', 'America/Rio_Branco', 'UTC']) {
        for (const year of [2024, 2027, 2028, 2096, 2100, 2400]) {
          const { rows } = await h.database.pool.query<{ ordinary: Date; leap: Date | null }>(
            `SELECT app.use_right_effective_end('alta', $1, $2) AS ordinary, app.use_right_effective_end('leap', $1, $2) AS leap`,
            [year, zone],
          );
          expect(rows[0]!.ordinary).toEqual(rights.effectiveEnd('alta', year, zone));
          expect(rows[0]!.leap).toEqual(isLeapYear(year) ? rights.effectiveEnd('leap', year, zone) : null);
        }
      }
    });
  });

  describe('papel da aplicação (luxtory_app) com operação forjada: só o canônico', () => {
    const grant = (home: CoOwnerHome, year: number, bucket: 'alta' | 'media', quantity: number, source = 'configuration') =>
      ({ home, stake: home.stakes[0]!, year, bucket, movement: 'grant', source, quantity }) as const;

    it('[INV-4][TECH-026] concessão só com fonte, quantidade, Ação, exercício, categoria e operação canônicos', async () => {
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, grant(current, NEXT_YEAR, 'alta', 25)))).rejects.toEqual(
        constraint('use_right_grant_quantity'),
      );
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, grant(current, NEXT_YEAR, 'alta', 24)))).rejects.toEqual(
        constraint('conflict_use_right_grant'),
      );
      await expect(
        app('open_exercise', (c, op) => insertMovement(c, op, grant(current, NEXT_YEAR + 1, 'alta', 24))),
      ).rejects.toEqual(constraint('use_right_grant_exercise_sealed'));
      await expect(
        app('open_exercise', (c, op) => insertMovement(c, op, grant(current, SEALING_YEAR, 'alta', 24))),
      ).rejects.toEqual(constraint('use_right_grant_source'));
      await expect(
        app('open_exercise', (c, op) => insertMovement(c, op, grant(current, NEXT_YEAR, 'alta', 24, 'initial_allocation'))),
      ).rejects.toEqual(constraint('use_right_grant_source'));
      await expect(
        app('formalize_acquisition', (c, op) => insertMovement(c, op, grant(current, NEXT_YEAR, 'alta', 24))),
      ).rejects.toEqual(constraint('use_right_grant_operation'));
      // Operação de outra transação (já commitada): consistência, não autenticidade (ADR-0024 §3).
      const committed = await app('open_exercise', (_c, op) => Promise.resolve(op));
      await expect(
        app('open_exercise', (c, op) => insertMovement(c, op, { ...grant(current, NEXT_YEAR, 'alta', 24), operationId: committed })),
      ).rejects.toEqual(constraint('inventory_operation_provenance'));
    });

    it('[TECH-027][REQ-031] o 29/02 só para a Ação contemplada, uma vez, com a noite selada, o sorteio revelado e antes do vencimento', async () => {
      const other = leap.stakes.find((stake) => stake !== leapStake)!;
      const leapGrant = (home: CoOwnerHome, stake: string, year: number, quantity = 1) =>
        ({ home, stake, year, bucket: 'leap', movement: 'grant', source: 'configuration', quantity }) as const;
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, leapGrant(leap, other, LEAP_AHEAD)))).rejects.toEqual(
        constraint('use_right_leap_beneficiary'),
      );
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, leapGrant(leap, leapStake, LEAP_AHEAD)))).rejects.toEqual(
        constraint('conflict_use_right_grant'),
      );
      // Segunda camada: mesmo sem gatilhos, um único 29/02 por Second Home e ano (índice parcial).
      await expect(
        asOwner('open_exercise', async (c, op) => {
          await c.query('SET LOCAL session_replication_role = replica');
          return insertMovement(c, op, leapGrant(leap, other, LEAP_AHEAD));
        }),
      ).rejects.toEqual(constraint('conflict_use_right_leap_grant'));
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, leapGrant(leap, leapStake, LEAP_AHEAD, 2)))).rejects.toEqual(
        constraint('use_right_movement_shape'),
      );
      await expect(
        app('open_exercise', (c, op) => insertMovement(c, op, leapGrant(future, future.stakes[0]!, NEXT_YEAR))),
      ).rejects.toEqual(constraint(isLeapYear(NEXT_YEAR) ? 'use_right_leap_beneficiary' : 'use_right_leap_night_sealed'));
      const pastStake = leapDayBeneficiary({
        drawn: await drawnPositions(h, past.acquisitionId),
        operationStartDate: `${PAST_LEAP}-01-01`,
        exerciseYear: PAST_LEAP,
      })!;
      // Sem concessão retroativa: o 29/02 vencido nunca é concedido, nem à Ação contemplada (D5).
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, leapGrant(past, pastStake, PAST_LEAP)))).rejects.toEqual(
        constraint('use_right_leap_expired'),
      );
      // A formalização nunca concede o 29/02 (W8): mesmo com a operação da formalização, recusa imediata.
      await expect(
        asOwner('test_formalization_leap', (c) =>
          c.query(
            `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
               source, quantity, operation_id, created_at)
             SELECT $1, a.second_home_id, a.id, $2, $3, 'leap', 'grant', 'configuration', 1, a.operation_id, now()
               FROM app.acquisition a WHERE a.id = $4`,
            [randomUUID(), leapStake, LEAP_AHEAD + 4, leap.acquisitionId],
          ),
        ),
      ).rejects.toEqual(constraint('conflict_use_right_grant_source'));
    });

    it('[INV-5][PD-004] expiração só depois do fim efetivo, pelo close_exercise e exatamente sobre o restante', async () => {
      const expire = (home: CoOwnerHome, year: number, bucket: 'alta' | 'media', quantity: number) =>
        ({ home, stake: home.stakes[0]!, year, bucket, movement: 'expire', quantity }) as const;
      await expect(app('close_exercise', (c, op) => insertMovement(c, op, expire(current, NEXT_YEAR, 'alta', 24)))).rejects.toEqual(
        constraint('conflict_use_right_not_expired'),
      );
      await expect(app('open_exercise', (c, op) => insertMovement(c, op, expire(current, SEALING_YEAR - 1, 'alta', 1)))).rejects.toEqual(
        constraint('use_right_expire_operation'),
      );
      const old = await formalizeCoOwnerAt(h, 2, `${SEALING_YEAR - 2}-01-01`, new Date(`${SEALING_YEAR - 2}-01-01T12:00:00Z`));
      await expect(app('close_exercise', (c, op) => insertMovement(c, op, expire(old, SEALING_YEAR - 2, 'media', 1)))).rejects.toEqual(
        constraint('balance_expire_exact'),
      );
      await expect(app('close_exercise', (c, op) => insertMovement(c, op, expire(old, SEALING_YEAR - 2, 'media', 999)))).rejects.toEqual(
        constraint('balance_remaining_nonnegative'),
      );
      await expect(runner.close(old.homeId, SEALING_YEAR - 2)).resolves.toMatchObject({ status: 'committed' });
    });

    it('[INV-4][INV-5] consumo e restauração fechados ao papel da aplicação na W11, mesmo com o privilégio de INSERT', async () => {
      const { rows } = await h.database.pool.query<{ insert: boolean }>(
        `SELECT has_table_privilege('luxtory_app', 'app.use_right_ledger', 'INSERT') AS insert`,
      );
      expect(rows[0]!.insert).toBe(true);
      const consume = { home: future, stake: future.stakes[0]!, year: NEXT_YEAR, bucket: 'alta', movement: 'consume', quantity: 1, stayDate: `${NEXT_YEAR}-01-10` } as const;
      await expect(app('test_consume', (c, op) => insertMovement(c, op, consume))).rejects.toEqual(
        constraint('use_right_consumption_not_enabled'),
      );
      await expect(
        app('test_consume', (c, op) => insertMovement(c, op, { ...consume, movement: 'restore', refersTo: randomUUID() })),
      ).rejects.toEqual(constraint('use_right_consumption_not_enabled'));
    });

    it('[TECH-026][TECH-110] correção nunca altera concessão e não existe antes da W13 (nem para o dono do schema)', async () => {
      const { rows } = await h.database.pool.query<{ id: string; movement: string }>(
        `SELECT id, movement FROM app.use_right_ledger WHERE second_home_id = $1 AND movement IN ('grant', 'expire') ORDER BY movement`,
        [past.homeId],
      );
      const grantRow = rows.find((row) => row.movement === 'grant')!;
      const expireRow = rows.find((row) => row.movement === 'expire')!;
      const target = (await h.database.pool.query<{ stake_id: string; bucket: string }>(
        'SELECT stake_id, bucket FROM app.use_right_ledger WHERE id = $1',
        [expireRow.id],
      )).rows[0]!;
      const correction = (refersTo: string, stake = target.stake_id, bucket = target.bucket) =>
        ({ home: past, stake, year: PAST_LEAP, bucket: bucket as 'alta', movement: 'correction', quantity: 1, refersTo }) as const;
      await expect(app('test_correction', (c, op) => insertMovement(c, op, correction(grantRow.id)))).rejects.toEqual(
        constraint('use_right_correction_target'),
      );
      await expect(app('test_correction', (c, op) => insertMovement(c, op, correction(expireRow.id)))).rejects.toEqual(
        constraint('use_right_correction_not_enabled'),
      );
      await expect(asOwner('test_correction', (c, op) => insertMovement(c, op, correction(expireRow.id)))).rejects.toEqual(
        constraint('use_right_correction_not_enabled'),
      );
      // A concessão é imutável na projeção, inclusive para o dono do schema.
      await expect(
        h.database.pool.query(`UPDATE app.use_right_balance SET granted = granted + 1 WHERE second_home_id = $1`, [past.homeId]),
      ).rejects.toEqual(constraint('balance_granted_immutable'));
    });

    it('[TECH-052] projeção protegida contra escrita direta; manutenção SECURITY DEFINER sem EXECUTE e sem como criar gatilho', async () => {
      const client = new pg.Client({ connectionString: h.database.appUrl });
      await client.connect();
      try {
        for (const statement of [
          `INSERT INTO app.use_right_balance (second_home_id, stake_id, exercise_year, bucket, granted) VALUES ('${future.homeId}', '${future.stakes[0]}', 9000, 'alta', 1)`,
          `UPDATE app.use_right_balance SET consumed = 0 WHERE second_home_id = '${future.homeId}'`,
          `DELETE FROM app.use_right_balance WHERE second_home_id = '${future.homeId}'`,
          `CREATE TABLE public.w11_probe (id int)`,
          `CREATE TABLE app.w11_probe (id int)`,
          `SET session_replication_role = replica`,
        ]) {
          await expect(client.query(statement)).rejects.toMatchObject({ code: '42501' });
        }
      } finally {
        await client.end();
      }
      const { rows } = await h.database.pool.query<{ execute: boolean; definer: boolean; path: string[] | null; owner_is_app: boolean }>(
        `SELECT has_function_privilege('luxtory_app', p.oid, 'EXECUTE') AS execute, p.prosecdef AS definer,
                p.proconfig AS path, pg_has_role('luxtory_app', p.proowner, 'USAGE') AS owner_is_app
           FROM pg_proc p WHERE p.oid = 'app.use_right_balance_apply()'::regprocedure`,
      );
      expect(rows[0]).toEqual({ execute: false, definer: true, path: ['search_path=""'], owner_is_app: false });
      // Só esta função é DEFINER na W11; validação e gate rodam como o papel real (INVOKER).
      const { rows: invokers } = await h.database.pool.query<{ name: string; definer: boolean }>(
        `SELECT p.proname AS name, p.prosecdef AS definer FROM pg_proc p
          WHERE p.oid IN ('app.use_right_ledger_movement()'::regprocedure, 'app.assert_use_right_consumption_enabled()'::regprocedure,
                          'app.second_home_date_use_rights_constraint()'::regprocedure, 'app.use_right_balance_guard()'::regprocedure)`,
      );
      expect(invokers.every((row) => !row.definer)).toBe(true);
      // Owner: nenhuma concessão, nenhuma projeção.
      expect(await balances(h, owner)).toEqual([]);
    });
  });

  describe('estrutura de consumo e restauração (dono do schema; o command chega na W12/W13)', () => {
    const consume = (stake: string, stayDate: string, bucket: 'alta' | 'media' | 'leap', home = future, year = NEXT_YEAR) =>
      ({ home, stake, year, bucket, movement: 'consume', quantity: 1, stayDate }) as const;

    it('[REQ-030][INV-5][TECH-110] a noite consome só o bucket da própria categoria e do próprio exercício', async () => {
      const stake = future.stakes[1]!;
      await asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-01-05`, 'alta')));
      await expect(asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-01-06`, 'media')))).rejects.toEqual(
        constraint('balance_night_bucket'),
      );
      await expect(asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-04-10`, 'alta')))).rejects.toEqual(
        constraint('balance_night_bucket'),
      );
      // INV-5: a noite de N+1 nunca consome o saldo de N.
      await expect(
        asOwner('test_consume', (c, op) => insertMovement(c, op, { ...consume(stake, `${NEXT_YEAR}-01-07`, 'alta'), year: SEALING_YEAR })),
      ).rejects.toEqual(constraint('balance_night_bucket'));
      await expect(asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR + 5}-01-07`, 'alta')))).rejects.toEqual(
        constraint('custody_use_right_night_sealed'),
      );
      const row = (await balances(h, future.homeId)).find((b) => b.stake_id === stake && b.bucket === 'alta')!;
      expect(row).toMatchObject({ granted: 10, consumed: 1, remaining: 9 });
    });

    it('[INV-4][REQ-030] acima do limite individual falha com ERR_USE_RIGHT_BALANCE, mesmo com capacidade ociosa de outra Ação', async () => {
      const stake = future.stakes[2]!;
      for (let day = 1; day <= 10; day += 1) {
        await asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-12-${String(day).padStart(2, '0')}`, 'alta')));
      }
      const refused = asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-12-11`, 'alta')));
      await expect(refused).rejects.toEqual(constraint('balance_remaining_nonnegative'));
      expect(rejectionForConstraint('balance_remaining_nonnegative')).toBe('ERR_USE_RIGHT_BALANCE');
      expect(rejectionForConstraint('balance_night_bucket')).toBe('ERR_USE_RIGHT_BALANCE');
      // A outra Ação continua com o próprio saldo intacto.
      const other = (await balances(h, future.homeId)).find((b) => b.stake_id === future.stakes[3] && b.bucket === 'alta')!;
      expect(other.remaining).toBe(10);
    });

    it('[TECH-027][TECH-110] o 29/02 consome só o bucket leap, e só da Ação contemplada', async () => {
      const date = `${LEAP_AHEAD}-02-29`;
      const other = leap.stakes.find((stake) => stake !== leapStake)!;
      await expect(asOwner('test_consume', (c, op) => insertMovement(c, op, consume(leapStake, date, 'media', leap, LEAP_AHEAD)))).rejects.toEqual(
        constraint('balance_night_bucket'),
      );
      await expect(asOwner('test_consume', (c, op) => insertMovement(c, op, consume(other, date, 'leap', leap, LEAP_AHEAD)))).rejects.toEqual(
        constraint('balance_not_granted'),
      );
      const consumed = await asOwner('test_consume', (c, op) => insertMovement(c, op, consume(leapStake, date, 'leap', leap, LEAP_AHEAD)));
      // Restauração desfaz exatamente um consumo da mesma noite, uma vez.
      const restore = { ...consume(leapStake, date, 'leap', leap, LEAP_AHEAD), movement: 'restore', refersTo: consumed } as const;
      await asOwner('test_restore', (c, op) => insertMovement(c, op, restore));
      await expect(asOwner('test_restore', (c, op) => insertMovement(c, op, restore))).rejects.toEqual(
        constraint('conflict_use_right_restore'),
      );
      const leapBalance = (await balances(h, leap.homeId)).find((b) => b.bucket === 'leap')!;
      expect(leapBalance).toMatchObject({ stake_id: leapStake, granted: 1, consumed: 0, remaining: 1 });
      // Depois do fim efetivo, nada mais é consumido (o 29/02 encerrado).
      const pastStake = (await balances(h, past.homeId)).find((b) => b.bucket === 'alta')!.stake_id;
      await expect(
        asOwner('test_consume', (c, op) => insertMovement(c, op, consume(pastStake, `${PAST_LEAP}-02-29`, 'leap', past, PAST_LEAP))),
      ).rejects.toEqual(constraint('balance_use_right_expired'));
    });

    it('[CONC-2][TECH-053] duas conexões disputando a última unidade: exatamente uma consome', async () => {
      const stake = future.stakes[4]!;
      for (let day = 1; day <= 9; day += 1) {
        await asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-07-${String(day).padStart(2, '0')}`, 'alta')));
      }
      const outcomes = await Promise.allSettled([
        asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-07-20`, 'alta'))),
        asOwner('test_consume', (c, op) => insertMovement(c, op, consume(stake, `${NEXT_YEAR}-07-21`, 'alta'))),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toEqual(constraint('balance_remaining_nonnegative'));
      expect((await balances(h, future.homeId)).find((b) => b.stake_id === stake && b.bucket === 'alta')!.remaining).toBe(0);
    });
  });

  describe('capacidade coletiva da SPE', () => {
    it('[REQ-039][BR-162] capacidade não reservada fica spe_pool até o fim do exercício e não entra no Inventário Luxtory', async () => {
      // Exercício encerrado e expirado: a noite não reservada continua coletiva, sem Ação, fora do Inventário Luxtory.
      const { rows } = await h.database.pool.query<{ holder_kind: string; stake_id: string | null }>(
        `SELECT holder_kind, stake_id FROM app.central_inventory WHERE second_home_id = $1 AND stay_date = $2`,
        [past.homeId, `${PAST_LEAP}-02-29`],
      );
      expect(rows).toEqual([{ holder_kind: 'spe_pool', stake_id: null }]);
      for (const home of [past, future, current, leap]) {
        const { rows: inventory } = await h.database.pool.query(
          'SELECT 1 FROM app.luxtory_inventory WHERE second_home_id = $1',
          [home.homeId],
        );
        expect(inventory).toEqual([]);
      }
      // Antes do fim do exercício, a mesma capacidade coletiva serve a qualquer Ação dentro do próprio saldo: nenhuma
      // noite pertence a uma Ação na custódia (o consumo estrutural acima usou noites `spe_pool` de Ações diferentes).
      const { rows: owned } = await h.database.pool.query(
        `SELECT 1 FROM app.date_custody WHERE second_home_id = $1 AND closed_at IS NULL AND holder_kind <> 'spe_pool'`,
        [future.homeId],
      );
      expect(owned).toEqual([]);
    });
  });

  describe('garantias da W8 preservadas', () => {
    it('[REQ-026][TECH-026] concessão extra com a operação da formalização falha no COMMIT; o Titular só lê concessões', async () => {
      await expect(
        asOwner('test_w8', (c) =>
          c.query(
            `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement, source, quantity, operation_id, created_at)
             SELECT $1, a.second_home_id, a.id, $2, a.exercise_year + 1, 'alta', 'grant', 'configuration', 10, a.operation_id, now()
               FROM app.acquisition a WHERE a.id = $3`,
            [randomUUID(), future.stakes[0], future.acquisitionId],
          ),
        ),
      ).rejects.toEqual(constraint('conflict_use_right_grant_source'));
      const { rows } = await h.database.pool.query<{ qual: string }>(
        `SELECT pg_get_expr(polqual, polrelid) AS qual FROM pg_policy WHERE polname = 'use_right_holder_read'`,
      );
      expect(rows[0]!.qual).toContain(`movement = 'grant'::text`);
      // A formalização continua com exatamente 2N concessões da própria operação.
      const { rows: grants } = await h.database.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM app.use_right_ledger l JOIN app.acquisition a ON a.id = l.acquisition_id
          WHERE a.id = $1 AND l.operation_id = a.operation_id`,
        [future.acquisitionId],
      );
      expect(grants[0]!.count).toBe(20);
    });
  });
});
