import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  addDays,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
} from '../features/booking/booking-support';
import {
  activate,
  addAdmin,
  bookNow,
  cancellationTerms,
  closeBooking,
  historicBooking,
  lastStartedNight,
  type Admin,
} from '../features/booking/lifecycle-support';
import {
  asUser,
  freeNights,
  inOperation,
  insertNomination,
  insertRules,
  nominate,
  openHomeOperation,
  publishRules,
  sideEffects,
} from '../features/calendar/luxtory-selection-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });
const HOUR_MS = 3_600_000;
const iso = (at: number) => new Date(at).toISOString();

interface Version {
  readonly id: string;
  readonly effective_from: Date;
  readonly effective_to: Date | null;
  readonly effective_until: Date | null;
}

describe('W14 — parâmetros só por inserção (TECH-030) e declaração de convidados (REQ-092) no banco', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let admin: Admin;
  let other: CoOwnerScenario;

  async function versions(homeId: string): Promise<Version[]> {
    const { rows } = await h.database.pool.query<Version>(
      `SELECT id, effective_from, effective_to, effective_until FROM app.parameter_version
        WHERE key = 'guest_rules' AND second_home_id = $1 ORDER BY effective_from`,
      [homeId],
    );
    return rows;
  }

  async function inForce(homeId: string, at: string): Promise<string | null> {
    const { rows } = await h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.parameter_at('guest_rules', $1, $2::timestamptz)`,
      [homeId, at],
    );
    return rows[0]?.id ?? null;
  }

  /** Instante exato, em microssegundos, deslocado de um timestamptz do banco. */
  async function shift(at: Date | string, micros: number): Promise<string> {
    const { rows } = await h.database.pool.query<{ t: string }>(
      `SELECT to_char(($1::timestamptz + make_interval(secs => $2 * 0.000001)) AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t`,
      [at, micros],
    );
    return rows[0]!.t;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    other = await h.coOwnerScenario(2);
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  describe('set_parameter: autoridade, base, vigência e imutabilidade (REQ-095, D3)', () => {
    it('[REQ-095][TECH-030] publicação imediata: instante, autoridade e autor vêm do banco e da operação', async () => {
      const id = await publishRules(h.database.appUrl, admin, other.homeId);
      const { rows } = await h.database.pool.query(
        `SELECT authority, created_by, authorization_ref, effective_from = created_at AS immediate,
                created_at > now() - interval '1 minute' AS stamped, effective_to
           FROM app.parameter WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        authority: 'admin',
        created_by: admin.userId,
        authorization_ref: 'Ata Luxtory W14',
        immediate: true,
        stamped: true,
        effective_to: null,
      });
      expect(await inForce(other.homeId, new Date().toISOString())).toBe(id);
    });

    it('[REQ-095][TECH-051] sem autoridade, base, texto ou operação própria é recusado; Admin revogada também', async () => {
      const publish = (options: Parameters<typeof publishRules>[3], who: Admin = admin) =>
        publishRules(h.database.appUrl, who, co.homeId, options);
      await expect(publish({ author: co.titulares[0]!.userId })).rejects.toEqual(
        constraint('parameter_operation_provenance'),
      );
      await expect(publish({ authority: 'super_admin' })).rejects.toEqual(
        constraint('parameter_operation_provenance'),
      );
      await expect(publish({ value: '   ' })).rejects.toEqual(constraint('parameter_guest_rules_text'));
      await expect(
        inOperation(h.database.appUrl, 'set_parameter', { kind: 'admin', admin }, co.homeId, (c, op) =>
          c.query(
            `INSERT INTO app.parameter (id, key, second_home_id, value, authority, authorization_ref, created_at,
               created_by, operation_id)
             VALUES (gen_random_uuid(), 'guest_rules', $1, 'Regras', 'admin', ' ', now(), $2, $3)`,
            [co.homeId, admin.userId, op],
          ),
        ),
      ).rejects.toEqual(constraint('parameter_authorization_ref_check'));
      await expect(
        inOperation(h.database.appUrl, 'nominate_guest', { kind: 'admin', admin }, co.homeId, (c, op) =>
          insertRules(c, op, admin, co.homeId),
        ),
      ).rejects.toEqual(constraint('parameter_operation_provenance'));
      await expect(
        inOperation(h.database.appUrl, 'set_parameter', { kind: 'admin', admin }, other.homeId, (c, op) =>
          insertRules(c, op, admin, co.homeId),
        ),
      ).rejects.toEqual(constraint('parameter_operation_provenance'));
      await expect(
        inOperation(h.database.appUrl, 'set_parameter', { kind: 'titular', titular: co.titulares[0]! }, co.homeId, (c, op) =>
          insertRules(c, op, admin, co.homeId, { authority: 'titular', author: co.titulares[0]!.userId }),
        ),
      ).rejects.toEqual(constraint('permission_staff_role'));
      const revoked = await addAdmin(h);
      await h.database.pool.query(`SELECT app.revoke_staff_role($1, 'Teste W14')`, [revoked.roleId]);
      await expect(publish({}, revoked)).rejects.toEqual(constraint('permission_staff_role'));
      await expect(
        h.database.pool.query(
          `INSERT INTO app.parameter (id, key, second_home_id, value, effective_from, authority, authorization_ref,
             created_at, created_by, operation_id)
           SELECT gen_random_uuid(), 'membership_base', $1, '1', now(), 'admin', 'x', now(), $2, o.id
             FROM app.operation o LIMIT 1`,
          [co.homeId, admin.userId],
        ),
      ).rejects.toBeDefined();
      expect(await versions(co.homeId)).toEqual([]);
    });

    it('[REQ-095][D3] fronteiras: início só depois de todos; nunca antes de um término explícito; fim derivado', async () => {
      const t0 = Date.now() + HOUR_MS;
      const v1 = await publishRules(h.database.appUrl, admin, co.homeId, { from: iso(t0) });
      // Mesmo início ou início anterior ao último: recusado.
      for (const from of [iso(t0), iso(t0 - 1000)])
        await expect(publishRules(h.database.appUrl, admin, co.homeId, { from })).rejects.toEqual(
          constraint('conflict_parameter_overlap'),
        );
      // Retroativo: recusado.
      await expect(publishRules(h.database.appUrl, admin, co.homeId, { from: iso(Date.now() - 60_000) })).rejects.toEqual(
        constraint('conflict_parameter_retroactive'),
      );
      // Sucessora de versão sem `effective_to`: a v1 termina no início da v2 (fim derivado).
      const v2 = await publishRules(h.database.appUrl, admin, co.homeId, { from: iso(t0 + HOUR_MS) });
      // Término explícito da v3: nenhuma publicação o antecipa — nem por 1 µs; começar exatamente nele é aceito.
      const v3 = await publishRules(h.database.appUrl, admin, co.homeId, {
        from: iso(t0 + 2 * HOUR_MS),
        to: iso(t0 + 3 * HOUR_MS),
      });
      const end3 = iso(t0 + 3 * HOUR_MS);
      await expect(
        publishRules(h.database.appUrl, admin, co.homeId, { from: await shift(end3, -1) }),
      ).rejects.toEqual(constraint('conflict_parameter_overlap'));
      const v4 = await publishRules(h.database.appUrl, admin, co.homeId, { from: end3, to: iso(t0 + 4 * HOUR_MS) });
      // Lacuna depois de um término explícito: parâmetro ausente (nenhum padrão presumido).
      const v5 = await publishRules(h.database.appUrl, admin, co.homeId, { from: iso(t0 + 5 * HOUR_MS) });
      await expect(
        publishRules(h.database.appUrl, admin, co.homeId, { from: iso(t0 + 6 * HOUR_MS), to: iso(t0 + 6 * HOUR_MS) }),
      ).rejects.toEqual(constraint('conflict_parameter_period'));

      const all = await versions(co.homeId);
      expect(all.map((v) => v.id)).toEqual([v1, v2, v3, v4, v5]);
      expect(all.map((v) => v.effective_until && new Date(v.effective_until).toISOString())).toEqual([
        iso(t0 + HOUR_MS),
        iso(t0 + 2 * HOUR_MS),
        iso(t0 + 3 * HOUR_MS),
        iso(t0 + 4 * HOUR_MS),
        null,
      ]);
      // Intervalos efetivos disjuntos, inclusive os futuros.
      const { rows } = await h.database.pool.query<{ overlaps: number }>(
        `SELECT count(*)::int AS overlaps FROM app.parameter_version a JOIN app.parameter_version b
            ON a.key = b.key AND a.second_home_id = b.second_home_id AND a.id < b.id
           AND tstzrange(a.effective_from, a.effective_until) && tstzrange(b.effective_from, b.effective_until)
         WHERE a.second_home_id = $1`,
        [co.homeId],
      );
      expect(rows[0]!.overlaps).toBe(0);
      // Vigente em cada fronteira (intervalos semiabertos).
      expect(await inForce(co.homeId, await shift(iso(t0), -1))).toBeNull();
      expect(await inForce(co.homeId, iso(t0))).toBe(v1);
      expect(await inForce(co.homeId, await shift(iso(t0 + HOUR_MS), -1))).toBe(v1);
      expect(await inForce(co.homeId, iso(t0 + HOUR_MS))).toBe(v2);
      expect(await inForce(co.homeId, await shift(end3, -1))).toBe(v3);
      expect(await inForce(co.homeId, end3)).toBe(v4);
      expect(await inForce(co.homeId, iso(t0 + 4.5 * HOUR_MS))).toBeNull();
      expect(await inForce(co.homeId, iso(t0 + 5 * HOUR_MS))).toBe(v5);
      expect(rejectionForConstraint('conflict_parameter_overlap')).toBe('ERR_STATE_TRANSITION');
    });

    it('[TECH-052] histórico imutável: a aplicação não altera nem apaga; nem o dono, pelos gatilhos', async () => {
      const [version] = await versions(co.homeId);
      const app = await h.client(h.database.appUrl);
      try {
        for (const statement of [
          `UPDATE app.parameter SET value = 'x' WHERE id = '${version!.id}'`,
          `DELETE FROM app.parameter WHERE id = '${version!.id}'`,
          'TRUNCATE app.parameter CASCADE',
        ])
          await expect(app.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
      }
      for (const statement of [
        `UPDATE app.parameter SET effective_to = now() + interval '1 day' WHERE id = '${version!.id}'`,
        `DELETE FROM app.parameter WHERE id = '${version!.id}'`,
      ])
        await expect(h.database.pool.query(statement)).rejects.toBeDefined();
      expect((await versions(co.homeId))[0]).toEqual(version);
    });

    it('[REQ-095][D3] publicações concorrentes do mesmo escopo se serializam: a segunda vê a primeira', async () => {
      const scope = (await h.coOwnerScenario(2)).homeId;
      const first = await h.client(h.database.appUrl);
      try {
        await first.query('BEGIN');
        const op = await openHomeOperation(first, 'set_parameter', { kind: 'admin', admin }, scope);
        const v1 = await insertRules(first, op, admin, scope);
        const second = publishRules(h.database.appUrl, admin, scope);
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await first.query('COMMIT');
        const v2 = await second;
        const all = await versions(scope);
        expect(all.map((v) => v.id)).toEqual([v1, v2]);
        expect(new Date(all[0]!.effective_until!).getTime()).toBe(new Date(all[1]!.effective_from).getTime());
      } finally {
        await first.end();
      }
      // Mesmo início futuro concorrente: a segunda é recusada depois de a primeira confirmar.
      const from = iso(Date.now() + 10 * HOUR_MS);
      const third = await h.client(h.database.appUrl);
      try {
        await third.query('BEGIN');
        const op = await openHomeOperation(third, 'set_parameter', { kind: 'admin', admin }, scope);
        await insertRules(third, op, admin, scope, { from });
        const fourth = publishRules(h.database.appUrl, admin, scope, { from }).then(
          () => 'committed',
          (error: unknown) => error,
        );
        await waitForLockWaiter(h.database.pool);
        await third.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await third.query('COMMIT');
        expect(await fourth).toEqual(constraint('conflict_parameter_overlap'));
      } finally {
        await third.end();
      }
    });

    it('[ADR-0026 §5] o Titular lê as regras da própria Second Home, sem base, autoridade nem autor', async () => {
      const titular = co.titulares[0]!;
      const own = await asUser<{ id: string }>(
        h.database.appUrl,
        titular.userId,
        `SELECT id, key, value, effective_from, effective_to FROM app.parameter`,
      );
      expect(own.length).toBe((await versions(co.homeId)).length);
      const foreign = await asUser(
        h.database.appUrl,
        titular.userId,
        `SELECT id FROM app.parameter WHERE second_home_id = $1`,
        [other.homeId],
      );
      expect(foreign).toEqual([]);
      for (const column of ['authorization_ref', 'created_by', 'authority', 'operation_id'])
        await expect(
          asUser(h.database.appUrl, titular.userId, `SELECT ${column} FROM app.parameter LIMIT 1`),
        ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('nominate_guest: declaração vinculada à reserva e à versão aceita (REQ-092, D4)', () => {
    let home: CoOwnerScenario;
    let booking: string;

    beforeAll(async () => {
      await activate(h, 'own_use_booking', 'own_use_lifecycle');
      home = await h.coOwnerScenario(2);
      const [night] = await freeNights(h.database.pool, home.homeId, home.year, 'media', 1);
      booking = await bookNow(h, home.titulares[0]!, home.homeId, night!, addDays(night!, 1));
    });

    it('[REQ-092][TECH-001] sem `guest_rules` vigente, a declaração é recusada (parâmetro ausente)', async () => {
      const empty = await h.coOwnerScenario(2);
      const [night] = await freeNights(h.database.pool, empty.homeId, empty.year, 'media', 1);
      const own = await bookNow(h, empty.titulares[0]!, empty.homeId, night!, addDays(night!, 1));
      // Regras de outra Second Home não servem (FK composta pela Second Home).
      const { rows } = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.parameter WHERE second_home_id = $1`,
        [other.homeId],
      );
      await expect(nominate(h.database.appUrl, empty.titulares[0]!, empty.homeId, own, rows[0]!.id)).rejects.toEqual(
        constraint('parameter_missing_guest_rules'),
      );
      // Versão só agendada ainda não vigora: nenhum padrão é presumido.
      const schedule = await publishRules(h.database.appUrl, admin, empty.homeId, {
        from: iso(Date.now() + 24 * HOUR_MS),
      });
      await expect(nominate(h.database.appUrl, empty.titulares[0]!, empty.homeId, own, schedule)).rejects.toEqual(
        constraint('parameter_missing_guest_rules'),
      );
    });

    it('[REQ-092][BR-330][BR-331][BR-332] declara sob a versão vigente; nada além da declaração muda', async () => {
      const home2 = await h.coOwnerScenario(2);
      const [night] = await freeNights(h.database.pool, home2.homeId, home2.year, 'media', 1);
      const own = await bookNow(h, home2.titulares[0]!, home2.homeId, night!, addDays(night!, 1));
      const v1 = await publishRules(h.database.appUrl, admin, home2.homeId);
      const before = await sideEffects(h.database.pool, home2.homeId);
      const id = await nominate(h.database.appUrl, home2.titulares[0]!, home2.homeId, own, v1);
      expect(await sideEffects(h.database.pool, home2.homeId)).toEqual(before);
      const { rows } = await h.database.pool.query(
        `SELECT party_id, parameter_id, nominated_at > now() - interval '1 minute' AS stamped
           FROM app.guest_nomination WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ party_id: home2.titulares[0]!.partyId, parameter_id: v1, stamped: true });
      // A mesma versão de novo: nada novo a declarar.
      await expect(nominate(h.database.appUrl, home2.titulares[0]!, home2.homeId, own, v1)).rejects.toEqual(
        constraint('conflict_guest_nomination_version'),
      );
      // As regras mudam: a versão antiga é recusada sem efeito; a vigente gera nova declaração (sem quantidade).
      const v2 = await publishRules(h.database.appUrl, admin, home2.homeId);
      await expect(nominate(h.database.appUrl, home2.titulares[0]!, home2.homeId, own, v1)).rejects.toEqual(
        constraint('guest_rules_changed'),
      );
      await nominate(h.database.appUrl, home2.titulares[0]!, home2.homeId, own, v2);
      const declared = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.guest_nomination WHERE booking_id = $1`,
        [own],
      );
      expect(declared.rows[0]!.n).toBe(2);
      // Leitura do Titular: as próprias declarações, sem party nem operação; o outro Co-Owner não as vê.
      const mine = await asUser(
        h.database.appUrl,
        home2.titulares[0]!.userId,
        `SELECT id, booking_id, parameter_id, nominated_at FROM app.guest_nomination WHERE booking_id = $1`,
        [own],
      );
      expect(mine).toHaveLength(2);
      const theirs = await asUser(
        h.database.appUrl,
        home2.titulares[1]!.userId,
        `SELECT id FROM app.guest_nomination WHERE booking_id = $1`,
        [own],
      );
      expect(theirs).toEqual([]);
      await expect(
        asUser(h.database.appUrl, home2.titulares[0]!.userId, `SELECT party_id FROM app.guest_nomination LIMIT 1`),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('[REQ-092][TECH-050] só o Titular da reserva, pela própria operação, declara', async () => {
      const rules = await publishRules(h.database.appUrl, admin, home.homeId);
      await expect(nominate(h.database.appUrl, home.titulares[1]!, home.homeId, booking, rules)).rejects.toEqual(
        constraint('permission_representation'),
      );
      await expect(
        inOperation(h.database.appUrl, 'create_own_use_booking', { kind: 'titular', titular: home.titulares[0]! }, home.homeId, (c, op) =>
          insertNomination(c, op, home.titulares[0]!, home.homeId, booking, rules),
        ),
      ).rejects.toEqual(constraint('guest_nomination_provenance'));
      await expect(
        inOperation(h.database.appUrl, 'nominate_guest', { kind: 'titular', titular: home.titulares[0]! }, home.homeId, (c, op) =>
          insertNomination(c, op, home.titulares[1]!, home.homeId, booking, rules),
        ),
      ).rejects.toEqual(constraint('guest_nomination_provenance'));
      await expect(
        inOperation(h.database.appUrl, 'nominate_guest', { kind: 'admin', admin }, home.homeId, (c, op) =>
          insertNomination(c, op, home.titulares[0]!, home.homeId, booking, rules),
        ),
      ).rejects.toEqual(constraint('guest_nomination_provenance'));
      await nominate(h.database.appUrl, home.titulares[0]!, home.homeId, booking, rules);
    });

    it('[REQ-092][TECH-055] reserva encerrada ou depois do check-out não recebe declaração', async () => {
      const home3 = await h.coOwnerScenario(2);
      const rules = await publishRules(h.database.appUrl, admin, home3.homeId);
      const last = await lastStartedNight(h, home3.homeId);
      const past = await historicBooking(h, {
        homeId: home3.homeId,
        titular: home3.titulares[0]!,
        checkin: addDays(last, -10),
        checkout: addDays(last, -8),
      });
      await expect(nominate(h.database.appUrl, home3.titulares[0]!, home3.homeId, past, rules)).rejects.toEqual(
        constraint('conflict_guest_nomination_booking'),
      );
      const [night] = await freeNights(h.database.pool, home3.homeId, home3.year, 'media', 1);
      const live = await bookNow(h, home3.titulares[0]!, home3.homeId, night!, addDays(night!, 1));
      await inOperation(h.database.appUrl, 'cancel_own_use_booking', { kind: 'titular', titular: home3.titulares[0]! }, home3.homeId, async (c, op) =>
        closeBooking(c, op, live, { kind: 'cancellation', expected: await cancellationTerms(c, live) }),
      );
      await expect(nominate(h.database.appUrl, home3.titulares[0]!, home3.homeId, live, rules)).rejects.toEqual(
        constraint('conflict_guest_nomination_booking'),
      );
      expect(rejectionForConstraint('conflict_guest_nomination_booking')).toBe('ERR_STATE_TRANSITION');
    });

    it('[REQ-092] declaração × cancelamento: a trava da reserva serializa; cancelada primeiro, a declaração é recusada', async () => {
      const home4 = await h.coOwnerScenario(2);
      const rules = await publishRules(h.database.appUrl, admin, home4.homeId);
      const [night] = await freeNights(h.database.pool, home4.homeId, home4.year, 'media', 1);
      const live = await bookNow(h, home4.titulares[0]!, home4.homeId, night!, addDays(night!, 1));
      const canceller = await h.client(h.database.appUrl);
      try {
        await canceller.query('BEGIN');
        const op = await openHomeOperation(canceller, 'cancel_own_use_booking', { kind: 'titular', titular: home4.titulares[0]! }, home4.homeId);
        await closeBooking(canceller, op, live, { kind: 'cancellation', expected: await cancellationTerms(canceller, live) });
        const declaration = nominate(h.database.appUrl, home4.titulares[0]!, home4.homeId, live, rules).then(
          () => 'committed',
          (error: unknown) => error,
        );
        await waitForLockWaiter(h.database.pool);
        await canceller.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await canceller.query('COMMIT');
        expect(await declaration).toEqual(constraint('conflict_guest_nomination_booking'));
      } finally {
        await canceller.end();
      }
    });

    it('[REQ-092][D3] declaração × nova versão: nenhuma versão nova começa antes de uma declaração já gravada', async () => {
      const home5 = await h.coOwnerScenario(2);
      const v1 = await publishRules(h.database.appUrl, admin, home5.homeId);
      const [night] = await freeNights(h.database.pool, home5.homeId, home5.year, 'media', 1);
      const live = await bookNow(h, home5.titulares[0]!, home5.homeId, night!, addDays(night!, 1));
      const declarer = await h.client(h.database.appUrl);
      let v2: string;
      try {
        await declarer.query('BEGIN');
        const op = await openHomeOperation(declarer, 'nominate_guest', { kind: 'titular', titular: home5.titulares[0]! }, home5.homeId);
        await insertNomination(declarer, op, home5.titulares[0]!, home5.homeId, live, v1);
        const publication = publishRules(h.database.appUrl, admin, home5.homeId);
        await waitForLockWaiter(h.database.pool);
        await declarer.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await declarer.query('COMMIT');
        v2 = await publication;
      } finally {
        await declarer.end();
      }
      const { rows } = await h.database.pool.query<{ ordered: boolean }>(
        `SELECT p.effective_from > n.nominated_at AS ordered
           FROM app.guest_nomination n, app.parameter p WHERE n.booking_id = $1 AND p.id = $2`,
        [live, v2],
      );
      expect(rows[0]!.ordered).toBe(true);
    });

    it('[TECH-052][TECH-110] rollback com histórico é recusado: parâmetros e declarações nunca são descartados', async () => {
      const count = async () =>
        (
          await h.database.pool.query<{ parameters: number; nominations: number }>(
            `SELECT (SELECT count(*)::int FROM app.parameter) AS parameters,
                    (SELECT count(*)::int FROM app.guest_nomination) AS nominations`,
          )
        ).rows[0]!;
      const before = await count();
      expect(before.parameters).toBeGreaterThan(0);
      expect(before.nominations).toBeGreaterThan(0);
      for (const [migration, message] of [
        ['20261119061704_booking_guest_nomination', /discard guest nominations/],
        ['20261119061701_admin_parameter', /discard the parameter history/],
      ] as const) {
        const down = (await readFile(`migrations/${migration}.sql`, 'utf8')).split('-- migrate:down')[1]!;
        const client = await h.client(h.database.url);
        try {
          await client.query('BEGIN');
          await expect(client.query(down)).rejects.toThrow(message);
        } finally {
          await client.query('ROLLBACK');
          await client.end();
        }
      }
      expect(await count()).toEqual(before);
    });
  });
});

void pg;
