import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import { rejectionForConstraint, CLOSED_CAPABILITIES } from '@/features/platform/domain/errors';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  addDays,
  bookingHarness,
  drainBalance,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from '../features/booking/booking-support';
import {
  activate,
  addAdmin,
  deactivate,
  lastStartedNight,
  type Admin,
} from '../features/booking/lifecycle-support';
import {
  completeDrawWithCalendar,
  formalizeCoOwnerAt,
  LEAP_AHEAD,
  sealByFixture,
} from '../features/calendar/use-right-support';
import {
  asUser,
  freeNights,
  inOperation,
  openHomeOperation,
  selectNight,
  sideEffects,
  type Purpose,
} from '../features/calendar/luxtory-selection-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });
const rights = createUseRightCalendar(temporalCivilTime);
const SELECTION_MIGRATION = 'migrations/20261119061707_inventory_luxtory_selection.sql';

describe('W14 — seleção Luxtory no banco: só custódia, K3, janela, 29/02 e capacidade (luxtory_app)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;

  const asAdmin = () => ({ kind: 'admin' as const, admin });
  const select = (homeId: string, work: (client: pg.Client, op: string) => Promise<unknown>) =>
    inOperation(h.database.appUrl, 'select_luxtory_capacity', asAdmin(), homeId, work);

  async function custody(homeId: string, date: string) {
    const { rows } = await h.database.pool.query<{
      holder_kind: string;
      purpose: string | null;
      inventory_origin: string | null;
      authorization_ref: string | null;
      basis: string | null;
    }>(
      `SELECT holder_kind, purpose, inventory_origin, authorization_ref, basis FROM app.date_custody
        WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
      [homeId, date],
    );
    return rows[0]!;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    owner = await h.ownerScenario();
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  describe('K3 fechada (ADR-0030 §2)', () => {
    it('[TECH-051][ADR-0030] sem a K3, nenhuma seleção é executável pelo papel da aplicação, nem por SQL direto', async () => {
      await deactivate(h, 'luxtory_selection');
      const [night] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 1);
      const before = await sideEffects(h.database.pool, co.homeId);
      for (const purpose of ['maintenance', 'inventory'] as const)
        await expect(select(co.homeId, (c, op) => selectNight(c, op, co.homeId, night!, purpose))).rejects.toEqual(
          constraint('luxtory_selection_not_activated'),
        );
      expect(await custody(co.homeId, night!)).toMatchObject({ holder_kind: 'spe_pool' });
      expect(await sideEffects(h.database.pool, co.homeId)).toEqual(before);
      // `42501` nomeado: funcionalidade fechada classificada (rollback sem recusa gravada no executor).
      expect(CLOSED_CAPABILITIES.get('luxtory_selection_not_activated')).toBe('luxtory_selection');
    });

    it('[ADR-0030 §2] a K3 só amplia o CHECK: K1 e K2 seguem aceitas, capacidade desconhecida falha e a aplicação não ativa', async () => {
      const { rows } = await h.database.pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'capability_activation_capability_check'`,
      );
      expect(rows[0]!.def).toContain("'own_use_booking'");
      expect(rows[0]!.def).toContain("'own_use_lifecycle'");
      expect(rows[0]!.def).toContain("'luxtory_selection'");
      await expect(
        h.database.pool.query(`INSERT INTO app.capability_activation VALUES ('other', now(), 'test')`),
      ).rejects.toEqual(constraint('capability_activation_capability_check'));
      const app = await h.client(h.database.appUrl);
      try {
        await expect(
          app.query(`INSERT INTO app.capability_activation VALUES ('luxtory_selection', now(), 'forged')`),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
      }
    });

    it('[BR-120][TECH-020][REQ-033] capacidade Luxtory: a da alocação inicial no exercício parcial, a da configuração depois', async () => {
      const { home } = await h.root();
      const allocation = await h.run(h.handlers.initialAllocation, {
        second_home_id: home.id,
        configuration_id: 2,
        operation_start_date: '2027-07-01',
        grants: [
          { position: 1, alta: 30, media: 61 },
          { position: 2, alta: 30, media: 61 },
        ],
        luxtory_capacity: { alta: 2, media: 0 },
        basis_ref: 'allocation:synthetic',
      });
      if (allocation.status !== 'committed') throw new Error(`allocation ${allocation.code}`);
      const formalized = await h.run(h.handlers.formalizeAcquisition, {
        ...(await h.coOwner(home.id)),
        operation_start_date: '2027-07-01',
        initial_allocation_id: allocation.result.id,
      });
      expect(formalized.status).toBe('committed');
      const { rows } = await h.database.pool.query(
        `SELECT y AS year, app.luxtory_capacity($1, y, 'alta') AS alta, app.luxtory_capacity($1, y, 'media') AS media
           FROM unnest(ARRAY[2026, 2027, 2028]) AS y`,
        [home.id],
      );
      expect(rows).toEqual([
        { year: 2026, alta: 0, media: 0 },
        { year: 2027, alta: 2, media: 0 },
        { year: 2028, alta: 7, media: 6 },
      ]);
    });
  });

  describe('K3 ativada só no banco de teste', () => {
    beforeAll(async () => {
      await activate(h, 'own_use_booking', 'luxtory_selection');
    });

    it('[REQ-036][TECH-022][TECH-023] cada data recebe a finalidade em `luxtory/{finalidade}`; nada além da custódia muda', async () => {
      const media = await freeNights(h.database.pool, co.homeId, co.year, 'media', 4);
      const [alta] = await freeNights(h.database.pool, co.homeId, co.year, 'alta', 1);
      const plan: [string, Purpose][] = [
        [media[0]!, 'maintenance'],
        [media[1]!, 'marketing'],
        [media[2]!, 'promotion'],
        [media[3]!, 'production'],
        [alta!, 'inventory'],
      ];
      const before = await sideEffects(h.database.pool, co.homeId);
      await select(co.homeId, async (c, op) => {
        for (const [date, purpose] of plan) await selectNight(c, op, co.homeId, date, purpose);
      });
      for (const [date, purpose] of plan)
        expect(await custody(co.homeId, date)).toEqual({
          holder_kind: 'luxtory',
          purpose,
          inventory_origin: purpose === 'inventory' ? 'annual_allocation' : null,
          authorization_ref: 'Ata Luxtory W14',
          basis: null,
        });
      // Seleção de capacidade não é ocupação: nenhuma reserva, ocupação, consumo, holding, party ou Ação nova.
      expect(await sideEffects(h.database.pool, co.homeId)).toEqual(before);
      // [REQ-040] a entrada no Inventário Luxtory aparece com origem e autorização identificáveis.
      const { rows } = await h.database.pool.query(
        `SELECT purpose, inventory_origin FROM app.luxtory_inventory WHERE second_home_id = $1`,
        [co.homeId],
      );
      expect(rows).toEqual([{ purpose: 'inventory', inventory_origin: 'annual_allocation' }]);
    });

    it('[TECH-110][INV-3] Inventário exige `annual_allocation`; outra origem ou origem fora do Inventário falha', async () => {
      const [a, b, c] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 3);
      await expect(
        select(co.homeId, (cl, op) => selectNight(cl, op, co.homeId, a!, 'inventory', { origin: null })),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await expect(
        select(co.homeId, (cl, op) => selectNight(cl, op, co.homeId, b!, 'inventory', { origin: 'luxchange_cession' })),
      ).rejects.toEqual(constraint('custody_transition_closed_table'));
      await expect(
        select(co.homeId, (cl, op) => selectNight(cl, op, co.homeId, c!, 'marketing', { origin: 'annual_allocation' })),
      ).rejects.toEqual(constraint('custody_inventory_origin_required'));
      for (const date of [a, b, c]) expect(await custody(co.homeId, date!)).toMatchObject({ holder_kind: 'spe_pool' });
    });

    it('[REQ-036][TECH-051] base registrada, command, Second Home e Admin ativa da operação são conferidos no banco', async () => {
      const [night] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 1);
      await expect(
        select(co.homeId, (c, op) => selectNight(c, op, co.homeId, night!, 'marketing', { basis: '  ' })),
      ).rejects.toEqual(constraint('luxtory_selection_basis'));
      await expect(
        inOperation(h.database.appUrl, 'select_luxtory_capacity', asAdmin(), owner.homeId, (c, op) =>
          selectNight(c, op, co.homeId, night!, 'marketing'),
        ),
      ).rejects.toEqual(constraint('luxtory_selection_binding'));
      await expect(
        inOperation(h.database.appUrl, 'select_luxtory_capacity', { kind: 'titular', titular: co.titulares[0]! }, co.homeId, (c, op) =>
          selectNight(c, op, co.homeId, night!, 'marketing'),
        ),
      ).rejects.toEqual(constraint('permission_staff_role'));
      const revoked = await addAdmin(h);
      await h.database.pool.query(`SELECT app.revoke_staff_role($1, 'Teste W14')`, [revoked.roleId]);
      await expect(
        inOperation(h.database.appUrl, 'select_luxtory_capacity', { kind: 'admin', admin: revoked }, co.homeId, (c, op) =>
          selectNight(c, op, co.homeId, night!, 'marketing'),
        ),
      ).rejects.toEqual(constraint('permission_staff_role'));
      expect(rejectionForConstraint('permission_staff_role')).toBe('ERR_PERMISSION');
      expect(await custody(co.homeId, night!)).toMatchObject({ holder_kind: 'spe_pool' });
    });

    it('[REQ-036][TECH-043] noite já iniciada é recusada (custódia indisponível), pelo relógio do servidor', async () => {
      const started = await lastStartedNight(h, co.homeId);
      await expect(select(co.homeId, (c, op) => selectNight(c, op, co.homeId, started, 'maintenance'))).rejects.toEqual(
        constraint('custody_selection_night_future'),
      );
      expect(rejectionForConstraint('custody_selection_night_future')).toBe('ERR_CAPACITY_UNAVAILABLE');
    });

    it('[REQ-037][TECH-022] Second Home Owner não tem capacidade Luxtory: a custódia `owner` não vai para a seleção', async () => {
      const { rows } = await h.database.pool.query<{ stay_date: string }>(
        `SELECT stay_date::text AS stay_date FROM app.second_home_date
          WHERE second_home_id = $1 AND checkin_at > now() + interval '30 days' ORDER BY stay_date LIMIT 1`,
        [owner.homeId],
      );
      await expect(
        inOperation(h.database.appUrl, 'select_luxtory_capacity', asAdmin(), owner.homeId, (c, op) =>
          selectNight(c, op, owner.homeId, rows[0]!.stay_date, 'maintenance'),
        ),
      ).rejects.toEqual(constraint('inventory_transition_not_enabled'));
    });

    it('[REQ-036][BR-122][TECH-027] antes da janela N+1 — inclusive manutenção — recusa; o 29/02 nunca é selecionável', async () => {
      const home = await formalizeCoOwnerAt(h, 2, `${LEAP_AHEAD}-01-01`, new Date());
      await sealByFixture(h, home.homeId, LEAP_AHEAD);
      await completeDrawWithCalendar(h, home.acquisitionId);
      for (const purpose of ['maintenance', 'inventory'] as const)
        await expect(
          select(home.homeId, (c, op) => selectNight(c, op, home.homeId, `${LEAP_AHEAD}-03-10`, purpose)),
        ).rejects.toEqual(constraint('window_luxtory_selection'));
      expect(rejectionForConstraint('window_luxtory_selection')).toBe('ERR_WINDOW_NOT_OPEN');
      await expect(
        select(home.homeId, (c, op) => selectNight(c, op, home.homeId, `${LEAP_AHEAD}-02-29`, 'maintenance')),
      ).rejects.toEqual(constraint('custody_selection_leap_day'));
      expect(rejectionForConstraint('custody_selection_leap_day')).toBe('ERR_CAPACITY_UNAVAILABLE');
      expect(await custody(home.homeId, `${LEAP_AHEAD}-02-29`)).toMatchObject({ holder_kind: 'spe_pool' });
    });

    it('[BR-122][TECH-042] a janela da Luxtory é a gêmea SQL de `windowOpensAt` na posição N+1; sem sorteio, sem janela', async () => {
      const leapHome = await formalizeCoOwnerAt(h, 2, `${LEAP_AHEAD}-01-01`, new Date());
      const cases: [string, number][] = [
        [co.homeId, co.year - 1],
        [co.homeId, co.year],
        [co.homeId, co.year + 1],
      ];
      for (const [homeId, year] of cases) {
        const { rows } = await h.database.pool.query<{
          opens: Date | null;
          formalized_at: Date;
          timezone: string;
          stakes: number;
          first: number;
        }>(
          `SELECT app.luxtory_window_opens_at(a.second_home_id, $2) AS opens, a.formalized_at, s.timezone,
                  (SELECT count(*)::int FROM app.stake k WHERE k.second_home_id = a.second_home_id) AS stakes,
                  a.exercise_year AS first
             FROM app.acquisition a JOIN app.second_home s ON s.id = a.second_home_id WHERE a.second_home_id = $1`,
          [homeId, year],
        );
        const row = rows[0]!;
        const expected =
          year < row.first
            ? null
            : rights.windowOpensAt({
                exerciseYear: year,
                position: row.stakes + 1,
                stakes: row.stakes,
                formalizedAt: new Date(row.formalized_at),
                timezone: row.timezone,
              });
        expect(row.opens === null ? null : new Date(row.opens).toISOString()).toBe(expected?.toISOString() ?? null);
      }
      const { rows } = await h.database.pool.query<{ opens: Date | null }>(
        `SELECT app.luxtory_window_opens_at($1, $2) AS opens`,
        [leapHome.homeId, LEAP_AHEAD],
      );
      expect(rows[0]!.opens).toBeNull();
    });

    it('[REQ-016][EC-5][INV-4] Co-Owners sem saldo: a Luxtory seleciona exatamente a sua quantidade por categoria', async () => {
      const ec5 = await h.coOwnerScenario(2);
      for (const titular of ec5.titulares)
        for (const bucket of ['alta', 'media'] as const) {
          const [keep] = await freeNights(h.database.pool, ec5.homeId, ec5.year, bucket, 1);
          await drainBalance(h, ec5, titular.stakeId!, ec5.year, bucket, [keep!]);
        }
      // O limite individual bloqueia o Co-Owner (W12) mesmo com noites livres na SPE.
      const [free] = await freeNights(h.database.pool, ec5.homeId, ec5.year, 'media', 1);
      const refused = await h.book(ec5.titulares[0]!, {
        second_home_id: ec5.homeId,
        checkin_date: free!,
        checkout_date: addDays(free!, 1),
      });
      expect(refused).toMatchObject({ status: 'rejected', code: 'ERR_USE_RIGHT_BALANCE' });
      const capacity = await h.database.pool.query<{ alta: number; media: number }>(
        `SELECT app.luxtory_capacity($1, $2, 'alta') AS alta, app.luxtory_capacity($1, $2, 'media') AS media`,
        [ec5.homeId, ec5.year],
      );
      expect(capacity.rows[0]).toEqual({ alta: 7, media: 6 });
      const alta = await freeNights(h.database.pool, ec5.homeId, ec5.year, 'alta', 8);
      const media = await freeNights(h.database.pool, ec5.homeId, ec5.year, 'media', 7);
      await select(ec5.homeId, async (c, op) => {
        for (const date of alta.slice(0, 7)) await selectNight(c, op, ec5.homeId, date, 'inventory');
      });
      // Categorias não se compensam: a Alta esgotada não toca a Média.
      await expect(select(ec5.homeId, (c, op) => selectNight(c, op, ec5.homeId, alta[7]!, 'maintenance'))).rejects.toEqual(
        constraint('balance_luxtory_capacity'),
      );
      await select(ec5.homeId, async (c, op) => {
        for (const date of media.slice(0, 6)) await selectNight(c, op, ec5.homeId, date, 'maintenance');
      });
      await expect(select(ec5.homeId, (c, op) => selectNight(c, op, ec5.homeId, media[6]!, 'marketing'))).rejects.toEqual(
        constraint('balance_luxtory_capacity'),
      );
      expect(rejectionForConstraint('balance_luxtory_capacity')).toBe('ERR_USE_RIGHT_BALANCE');
    });

    it('[INV-4] a consulta de invariantes acusa seleção acima da capacidade gravada por fora dos gatilhos', async () => {
      const client = await h.client(h.database.url);
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        const op = await openHomeOperation(client, 'select_luxtory_capacity', asAdmin(), co.homeId);
        for (const date of await freeNights(client, co.homeId, co.year, 'alta', 7))
          await selectNight(client, op, co.homeId, date, 'promotion');
        const { rows } = await client.query<{ invariant: string }>(
          `SELECT invariant FROM app.inventory_invariant_breaches() WHERE second_home_id = $1`,
          [co.homeId],
        );
        expect(rows.map((row) => row.invariant)).toContain('INV-4');
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    });

    it('[CONC-11] seleção × reserva na mesma noite: exatamente uma confirma; reserva antes, a seleção não acontece', async () => {
      const [first, second] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 2);
      const selector = await h.client(h.database.appUrl);
      try {
        await selector.query('BEGIN');
        const op = await openHomeOperation(selector, 'select_luxtory_capacity', asAdmin(), co.homeId);
        await selectNight(selector, op, co.homeId, first!, 'marketing');
        const booking = h.book(co.titulares[0]!, {
          second_home_id: co.homeId,
          checkin_date: first!,
          checkout_date: addDays(first!, 1),
        });
        await waitForLockWaiter(h.database.pool);
        await selector.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await selector.query('COMMIT');
        const outcome = await booking;
        expect(outcome.status).toBe('rejected');
        expect(['ERR_CAPACITY_UNAVAILABLE', 'ERR_BOOKING_CONFLICT']).toContain(
          outcome.status === 'rejected' ? outcome.code : null,
        );
      } finally {
        await selector.end();
      }
      expect(await custody(co.homeId, first!)).toMatchObject({ holder_kind: 'luxtory', purpose: 'marketing' });
      const booked = await h.book(co.titulares[0]!, {
        second_home_id: co.homeId,
        checkin_date: second!,
        checkout_date: addDays(second!, 1),
      });
      expect(booked.status).toBe('committed');
      await expect(select(co.homeId, (c, op) => selectNight(c, op, co.homeId, second!, 'marketing'))).rejects.toBeDefined();
      expect(await custody(co.homeId, second!)).toMatchObject({ holder_kind: 'use_right', basis: 'reserved_right' });
    });

    it('[CONC-11][INV-4] seleções concorrentes na mesma categoria se serializam e nunca passam da capacidade', async () => {
      const race = await h.coOwnerScenario(2);
      const alta = await freeNights(h.database.pool, race.homeId, race.year, 'alta', 8);
      await select(race.homeId, async (c, op) => {
        for (const date of alta.slice(0, 6)) await selectNight(c, op, race.homeId, date, 'inventory');
      });
      const first = await h.client(h.database.appUrl);
      try {
        await first.query('BEGIN');
        const op = await openHomeOperation(first, 'select_luxtory_capacity', asAdmin(), race.homeId);
        await selectNight(first, op, race.homeId, alta[6]!, 'inventory');
        const second = select(race.homeId, (c, op2) => selectNight(c, op2, race.homeId, alta[7]!, 'production'));
        const settled = second.then(
          () => 'committed',
          (error: unknown) => error,
        );
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await first.query('COMMIT');
        expect(await settled).toEqual(constraint('balance_luxtory_capacity'));
      } finally {
        await first.end();
      }
      const { rows } = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.date_custody c JOIN app.second_home_date d USING (second_home_id, stay_date)
          WHERE c.second_home_id = $1 AND c.closed_at IS NULL AND c.holder_kind = 'luxtory' AND d.season = 'alta'
            AND d.exercise_year = $2`,
        [race.homeId, race.year],
      );
      expect(rows[0]!.n).toBe(7);
    });

    it('[TECH-022][P-12] com a K3 ativa, só a seleção é liberada: sem saída de `luxtory`, sem outras transições', async () => {
      const [selected, other] = await freeNights(h.database.pool, co.homeId, co.year, 'alta', 2);
      await select(co.homeId, (c, op) => selectNight(c, op, co.homeId, selected!, 'maintenance'));
      // Nenhuma saída de `luxtory/{≠ inventory}` (P-12) nem devolução de `luxtory/inventory` pelo papel da aplicação.
      await expect(
        select(co.homeId, async (c, op) => {
          await c.query(
            `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $3
              WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
            [co.homeId, selected, op],
          );
        }),
      ).rejects.toEqual(constraint('inventory_transition_not_enabled'));
      // A operação da seleção não abre `use_right/delinquency` sobre `spe_pool`.
      await expect(
        select(co.homeId, async (c, op) => {
          const { rows } = await c.query<{ id: string }>(
            `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $3
              WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL RETURNING id`,
            [co.homeId, other, op],
          );
          await c.query(
            `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, parent_custody_id,
               opened_by_operation)
             VALUES (gen_random_uuid(), $1, $2, 'use_right', $3, 'delinquency', $4, $5)`,
            [co.homeId, other, co.titulares[0]!.stakeId, rows[0]!.id, op],
          );
        }),
      ).rejects.toEqual(constraint('inventory_transition_not_enabled'));
      expect(await custody(co.homeId, other!)).toMatchObject({ holder_kind: 'spe_pool' });
    });

    it('[ADR-0026 §5] o Titular vê a noite selecionada como indisponível, sem a finalidade', async () => {
      const [night] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 1);
      await select(co.homeId, (c, op) => selectNight(c, op, co.homeId, night!, 'production'));
      const visible = await asUser<{ holder_kind: string }>(
        h.database.appUrl,
        co.titulares[1]!.userId,
        `SELECT holder_kind FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
        [co.homeId, night],
      );
      expect(visible).toEqual([{ holder_kind: 'luxtory' }]);
      await expect(
        asUser(h.database.appUrl, co.titulares[1]!.userId, `SELECT purpose FROM app.date_custody LIMIT 1`),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('[ADR-0030 §2] com a K3 presente, o rollback da W14 é recusado', async () => {
      const down = (await readFile(SELECTION_MIGRATION, 'utf8')).split('-- migrate:down')[1]!;
      const client = await h.client(h.database.url);
      try {
        await client.query('BEGIN');
        await expect(client.query(down)).rejects.toThrow(/activation decision/);
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    });
  });
});
