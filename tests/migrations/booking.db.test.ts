import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ordinaryOrder } from '@/features/calendar/domain/use-right';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { stakeWindowOpensAt } from '@/features/calendar/domain/use-window';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import { findUseRightFacts } from '@/features/ownership';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import { waitForLockWaiter } from '../support/platform-fixtures';
import { NEXT_YEAR } from '../features/calendar/sealing-support';
import { completeDrawWithCalendar, drawnPositions, formalizeCoOwnerAt } from '../features/calendar/use-right-support';
import {
  addDays,
  addTitular,
  bookableStart,
  bookingHarness,
  revokeDelegation,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
  type Titular,
} from '../features/booking/booking-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });
const rights = createUseRightCalendar(temporalCivilTime);

interface ForgedBooking {
  readonly homeId: string;
  readonly titular: Titular;
  readonly checkin: string;
  readonly checkout: string;
  readonly channel?: string;
}

describe('W12 — reserva de uso próprio: fronteira no banco com os privilégios reais (luxtory_app)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let first: string;
  const at = (offset: number) => addDays(first, offset);

  /** Transação do papel da aplicação com a operação `pending` do command, como o executor (ou um forjador) a grava. */
  async function asApp<T>(
    titular: Titular,
    homeId: string,
    work: (client: pg.Client, op: string) => Promise<T>,
    options: { command?: string; markCommitted?: boolean } = {},
  ): Promise<T> {
    const client = await h.client(h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openTitularOperation(client, titular, homeId, options.command);
      const result = await work(client, op);
      if (options.markCommitted !== false)
        await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  async function openTitularOperation(client: pg.Client, titular: Titular, homeId: string, command = 'create_own_use_booking') {
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'titular', $5, $6, $7, $8, 'pending', now(), now())`,
      [op, command, titular.userId, titular.partyId, homeId, `forged:${op}`, randomUUID(), `holding:${titular.holdingId}`],
    );
    return op;
  }

  async function insertBooking(client: pg.Client, op: string, b: ForgedBooking): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO app.booking (id, second_home_id, channel, holding_id, stake_id, checkin_date, checkout_date, state,
         opened_by_operation, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, '2000-01-01T00:00:00Z')`,
      [id, b.homeId, b.channel ?? 'own_use', b.titular.holdingId, b.titular.stakeId, b.checkin, b.checkout, op],
    );
    return id;
  }

  /** Fecha `spe_pool` e abre `reserved_right` da Ação na noite; devolve a custódia aberta. */
  async function reserveNight(client: pg.Client, op: string, homeId: string, stakeId: string, date: string) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
      [homeId, date],
    );
    await client.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [rows[0]!.id, op]);
    const id = randomUUID();
    await client.query(
      `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, parent_custody_id,
         opened_by_operation)
       VALUES ($1, $2, $3, 'use_right', $4, 'reserved_right', $5, $6)`,
      [id, homeId, date, stakeId, rows[0]!.id, op],
    );
    return id;
  }

  async function consumeNight(client: pg.Client, op: string, homeId: string, stakeId: string, date: string) {
    await client.query(
      `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
         quantity, stay_date, operation_id, created_at)
       SELECT gen_random_uuid(), d.second_home_id, a.id, $3, d.exercise_year,
              CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END, 'consume', 1, d.stay_date, $4, now()
         FROM app.second_home_date d JOIN app.acquisition a ON a.second_home_id = d.second_home_id
        WHERE d.second_home_id = $1 AND d.stay_date = $2`,
      [homeId, date, stakeId, op],
    );
  }

  async function occupyNight(client: pg.Client, op: string, homeId: string, bookingId: string, stakeId: string | null, date: string) {
    await client.query(
      `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, stake_id,
         opened_by_operation)
       SELECT gen_random_uuid(), $1, $2, $3, 'own_use', c.id, $4, $5
         FROM app.date_custody c WHERE c.second_home_id = $1 AND c.stay_date = $2 AND c.closed_at IS NULL`,
      [homeId, date, bookingId, stakeId, op],
    );
  }

  /** Reserva completa forjada pelo papel da aplicação (o que um servidor comprometido conseguiria, ADR-0026 R1). */
  async function forgeCompleteBooking(client: pg.Client, op: string, b: ForgedBooking): Promise<string> {
    const bookingId = await insertBooking(client, op, b);
    for (let date = b.checkin; date < b.checkout; date = addDays(date, 1)) {
      if (b.titular.stakeId !== null) {
        await reserveNight(client, op, b.homeId, b.titular.stakeId, date);
        await consumeNight(client, op, b.homeId, b.titular.stakeId, date);
      }
      await occupyNight(client, op, b.homeId, bookingId, b.titular.stakeId, date);
    }
    return bookingId;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    owner = await h.ownerScenario();
    first = bookableStart().first;
    await h.activate();
  }, 180_000);
  afterAll(() => h.close());

  describe('privilégios reais e ativação (ADR-0026)', () => {
    it('[TECH-052] privilégios exatos: a aplicação só lê a ativação e insere reservas; Titular só campos permitidos', async () => {
      const { rows } = await h.database.pool.query<{ role: string; object: string; privileges: string }>(
        `SELECT r.role, o.object,
                concat_ws(',',
                  CASE WHEN has_table_privilege(r.role, o.object, 'SELECT') THEN 'SELECT' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'INSERT') THEN 'INSERT' END,
                  CASE WHEN has_any_column_privilege(r.role, o.object, 'UPDATE') THEN 'UPDATE' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'DELETE') THEN 'DELETE' END,
                  CASE WHEN has_table_privilege(r.role, o.object, 'TRUNCATE') THEN 'TRUNCATE' END,
                  CASE WHEN has_any_column_privilege(r.role, o.object, 'SELECT') THEN 'COLUMNS' END) AS privileges
           FROM unnest(ARRAY['luxtory_app', 'authenticated', 'anon']) AS r(role)
          CROSS JOIN unnest(ARRAY['app.booking', 'app.capability_activation', 'app.use_right_balance',
                                  'app.notification']) AS o(object)
          ORDER BY 1, 2`,
      );
      const of = (role: string) =>
        Object.fromEntries(rows.filter((row) => row.role === role).map((row) => [row.object, row.privileges]));
      expect(of('luxtory_app')).toEqual({
        'app.booking': 'SELECT,INSERT,COLUMNS',
        'app.capability_activation': 'SELECT,COLUMNS',
        'app.notification': 'SELECT,INSERT,UPDATE,COLUMNS',
        'app.use_right_balance': 'SELECT,COLUMNS',
      });
      expect(of('authenticated')).toEqual({
        'app.booking': 'COLUMNS',
        'app.capability_activation': '',
        'app.notification': 'COLUMNS',
        'app.use_right_balance': 'COLUMNS',
      });
      expect(Object.values(of('anon')).every((privileges) => privileges === '')).toBe(true);
    });

    it('[ADR-0026] a aplicação não escreve a ativação: nem inserir, nem alterar, nem apagar', async () => {
      const client = await h.client(h.database.appUrl);
      try {
        for (const statement of [
          `INSERT INTO app.capability_activation VALUES ('own_use_booking', now(), 'forged')`,
          `UPDATE app.capability_activation SET authorization_ref = 'forged'`,
          `DELETE FROM app.capability_activation`,
          `TRUNCATE app.capability_activation`,
        ])
          await expect(client.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.end();
      }
    });

    it('[ADR-0026] sem a ativação, cada escrita do uso próprio pelo papel da aplicação é recusada no banco', async () => {
      const a = co.titulares[0]!;
      const night = at(40);
      await h.deactivate();
      try {
        // A reserva.
        await expect(
          asApp(a, co.homeId, (client, op) => insertBooking(client, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) })),
        ).rejects.toEqual(constraint('booking_not_activated'));
        // Cada escrita seguinte, com a reserva da operação já inserida pelo dono em modo réplica.
        for (const step of ['close', 'consume', 'occupy'] as const) {
          const client = await h.client(h.database.url);
          let op = '';
          let bookingId = '';
          try {
            await client.query('BEGIN');
            op = await openTitularOperation(client, a, co.homeId);
            await client.query('SET LOCAL session_replication_role = replica');
            bookingId = await insertBooking(client, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
            if (step !== 'close') await reserveNight(client, op, co.homeId, a.stakeId!, night);
            await client.query('COMMIT');
          } finally {
            await client.end();
          }
          const app = await h.client(h.database.appUrl);
          try {
            await app.query('BEGIN');
            const attempt =
              step === 'close'
                ? reserveNight(app, op, co.homeId, a.stakeId!, night)
                : step === 'consume'
                  ? consumeNight(app, op, co.homeId, a.stakeId!, night)
                  : occupyNight(app, op, co.homeId, bookingId, a.stakeId, night);
            await expect(attempt).rejects.toEqual(constraint('booking_not_activated'));
          } finally {
            await app.query('ROLLBACK').catch(() => undefined);
            await app.end();
          }
          // Desfaz a fixture (dono, modo réplica): a noite volta a `spe_pool` ativa.
          const cleanup = await h.client(h.database.url);
          try {
            await cleanup.query('BEGIN');
            await cleanup.query('SET LOCAL session_replication_role = replica');
            await cleanup.query(`DELETE FROM app.date_custody WHERE opened_by_operation = $1`, [op]);
            await cleanup.query(`UPDATE app.date_custody SET closed_at = NULL, closed_by_operation = NULL WHERE closed_by_operation = $1`, [op]);
            await cleanup.query(`DELETE FROM app.booking WHERE id = $1`, [bookingId]);
            await cleanup.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
            await cleanup.query('COMMIT');
          } finally {
            await cleanup.end();
          }
        }
      } finally {
        await h.activate();
      }
    });

    it('[ADR-0026] desativação concorrente: espera a reserva em curso, que confirma; depois, toda escrita é recusada', async () => {
      const a = co.titulares[0]!;
      const app = await h.client(h.database.appUrl);
      const admin = await h.client(h.database.url);
      try {
        await app.query('BEGIN');
        const op = await openTitularOperation(app, a, co.homeId);
        const bookingId = await insertBooking(app, op, { homeId: co.homeId, titular: a, checkin: at(42), checkout: at(43) });
        await admin.query('BEGIN');
        const deactivation = admin.query(
          `LOCK TABLE app.capability_activation IN ACCESS EXCLUSIVE MODE;
           DELETE FROM app.capability_activation WHERE capability = 'own_use_booking'`,
        );
        await waitForLockWaiter(h.database.pool);
        await reserveNight(app, op, co.homeId, a.stakeId!, at(42));
        await consumeNight(app, op, co.homeId, a.stakeId!, at(42));
        await occupyNight(app, op, co.homeId, bookingId, a.stakeId, at(42));
        await app.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await app.query('COMMIT');
        await deactivation;
        await admin.query('COMMIT');
        await expect(
          asApp(a, co.homeId, (client, next) => insertBooking(client, next, { homeId: co.homeId, titular: a, checkin: at(44), checkout: at(45) })),
        ).rejects.toEqual(constraint('booking_not_activated'));
      } finally {
        await app.end();
        await admin.end();
        await h.activate();
      }
    });
  });

  describe('operação forjada com a ativação presente: só o canônico, preso à reserva', () => {
    it('[TECH-051][ADR-0026] reserva recusada: outro command, outro canal, delegação ausente, holding de outra party, outra Second Home', async () => {
      const [a, b] = co.titulares as [Titular, Titular];
      const base = { homeId: co.homeId, titular: a, checkin: at(46), checkout: at(47) };
      await expect(asApp(a, co.homeId, (c, op) => insertBooking(c, op, base), { command: 'deposit_capacity' })).rejects.toEqual(
        constraint('booking_operation_provenance'),
      );
      await expect(asApp(a, co.homeId, (c, op) => insertBooking(c, op, { ...base, channel: 'luxchange_direct' }))).rejects.toEqual(
        constraint('booking_channel_not_enabled'),
      );
      const stranger = { ...a, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger.userId]);
      await expect(asApp(stranger, co.homeId, (c, op) => insertBooking(c, op, { ...base, titular: stranger }))).rejects.toEqual(
        constraint('permission_representation'),
      );
      await expect(asApp(a, co.homeId, (c, op) => insertBooking(c, op, { ...base, titular: { ...a, holdingId: b.holdingId, stakeId: b.stakeId } }))).rejects.toEqual(
        constraint('permission_representation'),
      );
      await expect(asApp(a, owner.homeId, (c, op) => insertBooking(c, op, { ...base, homeId: owner.homeId }))).rejects.toEqual(
        constraint('permission_representation'),
      );
      expect(rejectionForConstraint('permission_representation')).toBe('ERR_PERMISSION');
    });

    it('[TECH-043][REQ-034][P-14] reserva recusada: noite passada, não selada, 0 ou 15 noites do Co-Owner', async () => {
      const a = co.titulares[0]!;
      const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
      const book = (checkin: string, checkout: string) =>
        asApp(a, co.homeId, (c, op) => insertBooking(c, op, { homeId: co.homeId, titular: a, checkin, checkout }));
      await expect(book(yesterday, addDays(yesterday, 1))).rejects.toEqual(constraint('custody_booking_night_future'));
      await expect(book(`${NEXT_YEAR + 1}-03-01`, `${NEXT_YEAR + 1}-03-02`)).rejects.toEqual(constraint('custody_booking_night_sealed'));
      await expect(book(at(46), at(46))).rejects.toEqual(constraint('stay_minimum_one_night'));
      await expect(book(at(46), at(61))).rejects.toEqual(constraint('stay_length_maximum'));
      expect(rejectionForConstraint('custody_booking_night_future')).toBe('ERR_CAPACITY_UNAVAILABLE');
      expect(rejectionForConstraint('stay_length_maximum')).toBe('ERR_STAY_LENGTH');
    });

    it('[TECH-042][REQ-032] reserva antes da janela da Ação é recusada pelo banco, sem o TypeScript', async () => {
      const late = await formalizeCoOwnerAt(h, 2, `${NEXT_YEAR}-01-01`, new Date());
      h.clock.set(new Date());
      expect((await h.runJob()).failed).toBe(0);
      await completeDrawWithCalendar(h, late.acquisitionId);
      const order = ordinaryOrder(await drawnPositions(h, late.acquisitionId), `${NEXT_YEAR}-01-01`, NEXT_YEAR);
      const [holding] = (await h.holdings(late.homeId)).filter((row) => row.stake_id === order[1]);
      const second = await addTitular(h, holding!);
      await expect(
        asApp(second, late.homeId, (c, op) =>
          insertBooking(c, op, { homeId: late.homeId, titular: second, checkin: `${NEXT_YEAR}-03-10`, checkout: `${NEXT_YEAR}-03-11` }),
        ),
      ).rejects.toEqual(constraint('window_not_open'));
      expect(rejectionForConstraint('window_not_open')).toBe('ERR_WINDOW_NOT_OPEN');
    }, 120_000);

    it('[ADR-0026] consumo, transição e ocupação só presos à reserva da mesma operação, da mesma Ação e da mesma noite', async () => {
      const [a, b] = co.titulares as [Titular, Titular];
      const night = at(48);
      // Sem reserva da operação.
      await expect(asApp(a, co.homeId, (c, op) => reserveNight(c, op, co.homeId, a.stakeId!, night))).rejects.toEqual(
        constraint('booking_write_binding'),
      );
      await expect(asApp(a, co.homeId, (c, op) => consumeNight(c, op, co.homeId, a.stakeId!, night))).rejects.toEqual(
        constraint('booking_write_binding'),
      );
      // Reserva de uma noite, escrita em outra noite.
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await reserveNight(c, op, co.homeId, a.stakeId!, addDays(night, 1));
        }),
      ).rejects.toEqual(constraint('booking_write_binding'));
      // `reserved_right` para outra Ação.
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await reserveNight(c, op, co.homeId, b.stakeId!, night);
        }),
      ).rejects.toEqual(constraint('booking_custody_stake'));
      // Consumo de outra Ação.
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await reserveNight(c, op, co.homeId, a.stakeId!, night);
          await consumeNight(c, op, co.homeId, b.stakeId!, night);
        }),
      ).rejects.toEqual(constraint('booking_consumption_binding'));
      // Outra transição a partir de `spe_pool` (seleção Luxtory) continua fechada.
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          const { rows } = await c.query<{ id: string }>(
            `SELECT id FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
            [co.homeId, night],
          );
          await c.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [rows[0]!.id, op]);
          await c.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
               authorization_ref, parent_custody_id, opened_by_operation)
             VALUES ($1, $2, $3, 'luxtory', 'inventory', 'annual_allocation', 'base:forged', $4, $5)`,
            [randomUUID(), co.homeId, night, rows[0]!.id, op],
          );
        }),
      ).rejects.toMatchObject({ code: '42501', constraint: 'inventory_transition_not_enabled' });
    });

    it('[ADR-0026] reserva incompleta não chega ao COMMIT: sem ocupação, sem consumo, ou Owner movendo Direito de Uso', async () => {
      const a = co.titulares[0]!;
      const night = at(49);
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await reserveNight(c, op, co.homeId, a.stakeId!, night);
          await consumeNight(c, op, co.homeId, a.stakeId!, night);
        }),
      ).rejects.toEqual(constraint('booking_occupancy_complete'));
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          const bookingId = await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await reserveNight(c, op, co.homeId, a.stakeId!, night);
          await occupyNight(c, op, co.homeId, bookingId, a.stakeId, night);
        }),
      ).rejects.toEqual(constraint('booking_consumption_complete'));
      await expect(
        asApp(a, co.homeId, (c, op) => insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 2) })),
      ).rejects.toEqual(constraint('booking_occupancy_complete'));
    });

    it('[TECH-110] SET CONSTRAINTS ALL IMMEDIATE só antecipa a completude: com o estado incompleto, falha; completa, confirma', async () => {
      const a = co.titulares[0]!;
      const night = at(50);
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await c.query('SET CONSTRAINTS ALL IMMEDIATE');
          await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
        }),
      ).rejects.toEqual(constraint('booking_occupancy_complete'));
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          await forgeCompleteBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await c.query('SET CONSTRAINTS ALL IMMEDIATE');
        }),
      ).resolves.toBeUndefined();
    });

    it('[BR-112][TECH-045] adjacência acima de 14 entre reservas forjadas em transações separadas: o banco recusa no COMMIT', async () => {
      const b = co.titulares[1]!;
      await asApp(b, co.homeId, (c, op) => forgeCompleteBooking(c, op, { homeId: co.homeId, titular: b, checkin: at(52), checkout: at(59) }));
      await expect(
        asApp(b, co.homeId, (c, op) => forgeCompleteBooking(c, op, { homeId: co.homeId, titular: b, checkin: at(59), checkout: at(67) })),
      ).rejects.toEqual(constraint('stay_length_maximum'));
    });

    it('[ADR-0026][TECH-026] operação pending reaproveitada não consome de novo; restauração, liberação e escrita direta seguem fechadas', async () => {
      const a = co.titulares[0]!;
      const night = at(51);
      // Forjador comita a reserva deixando a operação `pending` (gotcha da W10) e tenta reaproveitá-la.
      const op = await asApp(
        a,
        co.homeId,
        async (c, forged) => {
          await forgeCompleteBooking(c, forged, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          return forged;
        },
        { markCommitted: false },
      );
      const app = await h.client(h.database.appUrl);
      try {
        await app.query('BEGIN');
        await expect(consumeNight(app, op, co.homeId, a.stakeId!, night)).rejects.toEqual(constraint('booking_consumption_once'));
        await app.query('ROLLBACK');
        const { rows } = await app.query<{ id: string }>(
          `SELECT id FROM app.use_right_ledger WHERE operation_id = $1 AND movement = 'consume'`,
          [op],
        );
        await app.query('BEGIN');
        await expect(
          app.query(
            `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
               quantity, stay_date, refers_to_id, operation_id, created_at)
             SELECT gen_random_uuid(), second_home_id, acquisition_id, stake_id, exercise_year, bucket, 'restore', 1,
                    stay_date, id, $2, now()
               FROM app.use_right_ledger WHERE id = $1`,
            [rows[0]!.id, op],
          ),
          // W13 (ADR-0027 §3): a restauração só no cancelamento tempestivo, com a K2 — ausente aqui.
        ).rejects.toEqual(constraint('booking_lifecycle_not_activated'));
        await app.query('ROLLBACK');
        for (const statement of [
          `UPDATE app.date_occupancy SET released_at = now(), release_reason = 'ceded', released_by_operation = '${op}'`,
          `UPDATE app.booking SET state = 'cancelled'`,
          `DELETE FROM app.booking`,
          `UPDATE app.use_right_balance SET consumed = 0`,
          `UPDATE app.use_right_ledger SET quantity = 2`,
        ])
          await expect(app.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
      }
    });

    it('[D4][TECH-023] reserved_right devolvido (aberto por outra operação) não recebe nova ocupação antes da wave dona', async () => {
      const a = co.titulares[0]!;
      const night = at(45);
      // Estado ainda inalcançável na W12: `reserved_right` livre, criado pelo dono do schema.
      const admin = await h.client(h.database.url);
      try {
        await admin.query('BEGIN');
        const fixture = await openTitularOperation(admin, a, co.homeId, 'test_inventory_transition');
        await reserveNight(admin, fixture, co.homeId, a.stakeId!, night);
        await admin.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [fixture]);
        await admin.query('COMMIT');
      } finally {
        await admin.end();
      }
      await expect(
        asApp(a, co.homeId, async (c, op) => {
          const bookingId = await insertBooking(c, op, { homeId: co.homeId, titular: a, checkin: night, checkout: addDays(night, 1) });
          await occupyNight(c, op, co.homeId, bookingId, a.stakeId, night);
        }),
      ).rejects.toEqual(constraint('custody_reserved_right_reuse'));
    });
  });

  describe('representação e instante da escrita (TECH-050, T3)', () => {
    it('[T3] o instante de aceite é o da validação da linha, não o início da transação', async () => {
      const p = owner.titular;
      const { confirmed, started } = await asApp(p, owner.homeId, async (c, op) => {
        const begin = await c.query<{ started: Date }>('SELECT now() AS started');
        await c.query('SELECT pg_sleep(0.4)');
        const bookingId = await forgeCompleteBooking(c, op, {
          homeId: owner.homeId,
          titular: p,
          checkin: `${NEXT_YEAR}-08-01`,
          checkout: `${NEXT_YEAR}-08-02`,
        });
        const row = await c.query<{ confirmed_at: Date }>('SELECT confirmed_at FROM app.booking WHERE id = $1', [bookingId]);
        return { confirmed: row.rows[0]!.confirmed_at, started: begin.rows[0]!.started };
      });
      expect(confirmed.getTime() - started.getTime()).toBeGreaterThanOrEqual(350);
      expect(confirmed.getTime()).not.toBe(new Date('2000-01-01T00:00:00Z').getTime());
    });

    it('[T3][TECH-050] delegação que vence entre o início e a escrita: a reserva e cada escrita seguinte são recusadas', async () => {
      const p = owner.titular;
      const expiring = { ...p, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [expiring.userId]);
      const { ownerDelegation } = await import('../support/party-fixtures');
      await ownerDelegation(h.database.pool, {
        partyId: p.partyId,
        userId: expiring.userId,
        validUntil: "clock_timestamp() + interval '1500 milliseconds'",
      });
      await expect(
        asApp(expiring, owner.homeId, async (c, op) => {
          await c.query('SELECT pg_sleep(2)');
          await insertBooking(c, op, { homeId: owner.homeId, titular: expiring, checkin: `${NEXT_YEAR}-08-05`, checkout: `${NEXT_YEAR}-08-06` });
        }),
      ).rejects.toEqual(constraint('permission_representation'));
      const later = { ...p, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [later.userId]);
      await ownerDelegation(h.database.pool, {
        partyId: p.partyId,
        userId: later.userId,
        validUntil: "clock_timestamp() + interval '1500 milliseconds'",
      });
      await expect(
        asApp(later, owner.homeId, async (c, op) => {
          const bookingId = await insertBooking(c, op, { homeId: owner.homeId, titular: later, checkin: `${NEXT_YEAR}-08-07`, checkout: `${NEXT_YEAR}-08-08` });
          await c.query('SELECT pg_sleep(2)');
          await occupyNight(c, op, owner.homeId, bookingId, null, `${NEXT_YEAR}-08-07`);
        }),
      ).rejects.toEqual(constraint('permission_representation'));
    });

    it('[T3] limite documentado: escritas válidas + SET CONSTRAINTS ALL IMMEDIATE + espera além da validade → o COMMIT não reavalia', async () => {
      const p = owner.titular;
      const user = { ...p, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [user.userId]);
      const { ownerDelegation } = await import('../support/party-fixtures');
      await ownerDelegation(h.database.pool, {
        partyId: p.partyId,
        userId: user.userId,
        validUntil: "clock_timestamp() + interval '1500 milliseconds'",
      });
      await expect(
        asApp(user, owner.homeId, async (c, op) => {
          await forgeCompleteBooking(c, op, { homeId: owner.homeId, titular: user, checkin: `${NEXT_YEAR}-08-10`, checkout: `${NEXT_YEAR}-08-11` });
          await c.query('SET CONSTRAINTS ALL IMMEDIATE');
          await c.query('SELECT pg_sleep(2)');
        }),
      ).resolves.toBeUndefined();
    });

    it('[TECH-050][ADR-0021] revogação concorrente nas duas ordens: nunca confirma com representação já revogada', async () => {
      const p = owner.titular;
      // Ordem 1: a reserva trava a delegação primeiro; a revogação espera o COMMIT dela.
      const first = await h.client(h.database.appUrl);
      const rep = { ...p, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [rep.userId]);
      const { ownerDelegation } = await import('../support/party-fixtures');
      await ownerDelegation(h.database.pool, { partyId: p.partyId, userId: rep.userId });
      try {
        await first.query('BEGIN');
        const op = await openTitularOperation(first, rep, owner.homeId);
        await forgeCompleteBooking(first, op, { homeId: owner.homeId, titular: rep, checkin: `${NEXT_YEAR}-08-15`, checkout: `${NEXT_YEAR}-08-16` });
        const revocation = revokeDelegation(h, rep.userId);
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await first.query('COMMIT');
        await revocation;
      } finally {
        await first.end();
      }
      // Ordem 2: a revogação grava primeiro (sem comitar); a reserva espera e relê a linha revogada.
      const other = { ...p, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [other.userId]);
      await ownerDelegation(h.database.pool, { partyId: p.partyId, userId: other.userId });
      const revoker = await h.client(h.database.url);
      try {
        await revoker.query('BEGIN');
        const operation = randomUUID();
        await revoker.query(
          `INSERT INTO app.operation (id, command, actor_user_id, role, idempotency_key, correlation_id, authorization_ref,
             state, created_at, updated_at)
           VALUES ($1, 'revoke_party_delegation', $2, 'admin', $3, $3, 'test:revocation', 'committed', now(), now())`,
          [operation, h.userId, `test:${operation}`],
        );
        await revoker.query(
          `UPDATE app.party_delegation SET state = 'revoked', revoked_at = now(), revocation_basis = 'Fim',
             revoked_by_user_id = $2, revoked_role = 'admin', revocation_operation_id = $3 WHERE user_id = $1`,
          [other.userId, h.userId, operation],
        );
        const booking = asApp(other, owner.homeId, (c, op) =>
          insertBooking(c, op, { homeId: owner.homeId, titular: other, checkin: `${NEXT_YEAR}-08-20`, checkout: `${NEXT_YEAR}-08-21` }),
        );
        await waitForLockWaiter(h.database.pool);
        await revoker.query('COMMIT');
        await expect(booking).rejects.toEqual(constraint('permission_representation'));
      } finally {
        await revoker.end();
      }
    });

    it('[TECH-110] semântica do PostgreSQL: SET CONSTRAINTS IMMEDIATE checa o gatilho diferido no próprio comando e o COMMIT não reavalia', async () => {
      await h.database.pool.query(
        `CREATE TABLE app.t3_probe (id int PRIMARY KEY, deadline timestamptz NOT NULL);
         CREATE FUNCTION app.t3_probe_check() RETURNS trigger LANGUAGE plpgsql AS $f$
         BEGIN IF clock_timestamp() >= NEW.deadline THEN RAISE EXCEPTION 'expired' USING CONSTRAINT = 't3_probe_expired'; END IF; RETURN NULL; END $f$;
         CREATE CONSTRAINT TRIGGER t3_probe_check AFTER INSERT ON app.t3_probe DEFERRABLE INITIALLY DEFERRED
           FOR EACH ROW EXECUTE FUNCTION app.t3_probe_check();
         GRANT SELECT, INSERT ON app.t3_probe TO luxtory_app;
         GRANT EXECUTE ON FUNCTION app.t3_probe_check() TO luxtory_app;`,
      );
      try {
        const probe = async (immediate: boolean, id: number) => {
          const client = await h.client(h.database.appUrl);
          try {
            await client.query('BEGIN');
            await client.query(`INSERT INTO app.t3_probe VALUES ($1, clock_timestamp() + interval '1 second')`, [id]);
            if (immediate) await client.query('SET CONSTRAINTS ALL IMMEDIATE');
            await client.query('SELECT pg_sleep(1.5)');
            await client.query('COMMIT');
          } finally {
            await client.end();
          }
        };
        await expect(probe(true, 1)).resolves.toBeUndefined();
        await expect(probe(false, 2)).rejects.toEqual(constraint('t3_probe_expired'));
      } finally {
        await h.database.pool.query(`DROP TABLE app.t3_probe; DROP FUNCTION app.t3_probe_check();`);
      }
    });
  });

  describe('janela: SQL e TypeScript equivalentes (TECH-042)', () => {
    it('[TECH-042] app.local_instant recusa horário inexistente ou ambíguo exatamente como o Temporal', async () => {
      const zones = ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Australia/Lord_Howe', 'Antarctica/Troll', 'Asia/Kolkata', 'UTC'];
      const cases: { zone: string; date: string; hour: number }[] = [];
      for (const zone of zones)
        for (const year of [2018, 2019, 2026])
          for (let day = 0; day < 366; day += 1) {
            const date = addDays(`${year}-01-01`, day);
            if (!date.startsWith(String(year))) continue;
            for (const hour of [0, 1, 2]) cases.push({ zone, date, hour });
          }
      const { rows } = await h.database.pool.query<{ i: number; at: Date | null }>(
        `SELECT c.i::int AS i, app.local_instant((c.date::date + make_interval(hours => c.hour))::timestamp, c.zone) AS at
           FROM unnest($1::text[], $2::text[], $3::int[]) WITH ORDINALITY AS c(zone, date, hour, i)`,
        [cases.map((c) => c.zone), cases.map((c) => c.date), cases.map((c) => c.hour)],
      );
      const { Temporal } = await import('temporal-polyfill');
      const mismatches = rows.filter((row) => {
        const c = cases[row.i - 1]!;
        const [year, month, day] = c.date.split('-').map(Number) as [number, number, number];
        let expected: number | null;
        try {
          expected = Temporal.ZonedDateTime.from(
            { year, month, day, hour: c.hour, timeZone: c.zone },
            { disambiguation: 'reject' },
          ).epochMilliseconds;
        } catch {
          expected = null;
        }
        return (row.at?.getTime() ?? null) !== expected;
      });
      expect(cases.length).toBeGreaterThan(20_000);
      expect(mismatches).toEqual([]);
    });

    it('[TECH-042] app.use_window_opens_at = stakeWindowOpensAt para toda Ação, exercício e 29/02 de Second Homes reais', async () => {
      const facts = await findUseRightFacts(h.db, co.homeId);
      expect(facts?.drawn).not.toBeNull();
      const comparisons: { stake: string; year: number; leap: boolean }[] = [];
      for (const stake of facts!.stakeIds)
        for (let year = Number(facts!.operationStartDate.slice(0, 4)) - 1; year <= NEXT_YEAR + 6; year += 1)
          for (const leap of [false, true]) comparisons.push({ stake, year, leap });
      const { rows } = await h.database.pool.query<{ i: number; at: Date | null }>(
        `SELECT c.i::int AS i, app.use_window_opens_at($1, c.stake, c.year, c.leap) AS at
           FROM unnest($2::uuid[], $3::int[], $4::boolean[]) WITH ORDINALITY AS c(stake, year, leap, i)`,
        [co.homeId, comparisons.map((c) => c.stake), comparisons.map((c) => c.year), comparisons.map((c) => c.leap)],
      );
      for (const row of rows) {
        const c = comparisons[row.i - 1]!;
        expect(row.at?.getTime() ?? null).toBe(stakeWindowOpensAt(rights, facts!, c.stake, c.year, c.leap)?.getTime() ?? null);
      }
      // Sem sorteio revelado não há janela, nos dois lados.
      expect(stakeWindowOpensAt(rights, { ...facts!, drawn: null }, facts!.stakeIds[0]!, NEXT_YEAR, false)).toBeNull();
    });
  });

  describe('migration (ADR-0026)', () => {
    it('[ADR-0026] a W12 nasce sem ativação; o down recusa descartar reservas ou uma decisão de ativação', async () => {
      const fresh = await h.client(h.database.url);
      try {
        const migration = await readFile('migrations/20261031164128_booking_own_use.sql', 'utf8');
        expect(migration).not.toMatch(/INSERT\s+INTO\s+app\.capability_activation/i);
        const down = migration.slice(migration.indexOf('-- migrate:down'));
        const guard = down.slice(0, down.indexOf('END $$;') + 'END $$;'.length);
        await fresh.query('BEGIN');
        await expect(fresh.query(guard)).rejects.toThrow(/discard facts in app\.booking/);
        await fresh.query('ROLLBACK');
      } finally {
        await fresh.end();
      }
    });
  });
});
