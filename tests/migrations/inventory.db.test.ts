import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  activeCustody,
  asOwner,
  NEXT_YEAR,
  nextYear,
  occupy,
  openOperation,
  SEALING_YEAR,
  sealingHarness,
  transition,
  type SealingHarness,
} from '../features/calendar/sealing-support';

const Y = SEALING_YEAR;
const N = NEXT_YEAR;

const calendar = createCivilCalendar();

const constraint = (name: string) => expect.objectContaining({ constraint: name });

async function chain(h: SealingHarness, home: string, stayDate: string) {
  const { rows } = await h.database.pool.query<{ kind: string; closed: boolean }>(
    `WITH RECURSIVE lineage AS (
       SELECT c.*, 0 AS depth FROM app.date_custody c
        WHERE c.second_home_id = $1 AND c.stay_date = $2 AND c.parent_custody_id IS NULL
       UNION ALL
       SELECT c.*, l.depth + 1 FROM app.date_custody c JOIN lineage l ON c.parent_custody_id = l.id)
     SELECT concat_ws('/', holder_kind, basis, purpose, inventory_origin) AS kind, closed_at IS NOT NULL AS closed
       FROM lineage ORDER BY depth`,
    [home, stayDate],
  );
  return rows;
}

async function custodyHistory(h: SealingHarness, home: string, stayDate: string) {
  const { rows } = await h.database.pool.query(
    `SELECT id, holder_kind, stake_id, basis, purpose, inventory_origin, authorization_ref, parent_custody_id,
            opened_by_operation, closed_by_operation, closed_at
       FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NOT NULL ORDER BY id`,
    [home, stayDate],
  );
  return rows;
}

