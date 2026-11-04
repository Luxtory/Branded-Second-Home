import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scramVerifier } from '../../scripts/lib/scram.mjs';
import { waitForLockWaiter } from '../support/platform-fixtures';
import { createTestDatabase } from '../support/test-database';
import {
  addDays,
  bookableStart,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from '../features/booking/booking-support';
import {
  activate,
  addAdmin,
  asAuthorizer,
  asOperation,
  authorize,
  bookingRow,
  bookNow,
  closeBooking,
  connect,
  futureForfeited,
  historicBooking,
  lastStartedNight,
  lifecycleFacts,
  openException,
  openOperation,
  recover,
  requestAuthorization,
  resolveWithoutEffect,
  revoke,
  unstartedNights,
  type Admin,
  type OperationActor,
} from '../features/booking/lifecycle-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });

describe('W13 E1 — autorização independente do luxtory_app (ADR-0027 §4, plano W13 critérios 1–16)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let co2: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;
  let S1: string;
  let S2: string;
  let So: string;
  let first: string;
  const s1 = (offset: number) => addDays(S1, offset);
  const s2 = (offset: number) => addDays(S2, offset);
  const so = (offset: number) => addDays(So, offset);
  const at = (offset: number) => addDays(first, offset);
  const asAdmin = (): OperationActor => ({ kind: 'admin', admin });
  const app = <T>(command: string, actor: OperationActor, work: (client: pg.Client, op: string) => Promise<T>) =>
    asOperation(h.database.appUrl, command, actor, work);

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    co2 = await h.coOwnerScenario(2);
    owner = await h.ownerScenario();
    admin = await addAdmin(h);
    S1 = await lastStartedNight(h, co.homeId);
    S2 = await lastStartedNight(h, co2.homeId);
    So = await lastStartedNight(h, owner.homeId);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
  }, 300_000);
  afterAll(() => h.close());

  describe('papel autorizador e privilégios (critério 10)', () => {
    it('[ADR-0027 §4] papel sem herança, uma conexão, nenhum privilégio em tabela; EXECUTE só nas duas funções', async () => {
      const role = await h.database.pool.query(
        `SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolconnlimit
           FROM pg_roles WHERE rolname = 'luxtory_booking_authorizer'`,
      );
      expect(role.rows[0]).toEqual({
        rolcanlogin: true,
        rolinherit: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        rolconnlimit: 1,
      });
      const tables = await h.database.pool.query<{ object: string }>(
        `SELECT c.oid::regclass::text AS object FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND c.relkind IN ('r', 'v', 'm', 'p')
            AND has_table_privilege('luxtory_booking_authorizer', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')`,
      );
      expect(tables.rows).toEqual([]);
      // Funções chamáveis com acesso a dados: só as duas. As de gatilho (chamada direta recusada) e as IMMUTABLE sem
      // SECURITY DEFINER executáveis por PUBLIC desde as waves anteriores não leem nem gravam.
      const functions = await h.database.pool.query<{ fn: string }>(
        `SELECT p.oid::regprocedure::text AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND has_function_privilege('luxtory_booking_authorizer', p.oid, 'EXECUTE')
            AND (p.prosecdef OR (p.prorettype <> 'trigger'::regtype AND p.provolatile <> 'i'))
          ORDER BY 1`,
      );
      expect(functions.rows.map((row) => row.fn)).toEqual([
        'app.authorize_booking_action(uuid,text)',
        'app.revoke_booking_authorization(uuid,text)',
      ]);
      const exposed = await h.database.pool.query<{ fn: string; trigger: boolean; immutable: boolean }>(
        `SELECT p.oid::regprocedure::text AS fn, p.prorettype = 'trigger'::regtype AS trigger,
                p.provolatile = 'i' AND NOT p.prosecdef AS immutable
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND has_function_privilege('luxtory_booking_authorizer', p.oid, 'EXECUTE')
            AND p.proname NOT IN ('authorize_booking_action', 'revoke_booking_authorization')`,
      );
      expect(exposed.rows.filter((row) => row.trigger)).toHaveLength(18);
      expect(exposed.rows.filter((row) => !row.trigger)).toEqual([
        { fn: 'app.is_text_list(text[],integer,integer)', trigger: false, immutable: true },
      ]);
      await expect(
        asAuthorizer(h, (client) => client.query(`SELECT app.forbid_change()`)),
      ).rejects.toMatchObject({ code: '0A000' });
    });

    it('[T-1302] o luxtory_app não autoriza, não revoga e não grava autorização nem revogação (42501)', async () => {
      const client = await connect(h.database.appUrl);
      try {
        for (const statement of [
          `SELECT app.authorize_booking_action(gen_random_uuid(), 'github-run:1:1')`,
          `SELECT app.revoke_booking_authorization(gen_random_uuid(), 'github-run:1:1')`,
          `INSERT INTO app.booking_authorization_revocation VALUES (gen_random_uuid(), 'github-run:1:1', now())`,
          `UPDATE app.booking_authorization SET valid_until = now() + interval '10 years'`,
          `DELETE FROM app.booking_authorization_use`,
        ])
          await expect(client.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.end();
      }
    });

    it('[ADR-0027 §4] login real do papel autorizador: só chama as funções; segunda conexão simultânea recusada', async () => {
      const id = await bookNow(h, co.titulares[0]!, co.homeId, at(70), at(71));
      const password = randomBytes(24).toString('base64url');
      await h.database.pool.query(`ALTER ROLE luxtory_booking_authorizer WITH PASSWORD '${scramVerifier(password)}'`);
      const url = new URL(h.database.url);
      url.username = 'luxtory_booking_authorizer';
      url.password = password;
      const authorizer = await connect(url.toString());
      try {
        await expect(authorizer.query('SELECT id FROM app.booking LIMIT 1')).rejects.toMatchObject({ code: '42501' });
        await expect(authorizer.query('SELECT id FROM app.booking_authorization_request LIMIT 1')).rejects.toMatchObject({
          code: '42501',
        });
        await expect(connect(url.toString())).rejects.toMatchObject({ code: '53300' });
        // Entrada fora do schema fechado e solicitação inexistente: recusas nomeadas, sem SQL livre.
        await expect(
          authorizer.query(`SELECT app.authorize_booking_action($1, $2)`, [randomUUID(), 'run 1; DROP TABLE x']),
        ).rejects.toEqual(constraint('authorization_input'));
        await expect(
          authorizer.query(`SELECT app.authorize_booking_action($1, $2)`, [randomUUID(), 'github-run:7:1']),
        ).rejects.toEqual(constraint('authorization_request_unknown'));
        // Fora da janela do no-show: a emissão é recusada.
        const request = await requestAuthorization(h, admin, { bookingId: id, purpose: 'no_show', expectedDates: [at(70)] });
        await expect(
          authorizer.query(`SELECT app.authorize_booking_action($1, $2)`, [request, 'github-run:7:1']),
        ).rejects.toEqual(constraint('authorization_emission_window'));
      } finally {
        await authorizer.end();
        await h.database.pool.query(`ALTER ROLE luxtory_booking_authorizer WITH PASSWORD NULL`);
      }
    });

    it('[A4][ADR-0027 §4] solicitação só pelo Admin ativo no command de solicitação', async () => {
      const id = await bookNow(h, co.titulares[1]!, co.homeId, at(73), at(74));
      const insert = (client: pg.Client, op: string) =>
        client.query(
          `INSERT INTO app.booking_authorization_request (id, booking_id, purpose, expected_dates, basis,
             requested_by_operation, requested_at)
           VALUES (gen_random_uuid(), $1, 'no_show', '{}', 'base', $2, now())`,
          [id, op],
        );
      await expect(
        app('request_booking_authorization', { kind: 'titular', titular: co.titulares[1]! }, insert),
      ).rejects.toEqual(constraint('permission_staff_role'));
      await expect(app('declare_no_show', asAdmin(), insert)).rejects.toEqual(constraint('booking_operation_provenance'));
    });
  });

  describe('no-show e recuperação (TECH-046, BR-282, BR-283, BR-284; critérios 6–9, 11–13)', () => {
    it('[TECH-046][A1][T-1303] no-show só com a autorização da mesma operação, no escopo, uma vez; depois a recuperação', async () => {
      const b = co.titulares[1]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: b, checkin: s1(-1), checkout: s1(3) });
      const decoy = await bookNow(h, b, co.homeId, at(76), at(77));
      const nights = await unstartedNights(h.database.pool, id);
      expect(nights).toEqual([s1(1), s1(2)]);
      // Critério 13: Admin ativo, K2 presente, operação válida — sem autorização, recusado.
      await expect(app('declare_no_show', asAdmin(), (c, op) => closeBooking(c, op, id, { kind: 'no_show' }))).rejects.toEqual(
        constraint('permission_authorization_missing'),
      );
      // Recuperação antes do no-show commitado: nada a recuperar.
      const early = await requestAuthorization(h, admin, { bookingId: id, purpose: 'recovery' });
      await expect(authorize(h, early)).rejects.toEqual(constraint('authorization_emission_recovery'));
      // Escopo esperado diferente do derivado.
      const wrong = await requestAuthorization(h, admin, { bookingId: id, purpose: 'no_show', expectedDates: [s1(2)] });
      await expect(authorize(h, wrong)).rejects.toEqual(constraint('authorization_scope_mismatch'));
      const request = await requestAuthorization(h, admin, { bookingId: id, purpose: 'no_show', expectedDates: nights });
      const authorization = await authorize(h, request);
      // Uma autorização viva por reserva e finalidade.
      const twin = await requestAuthorization(h, admin, { bookingId: id, purpose: 'no_show', expectedDates: nights });
      await expect(authorize(h, twin)).rejects.toEqual(constraint('authorization_live_exists'));
      await expect(authorize(h, request)).rejects.toEqual(constraint('authorization_request_already_authorized'));
      const scope = await h.database.pool.query(
        `SELECT purpose, scope_dates::text[] AS dates, valid_until = (SELECT app.booking_checkout_at($2, 'America/Sao_Paulo')) AS until
           FROM app.booking_authorization WHERE id = $1`,
        [authorization, s1(3)],
      );
      expect(scope.rows[0]).toEqual({ purpose: 'no_show', dates: nights, until: true });
      // Critério 12: com a autorização legítima, só exatamente o ato autorizado.
      await expect(
        app('resolve_exception', asAdmin(), (c, op) =>
          c.query(
            `INSERT INTO app.booking_authorization_use (authorization_id, booking_id, operation_id, used_at)
             VALUES ($1, $2, $3, now())`,
            [authorization, id, op],
          ),
        ),
      ).rejects.toEqual(constraint('permission_authorization_scope'));
      await expect(
        app('declare_no_show', asAdmin(), (c, op) =>
          c.query(
            `INSERT INTO app.booking_authorization_use (authorization_id, booking_id, operation_id, used_at)
             VALUES ($1, $2, $3, now())`,
            [authorization, decoy, op],
          ),
        ),
      ).rejects.toEqual(constraint('permission_authorization_scope'));
      // O uso sem o ato não fica: no COMMIT, a autorização só vale com a transição da mesma operação.
      await expect(
        app('declare_no_show', asAdmin(), (c, op) =>
          c.query(
            `INSERT INTO app.booking_authorization_use (authorization_id, booking_id, operation_id, used_at)
             VALUES ($1, $2, $3, now())`,
            [authorization, id, op],
          ),
        ),
      ).rejects.toEqual(constraint('booking_authorization_use_effect'));
      // Critério 11: falha no meio → rollback integral e autorização utilizável.
      await expect(
        app('declare_no_show', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'no_show', authorizationId: authorization, nights: [s1(1)] }),
        ),
      ).rejects.toEqual(constraint('booking_closure_occupancy'));
      expect((await bookingRow(h.database.pool, id)).state).toBe('confirmed');
      await app('declare_no_show', asAdmin(), (c, op) =>
        closeBooking(c, op, id, { kind: 'no_show', authorizationId: authorization }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'no_show',
        active_occupancies: 2,
        released: 2,
        forfeited: 2,
        restores: 0,
      });
      // Uso único.
      await expect(
        app('declare_no_show', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'no_show', authorizationId: authorization }),
        ),
      ).rejects.toEqual(constraint('permission_authorization_used'));

      // Recuperação: autorização separada, sobre as custódias efetivamente perdidas.
      const forfeited = await futureForfeited(h, id);
      expect(forfeited).toHaveLength(2);
      const recovery = await authorize(
        h,
        await requestAuthorization(h, admin, { bookingId: id, purpose: 'recovery', expectedCustodyIds: forfeited }),
      );
      const recoveryValidity = await h.database.pool.query<{ ok: boolean }>(
        `SELECT a.valid_until = (SELECT max(d.checkin_at) FROM app.second_home_date d
                                  WHERE d.second_home_id = $2 AND d.stay_date = ANY($3::date[])) AS ok
           FROM app.booking_authorization a WHERE a.id = $1`,
        [recovery, co.homeId, nights],
      );
      expect(recoveryValidity.rows[0]!.ok).toBe(true);
      // Critério 13: sem o uso da autorização na mesma operação, a custódia perdida não sai.
      await expect(
        app('recover_future_capacity', asAdmin(), (c, op) =>
          c.query(`UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`, [
            forfeited[0],
            op,
          ]),
        ),
      ).rejects.toEqual(constraint('permission_authorization_missing'));
      // Recuperar só parte das custódias autorizadas é recusado no COMMIT (o ato é exatamente o autorizado).
      await expect(
        app('recover_future_capacity', asAdmin(), (c, op) => recover(c, op, id, recovery, forfeited.slice(0, 1))),
      ).rejects.toEqual(constraint('booking_recovery_complete'));
      await expect(
        app('recover_future_capacity', asAdmin(), (c, op) => recover(c, op, id, recovery, forfeited, 'base:forged')),
      ).rejects.toEqual(constraint('custody_recovery_authorization'));
      await app('recover_future_capacity', asAdmin(), (c, op) => recover(c, op, id, recovery, forfeited));
      const inventory = await h.database.pool.query<{ origin: string; ref: string }>(
        `SELECT inventory_origin AS origin, authorization_ref AS ref FROM app.date_custody
          WHERE second_home_id = $1 AND stay_date = ANY($2::date[]) AND closed_at IS NULL
            AND holder_kind = 'luxtory' AND purpose = 'inventory'`,
        [co.homeId, nights],
      );
      expect(inventory.rows).toEqual(
        nights.map(() => ({ origin: 'recovered_future_capacity', ref: `booking_authorization:${recovery}` })),
      );
      // BR-284: sem restore, sem mudança de estado nem de saldo.
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'no_show', restores: 0, corrections: 0, forfeited: 0 });
    });

    it('[TECH-046][A2] no-show sem noite futura (reserva de uma noite) usa a autorização do evento; em `checkout_at` é recusado', async () => {
      const t = owner.titular;
      const id = await historicBooking(h, { homeId: owner.homeId, titular: t, checkin: so(0), checkout: so(1) });
      const nights = await unstartedNights(h.database.pool, id);
      expect(nights).toEqual([]);
      const { rows } = await h.database.pool.query<{ open: boolean }>(
        `SELECT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, clock_timestamp()) AS open
           FROM app.booking_period_instants($1) AS i`,
        [id],
      );
      const request = await requestAuthorization(h, admin, { bookingId: id, purpose: 'no_show', expectedDates: [] });
      if (rows[0]!.open) {
        const authorization = await authorize(h, request);
        await app('declare_no_show', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'no_show', authorizationId: authorization }),
        );
        expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'no_show', active_occupancies: 1, released: 0 });
      } else {
        // Entre as 10:00 e as 14:00 locais nenhuma reserva de uma noite está na janela: o check-out passou.
        await expect(authorize(h, request)).rejects.toEqual(constraint('authorization_emission_window'));
      }
    });

    it('[T-1303] uso × revogação e autorizações simultâneas: exatamente um vence; revogada e expirada recusadas', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(80), at(82));
      await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      const exceptionId = (await h.database.pool.query<{ id: string }>(`SELECT id FROM app.booking_exception WHERE booking_id = $1`, [id]))
        .rows[0]!.id;
      const nights = await unstartedNights(h.database.pool, id);
      const request = () =>
        requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'exception_cancellation',
          exceptionId,
          expectedDates: nights,
          expectedClass: 'timely',
        });
      // Duas autorizações simultâneas para a mesma reserva e finalidade.
      const [r1, r2] = [await request(), await request()];
      const holder = await connect(h.database.url);
      const racer = await connect(h.database.url);
      let revoked: string;
      try {
        await holder.query('BEGIN');
        await holder.query('SET LOCAL ROLE luxtory_booking_authorizer');
        const held = await holder.query<{ id: string }>(`SELECT app.authorize_booking_action($1, 'github-run:2:1') AS id`, [r1]);
        revoked = held.rows[0]!.id;
        await racer.query('SET ROLE luxtory_booking_authorizer');
        const racing = racer.query(`SELECT app.authorize_booking_action($1, 'github-run:3:1')`, [r2]);
        await waitForLockWaiter(h.database.pool);
        await holder.query('COMMIT');
        await expect(racing).rejects.toEqual(constraint('authorization_live_exists'));
      } finally {
        await holder.end();
        await racer.end();
      }
      // Revogação vence o uso que chega depois.
      const reviver = await connect(h.database.url);
      const user = await connect(h.database.appUrl);
      try {
        await reviver.query('BEGIN');
        await reviver.query('SET LOCAL ROLE luxtory_booking_authorizer');
        await reviver.query(`SELECT app.revoke_booking_authorization($1, 'github-run:4:1')`, [revoked]);
        await user.query('BEGIN');
        const op = await openOperation(user, 'resolve_exception', asAdmin());
        const using = closeBooking(user, op, id, { kind: 'exception_resolution', authorizationId: revoked });
        await waitForLockWaiter(h.database.pool);
        await reviver.query('COMMIT');
        await expect(using).rejects.toEqual(constraint('permission_authorization_revoked'));
        await user.query('ROLLBACK');
      } finally {
        await reviver.end();
        await user.end();
      }
      await expect(revoke(h, revoked)).rejects.toEqual(constraint('authorization_already_revoked'));
      // Uso vence a revogação que chega depois.
      const authorization = await authorize(h, await request());
      const user2 = await connect(h.database.appUrl);
      const late = await connect(h.database.url);
      try {
        await user2.query('BEGIN');
        const op = await openOperation(user2, 'resolve_exception', asAdmin());
        await closeBooking(user2, op, id, { kind: 'exception_resolution', authorizationId: authorization });
        await late.query('SET ROLE luxtory_booking_authorizer');
        const revoking = late.query(`SELECT app.revoke_booking_authorization($1, 'github-run:5:1')`, [authorization]);
        await waitForLockWaiter(h.database.pool);
        await user2.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await user2.query('COMMIT');
        await expect(revoking).rejects.toEqual(constraint('authorization_already_used'));
      } finally {
        await user2.end();
        await late.end();
      }
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'cancelled', cancellation_class: 'timely', restores: 2 });

      // Expirada (gravada pelo dono com validade passada, como se o tempo tivesse corrido).
      const other = await bookNow(h, a, co.homeId, at(84), at(85));
      const stale = await requestAuthorization(h, admin, { bookingId: other, purpose: 'no_show', expectedDates: [] });
      const expired = randomUUID();
      await h.database.pool.query(
        `INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, scope_dates, scope_custody_ids,
           valid_until, approval_ref, authorized_at)
         VALUES ($1, $2, $3, 'no_show', '{}', '{}', now() - interval '1 microsecond', 'github-run:6:1', now() - interval '1 day')`,
        [expired, stale, other],
      );
      await expect(
        app('declare_no_show', asAdmin(), (c, op) => closeBooking(c, op, other, { kind: 'no_show', authorizationId: expired })),
      ).rejects.toEqual(constraint('permission_authorization_expired'));
      // Mesmo com uma autorização válida (gravada pelo dono), o no-show antes do 1º check-in é recusado pelo instante.
      const valid = randomUUID();
      await h.database.pool.query(
        `INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, scope_dates, scope_custody_ids,
           valid_until, approval_ref, authorized_at)
         VALUES ($1, $2, $3, 'no_show', $4::date[], '{}', now() + interval '1 day', 'github-run:6:2', now())`,
        [valid, await requestAuthorization(h, admin, { bookingId: other, purpose: 'no_show', expectedDates: [] }), other, [at(84)]],
      );
      await expect(
        app('declare_no_show', asAdmin(), (c, op) => closeBooking(c, op, other, { kind: 'no_show', authorizationId: valid })),
      ).rejects.toEqual(constraint('conflict_booking_no_show_window'));
    });
  });

  describe('cancelamento P-A e invalidação (PD-010, REQ-084; critérios 7, 8, 13)', () => {
    it('[PD-010][REQ-080] P-A cancelada pelo Admin: classificação no instante, igual à da autorização; exceção exata', async () => {
      const a = co.titulares[1]!;
      const id = await bookNow(h, a, co.homeId, at(88), at(90));
      const exception1 = await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      const nights = await unstartedNights(h.database.pool, id);
      await expect(
        app('resolve_exception', asAdmin(), (c, op) => closeBooking(c, op, id, { kind: 'exception_resolution' })),
      ).rejects.toEqual(constraint('permission_authorization_missing'));
      // Escopo esperado com a classe errada.
      const wrongClass = await requestAuthorization(h, admin, {
        bookingId: id,
        purpose: 'exception_cancellation',
        exceptionId: exception1,
        expectedDates: nights,
        expectedClass: 'late',
      });
      await expect(authorize(h, wrongClass)).rejects.toEqual(constraint('authorization_scope_mismatch'));
      const first1 = await authorize(
        h,
        await requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'exception_cancellation',
          exceptionId: exception1,
          expectedDates: nights,
          expectedClass: 'timely',
        }),
      );
      // A exceção resolvida e reaberta é outra: a autorização da primeira não serve.
      await app('resolve_exception', asAdmin(), (c, op) => resolveWithoutEffect(c, op, id, 'confirmed'));
      const exception2 = await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      await expect(
        app('resolve_exception', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'exception_resolution', authorizationId: first1 }),
        ),
      ).rejects.toEqual(constraint('permission_authorization_scope'));
      await revoke(h, first1);
      // Classificação divergente e escopo parcial (gravados pelo dono): recusados na execução.
      for (const [klass, dates] of [
        ['late', nights],
        ['timely', nights.slice(0, 1)],
      ] as const) {
        const forged = randomUUID();
        const r = await requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'exception_cancellation',
          exceptionId: exception2,
          expectedDates: nights,
          expectedClass: 'timely',
        });
        await h.database.pool.query(
          `INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, exception_id, scope_dates,
             scope_custody_ids, expected_cancellation_class, valid_until, approval_ref, authorized_at)
           VALUES ($1, $2, $3, 'exception_cancellation', $4, $5::date[], '{}', $6, now() + interval '1 day', 'github-run:8:1', now())`,
          [forged, r, id, exception2, [...dates], klass],
        );
        await expect(
          app('resolve_exception', asAdmin(), (c, op) =>
            closeBooking(c, op, id, { kind: 'exception_resolution', authorizationId: forged }),
          ),
        ).rejects.toEqual(constraint('permission_authorization_scope'));
        await revoke(h, forged);
      }
      const authorization = await authorize(
        h,
        await requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'exception_cancellation',
          exceptionId: exception2,
          expectedDates: nights,
          expectedClass: 'timely',
        }),
      );
      await app('resolve_exception', asAdmin(), (c, op) =>
        closeBooking(c, op, id, { kind: 'exception_resolution', authorizationId: authorization }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'cancelled',
        cancellation_class: 'timely',
        released: 2,
        restores: 2,
        forfeited: 0,
      });
      const reason = await h.database.pool.query<{ reason: string }>(
        `SELECT DISTINCT release_reason AS reason FROM app.date_occupancy WHERE booking_id = $1`,
        [id],
      );
      expect(reason.rows).toEqual([{ reason: 'exception' }]);
    });

    it('[PD-010][BR-123][A3] P-A tardia: forfeited_right sem entrada automática; recuperação só com atestação', async () => {
      const a = co.titulares[0]!;
      const id = await historicBooking(h, { homeId: co.homeId, titular: a, checkin: s1(5), checkout: s1(7) });
      const exceptionId = await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'operational'));
      const nights = await unstartedNights(h.database.pool, id);
      const authorization = await authorize(
        h,
        await requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'exception_cancellation',
          exceptionId,
          expectedDates: nights,
          expectedClass: 'late',
        }),
      );
      await app('resolve_exception', asAdmin(), (c, op) =>
        closeBooking(c, op, id, { kind: 'exception_resolution', authorizationId: authorization }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'cancelled', cancellation_class: 'late', forfeited: 2 });
      const luxtory = await h.database.pool.query(
        `SELECT 1 FROM app.luxtory_inventory WHERE second_home_id = $1 AND stay_date = ANY($2::date[])`,
        [co.homeId, nights],
      );
      expect(luxtory.rows).toEqual([]);
      const forfeited = await futureForfeited(h, id);
      await expect(
        authorize(h, await requestAuthorization(h, admin, { bookingId: id, purpose: 'recovery', expectedCustodyIds: forfeited })),
      ).rejects.toEqual(constraint('authorization_attestation_missing'));
      const recovery = await authorize(
        h,
        await requestAuthorization(h, admin, {
          bookingId: id,
          purpose: 'recovery',
          expectedCustodyIds: forfeited,
          attested: true,
        }),
      );
      await app('recover_future_capacity', asAdmin(), (c, op) => recover(c, op, id, recovery, forfeited));
      expect(await lifecycleFacts(h, id)).toMatchObject({ forfeited: 0, restores: 0 });
    });

    it('[REQ-084][EC-16][TECH-026] invalidação Co-Owner: correct_use_right só nas noites não iniciadas, com correção e volta à SPE', async () => {
      const b = co2.titulares[0]!;
      const id = await historicBooking(h, { homeId: co2.homeId, titular: b, checkin: s2(-1), checkout: s2(2) });
      const before = await lifecycleFacts(h, id);
      const exceptionId = await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'unauthorized_booking'));
      const nights = await unstartedNights(h.database.pool, id);
      expect(nights).toEqual([s2(1)]);
      await expect(
        app('correct_use_right', asAdmin(), (c, op) => closeBooking(c, op, id, { kind: 'invalidation' })),
      ).rejects.toEqual(constraint('permission_authorization_missing'));
      const authorization = await authorize(
        h,
        await requestAuthorization(h, admin, { bookingId: id, purpose: 'invalidation', exceptionId, expectedDates: nights }),
      );
      // Co-Owner nunca por resolve_exception (a invalidação reverte o consumo na mesma operação).
      await expect(
        app('resolve_exception', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization }),
        ),
      ).rejects.toEqual(constraint('permission_authorization_scope'));
      // Sem a correção (ou com restore no lugar), o efeito é incompleto ou fora da regra.
      await expect(
        app('correct_use_right', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization, reversal: 'none' }),
        ),
      ).rejects.toEqual(constraint('booking_closure_use_right'));
      await expect(
        app('correct_use_right', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization, reversal: 'restore' }),
        ),
      ).rejects.toEqual(constraint('booking_restore_binding'));
      await app('correct_use_right', asAdmin(), (c, op) =>
        closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'cancelled',
        cancellation_class: null,
        active_occupancies: 2,
        released: 1,
        reserved: 2,
        forfeited: 0,
        corrections: 1,
        restores: 0,
        consumed: before.consumed - 1,
      });
      const correction = await h.database.pool.query<{ quantity: number; target: string; stay_date: string | null }>(
        `SELECT l.quantity, t.movement AS target, l.stay_date FROM app.use_right_ledger l
           JOIN app.use_right_ledger t ON t.id = l.refers_to_id
          WHERE l.movement = 'correction' AND t.operation_id = (SELECT opened_by_operation FROM app.booking WHERE id = $1)`,
        [id],
      );
      expect(correction.rows).toEqual([{ quantity: 1, target: 'consume', stay_date: null }]);
      const resolution = await h.database.pool.query(
        `SELECT outcome, resolution_source FROM app.booking_exception_resolution WHERE booking_id = $1`,
        [id],
      );
      expect(resolution.rows).toEqual([{ outcome: 'cancelled', resolution_source: 'admin' }]);
    });

    it('[REQ-084][REQ-081] invalidação Owner por resolve_exception: libera as não iniciadas; custódia continua do Owner', async () => {
      const t = owner.titular;
      const id = await bookNow(h, t, owner.homeId, at(5), at(7));
      const exceptionId = await app('open_exception', asAdmin(), (c, op) => openException(c, op, id, 'unauthorized_booking'));
      const nights = await unstartedNights(h.database.pool, id);
      await expect(
        app('resolve_exception', asAdmin(), (c, op) => closeBooking(c, op, id, { kind: 'invalidation' })),
      ).rejects.toEqual(constraint('permission_authorization_missing'));
      const authorization = await authorize(
        h,
        await requestAuthorization(h, admin, { bookingId: id, purpose: 'invalidation', exceptionId, expectedDates: nights }),
      );
      const validity = await h.database.pool.query<{ ok: boolean }>(
        `SELECT a.valid_until = i.last_checkin_at AS ok
           FROM app.booking_authorization a, app.booking_period_instants($2) AS i WHERE a.id = $1`,
        [authorization, id],
      );
      expect(validity.rows[0]!.ok).toBe(true);
      await expect(
        app('correct_use_right', asAdmin(), (c, op) =>
          closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization }),
        ),
      ).rejects.toEqual(constraint('permission_authorization_scope'));
      await app('resolve_exception', asAdmin(), (c, op) =>
        closeBooking(c, op, id, { kind: 'invalidation', authorizationId: authorization }),
      );
      expect(await lifecycleFacts(h, id)).toMatchObject({ state: 'cancelled', released: 2, restores: 0, corrections: 0 });
      const reason = await h.database.pool.query(
        `SELECT DISTINCT o.release_reason AS reason, c.holder_kind FROM app.date_occupancy o
           JOIN app.date_custody c ON c.second_home_id = o.second_home_id AND c.stay_date = o.stay_date AND c.closed_at IS NULL
          WHERE o.booking_id = $1`,
        [id],
      );
      expect(reason.rows).toEqual([{ reason: 'invalidation', holder_kind: 'owner' }]);
    });
  });

  describe('prontidão para a ativação futura (ADR-0027 §10, D10)', () => {
    it('[D10] banco recém-migrado pronto; chave presente ou gatilho desligado falham; a aplicação não executa', async () => {
      const fresh = await createTestDatabase();
      try {
        await fresh.pool.query('SELECT app.assert_own_use_activation_ready()');
        await fresh.pool.query(`INSERT INTO app.capability_activation VALUES ('own_use_lifecycle', now(), 'test')`);
        await expect(fresh.pool.query('SELECT app.assert_own_use_activation_ready()')).rejects.toMatchObject({
          constraint: 'booking_activation_not_ready',
          message: expect.stringContaining('activation_present'),
        });
        await fresh.pool.query(`DELETE FROM app.capability_activation`);
        await fresh.pool.query('ALTER TABLE app.booking_state_transition DISABLE TRIGGER booking_state_apply');
        await expect(fresh.pool.query('SELECT app.assert_own_use_activation_ready()')).rejects.toMatchObject({
          message: expect.stringContaining('trigger:app.booking_state_transition.booking_state_apply'),
        });
        await fresh.pool.query('ALTER TABLE app.booking_state_transition ENABLE TRIGGER booking_state_apply');
        const app = new pg.Client({ connectionString: fresh.appUrl });
        await app.connect();
        try {
          await expect(app.query('SELECT app.assert_own_use_activation_ready()')).rejects.toMatchObject({ code: '42501' });
        } finally {
          await app.end();
        }
      } finally {
        await fresh.drop();
      }
    });
  });
});
