import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OwnUseBookingNotActivatedError } from '@/features/booking/application/create-own-use-booking';
import { createOwnUseBookingConsumers } from '@/features/booking/jobs';
import { readOwnUseCalendar } from '@/features/booking/presentation/own-use-calendar-read';
import {
  previewOwnUseBooking,
  type PreviewHolding,
} from '@/features/booking/application/preview-own-use-booking';
import { createPostgresBookingStore } from '@/features/booking/infrastructure/postgres-booking-store';
import { createPostgresOwnUseRights, createUseWindowResolver } from '@/features/calendar/booking';
import { createOwnUseInventory } from '@/features/inventory';
import { findUseRightFacts } from '@/features/ownership';
import { systemClock, withUserRead, type DatabaseTransaction } from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { ownerDelegation, ownerParty } from '../../support/party-fixtures';
import { NEXT_YEAR } from '../calendar/sealing-support';
import {
  formalizeCoOwnerAt,
  completeDrawWithCalendar,
  drawnPositions,
} from '../calendar/use-right-support';
import { ordinaryOrder } from '@/features/calendar/domain/use-right';
import {
  addDays,
  addTitular,
  bookableStart,
  bookingFacts,
  bookingHarness,
  drainBalance,
  isoDate,
  nightsOfSeason,
  revokeDelegation,
  secondRepresentative,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
  type Titular,
} from './booking-support';

const rejected = (code: string) => expect.objectContaining({ status: 'rejected', code });