describe('custódia e selagem: barreiras do banco (W10)', () => {
  let h: SealingHarness;
  let owner: string;
  let coOwner: string;
  let stakes: readonly string[];
  let timezone: string;

  beforeAll(async () => {
    h = await sealingHarness();
    owner = await h.formalizeOwner();
    const co = await h.formalizeCoOwner(2);
    coOwner = co.homeId;
    stakes = co.stakes.map((stake) => stake.id);
    await h.runJob();
    const zone = await h.database.pool.query<{ timezone: string }>(
      'SELECT timezone FROM app.second_home WHERE id = $1',
      [owner],
    );
    timezone = zone.rows[0]!.timezone;
  });
  afterAll(async () => h.close());

  describe('classificação canônica e noite selada [TECH-041] [TECH-110]', () => {
    it('[TECH-041] Carnaval do banco e do TypeScript são idênticos em todos os anos aceitos (1–9999)', async () => {
      const { rows } = await h.database.pool.query<{ year: number; dates: string[] }>(
        `SELECT y AS year, app.carnival_dates(y)::text[] AS dates FROM generate_series(1, 9999) AS y`,
      );
      expect(rows).toHaveLength(9999);
      for (const row of rows) expect(row.dates).toEqual(calendar.carnivalDates(row.year));
      const seasons = await h.database.pool.query<{ date: string; season: string }>(
        `SELECT d::date::text AS date, app.canonical_season(d::date) AS season
           FROM generate_series(DATE '1900-01-01', DATE '2100-12-31', interval '1 day') AS d`,
      );
      for (const row of seasons.rows) expect(row.season).toBe(calendar.classify(row.date).season);
    });

    it('[TECH-041] noite selada não é reclassificada, alterada nem apagada', async () => {
      const pool = h.database.pool;
      await expect(
        pool.query(`UPDATE app.second_home_date SET season = 'alta' WHERE second_home_id = $1 AND stay_date = '${nextYear('05-10')}'`, [owner]),
      ).rejects.toThrow(/not allowed/);
      await expect(
        pool.query(`DELETE FROM app.second_home_date WHERE second_home_id = $1 AND stay_date = '${nextYear('05-10')}'`, [owner]),
      ).rejects.toThrow(/not allowed/);
      await expect(pool.query('TRUNCATE app.second_home_date CASCADE')).rejects.toThrow(/not allowed/);
    });

    it('[TECH-041] selagem recusa classificação divergente, check-in fora das 14:00 locais, Second Home não formalizada e noite antes da data-base', async () => {
      const seal = (home: string, stayDate: string, season: string, checkin: Date) =>
        asOwner(
          h,
          (client) =>
            client.query(
              `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at, sealed_at)
               VALUES ($1, $2, $3, $4, now())`,
              [home, stayDate, season, checkin],
            ),
          'open_exercise',
          null,
        );
      const july = nextYear('07-10');
      await expect(seal(owner, july, 'media', calendar.checkInAt(july, timezone))).rejects.toEqual(
        constraint('second_home_date_season_canonical'),
      );
      await expect(seal(owner, july, 'alta', new Date(`${july}T14:00:00Z`))).rejects.toEqual(
        constraint('second_home_date_checkin_local'),
      );
      const { home: loose } = await h.root();
      await expect(seal(loose.id, july, 'alta', calendar.checkInAt(july, timezone))).rejects.toEqual(
        constraint('custody_night_formalized'),
      );
      const partial = await h.formalizeOwner(nextYear('03-01'));
      await expect(seal(partial, nextYear('02-27'), 'media', calendar.checkInAt(nextYear('02-27'), timezone))).rejects.toEqual(
        constraint('custody_night_after_operation_start'),
      );
    });

    it('[TECH-041] exercício é selado inteiro: uma noite isolada falha no COMMIT', async () => {
      const fresh = await h.formalizeOwner();
      const night = `${Y}-05-10`;
      await expect(
        asOwner(
          h,
          async (client, op) => {
            await client.query(
              `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at, sealed_at)
               VALUES ($1, $2, 'media', $3, now())`,
              [fresh, night, calendar.checkInAt(night, timezone)],
            );
            await client.query(
              `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation)
               VALUES ($1, $2, $3, 'owner', $4)`,
              [randomUUID(), fresh, night, op],
            );
          },
          'open_exercise',
          null,
        ),
      ).rejects.toEqual(constraint('custody_exercise_coverage'));
    });

    it.each([
      // [instante, fuso, exercícios aceitos] — viradas de ano reproduzidas sem esperar o relógio real.
      ['2026-12-31T23:30:00-03:00', 'America/Sao_Paulo', [2026, 2027]],
      ['2027-01-01T00:30:00-03:00', 'America/Sao_Paulo', [2027, 2028]],
      // O mesmo instante já é 2027 em Lisboa: o ano civil é o local da Second Home.
      ['2027-01-01T02:30:00Z', 'Europe/Lisbon', [2027, 2028]],
      ['2027-01-01T02:30:00Z', 'America/Sao_Paulo', [2026, 2027]],
    ] as const)('[TECH-042] horizonte estrito na virada do ano (%s, %s): só o corrente e o seguinte', async (at, zone, accepted) => {
      const { rows } = await h.database.pool.query<{ exercise: number; ok: boolean }>(
        `SELECT y AS exercise, app.exercise_within_horizon(y, $1::timestamptz, $2) AS ok
           FROM generate_series(2024, 2030) AS y ORDER BY y`,
        [at, zone],
      );
      expect(rows.filter((row) => row.ok).map((row) => row.exercise)).toEqual(accepted);
    });

    it('[TECH-042] só o exercício corrente e o seguinte pelo relógio do banco: além disso a selagem é recusada', async () => {
      const beyond = `${N + 1}-07-10`;
      await expect(
        asOwner(
          h,
          (client) =>
            client.query(
              `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at, sealed_at)
               VALUES ($1, $2, 'alta', $3, now())`,
              [owner, beyond, calendar.checkInAt(beyond, timezone)],
            ),
          'open_exercise',
          null,
        ),
      ).rejects.toEqual(constraint('custody_exercise_horizon'));
    });
  });

  describe('origem e transições [INV-3] [REQ-040] [TECH-022]', () => {
    it('[INV-3] quarta origem falha; inventário sem origem ou sem autorização é recusado', async () => {
      const lux = (extra: Record<string, string | null>) =>
        asOwner(h, (client, op) =>
          transition(client, op, coOwner, nextYear('04-01'), { holder_kind: 'luxtory', purpose: 'inventory', ...extra }),
        );
      // Pela transição, o gatilho da TECH-022 recusa antes do CHECK (origem incompatível com a custódia anterior).
      await expect(lux({ inventory_origin: 'gift', authorization_ref: 'base:x' })).rejects.toEqual(
        constraint('custody_transition_closed_table'),
      );
      await expect(lux({ inventory_origin: null, authorization_ref: 'base:x' })).rejects.toEqual(
        constraint('custody_transition_closed_table'),
      );
      await expect(lux({ inventory_origin: 'annual_allocation', authorization_ref: null })).rejects.toEqual(
        constraint('custody_inventory_authorization'),
      );
      // Segunda camada: mesmo sem gatilhos, as constraints do 03 recusam a quarta origem e a entrada sem origem.
      const rawInsert = (origin: string | null) =>
        asOwner(h, async (client, op) => {
          await client.query(`SET LOCAL session_replication_role = replica`);
          await client.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
               authorization_ref, opened_by_operation)
             VALUES ($1, $2, '${nextYear('04-01')}', 'luxtory', 'inventory', $3, 'base:x', $4)`,
            [randomUUID(), coOwner, origin, op],
          );
        });
      await expect(rawInsert('gift')).rejects.toEqual(constraint('custody_inventory_origin_check'));
      await expect(rawInsert(null)).rejects.toEqual(constraint('custody_inventory_origin_required'));
    });

    it('[REQ-040] origem incompatível com a custódia anterior é recusada; a compatível entra com origem e autorização', async () => {
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, coOwner, nextYear('04-02'), {
            holder_kind: 'luxtory',
            purpose: 'inventory',
            inventory_origin: 'luxchange_cession',
            authorization_ref: 'base:x',
          }),
        ),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      // Owner não tem capacidade Luxtory (REQ-037): nada de seleção Luxtory sobre owner.
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, owner, nextYear('04-02'), { holder_kind: 'luxtory', purpose: 'maintenance' }),
        ),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, nextYear('04-02'), {
          holder_kind: 'luxtory',
          purpose: 'inventory',
          inventory_origin: 'annual_allocation',
          authorization_ref: 'base:selection',
        }),
      );
      const { rows } = await h.database.pool.query(
        `SELECT inventory_origin FROM app.luxtory_inventory WHERE second_home_id = $1 AND stay_date = '${nextYear('04-02')}'`,
        [coOwner],
      );
      expect(rows).toEqual([{ inventory_origin: 'annual_allocation' }]);
    });

    it('[REQ-040] [BR-163] reversão só volta à custódia anterior ao inventário, sem reescrever o histórico', async () => {
      const night = nextYear('04-02');
      const before = await custodyHistory(h, coOwner, night);
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! }),
        ),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await asOwner(h, (client, op) => transition(client, op, coOwner, night, { holder_kind: 'spe_pool' }));
      expect(await chain(h, coOwner, night)).toEqual([
        { kind: 'spe_pool', closed: true },
        { kind: 'luxtory/inventory/annual_allocation', closed: true },
        { kind: 'spe_pool', closed: false },
      ]);
      const after = await custodyHistory(h, coOwner, night);
      expect(after).toHaveLength(before.length + 1);
      expect(after).toEqual(expect.arrayContaining(before));
    });

    it('[TECH-022] sem saída para delinquency e luxtory fora do inventário (pendências P-12/P-13); forfeited só para recovered', async () => {
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, nextYear('04-03'), { holder_kind: 'use_right', basis: 'delinquency', stake_id: stakes[1]! }),
      );
      await expect(
        asOwner(h, (client, op) => transition(client, op, coOwner, nextYear('04-03'), { holder_kind: 'spe_pool' })),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, nextYear('04-04'), { holder_kind: 'luxtory', purpose: 'maintenance' }),
      );
      await expect(
        asOwner(h, (client, op) => transition(client, op, coOwner, nextYear('04-04'), { holder_kind: 'spe_pool' })),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      const night = nextYear('04-05');
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! }),
      );
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, coOwner, night, {
            holder_kind: 'luxtory',
            purpose: 'inventory',
            inventory_origin: 'recovered_future_capacity',
            authorization_ref: 'base:x',
          }),
        ),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'forfeited_right', stake_id: stakes[1]! }),
        ),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'forfeited_right', stake_id: stakes[0]! }),
      );
      await asOwner(h, (client, op) =>
        transition(client, op, coOwner, night, {
          holder_kind: 'luxtory',
          purpose: 'inventory',
          inventory_origin: 'recovered_future_capacity',
          authorization_ref: 'base:br-283',
        }),
      );
    });
  });

  describe('integridade da cadeia de custódia [TECH-021] [TECH-022]', () => {
    it('[TECH-022] spe_pool → reserved_right → spe_pool → reserved_right: cadeia linear e auditável', async () => {
      const night = nextYear('06-01');
      for (const next of [
        { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! },
        { holder_kind: 'spe_pool' },
        { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! },
      ])
        await asOwner(h, (client, op) => transition(client, op, coOwner, night, next));
      expect(await chain(h, coOwner, night)).toEqual([
        { kind: 'spe_pool', closed: true },
        { kind: 'use_right/reserved_right', closed: true },
        { kind: 'spe_pool', closed: true },
        { kind: 'use_right/reserved_right', closed: false },
      ]);
    });

    it('[BR-163] owner → luxtory/inventory → owner, seguido de nova transição autorizada', async () => {
      const night = nextYear('06-02');
      const cession = {
        holder_kind: 'luxtory',
        purpose: 'inventory',
        inventory_origin: 'luxchange_cession',
        authorization_ref: 'base:deposit',
      };
      await asOwner(h, (client, op) => transition(client, op, owner, night, cession));
      await asOwner(h, (client, op) => transition(client, op, owner, night, { holder_kind: 'owner' }));
      await asOwner(h, (client, op) => transition(client, op, owner, night, cession));
      expect(await chain(h, owner, night)).toEqual([
        { kind: 'owner', closed: true },
        { kind: 'luxtory/inventory/luxchange_cession', closed: true },
        { kind: 'owner', closed: true },
        { kind: 'luxtory/inventory/luxchange_cession', closed: false },
      ]);
    });

    it('[TECH-022] bifurcação é recusada: uma custódia fechada tem uma única sucessora', async () => {
      const night = nextYear('06-03');
      await expect(
        asOwner(h, async (client, op) => {
          const root = await activeCustody(client, coOwner, night);
          await client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [root.id, op]);
          const first = randomUUID();
          await client.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, basis, stake_id, parent_custody_id, opened_by_operation)
             VALUES ($1, $2, $3, 'use_right', 'reserved_right', $4, $5, $6)`,
            [first, coOwner, night, stakes[0]!, root.id, op],
          );
          await client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [first, op]);
          await client.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, basis, stake_id, parent_custody_id, opened_by_operation)
             VALUES ($1, $2, $3, 'use_right', 'reserved_right', $4, $5, $6)`,
            [randomUUID(), coOwner, night, stakes[1]!, root.id, op],
          );
        }),
      ).rejects.toEqual(constraint('custody_single_successor'));
      expect(await chain(h, coOwner, night)).toEqual([{ kind: 'spe_pool', closed: false }]);
    });

    it.each(['first', 'second'] as const)(
      '[TECH-053] transição concorrente da mesma custódia (%s conexão vence): exatamente uma sucessora',
      async (winner) => {
        const night = winner === 'first' ? nextYear('06-04') : nextYear('06-05');
        const [a, b] = [new pg.Client({ connectionString: h.database.url }), new pg.Client({ connectionString: h.database.url })];
        await Promise.all([a.connect(), b.connect()]);
        try {
          const [leader, follower] = winner === 'first' ? [a, b] : [b, a];
          await leader.query('BEGIN');
          await follower.query('BEGIN');
          const leaderOp = await openOperation(leader, 'test_inventory_transition', h.userId);
          const followerOp = await openOperation(follower, 'test_inventory_transition', h.userId);
          await transition(leader, leaderOp, coOwner, night, { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! });
          const racing = transition(follower, followerOp, coOwner, night, {
            holder_kind: 'use_right',
            basis: 'reserved_right',
            stake_id: stakes[1]!,
          }).catch((error: unknown) => error);
          await waitForLockWaiter(h.database.pool);
          await leader.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [leaderOp]);
          await leader.query('COMMIT');
          // A seguidora leu a raiz antes do COMMIT e tenta fechá-la de novo: recusada (fechamento único).
          await expect(racing).resolves.toEqual(constraint('custody_closed_once'));
          await follower.query('ROLLBACK');
          expect(await chain(h, coOwner, night)).toEqual([
            { kind: 'spe_pool', closed: true },
            { kind: 'use_right/reserved_right', closed: false },
          ]);
          expect((await activeCustody(h.database.pool, coOwner, night)).stake_id).toBe(stakes[0]);
        } finally {
          await Promise.all([a.end(), b.end()]);
        }
      },
    );

    it('[TECH-021] histórico imutável: custódia não muda de conteúdo, não reabre e não é apagada', async () => {
      const night = nextYear('06-06');
      const root = await activeCustody(h.database.pool, coOwner, night);
      await expect(
        asOwner(h, (client) => client.query(`UPDATE app.date_custody SET holder_kind = 'owner' WHERE id = $1`, [root.id])),
      ).rejects.toEqual(constraint('custody_history_immutable'));
      await expect(h.database.pool.query('DELETE FROM app.date_custody WHERE id = $1', [root.id])).rejects.toThrow(/not allowed/);
      await asOwner(h, (client, op) => transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! }));
      await expect(
        asOwner(h, (client) => client.query('UPDATE app.date_custody SET closed_at = NULL, closed_by_operation = NULL WHERE id = $1', [root.id])),
      ).rejects.toEqual(constraint('custody_closed_once'));
    });

    it('[TECH-021] operação já encerrada (committed) não abre nem fecha custódia', async () => {
      const { rows } = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.operation WHERE command = 'open_exercise' AND state = 'committed' LIMIT 1`,
      );
      const old = rows[0]!.id;
      await expect(
        asOwner(h, async (client) => {
          const root = await activeCustody(client, coOwner, nextYear('06-07'));
          await client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [root.id, old]);
        }),
      ).rejects.toEqual(constraint('inventory_operation_provenance'));
    });
  });

  describe('ocupação e matriz [INV-2] [TECH-023]', () => {
    it('[INV-2] pares da matriz entram; pares fora dela falham', async () => {
      await asOwner(h, (client, op) => occupy(client, op, owner, nextYear('07-01'), 'own_use'));
      await expect(asOwner(h, (client, op) => occupy(client, op, owner, nextYear('07-02'), 'luxtory_use'))).rejects.toEqual(
        constraint('custody_occupancy_matrix'),
      );
      // Owner não tem Ação: own_use sobre owner com Ação informada está fora da matriz.
      await expect(
        asOwner(h, (client, op) => occupy(client, op, owner, nextYear('07-02'), 'own_use', stakes[0]!)),
      ).rejects.toEqual(constraint('custody_occupancy_matrix'));
      const night = nextYear('07-03');
      await asOwner(h, (client, op) => transition(client, op, coOwner, night, { holder_kind: 'use_right', basis: 'reserved_right', stake_id: stakes[0]! }));
      await expect(asOwner(h, (client, op) => occupy(client, op, coOwner, night, 'own_use', stakes[1]!))).rejects.toEqual(
        constraint('custody_occupancy_matrix'),
      );
      await expect(asOwner(h, (client, op) => occupy(client, op, coOwner, night, 'luxplus'))).rejects.toEqual(
        constraint('custody_occupancy_matrix'),
      );
      await asOwner(h, (client, op) => occupy(client, op, coOwner, night, 'own_use', stakes[0]!));
    });

    it('[TECH-023] Request aceita: cessão e ocupação do solicitante na mesma operação; outra operação falha', async () => {
      const cession = {
        holder_kind: 'luxtory',
        purpose: 'inventory',
        inventory_origin: 'luxchange_cession',
        authorization_ref: 'base:request',
      };
      await asOwner(h, (client, op) => transition(client, op, owner, nextYear('07-04'), cession));
      await expect(asOwner(h, (client, op) => occupy(client, op, owner, nextYear('07-04'), 'luxchange_request'))).rejects.toEqual(
        constraint('custody_occupancy_matrix'),
      );
      await asOwner(h, async (client, op) => {
        await transition(client, op, owner, nextYear('07-05'), cession);
        await occupy(client, op, owner, nextYear('07-05'), 'luxchange_request');
      });
      await asOwner(h, (client, op) => occupy(client, op, owner, nextYear('07-04'), 'luxchange_direct'));
    });

    it('[TECH-021] custódia ocupada só fecha depois da liberação; ocupação sobre custódia fechada falha', async () => {
      const night = nextYear('07-06');
      await asOwner(h, (client, op) => occupy(client, op, owner, night, 'rental_external'));
      await expect(
        asOwner(h, (client, op) =>
          transition(client, op, owner, night, { holder_kind: 'luxtory', purpose: 'inventory', inventory_origin: 'luxchange_cession', authorization_ref: 'base:x' }),
        ),
      ).rejects.toEqual(constraint('custody_occupied'));
      await expect(
        asOwner(h, async (client, op) => {
          const custody = await activeCustody(client, owner, nextYear('07-07'));
          await client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [custody.id, op]);
          await client.query(
            `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, opened_by_operation)
             VALUES ($1, $2, '${nextYear('07-07')}', $3, 'own_use', $4, $5)`,
            [randomUUID(), owner, randomUUID(), custody.id, op],
          );
        }),
      ).rejects.toEqual(constraint('custody_occupancy_active'));
    });

    it('[TECH-023] ceded só libera own_use Co-Owner sobre reserved_right da mesma Ação; liberação é única', async () => {
      const release = (home: string, stayDate: string, reason: string) =>
        asOwner(h, (client, op) =>
          client.query(
            `UPDATE app.date_occupancy SET released_at = now(), release_reason = $3, released_by_operation = $4
              WHERE second_home_id = $1 AND stay_date = $2 AND released_at IS NULL`,
            [home, stayDate, reason, op],
          ),
        );
      await expect(release(owner, nextYear('07-01'), 'ceded')).rejects.toEqual(constraint('date_occupancy_ceded_reserved_right'));
      await release(coOwner, nextYear('07-03'), 'ceded');
      await expect(
        asOwner(h, (client) =>
          client.query(
            `UPDATE app.date_occupancy SET release_reason = 'ceded' WHERE second_home_id = $1 AND stay_date = '${nextYear('07-03')}'`,
            [coOwner],
          ),
        ),
      ).rejects.toEqual(constraint('date_occupancy_released_once'));
    });

    it.each(['occupancy', 'closing'] as const)(
      '[TECH-053] ocupação × fechamento concorrentes (%s primeiro): nunca ocupação sobre custódia fechada',
      async (first) => {
        const night = first === 'occupancy' ? nextYear('07-08') : nextYear('07-09');
        const [a, b] = [new pg.Client({ connectionString: h.database.url }), new pg.Client({ connectionString: h.database.url })];
        await Promise.all([a.connect(), b.connect()]);
        try {
          await a.query('BEGIN');
          await b.query('BEGIN');
          const opA = await openOperation(a, 'test_inventory_transition', h.userId);
          const opB = await openOperation(b, 'test_inventory_transition', h.userId);
          const custody = await activeCustody(h.database.pool, owner, night);
          const insertOccupancy = (client: pg.Client, op: string) =>
            client.query(
              `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, opened_by_operation)
               VALUES ($1, $2, $3, $4, 'own_use', $5, $6)`,
              [randomUUID(), owner, night, randomUUID(), custody.id, op],
            );
          const close = (client: pg.Client, op: string) =>
            client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [custody.id, op]);
          const [leader, leaderOp, follower, followerOp] = [a, opA, b, opB];
          if (first === 'occupancy') await insertOccupancy(leader, leaderOp);
          else await close(leader, leaderOp);
          const racing = (first === 'occupancy' ? close(follower, followerOp) : insertOccupancy(follower, followerOp)).catch(
            (error: unknown) => error,
          );
          await waitForLockWaiter(h.database.pool);
          if (first === 'closing') {
            await leader.query(
              `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
                 authorization_ref, parent_custody_id, opened_by_operation)
               VALUES ($1, $2, $3, 'luxtory', 'inventory', 'luxchange_cession', 'base:x', $4, $5)`,
              [randomUUID(), owner, night, custody.id, leaderOp],
            );
          }
          await leader.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [leaderOp]);
          await leader.query('COMMIT');
          await expect(racing).resolves.toEqual(
            constraint(first === 'occupancy' ? 'custody_occupied' : 'custody_occupancy_active'),
          );
          await follower.query('ROLLBACK');
        } finally {
          await Promise.all([a.end(), b.end()]);
        }
      },
    );
  });

  describe('privilégios, operação forjada e RLS (papel da aplicação, sem superusuário)', () => {
    const asApp = async <T>(work: (client: pg.Client) => Promise<T>): Promise<T> => {
      const client = new pg.Client({ connectionString: h.database.appUrl });
      await client.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    };
    const forgeSealing = (
      client: pg.Client,
      op: string,
      home: string,
      year: number,
      holder: string,
      sealedAt: Date | null = null,
    ) =>
      (async () => {
        const nights = calendar.exerciseNights({ exerciseYear: year, operationStartDate: `${year}-01-01`, timezone });
        for (const night of nights) {
          await client.query(
            `INSERT INTO app.second_home_date (second_home_id, stay_date, season, checkin_at, sealed_at)
             VALUES ($1, $2, $3, $4, coalesce($5, now()))`,
            [home, night.stayDate, night.season, night.checkInAt, sealedAt],
          );
          await client.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation) VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), home, night.stayDate, holder, op],
          );
        }
        await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      })();

    it('[TECH-021] operação forjada só consegue selar, de forma canônica, um exercício já devido — antes do cron', async () => {
      // Fronteira de confiança (ADR-0024 §3): o banco não prova que o guard rodou; a raiz não depende de decisão.
      const fresh = await h.formalizeOwner();
      const forged = await asApp(async (client) => {
        const op = await openOperation(client, 'open_exercise', null);
        await forgeSealing(client, op, fresh, Y, 'owner');
        return op;
      });
      // O que ela grava: exatamente as noites e raízes que o sistema gravaria — mesma classificação e mesmo check-in.
      const { rows } = await h.database.pool.query<{
        stay_date: string;
        season: string;
        checkin_at: Date;
        holder_kind: string;
        opened_by_operation: string;
        parent_custody_id: string | null;
      }>(
        `SELECT d.stay_date::text AS stay_date, d.season, d.checkin_at, c.holder_kind, c.opened_by_operation,
                c.parent_custody_id
           FROM app.second_home_date d JOIN app.date_custody c USING (second_home_id, stay_date)
          WHERE d.second_home_id = $1 ORDER BY d.stay_date`,
        [fresh],
      );
      const canonical = calendar.exerciseNights({ exerciseYear: Y, operationStartDate: `${Y}-01-01`, timezone });
      expect(rows.map((row) => [row.stay_date, row.season, row.checkin_at.toISOString()])).toEqual(
        canonical.map((night) => [night.stayDate, night.season, night.checkInAt.toISOString()]),
      );
      expect(
        new Set(rows.map((row) => `${row.holder_kind}:${row.opened_by_operation}:${String(row.parent_custody_id)}`)),
      ).toEqual(new Set([`owner:${forged}:null`]));
      // Nada além disso: nenhuma ocupação, nenhuma custódia econômica, nenhum fato de Direito de Uso.
      const effects = await h.database.pool.query<{ occupancies: number; economic: number; ledger: number }>(
        `SELECT (SELECT count(*)::int FROM app.date_occupancy WHERE second_home_id = $1) AS occupancies,
                (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND holder_kind <> 'owner') AS economic,
                (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id = $2) AS ledger`,
        [fresh, forged],
      );
      expect(effects.rows[0]).toEqual({ occupancies: 0, economic: 0, ledger: 0 });
      // O job trata o exercício como já selado e segue com o seguinte, sem divergência.
      expect(await h.runJob()).toMatchObject({ failed: 0 });
      const exercises = await h.database.pool.query<{ year: number; n: number }>(
        `SELECT exercise_year AS year, count(*)::int AS n FROM app.second_home_date WHERE second_home_id = $1
          GROUP BY 1 ORDER BY 1`,
        [fresh],
      );
      expect(exercises.rows.map((row) => row.year)).toEqual([Y, N]);
      expect((await h.database.pool.query('SELECT * FROM app.inventory_invariant_breaches()')).rows).toEqual([]);
    });

    it('[TECH-021] a trilha (idempotência e auditoria) é gravável pelo mesmo papel: sinal de anomalia, nunca prova de autenticidade', async () => {
      // Sem a trilha do executor, a selagem forjada difere da legítima…
      const fresh = await h.formalizeOwner();
      const forged = await asApp(async (client) => {
        const op = await openOperation(client, 'open_exercise', null);
        await forgeSealing(client, op, fresh, Y, 'owner');
        return op;
      });
      const trail = (operation: string) =>
        h.database.pool.query<{ idempotency: number; audit: number }>(
          `SELECT (SELECT count(*)::int FROM app.idempotency_record WHERE operation_id = $1) AS idempotency,
                  (SELECT count(*)::int FROM app.audit_log WHERE operation_id = $1) AS audit`,
          [operation],
        );
      expect((await trail(forged)).rows[0]).toEqual({ idempotency: 0, audit: 0 });
      // …mas o papel da aplicação também consegue gravar uma trilha com a mesma forma da do executor (ADR-0024 §3).
      const imitation = await asApp(async (client) => {
        const op = await openOperation(client, 'open_exercise', null);
        await forgeSealing(client, op, await h.formalizeOwner(), Y, 'owner');
        await client.query(
          `INSERT INTO app.idempotency_record (scope, idempotency_key, command, request_hash, operation_id, outcome,
             response, created_at)
           VALUES ('system:open_exercise', $1, 'open_exercise', $2, $3, 'committed', '{"result":{}}', now())`,
          [`open_exercise:forged:${Y}:${randomUUID()}`, '0'.repeat(64), op],
        );
        await client.query(
          `INSERT INTO app.audit_log (event_type, operation_id, occurred_at, role, object_type, object_id,
             authorization_ref, after)
           VALUES ('command', $1, now(), 'system', 'second_home_exercise', $2, 'job:open_exercise', '{}')`,
          [op, `forged:${Y}`],
        );
        return op;
      });
      expect((await trail(imitation)).rows[0]).toEqual({ idempotency: 1, audit: 1 });
    });

    it('[TECH-021] operação pending comitada por outra transação é reutilizável pelo mesmo papel — sem capacidade nova', async () => {
      // O executor nunca comita uma operação pending; o papel da aplicação consegue. A verificação é de consistência.
      const stale = await asApp((client) => openOperation(client, 'open_exercise', null));
      const state = await h.database.pool.query<{ state: string }>('SELECT state FROM app.operation WHERE id = $1', [
        stale,
      ]);
      expect(state.rows[0]?.state).toBe('pending');
      const fresh = await h.formalizeOwner();
      await asApp((client) => forgeSealing(client, stale, fresh, Y, 'owner'));
      // Efeito: o mesmo de uma operação forjada nova — selagem canônica de um exercício devido, nada econômico.
      const effects = await h.database.pool.query<{ nights: number; economic: number; occupancies: number }>(
        `SELECT (SELECT count(*)::int FROM app.second_home_date WHERE second_home_id = $1) AS nights,
                (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND holder_kind <> 'owner') AS economic,
                (SELECT count(*)::int FROM app.date_occupancy WHERE second_home_id = $1) AS occupancies`,
        [fresh],
      );
      expect(effects.rows[0]).toEqual({
        nights: calendar.exerciseNights({ exerciseYear: Y, operationStartDate: `${Y}-01-01`, timezone }).length,
        economic: 0,
        occupancies: 0,
      });
    });

    it('[TECH-042] operação forjada não sela exercício passado, mesmo com data-base antiga; o job sela o corrente e o seguinte', async () => {
      const old = await h.formalizeOwner(`${Y - 1}-01-01`);
      await expect(
        asApp(async (client) => forgeSealing(client, await openOperation(client, 'open_exercise', null), old, Y - 1, 'owner')),
      ).rejects.toEqual(constraint('custody_exercise_horizon'));
      expect(await h.runJob()).toMatchObject({ failed: 0 });
      const years = await h.database.pool.query<{ year: number }>(
        'SELECT DISTINCT exercise_year AS year FROM app.second_home_date WHERE second_home_id = $1 ORDER BY 1',
        [old],
      );
      expect(years.rows.map((row) => row.year)).toEqual([Y, N]);
    });

    it('[TECH-041] o instante da selagem é carimbado pelo banco: valor forjado, passado ou futuro, não prevalece', async () => {
      for (const fake of [new Date('2001-01-01T00:00:00Z'), new Date('2999-01-01T00:00:00Z')]) {
        const fresh = await h.formalizeOwner();
        const window = await asApp(async (client) => {
          const op = await openOperation(client, 'open_exercise', null);
          const { rows } = await client.query<{ now: Date }>('SELECT now() AS now');
          await forgeSealing(client, op, fresh, Y, 'owner', fake);
          return rows[0]!.now;
        });
        const stamps = await h.database.pool.query<{ sealed_at: Date }>(
          'SELECT DISTINCT sealed_at FROM app.second_home_date WHERE second_home_id = $1',
          [fresh],
        );
        expect(stamps.rows.map((row) => row.sealed_at.getTime())).toEqual([window.getTime()]);
      }
    });

    it('[TECH-042] operação forjada não sela além do horizonte (exercício seguinte + 1)', async () => {
      const fresh = await h.formalizeOwner();
      await expect(
        asApp(async (client) =>
          forgeSealing(client, await openOperation(client, 'open_exercise', null), fresh, N + 1, 'owner'),
        ),
      ).rejects.toEqual(constraint('custody_exercise_horizon'));
    });

    it('[TECH-021] operação forjada não abre raiz fora dos fatos: modalidade, segunda raiz, outro command, operação encerrada', async () => {
      const fresh = await h.formalizeOwner();
      await expect(
        asApp(async (client) =>
          forgeSealing(client, await openOperation(client, 'open_exercise', null), fresh, Y, 'spe_pool'),
        ),
      ).rejects.toEqual(constraint('custody_root_modality'));
      await expect(
        asApp(async (client) =>
          client.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, opened_by_operation)
             VALUES ($1, $2, $3, 'owner', $4)`,
            [randomUUID(), owner, nextYear('08-01'), await openOperation(client, 'open_exercise', null)],
          ),
        ),
      ).rejects.toEqual(constraint('custody_root_first'));
      await expect(
        asApp(async (client) =>
          forgeSealing(client, await openOperation(client, 'formalize_acquisition', h.userId), fresh, Y, 'owner'),
        ),
      ).rejects.toEqual(constraint('inventory_operation_provenance'));
      const { rows } = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.operation WHERE command = 'open_exercise' AND state = 'committed' LIMIT 1`,
      );
      await expect(asApp((client) => forgeSealing(client, rows[0]!.id, fresh, Y, 'owner'))).rejects.toEqual(
        constraint('inventory_operation_provenance'),
      );
    });

    it('[REQ-040] transições e ocupações ainda sem command ficam protegidas: o papel da aplicação não fecha custódia nem grava ocupação', async () => {
      await expect(
        asApp(async (client) => {
          const op = await openOperation(client, 'select_luxtory_capacity', h.userId);
          await transition(client, op, coOwner, nextYear('08-02'), {
            holder_kind: 'luxtory',
            purpose: 'inventory',
            inventory_origin: 'annual_allocation',
            authorization_ref: 'base:forged',
          });
        }),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asApp(async (client) => occupy(client, await openOperation(client, 'create_own_use_booking', h.userId), owner, nextYear('08-02'), 'own_use')),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asApp((client) => client.query(`UPDATE app.second_home_date SET sealed_at = now() WHERE second_home_id = $1`, [owner])),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('[REQ-040] conceder privilégio não basta: transição e ocupação seguem recusadas no banco até a wave dona substituir o gate', async () => {
      // Simula uma wave futura que só concede privilégio, sem reavaliar a autorização no banco.
      await h.database.pool.query(
        `GRANT UPDATE (closed_at, closed_by_operation) ON app.date_custody TO luxtory_app;
         GRANT INSERT, UPDATE ON app.date_occupancy TO luxtory_app;
         CREATE POLICY test_custody_update ON app.date_custody FOR UPDATE TO luxtory_app USING (true);
         CREATE POLICY test_occupancy_write ON app.date_occupancy FOR INSERT TO luxtory_app WITH CHECK (true);`,
      );
      try {
        await expect(
          asApp(async (client) =>
            transition(client, await openOperation(client, 'select_luxtory_capacity', h.userId), coOwner, nextYear('08-03'), {
              holder_kind: 'luxtory',
              purpose: 'inventory',
              inventory_origin: 'annual_allocation',
              authorization_ref: 'base:forged',
            }),
          ),
        ).rejects.toMatchObject({ code: '42501', constraint: 'inventory_transition_not_enabled' });
        await expect(
          asApp(async (client) =>
            occupy(client, await openOperation(client, 'create_own_use_booking', h.userId), owner, nextYear('08-03'), 'own_use'),
          ),
        ).rejects.toMatchObject({ code: '42501', constraint: 'inventory_transition_not_enabled' });
      } finally {
        await h.database.pool.query(
          `DROP POLICY test_custody_update ON app.date_custody;
           DROP POLICY test_occupancy_write ON app.date_occupancy;
           REVOKE UPDATE (closed_at, closed_by_operation) ON app.date_custody FROM luxtory_app;
           REVOKE INSERT, UPDATE ON app.date_occupancy FROM luxtory_app;`,
        );
      }
    });

    it('[TECH-052] privilégios exatos da W10: a aplicação só lê e insere noites e raízes; Titular e anônimo, nada', async () => {
      const { rows } = await h.database.pool.query<{ role: string; object: string; privileges: string }>(
        `SELECT r.role, o.object,
                concat_ws(',',
                  CASE WHEN has_table_privilege(r.role, o.object, 'SELECT') THEN 'SELECT' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'INSERT') THEN 'INSERT' END,
                  CASE WHEN has_any_column_privilege(r.role, o.object, 'UPDATE') THEN 'UPDATE' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'DELETE') THEN 'DELETE' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'TRUNCATE') THEN 'TRUNCATE' END) AS privileges
           FROM unnest(ARRAY['luxtory_app', 'authenticated', 'anon']) AS r(role)
          CROSS JOIN unnest(ARRAY['app.second_home_date', 'app.date_custody', 'app.date_occupancy',
                                  'app.central_inventory', 'app.luxtory_inventory']) AS o(object)
          ORDER BY 1, 2`,
      );
      const app = rows.filter((row) => row.role === 'luxtory_app');
      expect(Object.fromEntries(app.map((row) => [row.object, row.privileges]))).toEqual({
        'app.central_inventory': 'SELECT',
        'app.date_custody': 'SELECT,INSERT',
        'app.date_occupancy': 'SELECT',
        'app.luxtory_inventory': 'SELECT',
        'app.second_home_date': 'SELECT,INSERT',
      });
      expect(rows.filter((row) => row.role !== 'luxtory_app').every((row) => row.privileges === '')).toBe(true);
      // O gate não se contorna pelo papel da aplicação: não assume o dono do schema nem desliga gatilhos.
      const owner = await h.database.pool.query<{ member: boolean }>(
        `SELECT pg_has_role('luxtory_app', c.relowner, 'USAGE') AS member
           FROM pg_class c WHERE c.oid = 'app.date_custody'::regclass`,
      );
      expect(owner.rows[0]?.member).toBe(false);
      await expect(
        asApp((client) => client.query(`SET LOCAL session_replication_role = replica`)),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it.each(['authenticated', 'anon'])('[TECH-052] %s não lê noites, custódias, ocupações nem projeções', async (role) => {
      for (const table of ['second_home_date', 'date_custody', 'date_occupancy', 'central_inventory', 'luxtory_inventory']) {
        const client = new pg.Client({ connectionString: h.database.url });
        await client.connect();
        try {
          await client.query(`SET ROLE ${role}`);
          await expect(client.query(`SELECT 1 FROM app.${table} LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
        } finally {
          await client.end();
        }
      }
    });
  });

  describe('projeção e rollback [ADR-004]', () => {
    it('[ADR-004] Inventário Central projeta noite + custódia ativa + ocupação ativa; o Luxtory só luxtory/inventory', async () => {
      const central = await h.database.pool.query<{ nights: number; occupied: number }>(
        `SELECT count(*)::int AS nights, count(occupancy_id)::int AS occupied FROM app.central_inventory WHERE second_home_id = $1`,
        [coOwner],
      );
      const sealed = await h.database.pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM app.second_home_date WHERE second_home_id = $1',
        [coOwner],
      );
      expect(central.rows[0]?.nights).toBe(sealed.rows[0]?.n);
      const luxtory = await h.database.pool.query<{ holder_kind: string; purpose: string }>(
        'SELECT DISTINCT holder_kind, purpose FROM app.luxtory_inventory',
      );
      expect(luxtory.rows).toEqual([{ holder_kind: 'luxtory', purpose: 'inventory' }]);
      const breaches = await h.database.pool.query('SELECT * FROM app.inventory_invariant_breaches()');
      expect(breaches.rows).toEqual([]);
    });

    it('[TECH-110] o rollback da W10 nunca descarta noites, custódias ou ocupações', async () => {
      const { readFile } = await import('node:fs/promises');
      for (const name of [
        '20261029193230_inventory_date_occupancy',
        '20261029193227_inventory_date_custody',
        '20261029193225_calendar_second_home_date',
      ]) {
        const down = (await readFile(`migrations/${name}.sql`, 'utf8')).split('-- migrate:down')[1]!;
        const client = new pg.Client({ connectionString: h.database.url });
        await client.connect();
        try {
          await client.query('BEGIN');
          await expect(client.query(down)).rejects.toThrow(/rollback would discard facts/);
        } finally {
          await client.query('ROLLBACK');
          await client.end();
        }
      }
    });
  });
});
