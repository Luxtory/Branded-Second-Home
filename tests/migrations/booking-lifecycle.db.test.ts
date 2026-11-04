import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  addDays,
  bookableStart,
  bookingHarness,
  revokeDelegation,
  secondRepresentative,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
  type Titular,
} from '../features/booking/booking-support';
import {
  activate,
  addAdmin,
  asOperation,
  bookingRow,
  bookNow,
  closeBooking,
  connect,
  deactivate,
  historicBooking,
  insertTransition,
  lastStartedNight,
  lifecycleFacts,
  openException,
  openOperation,
  recordResolution,
  resolveWithoutEffect,
  unstartedNights,
  type Admin,
  type OperationActor,
} from '../features/booking/lifecycle-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });

describe('W13 E1 — ciclo da reserva no banco com os privilégios reais (luxtory_app)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;
  /** Última noite iniciada (Co-Owner e Owner) e primeira noite reservável pelo command da W12. */
  let S: string;
  let So: string;
  let first: string;
  const s = (offset: number) => addDays(S, offset);
  const so = (offset: number) => addDays(So, offset);
  const at = (offset: number) => addDays(first, offset);
  const titular = (t: Titular): OperationActor => ({ kind: 'titular', titular: t });
  const asAdmin = (): OperationActor => ({ kind: 'admin', admin });
  const system: OperationActor = { kind: 'system' };
  const app = <T>(command: string, actor: OperationActor, work: (client: pg.Client, op: string) => Promise<T>) =>
    asOperation(h.database.appUrl, command, actor, work);

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    owner = await h.ownerScenario();
    admin = await addAdmin(h);
    S = await lastStartedNight(h, co.homeId);
    So = await lastStartedNight(h, owner.homeId);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
  }, 240_000);
  afterAll(() => h.close());

  describe('chave K2 e privilégios (ADR-0027 §5)', () => {
    it('[ADR-0027] a W13 só amplia o CHECK: tabela de ativação vazia; a aplicação não grava estado nem autorização', async () => {
      const { rows } = await h.database.pool.query<{ n: number; lifecycle: boolean }>(
        `SELECT (SELECT count(*)::int FROM app.capability_activation) AS n,
                pg_get_constraintdef(c.oid) LIKE '%own_use_lifecycle%' AS lifecycle
           FROM pg_constraint c WHERE c.conname = 'capability_activation_capability_check'`,
      );
      // Só as linhas de teste deste arquivo (o banco-modelo nasce sem nenhuma; a prontidão confere isso).
      expect(rows[0]).toEqual({ n: 2, lifecycle: true });
      const privileges = await h.database.pool.query<{ object: string; privileges: string }>(
        `SELECT o.object, concat_ws(',',
                  CASE WHEN has_table_privilege('luxtory_app', o.object, 'SELECT') THEN 'SELECT' END,
                  CASE WHEN has_table_privilege('luxtory_app', o.object, 'INSERT') THEN 'INSERT' END,
                  CASE WHEN has_any_column_privilege('luxtory_app', o.object, 'UPDATE') THEN 'UPDATE' END,
                  CASE WHEN has_table_privilege('luxtory_app', o.object, 'DELETE') THEN 'DELETE' END,
                  CASE WHEN has_table_privilege('luxtory_app', o.object, 'TRUNCATE') THEN 'TRUNCATE' END) AS privileges
           FROM unnest(ARRAY['app.booking', 'app.booking_state_transition', 'app.booking_exception',
                             'app.booking_exception_resolution', 'app.booking_no_show_candidate',
                             'app.booking_authorization_request', 'app.booking_authorization',
                             'app.booking_authorization_revocation', 'app.booking_authorization_use',
                             'app.date_occupancy']) AS o(object)`,
      );
      expect(Object.fromEntries(privileges.rows.map((row) => [row.object, row.privileges]))).toEqual({
        'app.booking': 'SELECT,INSERT',
        'app.booking_state_transition': 'SELECT,INSERT',
        'app.booking_exception': 'SELECT,INSERT',
        'app.booking_exception_resolution': 'SELECT,INSERT',
        'app.booking_no_show_candidate': 'SELECT,INSERT',
        'app.booking_authorization_request': 'SELECT,INSERT',
        'app.booking_authorization': 'SELECT',
        'app.booking_authorization_revocation': 'SELECT',
        'app.booking_authorization_use': 'SELECT,INSERT',
        // W13: liberação (só as colunas de liberação; a regra no banco decide).
        'app.date_occupancy': 'SELECT,INSERT,UPDATE',
      });
      const functions = await h.database.pool.query<{ fn: string; app: boolean }>(
        `SELECT f.fn, has_function_privilege('luxtory_app', f.fn, 'EXECUTE') AS app
           FROM unnest(ARRAY['app.booking_state_apply()', 'app.authorize_booking_action(uuid, text)',
                             'app.revoke_booking_authorization(uuid, text)', 'app.assert_own_use_activation_ready()',
                             'app.use_right_balance_apply()']) AS f(fn)`,
      );
      expect(functions.rows.every((row) => !row.app)).toBe(true);
    });

    it('[ADR-0027 §5] sem a K2, os commands da W13 são recusados no banco; o job segue limitado pelo instante', async () => {
      await deactivate(h, 'own_use_lifecycle');
      try {
        const b = await historicBooking(h, { homeId: co.homeId, titular: co.titulares[0]!, checkin: s(-8), checkout: s(-6) });
        await expect(
          app('cancel_own_use_booking', titular(co.titulares[0]!), (c, op) =>
            closeBooking(c, op, b, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: null } }),
          ),
        ).rejects.toEqual(constraint('booking_lifecycle_not_activated'));
        await expect(
          app('open_exception', asAdmin(), (c, op) => openException(c, op, b, 'operational')),
        ).rejects.toEqual(constraint('booking_lifecycle_not_activated'));
        // Jobs fora da K2: o período já terminou, então avança `confirmed → in_use → completed` numa execução.
        await app('advance_booking_states', system, async (c, op) => {
          await insertTransition(c, op, { bookingId: b, kind: 'advance', toState: 'in_use' });
          await insertTransition(c, op, { bookingId: b, kind: 'advance', toState: 'completed' });
        });
        expect((await bookingRow(h.database.pool, b)).state).toBe('completed');
      } finally {
        await activate(h, 'own_use_lifecycle');
      }
    });
  });

  describe('cancelamento do Titular (REQ-080, REQ-081, TECH-043, D7)', () => {
    it('[REQ-080][BR-280] tempestivo: libera todas, reserved_right → spe_pool, restore por noite; saldo devolvido', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(20), at(23));
      const before = await lifecycleFacts(h, id);
      const nights = await unstartedNights(h.database.pool, id);
      expect(nights).toEqual([at(20), at(21), at(22)]);
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(20) } }),
      );
      const after = await lifecycleFacts(h, id);
      expect(after).toMatchObject({
        state: 'cancelled',
        cancellation_class: 'timely',
        transitions: 1,
        active_occupancies: 0,
        released: 3,
        reserved: 0,
        forfeited: 0,
        restores: 3,
        corrections: 0,
      });
      expect(after.consumed).toBe(before.consumed - 3);
      // Classificação gravada uma vez; nada mais muda a reserva cancelada.
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(20) } }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_transition_pair'));
    });

    it('[D7][T-1308] termos esperados diferentes dos calculados → recusa sem efeito; prévia nova é aceita', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(30), at(32));
      const before = await lifecycleFacts(h, id);
      for (const expected of [
        { cancellationClass: 'late', firstAffectedDate: at(30) },
        { cancellationClass: 'timely', firstAffectedDate: at(31) },
        { cancellationClass: null, firstAffectedDate: at(30) },
      ])
        await expect(
          app('cancel_own_use_booking', titular(a), (c, op) => closeBooking(c, op, id, { kind: 'cancellation', expected })),
        ).rejects.toEqual(constraint('cancellation_terms_changed'));
      expect(await lifecycleFacts(h, id)).toEqual(before);
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(30) } }),
      );
      expect((await lifecycleFacts(h, id)).state).toBe('cancelled');
    });

    it('[REQ-080][BR-281][TECH-060] tardio: libera as não iniciadas, que viram forfeited_right; consumo mantido', async () => {
      const a = co.titulares[0]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(2), checkout: s(4) });
      const before = await lifecycleFacts(h, id);
      // Forjar o tempestivo (restore ou volta à SPE) num cancelamento tardio é recusado pela regra do banco.
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'late', firstAffectedDate: s(2) },
            successor: 'spe_pool',
          }),
        ),
      ).rejects.toEqual(constraint('custody_lifecycle_successor'));
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'late', firstAffectedDate: s(2) },
            reversal: 'restore',
          }),
        ),
      ).rejects.toEqual(constraint('booking_restore_binding'));
      expect(await lifecycleFacts(h, id)).toEqual(before);
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: s(2) } }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'cancelled',
        cancellation_class: 'late',
        active_occupancies: 0,
        forfeited: 2,
        restores: 0,
        consumed: before.consumed,
      });
    });

    it('[EC-10][TECH-055][TECH-046] reserva em curso: job avança e sinaliza; Titular cancela só as noites não iniciadas', async () => {
      const b = co.titulares[1]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: b, checkin: s(-1), checkout: s(2) });
      // O job só faz o que o instante permite: em uso (1º check-in passou), ainda não concluída.
      await app('advance_booking_states', system, (c, op) =>
        insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'in_use' }),
      );
      await expect(
        app('advance_booking_states', system, (c, op) =>
          insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'completed' }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_advance_early'));
      await app('flag_no_show_candidates', system, (c, op) =>
        c.query(
          `INSERT INTO app.booking_no_show_candidate (booking_id, operation_id, flagged_at) VALUES ($1, $2, now())`,
          [id, op],
        ),
      );
      // Uma vez por reserva.
      await expect(
        app('flag_no_show_candidates', system, (c, op) =>
          c.query(`INSERT INTO app.booking_no_show_candidate (booking_id, operation_id, flagged_at) VALUES ($1, $2, now())`, [
            id,
            op,
          ]),
        ),
      ).rejects.toMatchObject({ code: '23505' });
      expect(await unstartedNights(h.database.pool, id)).toEqual([s(1)]);
      // Noite iniciada nunca muda.
      await expect(
        app('cancel_own_use_booking', titular(b), (c, op) =>
          closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'late', firstAffectedDate: s(1) },
            nights: [s(0), s(1)],
          }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_night_started'));
      // Faltar uma noite não iniciada (efeito incompleto) também é recusado, no COMMIT.
      await expect(
        app('cancel_own_use_booking', titular(b), (c, op) =>
          closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'late', firstAffectedDate: s(1) },
            nights: [],
          }),
        ),
      ).rejects.toEqual(constraint('booking_closure_occupancy'));
      await app('cancel_own_use_booking', titular(b), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: s(1) } }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'cancelled',
        cancellation_class: 'late',
        transitions: 2,
        active_occupancies: 2,
        released: 1,
        reserved: 2,
        forfeited: 1,
      });
    });

    it('[TECH-055] sem noite não iniciada, o Titular não cancela; o período encerrado avança a concluída', async () => {
      const a = co.titulares[0]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(-5), checkout: s(-3) });
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: null } }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_no_unstarted_night'));
      await expect(
        app('flag_no_show_candidates', system, (c, op) =>
          c.query(`INSERT INTO app.booking_no_show_candidate (booking_id, operation_id, flagged_at) VALUES ($1, $2, now())`, [
            id,
            op,
          ]),
        ),
      ).rejects.toEqual(constraint('conflict_booking_no_show_window'));
    });

    it('[REQ-081][BR-163] Owner: cancela a qualquer tempo, sem classe; libera as não iniciadas; nenhum movimento de custódia ou ledger', async () => {
      const t = owner.titular;
      const inProgress = await historicBooking(h, { homeId: owner.homeId, titular: t, checkin: so(-1), checkout: so(2) });
      await expect(
        app('cancel_own_use_booking', titular(t), (c, op) =>
          closeBooking(c, op, inProgress, {
            kind: 'cancellation',
            expected: { cancellationClass: 'late', firstAffectedDate: so(1) },
          }),
        ),
      ).rejects.toEqual(constraint('cancellation_terms_changed'));
      await app('cancel_own_use_booking', titular(t), (c, op) =>
        closeBooking(c, op, inProgress, { kind: 'cancellation', expected: { cancellationClass: null, firstAffectedDate: so(1) } }),
      );
      expect(await lifecycleFacts(h, inProgress)).toMatchObject({
        state: 'cancelled',
        cancellation_class: null,
        active_occupancies: 2,
        released: 1,
        restores: 0,
        corrections: 0,
      });
      const custodies = await h.database.pool.query<{ holder_kind: string }>(
        `SELECT DISTINCT holder_kind FROM app.date_custody WHERE second_home_id = $1 AND closed_at IS NULL`,
        [owner.homeId],
      );
      expect(custodies.rows).toEqual([{ holder_kind: 'owner' }]);
      const future = await bookNow(h, t, owner.homeId, at(1), at(3));
      await app('cancel_own_use_booking', titular(t), (c, op) =>
        closeBooking(c, op, future, { kind: 'cancellation', expected: { cancellationClass: null, firstAffectedDate: at(1) } }),
      );
      expect((await lifecycleFacts(h, future)).released).toBe(2);
    });

    it('[TECH-050][T-1309] só o Titular vigente, por delegação ativa, cancela a própria reserva', async () => {
      const [a, b] = co.titulares;
      const id = await bookNow(h, a!, co.homeId, at(40), at(41));
      await expect(
        app('cancel_own_use_booking', titular(b!), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(40) } }),
        ),
      ).rejects.toEqual(constraint('permission_representation'));
      await expect(
        app('cancel_own_use_booking', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(40) } }),
        ),
      ).rejects.toEqual(constraint('permission_representation'));
      const proxy = await secondRepresentative(h, a!);
      await revokeDelegation(h, proxy.userId);
      await expect(
        app('cancel_own_use_booking', titular(proxy), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(40) } }),
        ),
      ).rejects.toEqual(constraint('permission_representation'));
      // Operação de outro command não cancela.
      await expect(
        app('create_own_use_booking', titular(a!), (c, op) =>
          closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(40) } }),
        ),
      ).rejects.toEqual(constraint('booking_operation_provenance'));
      expect((await bookingRow(h.database.pool, id)).state).toBe('confirmed');
    });

    it('[ADR-0027 §1] escritas de noite sem a transição da mesma operação são recusadas', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(43), at(44));
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          c.query(
            `UPDATE app.date_occupancy SET released_at = now(), release_reason = 'cancelled', released_by_operation = $2
              WHERE booking_id = $1`,
            [id, op],
          ),
        ),
      ).rejects.toEqual(constraint('booking_write_binding'));
      await expect(
        app('cancel_own_use_booking', titular(a), async (c, op) => {
          await closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'timely', firstAffectedDate: at(43) },
            releaseReason: 'no_show',
          });
        }),
      ).rejects.toEqual(constraint('booking_release_reason'));
    });
  });

  describe('cadeia de estados e projeção (ADR-0027 §2, T-1307)', () => {
    it('[TECH-055] matriz: pares fora da TECH-055 ou do evento são recusados', async () => {
      const a = co.titulares[1]!;
      const id = await bookNow(h, a, co.homeId, at(50), at(51));
      for (const [kind, toState] of [
        ['advance', 'completed'],
        ['advance', 'cancelled'],
        ['no_show', 'cancelled'],
        ['exception_opening', 'confirmed'],
        ['exception_resolution', 'confirmed'],
        ['invalidation', 'cancelled'],
        ['cancellation', 'no_show'],
      ] as const) {
        const actor = kind === 'advance' ? system : kind === 'cancellation' ? titular(a) : asAdmin();
        const command = {
          advance: 'advance_booking_states',
          no_show: 'declare_no_show',
          exception_opening: 'open_exception',
          exception_resolution: 'resolve_exception',
          invalidation: 'correct_use_right',
          cancellation: 'cancel_own_use_booking',
        }[kind];
        await expect(
          app(command, actor, (c, op) => insertTransition(c, op, { bookingId: id, kind, toState })),
        ).rejects.toEqual(constraint('conflict_booking_transition_pair'));
      }
    });

    it('[T-1307] duas raízes, anterior desatualizada, bifurcação e anterior de outra reserva são recusadas', async () => {
      const a = co.titulares[1]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(-12), checkout: s(-10) });
      const other = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(-15), checkout: s(-14) });
      const otherRoot = await app('advance_booking_states', system, (c, op) =>
        insertTransition(c, op, { bookingId: other, kind: 'advance', toState: 'in_use' }),
      );
      const root = await app('advance_booking_states', system, (c, op) =>
        insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'in_use' }),
      );
      // Segunda raiz (anterior nula, estado `confirmed`).
      await expect(
        app('advance_booking_states', system, (c, op) =>
          insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'in_use', previous: null, fromState: 'confirmed' }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_transition_stale'));
      // Anterior de outra reserva.
      await expect(
        app('advance_booking_states', system, (c, op) =>
          insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'completed', previous: otherRoot.id }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_transition_stale'));
      await app('advance_booking_states', system, (c, op) =>
        insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'completed' }),
      );
      // Bifurcação: anterior já sucedida (desatualizada).
      await expect(
        app('advance_booking_states', system, (c, op) =>
          insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'completed', previous: root.id, fromState: 'in_use' }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_transition_stale'));
      // Com os gatilhos contornados (dono, R3), os índices e a FK ainda protegem a cadeia.
      const client = await connect(h.database.url);
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE app.booking_state_transition DISABLE TRIGGER booking_state_transition_check');
        await client.query('ALTER TABLE app.booking_state_transition DISABLE TRIGGER booking_state_apply');
        const op = await openOperation(client, 'advance_booking_states', system);
        const forge = (previous: string | null, from: string, savepoint: string) =>
          client.query(`SAVEPOINT ${savepoint}`).then(() =>
            client
              .query(
                `INSERT INTO app.booking_state_transition (id, booking_id, previous_transition_id, from_state, to_state,
                   kind, operation_id, recorded_at)
                 VALUES ($1, $2, $3, $4, 'completed', 'advance', $5, now())`,
                [randomUUID(), id, previous, from, op],
              )
              .finally(() => client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)),
          );
        await expect(
          client
            .query('SAVEPOINT a')
            .then(() =>
              client.query(
                `INSERT INTO app.booking_state_transition (id, booking_id, previous_transition_id, from_state, to_state,
                   kind, operation_id, recorded_at)
                 VALUES ($1, $2, NULL, 'confirmed', 'in_use', 'advance', $3, now())`,
                [randomUUID(), id, op],
              ),
            )
            .finally(() => client.query('ROLLBACK TO SAVEPOINT a')),
        ).rejects.toEqual(constraint('conflict_booking_transition_single_root'));
        await expect(forge(root.id, 'in_use', 'b')).rejects.toEqual(constraint('conflict_booking_transition_fork'));
        await expect(forge(otherRoot.id, 'in_use', 'c')).rejects.toEqual(constraint('conflict_booking_transition_previous'));
        await expect(forge(null, 'in_use', 'd')).rejects.toEqual(constraint('conflict_booking_transition_root'));
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end();
      }
    });

    it('[T-1307] estado projetado só pela transição: UPDATE direto recusado para a aplicação e para o dono', async () => {
      const a = co.titulares[1]!;
      const id = await bookNow(h, a, co.homeId, at(53), at(54));
      const client = await connect(h.database.appUrl);
      try {
        for (const statement of [
          `UPDATE app.booking SET state = 'cancelled' WHERE id = '${id}'`,
          `DELETE FROM app.booking WHERE id = '${id}'`,
          `UPDATE app.booking_state_transition SET to_state = 'cancelled'`,
          `DELETE FROM app.booking_state_transition`,
          `INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, scope_dates, scope_custody_ids,
             valid_until, approval_ref, authorized_at)
           VALUES (gen_random_uuid(), gen_random_uuid(), '${id}', 'no_show', '{}', '{}', now() + interval '1 day',
             'github-run:1:1', now())`,
        ])
          await expect(client.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.end();
      }
      await expect(h.database.pool.query(`UPDATE app.booking SET state = 'cancelled' WHERE id = $1`, [id])).rejects.toEqual(
        constraint('booking_state_projection'),
      );
      await expect(
        h.database.pool.query(`UPDATE app.booking SET checkout_date = checkout_date + 1 WHERE id = $1`, [id]),
      ).rejects.toEqual(constraint('booking_history_immutable'));
      await expect(h.database.pool.query(`DELETE FROM app.booking WHERE id = $1`, [id])).rejects.toMatchObject({
        code: '42501',
      });
    });

    it('[T-1307][TECH-053] transições concorrentes na mesma reserva: exatamente uma vence', async () => {
      const a = co.titulares[1]!;
      const id = await bookNow(h, a, co.homeId, at(56), at(58));
      const first = await connect(h.database.appUrl);
      const second = await connect(h.database.appUrl);
      try {
        await first.query('BEGIN');
        const op1 = await openOperation(first, 'open_exception', asAdmin());
        await openException(first, op1, id, 'operational');
        await second.query('BEGIN');
        const op2 = await openOperation(second, 'cancel_own_use_booking', titular(a));
        const racing = closeBooking(second, op2, id, {
          kind: 'cancellation',
          expected: { cancellationClass: 'timely', firstAffectedDate: at(56) },
        });
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op1]);
        await first.query('COMMIT');
        await expect(racing).rejects.toEqual(constraint('conflict_booking_transition_stale'));
        await second.query('ROLLBACK');
      } finally {
        await first.end();
        await second.end();
      }
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'in_exception', transitions: 1, released: 0 });
      // A exceção P-A não impede o Titular: cancela com as regras normais e encerra a exceção na mesma transação.
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, id, {
            kind: 'cancellation',
            expected: { cancellationClass: 'timely', firstAffectedDate: at(56) },
            skipResolution: true,
          }),
        ),
      ).rejects.toEqual(constraint('booking_exception_recorded'));
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(56) } }),
      );
      const resolution = await h.database.pool.query<{ outcome: string; resolution_source: string }>(
        `SELECT outcome, resolution_source FROM app.booking_exception_resolution WHERE booking_id = $1`,
        [id],
      );
      expect(resolution.rows).toEqual([{ outcome: 'cancelled', resolution_source: 'titular_cancellation' }]);
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'cancelled', restores: 2 });
    });

    it('[ADR-0027 §3] uma falha no meio desfaz tudo: transição, liberações e custódias', async () => {
      const a = co.titulares[1]!;
      const id = await bookNow(h, a, co.homeId, at(60), at(62));
      const before = await lifecycleFacts(h, id);
      await expect(
        app('cancel_own_use_booking', titular(a), async (c, op) => {
          await closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(60) } });
          // Segunda reversão do mesmo consumo, na mesma operação: viola a reversão única e derruba a transação.
          await c.query(
            `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket,
               movement, quantity, stay_date, refers_to_id, operation_id, created_at)
             SELECT gen_random_uuid(), l.second_home_id, l.acquisition_id, l.stake_id, l.exercise_year, l.bucket,
                    'restore', 1, l.stay_date, l.id, $2, now()
               FROM app.use_right_ledger l
              WHERE l.operation_id = (SELECT opened_by_operation FROM app.booking WHERE id = $1)
                AND l.movement = 'consume' AND l.stay_date = $3`,
            [id, op, at(60)],
          );
        }),
      ).rejects.toEqual(
        expect.objectContaining({ constraint: expect.stringMatching(/^conflict_use_right_(restore|reversal)$/) }),
      );
      expect(await lifecycleFacts(h, id)).toEqual(before);
    });
  });

  describe('exceção (PD-010, REQ-083, REQ-084)', () => {
    it('[PD-010][REQ-083][EC-12] P-A: abertura e resolução auditadas, sem efeito sobre saldo, custódia ou ocupação', async () => {
      const a = co.titulares[0]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(5), checkout: s(7) });
      const before = await lifecycleFacts(h, id);
      // A abertura registra a exceção no mesmo COMMIT.
      await expect(
        app('open_exception', asAdmin(), (c, op) =>
          insertTransition(c, op, { bookingId: id, kind: 'exception_opening', toState: 'in_exception' }),
        ),
      ).rejects.toEqual(constraint('booking_exception_recorded'));
      // Só Admin ativo com base registrada.
      await expect(
        app('open_exception', titular(a), (c, op) => openException(c, op, id, 'operational')),
      ).rejects.toEqual(constraint('permission_staff_role'));
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      expect(await lifecycleFacts(h, id)).toEqual({ ...before, state: 'in_exception', transitions: 1 });
      // No-show suspenso durante a exceção (TECH-055); `completed` só depois do check-out.
      await expect(
        app('declare_no_show', asAdmin(), (c, op) => insertTransition(c, op, { bookingId: id, kind: 'no_show', toState: 'no_show' })),
      ).rejects.toEqual(constraint('conflict_booking_transition_pair'));
      await expect(
        app('resolve_exception', asAdmin(), (c, op) => resolveWithoutEffect(c, op, id, 'completed')),
      ).rejects.toEqual(constraint('conflict_booking_resolution_period'));
      await app('resolve_exception', asAdmin(), (c, op) => resolveWithoutEffect(c, op, id, 'confirmed'));
      expect(await lifecycleFacts(h, id)).toEqual({ ...before, state: 'confirmed', transitions: 2 });
      // A exceção resolvida não volta: nova exceção é outra linha; a anterior tem resolução única.
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, id, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: s(5) } }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'cancelled', cancellation_class: 'late', forfeited: 2 });
      const resolutions = await h.database.pool.query<{ source: string }>(
        `SELECT resolution_source AS source FROM app.booking_exception_resolution WHERE booking_id = $1 ORDER BY resolved_at`,
        [id],
      );
      expect(resolutions.rows).toEqual([{ source: 'admin' }, { source: 'titular_cancellation' }]);
    });

    it('[REQ-084][EC-16][T-1302] P-B forjada com K2: só suspende o tardio do Co-Owner e o no-show; tempestivo e Owner seguem', async () => {
      const a = co.titulares[0]!;
      const late = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(9), checkout: s(11) });
      const before = await lifecycleFacts(h, late);
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, late, 'unauthorized_booking'));
      expect(await lifecycleFacts(h, late)).toEqual({ ...before, state: 'in_exception', transitions: 1 });
      await expect(
        app('cancel_own_use_booking', titular(a), (c, op) =>
          closeBooking(c, op, late, { kind: 'cancellation', expected: { cancellationClass: 'late', firstAffectedDate: s(9) } }),
        ),
      ).rejects.toEqual(constraint('conflict_booking_late_during_inquiry'));
      // Resolução `cancelled` em P-B nunca por `resolve_exception` como exceção operacional.
      await expect(
        app('resolve_exception', asAdmin(), (c, op) => closeBooking(c, op, late, { kind: 'exception_resolution' })),
      ).rejects.toEqual(constraint('conflict_booking_inquiry_resolution'));
      // Encerrada sem comprovação: `confirmed` antes do check-out.
      await app('resolve_exception', asAdmin(), (c, op) => resolveWithoutEffect(c, op, late, 'confirmed'));
      expect(await lifecycleFacts(h, late)).toEqual({ ...before, state: 'confirmed', transitions: 2 });

      const timely = await bookNow(h, a, co.homeId, at(64), at(66));
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, timely, 'unauthorized_booking'));
      await app('cancel_own_use_booking', titular(a), (c, op) =>
        closeBooking(c, op, timely, { kind: 'cancellation', expected: { cancellationClass: 'timely', firstAffectedDate: at(64) } }),
      );
      expect(await lifecycleFacts(h, timely)).toMatchObject({ state: 'cancelled', restores: 2 });

      const t = owner.titular;
      const ownerBooking = await historicBooking(h, { homeId: owner.homeId, titular: t, checkin: so(4), checkout: so(6) });
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, ownerBooking, 'unauthorized_booking'));
      await app('cancel_own_use_booking', titular(t), (c, op) =>
        closeBooking(c, op, ownerBooking, { kind: 'cancellation', expected: { cancellationClass: null, firstAffectedDate: so(4) } }),
      );
      expect(await lifecycleFacts(h, ownerBooking)).toMatchObject({ state: 'cancelled', released: 2 });
    });

    it('[ADR-0027 §3] resolução e exceção presas à transição da mesma operação; abertura só antes do check-out', async () => {
      const a = co.titulares[1]!;
      const past = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s(-19), checkout: s(-17) });
      await expect(
        app('open_exception', asAdmin(), (c, op) => openException(c, op, past, 'operational')),
      ).rejects.toEqual(constraint('conflict_booking_exception_after_checkout'));
      const id = await bookNow(h, a, co.homeId, at(68), at(69));
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      // Resolução com desfecho ou origem diferentes da transição.
      for (const [outcome, source] of [
        ['completed', 'admin'],
        ['confirmed', 'titular_cancellation'],
      ] as const)
        await expect(
          app('resolve_exception', asAdmin(), async (c, op) => {
            const t = await insertTransition(c, op, { bookingId: id, kind: 'exception_resolution', toState: 'confirmed' });
            await recordResolution(c, id, t.id, outcome, source);
          }),
        ).rejects.toEqual(constraint('booking_exception_binding'));
      expect((await bookingRow(h.database.pool, id)).state).toBe('in_exception');
    });
  });

  describe('instantes puros (TECH-043, TECH-046, D11) — fronteiras ao microssegundo', () => {
    it('[REQ-080][D11] prazo de 360 h: −1 µs e exato tempestivos, +1 µs tardio, com e sem horário de verão', async () => {
      const { rows } = await h.database.pool.query<{ zone: string; before: boolean; exact: boolean; after: boolean; days: boolean }>(
        `SELECT z.zone,
                app.own_use_cancellation_timely(c.checkin, c.checkin - interval '360 hours' - interval '1 microsecond') AS before,
                app.own_use_cancellation_timely(c.checkin, c.checkin - interval '360 hours') AS exact,
                app.own_use_cancellation_timely(c.checkin, c.checkin - interval '360 hours' + interval '1 microsecond') AS after,
                -- Sem a regra de instantes, '15 days' no fuso com horário de verão erra por uma hora.
                (c.checkin - interval '360 hours') <> ((c.checkin AT TIME ZONE z.zone) - interval '15 days') AT TIME ZONE z.zone AS days
           FROM (VALUES ('America/Sao_Paulo'), ('America/New_York'), ('Europe/Lisbon')) AS z(zone)
          CROSS JOIN LATERAL (SELECT ('2027-03-20 14:00'::timestamp AT TIME ZONE z.zone) AS checkin) AS c`,
      );
      for (const row of rows) expect(row).toMatchObject({ before: true, exact: true, after: false });
      expect(Object.fromEntries(rows.map((row) => [row.zone, row.days]))).toEqual({
        'America/Sao_Paulo': false,
        'America/New_York': true,
        'Europe/Lisbon': false,
      });
    });

    it('[TECH-046][D8] janela do no-show [1º check-in, check-out) e validade `now < valid_until`', async () => {
      const { rows } = await h.database.pool.query<Record<string, boolean>>(
        `SELECT app.booking_no_show_window_open(t.ci, t.co, t.ci - interval '1 microsecond') AS before_checkin,
                app.booking_no_show_window_open(t.ci, t.co, t.ci) AS at_checkin,
                app.booking_no_show_window_open(t.ci, t.co, t.co - interval '1 microsecond') AS last_microsecond,
                app.booking_no_show_window_open(t.ci, t.co, t.co) AS at_checkout,
                app.booking_authorization_usable(t.co, t.co - interval '1 microsecond') AS usable_before,
                app.booking_authorization_usable(t.co, t.co) AS usable_at,
                app.booking_checkout_at('2027-01-10', 'America/Sao_Paulo') = '2027-01-10 13:00Z' AS checkout_local,
                app.booking_checkout_at('2027-03-14', 'America/New_York') = '2027-03-14 14:00Z' AS checkout_dst
           FROM (SELECT '2027-01-08 17:00Z'::timestamptz AS ci, '2027-01-10 13:00Z'::timestamptz AS co) AS t`,
      );
      expect(rows[0]).toEqual({
        before_checkin: false,
        at_checkin: true,
        last_microsecond: true,
        at_checkout: false,
        usable_before: true,
        usable_at: false,
        checkout_local: true,
        checkout_dst: true,
      });
      // Horário local inexistente (salto do horário de verão) → NULL: quem chama falha fechado.
      const gap = await h.database.pool.query<{ at: string | null }>(
        `SELECT app.local_instant('2027-03-14 02:30', 'America/New_York')::text AS at`,
      );
      expect(gap.rows[0]!.at).toBeNull();
    });
  });
});