describe('W12 — reserva de uso próprio pelo command (PostgreSQL real, relógio real)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let first: string;
  let a: Titular;
  let b: Titular;
  /** Ações só para os testes de saldo (esgotam uma categoria). */
  let c: Titular;
  let d: Titular;

  const input = (home: string, checkin: string, checkout: string) => ({
    second_home_id: home,
    checkin_date: checkin,
    checkout_date: checkout,
  });
  const at = (offset: number) => addDays(first, offset);
  const endOfYear = () => `${co.year + 1}-01-01`;

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(4);
    owner = await h.ownerScenario();
    first = bookableStart().first;
    [a, b, c, d] = co.titulares as [Titular, Titular, Titular, Titular];
    await h.activate();
  }, 180_000);
  afterAll(() => h.close());

  describe('Co-Owner (REQ-034, PD-002, TECH-023)', () => {
    it('[PD-002][REQ-034][TECH-023] de 10 a 12 consome as noites 10 e 11: reserved_right, consumo e ocupação por noite', async () => {
      const before = await h.database.pool.query<{ remaining: number }>(
        `SELECT sum(remaining)::int AS remaining FROM app.use_right_balance WHERE stake_id = $1 AND exercise_year = $2`,
        [a.stakeId, co.year],
      );
      const started = new Date();
      const outcome = await h.book(a, input(co.homeId, at(0), at(2)));
      expect(outcome).toMatchObject({
        status: 'committed',
        result: { nights: 2, checkin_date: at(0), checkout_date: at(2) },
      });
      if (outcome.status !== 'committed') return;
      const bookingId = outcome.result.booking_id;
      const { rows } = await h.database.pool.query<{
        stay_date: string;
        holder_kind: string;
        basis: string;
        stake_id: string;
        channel: string;
      }>(
        `SELECT o.stay_date::text AS stay_date, c.holder_kind, c.basis, c.stake_id, o.channel
           FROM app.date_occupancy o JOIN app.date_custody c ON c.id = o.custody_id
          WHERE o.booking_id = $1 ORDER BY o.stay_date`,
        [bookingId],
      );
      expect(rows).toEqual([
        {
          stay_date: at(0),
          holder_kind: 'use_right',
          basis: 'reserved_right',
          stake_id: a.stakeId,
          channel: 'own_use',
        },
        {
          stay_date: at(1),
          holder_kind: 'use_right',
          basis: 'reserved_right',
          stake_id: a.stakeId,
          channel: 'own_use',
        },
      ]);
      const consumes = await h.database.pool.query<{ stay_date: string }>(
        `SELECT stay_date::text AS stay_date FROM app.use_right_ledger WHERE operation_id = $1 AND movement = 'consume' ORDER BY 1`,
        [outcome.operationId],
      );
      expect(consumes.rows.map((row) => row.stay_date)).toEqual([at(0), at(1)]);
      const after = await h.database.pool.query<{ remaining: number }>(
        `SELECT sum(remaining)::int AS remaining FROM app.use_right_balance WHERE stake_id = $1 AND exercise_year = $2`,
        [a.stakeId, co.year],
      );
      expect(after.rows[0]!.remaining).toBe(before.rows[0]!.remaining - 2);
      // `confirmed_at`: instante de aceite carimbado pelo banco (T3), nunca o enviado.
      const booking = await h.database.pool.query<{
        confirmed_at: Date;
        holding_id: string;
        state: string;
      }>('SELECT confirmed_at, holding_id, state FROM app.booking WHERE id = $1', [bookingId]);
      expect(booking.rows[0]).toMatchObject({ holding_id: a.holdingId, state: 'confirmed' });
      expect(booking.rows[0]!.confirmed_at.getTime()).toBeGreaterThanOrEqual(
        started.getTime() - 1_000,
      );
    });

    it('[TECH-110][BR-110] reserva de 1 noite é aceita; 0 noites é recusada com ERR_STAY_LENGTH, sem escrita', async () => {
      await expect(h.book(b, input(co.homeId, at(3), at(4)))).resolves.toMatchObject({
        status: 'committed',
        result: { nights: 1 },
      });
      const facts = await bookingFacts(h, co.homeId);
      await expect(h.book(b, input(co.homeId, at(5), at(5)))).resolves.toEqual(
        rejected('ERR_STAY_LENGTH'),
      );
      await expect(h.book(b, input(co.homeId, at(6), at(5)))).resolves.toEqual(
        rejected('ERR_STAY_LENGTH'),
      );
      expect(await bookingFacts(h, co.homeId)).toEqual(facts);
    });

    it('[REQ-034][BR-111] 15 noites numa reserva do Co-Owner → ERR_STAY_LENGTH', async () => {
      await expect(h.book(a, input(co.homeId, at(34), at(49)))).resolves.toEqual(
        rejected('ERR_STAY_LENGTH'),
      );
    });

    it('[REQ-034][EC-2][BR-112] reservas adjacentes somam, inclusive a que preenche o intervalo entre duas: 14 aceita, 15 recusa', async () => {
      await expect(h.book(b, input(co.homeId, at(10), at(15)))).resolves.toMatchObject({
        status: 'committed',
      });
      await expect(h.book(b, input(co.homeId, at(17), at(24)))).resolves.toMatchObject({
        status: 'committed',
      });
      // 5 + 2 + 7 = 14 noites seguidas: aceita.
      await expect(h.book(b, input(co.homeId, at(15), at(17)))).resolves.toMatchObject({
        status: 'committed',
      });
      // A noite seguinte faria 15.
      await expect(h.book(b, input(co.homeId, at(24), at(25)))).resolves.toEqual(
        rejected('ERR_STAY_LENGTH'),
      );
      await expect(h.book(b, input(co.homeId, at(9), at(10)))).resolves.toEqual(
        rejected('ERR_STAY_LENGTH'),
      );
      // Separada por uma noite livre, é outra permanência.
      await expect(h.book(b, input(co.homeId, at(25), at(26)))).resolves.toMatchObject({
        status: 'committed',
      });
    });

    it('[INV-1][TECH-056] noite já reservada → ERR_BOOKING_CONFLICT; período que a inclui também', async () => {
      await expect(h.book(b, input(co.homeId, at(0), at(1)))).resolves.toEqual(
        rejected('ERR_BOOKING_CONFLICT'),
      );
      await expect(h.book(b, input(co.homeId, addDays(at(0), -1), at(1)))).resolves.toEqual(
        rejected('ERR_BOOKING_CONFLICT'),
      );
    });

    it('[TECH-043][P-14] noite passada ou não selada → ERR_CAPACITY_UNAVAILABLE', async () => {
      const yesterday = addDays(isoDate(new Date()), -1);
      await expect(h.book(a, input(co.homeId, yesterday, addDays(yesterday, 1)))).resolves.toEqual(
        rejected('ERR_CAPACITY_UNAVAILABLE'),
      );
      const unsealed = `${NEXT_YEAR + 1}-02-10`;
      await expect(h.book(a, input(co.homeId, unsealed, addDays(unsealed, 2)))).resolves.toEqual(
        rejected('ERR_CAPACITY_UNAVAILABLE'),
      );
    });

    it('[REQ-030][INV-4] saldo da categoria esgotado → ERR_USE_RIGHT_BALANCE, mesmo com noites livres e saldo na outra', async () => {
      const from = `${co.year}-01-01` > first ? `${co.year}-01-01` : first;
      const night =
        (await nightsOfSeason(h, co.homeId, from, endOfYear(), 'alta', 1)) ??
        (await nightsOfSeason(h, co.homeId, from, endOfYear(), 'media', 1))!;
      const bucket =
        (await nightsOfSeason(h, co.homeId, night, addDays(night, 1), 'alta', 1)) === null
          ? 'media'
          : 'alta';
      await drainBalance(h, co, c.stakeId!, co.year, bucket, [night]);
      await expect(h.book(c, input(co.homeId, night, addDays(night, 1)))).resolves.toEqual(
        rejected('ERR_USE_RIGHT_BALANCE'),
      );
    });
  });

  describe('Owner (REQ-037, REQ-035)', () => {
    it('[REQ-037][REQ-035] Owner reserva 20 noites sobre owner: sem janela, rotação, saldo, consumo nem limite de permanência', async () => {
      const checkin = `${NEXT_YEAR}-03-01`;
      const outcome = await h.book(
        owner.titular,
        input(owner.homeId, checkin, addDays(checkin, 20)),
      );
      expect(outcome).toMatchObject({
        status: 'committed',
        result: { nights: 20, consumed: null },
      });
      if (outcome.status !== 'committed') return;
      const { rows } = await h.database.pool.query<{ holder_kind: string; n: number }>(
        `SELECT c.holder_kind, count(*)::int AS n FROM app.date_occupancy o JOIN app.date_custody c ON c.id = o.custody_id
          WHERE o.booking_id = $1 GROUP BY c.holder_kind`,
        [outcome.result.booking_id],
      );
      expect(rows).toEqual([{ holder_kind: 'owner', n: 20 }]);
      expect(await bookingFacts(h, owner.homeId)).toMatchObject({ consumes: 0, reserved: 0 });
    });

    it('[REQ-037][D3][TECH-043] Owner: noite não selada (além do exercício seguinte) ou passada → ERR_CAPACITY_UNAVAILABLE; 0 noites → ERR_STAY_LENGTH', async () => {
      const unsealed = `${NEXT_YEAR + 1}-01-05`;
      await expect(
        h.book(owner.titular, input(owner.homeId, unsealed, addDays(unsealed, 3))),
      ).resolves.toEqual(rejected('ERR_CAPACITY_UNAVAILABLE'));
      const yesterday = addDays(isoDate(new Date()), -1);
      await expect(
        h.book(owner.titular, input(owner.homeId, yesterday, addDays(yesterday, 1))),
      ).resolves.toEqual(rejected('ERR_CAPACITY_UNAVAILABLE'));
      await expect(
        h.book(owner.titular, input(owner.homeId, `${NEXT_YEAR}-05-01`, `${NEXT_YEAR}-05-01`)),
      ).resolves.toEqual(rejected('ERR_STAY_LENGTH'));
    });
  });

  describe('autorização e representação (TECH-050, TECH-051)', () => {
    it('[TECH-051] Titular de outra Second Home, sem delegação ou sem holding → ERR_PERMISSION', async () => {
      await expect(h.book(owner.titular, input(co.homeId, at(27), at(28)))).resolves.toEqual(
        rejected('ERR_PERMISSION'),
      );
      const stranger = { ...a, userId: randomUUID() };
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger.userId]);
      await expect(h.book(stranger, input(co.homeId, at(27), at(28)))).resolves.toEqual(
        rejected('ERR_PERMISSION'),
      );
    });

    it('[TECH-050][ADR-0021] delegação revogada antes do retry: ERR_PERMISSION, sem segunda reserva nem replay', async () => {
      const rep = await secondRepresentative(h, b);
      const key = randomUUID();
      const done = await h.book(rep, input(co.homeId, at(28), at(29)), key);
      expect(done).toMatchObject({ status: 'committed' });
      const facts = await bookingFacts(h, co.homeId);
      await revokeDelegation(h, rep.userId);
      await expect(h.book(rep, input(co.homeId, at(28), at(29)), key)).resolves.toEqual(
        rejected('ERR_PERMISSION'),
      );
      expect(await bookingFacts(h, co.homeId)).toEqual(facts);
    });
  });

  describe('concorrência (TECH-110, TECH-053)', () => {
    it('[INV-1][CONC-1] duas Ações reservando a mesma noite ao mesmo tempo → exatamente uma; a outra ERR_BOOKING_CONFLICT', async () => {
      const outcomes = await Promise.all([
        h.book(a, input(co.homeId, at(30), at(31))),
        h.book(b, input(co.homeId, at(30), at(31))),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'committed')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([
        rejected('ERR_BOOKING_CONFLICT'),
      ]);
    });

    it('[CONC-3][TECH-045] dois representantes da mesma party, reservas adjacentes ao mesmo tempo somando 15 → exatamente uma', async () => {
      const rep = await secondRepresentative(h, a);
      const outcomes = await Promise.all([
        h.book(a, input(co.homeId, at(34), at(41))),
        h.book(rep, input(co.homeId, at(41), at(49))),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'committed')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([
        rejected('ERR_STAY_LENGTH'),
      ]);
    });

    it('[CONC-2][TECH-053] a mesma Ação disputando a última unidade da categoria → exatamente uma; a outra ERR_USE_RIGHT_BALANCE', async () => {
      let bucket: 'media' | 'alta' = 'media';
      let target = await nightsOfSeason(h, co.homeId, at(52), endOfYear(), 'media', 1);
      if (target === null) {
        bucket = 'alta';
        target = await nightsOfSeason(h, co.homeId, at(52), endOfYear(), 'alta', 1);
      }
      const second = await nightsOfSeason(
        h,
        co.homeId,
        addDays(target!, 2),
        endOfYear(),
        bucket,
        1,
      );
      expect(second).not.toBeNull();
      await drainBalance(h, co, d.stakeId!, co.year, bucket, [target!, second!]);
      const outcomes = await Promise.all([
        h.book(d, input(co.homeId, target!, addDays(target!, 1))),
        h.book(d, input(co.homeId, second!, addDays(second!, 1))),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'committed')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([
        rejected('ERR_USE_RIGHT_BALANCE'),
      ]);
    });
  });

  describe('idempotência e ativação (ADR-0026, D6)', () => {
    it('[ADR-006] mesma chave e mesmo pedido → replay da mesma reserva; mesma chave com outro pedido → ERR_IDEMPOTENCY_CONFLICT', async () => {
      const key = randomUUID();
      const done = await h.book(a, input(co.homeId, at(31), at(32)), key);
      expect(done).toMatchObject({ status: 'committed', replayed: false });
      const again = await h.book(a, input(co.homeId, at(31), at(32)), key);
      expect(again).toMatchObject({
        status: 'committed',
        replayed: true,
        operationId: done.operationId,
      });
      await expect(h.book(a, input(co.homeId, at(32), at(33)), key)).resolves.toEqual(
        rejected('ERR_IDEMPOTENCY_CONFLICT'),
      );
    });

    it('[ADR-006] duplo envio concorrente com a mesma chave → uma reserva só, as duas respostas com o mesmo resultado', async () => {
      const key = randomUUID();
      const facts = await bookingFacts(h, co.homeId);
      const outcomes = await Promise.all([
        h.book(b, input(co.homeId, at(33), at(34)), key),
        h.book(b, input(co.homeId, at(33), at(34)), key),
      ]);
      expect(outcomes.every((outcome) => outcome.status === 'committed')).toBe(true);
      expect(new Set(outcomes.map((outcome) => outcome.operationId)).size).toBe(1);
      expect((await bookingFacts(h, co.homeId)).bookings).toBe(facts.bookings + 1);
    });

    it('[ADR-0026] sem a ativação: o command falha fechado sem escrita alguma; a chave já confirmada continua devolvendo o replay', async () => {
      const key = randomUUID();
      const done = await h.book(
        owner.titular,
        input(owner.homeId, `${NEXT_YEAR}-06-01`, `${NEXT_YEAR}-06-03`),
        key,
      );
      expect(done).toMatchObject({ status: 'committed' });
      await h.deactivate();
      try {
        const facts = await bookingFacts(h, owner.homeId);
        const fresh = randomUUID();
        await expect(
          h.book(
            owner.titular,
            input(owner.homeId, `${NEXT_YEAR}-06-10`, `${NEXT_YEAR}-06-11`),
            fresh,
          ),
        ).rejects.toBeInstanceOf(OwnUseBookingNotActivatedError);
        expect(await bookingFacts(h, owner.homeId)).toEqual(facts);
        const trail = await h.database.pool.query<{ n: number }>(
          `SELECT (SELECT count(*) FROM app.operation WHERE idempotency_key = $1)
                + (SELECT count(*) FROM app.idempotency_record WHERE idempotency_key = $1) AS n`,
          [fresh],
        );
        expect(Number(trail.rows[0]!.n)).toBe(0);
        await expect(
          h.book(
            owner.titular,
            input(owner.homeId, `${NEXT_YEAR}-06-01`, `${NEXT_YEAR}-06-03`),
            key,
          ),
        ).resolves.toMatchObject({
          status: 'committed',
          replayed: true,
          operationId: done.operationId,
        });
      } finally {
        await h.activate();
      }
    });
  });

  describe('janela (REQ-032, TECH-042)', () => {
    it('[REQ-034][TECH-042] posição cuja janela não abriu → ERR_WINDOW_NOT_OPEN', async () => {
      // Formalizada agora para o exercício seguinte: a posição 2 abre 7 dias depois da base (≥ agora).
      const late = await formalizeCoOwnerAt(h, 2, `${NEXT_YEAR}-01-01`, new Date());
      h.clock.set(new Date());
      const job = await h.runJob();
      expect(job.failed).toBe(0);
      await completeDrawWithCalendar(h, late.acquisitionId);
      const order = ordinaryOrder(
        await drawnPositions(h, late.acquisitionId),
        `${NEXT_YEAR}-01-01`,
        NEXT_YEAR,
      );
      const [holding] = (await h.holdings(late.homeId)).filter((row) => row.stake_id === order[1]);
      const second = await addTitular(h, holding!);
      await expect(
        h.book(second, input(late.homeId, `${NEXT_YEAR}-03-10`, `${NEXT_YEAR}-03-12`)),
      ).resolves.toEqual(rejected('ERR_WINDOW_NOT_OPEN'));
    }, 120_000);
  });

  describe('calendário e prévia do Titular (E5b, TECH-052, ADR-0026)', () => {
    /** Primeira sequência de noites sem ocupação ativa (e sem 29/02) no exercício reservável, a partir de `from`. */
    const freeRun = async (homeId: string, from: string, length: number) => {
      const { rows } = await h.database.pool.query<{ stay_date: string }>(
        `SELECT d.stay_date::text AS stay_date FROM app.second_home_date d
          WHERE d.second_home_id = $1 AND d.stay_date >= $2 AND d.stay_date + $4::int <= $3
            AND NOT EXISTS (SELECT 1 FROM app.date_occupancy o
                             WHERE o.second_home_id = d.second_home_id AND o.released_at IS NULL
                               AND o.stay_date >= d.stay_date AND o.stay_date < d.stay_date + $4::int)
            AND NOT EXISTS (SELECT 1 FROM app.second_home_date e
                             WHERE e.second_home_id = d.second_home_id AND e.is_leap_day
                               AND e.stay_date >= d.stay_date AND e.stay_date < d.stay_date + $4::int)
          ORDER BY d.stay_date LIMIT 1`,
        [homeId, from, endOfYear(), length],
      );
      const found = rows[0]?.stay_date;
      if (found === undefined) throw new Error(`no free run of ${length} nights`);
      return found;
    };
    // Base com duas noites livres antes: a permanência medida é só a do teste (sem adjacência alheia ao cenário).
    let base = '';
    const day = (offset: number) => addDays(base, offset);

    it('[TECH-052][PD-002] o calendário da holding sob RLS: canal e estado das próprias reservas, noites de terceiros só como indisponíveis', async () => {
      base = addDays(await freeRun(co.homeId, at(0), 16), 2);
      const booked = await h.book(a, input(co.homeId, day(0), day(2)));
      const theirs = await h.book(b, input(co.homeId, day(8), day(10)));
      if (booked.status !== 'committed' || theirs.status !== 'committed') throw new Error('setup');
      const data = await readOwnUseCalendar(a.userId, a.holdingId, new Date(), h.db);
      if (data === null) throw new Error('holding should be visible');
      const status = (date: string) => data.nights.find((night) => night.date === date)?.status;
      expect(data).toMatchObject({ role: 'co_owner', partyId: a.partyId, secondHomeId: co.homeId });
      expect([status(day(0)), status(day(1))]).toEqual(['mine', 'mine']);
      // A data de saída não consome noite (PD-002): a noite da saída não é da reserva.
      expect(status(day(2))).toBe('available');
      expect([status(day(8)), status(day(9))]).toEqual(['unavailable', 'unavailable']);
      expect(data.bookings).toContainEqual({
        id: booked.result.booking_id,
        checkinDate: day(0),
        checkoutDate: day(2),
        channel: 'own_use',
        state: 'confirmed',
      });
      expect(data.bookings.map((row) => row.id)).not.toContain(theirs.result.booking_id);
      expect(
        data.balances.some((row) => row.exerciseYear === co.year && row.bucket === 'media'),
      ).toBe(true);
      expect(data.windows).toContainEqual(
        expect.objectContaining({ exerciseYear: co.year, isLeapDay: false, open: true }),
      );
      // Quem não representa a holding não a lê (sem oráculo).
      expect(await readOwnUseCalendar(b.userId, a.holdingId, new Date(), h.db)).toBeNull();
    });

    it('[ADR-0026][REQ-034][REQ-037] a prévia com os adaptadores reais concorda com o command, Co-Owner e Owner', async () => {
      const deps = {
        store: createPostgresBookingStore(),
        inventory: createOwnUseInventory(),
        rights: createPostgresOwnUseRights(),
        findFacts: findUseRightFacts,
        windowOpensAt: createUseWindowResolver(),
      };
      const run = (holding: PreviewHolding, checkin: string, checkout: string) =>
        h.db.transaction().execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          return previewOwnUseBooking(deps, tx, {
            holding,
            checkinDate: checkin,
            checkoutDate: checkout,
            now: new Date(),
          });
        });
      const holdingA: PreviewHolding = {
        secondHomeId: co.homeId,
        role: 'co_owner',
        stakeId: a.stakeId,
      };
      const conflict = await run(holdingA, day(7), day(11));
      expect(conflict.issues).toContainEqual({ code: 'unavailable', dates: [day(8), day(9)] });
      expect(await h.book(a, input(co.homeId, day(7), day(11)))).toEqual(
        rejected('ERR_BOOKING_CONFLICT'),
      );
      const own = await run(holdingA, day(1), day(3));
      expect(own.issues).toContainEqual({ code: 'own_booking', dates: [day(1)] });
      const valid = await run(holdingA, day(2), day(3));
      expect(valid).toMatchObject({ ok: true, nights: [day(2)], stay: 3 });
      expect(await h.book(a, input(co.homeId, day(2), day(3)))).toMatchObject({
        status: 'committed',
      });

      const ownerBase = await freeRun(owner.homeId, at(0), 6);
      const holdingOwner: PreviewHolding = {
        secondHomeId: owner.homeId,
        role: 'owner',
        stakeId: null,
      };
      const ownerPreview = await run(holdingOwner, ownerBase, addDays(ownerBase, 6));
      expect(ownerPreview).toMatchObject({ ok: true, stay: 6, usage: [] });
      expect(
        await h.book(owner.titular, input(owner.homeId, ownerBase, addDays(ownerBase, 6))),
      ).toMatchObject({
        status: 'committed',
      });
      expect((await run(holdingOwner, ownerBase, addDays(ownerBase, 2))).issues).toEqual([
        { code: 'unavailable', dates: [ownerBase, addDays(ownerBase, 1)] },
      ]);
    });
  });

  describe('notificação e leitura do Titular (REQ-097, TECH-052)', () => {
    it('[REQ-097][D6] a confirmação notifica a party que reservou, uma vez, mesmo com a varredura repetida', async () => {
      const outcome = await h.book(
        owner.titular,
        input(owner.homeId, `${NEXT_YEAR}-07-01`, `${NEXT_YEAR}-07-04`),
      );
      expect(outcome.status).toBe('committed');
      if (outcome.status !== 'committed') return;
      const sweep = () =>
        dispatchOutbox({
          store: createPostgresOutboxStore(h.db),
          consumers: new ConsumerRegistry<DatabaseTransaction>([
            ...createOwnUseBookingConsumers({ clock: systemClock }),
          ]),
          clock: systemClock,
          batchSize: 50,
          log: { info: () => undefined, warn: () => undefined, error: () => undefined },
        });
      await sweep();
      await sweep();
      const { rows } = await h.database.pool.query<{
        recipient_party_id: string;
        kind: string;
        data: { booking_id: string };
      }>(
        `SELECT recipient_party_id, kind, data FROM app.notification WHERE data->>'booking_id' = $1`,
        [outcome.result.booking_id],
      );
      expect(rows).toEqual([
        expect.objectContaining({
          recipient_party_id: owner.titular.partyId,
          kind: 'booking.own_use_confirmed',
          data: expect.objectContaining({ booking_id: outcome.result.booking_id, nights: 3 }),
        }),
      ]);
    });

    it('[TECH-052] cada Titular lê só as próprias reservas, saldos e notificações; campos de terceiros são negados', async () => {
      const claims = (userId: string) => ({ sub: userId, role: 'authenticated' as const });
      const read = (userId: string) =>
        withUserRead(h.db, claims(userId), async (tx) => ({
          bookings: await tx.selectFrom('app.booking').select(['id', 'second_home_id']).execute(),
          balances: await tx
            .selectFrom('app.use_right_balance')
            .select(['stake_id'])
            .distinct()
            .execute(),
          notifications: await tx.selectFrom('app.notification').select(['id']).execute(),
          occupied: await tx
            .selectFrom('app.date_occupancy')
            .select(['stay_date'])
            .where('released_at', 'is', null)
            .execute(),
        }));
      const mine = await read(a.userId);
      const theirs = await read(b.userId);
      const ownerView = await read(owner.titular.userId);
      const ids = async (stakeId: string) =>
        (
          await h.database.pool.query<{ id: string }>(
            'SELECT id FROM app.booking WHERE stake_id = $1',
            [stakeId],
          )
        ).rows
          .map((row) => row.id)
          .sort();
      expect(mine.bookings.map((row) => row.id).sort()).toEqual(await ids(a.stakeId!));
      expect(theirs.bookings.map((row) => row.id).sort()).toEqual(await ids(b.stakeId!));
      expect(mine.balances).toEqual([{ stake_id: a.stakeId }]);
      expect(ownerView.balances).toEqual([]);
      expect(ownerView.bookings.every((row) => row.second_home_id === owner.homeId)).toBe(true);
      const notificationsOf = async (partyId: string) =>
        (
          await h.database.pool.query<{ id: string }>(
            'SELECT id FROM app.notification WHERE recipient_party_id = $1',
            [partyId],
          )
        ).rows
          .map((row) => row.id)
          .sort();
      expect(ownerView.notifications.length).toBeGreaterThan(0);
      expect(mine.notifications.map((row) => row.id).sort()).toEqual(
        await notificationsOf(a.partyId),
      );
      expect(ownerView.notifications.map((row) => row.id).sort()).toEqual(
        await notificationsOf(owner.titular.partyId),
      );
      // A ocupação de outra Ação aparece só como noite indisponível (sem Ação nem reserva).
      expect(mine.occupied.length).toBe(theirs.occupied.length);
      for (const column of ['stake_id', 'booking_id', 'channel', 'opened_by_operation']) {
        await expect(
          withUserRead(h.db, claims(a.userId), (tx) =>
            tx
              .selectFrom('app.date_occupancy')
              .select(column as 'stay_date')
              .execute(),
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      for (const column of ['holding_id', 'stake_id', 'opened_by_operation']) {
        await expect(
          withUserRead(h.db, claims(a.userId), (tx) =>
            tx
              .selectFrom('app.booking')
              .select(column as 'id')
              .execute(),
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        withUserRead(h.db, claims(a.userId), (tx) =>
          tx
            .selectFrom('app.notification')
            .select('recipient_party_id' as 'id')
            .execute(),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('[TECH-052] delegação revogada ou expirada: o Titular deixa de ver reservas e notificações da party', async () => {
      const gone = await secondRepresentative(h, owner.titular);
      const claims = { sub: gone.userId, role: 'authenticated' as const };
      const count = () =>
        withUserRead(h.db, claims, async (tx) => ({
          bookings: (await tx.selectFrom('app.booking').select('id').execute()).length,
          notifications: (await tx.selectFrom('app.notification').select('id').execute()).length,
        }));
      expect((await count()).bookings).toBeGreaterThan(0);
      await revokeDelegation(h, gone.userId);
      expect(await count()).toEqual({ bookings: 0, notifications: 0 });
      const expiredUser = randomUUID();
      await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [expiredUser]);
      await ownerDelegation(h.database.pool, {
        partyId: owner.titular.partyId,
        userId: expiredUser,
        validFrom: "now() - interval '3 days'",
        validUntil: "now() - interval '1 day'",
      });
      expect(
        await withUserRead(
          h.db,
          { sub: expiredUser, role: 'authenticated' },
          async (tx) => (await tx.selectFrom('app.booking').select('id').execute()).length,
        ),
      ).toBe(0);
    });

    it('[TECH-052] o canal persistido aparece só nas reservas da própria holding; ids forjados e transferência não ampliam a leitura', async () => {
      const claims = (userId: string) => ({ sub: userId, role: 'authenticated' as const });
      const mine = await h.book(a, input(co.homeId, at(70), at(72)));
      const owned = await h.book(owner.titular, input(owner.homeId, at(80), at(82)));
      if (mine.status !== 'committed' || owned.status !== 'committed') throw new Error('setup');
      const aBooking = mine.result.booking_id;
      const ownerBooking = owned.result.booking_id;

      // Canal e estado persistidos da própria reserva (spec booking §7).
      expect(
        await withUserRead(h.db, claims(a.userId), (tx) =>
          tx
            .selectFrom('app.booking')
            .select(['channel', 'state'])
            .where('id', '=', aBooking)
            .execute(),
        ),
      ).toEqual([{ channel: 'own_use', state: 'confirmed' }]);

      // Outra Ação da mesma Second Home: o id forjado não devolve nada, nem pelo SQL direto como `authenticated`.
      const forged = (userId: string, bookingId: string) =>
        withUserRead(h.db, claims(userId), async (tx) => ({
          query: await tx
            .selectFrom('app.booking')
            .select('id')
            .where('id', '=', bookingId)
            .execute(),
          raw: (
            await sql<{
              id: string;
            }>`SELECT id, channel FROM app.booking WHERE id = ${bookingId} OR second_home_id = ${co.homeId}`.execute(
              tx,
            )
          ).rows.filter((row) => row.id === bookingId),
        }));
      expect(await forged(b.userId, aBooking)).toEqual({ query: [], raw: [] });
      expect(await forged(a.userId, ownerBooking)).toEqual({ query: [], raw: [] });
      // Filtrar por coluna sem GRANT também é negado (nenhum oráculo por Ação ou holding).
      for (const column of ['stake_id', 'holding_id']) {
        await expect(
          withUserRead(h.db, claims(b.userId), (tx) =>
            tx
              .selectFrom('app.booking')
              .select('id')
              .where(column as 'id', '=', a.stakeId!)
              .execute(),
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }

      // Transferência (fixture direta: a W12 não transfere): a holding de A termina e outra party assume a mesma Ação.
      // A reserva é da holding da época — o novo titular não vê as reservas do anterior, e o anterior perde o acesso.
      const transfer = async (titular: Titular) => {
        const party = await ownerParty(h.database.pool);
        const userId = randomUUID();
        await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
        await ownerDelegation(h.database.pool, { partyId: party, userId });
        const client = await h.database.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SET LOCAL session_replication_role = 'replica'");
          await client.query(
            "UPDATE app.holding SET valid_until = now() - interval '1 second' WHERE id = $1",
            [titular.holdingId],
          );
          await client.query(
            `INSERT INTO app.holding (id, acquisition_id, second_home_id, party_id, role, stake_id, participation_bps,
                                      valid_from, valid_until, operation_id)
             SELECT gen_random_uuid(), acquisition_id, second_home_id, $2, role, stake_id, participation_bps,
                    now() - interval '1 second', NULL, operation_id
               FROM app.holding WHERE id = $1`,
            [titular.holdingId, party],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        return userId;
      };
      const ids = (userId: string) =>
        withUserRead(h.db, claims(userId), async (tx) =>
          (await tx.selectFrom('app.booking').select('id').execute()).map((row) => row.id),
        );
      const heir = await transfer(a);
      expect(await ids(heir)).toEqual([]);
      expect(await ids(a.userId)).toEqual([]);
      const ownerHeir = await transfer(owner.titular);
      expect(await ids(ownerHeir)).toEqual([]);
      expect(await ids(owner.titular.userId)).toEqual([]);
      // A outra Ação continua vendo as próprias reservas.
      expect((await ids(b.userId)).length).toBeGreaterThan(0);
    });
  });
});
