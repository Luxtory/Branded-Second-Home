import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import { ownerParty } from '../support/party-fixtures';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  addDays,
  bookingHarness,
  revokeDelegation,
  secondRepresentative,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from '../features/booking/booking-support';
import {
  addAdmin,
  asOperation,
  bookingRow,
  bookNow,
  connect,
  openOperation,
  type Admin,
} from '../features/booking/lifecycle-support';
import { asUser, freeNights } from '../features/calendar/luxtory-selection-support';
import { drawnPositions } from '../features/calendar/use-right-support';
import {
  activateMembership,
  changeMembership,
  inForgedOperation,
  insertMembership,
  membershipOf,
  rightsFingerprint,
  transitionsOf,
  updateMembership,
} from '../features/identity/membership-support';

const constraint = (name: string) => expect.objectContaining({ constraint: name });
const denied = expect.objectContaining({ code: '42501' });
const MIGRATION = 'migrations/20261119234739_identity_membership.sql';

describe('W15 — Membership no banco (REQ-011, REQ-050, PD-001; TECH-050, TECH-052, TECH-053, TECH-055)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;

  const app = () => h.database.appUrl;
  const party = (index: number) => co.titulares[index]!.partyId;

  beforeAll(async () => {
    h = await bookingHarness();
    co = await h.coOwnerScenario(2);
    owner = await h.ownerScenario();
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  describe('ciclo de vida da TECH-055 e procedência (PD-001, REQ-095)', () => {
    it('[PD-001][TECH-055] todas as transições, cada uma pelo seu command, com histórico linear escrito pelo banco', async () => {
      const subject = owner.titular.partyId;
      await activateMembership(app(), admin, subject);
      for (const state of ['suspended', 'active', 'ended', 'active', 'suspended', 'ended'] as const)
        expect(await changeMembership(app(), admin, subject, state)).toBe(1);

      const history = await transitionsOf(h.database.pool, subject);
      expect(history.map((row) => [row.command, row.from_state, row.to_state])).toEqual([
        ['activate_membership', null, 'active'],
        ['suspend_membership', 'active', 'suspended'],
        ['reactivate_membership', 'suspended', 'active'],
        ['end_membership', 'active', 'ended'],
        ['reactivate_membership', 'ended', 'active'],
        ['suspend_membership', 'active', 'suspended'],
        ['end_membership', 'suspended', 'ended'],
      ]);
      // Autor e autoridade vêm da operação; instante, do relógio do banco, estritamente crescente.
      expect(new Set(history.map((row) => `${row.recorded_by}|${row.authority}`))).toEqual(
        new Set([`${admin.userId}|admin`]),
      );
      for (let i = 1; i < history.length; i += 1)
        expect(history[i]!.recorded_at.getTime()).toBeGreaterThanOrEqual(history[i - 1]!.recorded_at.getTime());
      const current = await membershipOf(h.database.pool, subject);
      expect(current).toMatchObject({
        state: 'ended',
        operation_id: history.at(-1)!.operation_id,
        created_operation_id: history[0]!.operation_id,
        changed_by: admin.userId,
        authority: 'admin',
      });
      expect(current!.changed_at).toEqual(history.at(-1)!.recorded_at);
    });

    it('[PD-001] segundo Membership para a mesma party (o mesmo CPF/CNPJ) é recusado', async () => {
      const subject = party(0);
      await activateMembership(app(), admin, subject);
      await expect(activateMembership(app(), admin, subject)).rejects.toEqual(constraint('conflict_membership_party'));
      expect(rejectionForConstraint('conflict_membership_party')).toBe('ERR_STATE_TRANSITION');
      expect(await transitionsOf(h.database.pool, subject)).toHaveLength(1);
    });

    it('[PD-001][TECH-053] duas ativações concorrentes da mesma party: exatamente uma', async () => {
      const subject = await titularParty();
      const first = await connect(app());
      const second = await connect(app());
      try {
        await first.query('BEGIN');
        await second.query('BEGIN');
        const op1 = await openOperation(first, 'activate_membership', { kind: 'admin', admin });
        const op2 = await openOperation(second, 'activate_membership', { kind: 'admin', admin });
        await insertMembership(first, op1, subject);
        const racing = insertMembership(second, op2, subject).then(
          () => 'inserted',
          (error: unknown) => error,
        );
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op1]);
        await first.query('COMMIT');
        expect(await racing).toEqual(constraint('conflict_membership_party'));
        await second.query('ROLLBACK');
      } finally {
        await Promise.all([first.end(), second.end()]);
      }
      expect(await transitionsOf(h.database.pool, subject)).toHaveLength(1);
    });

    it('[TECH-055] transição fora da TECH-055 é recusada pelo banco → ERR_STATE_TRANSITION', async () => {
      const subject = await titularParty();
      await expect(
        asOperation(app(), 'activate_membership', { kind: 'admin', admin }, (c, op) =>
          insertMembership(c, op, subject, { state: 'suspended' }),
        ),
      ).rejects.toEqual(constraint('conflict_membership_transition'));
      await activateMembership(app(), admin, subject);
      // active → active, e o command certo para um par inexistente na TECH-055.
      await expect(changeMembership(app(), admin, subject, 'active')).rejects.toEqual(
        constraint('conflict_membership_transition'),
      );
      await changeMembership(app(), admin, subject, 'suspended');
      await expect(changeMembership(app(), admin, subject, 'suspended')).rejects.toEqual(
        constraint('conflict_membership_transition'),
      );
      await changeMembership(app(), admin, subject, 'ended');
      await expect(changeMembership(app(), admin, subject, 'suspended')).rejects.toEqual(
        constraint('conflict_membership_transition'),
      );
      await expect(changeMembership(app(), admin, subject, 'ended')).rejects.toEqual(
        constraint('conflict_membership_transition'),
      );
      expect(rejectionForConstraint('conflict_membership_transition')).toBe('ERR_STATE_TRANSITION');
      expect((await membershipOf(h.database.pool, subject))!.state).toBe('ended');
      // A constraint do histórico também recusa uma raiz que não seja `active` (garantia estática, gravada pelo dono).
      const op = randomUUID();
      await h.database.pool.query(
        `INSERT INTO app.operation (id, command, role, idempotency_key, correlation_id, authorization_ref, state,
           created_at, updated_at)
         VALUES ($1, 'test_fixture', 'system', $2, $3, 'test:fixture', 'committed', now(), now())`,
        [op, `w15:${op}`, randomUUID()],
      );
      const membership = (await membershipOf(h.database.pool, subject))!;
      await expect(
        h.database.pool.query(
          `INSERT INTO app.membership_transition (operation_id, membership_id, party_id, from_state, to_state, basis,
             recorded_at, recorded_by, authority)
           VALUES ($1, $2, $3, NULL, 'suspended', 'x', now(), $4, 'admin')`,
          [op, membership.id, subject, admin.userId],
        ),
      ).rejects.toEqual(constraint('conflict_membership_transition_pair'));
    });

    it('[TECH-002][TECH-051] procedência: operação da transação, do command da transição, sem Second Home, e Admin ativo', async () => {
      const subject = await titularParty();
      // Operação de outro command (inclusive a de outra transição de Membership).
      for (const command of ['set_parameter', 'suspend_membership'])
        await expect(
          asOperation(app(), command, { kind: 'admin', admin }, (c, op) => insertMembership(c, op, subject)),
        ).rejects.toEqual(constraint('membership_operation_provenance'));
      // Operação já confirmada (de outra transação) ou inexistente.
      const committed = await asOperation(app(), 'activate_membership', { kind: 'admin', admin }, async (_c, op) => op);
      const outside = await connect(app());
      try {
        await expect(insertMembership(outside, committed, subject)).rejects.toEqual(
          constraint('inventory_operation_provenance'),
        );
        await expect(insertMembership(outside, randomUUID(), subject)).rejects.toEqual(
          constraint('inventory_operation_provenance'),
        );
      } finally {
        await outside.end();
      }
      // Operação Admin presa a uma Second Home ou a uma party representada.
      const adminFields = {
        command: 'activate_membership',
        role: 'admin',
        actorUserId: admin.userId,
        authorizationRef: `staff_role:${admin.roleId}`,
      };
      for (const extra of [{ secondHomeId: co.homeId }, { actingPartyId: subject }])
        await expect(
          inForgedOperation(app(), { ...adminFields, ...extra }, (c, op) => insertMembership(c, op, subject)),
        ).rejects.toEqual(constraint('membership_operation_provenance'));
      // Papel do Titular, ou referência a uma atribuição Admin de outro usuário: revalidadas no banco.
      const titular = co.titulares[0]!;
      for (const forged of [
        { ...adminFields, role: 'titular', actorUserId: titular.userId, authorizationRef: `holding:${titular.holdingId}` },
        { ...adminFields, actorUserId: titular.userId },
      ])
        await expect(
          inForgedOperation(app(), forged, (c, op) => insertMembership(c, op, subject)),
        ).rejects.toEqual(constraint('permission_staff_role'));
      const revoked = await addAdmin(h);
      await h.database.pool.query(`SELECT app.revoke_staff_role($1, 'Fim da atribuição de teste')`, [
        revoked.roleId,
      ]);
      await expect(activateMembership(app(), revoked, subject)).rejects.toEqual(constraint('permission_staff_role'));
      // A mesma operação não serve a duas mudanças.
      await activateMembership(app(), admin, subject);
      await expect(
        asOperation(app(), 'suspend_membership', { kind: 'admin', admin }, async (c, op) => {
          await updateMembership(c, op, subject, 'suspended');
          return updateMembership(c, op, subject, 'ended');
        }),
      ).rejects.toEqual(constraint('membership_operation_provenance'));
      expect(rejectionForConstraint('membership_operation_provenance')).toBeNull();
      expect((await transitionsOf(h.database.pool, subject)).map((row) => row.to_state)).toEqual(['active']);
    });

    it('[TECH-052] o papel da aplicação não grava autor, instante, origem nem histórico, e nada apaga', async () => {
      const subject = await titularParty();
      const id = randomUUID();
      await expect(
        asOperation(app(), 'activate_membership', { kind: 'admin', admin }, (c, op) =>
          c.query(
            `INSERT INTO app.membership (id, party_id, state, basis, operation_id, changed_by)
             VALUES ($1, $2, 'active', 'base', $3, $4)`,
            [id, subject, op, randomUUID()],
          ),
        ),
      ).rejects.toEqual(denied);
      await activateMembership(app(), admin, subject);
      const client = await connect(app());
      try {
        for (const sql of [
          `UPDATE app.membership SET party_id = party_id WHERE party_id = $1`,
          `UPDATE app.membership SET changed_at = now() WHERE party_id = $1`,
          `UPDATE app.membership SET created_operation_id = operation_id WHERE party_id = $1`,
          `DELETE FROM app.membership WHERE party_id = $1`,
          `UPDATE app.membership_transition SET basis = 'x' WHERE party_id = $1`,
          `DELETE FROM app.membership_transition WHERE party_id = $1`,
          `INSERT INTO app.membership_transition (operation_id, membership_id, party_id, to_state, basis, recorded_at,
             recorded_by, authority)
           SELECT operation_id, id, party_id, 'active', basis, now(), changed_by, authority
             FROM app.membership WHERE party_id = $1`,
        ])
          await expect(client.query(sql, [subject])).rejects.toEqual(denied);
        await expect(client.query('TRUNCATE app.membership_transition')).rejects.toEqual(denied);
      } finally {
        await client.end();
      }
      // Nem o dono do schema reescreve ou apaga Membership e histórico (gatilhos).
      await expect(h.database.pool.query('DELETE FROM app.membership WHERE party_id = $1', [subject])).rejects.toThrow();
      await expect(
        h.database.pool.query(`UPDATE app.membership_transition SET basis = 'x' WHERE party_id = $1`, [subject]),
      ).rejects.toThrow();
      expect(await transitionsOf(h.database.pool, subject)).toHaveLength(1);
    });

    it('[TECH-052][T-1502] gatilhos: só o gravador do histórico é SECURITY DEFINER, do dono do schema, search_path fixo, sem EXECUTE para ninguém', async () => {
      const { rows } = await h.database.pool.query<{
        name: string;
        definer: boolean;
        config: string[];
        owner_is_schema_owner: boolean;
        grantees: string[] | null;
        app_can_execute: boolean;
      }>(
        `SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config,
                p.proowner = n.nspowner AS owner_is_schema_owner,
                (SELECT array_agg(coalesce(g.rolname, 'PUBLIC') || ':' || a.privilege_type)
                   FROM aclexplode(p.proacl) a LEFT JOIN pg_roles g ON g.oid = a.grantee
                  WHERE a.grantee <> p.proowner) AS grantees,
                has_function_privilege('luxtory_app', p.oid, 'EXECUTE') AS app_can_execute
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname IN ('membership_write', 'membership_record_transition')
          ORDER BY p.proname`,
      );
      const common = {
        config: ['search_path=pg_catalog, pg_temp'],
        owner_is_schema_owner: true,
        grantees: null,
        app_can_execute: false,
      };
      expect(rows).toEqual([
        { name: 'membership_record_transition', definer: true, ...common },
        { name: 'membership_write', definer: false, ...common },
      ]);
    });
  });

  describe('D2 — só party Titular passa a `active`; Membership é da party, nunca da holding', () => {
    it('[PD-001] party sem holding vigente não ativa; Membership não é papel e não dá acesso a command do Titular', async () => {
      const outsider = await ownerParty(h.database.pool);
      await expect(activateMembership(app(), admin, outsider)).rejects.toEqual(
        constraint('conflict_membership_requires_titular'),
      );
      expect(rejectionForConstraint('conflict_membership_requires_titular')).toBe('ERR_STATE_TRANSITION');
      expect(await membershipOf(h.database.pool, outsider)).toBeNull();
      // `holding.role` continua só Owner ou Co-Owner.
      const { rows } = await h.database.pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'app.holding'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%role%'`,
      );
      expect(rows.map((row) => row.def).join(' ')).not.toMatch(/membership/i);
    });

    it('[PD-001][BR-320] perder a holding não encerra o Membership; reativar exige holding vigente', async () => {
      const subject = await titularParty();
      await activateMembership(app(), admin, subject);
      await endHoldings(subject);
      expect((await membershipOf(h.database.pool, subject))!.state).toBe('active');
      await changeMembership(app(), admin, subject, 'suspended');
      await expect(changeMembership(app(), admin, subject, 'active')).rejects.toEqual(
        constraint('conflict_membership_requires_titular'),
      );
      await changeMembership(app(), admin, subject, 'ended');
      await expect(changeMembership(app(), admin, subject, 'active')).rejects.toEqual(
        constraint('conflict_membership_requires_titular'),
      );
      expect((await membershipOf(h.database.pool, subject))!.state).toBe('ended');
    });
  });

  describe('verificação no instante da ação (REQ-011, TECH-050, TECH-053)', () => {
    /** A leitura que a verificação de elegibilidade da E3 fará: `FOR SHARE` por `party_id`, até o commit. */
    const readForShare = async (client: pg.Client, partyId: string) =>
      (
        await client.query<{ state: string }>(
          'SELECT state FROM app.membership WHERE party_id = ANY($1::uuid[]) ORDER BY party_id FOR SHARE',
          [[partyId]],
        )
      ).rows[0]?.state ?? null;

    it('[REQ-011] suspensão entre duas ações: a primeira vê `active`, a segunda vê `suspended`', async () => {
      const subject = await titularParty();
      await activateMembership(app(), admin, subject);
      const reader = await connect(app());
      try {
        await reader.query('BEGIN');
        expect(await readForShare(reader, subject)).toBe('active');
        await reader.query('COMMIT');
        await changeMembership(app(), admin, subject, 'suspended');
        await reader.query('BEGIN');
        expect(await readForShare(reader, subject)).toBe('suspended');
        await reader.query('COMMIT');
      } finally {
        await reader.end();
      }
    });

    it('[REQ-011][TECH-053] a ação em curso (FOR SHARE) segura a suspensão até o seu commit', async () => {
      const subject = await titularParty();
      await activateMembership(app(), admin, subject);
      const reader = await connect(app());
      try {
        await reader.query('BEGIN');
        expect(await readForShare(reader, subject)).toBe('active');
        let settled = false;
        const suspension = changeMembership(app(), admin, subject, 'suspended').finally(() => {
          settled = true;
        });
        await waitForLockWaiter(h.database.pool);
        expect(settled).toBe(false);
        await reader.query('COMMIT');
        expect(await suspension).toBe(1);
      } finally {
        await reader.end();
      }
      expect((await membershipOf(h.database.pool, subject))!.state).toBe('suspended');
    });

    it('[REQ-011][TECH-053] suspensão em curso: a ação espera e, depois do commit, vê `suspended`', async () => {
      const subject = await titularParty();
      await activateMembership(app(), admin, subject);
      const writer = await connect(app());
      const reader = await connect(app());
      try {
        await writer.query('BEGIN');
        const op = await openOperation(writer, 'suspend_membership', { kind: 'admin', admin });
        await updateMembership(writer, op, subject, 'suspended');
        await reader.query('BEGIN');
        const read = readForShare(reader, subject);
        await waitForLockWaiter(h.database.pool);
        await writer.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await writer.query('COMMIT');
        expect(await read).toBe('suspended');
        await reader.query('COMMIT');
      } finally {
        await Promise.all([writer.end(), reader.end()]);
      }
    });

    it('[TECH-055][TECH-053] duas suspensões concorrentes: uma aplica, a outra encontra `suspended` e é recusada', async () => {
      const subject = await titularParty();
      await activateMembership(app(), admin, subject);
      const first = await connect(app());
      try {
        await first.query('BEGIN');
        const op = await openOperation(first, 'suspend_membership', { kind: 'admin', admin });
        await updateMembership(first, op, subject, 'suspended');
        const racing = changeMembership(app(), admin, subject, 'suspended').then(
          () => 'applied',
          (error: unknown) => error,
        );
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await first.query('COMMIT');
        expect(await racing).toEqual(constraint('conflict_membership_transition'));
      } finally {
        await first.end();
      }
      expect((await transitionsOf(h.database.pool, subject)).map((row) => row.to_state)).toEqual([
        'active',
        'suspended',
      ]);
    });
  });

  describe('direitos e compromissos preservados (REQ-050, BR-147, BR-321, REQ-032)', () => {
    it('[REQ-050][BR-321][REQ-032] o ciclo completo não altera nada fora do Membership: reservas, rotação, direitos', async () => {
      await h.activate();
      const [night] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 1);
      const holder = co.titulares[1]!;
      const booking = await bookNow(h, holder, co.homeId, night!, addDays(night!, 1));
      const positions = await drawnPositions(h, co.acquisitionId);
      const before = await rightsFingerprint(h.database.pool);
      await activateMembership(app(), admin, holder.partyId);
      for (const state of ['suspended', 'active', 'ended', 'active', 'ended'] as const)
        await changeMembership(app(), admin, holder.partyId, state);
      expect(await rightsFingerprint(h.database.pool)).toEqual(before);
      expect(await drawnPositions(h, co.acquisitionId)).toEqual(positions);
      expect((await bookingRow(h.database.pool, booking)).state).toBe('confirmed');
    });

    it('[BR-147][REQ-034][TECH-051] uso próprio independe de Membership: suspenso, encerrado ou sem Membership reserva', async () => {
      await h.activate();
      const home = await h.coOwnerScenario(2);
      const [suspendedTitular, endedTitular] = home.titulares;
      await activateMembership(app(), admin, suspendedTitular!.partyId);
      await changeMembership(app(), admin, suspendedTitular!.partyId, 'suspended');
      await activateMembership(app(), admin, endedTitular!.partyId);
      await changeMembership(app(), admin, endedTitular!.partyId, 'ended');
      const nights = await freeNights(h.database.pool, home.homeId, home.year, 'media', 2);
      for (const [titular, night] of [
        [suspendedTitular!, nights[0]!],
        [endedTitular!, nights[1]!],
      ] as const) {
        const id = await bookNow(h, titular, home.homeId, night, addDays(night, 1));
        expect((await bookingRow(h.database.pool, id)).state).toBe('confirmed');
      }
      // Sem Membership nenhum (Owner de outra Second Home).
      const none = await h.ownerScenario();
      expect(await membershipOf(h.database.pool, none.titular.partyId)).toBeNull();
    });
  });

  describe('leitura do Titular (TECH-052)', () => {
    it('[TECH-052] só o estado das parties representadas por delegação vigente; sem base, autor, operação ou histórico', async () => {
      const home = await h.coOwnerScenario(2);
      const [titular, neighbour] = home.titulares;
      await activateMembership(app(), admin, titular!.partyId);
      const representative = await secondRepresentative(h, titular!);
      const visible = await asUser<{ party_id: string; state: string }>(
        app(),
        titular!.userId,
        'SELECT id, party_id, state, changed_at FROM app.membership',
      );
      expect(visible).toEqual([expect.objectContaining({ party_id: titular!.partyId, state: 'active' })]);
      expect(await asUser(app(), neighbour!.userId, 'SELECT id FROM app.membership')).toEqual([]);
      for (const sql of [
        'SELECT basis FROM app.membership',
        'SELECT changed_by FROM app.membership',
        'SELECT operation_id FROM app.membership',
        'SELECT * FROM app.membership_transition',
      ])
        await expect(asUser(app(), titular!.userId, sql)).rejects.toEqual(denied);
      // Revogada a delegação, o representante deixa de ver; o outro representante continua vendo.
      await revokeDelegation(h, representative.userId);
      expect(await asUser(app(), representative.userId, 'SELECT id FROM app.membership')).toEqual([]);
      expect(await asUser(app(), titular!.userId, 'SELECT id FROM app.membership')).toHaveLength(1);
    });
  });

  describe('rollback (TECH-110)', () => {
    it('[TECH-052][TECH-110] rollback com Membership é recusado: o histórico nunca é descartado', async () => {
      const count = async () =>
        (
          await h.database.pool.query<{ memberships: number; transitions: number }>(
            `SELECT (SELECT count(*)::int FROM app.membership) AS memberships,
                    (SELECT count(*)::int FROM app.membership_transition) AS transitions`,
          )
        ).rows[0]!;
      const before = await count();
      expect(before.memberships).toBeGreaterThan(0);
      const down = (await readFile(MIGRATION, 'utf8')).split('-- migrate:down')[1]!;
      const client = await connect(h.database.url);
      try {
        await client.query('BEGIN');
        await expect(client.query(down)).rejects.toThrow(/discard the Membership history/);
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
      expect(await count()).toEqual(before);
    });
  });

  /** Party Titular nova (Owner de uma Second Home própria), sem Membership. */
  async function titularParty(): Promise<string> {
    return (await h.ownerScenario()).titular.partyId;
  }

  /** Fim das holdings da party (fixture do dono, como a transferência simulada da W12). */
  async function endHoldings(partyId: string): Promise<void> {
    const client = await h.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        "UPDATE app.holding SET valid_until = now() - interval '1 second' WHERE party_id = $1 AND valid_until IS NULL",
        [partyId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
});
